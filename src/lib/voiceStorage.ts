/**
 * 对话语音层的幂等迁移（第 31 键）
 *
 * 目标：
 *   - 老存档里没有 `lingua_voice_preferences` 时，从旧 settings（autoSpeak / accent / rate）接过来，
 *     用户在设置页早就开好的「自动朗读」不会因为升级而失效；
 *   - 已经存在的用户选择绝不覆盖，只补缺字段；
 *   - 不动任何旧键的语义。
 */

import { KEYS } from './storage'
import { DEFAULT_VOICE_PREFERENCES } from '../voiceTypes'
import { normalizeVoicePreferences } from '../services/voicePreferences'
import type { Settings } from '../types'

function readJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed == null ? null : (parsed as T)
  } catch {
    return null
  }
}

/** 旧 settings 里只有三档口音；其余一律按「跟随系统默认」处理 */
function legacyAccentOf(value: unknown): Settings['accent'] {
  const v = String(value ?? '')
  return v === 'en-GB' || v === 'en-AU' ? v : 'en-US'
}

/**
 * 幂等迁移：把音色偏好与旧 settings 对齐。
 * 迁移结果直接写回 localStorage，store 随后由 loadData() 读入。
 */
export function migrateVoiceData(): void {
  if (typeof localStorage === 'undefined') return
  const raw = readJson<Record<string, unknown>>(KEYS.voicePreferences)
  const settings = readJson<{ autoSpeak?: boolean; accent?: unknown; rate?: number }>(KEYS.settings)

  const { prefs } = normalizeVoicePreferences(
    (raw ?? undefined) as never,
    {
      autoSpeak: typeof settings?.autoSpeak === 'boolean' ? settings.autoSpeak : undefined,
      accent: settings ? legacyAccentOf(settings.accent) : undefined,
      rate: typeof settings?.rate === 'number' ? settings.rate : undefined,
    },
    [],
  )

  // 只有内容真的变了才写回，避免每次启动都动 localStorage
  const before = JSON.stringify(raw ?? null)
  const after = JSON.stringify(prefs)
  if (before === after) return
  try {
    localStorage.setItem(KEYS.voicePreferences, after)
  } catch { /* 存储不可用时静默降级 */ }
}

/** 首次启动时没有该键 → 写入一份默认值（storage 的 DEFAULT_DATA 已有一份，这里只做兜底） */
export function ensureVoiceDefaults(): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (localStorage.getItem(KEYS.voicePreferences) === null) {
      localStorage.setItem(KEYS.voicePreferences, JSON.stringify(DEFAULT_VOICE_PREFERENCES))
    }
  } catch { /* 忽略 */ }
}
