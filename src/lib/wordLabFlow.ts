/**
 * Word Lab 会话流程辅助：S0 限流 / 起场 / 结算 / 生词入队 共用逻辑
 */

import type { PersistedData } from '../types'
import type { AppContextValue } from '../store/useAppStore'
import { firstShard } from '../data/wordDecks'
import { getNextWords } from '../services/wordCurator'
import { initProgress } from './wordScheduler'
import { todayKey } from './storage'
import { uid } from './utils'
import type { DeckId, WordEntry, WordDailyQuota, WordError, WordSessionDraft } from '../wordLabTypes'
import { MAX_DAILY_LIMIT } from '../wordLabTypes'

/** S0：今日剩余新词额度（跨天自动视为满额；负数按 0 处理） */
export function remainingQuota(quota: WordDailyQuota): number {
  if (quota.date !== todayKey()) return MAX_DAILY_LIMIT
  return Math.max(0, quota.limit - quota.newWordsLearned)
}

/** 每场新词数：单场最多 5 个，受剩余额度约束 */
export const SESSION_SIZE = 5

export function sessionSize(quota: WordDailyQuota): number {
  return Math.min(SESSION_SIZE, remainingQuota(quota))
}

/**
 * S0-S1：起一场新词会话。
 * 返回错误信息（未开始）或 null（已开始并跳转）。
 */
export async function startWordSession(
  app: Pick<AppContextValue, 'data' | 'update' | 'navigate' | 'notify'>,
  deckId: DeckId,
): Promise<void> {
  const remaining = remainingQuota(app.data.wordDailyQuota)
  if (remaining <= 0) {
    app.notify('今日新词额度已用完，明天再来；现在可以复习到期词')
    return
  }
  const size = Math.min(SESSION_SIZE, remaining)
  const words = await getNextWords(deckId, app.data.wordProgress, size)
  if (!words.length) {
    app.notify('这个词库的种子词都学过了，换个词库试试')
    return
  }
  const draft: WordSessionDraft = {
    deckId,
    startedAt: Date.now(),
    words: words.map((w) => w.word.toLowerCase()),
    index: 0,
    step: 'guess',
    records: [],
  }
  app.update((prev) => ({
    ...prev,
    deckSelection: { activeDeckId: deckId, pickedAt: Date.now() },
    wordSessionDraft: draft,
  }))
  app.navigate('wordSession')
}

/** S2 的 4 选 1 选项：1 个正确释义 + 3 个同库干扰项（确定性伪随机，便于测试） */
export function buildChoices(entry: WordEntry, deckId: DeckId): string[] {
  const pool = firstShard(deckId).filter((w) => w.word !== entry.word)
  const start = entry.word.length % Math.max(1, pool.length)
  const distractors: string[] = []
  for (let i = 0; i < pool.length && distractors.length < 3; i++) {
    const cand = pool[(start + i * 3) % pool.length]
    if (cand && cand.meaningZh !== entry.meaningZh && !distractors.includes(cand.meaningZh)) {
      distractors.push(cand.meaningZh)
    }
  }
  const all = [entry.meaningZh, ...distractors]
  // 确定性洗牌
  const shift = entry.word.length % all.length
  return [...all.slice(shift), ...all.slice(0, shift)]
}

/** S3 打字模式：逐字母比对。cells 里只放用户自己输入的字母，不回显答案 */
export interface SpellingCell { ch: string; ok: boolean }

export function compareSpelling(target: string, input: string): {
  correct: boolean
  cells: SpellingCell[]
} {
  const t = target.toLowerCase().trim()
  const i = input.toLowerCase().trim()
  const cells: SpellingCell[] = []
  const len = Math.max(t.length, i.length)
  for (let k = 0; k < len; k++) {
    cells.push({ ch: k < i.length ? i[k] : '·', ok: t[k] === i[k] })
  }
  return { correct: t === i, cells }
}

/**
 * 书写阶段遮蔽目标词：把提示文本里出现的该词（大小写不敏感，含常见屈折形式）替换成 ____。
 *
 * S3 与易错本重拼都要求用户「凭记忆写出来」，因此中文释义、英释、例句、搭配、
 * 图片 alt 等一切可能带词形的文本都要先过这一层，避免答案就摆在输入框旁边。
 */
