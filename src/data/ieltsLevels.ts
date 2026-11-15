import type { CEFR } from '../types'
import { clamp } from '../lib/utils'

/* ================================================================
 * 雅思口语（IELTS Speaking）Band 难度体系
 *
 * 参照官方四项评分维度设计：
 *   FC  Fluency and Coherence            流利度与连贯性
 *   LR  Lexical Resource                 词汇多样性
 *   GRA Grammatical Range and Accuracy  语法多样性与准确性
 *   PR  Pronunciation                   发音
 *
 * 六档难度把 Band 4.0–9.0 映射到 CEFR，并为三个 Agent 提供
 * 可直接消费的「对话生成参数」。所有文案为 LinguaBuddy 原创表述。
 * ================================================================ */

export type IeltsLevelId = 'b4' | 'b5' | 'b6' | 'b7' | 'b8' | 'b9'
export type IeltsDimensionKey = 'fc' | 'lr' | 'gra' | 'pr'
export type CorrectionMode = 'gentle' | 'balanced' | 'detailed'

export const IELTS_DIMENSIONS: Array<{
  key: IeltsDimensionKey
  en: string
  zh: string
  desc: string
  emblem: string
}> = [
  { key: 'fc', en: 'Fluency & Coherence', zh: '流利度与连贯性', desc: '能否持续说下去，句子之间是否自然衔接', emblem: '🫧' },
  { key: 'lr', en: 'Lexical Resource', zh: '词汇多样性', desc: '用词是否丰富、精准，能否改述和换词', emblem: '📚' },
  { key: 'gra', en: 'Grammatical Range & Accuracy', zh: '语法多样性与准确性', desc: '句式是否多样，多数句子是否无误', emblem: '🧩' },
  { key: 'pr', en: 'Pronunciation', zh: '发音', desc: '重音、语调、节奏是否帮助听者理解', emblem: '🎙️' },
]

export interface IeltsDialogueProfile {
  /** AI 单条回复句数上限（1-3 句） */
  sentences: number
  /** 单句目标词数，用于提示与反馈的「长度期待」 */
  wordsPerSentence: number
  /** 用户单轮建议发言长度（词） */
  userTargetLength: number
  /** 是否使用衔接词 / 从句 */
  useConnectors: boolean
  /** 是否自然带出习语与地道搭配 */
  useIdioms: boolean
  /** 是否使用复合句、条件句、被动等多样结构 */
  useComplexStructures: boolean
  /** 每轮建议主动使用的目标词数量 */
  targetWordsPerRound: number
  /** 该档建议对话轮次 */
  rounds: number
  /** 默认纠错强度 */
  correction: CorrectionMode
}

export interface IeltsLevel {
  id: IeltsLevelId
  /** 区间展示，如 4.0–4.5 */
  band: string
  /** 区间代表分，用于计算与展示 */
  bandValue: number
  name: string
  tagline: string
  cefr: CEFR
  emblem: string
  tint: string
  summary: string
  dimensions: Record<IeltsDimensionKey, string>
  canDo: string[]
  focus: string[]
  /** 一档之差的表达示范：让「升级」看得见 */
  upgrade: { from: string; to: string; note: string }
  dialogue: IeltsDialogueProfile
  /** 高段位挑战的 XP 系数 */
  xpMultiplier: number
  nextTip: string
}

