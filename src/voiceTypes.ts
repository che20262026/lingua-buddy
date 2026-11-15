/**
 * 音色偏好契约 + 等级 → 语言参数映射（levelProfile）
 *
 * 三条硬约束贯穿本文件：
 *   1. 音色列表只能来自浏览器真实的 speechSynthesis.getVoices()，绝不硬编码音色名称；
 *   2. 持久化用 voiceURI 而不是 name，避免同名音色冲突；
 *   3. 等级是一组具体语言参数（句数上限 / 句长 / 词汇范围 / 语用复杂度），
 *      而不是贴在 UI 上的一个标签 —— 它要真正进到 DialogueDirectorAgent 的输入里。
 */

import type { LevelCefr } from './levelTypes'

/* ---------------- 音色偏好 ---------------- */

/** 口音分组键；'system' = 跟随系统默认 */
export type VoiceAccentKey = 'en-US' | 'en-GB' | 'en-AU' | 'en-IN' | 'en-other' | 'system'

export interface VoiceGlobalSettings {
  /** 自动朗读 AI 回复；默认开启，可一键关闭并持久化 */
  autoRead: boolean
  /** 首选口音；'system' 表示跟随系统默认 */
  accent: VoiceAccentKey
  /** 具体音色的唯一标识（SpeechSynthesisVoice.voiceURI）；空 = 未指定 */
  voiceURI: string
  /** 语速 0.7 – 1.2 */
  rate: number
  /** 音高 0.8 – 1.2 */
  pitch: number
}

export interface CharacterVoiceBinding {
  /** 角色专属音色；空 = 沿用全局 */
  voiceURI: string
  /** 角色专属语速；空表示沿用全局 */
  rate: number
}

export interface VoicePreferences {
  global: VoiceGlobalSettings
  /** key 形如 "sceneId:characterId" */
  perCharacter: Record<string, CharacterVoiceBinding>
  lastUpdatedAt: string
}

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  global: {
    autoRead: true,
    accent: 'system',
    voiceURI: '',
    rate: 1,
    pitch: 1,
  },
  perCharacter: {},
  lastUpdatedAt: '',
}

/** 语速 / 音高的安全区间（面板滑块与归一化共用） */
export const RATE_MIN = 0.7
export const RATE_MAX = 1.2
export const PITCH_MIN = 0.8
export const PITCH_MAX = 1.2

/* ---------------- 设备音色（真实列表的最小投影） ---------------- */

/**
 * 只保留 UI 真正需要的字段，避免把 SpeechSynthesisVoice 原样塞进 state
 * （不同浏览器的 voiceURI 字段差异很大，转成自有结构更稳）。
 */
export interface VoiceInfo {
  voiceURI: string
  name: string
  lang: string
  default: boolean
}

/** 把浏览器的 SpeechSynthesisVoice 转成 VoiceInfo */
export function toVoiceInfo(v: {
  voiceURI?: string; name?: string; lang?: string; default?: boolean
}): VoiceInfo {
  return {
    voiceURI: v.voiceURI || v.name || '',
    name: v.name || v.voiceURI || '未命名音色',
    lang: v.lang || '',
    default: Boolean(v.default),
  }
}

/** 口音标签：只从 lang 推导，不猜音色名 */
export const ACCENT_LABELS: Record<VoiceAccentKey, string> = {
  'en-US': '美音',
  'en-GB': '英音',
  'en-AU': '澳音',
  'en-IN': '印度英语',
  'en-other': '其他英语口音',
  'system': '跟随系统默认',
}

/** 从 lang 推导口音分组键：en-US → 美音，en-GB → 英音 …… */
export function accentOf(lang: string): VoiceAccentKey {
  const l = (lang || '').replace('_', '-').toLowerCase()
  if (!l.startsWith('en')) return 'system'
  if (l === 'en-us') return 'en-US'
  if (l === 'en-gb') return 'en-GB'
  if (l === 'en-au') return 'en-AU'
  if (l === 'en-in') return 'en-IN'
  return 'en-other'
}

/** 展示用口音文案：无法归类时显示原始 lang */
export function accentLabel(lang: string): string {
  const key = accentOf(lang)
  if (key === 'system') return lang || '未知口音'
  return ACCENT_LABELS[key]
}

/** 是否是英语音色 */
export const isEnglishVoice = (v: VoiceInfo): boolean =>
  (v.lang || '').toLowerCase().replace('_', '-').startsWith('en')

/**
 * 性别只是「建议标签」：Web Speech API 根本不提供性别字段。
 * 这里只做非常保守的名字启发，UI 必须同时展示原始名称并注明「系统未提供，仅供参考」。
 */
const FEMALE_NAME_HINTS = ['samantha', 'karen', 'moira', 'tessa', 'fiona', 'victoria', 'zira', 'hazel', 'anna', 'susan', 'serena', 'allison']
const MALE_NAME_HINTS = ['daniel', 'alex', 'fred', 'thomas', 'rishi', 'oliver', 'david', 'mark', 'george', 'aaron', 'tom']

