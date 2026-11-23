/**
 * Word Lab（词场）类型契约 —— 第四个学习模式
 *
 * 版权与来源约束（详见 README 第十六章）：
 * - 词表本身是考试大纲的事实性词频清单（不具独创性，可自由整理）
 * - 释义参考 ECDICT（MIT License）的中文释义风格，均自行改写
 * - 例句为自建模板句或参考 Tatoeba（CC BY 2.0 FR）句式改写
 * - 配图使用 Pexels / Pixabay（免授权费）或本地 SVG / emoji 兜底，不内嵌第三方图片字节
 * - 发音使用浏览器 speechSynthesis，零网络、零密钥
 */

import type { CEFR } from './types'
import { pronunciationTipFor } from './data/wordDecks/pronunciationTips'

/* ---------------- 词库（Deck） ---------------- */

/** 7 个分级词库；id 与考试大纲对应，词表为事实性清单 */
export type DeckId =
  | 'junior_3500'   // 初中 3500
  | 'senior_5000'   // 高中 5000
  | 'cet4'          // 大学英语四级
  | 'cet6'          // 大学英语六级
  | 'ielts_55'      // 雅思 5.5
  | 'ielts_65'      // 雅思 6.5
  | 'ielts_75'      // 雅思 7.5
  /** [China Learner Track] 两个场景词包：复用同一套五步闭环，只是内容层不同 */
  | 'chinglish_fix' // 轨道 D 中式英语纠偏词包
  | 'speaking_core' // 轨道 C 开口核心表达词包
  /** [多语言] 俄语分级词库：沿用同一套五步闭环，语言标记为 ru */
  | 'ru_a1'         // 俄语 ТРКИ A1（CEFR A1）
  | 'ru_a2'         // 俄语 ТРКИ A2（CEFR A2）

export interface DeckMeta {
  id: DeckId
  name: string
  subtitle: string
  cefr: CEFR
  /** 分片大小上限：每片 300-500 词（种子阶段每库一个分片） */
  shardSize: number
  emblem: string
  tint: string
  /** [China Learner Track] 场景词包标记；旧 7 个分级词库无此字段，语义不变 */
  source?: 'china_track'
  /** [多语言] 词库所属语言；缺省 = en（旧词库语义不变） */
  language?: 'en' | 'ru'
}

/** 单词条目。meaningZh ≤ 20 字；imageQuery 是场景描述、不含中文释义 */
export interface WordEntry {
  word: string
  phonetic: string
  pos: string
  /** 中文释义，≤20 字 */
  meaningZh: string
  meaningEn: string
  tags: string[]
  cefr: CEFR
  examples: string[]
  /** 配图检索用场景描述（英文，不含中文释义），供 WordMediaAgent 使用 */
  imageQuery: string
  /** 可选真实图片 URL（Pexels / Pixabay）；空串 = SVG / emoji 兜底 */
  imageUrl: string
  /** 图片英文替代描述，不含中文释义 */
  imageAlt: string
  collocations: string[]
  /** [S2.5 新增] 静态发音小提示（重音 / 易混音）；无则不显示，绝不基于识别结果生成 */
  pronunciationTip?: string
  /** [多语言] 词条语言；缺省 = en（旧词库语义不变，零迁移） */
  language?: 'en' | 'ru'
  /** [多语言·俄语] 带重音的西里尔写法（如 вóда）；word 字段存非重音形式以保证 findWord 命中 */
  wordAccented?: string
  /** [多语言·俄语] 词性：阳性 / 阴性 / 中性（俄语特有，英语词条无此字段） */
  gender?: '阳性' | '阴性' | '中性'
  /** [多语言·俄语] 分级：ТРКИ / CEFR 标签（A1、A2…）；英语词条沿用 cefr */
  level?: string
  /** [多语言·俄语] 名词六格变格（只有名词带此字段；动词/形容词/英语词条无） */
  cases?: RussianCases
}

/**
 * [多语言·俄语] 名词六格变格。字段值均为带重音的西里尔写法。
 * 顺序固定为主→属→与→宾→工→前，供 S2 验证阶段的变格卡片按序呈现。
 */