export const IELTS_LEVELS: IeltsLevel[] = [
  {
    id: 'b4', band: '4.0–4.5', bandValue: 4.5, name: '破冰起步', tagline: '先把话说完整',
    cefr: 'A2', emblem: '🌱', tint: 'from-mint-100 to-brand-50',
    summary: '能就熟悉话题说短句，常需停顿找词；语法错误较多，但基本意思可以传达。这一档的目标不是漂亮，而是敢说、说完整。',
    dimensions: {
      fc: '说出 1–2 句完整话，允许停顿；会用 and / but 把两个短句接起来',
      lr: '掌握高频日常词，能说出物品、动作与简单感受',
      gra: '一般现在时、一般过去时；冠词与单复数错误属正常范围',
      pr: '单词清晰可辨即可，暂不追求连读与语调',
    },
    canDo: ['回答姓名、爱好、日常作息等熟悉问题', '用 3–5 词短句表达想要什么', '听懂放慢、重复之后的提问'],
    focus: ['先保证主谓宾齐全', '用 "Let me think…" 争取思考时间', '不要为了难词牺牲清晰度'],
    upgrade: { from: 'I very like apple.', to: 'I like apples a lot.', note: 'avoid "very + 动词"，改用句末程度表达（Band 5 常见要求）' },
    dialogue: {
      sentences: 1, wordsPerSentence: 8, userTargetLength: 5,
      useConnectors: false, useIdioms: false, useComplexStructures: false,
      targetWordsPerRound: 1, rounds: 4, correction: 'gentle',
    },
    xpMultiplier: 0.9,
    nextTip: '下一档的关键：把两句短句用 because / so 连成一段。',
  },
  {
    id: 'b5', band: '5.0–5.5', bandValue: 5.5, name: '稳步表达', tagline: '把句子连成段',
    cefr: 'B1', emblem: '🧭', tint: 'from-brand-100 to-mint-100',
    summary: '能描述经历、给出简单理由，但表达偏简单、容易重复同一个词；开始需要更明确的连接与基本同义替换。',
    dimensions: {
      fc: '连说 2–3 句，用 because / so / then 建立简单逻辑',
      lr: '话题相关词汇 + 简单同义替换，减少 very / good 的反复使用',
      gra: '过去时与将来时、比较级、there be；多数简单句无误',
      pr: '句子重音基本到位，听者无需反复确认',
    },
    canDo: ['按顺序讲一件发生过的事', '说明「喜欢 / 不喜欢」并给一个理由', '用简单句确认与追问信息'],
    focus: ['每轮至少用一个连接词', '把 very good 换成更具体的形容词', '主动用上 1 个目标词'],
    upgrade: { from: 'The market is very good. I like it.', to: 'The market is lively, and the apples are really fresh.', note: '用具体形容词 + 连接词替换空泛评价（Band 6 的分水岭）' },
    dialogue: {
      sentences: 2, wordsPerSentence: 11, userTargetLength: 8,
      useConnectors: true, useIdioms: false, useComplexStructures: false,
      targetWordsPerRound: 1, rounds: 5, correction: 'balanced',
    },
    xpMultiplier: 1.0,
    nextTip: '下一档的关键：能改述（paraphrase），卡壳时换一种说法而不是停下来。',
  },
  {
    id: 'b6', band: '6.0–6.5', bandValue: 6.5, name: '从容交流', tagline: '展开、举例、改述',
    cefr: 'B2', emblem: '🌊', tint: 'from-brand-100 to-coral-100',
    summary: '就熟悉话题能较详细地展开，愿意尝试复杂句；偶有错误或自我修正，但不影响理解。这是多数考生的目标档。',
    dimensions: {
      fc: '连续说 3–4 句，能举例、自然衔接，停顿不打断意思',
      lr: '使用话题相关搭配与少量 less common words，会改述绕开不会的词',
      gra: '简单句与从句混用，尝试条件句 / 被动，多数句子无误',
      pr: '语调随意思变化，常见词组能连读',
    },
    canDo: ['就一个话题给出观点 + 一个例子', '卡壳时换一种说法继续说', '听懂并回应追问与反问'],
    focus: ['每轮补一个细节或例子', '主动使用 2 个目标词', '试着用从句把两句合并'],
    upgrade: { from: 'I think it is good because it is fresh.', to: 'What I like most is that the produce is fresh, which makes a simple salad taste much better.', note: '用名词性从句 + 非限定定语从句拉长信息密度（Band 7 常见特征）' },
    dialogue: {
      sentences: 2, wordsPerSentence: 14, userTargetLength: 12,
      useConnectors: true, useIdioms: false, useComplexStructures: true,
      targetWordsPerRound: 2, rounds: 6, correction: 'balanced',
    },
    xpMultiplier: 1.15,
    nextTip: '下一档的关键：灵活的词汇搭配与习语，且用得自然不生硬。',
  },
  {
    id: 'b7', band: '7.0–7.5', bandValue: 7.5, name: '灵活论述', tagline: '有立场、有层次',
    cefr: 'C1', emblem: '🪁', tint: 'from-coral-100 to-sun-100',
    summary: '能自然展开论述、调整立场，词汇精准且带地道搭配；语法结构多样，大多数句子完全无误。',
    dimensions: {
      fc: '成段表达仍连贯，能自然过渡与收束，不依赖长停顿',
      lr: '精准用词、固定搭配与习语，能灵活改述而不重复',
      gra: '条件句、被动、从句、强调结构交替使用，错误零星',
      pr: '节奏与重音服务于意思，听感轻松',
    },
    canDo: ['对比两种观点并给出倾向', '用习语或搭配自然收尾', '被追问时补充一层论证'],
    focus: ['每轮用上一个地道搭配', '给出观点 + 依据 + 让步', '保持句间衔接词不重复'],
    upgrade: { from: 'I think this is a very good idea and I agree.', to: 'I\'d go along with that, though I\'d probably weigh the cost first.', note: '用立场短语 + 让步结构表达「有保留的同意」（Band 8 的语用层次）' },
    dialogue: {
      sentences: 3, wordsPerSentence: 17, userTargetLength: 16,
      useConnectors: true, useIdioms: true, useComplexStructures: true,
      targetWordsPerRound: 2, rounds: 6, correction: 'detailed',
    },
    xpMultiplier: 1.3,
    nextTip: '下一档的关键：几乎不出现重复与生硬表达，能微妙地调整语气。',
  },
  {
    id: 'b8', band: '8.0–8.5', bandValue: 8.5, name: '地道自如', tagline: '细微之处见功夫',
    cefr: 'C1', emblem: '🦅', tint: 'from-sun-100 to-coral-100',
    summary: '长段表达始终连贯，用词地道精准，语法几乎无误；能根据场合微调语气、立场与信息密度。',
    dimensions: {
      fc: '长段论述层次清晰，话题转换自然，几乎无自我修正',
      lr: '语义精准、搭配地道，罕见词用得恰当而不炫技',
      gra: '结构丰富、几乎无误，偶尔的复杂结构也稳定',
      pr: '接近母语者的节奏、弱读与语调',
    },
    canDo: ['就抽象话题展开多层次论述', '用微妙措辞表达保留或反讽', '长时间发言仍保持连贯'],
    focus: ['避免任何重复套话', '用语气词与让步体现语用意识', '主动覆盖 3 个目标词'],
    upgrade: { from: 'It is a good plan, but it may be expensive.', to: 'It\'s a sound plan in principle — the only reservation I\'d have is the cost.', note: '名词化 + 插入式保留，信息更凝练（Band 9 的自然度）' },
    dialogue: {
      sentences: 3, wordsPerSentence: 20, userTargetLength: 20,
      useConnectors: true, useIdioms: true, useComplexStructures: true,
      targetWordsPerRound: 3, rounds: 7, correction: 'detailed',
    },
    xpMultiplier: 1.5,
    nextTip: '下一档的关键：完全轻松、毫无准备痕迹，与受过教育的母语者无异。',
  },
  {
    id: 'b9', band: '9.0', bandValue: 9.0, name: '近母语', tagline: '毫无准备痕迹',
    cefr: 'C1', emblem: '✨', tint: 'from-brand-200 to-mint-100',
    summary: '表达完全自然、轻松，词汇与结构信手拈来且始终精准；四项维度均接近受过教育的母语者水平。',
    dimensions: {
      fc: '任何长度的表达都自然连贯，无搜寻词句的痕迹',
      lr: '用词精确到位，语域与搭配完全得体',
      gra: '结构完全自如，几乎不出现错误',
      pr: '节奏、弱读、语调完全服务于意思',
    },
    canDo: ['就任意话题即时展开且保持自然', '灵活切换正式与随意语域', '理解并自然回应言外之意'],
    focus: ['保持自然度而非堆砌难度', '在快节奏追问下仍稳定', '把目标词用得毫不刻意'],
    upgrade: { from: 'I would say it is quite a sensible decision.', to: 'It makes perfect sense, doesn\'t it?', note: '高阶的标志不是更长，而是更省力、更贴语境' },
    dialogue: {
      sentences: 3, wordsPerSentence: 22, userTargetLength: 24,
      useConnectors: true, useIdioms: true, useComplexStructures: true,
      targetWordsPerRound: 3, rounds: 8, correction: 'detailed',
    },
    xpMultiplier: 1.7,
    nextTip: '已到顶档，接下来靠真实语境与广泛输入保持手感。',
  },
]

