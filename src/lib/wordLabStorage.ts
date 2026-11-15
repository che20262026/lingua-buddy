/**
 * Word Lab 存储接线：6 个新键的默认值 + 幂等迁移
 *
 * 键清单（第 18-23 个键）：
 * - lingua_word_progress      词场进度（艾宾浩斯阶梯 + SM-2）
 * - lingua_word_session_draft 会话草稿（中断续学）
 * - lingua_word_daily_quota   每日新词限流
 * - lingua_word_errors        易错本
 * - lingua_word_media_cache   媒体缓存
 * - lingua_deck_selection     词库选择
 *
 * [S2.5 新增] 第 24 个键：
 * - lingua_pronunciation_flags 发音漏读记录（与拼写易错本隔离）
 */

import type {
  DeckSelectionState, PronunciationFlagsState, WordDailyQuota, WordError, WordMediaCacheState,
  WordProgressState, WordSessionDraft,
} from '../wordLabTypes'
import {
  DEFAULT_DAILY_LIMIT, DEFAULT_DECK_SELECTION, DEFAULT_PRONUNCIATION_FLAGS, DEFAULT_WORD_PROGRESS,
} from '../wordLabTypes'

/** 与 storage.todayKey 同格式（YYYY-MM-DD）；本地实现避免与 storage.ts 循环引用 */
const todayKeyLocal = (d = new Date()): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const WORD_LAB_DEFAULTS = {
  wordProgress: (): WordProgressState => structuredClone(DEFAULT_WORD_PROGRESS),
  wordSessionDraft: (): WordSessionDraft | null => null,
  wordDailyQuota: (): WordDailyQuota => ({
    date: todayKeyLocal(),
    newWordsLearned: 0,
    limit: DEFAULT_DAILY_LIMIT,
  }),
  wordErrors: (): WordError[] => [],
  wordMediaCache: (): WordMediaCacheState => ({}),
  deckSelection: (): DeckSelectionState => structuredClone(DEFAULT_DECK_SELECTION),
  /** [S2.5 新增] 第 24 个键 */
  pronunciationFlags: (): PronunciationFlagsState => structuredClone(DEFAULT_PRONUNCIATION_FLAGS),
}

/**
 * 幂等迁移：只补缺、不覆盖已有内容；单键损坏回退默认。
 * （storage.loadData 对「对象键」已做浅合并、数组键直接替换，这里处理跨天与上限钳制）
 */
export function migrateWordLabData(): void {
  if (typeof window === 'undefined' || !window.localStorage) return

  // 每日限流：跨天重置，limit 钳制到 [10, 15]
  try {
    const raw = window.localStorage.getItem('lingua_word_daily_quota')
    if (raw) {
      const quota = JSON.parse(raw) as WordDailyQuota
      if (quota.date !== todayKeyLocal()) {
        window.localStorage.setItem('lingua_word_daily_quota', JSON.stringify({
          date: todayKeyLocal(), newWordsLearned: 0, limit: quota.limit,
        }))
      }
    }
  } catch { /* 损坏则交给 loadData 的 safeParse 回退 */ }

  // 媒体缓存：超过 300 条裁掉最旧的（缓存性质，可随时重建）
  try {
    const raw = window.localStorage.getItem('lingua_word_media_cache')
    if (raw) {
      const cache = JSON.parse(raw) as WordMediaCacheState
      const keys = Object.keys(cache)
      if (keys.length > 300) {
        const sorted = keys.sort((a, b) => (cache[a].cachedAt || 0) - (cache[b].cachedAt || 0))
        const drop = new Set(sorted.slice(0, keys.length - 300))
        const next: WordMediaCacheState = {}
        for (const k of keys) if (!drop.has(k)) next[k] = cache[k]
        window.localStorage.setItem('lingua_word_media_cache', JSON.stringify(next))
      }
    }
  } catch { /* 同上 */ }

  /* ---------------- [S2.5 新增] 幂等迁移：只补缺、不覆盖 ---------------- */

  // 1) 第 24 个键不存在时播种；已存在但缺字段时浅补齐，旧数据一字不改
  try {
    const raw = window.localStorage.getItem('lingua_pronunciation_flags')
    if (!raw) {
      window.localStorage.setItem('lingua_pronunciation_flags',
        JSON.stringify(structuredClone(DEFAULT_PRONUNCIATION_FLAGS)))
    } else {
      const flags = JSON.parse(raw) as Partial<PronunciationFlagsState>
      const patched: PronunciationFlagsState = {
        words: flags.words ?? {},
        lastMissedWords: Array.isArray(flags.lastMissedWords) ? flags.lastMissedWords : [],
        version: 1,
      }
      if (JSON.stringify(flags) !== JSON.stringify(patched)) {
        window.localStorage.setItem('lingua_pronunciation_flags', JSON.stringify(patched))
      }
    }
  } catch {
    // 键内容损坏：直接重建为空，不抛错、不影响 loadData 的其它键
    try {
      window.localStorage.setItem('lingua_pronunciation_flags',
        JSON.stringify(structuredClone(DEFAULT_PRONUNCIATION_FLAGS)))
    } catch { /* 存储不可用时静默跳过 */ }
  }

  // 2) 旧版 lingua_word_progress 里的词条补 3 个可选字段；已有值一律保留
  //    注意：不会新建任何词条，因此 S4 结算的新词额度统计完全不受影响。
  try {
    const raw = window.localStorage.getItem('lingua_word_progress')
    if (raw) {
      const state = JSON.parse(raw) as WordProgressState
      if (state && typeof state.words === 'object' && state.words) {
        let changed = false
        for (const word of Object.keys(state.words)) {
          const p = state.words[word]
          if (!p) continue
          if (p.pronunciationAttempts === undefined) { p.pronunciationAttempts = 0; changed = true }
          if (p.pronunciationSkipped === undefined) { p.pronunciationSkipped = false; changed = true }
        }
        if (changed) window.localStorage.setItem('lingua_word_progress', JSON.stringify(state))
      }
    }
  } catch { /* 损坏则交给 loadData 的 safeParse 回退 */ }
}
