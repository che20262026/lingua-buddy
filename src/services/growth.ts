/**
 * 成长系统统一服务：awardXp / checkAchievements / 等级 / streak / 每日目标
 *
 * 唯一发放入口：所有模块只能通过 awardXp(event) 写 XP，禁止直接写 lingua_growth.xp。
 * 幂等：每次发放前实时读取 lingua_xp_ledger（多标签页也以磁盘账本为准），事件 ID 已存在即跳过。
 * 事件驱动：checkAchievements 只查 ACHIEVEMENT_INDEX 里与本次 action 相关的成就，禁止全量扫描。
 * Mock 降级：configureGrowth() 可注入时钟 / 每日目标 / 开关；无 localStorage 时退化为内存账本。
 */
import type {
  Achievement, GrowthBundle, GrowthState, XpEvent, XpLedgerState, XpResult,
} from '../growthTypes'
import {
  ACTIVE_ACTIONS, DEFAULT_DAILY_GOAL_XP, DIALOGUE_SCENE_CAP, FREEZE_CARDS_PER_MONTH,
  HEATMAP_DAYS, LEDGER_LIMIT, REVIEW_DAILY_CAP, SPELLING_RETRY_CAP,
  STREAK_MILESTONES, XP_RULES, levelName, requiredXp,
} from '../growthTypes'
import { ACHIEVEMENT_INDEX } from '../data/achievementSeed'
import {
  GROWTH_DEFAULTS, readGrowthBundle, writeGrowthBundle,
} from '../lib/growthStorage'

/* ---------------- 可注入配置（Mock / 时钟） ---------------- */

export interface GrowthConfig {
  now: () => number
  dailyGoal: number
  /** 关闭后所有发放静默跳过（用于演示 / 测试） */
  enabled: boolean
}

let config: GrowthConfig = { now: () => Date.now(), dailyGoal: DEFAULT_DAILY_GOAL_XP, enabled: true }
let memoryBundle: GrowthBundle | null = null

export function configureGrowth(patch: Partial<GrowthConfig>): void { config = { ...config, ...patch } }
export function resetGrowthConfig(): void {
  config = { now: () => Date.now(), dailyGoal: DEFAULT_DAILY_GOAL_XP, enabled: true }
  memoryBundle = null
}

const hasStorage = (): boolean => {
  try { return typeof window !== 'undefined' && !!window.localStorage } catch { return false }
}

function loadBundle(): GrowthBundle {
  if (hasStorage()) return readGrowthBundle()
  if (!memoryBundle) {
    memoryBundle = {
      growth: GROWTH_DEFAULTS.growth(),
      achievements: GROWTH_DEFAULTS.achievements(),
      ledger: GROWTH_DEFAULTS.ledger(),
      heatmap: GROWTH_DEFAULTS.heatmap(),
    }
  }
  return structuredClone(memoryBundle)
}

function persist(bundle: GrowthBundle): void {
  if (hasStorage()) writeGrowthBundle(bundle)
  else memoryBundle = structuredClone(bundle)
}

/* ---------------- 日期与等级纯函数 ---------------- */

export function dateKey(d = new Date(config.now())): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthKey(d = new Date(config.now())): string {
  return dateKey(d).slice(0, 7)
}

/** 两个 YYYY-MM-DD 之间的天数差（用 UTC 解析，避开夏令时） */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0
  return Math.round((tb - ta) / 86400000)
}

/** 由累计 XP 反推等级与等级内 XP */
export function computeLevel(totalXp: number): { level: number; levelXp: number } {
  let level = 1
  let rest = Math.max(0, totalXp)
  while (rest >= requiredXp(level)) {
    rest -= requiredXp(level)
    level += 1
    if (level > 10000) break // 防御异常数据
  }
  return { level, levelXp: rest }
}