export const DEFAULT_IELTS_LEVEL: IeltsLevelId = 'b5'

export function getIeltsLevel(id: IeltsLevelId | undefined | null): IeltsLevel {
  return IELTS_LEVELS.find((l) => l.id === id) || IELTS_LEVELS.find((l) => l.id === DEFAULT_IELTS_LEVEL)!
}

/** CEFR → 最接近的雅思档（用于旧的难度选择反向联动） */
export function ieltsLevelByCefr(cefr: CEFR): IeltsLevel {
  const map: Record<CEFR, IeltsLevelId> = { A1: 'b4', A2: 'b4', B1: 'b5', B2: 'b6', C1: 'b7' }
  return getIeltsLevel(map[cefr] || 'b5')
}

/** 文本难度估计 → 该文本适合练习的 Band 代表分 */
export function ieltsBandFromCefr(cefr: CEFR): number {
  const map: Record<CEFR, number> = { A1: 4.0, A2: 4.5, B1: 5.5, B2: 6.5, C1: 7.5 }
  return map[cefr] ?? 5.5
}

export function ieltsLevelByBand(band: number): IeltsLevel {
  if (band < 5) return getIeltsLevel('b4')
  if (band < 6) return getIeltsLevel('b5')
  if (band < 7) return getIeltsLevel('b6')
  if (band < 8) return getIeltsLevel('b7')
  if (band < 9) return getIeltsLevel('b8')
  return getIeltsLevel('b9')
}