export interface RussianCases {
  /** 主格 именительный */
  nom: string
  /** 属格 родительный */
  gen: string
  /** 与格 дательный */
  dat: string
  /** 宾格 винительный */
  acc: string
  /** 工具格 творительный */
  ins: string
  /** 前置格 предложный */
  pre: string
}

/** 紧凑元组 → WordEntry 的构造器，种子文件用它压缩体积 */
export type WordTuple = [
  word: string, phonetic: string, pos: string, meaningZh: string, meaningEn: string,
  cefr: CEFR, examples: string[], imageQuery: string, imageAlt: string, collocations: string[],
]

export function makeWord(deck: DeckId, tuple: WordTuple, tags: string[] = []): WordEntry {
  const [word, phonetic, pos, meaningZh, meaningEn, cefr, examples, imageQuery, imageAlt, collocations] = tuple
  const tip = pronunciationTipFor(word)
  return {
    word, phonetic, pos, meaningZh, meaningEn, cefr, examples, imageQuery, imageAlt, collocations,
    tags: [deck, ...tags],
    // 种子阶段不内嵌任何第三方图片字节：imageUrl 留空 → WordMediaAgent 走 SVG/emoji 兜底
    imageUrl: '',
    // [S2.5 新增] 只有词库登记过的词才带静态发音提示
    ...(tip ? { pronunciationTip: tip } : {}),
  }
}

/* ---------------- S2.5 跟读朗读 ---------------- */

/**
 * 一次跟读的留档结果。
 * 注意：mode='selfReported' 时 coverage 固定为 null 语义（用 0 存储但 UI 不展示），
 * 绝不把「我读完了」包装成识别成功；mock 模式结果在 UI 上必须带「演示模式」角标。
 */
export interface PronunciationResult {
  /** 覆盖率 0–1，仅内部用于判断文案；UI 只呈现「读到了 X/Y 个词」 */
  coverage: number
  /** 未识别到的词 */
  missedWords: string[]
  mode: 'recognized' | 'selfReported' | 'mock'
  /** ISO 时间 */
  at: string
}

/** S2.5 一场跟读的完成信息（组件 → WordSession → 结算合并） */
export interface PronunciationCompletion {
  word: string
  skipped: boolean
  attempts: number
  /** 自评跟读与跳过都没有识别结果 */
  lastResult?: PronunciationResult
  /** 最近一次有效识别的漏词，用于「连续两次漏读」判定 */
  missedWords: string[]
}

/** lingua_pronunciation_flags 的单条记录：连续两次漏读同一词才留下 */
export interface PronunciationFlag {
  word: string
  missedCount: number
  /** ISO 时间 */
  lastMissedAt: string
  note: string
}

/** 第 24 个键：只记录发音漏读，不进拼写易错本 lingua_word_errors */
export interface PronunciationFlagsState {
  words: Record<string, PronunciationFlag>
  /** 最近一次有效识别的漏词列表，用于判定「连续两次」 */
  lastMissedWords: string[]
  version: number
}

export const DEFAULT_PRONUNCIATION_FLAGS: PronunciationFlagsState = {
  words: {}, lastMissedWords: [], version: 1,
}

/* ---------------- 学习进度（lingua_word_progress） ---------------- */

/** 新词进入艾宾浩斯阶梯，毕业后并入现有 SM-2 队列 */
export type WordStatus = 'new' | 'ladder' | 'sm2' | 'mastered'

/** 生词来源：词场会话学的 / 阅读中生词 / 视频观后生词；后两者不计当日新词上限 */
export type WordOrigin = 'wordlab' | 'reading' | 'video'

export interface WordProgress {
  word: string
  deckId: DeckId
  origin: WordOrigin
  status: WordStatus
  /** 艾宾浩斯阶梯当前级（0-5）；6 = 已毕业转 SM-2 */
  ladderStep: number
  /** SM-2 等级；毕业前为 -1 */
  sm2Level: number
  dueAt: number
  firstLearnedAt: number
  lastReviewedAt?: number
  reviewCount: number
  errorCount: number
  correctStreak: number
  /** [S2.5 新增] 有效跟读尝试次数（旧存档缺字段视为 0） */
  pronunciationAttempts?: number
  /** [S2.5 新增] 跳过跟读：不扣 XP、不阻塞 S3，复习时可再次出现 */
  pronunciationSkipped?: boolean
  pronunciationLastResult?: PronunciationResult
  /** [多语言] 排程词条所属语言；缺省 = en（旧存档零迁移，复习页据此选字形与发音） */
  language?: 'en' | 'ru'
}

