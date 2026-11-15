/**
 * Word Lab 统一调度器（增量扩展现有 SM-2，不新建第二套系统）
 *
 * 规则：
 * - 新词走艾宾浩斯学习阶梯 EBBINGHAUS_STEPS_MS = 10min → 1d → 3d → 7d → 15d → 30d
 * - 走完阶梯（ladderStep 达到 6）后「毕业」并入现有 SM-2 间隔序列（SRS_INTERVALS）
 * - 答错只回退一级、不清零；连续 2 次答错仍停留在第 0 级
 * - SM-2 阶段答对升级、答错降一级（沿用既有 promoteReviewItem 语义）
 * - 统一输出：到期词可映射为复习卡片（kind='word'，source='wordlab'），
 *   与 lingua_review_queue 在复习页合并展示，用 source 字段区分来源
 */

import { SRS_INTERVALS } from '../services/coach'
import type { ReviewItem } from '../types'
import { uid } from './utils'
import {
  EBBINGHAUS_STEPS_MS, SM2_ENTRY_LEVEL,
  type WordProgress, type WordProgressState, type WordEntry, type DeckId,
} from '../wordLabTypes'

const DAY = 24 * 60 * 60 * 1000

/** 新词首次学完（S4 结算）后进入阶梯第 0 级，10 分钟后首复 */
export function initProgress(entry: WordEntry, origin: WordProgress['origin'], now = Date.now()): WordProgress {
  return {
    word: entry.word.toLowerCase(),
    // makeWord 把 deckId 放在 tags[0]
    deckId: entry.tags[0] as DeckId,
    origin,
    status: 'ladder',
    ladderStep: 0,
    sm2Level: -1,
    dueAt: now + EBBINGHAUS_STEPS_MS[0],
    firstLearnedAt: now,
    reviewCount: 0,
    errorCount: 0,
    correctStreak: 0,
  }
}

/** 复习一次：correct=true 前进；correct=false 只回退一级（不清零、不低于 0） */
export function advanceProgress(p: WordProgress, correct: boolean, now = Date.now()): WordProgress {
  if (p.status === 'mastered') return p
  if (p.status === 'ladder') {
    if (correct) {
      const nextStep = p.ladderStep + 1
      if (nextStep >= EBBINGHAUS_STEPS_MS.length) {
        // 阶梯毕业 → 并入 SM-2
        return {
          ...p, status: 'sm2', sm2Level: SM2_ENTRY_LEVEL, ladderStep: EBBINGHAUS_STEPS_MS.length,
          dueAt: now + SRS_INTERVALS[SM2_ENTRY_LEVEL] * DAY,
          lastReviewedAt: now, reviewCount: p.reviewCount + 1, correctStreak: p.correctStreak + 1,
        }
      }
      return {
        ...p, ladderStep: nextStep, dueAt: now + EBBINGHAUS_STEPS_MS[nextStep],
        lastReviewedAt: now, reviewCount: p.reviewCount + 1, correctStreak: p.correctStreak + 1,
      }
    }
    return {
      ...p, ladderStep: Math.max(0, p.ladderStep - 1), dueAt: now + EBBINGHAUS_STEPS_MS[Math.max(0, p.ladderStep - 1)],
      lastReviewedAt: now, reviewCount: p.reviewCount + 1, errorCount: p.errorCount + 1, correctStreak: 0,
    }
  }
  // SM-2 阶段：与既有 promoteReviewItem 同语义，但降级不清零到 0，只降一级
  const nextLevel = correct
    ? Math.min(p.sm2Level + 1, SRS_INTERVALS.length - 1)
    : Math.max(1, p.sm2Level - 1)
  return {
    ...p, sm2Level: nextLevel, dueAt: now + SRS_INTERVALS[nextLevel] * DAY,
    lastReviewedAt: now, reviewCount: p.reviewCount + 1,
    errorCount: correct ? p.errorCount : p.errorCount + 1,
    correctStreak: correct ? p.correctStreak + 1 : 0,
    status: nextLevel >= SRS_INTERVALS.length - 1 ? 'mastered' : 'sm2',
  }
}

/** 到期词（含阶梯 10min 项与 SM-2 项） */
export function dueWords(state: WordProgressState, now = Date.now()): WordProgress[] {
  return Object.values(state.words)
    .filter((p) => p.status !== 'mastered' && p.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
}

/** 词场进度概览 */
export function wordLabStats(state: WordProgressState): {
  total: number; learning: number; ladder: number; sm2: number; mastered: number; due: number; errors: number
} {
  const all = Object.values(state.words)
  return {
    total: all.length,
    learning: all.filter((p) => p.status !== 'mastered').length,
    ladder: all.filter((p) => p.status === 'ladder').length,
    sm2: all.filter((p) => p.status === 'sm2').length,
    mastered: all.filter((p) => p.status === 'mastered').length,
    due: dueWords(state).length,
    errors: all.reduce((s, p) => s + p.errorCount, 0),
  }
}

/** 统一调度输出：把到期词映射为复习卡片，与 lingua_review_queue 在复习页合并 */
export function wordProgressToReviewItem(p: WordProgress, entry?: WordEntry): ReviewItem {
  return {
    id: `wlab-${p.word}`,
    kind: 'word',
    content: entry?.word ?? p.word,
    meaning: entry?.meaningZh ?? '词场学习词',
    example: entry?.examples[0] ?? `Review "${p.word}" in your own sentence.`,
    level: Math.max(0, p.sm2Level),
    dueAt: p.dueAt,
    createdAt: p.firstLearnedAt,
    lastReviewedAt: p.lastReviewedAt,
    source: 'wordlab',
  }
}

/** 生成去重用 id（稳定） */
export function wordErrorId(word: string): string {
  return uid(`werr-${word.toLowerCase()}`)
}