export function levelInfo(growth: GrowthState) {
  const need = requiredXp(growth.level)
  return {
    level: growth.level,
    name: levelName(growth.level),
    required: need,
    current: growth.levelXp,
    pct: Math.min(1, growth.levelXp / need),
    /** 30 级后 UI 只展示百分比，不再堆具体数字 */
    showNumbers: growth.level <= 30,
  }
}

export function isActiveAction(action: string): boolean {
  return (ACTIVE_ACTIONS as readonly string[]).includes(action)
}

export function lastNDays(n = HEATMAP_DAYS, now = config.now()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(dateKey(new Date(now - i * 86400000)))
  return out
}

/* ---------------- streak：活跃日 / 冻结卡 / 月度重置 ---------------- */

export interface StreakUpdate {
  growth: GrowthState
  freezeUsed: number
  /** 本次新达成的里程碑天数 */
  milestone?: number
  /** 是否触发里程碑 XP（由调用方生成标准事件） */
  milestoneXp?: number
}

/**
 * 断签不清零：
 * - 每月 1 日（跨月首次发放）把冻结卡重置为 2；
 * - gap = 上次活跃日与今天之间的空白天数；
 * - gap > 0 且 gap <= 剩余冻结卡 → 消耗 gap 张，streak 继续（只 +1，不补签）；
 * - gap > 冻结卡 → streak 重置为 1（XP、等级、成就一律不动）。
 */
export function markActiveDay(growth: GrowthState, today = dateKey()): StreakUpdate {
  const g: GrowthState = {
    ...growth,
    milestones: [...(growth.milestones ?? [])],
    dailyXp: { ...growth.dailyXp },
  }
  const month = today.slice(0, 7)
  if (g.freezeMonth !== month) {
    g.freezeMonth = month
    g.freezeCards = FREEZE_CARDS_PER_MONTH
  }
  if (g.lastActiveDate === today) return { growth: g, freezeUsed: 0 }

  const gap = g.lastActiveDate ? Math.max(0, daysBetween(g.lastActiveDate, today) - 1) : 0
  let freezeUsed = 0
  if (gap > 0 && gap <= g.freezeCards) {
    freezeUsed = gap
    g.freezeCards -= gap
    g.streak = Math.max(1, g.streak) + 1
  } else if (gap > g.freezeCards) {
    g.streak = 1
  } else {
    // 连续昨天 → 直接 +1；首次活跃 → 1
    g.streak = g.lastActiveDate ? g.streak + 1 : 1
  }
  g.lastActiveDate = today
  g.longestStreak = Math.max(g.longestStreak ?? 0, g.streak)

  const hit = [...STREAK_MILESTONES].reverse().find((m) =>
    g.streak >= m.days && !(g.milestones ?? []).includes(m.days))
  if (hit) return { growth: g, freezeUsed, milestone: hit.days, milestoneXp: hit.xp }
  return { growth: g, freezeUsed }
}

/* ---------------- 事件驱动成就判定 ---------------- */

function countInLedger(ledger: XpLedgerState, action: string, target = 1): { reached: boolean; count: number } {
  let n = 0
  for (const e of ledger.entries) if (e.action === action) n += 1
  return { reached: n >= target, count: n }
}

function conditionMet(
  cond: Achievement['condition'],
  bundle: GrowthBundle,
  event: XpEvent,
  flags: Record<string, boolean>,
): { reached: boolean; progress: number } {
  if (cond.type === 'streak') {
    return { reached: bundle.growth.streak >= cond.target, progress: bundle.growth.streak }
  }
  if (cond.type === 'count') {
    const hit = countInLedger(bundle.ledger, cond.event, cond.target)
    return { reached: hit.reached, progress: hit.count }
  }
  const parts = cond.conditions.map((c) => {
    if (c.type === 'flag') return !!flags[c.key]
    return conditionMet(c, bundle, event, flags).reached
  })
  const reached = cond.mode === 'all' ? parts.every(Boolean) : parts.some(Boolean)
  return { reached, progress: parts.filter(Boolean).length }
}