export interface WordProgressState {
  /** key = word 小写 */
  words: Record<string, WordProgress>
  version: number
}

export const DEFAULT_WORD_PROGRESS: WordProgressState = { words: {}, version: 1 }

/* ---------------- 会话草稿（lingua_word_session_draft） ---------------- */

/**
 * 状态机步骤：S1 猜义 → S2 验证 → [S2.5 跟读评分] → S3 拼写 → S4 结算（S0 限流 / S5 排程在会话外）
 * - 'readaloud' 是 [多语言·俄语专项] 独立步骤：S2 精简验证之后、S3 之前的录音评分页。
 *   英语词条不走此步（仍用 verify 同屏的 WordReadAloud），完全一致保留旧链路与冻结断言。
 */
export type SessionStep = 'guess' | 'verify' | 'readaloud' | 'spell' | 'summary'

export interface StepRecord {
  word: string
  /** S1 用户提交的猜测（强制提交，无跳过） */
  guess: string
  /** 4 选 1 模式下自动判分；自由输入为 null（S2 揭晓） */
  guessCorrect: boolean | null
  guessMode: 'choice' | 'free'
  /** S2 用户自评「认识 / 不认识」 */
  verifiedKnown: boolean | null
  /** S3 拼写尝试次数与是否通过 */
  spellingTries: number
  spellingPassed: boolean
  spellingMode: 'typing' | 'handwriting'
}

export interface WordSessionDraft {
  deckId: DeckId
  startedAt: number
  /** 本场词表（小写） */
  words: string[]
  index: number
  step: SessionStep
  records: StepRecord[]
}

export const DEFAULT_SESSION_DRAFT: WordSessionDraft | null = null

/* ---------------- 每日新词限流（lingua_word_daily_quota） ---------------- */

export interface WordDailyQuota {
  /** YYYY-MM-DD */
  date: string
  /** 今日已学新词数（只统计 origin=wordlab 的 S4 结算词） */
  newWordsLearned: number
  /** 每日新词上限，允许 10-15 */
  limit: number
}

export const MIN_DAILY_LIMIT = 10
export const MAX_DAILY_LIMIT = 15
export const DEFAULT_DAILY_LIMIT = 12

/* ---------------- 易错本（lingua_word_errors） ---------------- */

export interface WordError {
  id: string
  word: string
  deckId: DeckId
  /** 猜错词义 / 拼写错误 */
  type: 'guess' | 'spelling'
  /** 用户当时写的错误拼写（spelling 用）；guess 时为所选错误选项 */
  detail: string
  createdAt: number
  /** 连续拼对次数；≥2 自动标记 resolved */
  resolveCount: number
  resolved: boolean
}

/* ---------------- 媒体缓存（lingua_word_media_cache） ---------------- */

export interface WordMedia {
  word: string
  /** 空串 = 使用 SVG / emoji 兜底 */
  imageUrl: string
  /** emoji 兜底字符 */
  emoji: string
  /** SVG 兜底主色 */
  tint: string
  examples: string[]
  /** 来源标注：fallback / pexels / pixabay */
  source: 'fallback' | 'pexels' | 'pixabay'
  cachedAt: number
}

export type WordMediaCacheState = Record<string, WordMedia>

/* ---------------- 词库选择（lingua_deck_selection） ---------------- */

export interface DeckSelectionState {
  activeDeckId: DeckId | null
  pickedAt?: number
}

export const DEFAULT_DECK_SELECTION: DeckSelectionState = { activeDeckId: null }

/* ---------------- 排程常量 ---------------- */

/** 艾宾浩斯学习阶梯（毫秒）：10min → 1d → 3d → 7d → 15d → 30d，走完并入 SM-2 */
export const EBBINGHAUS_STEPS_MS: number[] = [
  10 * 60 * 1000,
  1 * 24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  15 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
]

/** 毕业后进入 SM-2 的起始等级（对应 SRS_INTERVALS = [0,1,2,4,7,15,30] 天） */
export const SM2_ENTRY_LEVEL = 2
