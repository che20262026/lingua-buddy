/* ================================================================
 * 文学模块数据迁移（轻量、幂等、单向）
 *
 * 设计约束：
 *   - 绝不改动 8 个旧键的语义，也不读取/重写它们的内容；
 *     唯一例外是给 lingua_settings 补上两个新字段（只补 undefined，绝不覆盖）。
 *   - 4 个新键只在完全不存在时创建，已有数据一律原样保留。
 *   - 迁移可重复运行；升级 seedVersion 时只补回内置书，保留用户自定义书与 briefs。
 *   - 全程 try/catch：localStorage 被禁用或单个键损坏时静默跳过，
 *     交给 loadData() 的既有回退逻辑处理，绝不让旧数据丢失。
 * ================================================================ */

import { KEYS } from './storage'
import {
  BUILTIN_BOOKS, DEFAULT_LIBRARY_STATE, DEFAULT_LITERARY_NOTES,
  DEFAULT_READING_PROGRESS, DEFAULT_SEMINARS, LIBRARY_SEED_VERSION,
  LITERARY_SETTING_DEFAULTS,
} from '../data/librarySeed'
import type { LibraryState } from '../literaryTypes'

export interface MigrationReport {
  /** 本次新建的键 */
  created: string[]
  /** 补齐的旧设置字段 */
  patchedSettings: string[]
  /** 被触碰的旧键（正常情况下最多只有 lingua_settings） */
  legacyKeysTouched: string[]
  /** seedVersion 升级时补回的内置书数量 */
  reseededBooks: number
  /** 是否因环境限制跳过 */
  skipped: boolean
}

const NOOP: MigrationReport = {
  created: [], patchedSettings: [], legacyKeysTouched: [], reseededBooks: 0, skipped: true,
}

/**
 * 一次性轻量迁移。在 AppProvider 初始化、loadData() 之前调用一次即可。
 * 旧版本 localStorage 里没有任何新键时，本函数负责把它们补齐；
 * 已有数据时它什么都不做（返回全空报告）。
 */
export function migrateLiteraryData(): MigrationReport {
  if (typeof window === 'undefined' || !window.localStorage) return { ...NOOP }
  const ls = window.localStorage
  const report: MigrationReport = {
    created: [], patchedSettings: [], legacyKeysTouched: [], reseededBooks: 0, skipped: false,
  }

  const defaults: Record<string, unknown> = {
    [KEYS.library]: DEFAULT_LIBRARY_STATE,
    [KEYS.readingProgress]: DEFAULT_READING_PROGRESS,
    [KEYS.seminars]: DEFAULT_SEMINARS,
    [KEYS.literaryNotes]: DEFAULT_LITERARY_NOTES,
  }

  try {
    // 1) 四个新键：只在缺失时写入
    for (const [key, value] of Object.entries(defaults)) {
      if (ls.getItem(key) === null) {
        ls.setItem(key, JSON.stringify(value))
        report.created.push(key)
      }
    }

    // 2) 书库版本升级：只补回内置书，保留 custom 书、briefs 与阅读记录
    const rawLibrary = ls.getItem(KEYS.library)
    if (rawLibrary) {
      try {
        const parsed = JSON.parse(rawLibrary) as Partial<LibraryState>
        if (parsed && typeof parsed === 'object' && (parsed.seedVersion ?? 0) < LIBRARY_SEED_VERSION) {
          const custom = Array.isArray(parsed.books)
            ? parsed.books.filter((b) => b && b.custom)
            : []
          const next: LibraryState = {
            seedVersion: LIBRARY_SEED_VERSION,
            books: [...BUILTIN_BOOKS, ...custom],
            briefs: parsed.briefs && typeof parsed.briefs === 'object' ? parsed.briefs : {},
          }
          ls.setItem(KEYS.library, JSON.stringify(next))
          report.reseededBooks = BUILTIN_BOOKS.length
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
          for (const [key, value] of Object.entries(LITERARY_SETTING_DEFAULTS)) {
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
    console.warn('[LinguaBuddy] 文学模块迁移被跳过（不影响原有数据）：', err)
    report.skipped = true
  }

  return report
}

/** 供测试与设置页诊断：只读取，不改动任何数据 */
export function inspectLiteraryMigration(): Record<string, boolean> {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  const out: Record<string, boolean> = {}
  for (const key of [KEYS.library, KEYS.readingProgress, KEYS.seminars, KEYS.literaryNotes]) {
    try { out[key] = window.localStorage.getItem(key) !== null } catch { out[key] = false }
  }
  return out
}

/** 清空全部数据时把四个新键一起纳入（供 store 调用，语义与 clearAllData 一致） */
export const LITERARY_KEYS: string[] = [
  KEYS.library, KEYS.readingProgress, KEYS.seminars, KEYS.literaryNotes,
]