export function guessGenderHint(name: string): 'female' | 'male' | 'unknown' {
  const n = (name || '').toLowerCase()
  if (FEMALE_NAME_HINTS.some((h) => n.includes(h))) return 'female'
  if (MALE_NAME_HINTS.some((h) => n.includes(h))) return 'male'
  return 'unknown'
}

export const GENDER_HINT_LABEL: Record<'female' | 'male' | 'unknown', string> = {
  female: '女声（推断）',
  male: '男声（推断）',
  unknown: '',
}

/* ---------------- 音色解析与回退 ---------------- */

export interface VoiceResolution {
  /** 最终要用的 voiceURI（可能为空 = 不指定音色，由浏览器挑默认） */
  voiceURI: string
  /** 是否发生了回退（原来选的音色在当前设备不可用） */
  fellBack: boolean
  /** 回退提示文案 */
  message: string
}

/**
 * 应用启动 / 面板打开时校验 voiceURI 是否仍在当前设备可用。
 * 不可用则回退到「口音偏好下的第一个可用英语音色」，并给出明确提示。
 */
export function resolveVoiceURI(
  voiceURI: string,
  accent: VoiceAccentKey,
  voices: VoiceInfo[],
): VoiceResolution {
  const english = voices.filter(isEnglishVoice)
  const exact = voices.find((v) => v.voiceURI === voiceURI)
  if (voiceURI && exact) return { voiceURI, fellBack: false, message: '' }

  const pool = accent === 'system' || accent === 'en-other'
    ? english
    : english.filter((v) => accentOf(v.lang) === accent)
  const fallback = pool[0] || english[0]
  if (!voiceURI) return { voiceURI: fallback?.voiceURI || '', fellBack: false, message: '' }
  return {
    voiceURI: fallback?.voiceURI || '',
    fellBack: true,
    message: '之前的音色在当前设备不可用，已切换到可用音色。',
  }
}

/** 角色绑定键 */
export const characterVoiceKey = (sceneId: string, characterId: string): string =>
  `${sceneId}:${characterId}`

/**
 * 多角色场景的默认音色分配：音色数 ≥ 角色数时一人一个；
 * 不足时按顺序复用，并在 UI 上标注「与其他角色共用音色」。
 */
export function autoAssignVoices(
  sceneId: string,
  characterIds: string[],
  voices: VoiceInfo[],
  existing: Record<string, CharacterVoiceBinding>,
): Record<string, CharacterVoiceBinding> {
  const english = voices.filter(isEnglishVoice)
  const result: Record<string, CharacterVoiceBinding> = { ...existing }
  if (!english.length) return result
  characterIds.forEach((cid, i) => {
    const key = characterVoiceKey(sceneId, cid)
    if (result[key]?.voiceURI) return
    // 音色不足时按顺序复用（轮转），UI 会标注「与其他角色共用音色」
    const voice = english[i % english.length]
    if (!voice) return
    result[key] = { voiceURI: voice.voiceURI, rate: 0 }
  })
  return result
}

/** 该角色是否与其他角色共用音色 */
export function isSharedVoice(
  sceneId: string,
  characterId: string,
  perCharacter: Record<string, CharacterVoiceBinding>,
): boolean {
  const mine = perCharacter[characterVoiceKey(sceneId, characterId)]?.voiceURI
  if (!mine) return false
  const prefix = `${sceneId}:`
  const same = Object.entries(perCharacter)
    .filter(([k]) => k.startsWith(prefix))
    .filter(([, v]) => v.voiceURI === mine)
  return same.length > 1
}

/* ---------------- 等级 → 语言参数（levelProfile） ---------------- */

/**
 * 等级驱动的是内容参数，不是标签。
 * 这张表会直接进 DialogueDirectorAgent 的输入，约束 AI 回复的句数、句长与语用复杂度。
 */
export interface LevelProfile {
  level: LevelCefr
  /** 回复句数上限（硬约束） */
  maxSentences: number
  /** 回复句数下限 */
  minSentences: number
  /** 平均句长（词） */
  avgSentenceLength: number
  /** 词汇范围（最常用词数） */
  vocabRange: number
  /** 语用复杂度 */
  pragmaticComplexity: 'single' | 'combination' | 'negotiation' | 'implicit'
  /** 每轮目标词数量 */
  targetWordsPerTurn: number
  /** 特殊约束（一句话，直接进 prompt） */
  constraints: string
}

