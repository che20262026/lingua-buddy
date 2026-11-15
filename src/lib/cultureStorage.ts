/* ================================================================
 * 「文化视角视频」数据迁移（轻量、幂等、单向）
 *
 * 设计约束（与 literaryStorage.ts 同款）：
 *   - 绝不改动 12 个旧键的语义，也不读取/重写它们的内容；
 *     唯一例外是给 lingua_settings 补上两个新字段（只补 undefined，绝不覆盖）。
 *   - 4 个新键只在完全不存在时创建，已有数据一律原样保留。
 *   - 迁移可重复运行；升级 seedVersion 时只补回内置视频，保留 custom 条目与用户短注释。
 *   - 全程 try/catch：localStorage 被禁用或单个键损坏时静默跳过，
 *     交给 loadData() 的既有回退逻辑，绝不让旧数据丢失。
 * ================================================================ */

import { KEYS } from './storage'
import {
  ALL_SEED_VIDEOS, CULTURE_SEED_VERSION, CULTURE_SETTING_DEFAULTS,
  DEFAULT_CULTURE_LIBRARY, DEFAULT_CULTURE_NOTES, DEFAULT_POSTWATCH_SESSIONS,
  DEFAULT_WATCH_PROGRESS,
} from '../data/cultureSeed'
import { DEFAULT_PLAYLIST_REGISTRY } from '../data/playlistRegistrySeed'
import type { CultureLibraryState, CultureVideo } from '../cultureTypes'
import type { LibraryVideoEntry } from '../cultureLibraryTypes'

export interface CultureMigrationReport {
  /** 本次新建的键 */
  created: string[]
  /** 补齐的旧设置字段 */
  patchedSettings: string[]
  /** 被触碰的旧键（正常情况下最多只有 lingua_settings） */
  legacyKeysTouched: string[]
  /** seedVersion 升级时补回的内置视频数量 */
  reseededVideos: number
  /** 是否因环境限制跳过 */
  skipped: boolean
}

const NOOP: CultureMigrationReport = {
  created: [], patchedSettings: [], legacyKeysTouched: [], reseededVideos: 0, skipped: true,
}

/**
 * 一次性轻量迁移。在 AppProvider 初始化、loadData() 之前调用一次即可。
 * 旧版本 localStorage 里没有任何新键时，本函数负责把它们补齐；
 * 已有数据时它什么都不做（返回全空报告）。
 */
export function migrateCultureData(): CultureMigrationReport {
  if (typeof window === 'undefined' || !window.localStorage) return { ...NOOP }
  const ls = window.localStorage
  const report: CultureMigrationReport = {
    created: [], patchedSettings: [], legacyKeysTouched: [], reseededVideos: 0, skipped: false,
  }

  const defaults: Record<string, unknown> = {
    [KEYS.cultureVideos]: DEFAULT_CULTURE_LIBRARY,
    [KEYS.watchProgress]: DEFAULT_WATCH_PROGRESS,
    [KEYS.postWatchSessions]: DEFAULT_POSTWATCH_SESSIONS,
    [KEYS.cultureNotes]: DEFAULT_CULTURE_NOTES,
    /** [新增] 三层储量体系第 2 层：播放列表注册表（含 11 个预置播放列表） */
    [KEYS.playlistRegistry]: DEFAULT_PLAYLIST_REGISTRY,
  }

  try {
    // 1) 四个新键：只在缺失时写入
    for (const [key, value] of Object.entries(defaults)) {
      if (ls.getItem(key) === null) {
        ls.setItem(key, JSON.stringify(value))
        report.created.push(key)
      }
    }

    // 2) 视频库版本升级：只补回内置种子，保留同步产物、custom 条目与观看记录
    const rawLibrary = ls.getItem(KEYS.cultureVideos)
    if (rawLibrary) {
      try {
        const parsed = JSON.parse(rawLibrary) as Partial<CultureLibraryState>
        if (parsed && typeof parsed === 'object' && (parsed.seedVersion ?? 0) < CULTURE_SEED_VERSION) {
          /** 保留用户数据：custom 条目 + 播放列表同步产物（seed:false / acquiredVia 标记） */
          const kept: CultureVideo[] = Array.isArray(parsed.videos)
            ? parsed.videos.filter((v) => v && (
              v.custom || v.seed === false || v.acquiredVia === 'playlistItems.list'))
            : []
          /** 按 videoId / id 去重：种子库条目优先，重复的旧条目剔除 */
          const seen = new Set<string>()
          for (const v of kept) {
            const key = v.videoId || v.id
            if (key) seen.add(key)
          }
          const dedupedSeeds = ALL_SEED_VIDEOS.filter((s) => {
            const key = (s as LibraryVideoEntry).videoId || s.id
            if (!key || !seen.has(key)) return true
            // videoId 相同时保留用户已有的同步条目，剔除种子重复
            return false
          })
          const next: CultureLibraryState = {
            seedVersion: CULTURE_SEED_VERSION,
            videos: [...kept, ...dedupedSeeds],
          }
          ls.setItem(KEYS.cultureVideos, JSON.stringify(next))
          report.reseededVideos = dedupedSeeds.length
        }
      } catch { /* 损坏的库交给 loadData 回退默认值 */ }
    }

    // 3) 旧设置：只补两个缺省字段。已有值（无论用户改成什么）一律保留
    const rawSettings = ls.getItem(KEYS.settings)
    if (rawSettings) {
      try {
        const parsed = JSON.parse(rawSettings) as Record<string, unknown>
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          let dirty = false
          for (const [key, value] of Object.entries(CULTURE_SETTING_DEFAULTS)) {
            if (parsed[key] === undefined) {
              parsed[key] = value
              report.patchedSettings.push(key)
              dirty = true
            }
          }
          if (dirty) {
            ls.setItem(KEYS.settings, JSON.stringify(parsed))
            report.legacyKeysTouched.push(KEYS.settings)
          }
        }
      } catch { /* 损坏的设置由 loadData 逐键回退，不在此处改写 */ }
    }
  } catch (err) {
    console.warn('[LinguaBuddy] 文化视频模块迁移被跳过（不影响原有数据）：', err)
    report.skipped = true
  }

  return report
}

/** 供测试与设置页诊断：只读取，不改动任何数据 */
export function inspectCultureMigration(): Record<string, boolean> {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  const out: Record<string, boolean> = {}
  for (const key of [KEYS.cultureVideos, KEYS.watchProgress, KEYS.postWatchSessions, KEYS.cultureNotes]) {
    try { out[key] = window.localStorage.getItem(key) !== null } catch { out[key] = false }
  }
  return out
}

/** 清空全部数据时把文化新键一起纳入（语义与 clearAllData 一致） */
export const CULTURE_KEYS: string[] = [
  KEYS.cultureVideos, KEYS.watchProgress, KEYS.postWatchSessions, KEYS.cultureNotes,
  KEYS.playlistRegistry,
]
