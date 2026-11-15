/**
 * 成长系统（Growth System）数据契约
 *
 * 设计原则（详见 README 第十八章）：
 * - XP 奖励「完成单元」，不奖励点击次数；
 * - 所有发放携带事件 ID，由 lingua_xp_ledger 幂等校验；
 * - streak 断裂只重置连续天数，不清 XP、不锁成就；
 * - 成就事件驱动，不在渲染时全量扫描；
 * - 本地时间可被篡改，MVP 阶段接受，不做服务端校验。
 */

export type XpSource =
  | 'dialogue' | 'seminar' | 'postwatch' | 'wordlab'
  | 'review' | 'daily' | 'streak' | 'achievement'
  /** [China Learner Track] 完成一个资源单元，内容层复用统一入口 */
  | 'china_track'

/** 统一发放事件：id 是唯一幂等键 */
export interface XpEvent {
  /** 如 "wordlab:2026-11-12:ability:complete" */
  id: string
  source: XpSource
  /** 如 'word_complete' | 'round_effective' | 'scene_finish' */
  action: string
  amount: number
  meta?: Record<string, unknown>
}

/** 权威成长数据（lingua_growth） */
export interface GrowthState {
  xp: number
  level: number
  /** 当前等级内已累计的 XP */
  levelXp: number
  streak: number
  longestStreak: number
  freezeCards: number
  /** 冻结卡上次重置的月份 YYYY-MM */
  freezeMonth: string
  lastActiveDate: string | null
  dailyXp: { date: string; amount: number }
  dailyGoalMet: boolean
  /** 已发放过的连续天数里程碑 */
  milestones: number[]
  /** 首次迁移标记：只从 lingua_profile 迁入一次 */
  __migrated?: boolean
  version: number
}

export interface XpLedgerEntry {
  id: string
  source: XpSource
  action: string
  amount: number
  /** ISO 时间 */
  at: string
  /** 用于限流聚合：场景 ID / 日期 / 词等，可选 */
  bucket?: string
}

/** lingua_xp_ledger：只保留最近 500 条 */
export interface XpLedgerState {
  entries: XpLedgerEntry[]
  version: number
}

/** lingua_activity_heatmap：最近 90 天 {"YYYY-MM-DD": xpAmount} */
export interface ActivityHeatmapState {
  days: Record<string, number>
  version: number
}

export type AchievementCategory = 'onboarding' | 'consistency' | 'depth' | 'breadth' | 'hidden'

export type AchievementCondition =
  | { type: 'count'; event: string; target: number }
  | { type: 'streak'; target: number }
  | { type: 'composite'; mode: 'all' | 'any'; conditions: Array<AchievementCondition | { type: 'flag'; key: string }> }

export interface Achievement {
  id: string
  category: AchievementCategory
  title: string
  description: string
  hidden: boolean
  condition: AchievementCondition
  progress: number
  unlocked: boolean
  /** ISO 时间 */
  unlockedAt: string | null
  rewardXp: number
  emblem: string
  /** 隐藏成就未解锁时展示的模糊提示 */
  hint?: string
}

/** lingua_achievements：种子定义 + 用户进度合并存储 */
export interface AchievementState {
  items: Achievement[]
  version: number
}

/** 服务内部一次性读写的四键集合 */
export interface GrowthBundle {
  growth: GrowthState
  achievements: AchievementState
  ledger: XpLedgerState
  heatmap: ActivityHeatmapState
}

export interface XpResult {
  granted: boolean
  /** 实际入账金额（0 表示被幂等或限流拦下） */
  amount: number
  reason?: 'duplicate' | 'capped' | 'invalid' | 'no-storage'
  leveledUp: boolean
  newLevel: number
  /** 本次触发并已发放的成就 ID（rewardXp 也走统一入口） */
  unlockedAchievements: string[]
  /** 本次消耗掉的冻结卡张数 */
  freezeUsed: number
  /** 本次达成的连续天数里程碑 */
  milestone?: number
  /** 最终四键快照，供调用方同步 React state */
  bundle: GrowthBundle
}

/* ---------------- XP 规则常量 ---------------- */

/** 从 level 升到 level+1 所需 XP */
export const requiredXp = (level: number): number => 100 + (level - 1) * 50

/** 原创等级语义命名，不复制任何现有产品；超出表长时用「第 N 阶」 */
export const LEVEL_NAMES = [
  '初识', '起步', '积累', '熟练', '进阶', '流畅', '自如', '精进', '融会', '通达',
  '沉潜', '博观', '明辨', '笃行', '澄明', '化境', '游刃', '贯通', '洞见', '从容',
  '渊渟', '朗照', '致远', '圆融', '无碍', '澄澈', '浩瀚', '静观', '炽然', '星辰',
] as const

export const levelName = (level: number): string =>
  LEVEL_NAMES[Math.max(0, level - 1)] ?? `第 ${level} 阶`

/** 发放基准表：只列「完成单元」 */
export const XP_RULES = {
  word_complete: 10,
  spelling_retry: 2,
  round_effective: 2,
  scene_finish: 30,
  seminar_finish: 40,
  postwatch_finish: 40,
  review_batch: 15,
  daily_goal: 20,
  /** [China Learner Track] 完成一个资源单元（结构级反馈或微场景任务完成） */
  china_track_complete: 12,
} as const

/** 明确不发 XP 的行为（供文档与断言引用） */
export const NO_XP_ACTIONS = [
  'open_app', 'browse_page', 'view_definition', 'flip_card', 'reread',
  'revisit_completed_scene', 'revisit_completed_chapter', 'revisit_completed_video',
  'skip_read_aloud', 'quota_reached_new_word',
  /** [China Learner Track] 只看题型说明 / 只切筛选器 / 只选省份都不算完成单元 */
  'view_exam_brief', 'change_track_filter', 'change_province',
] as const

export const DIALOGUE_SCENE_CAP = 20
export const REVIEW_DAILY_CAP = 3
export const SPELLING_RETRY_CAP = 2
export const FREEZE_CARDS_PER_MONTH = 2
export const LEDGER_LIMIT = 500
export const HEATMAP_DAYS = 90

/** 连续天数里程碑 → 里程碑 XP */
export const STREAK_MILESTONES: Array<{ days: number; xp: number }> = [
  { days: 3, xp: 20 }, { days: 7, xp: 50 }, { days: 14, xp: 100 }, { days: 30, xp: 200 },
  { days: 60, xp: 400 }, { days: 100, xp: 600 }, { days: 180, xp: 800 }, { days: 365, xp: 1000 },
]

/** 活跃日定义：完成任一「学习单元」即算活跃，仅浏览不计 */
export const ACTIVE_ACTIONS = [
  'word_complete', 'scene_finish', 'seminar_finish', 'postwatch_finish', 'review_batch',
  'china_track_complete',
] as const

/** 每日目标默认 XP（跟随现有 profile.dailyGoal） */
export const DEFAULT_DAILY_GOAL_XP = 30
