/**
 * 音色偏好服务：归一化、增改、角色绑定
 *
 * 设计要点：
 *   - `lingua_voice_preferences` 是权威来源；`lingua_settings` 里的
 *     autoSpeak / accent / rate 与它保持一致（面板与设置页两处状态必须同步）。
 *   - 归一化只补缺不覆盖：老存档里已有的用户选择绝不丢失。
 *   - 归一化时校验 voiceURI 是否仍在当前设备可用，不可用则回退并给出提示。
 */

import type { PersistedData, Settings } from '../types'
import {
  DEFAULT_VOICE_PREFERENCES, PITCH_MAX, PITCH_MIN, RATE_MAX, RATE_MIN,
  accentOf, autoAssignVoices, characterVoiceKey, resolveVoiceURI,
  type CharacterVoiceBinding, type VoiceAccentKey, type VoiceGlobalSettings, type VoiceInfo, type VoicePreferences,
} from '../voiceTypes'

export const clampRate = (v: unknown, fallback = 1): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(n * 100) / 100))
}

export const clampPitch = (v: unknown, fallback = 1): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(PITCH_MAX, Math.max(PITCH_MIN, Math.round(n * 100) / 100))
}

const ACCENTS: VoiceAccentKey[] = ['en-US', 'en-GB', 'en-AU', 'en-IN', 'en-other', 'system']

/**
 * 归一化：补齐缺省字段 + 与 settings 对齐 + 校验音色可用性。
 * @param value 存档里读出来的原始值（可能为 null / 损坏）
 * @param settings 旧设置项，用于把老用户的 autoSpeak / accent / rate 接过来
 * @param voices 当前设备真实可用音色；为空表示还没加载或不支持
 */
export function normalizeVoicePreferences(
  value: Partial<VoicePreferences> | null | undefined,
  settings?: Partial<Pick<Settings, 'autoSpeak' | 'accent' | 'rate'>>,
  voices: VoiceInfo[] = [],
): { prefs: VoicePreferences; fallbackMessage: string } {
  const raw = (value ?? {}) as Partial<VoicePreferences>
  const rawGlobal = (raw.global ?? {}) as Partial<VoiceGlobalSettings>

  // 老用户：从 settings 继承自动朗读开关与语速；accent 只在仍是旧三档时映射
  const legacyAccentValue = settings?.accent
  const legacyAccent: VoiceAccentKey = legacyAccentValue === 'en-US'
    || legacyAccentValue === 'en-GB'
    || legacyAccentValue === 'en-AU'
    ? legacyAccentValue
    : 'system'

  const global: VoiceGlobalSettings = {
    autoRead: typeof rawGlobal.autoRead === 'boolean'
      ? rawGlobal.autoRead
      : typeof settings?.autoSpeak === 'boolean' ? settings.autoSpeak : DEFAULT_VOICE_PREFERENCES.global.autoRead,
    accent: ACCENTS.includes(rawGlobal.accent as VoiceAccentKey)
      ? (rawGlobal.accent as VoiceAccentKey)
      : legacyAccent,
    voiceURI: typeof rawGlobal.voiceURI === 'string' ? rawGlobal.voiceURI : '',
    rate: clampRate(rawGlobal.rate, settings ? clampRate(settings.rate, 1) : 1),
    pitch: clampPitch(rawGlobal.pitch, 1),
  }

  const perCharacter: Record<string, CharacterVoiceBinding> = {}
  const rawPer = (raw.perCharacter ?? {}) as Record<string, CharacterVoiceBinding>
  for (const [key, v] of Object.entries(rawPer)) {
    if (!v || typeof v !== 'object') continue
    perCharacter[key] = {
      voiceURI: typeof v.voiceURI === 'string' ? v.voiceURI : '',
      rate: typeof v.rate === 'number' ? clampRate(v.rate, 0) : 0,
    }
  }

  const resolution = resolveVoiceURI(global.voiceURI, global.accent, voices)
  if (resolution.fellBack) global.voiceURI = resolution.voiceURI

  return {
    prefs: {
      global,
      perCharacter,
      lastUpdatedAt: typeof raw.lastUpdatedAt === 'string' ? raw.lastUpdatedAt : '',
    },
    fallbackMessage: resolution.fellBack ? resolution.message : '',
  }
}

/** 修改全局设置，返回新对象 */
export function withGlobal(
  prefs: VoicePreferences,
  patch: Partial<VoiceGlobalSettings>,
): VoicePreferences {
  return {
    ...prefs,
    global: {
      ...prefs.global,
      ...patch,
      rate: patch.rate !== undefined ? clampRate(patch.rate, prefs.global.rate) : prefs.global.rate,
      pitch: patch.pitch !== undefined ? clampPitch(patch.pitch, prefs.global.pitch) : prefs.global.pitch,
    },
    lastUpdatedAt: new Date().toISOString(),
  }
}

/** 为某个角色绑定音色（空 voiceURI = 解除绑定） */
export function withCharacterVoice(
  prefs: VoicePreferences,
  sceneId: string,
  characterId: string,
  voiceURI: string,
  rate?: number,
): VoicePreferences {
  const key = characterVoiceKey(sceneId, characterId)
  const next = { ...prefs.perCharacter }
  if (!voiceURI) delete next[key]
  else next[key] = { voiceURI, rate: rate !== undefined ? clampRate(rate, 0) : next[key]?.rate ?? 0 }
  return { ...prefs, perCharacter: next, lastUpdatedAt: new Date().toISOString() }
}