export const LEVEL_PROFILES: Record<LevelCefr, LevelProfile> = {
  A2: {
    level: 'A2',
    maxSentences: 2,
    minSentences: 1,
    avgSentenceLength: 12,
    vocabRange: 1500,
    pragmaticComplexity: 'single',
    targetWordsPerTurn: 1,
    constraints: '避免从句嵌套；每轮最多 1 个目标词；每轮超纲词不超过 2 个。',
  },
  B1: {
    level: 'B1',
    maxSentences: 3,
    minSentences: 1,
    avgSentenceLength: 18,
    vocabRange: 2500,
    pragmaticComplexity: 'combination',
    targetWordsPerTurn: 2,
    constraints: '可出现 1 个简单从句；每轮 1–2 个目标词；每轮超纲词不超过 2 个。',
  },
  B2: {
    level: 'B2',
    maxSentences: 3,
    minSentences: 2,
    avgSentenceLength: 25,
    vocabRange: 4000,
    pragmaticComplexity: 'negotiation',
    targetWordsPerTurn: 3,
    constraints: '可出现 1–2 个复合句；每轮 2–3 个目标词；每轮超纲词不超过 2 个。',
  },
  C1: {
    level: 'C1',
    maxSentences: 4,
    minSentences: 2,
    avgSentenceLength: 32,
    vocabRange: 6000,
    pragmaticComplexity: 'implicit',
    targetWordsPerTurn: 4,
    constraints: '允许语用隐含与地道表达；避免生僻专业词；目标词可放宽。',
  },
}

export const PRAGMATIC_COMPLEXITY_TEXT: Record<LevelProfile['pragmaticComplexity'], string> = {
  single: '单一交际功能（问候 / 请求 / 确认）',
  combination: '交际功能组合（表达观点 + 有限同意）',
  negotiation: '多轮协商、礼貌打断、间接异议',
  implicit: '语用隐含、讽刺、委婉、学术研讨',
}

export function buildLevelProfile(level: LevelCefr): LevelProfile {
  return LEVEL_PROFILES[level] ?? LEVEL_PROFILES.B1
}

/** 词汇范围是建议而非绝对过滤：专有名词与场景必需词可例外，但每轮超纲词不超过 2 个 */
export const VOCAB_SOFT_LIMIT = 'Vocabulary range is a guideline, not an absolute filter: proper nouns and scenario-required words may exceed it, but at most 2 out-of-range words per turn.'

/** 注入 Director prompt 的等级参数说明 */
export function levelProfilePrompt(p: LevelProfile): string {
  return [
    `Learner CEFR level=${p.level}.`,
    `Reply in ${p.minSentences}-${p.maxSentences} English sentences (HARD LIMIT: never exceed ${p.maxSentences} sentences), about ${p.avgSentenceLength} words each.`,
    `Vocabulary range: the most common ${p.vocabRange} words.`,
    `Pragmatic complexity: ${PRAGMATIC_COMPLEXITY_TEXT[p.pragmaticComplexity]}.`,
    `Use at most ${p.targetWordsPerTurn} target words per turn.`,
    p.constraints,
    VOCAB_SOFT_LIMIT,
    `Keep the character's personality and the scenario goal unchanged — only the language complexity changes.`,
  ].join(' ')
}

/* ---------------- 句子切分与等级硬约束 ---------------- */

/** 按句切分（供 TTS 依次朗读，句间短停顿）；不做逐词高亮 */
export function splitSentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'“])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 等级硬约束：把回复裁到等级允许的句数上限。
 * 远程 LLM 可能不守规矩 —— 这里是最后一道闸门，超长就截断，避免压缩用户开口空间。
 */
export function clampToLevel(text: string, profile: LevelProfile): string {
  const sentences = splitSentences(text)
  if (sentences.length <= profile.maxSentences) return text.trim()
  return sentences.slice(0, profile.maxSentences).join(' ').trim()
}

/** 是否需要按等级裁剪（供 UI / 测试判断） */
export const exceedsLevelLimit = (text: string, profile: LevelProfile): boolean =>
  splitSentences(text).length > profile.maxSentences

/**
 * 让「改写建议」匹配当前等级：
 *   - A2 / B1：句子太长时砍掉从句尾巴，保留主句，避免给低等级用户塞长难句；
 *   - B2 / C1：原样保留，不把高等级用户的改写降级成 A2 句式。
 */
export function fitCorrectionToLevel(text: string, profile: LevelProfile): string {
  const t = (text || '').trim()
  if (!t) return t
  if (profile.level === 'B2' || profile.level === 'C1') return t
  // 低等级：句子超过 1.5 倍平均句长就砍掉从句尾巴，只留主句
  const limit = profile.avgSentenceLength * 1.5
  return t
    .split(/(?<=[.!?])\s+/)
    .map((s) => {
      const words = s.split(/\s+/).filter(Boolean)
      if (words.length <= limit) return s
      const clause = s.match(/^(.*?),\s+(which|who|that|because|although|though|if|when|while|since|unless|so that)\b/i)
      if (clause) return `${clause[1].trim()}.`
      const comma = s.indexOf(',')
      if (comma > 0) return `${s.slice(0, comma).trim()}.`
      return s
    })
    .join(' ')
    .trim()
}