export function nextIeltsLevel(level: IeltsLevel): IeltsLevel | null {
  const idx = IELTS_LEVELS.findIndex((l) => l.id === level.id)
  return idx >= 0 && idx < IELTS_LEVELS.length - 1 ? IELTS_LEVELS[idx + 1] : null
}

/** 把 4.0–9.0 的连续分规范到 0.5 步进 */
export function normalizeBand(value: number): number {
  return clamp(Math.round(value * 2) / 2, 4, 9)
}

/** 当前 Band 在 4→9 量程上的百分比，用于进度条 */
export function bandProgress(band: number): number {
  return clamp((band - 4) / 5, 0, 1)
}

export interface IeltsPerformance {
  mastery: number
  coverage: number
  accuracy: number
  turns: number
  avgSentenceLength: number
  distinctWordRatio: number
  /** 官方发音维度无法由文本评估，标记为由其它维度推算的参考值 */
  pronunciationIsEstimate?: boolean
}

/** 依据一场对话的表现，给出四维度练习参考分（非官方评分） */
export function assessIeltsDimensions(p: IeltsPerformance): Record<IeltsDimensionKey, number> {
  const base = 4 + (clamp(p.mastery, 0, 100) / 100) * 4.5
  const fluency = base + clamp((p.avgSentenceLength - 6) / 10, -0.5, 0.8) + clamp(p.turns / 12, 0, 0.4)
  const lexical = base + (p.coverage - 0.5) * 1.1 + (p.distinctWordRatio - 0.5) * 0.8
  const grammar = base + (p.accuracy - 0.6) * 1.6
  const pronunciation = base * 0.9 + 0.5 // 文本无法评估发音，给出保守参考值
  return {
    fc: normalizeBand(fluency),
    lr: normalizeBand(lexical),
    gra: normalizeBand(grammar),
    pr: normalizeBand(pronunciation),
  }
}

/** 升级建议：优先提示与下一档差距最大的维度 */
export function ieltsUpgradeAdvice(
  dimensions: Record<IeltsDimensionKey, number>,
  target: IeltsLevel,
  opts?: { voiceMeasured?: boolean },
): string[] {
  const sorted = IELTS_DIMENSIONS
    .map((d) => ({ ...d, score: dimensions[d.key] }))
    .sort((a, b) => a.score - b.score)
  const weakest = sorted[0]
  const second = sorted[1]
  return [
    `当前最值得投入的是「${weakest.zh}」：${target.dimensions[weakest.key]}`,
    `第二优先「${second.zh}」：${target.dimensions[second.key]}`,
    `按 ${target.band} 档要求练习：${target.nextTip}`,
    opts?.voiceMeasured
      ? '发音维度已结合录音的语速、停顿与语调；音素准确度仍需真人或专业评测确认。'
      : '本场没有可用的真实录音，发音维度是文本推算的占位值；点「发音评测」录一段即可实测。',
  ]
}