/**
 * 只检查与本次事件相关的成就（倒排索引 + streak 组），不在渲染时全量扫描。
 * 仅在 XP 已成功入账（granted）后调用，进度更新因此与发放共用同一事件 ID，天然幂等。
 */
export function checkAchievements(
  bundle: GrowthBundle,
  event: XpEvent,
): { items: Achievement[]; unlockedIds: string[] } {
  const related = new Set<string>([
    ...(ACHIEVEMENT_INDEX[event.action] ?? []),
    ...(isActiveAction(event.action) ? (ACHIEVEMENT_INDEX.__streak__ ?? []) : []),
  ])
  const items = bundle.achievements.items.map((a) => ({ ...a, condition: structuredClone(a.condition) }))
  const flags = (event.meta?.flags ?? {}) as Record<string, boolean>
  const unlockedIds: string[] = []
  for (const a of items) {
    if (!related.has(a.id) || a.unlocked) continue
    const { reached, progress } = conditionMet(a.condition, bundle, event, flags)
    a.progress = a.condition.type === 'count'
      ? Math.max(a.progress, Math.min(progress, 10_000))
      : progress
    if (reached) {
      a.unlocked = true
      a.unlockedAt = new Date(config.now()).toISOString()
      unlockedIds.push(a.id)
    }
  }
  return { items, unlockedIds }
}

/* ---------------- 限流：与限流协同，不对抗 ---------------- */

export type CapVerdict = 'ok' | 'capped' | 'invalid'

export function checkCap(bundle: GrowthBundle, event: XpEvent, today = dateKey()): CapVerdict {
  // amount === 0 是「只记账不发 XP」的标记事件（如冻结卡消耗），仍走幂等与成就判定
  if (!event.id || typeof event.id !== 'string' || !Number.isFinite(event.amount) || event.amount < 0) return 'invalid'
  const entries = bundle.ledger.entries
  switch (event.action) {
    case 'round_effective': {
      // 单场景累计上限 20 XP，按场景 ID 全时段聚合，重进场景不重置
      const bucket = String(event.meta?.scenarioId ?? 'default')
      const used = entries.filter((e) => e.action === 'round_effective' && e.bucket === bucket)
        .reduce((s, e) => s + e.amount, 0)
      return used + event.amount > DIALOGUE_SCENE_CAP ? 'capped' : 'ok'
    }
    case 'review_batch': {
      const n = entries.filter((e) => e.action === 'review_batch' && e.at.slice(0, 10) === today).length
      return n >= REVIEW_DAILY_CAP ? 'capped' : 'ok'
    }
    case 'word_complete': {
      // 达到每日新词上限后不再发新词 XP（限流本身也不允许继续学新词）
      const limit = Number(event.meta?.dailyWordLimit ?? 15)
      const n = entries.filter((e) => e.action === 'word_complete' && e.at.slice(0, 10) === today).length
      return n >= limit ? 'capped' : 'ok'
    }
    case 'spelling_retry': {
      const bucket = String(event.meta?.sessionKey ?? 'default')
      const used = entries.filter((e) => e.action === 'spelling_retry' && e.bucket === bucket)
        .reduce((s, e) => s + e.amount, 0)
      return used + event.amount > SPELLING_RETRY_CAP ? 'capped' : 'ok'
    }
    case 'china_track_complete': {
      // [China Learner Track] 同一资源单元每天只入账一次，重练不刷 XP
      const bucket = String(event.meta?.unitId ?? 'default')
      const already = entries.some((e) => e.action === 'china_track_complete'
        && e.bucket === bucket && e.at.slice(0, 10) === today)
      return already ? 'capped' : 'ok'
    }
    default:
      // scene_finish / seminar_finish / postwatch_finish / daily_goal / milestone /
      // achievement_unlock 都靠「稳定事件 ID」幂等：同一场景 / 章节 / 视频 / 日期只发一次
      return 'ok'
  }
}

/* ---------------- 核心：一次发放的纯计算 ---------------- */