export function maskTargetWord(text: string, word: string): string {
  const stem = word.toLowerCase().trim()
  if (!stem || !text) return text
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const forms = new Set<string>([stem, `${stem}s`, `${stem}es`, `${stem}ed`, `${stem}ing`, `${stem}d`])
  if (stem.endsWith('y')) forms.add(`${stem.slice(0, -1)}ies`)
  if (stem.endsWith('e')) {
    forms.add(`${stem.slice(0, -1)}ing`)
    forms.add(`${stem.slice(0, -1)}ed`)
  }
  const pattern = [...forms].sort((a, b) => b.length - a.length).map(escape).join('|')
  return text.replace(new RegExp(`\\b(?:${pattern})\\b`, 'gi'), '____')
}

/** S4 结算：写入进度 / 限流 / 易错本；返回 XP 增量 */
export function finishWordSession(
  prev: PersistedData,
  draft: WordSessionDraft,
  errorsToAdd: Array<{ word: string; type: 'guess' | 'spelling'; detail: string }>,
): { next: PersistedData; xp: number } {
  const now = Date.now()
  const today = todayKey()
  const entries = new Map<string, WordEntry>()
  for (const w of draft.words) {
    const hit = lookupInDeck(w, draft.deckId)
    if (hit) entries.set(w, hit)
  }

  const wordsMap = { ...prev.wordProgress.words }
  for (const w of draft.words) {
    const entry = entries.get(w)
    if (entry && !wordsMap[w]) wordsMap[w] = initProgress(entry, 'wordlab', now)
  }

  const quota = prev.wordDailyQuota.date === today
    ? prev.wordDailyQuota
    : { date: today, newWordsLearned: 0, limit: prev.wordDailyQuota.limit }
  const learnedCount = draft.words.filter((w) => wordsMap[w] && prev.wordProgress.words[w] == null).length

  const newErrors: WordError[] = errorsToAdd.map((e) => ({
    id: uid('werr'),
    word: e.word.toLowerCase(),
    deckId: draft.deckId,
    type: e.type,
    detail: e.detail.slice(0, 60),
    createdAt: now,
    resolveCount: 0,
    resolved: false,
  }))
  // 同词同类型的未解决错误只保留最新一条；不同类型（猜错/拼错）各自留档
  const mergedErrors = [...newErrors, ...prev.wordErrors]
    .filter((e, idx, arr) => e.resolved
      || arr.findIndex((x) => x.word === e.word && x.type === e.type && !x.resolved) === idx)

  const xp = draft.words.length * 10

  return {
    next: {
      ...prev,
      wordProgress: { ...prev.wordProgress, words: wordsMap, version: 1 },
      wordDailyQuota: {
        ...quota,
        newWordsLearned: quota.newWordsLearned + learnedCount,
      },
      wordErrors: mergedErrors,
      wordSessionDraft: null,
    },
    xp,
  }
}

function lookupInDeck(word: string, deckId: DeckId): WordEntry | undefined {
  return firstShard(deckId).find((w) => w.word.toLowerCase() === word)
}

/**
 * 阅读 / 观后生词一键加入词场队列：
 * 只入队（status new / dueAt now → 进入阶梯第 0 级等待首复），不计当日新词上限。
 */
export function enqueueWordFromContext(
  app: Pick<AppContextValue, 'data' | 'update' | 'notify'>,
  word: string,
  origin: 'reading' | 'video',
  meaningZh: string,
): void {
  const key = word.toLowerCase().trim()
  if (!key) return
  if (app.data.wordProgress.words[key]) {
    app.notify(`「${word}」已在词场队列中`)
    return
  }
  app.update((prev) => {
    // 轻量入队：不构造完整词条，直接初始化阶梯第 0 级
    const now = Date.now()
    return {
      ...prev,
      wordProgress: {
        ...prev.wordProgress,
        words: {
          ...prev.wordProgress.words,
          [key]: {
            word: key,
            deckId: prev.deckSelection.activeDeckId ?? 'senior_5000',
            origin,
            status: 'ladder',
            ladderStep: 0,
            sm2Level: -1,
            dueAt: now + 10 * 60 * 1000,
            firstLearnedAt: now,
            reviewCount: 0,
            errorCount: 0,
            correctStreak: 0,
          },
        },
      },
    }
  })
  app.notify(`已把「${word}」加入词场复习队列`)
}
