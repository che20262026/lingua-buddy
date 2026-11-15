/**
 * 成长系统四键存储与幂等迁移（独立于 storage.ts，避免循环依赖）
 *
 * 四个新键：
 * - lingua_growth            权威成长数据
 * - lingua_achievements      成就定义 + 用户进度
 * - lingua_xp_ledger         幂等账本（最近 500 条）
 * - lingua_activity_heatmap  最近 90 天活跃热力图
 *
 * 迁移：首次启动把 lingua_profile 的旧 xp / streak / lastActiveDate 迁入 lingua_growth，
 * 只执行一次（__migrated 标记）；之后 profile 只作为只读镜像双写，成长数据以 growth 为准。
 */
import type {
  AchievementState, ActivityHeatmapState, GrowthBundle, GrowthState, XpLedgerState,
} from '../growthTypes'
import { FREEZE_CARDS_PER_MONTH, HEATMAP_DAYS, LEDGER_LIMIT } from '../growthTypes'
import { createAchievementState } from '../data/achievementSeed'

export const GROWTH_KEYS = {
  growth: 'lingua_growth',
  achievements: 'lingua_achievements',
  ledger: 'lingua_xp_ledger',
  heatmap: 'lingua_activity_heatmap',
} as const

const localTodayKey = (d = new Date()): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const localMonthKey = (d = new Date()): string => localTodayKey(d).slice(0, 7)

export const GROWTH_DEFAULTS = {
  growth: (): GrowthState => ({
    xp: 0,
    level: 1,
    levelXp: 0,
    streak: 0,
    longestStreak: 0,
    freezeCards: FREEZE_CARDS_PER_MONTH,
    freezeMonth: localMonthKey(),
    lastActiveDate: null,
    dailyXp: { date: localTodayKey(), amount: 0 },
    dailyGoalMet: false,
    milestones: [],
    __migrated: false,
    version: 1,
  }),
  achievements: (): AchievementState => createAchievementState(),
  ledger: (): XpLedgerState => ({ entries: [], version: 1 }),
  heatmap: (): ActivityHeatmapState => ({ days: {}, version: 1 }),
}

function read<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (parsed == null) return fallback
    if (Array.isArray(fallback) || Array.isArray(parsed)) return (Array.isArray(parsed) ? parsed : fallback) as T
    return { ...(fallback as object), ...(parsed as object) } as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 单键写入失败静默跳过，不影响学习流程 */
  }
}

/**
 * 首次启动迁移（幂等、单向、旧键零改动）：
 * 1. 四键缺失时按默认值播种；
 * 2. 仅当 lingua_growth.__migrated !== true 时，把 profile 的旧 xp / streak / lastActiveDate 迁入；
 * 3. 打上 __migrated 标记，重复运行不再覆盖用户后续积累的 XP。
 */
export function migrateGrowthData(now = new Date()): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const ls = window.localStorage
    const today = localTodayKey(now)
    const month = localMonthKey(now)

    // 三个附属键：缺才补，不覆盖
    for (const [k, make] of [
      [GROWTH_KEYS.achievements, GROWTH_DEFAULTS.achievements],
      [GROWTH_KEYS.ledger, GROWTH_DEFAULTS.ledger],
      [GROWTH_KEYS.heatmap, GROWTH_DEFAULTS.heatmap],
    ] as const) {
      if (ls.getItem(k) === null) write(k, make())
    }

    const existing = read<GrowthState>(GROWTH_KEYS.growth, GROWTH_DEFAULTS.growth())
    if (existing.__migrated === true) return

    let old = { xp: 0, streak: 0, lastActiveDate: null as string | null }
    try {
      const raw = ls.getItem('lingua_profile')
      if (raw) {
        const p = JSON.parse(raw) as Record<string, unknown>
        old = {
          xp: typeof p.xp === 'number' && Number.isFinite(p.xp) ? p.xp : 0,
          streak: typeof p.streak === 'number' && Number.isFinite(p.streak) ? p.streak : 0,
          lastActiveDate: typeof p.lastActiveDate === 'string' ? p.lastActiveDate : null,
        }
      }
    } catch { /* 旧档损坏按 0 处理 */ }

    // 旧 XP 按等级曲线重算 level / levelXp，保证曲线与新规则一致
    let level = 1
    let rest = Math.max(0, old.xp)
    while (rest >= 100 + (level - 1) * 50) {
      rest -= 100 + (level - 1) * 50
      level += 1
    }
    const migrated: GrowthState = {
      ...GROWTH_DEFAULTS.growth(),
      xp: old.xp,
      level,
      levelXp: rest,
      streak: old.streak,
      longestStreak: old.streak,
      lastActiveDate: old.lastActiveDate,
      freezeMonth: month,
      dailyXp: { date: today, amount: 0 },
      __migrated: true,
    }
    write(GROWTH_KEYS.growth, migrated)

    // 热力图给迁移当天留一条活跃痕迹（值为 0，仅表示「有过记录」）
    const hm = read<ActivityHeatmapState>(GROWTH_KEYS.heatmap, GROWTH_DEFAULTS.heatmap())
    if (old.lastActiveDate && hm.days[old.lastActiveDate] == null) {
      hm.days[old.lastActiveDate] = 0
      write(GROWTH_KEYS.heatmap, trimHeatmap(hm, now))
    }
  } catch {
    /* 迁移异常静默跳过，交给逐键回退 */
  }
}

