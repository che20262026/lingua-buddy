/**
 * China Learner Track —— 内容层服务
 *
 * 只做三件事：
 * 1. 完成一个资源单元 → 写入既有 XP 统一入口（source='china_track'）与既有复习队列；
 * 2. 轨道 C 微场景 → 生成 Scenario / Session，交给既有 DialogueDirectorAgent，不新建 Agent；
 * 3. 省份配置 → 纯本地读写，不上传、不追踪。
 *
 * 不新建学习机制：五步闭环、SM-2、成长系统、对话流程全部原样复用。
 */

import type { AppContextValue } from '../store/useAppStore'
import type { ReviewItem, Scenario, Session } from '../types'
import type { ChinaTrackState, ProvinceId, TrackUnit } from '../chinaTrackTypes'
import { XP_RULES, type XpResult } from '../growthTypes'
import { todayKey } from '../lib/storage'
import { uid } from '../lib/utils'
import { resolveExamToggle, resolveProvinceChange } from '../data/chinaTrack/provinces'

type TrackApp = Pick<AppContextValue, 'data' | 'update' | 'awardXp' | 'notify' | 'navigate'>

const DAY = 24 * 60 * 60 * 1000

/** 完成单元后进入既有复习队列的卡片：只存结构级提示，不存语法批注 */
export function reviewItemForUnit(unit: TrackUnit, now = Date.now()): ReviewItem {
  return {
    id: `china-${unit.id}`,
    kind: 'phrase',
    content: unit.content.targetPattern.slice(0, 80),
    meaning: `${unit.struggle} → ${unit.content.collocationNotes?.[0] ?? unit.content.targetPattern}`.slice(0, 120),
    example: unit.content.rewriteExample,
    level: 0,
    dueAt: now + DAY,
    createdAt: now,
    source: 'china_track',
  }
}

export function unitCompletionRate(state: ChinaTrackState, total: number): number {
  if (!total) return 0
  return Math.min(1, Object.keys(state.completed ?? {}).length / total)
}

export interface CompleteUnitResult {
  xp: XpResult
  wasCompletedBefore: boolean
}

/**
 * 完成资源单元：一次写入完成记录 + 复习卡片，再走统一 XP 入口。
 * 同一单元每天只入账一次（由 growth.checkCap 判定），重复练习不刷 XP。
 */
export function completeUnit(app: TrackApp, unit: TrackUnit, now = Date.now()): CompleteUnitResult {
  const wasCompletedBefore = Boolean(app.data.chinaTrack.completed?.[unit.id])
  const item = reviewItemForUnit(unit, now)
  app.update((prev) => ({
    ...prev,
    chinaTrack: {
      ...prev.chinaTrack,
      completed: { ...prev.chinaTrack.completed, [unit.id]: new Date(now).toISOString() },
    },
    reviewQueue: prev.reviewQueue.some((r) => r.id === item.id)
      ? prev.reviewQueue
      : [item, ...prev.reviewQueue],
  }))
  const xp = app.awardXp({
    id: `china_track:${unit.id}:${todayKey(new Date(now))}`,
    source: 'china_track',
    action: 'china_track_complete',
    amount: XP_RULES.china_track_complete,
    meta: {
      unitId: unit.id,
      track: unit.track,
      assessmentFocus: unit.assessmentFocus,
      active: true,
    },
  })
  return { xp, wasCompletedBefore }
}

/* ---------------- 轨道 C：最小可说完微场景 ---------------- */

/** 由资源单元生成一个普通 Scenario；assessmentFocus 让既有 Director 调整反馈优先级 */
export function makeMicroScenario(unit: TrackUnit): Scenario {
  const id = `china-${unit.id}`
  const partnerName = unit.examAware ? 'Examiner' : 'Partner'
  return {
    id,
    title: `开口练习 · ${unit.id}`,
    goal: unit.content.promptZh,
    characters: [
      {
        id: 'learner', name: 'You', role: '学生',
        personality: '想把话说完，允许停顿和使用策略表达',
        goal: '用 2–3 句把这个交际任务做完',
        sampleLines: [unit.content.rewriteExample],
      },
      {
        id: 'partner', name: partnerName, role: unit.content.interlocutor || '同学',
        personality: '耐心、不打断、不纠错、不打分',
        goal: '把话接住，让对方有机会多说一句',
        sampleLines: [unit.content.sourceText],
      },
    ],
    targetWords: (unit.content.taskKeys ?? []).slice(0, 5),
    targetPhrases: (unit.content.collocationNotes ?? []).slice(0, 3),
    sentenceFrames: (unit.content.scaffold ?? []),
    openingLine: unit.content.sourceText,
    suggestedReplies: [unit.content.rewriteExample, ...(unit.content.collocationNotes ?? []).slice(0, 2)],
    rounds: 3,
    tint: 'sun',
    emblem: '💬',
    assessmentFocus: unit.assessmentFocus,
  }
}

export function makeMicroSession(unit: TrackUnit, scenario: Scenario, now = Date.now()): Session {
  return {
    id: uid(`china-sess-${unit.id}`),
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    userCharacterId: 'learner',
    aiCharacterId: 'partner',
    messages: [{
      id: uid('msg'), role: 'ai', speaker: scenario.characters[1].name,
      text: scenario.openingLine,
      translation: `这是一次「最小可说完」练习：${unit.content.promptZh}`,
      at: now,
    }],
    coveredWords: [], mistakes: [], turns: 0, createdAt: now,
  }
}

/** 复用既有 Dialogue 页面与 Director，不启动任何新 Agent */
export function startMicroDialogue(app: TrackApp, unit: TrackUnit, now = Date.now()): void {
  const scenario = makeMicroScenario(unit)
  const session = makeMicroSession(unit, scenario, now)
  app.update((prev) => ({
    ...prev,
    scenarios: [scenario, ...prev.scenarios.filter((s) => s.id !== scenario.id)].slice(0, 80),
    sessions: [session, ...prev.sessions].slice(0, 40),
  }))
  app.notify(unit.examAware
    ? '题型感知练习已就绪：只练「知道要做什么」，不打分、不预测成绩 🎧'
    : '微场景已就绪：说满 2–3 句就算完成，优先看任务完成 💬')
  app.navigate('dialogue', { scenarioId: scenario.id, sessionId: session.id })
}

/* ---------------- 省份配置（纯本地） ---------------- */

export function setProvince(app: Pick<AppContextValue, 'update' | 'notify'>, province: ProvinceId): void {
  app.update((prev) => ({ ...prev, chinaTrack: resolveProvinceChange(prev.chinaTrack, province) }))
  app.notify('省份配置已保存在本机，仅用于启用 / 禁用题型感知卡')
}

export function setExamEnabled(app: Pick<AppContextValue, 'update' | 'notify'>, enabled: boolean): void {
  app.update((prev) => ({ ...prev, chinaTrack: resolveExamToggle(prev.chinaTrack, enabled) }))
  app.notify(enabled ? '已开启听说机考题型感知卡 🎧' : '已关闭听说机考题型感知卡')
}