/** 读取某个角色的有效音色（角色绑定优先于全局） */
export function voiceForCharacter(
  prefs: VoicePreferences,
  sceneId: string,
  characterId: string,
): { voiceURI: string; rate: number } {
  const binding = prefs.perCharacter[characterVoiceKey(sceneId, characterId)]
  if (binding?.voiceURI) {
    return { voiceURI: binding.voiceURI, rate: binding.rate > 0 ? binding.rate : prefs.global.rate }
  }
  return { voiceURI: prefs.global.voiceURI, rate: prefs.global.rate }
}

/** 把偏好同步到 settings（面板与设置页两处状态必须一致） */
export function syncSettings(prefs: VoicePreferences, settings: Settings): Settings {
  // 旧 settings.accent 只有三档，语义不变：更细的口音只留在新键里
  const legacyAccent = prefs.global.accent
  const accent = legacyAccent === 'en-US' || legacyAccent === 'en-GB' || legacyAccent === 'en-AU'
    ? legacyAccent
    : settings.accent
  return {
    ...settings,
    autoSpeak: prefs.global.autoRead,
    rate: prefs.global.rate,
    accent,
  }
}

/** 口音偏好 → 具体音色候选（不写死任何音色名） */
export function voicesForAccent(voices: VoiceInfo[], accent: VoiceAccentKey): VoiceInfo[] {
  const english = voices.filter((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('en'))
  if (accent === 'system') return english
  if (accent === 'en-other') {
    // 「其他英语口音」= 不是美/英/澳的那一批（含 en-IN 等）
    return english.filter((v) => {
      const k = accentOf(v.lang)
      return k === 'en-other' || k === 'en-IN'
    })
  }
  return english.filter((v) => accentOf(v.lang) === accent)
}

/** 按口音分组：英语优先，其余语言折叠在「其他语言」下 */
export function groupVoicesByAccent(voices: VoiceInfo[]): {
  english: VoiceInfo[]
  other: VoiceInfo[]
} {
  const english: VoiceInfo[] = []
  const other: VoiceInfo[] = []
  for (const v of voices) {
    if ((v.lang || '').toLowerCase().replace('_', '-').startsWith('en')) english.push(v)
    else other.push(v)
  }
  return { english, other }
}

/* ---------------- 写入 store（偏好键与 settings 原子同步） ---------------- */

export interface VoiceApp {
  data: PersistedData
  update: (recipe: (prev: PersistedData) => PersistedData) => void
  notify: (message: string) => void
}

/**
 * 原子写入：一次 recipe 同时更新 `lingua_voice_preferences` 与 `lingua_settings`，
 * 保证「对话页开关」与「设置页开关」两处状态永远一致。
 */
export function applyVoiceGlobal(app: VoiceApp, patch: Partial<VoiceGlobalSettings>): VoicePreferences {
  let next: VoicePreferences = app.data.voicePreferences
  app.update((prev) => {
    const prefs = withGlobal(prev.voicePreferences, patch)
    next = prefs
    return { ...prev, voicePreferences: prefs, settings: syncSettings(prefs, prev.settings) }
  })
  return next
}

/** 为角色绑定音色（持久化到 perCharacter；空 voiceURI = 解除绑定） */
export function applyCharacterVoice(
  app: VoiceApp,
  sceneId: string,
  characterId: string,
  voiceURI: string,
  rate?: number,
): VoicePreferences {
  let next: VoicePreferences = app.data.voicePreferences
  app.update((prev) => {
    const prefs = withCharacterVoice(prev.voicePreferences, sceneId, characterId, voiceURI, rate)
    next = prefs
    return { ...prev, voicePreferences: prefs, settings: syncSettings(prefs, prev.settings) }
  })
  return next
}

/** 自动朗读开关：对话页与设置页共用这一个写入点 */
export function applyAutoRead(app: VoiceApp, enabled: boolean): void {
  applyVoiceGlobal(app, { autoRead: enabled })
  app.notify(enabled
    ? '已开启自动朗读：AI 的英文回复会自动读出来 🔊'
    : '已关闭自动朗读：回复仍然以文字显示，随时可以手动朗读 🔇')
}

/**
 * 多角色场景的默认音色分配：音色足够时一人一个，不足时按顺序复用。
 * 只在角色还没有绑定音色时才写入，不覆盖用户的手动选择。
 */
export function applyAutoVoiceAssignment(
  app: VoiceApp,
  sceneId: string,
  characterIds: string[],
  voices: VoiceInfo[],
): number {
  let assigned = 0
  app.update((prev) => {
    const before = Object.keys(prev.voicePreferences.perCharacter).length
    const perCharacter = autoAssignVoices(sceneId, characterIds, voices, prev.voicePreferences.perCharacter)
    assigned = Object.keys(perCharacter).length - before
    return { ...prev, voicePreferences: { ...prev.voicePreferences, perCharacter } }
  })
  return assigned
}
