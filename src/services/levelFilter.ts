/**
 * LevelFilterService —— 三个模块共用的唯一等级筛选层
 *
 * 严格边界：
 * - 只读取与排序内容池，不修改任何内容单元的 cefr / cefrBasis；
 * - 等级是过滤器，不是学习流程：不改 Dialogue / Seminar / PostWatch 的反馈逻辑；
 * - 默认返回 active 等级；showAll 时返回全部（跳级也不锁内容）；
 * - includeAdjacent 只用于「相关内容」推荐，不用于默认列表；
 * - 无 localStorage / 存档损坏时回退默认 B1（Mock 降级，练习不中断）。
 */

import type { ContentItem, LevelCefr, LevelModule, LevelPreference } from '../levelTypes'
import { DEFAULT_LEVEL_PREFERENCE, LEVELS, levelAt, levelRank } from '../levelTypes'
import { LEVEL_CONTENT_POOL, annotationDepth, ANNOTATION_DEPTH_LABEL } from '../data/levelPool'

export const LEVEL_PREF_KEY = 'lingua_level_preference'

/** 单模块当前生效等级：perModule 优先，旧存档缺字段时回退 active / recommended */
export function activeLevel(pref: LevelPreference, module: LevelModule): LevelCefr {
  const level = pref?.perModule?.[module] ?? pref?.active ?? pref?.recommended
  return LEVELS.includes(level) ? level : 'B1'
}

/** 当前模块是否处于手动调整状态 */
export function isModuleManual(pref: LevelPreference, module: LevelModule): boolean {
  return activeLevel(pref, module) !== (pref?.recommended ?? 'B1')
}

/** 读取偏好：只读、不写入；任何异常都用默认值兜底 */
export function readPreference(): LevelPreference {
  try {
    const raw = typeof globalThis !== 'undefined' && globalThis.localStorage
      ? globalThis.localStorage.getItem(LEVEL_PREF_KEY) : null
    if (!raw) return cloneDefault()
    const parsed = JSON.parse(raw) as Partial<LevelPreference>
    return normalizePreference(parsed)
  } catch {
    return cloneDefault()
  }
}

/** 旧存档缺字段时只补缺，不覆盖已有偏好 */
export function normalizePreference(value: Partial<LevelPreference> | null): LevelPreference {
  const base = cloneDefault()
  if (!value || typeof value !== 'object') return base
  const rec = LEVELS.includes(value.recommended as LevelCefr) ? value.recommended as LevelCefr : base.recommended
  const act = LEVELS.includes(value.active as LevelCefr) ? value.active as LevelCefr : rec
  const pm: Partial<Record<LevelModule, LevelCefr>> = value.perModule ?? {}
  return {
    ...base,
    recommended: rec,
    active: act,
    perModule: {
      dialogue: LEVELS.includes(pm.dialogue as LevelCefr) ? pm.dialogue as LevelCefr : act,
      reading: LEVELS.includes(pm.reading as LevelCefr) ? pm.reading as LevelCefr : act,
      video: LEVELS.includes(pm.video as LevelCefr) ? pm.video as LevelCefr : act,
    },
    mode: value.mode === 'manual' ? 'manual' : 'recommended',
    history: Array.isArray(value.history) ? value.history.slice(-50) : [],
    showAllLevels: Boolean(value.showAllLevels),
    ...(value.assessment ? { assessment: value.assessment } : {}),
  }
}

function cloneDefault(): LevelPreference {
  return {
    ...DEFAULT_LEVEL_PREFERENCE,
    perModule: { ...DEFAULT_LEVEL_PREFERENCE.perModule },
    history: [],
  }
}

/** 等级从低到高排序（同级按 id，保证结果稳定） */
export function sortedByLevel(items: ContentItem[]): ContentItem[] {
  return [...items].sort((a, b) => levelRank(a.cefr) - levelRank(b.cefr) || a.id.localeCompare(b.id))
}

/** active ± 1 级；边界处自然收敛（A2 只有 A2/B1，C1 只有 B2/C1） */
export function adjacentLevels(level: LevelCefr): LevelCefr[] {
  const r = levelRank(level)
  return LEVELS.filter((l) => Math.abs(levelRank(l) - r) <= 1)
}

export interface PoolOptions {
  /** 是否包含相邻等级（用于「相关内容」推荐，不用于默认列表） */
  includeAdjacent?: boolean
  /** 显示全部等级，按 A2 → C1 排序；跳级后仍可访问全部内容 */
  showAll?: boolean
  /** 注入偏好（纯函数单测 / 服务端场景）；不传时读 localStorage */
  preference?: LevelPreference
}

/** 纯函数：给定池、模块、等级与选项，返回筛选后的内容（不改动入参） */
export function filterPool(
  pool: ContentItem[],
  module: LevelModule,
  level: LevelCefr,
  options: Omit<PoolOptions, 'preference'> = {},
): ContentItem[] {
  const inModule = pool.filter((i) => i.module === module)
  if (options.showAll) return sortedByLevel(inModule)
  if (options.includeAdjacent) {
    const allowed = adjacentLevels(level)
    return sortedByLevel(inModule.filter((i) => allowed.includes(i.cefr)))
  }
  return sortedByLevel(inModule.filter((i) => i.cefr === level))
}

/**
 * 统一入口：三个模块的列表页、详情页与推荐逻辑都调用它。
 * 默认返回 active 等级的内容；showAll 优先于 includeAdjacent。
 */
export function getContentPool(module: LevelModule, options: PoolOptions = {}): ContentItem[] {
  const pref = options.preference ?? readPreference()
  const level = activeLevel(pref, module)
  const showAll = options.showAll ?? pref.showAllLevels ?? false
  return filterPool(LEVEL_CONTENT_POOL, module, level, {
    includeAdjacent: options.includeAdjacent,
    showAll,
  })
}

/** 按章节粒度取阅读内容（用户跳级/留级按章节筛选，不整本书锁死） */
export function readingChapters(pref: LevelPreference, options: Omit<PoolOptions, 'preference'> = {}): ContentItem[] {
  return getContentPool('reading', { ...options, preference: pref })
    .filter((i) => Boolean(i.chapterId))
}

/** The Reading Corner 思路：同一文本、按等级给不同注释深度（只影响展示，不改反馈逻辑） */
export function annotationDepthFor(pref: LevelPreference, module: LevelModule = 'reading') {
  const level = activeLevel(pref, module)
  return { level, depth: annotationDepth(level), label: ANNOTATION_DEPTH_LABEL[annotationDepth(level)] }
}

export { annotationDepth, ANNOTATION_DEPTH_LABEL, levelAt, levelRank, LEVELS }