/** 实时读四键（多标签页并发时，幂等校验以这里读到的账本为准） */
export function readGrowthBundle(): GrowthBundle {
  return {
    growth: read<GrowthState>(GROWTH_KEYS.growth, GROWTH_DEFAULTS.growth()),
    achievements: readAchievements(),
    ledger: read<XpLedgerState>(GROWTH_KEYS.ledger, GROWTH_DEFAULTS.ledger()),
    heatmap: read<ActivityHeatmapState>(GROWTH_KEYS.heatmap, GROWTH_DEFAULTS.heatmap()),
  }
}

function readAchievements(): AchievementState {
  const fallback = GROWTH_DEFAULTS.achievements()
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback
    const raw = window.localStorage.getItem(GROWTH_KEYS.achievements)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as AchievementState
    if (!Array.isArray(parsed?.items)) return fallback
    // 种子定义升级时补齐新成就，但保留用户进度
    const map = new Map(parsed.items.map((a) => [a.id, a]))
    return {
      items: fallback.items.map((seed) => {
        const saved = map.get(seed.id)
        return saved ? { ...seed, progress: saved.progress ?? 0, unlocked: !!saved.unlocked, unlockedAt: saved.unlockedAt ?? null } : seed
      }),
      version: 1,
    }
  } catch {
    return fallback
  }
}

/** 写回四键；账本与热力图在写入前各自裁剪 */
export function writeGrowthBundle(bundle: GrowthBundle, now = new Date()): void {
  const ledger: XpLedgerState = {
    entries: [...bundle.ledger.entries].slice(-LEDGER_LIMIT),
    version: 1,
  }
  write(GROWTH_KEYS.growth, bundle.growth)
  write(GROWTH_KEYS.achievements, bundle.achievements)
  write(GROWTH_KEYS.ledger, ledger)
  write(GROWTH_KEYS.heatmap, trimHeatmap(bundle.heatmap, now))
}

/** 只保留最近 90 天（按 YYYY-MM-DD 字典序即可） */
export function trimHeatmap(state: ActivityHeatmapState, now = new Date()): ActivityHeatmapState {
  const cutoff = localTodayKey(new Date(now.getTime() - (HEATMAP_DAYS - 1) * 24 * 60 * 60 * 1000))
  const days: Record<string, number> = {}
  for (const [d, v] of Object.entries(state.days ?? {})) {
    if (d >= cutoff && d <= localTodayKey(now)) days[d] = v
  }
  return { days, version: 1 }
}

/** profile 只读镜像：把权威成长数据回写到旧字段，保持既有 UI 与旧存档兼容 */
export function mirrorProfile<T extends {
  xp: number; streak: number; todayXp: number; todayDate: string; lastActiveDate: string
}>(profile: T, growth: GrowthState): T {
  const today = localTodayKey()
  return {
    ...profile,
    xp: growth.xp,
    streak: growth.streak,
    todayXp: growth.dailyXp.date === today ? growth.dailyXp.amount : 0,
    todayDate: today,
    lastActiveDate: growth.lastActiveDate ?? today,
  }
}