export interface AwardComputation {
  granted: boolean
  reason?: XpResult['reason']
  bundle: GrowthBundle
  leveledUp: boolean
  newLevel: number
  unlockedIds: string[]
  freezeUsed: number
  milestone?: number
  /** 由统一入口继续发放的派生事件（每日目标 / 里程碑 / 成就奖励） */
  pending: XpEvent[]
}

export function computeAward(bundle: GrowthBundle, event: XpEvent, now = config.now()): AwardComputation {
  const empty = (reason?: XpResult['reason']): AwardComputation => ({
    granted: false, reason, bundle, leveledUp: false, newLevel: bundle.growth.level,
    unlockedIds: [], freezeUsed: 0, pending: [],
  })
  if (!config.enabled) return empty('no-storage')
  if (bundle.ledger.entries.some((e) => e.id === event.id)) return empty('duplicate')
  const cap = checkCap(bundle, event, dateKey(new Date(now)))
  if (cap !== 'ok') return empty(cap === 'invalid' ? 'invalid' : 'capped')

  const today = dateKey(new Date(now))
  const at = new Date(now).toISOString()
  const next: GrowthBundle = {
    growth: { ...bundle.growth, milestones: [...(bundle.growth.milestones ?? [])], dailyXp: { ...bundle.growth.dailyXp } },
    achievements: { ...bundle.achievements, items: bundle.achievements.items.map((a) => ({ ...a })) },
    ledger: { ...bundle.ledger, entries: [...bundle.ledger.entries] },
    heatmap: { ...bundle.heatmap, days: { ...bundle.heatmap.days } },
  }

  // 1. XP 与等级
  const beforeLevel = next.growth.level
  next.growth.xp += event.amount
  const lv = computeLevel(next.growth.xp)
  next.growth.level = lv.level
  next.growth.levelXp = lv.levelXp
  const leveledUp = lv.level > beforeLevel

  // 2. 今日 XP 与热力图（跨天归零并重置目标标记）
  if (next.growth.dailyXp.date !== today) {
    next.growth.dailyXp = { date: today, amount: 0 }
    next.growth.dailyGoalMet = false
  }
  next.growth.dailyXp.amount += event.amount
  if (event.amount > 0) next.heatmap.days[today] = (next.heatmap.days[today] ?? 0) + event.amount

  // 3. 账本（写入前校验、写入后裁剪到 500 条）
  next.ledger.entries.push({
    id: event.id, source: event.source, action: event.action, amount: event.amount, at,
    bucket: event.meta?.scenarioId != null ? String(event.meta.scenarioId)
      : event.meta?.sessionKey != null ? String(event.meta.sessionKey)
        : event.meta?.unitId != null ? String(event.meta.unitId) : undefined,
  })
  if (next.ledger.entries.length > LEDGER_LIMIT) {
    next.ledger.entries = next.ledger.entries.slice(-LEDGER_LIMIT)
  }

  // 4. 活跃日 / 冻结卡 / 里程碑
  let freezeUsed = 0
  let milestone: number | undefined
  const pending: XpEvent[] = []
  if (isActiveAction(event.action) || event.meta?.active === true) {
    const su = markActiveDay(next.growth, today)
    next.growth = su.growth
    freezeUsed = su.freezeUsed
    if (su.milestone && su.milestoneXp && !(next.growth.milestones ?? []).includes(su.milestone)) {
      next.growth.milestones = [...(next.growth.milestones ?? []), su.milestone]
      milestone = su.milestone
      pending.push({
        id: `streak:${today}:milestone:${su.milestone}`, source: 'streak',
        action: 'milestone', amount: su.milestoneXp, meta: { internal: true, days: su.milestone },
      })
    }
    if (freezeUsed > 0) {
      pending.push({
        id: `streak:${today}:freeze:${freezeUsed}`, source: 'streak',
        action: 'freeze_used', amount: 0, meta: { internal: true, count: freezeUsed },
      })
    }
  }

  // 5. 每日目标（每日一次）
  if (next.growth.dailyXp.amount >= config.dailyGoal && !next.growth.dailyGoalMet) {
    next.growth.dailyGoalMet = true
    pending.push({
      id: `daily:${today}:goal`, source: 'daily', action: 'daily_goal',
      amount: XP_RULES.daily_goal, meta: { internal: true },
    })
  }

  // 6. 成就（事件驱动，解锁奖励仍走统一入口）
  const checked = checkAchievements(next, event)
  next.achievements.items = checked.items
  for (const id of checked.unlockedIds) {
    const a = checked.items.find((x) => x.id === id)
    pending.push({
      id: `achievement:${id}:unlock`, source: 'achievement', action: 'achievement_unlock',
      amount: a?.rewardXp ?? 30, meta: { internal: true, achievementId: id },
    })
  }

  return {
    granted: true, bundle: next, leveledUp, newLevel: lv.level,
    unlockedIds: checked.unlockedIds, freezeUsed, milestone, pending,
  }
}

