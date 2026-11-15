/**
 * 等级偏好服务 —— 跳级 / 留级 / 回到推荐
 *
 * 严格边界：
 * - 只写 lingua_level_preference，绝不修改任何内容单元的 cefr / cefrBasis；
 * - 留级不扣 XP、不清进度、不触发负向提示（连提示文案都保持中性）；
 * - 不根据答题表现自动升降级，所有调整都由用户主动发起；
 * - recommended 只有「问卷自评 / 轻量定位测试」能更新，用户不能直接手改；
 * - perModule 允许三个模块使用不同等级；全局 mode 由 perModule 是否偏离推荐派生。
 */

import type { AppContextValue } from '../store/useAppStore'
import type { LevelCefr, LevelHistoryEntry, LevelModule, LevelPreference } from '../levelTypes'
import { DEFAULT_LEVEL_PREFERENCE, LEVELS, levelAt, levelRank } from '../levelTypes'
import { activeLevel } from './levelFilter'

export type LevelAction = 'promote' | 'demote' | 'reset'
export type LevelScope = 'module' | 'all'

type PrefApp = Pick<AppContextValue, 'update' | 'notify'>

/** 纯函数：计算一次调整后的新偏好，不改动入参 */
export function computePreference(
  prev: LevelPreference,
  module: LevelModule,
  action: LevelAction,
  scope: LevelScope,
  now = Date.now(),
): LevelPreference {
  const current = activeLevel(prev, module)
  const recommended = prev.recommended ?? DEFAULT_LEVEL_PREFERENCE.recommended
  const next: LevelCefr = action === 'reset'
    ? recommended
    : levelAt(levelRank(current) + (action === 'promote' ? 1 : -1))

  const perModule = { ...prev.perModule }
  if (scope === 'all') {
    for (const m of ['dialogue', 'reading', 'video'] as LevelModule[]) perModule[m] = next
  } else {
    perModule[module] = next
  }
  const mode: LevelPreference['mode'] =
    LEVEL_MODES.every((m) => perModule[m] === recommended) ? 'recommended' : 'manual'

  const entry: LevelHistoryEntry = {
    from: current, to: next, action, scope, module, at: new Date(now).toISOString(),
  }
  return {
    ...prev,
    active: next,
    perModule,
    mode,
    history: [...(prev.history ?? []), entry].slice(-50),
  }
}

const LEVEL_MODES: LevelModule[] = ['dialogue', 'reading', 'video']

/** 3 题轻量自评：只给建议等级，不输出分数、不做正式测评 */
export function suggestLevel(answers: [number, number, number]): LevelCefr {
  const sum = answers.reduce((s, a) => s + Math.max(0, Math.min(2, Number(a) || 0)), 0)
  if (sum <= 1) return 'A2'
  if (sum <= 3) return 'B1'
  if (sum <= 5) return 'B2'
  return 'C1'
}

/** 「显示全部等级」开关：跳级后仍可看到所有等级的内容 */
export function computeShowAll(prev: LevelPreference, enabled: boolean): LevelPreference {
  return { ...prev, showAllLevels: enabled }
}

/**
 * 接受问卷自评的建议：这是唯一会更新 recommended 的路径（问卷来源）。
 * 同时把三个模块与 active 一起回到推荐等级，mode 恢复 recommended。
 */
export function computeAssessment(
  prev: LevelPreference,
  answers: [number, number, number],
  now = Date.now(),
): LevelPreference {
  const suggested = suggestLevel(answers)
  const at = new Date(now).toISOString()
  return {
    ...prev,
    recommended: suggested,
    active: suggested,
    perModule: { dialogue: suggested, reading: suggested, video: suggested },
    mode: 'recommended',
    assessment: { answers, suggested, at },
    history: [...(prev.history ?? []), {
      from: activeLevel(prev, 'dialogue'), to: suggested, action: 'reset',
      scope: 'all', module: 'dialogue', at,
    } as LevelHistoryEntry].slice(-50),
  }
}

/* ---------------- UI 动作封装（唯一写入口） ---------------- */

export function applyLevelChange(
  app: PrefApp, module: LevelModule, action: LevelAction, scope: LevelScope,
): LevelPreference {
  let next: LevelPreference = DEFAULT_LEVEL_PREFERENCE
  app.update((prev) => {
    next = computePreference(prev.levelPreference, module, action, scope)
    return { ...prev, levelPreference: next }
  })
  const label = action === 'promote' ? '已挑战更高等级' : action === 'demote' ? '已回到更基础的内容' : '已回到推荐等级'
  app.notify(`${label} · 当前 ${next.active}。只改变内容筛选，XP、连续天数与进度都不变 🌱`)
  return next
}

export function applyShowAll(app: PrefApp, enabled: boolean): void {
  app.update((prev) => ({ ...prev, levelPreference: computeShowAll(prev.levelPreference, enabled) }))
  app.notify(enabled ? '已显示全部等级：所有内容仍可访问 🎬' : '已按当前等级筛选内容')
}

export function acceptAssessment(app: PrefApp, answers: [number, number, number]): LevelCefr {
  let suggested: LevelCefr = 'B1'
  app.update((prev) => {
    const next = computeAssessment(prev.levelPreference, answers)
    suggested = next.recommended
    return { ...prev, levelPreference: next }
  })
  app.notify(`已采用自评建议 ${suggested}；也可以随时手动调整或忽略 🌱`)
  return suggested
}

/** 等级切换的边界说明（UI 与 README 引用同一份） */
export const LEVEL_CHANGE_NOTES = [
  '跳级不锁内容：仍可用「显示全部等级」看到全部资源',
  '留级不扣 XP、不清进度、不触发负向提示',
  '不按答题表现自动升降级，调整始终由你主动发起',
  '每模块的等级可以不同；「应用到全部模块」才会同步三个模块',
] as const