/* ---------------- 统一入口 ---------------- */

const DISPATCH_NAME = 'lingua:growth'

function dispatch(result: XpResult): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(DISPATCH_NAME, { detail: result }))
    }
  } catch { /* 提示通道失败不影响入账 */ }
}

/**
 * 唯一 XP 发放入口。幂等 / 限流 / 等级 / streak / 成就 / 热力图全部在此收口。
 * 派生事件（每日目标、里程碑、成就奖励）递归调用本函数，保证不绕过统一入口。
 */
export function awardXp(event: XpEvent): XpResult {
  const bundle = loadBundle()
  const comp = computeAward(bundle, event)
  if (!comp.granted) {
    return {
      granted: false, amount: 0, reason: comp.reason, leveledUp: false,
      newLevel: bundle.growth.level, unlockedAchievements: [], freezeUsed: 0, bundle,
    }
  }
  persist(comp.bundle)

  const unlocked = [...comp.unlockedIds]
  let leveledUp = comp.leveledUp
  let newLevel = comp.newLevel
  for (const p of comp.pending) {
    const r = awardXp(p) // 统一入口递归；派生事件不会再产生 pending
    if (r.granted) {
      unlocked.push(...r.unlockedAchievements)
      leveledUp = leveledUp || r.leveledUp
      newLevel = Math.max(newLevel, r.newLevel)
    }
  }

  const finalBundle = loadBundle()
  const result: XpResult = {
    granted: true,
    amount: event.amount,
    leveledUp,
    newLevel,
    unlockedAchievements: [...new Set(unlocked)],
    freezeUsed: comp.freezeUsed,
    milestone: comp.milestone,
    bundle: finalBundle,
  }
  if (!event.meta?.internal) dispatch(result)
  return result
}

/* ---------------- 供 UI 使用的派生查询 ---------------- */

export function todayXp(bundle: GrowthBundle, today = dateKey()): number {
  return bundle.growth.dailyXp.date === today ? bundle.growth.dailyXp.amount : 0
}

export function todayReviewXp(bundle: GrowthBundle, today = dateKey()): number {
  return bundle.ledger.entries
    .filter((e) => e.action === 'review_batch' && e.at.slice(0, 10) === today)
    .reduce((s, e) => s + e.amount, 0)
}

export function sceneRoundXp(bundle: GrowthBundle, scenarioId: string): number {
  return bundle.ledger.entries
    .filter((e) => e.action === 'round_effective' && e.bucket === scenarioId)
    .reduce((s, e) => s + e.amount, 0)
}

export function recentAchievements(bundle: GrowthBundle, n = 6): Achievement[] {
  return bundle.achievements.items
    .filter((a) => a.unlocked)
    .sort((a, b) => String(b.unlockedAt).localeCompare(String(a.unlockedAt)))
    .slice(0, n)
}

export const GROWTH_EVENT = DISPATCH_NAME
