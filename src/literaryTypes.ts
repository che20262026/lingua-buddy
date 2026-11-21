/** 经典英文文学研读模块 —— 全部新增类型，独立于现有 types.ts */
/** 与现有 CEFR 联合类型保持同构（避免循环 type import） */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
/** 分析器输出的档位范围（不含 A1） */
export type AnalyzedCefr = 'A2' | 'B1' | 'B2' | 'C1'

export type ReadingViewMode = 'original' | 'simplified' | 'bilingual'
export type GuidanceStrength = 'light' | 'medium' | 'strong'
export type SeminarRole = 'guide' | 'peer'
export type FeedbackLevel = 'none' | 'minor' | 'major'

/* ---------------- 书库与章节 ---------------- */

export interface LiteraryGloss {
  word: string
  meaningZh: string
  note: string
}

export interface ChapterTheme {
  name: string
  /** 必须出现在该章原文中的短引，任何虚构证据都会被分析器过滤掉 */
  evidence: string
}

export interface ChapterCharacter {
  name: string
  traits: string
  arc: string
}

export interface ChapterSymbol {
  item: string
  meaning: string
  evidence: string
}

export interface KeyQuote {
  quote: string
  whyItMatters: string
}

export interface LiteraryChapter {
  id: string
  title: string
  order: number
  /** 节选范围说明：诚实标注「不是完整章节」 */
  excerptRange: string
  /** 原文段落（教学节选） */
  paragraphs: string[]
  /** 分级简化改写，与 paragraphs 一一对应；明确标注为「非原文」 */
  simplified: string[]
  /** 双语注释，与 paragraphs 一一对应 */
  notesZh: string[]
  glosses: LiteraryGloss[]
  /** 精选原文短引，全部为 paragraphs 的子串 */
  keyQuotes: KeyQuote[]
  seedThemes: ChapterTheme[]
  seedCharacters: ChapterCharacter[]
  seedSymbols: ChapterSymbol[]
  seedQuestions: string[]
  /** 2-3 句中文摘要（Mock 分析器的素材，均来自本章节选） */
  summaryZh: string
  historicalContext?: string
  /**
   * [大数据迁移] 索引形态的派生指标。
   * 正文迁往 IndexedDB 后，localStorage 只留一条轻量索引，
   * 列表页仍要显示「本章字数 / CEFR 估计 / 段落数」，
   * 所以这三个派生值在生成索引时就算好带过来，绝不让列表页退化成 0 字。
   */
  wordCount?: number
  paragraphCount?: number
  cefr?: CefrLevel
}

export interface LiteraryBook {
  id: string
  title: string
  author: string
  year: number
  /** 封面占位：原创渐变色 class + 装饰符号，不使用任何第三方品牌素材 */
  emblem: string
  coverFrom: string
  coverTo: string
  blurb: string
  cefr: CefrLevel
  /** 版权三件套：书单准入的硬门槛 */
  source: string
  publicDomainRegion: string
  licenseNote: string
  /** 节选声明 */
  excerptNote: string
  themes: string[]
  characters: string[]
  chapters: LiteraryChapter[]
  /** 用户自有、明确标注公版的短篇文本 */
  custom?: boolean
}

export interface ChapterBrief {
  chapterId: string
  /** 1-2 句中文；注入下一章研讨，绝不注入全书 */
  text: string
  themes: string[]
  characters: string[]
  generatedAt: number
}

export interface LibraryState {
  seedVersion: number
  books: LiteraryBook[]
  briefs: Record<string, ChapterBrief>
}

/* ---------------- 章节分析 ---------------- */

export interface HardWord {
  word: string
  meaningZh: string
  note: string
}

export interface ChapterAnalysis {
  chapterId: string
  chapterTitle: string
  summaryZh: string
  cefr: AnalyzedCefr
  themes: ChapterTheme[]
  characters: ChapterCharacter[]
  symbols: ChapterSymbol[]
  historicalContext: string
  hardWords: HardWord[]
  keyQuotes: KeyQuote[]
  discussionQuestions: string[]
  /** 每章生成一份，作为后续章节的前情摘要来源 */
  chapterBrief: string
  /** true = 所有 evidence 都通过了「必须命中本章原文」校验 */
  evidenceValidated: boolean
  disclaimer: string
}

/* ---------------- 阅读进度与批注 ---------------- */

export interface ReadingProgressRecord {
  bookId: string
  chapterId: string
  /** 当前读到的段落序号 */
  position: number
  viewMode: ReadingViewMode
  completedChapterIds: string[]
  updatedAt: number
}

export type ReadingProgressState = Record<string, ReadingProgressRecord>

export interface LiteraryNote {
  id: string
  bookId: string
  chapterId: string
  paragraphIndex: number
  text: string
  createdAt: number
}

export interface LiteraryHighlight {
  id: string
  bookId: string
  chapterId: string
  paragraphIndex: number
  createdAt: number
}

export interface LiteraryBookmark {
  id: string
  bookId: string
  chapterId: string
  createdAt: number
}

export interface LiteraryNotesState {
  notes: LiteraryNote[]
  highlights: LiteraryHighlight[]
  bookmarks: LiteraryBookmark[]
  /** 从阅读页加入现有 lingua_review_queue 的词，用于进度页统计 */
  savedWords: string[]
}

/* ---------------- 研讨会话 ---------------- */

export interface SeminarFeedback {
  /** 与现有 Feedback 组件兼容 */
  level: FeedbackLevel
  argument: string
  language: string
  corrected?: string
  praise: string
}

export interface SeminarMessage {
  id: string
  role: 'ai' | 'user' | 'coach'
  speaker: string
  text: string
  translation?: string
  feedback?: SeminarFeedback
  evidencePrompt?: string
  at: number
}

export interface SeminarReport {
  summary: string
  agreedPoints: string[]
  openQuestions: string[]
  evidenceHits: number
  newWords: string[]
  xp: number
  disclaimer: string
}

export interface SeminarSession {
  id: string
  bookId: string
  chapterId: string
  chapterTitle: string
  bookTitle: string
  role: SeminarRole
  guidance: GuidanceStrength
  messages: SeminarMessage[]
  turns: number
  coveredQuotes: string[]
  mistakes: string[]
  report?: SeminarReport
  createdAt: number
  finishedAt?: number
}

export type SeminarState = SeminarSession[]

/* ---------------- SeminarDirectorAgent 契约 ---------------- */

/**
 * 研讨输入：严格只包含「当前章节 + 前情摘要 1-2 句 + 主题/人物/引文卡 + 历史发言」。
 * 没有 book / chapters / 全书文本字段 —— 从类型层面杜绝把整本书塞进单次调用。
 */
export interface SeminarInput {
  chapterText: string
  chapterTitle: string
  chapterBrief: string
  themes: ChapterTheme[]
  characters: ChapterCharacter[]
  keyQuotes: KeyQuote[]
  discussionQuestions: string[]
  role: SeminarRole
  guidance: GuidanceStrength
  history: SeminarMessage[]
  userInput: string
  difficulty: CefrLevel
  turn: number
  forceEnd?: boolean
}

export interface SeminarOutput {
  /** 2-4 句研讨发言，含一个开放问题或一个证据追问 */
  reply: string
  translation: string
  feedback: SeminarFeedback
  evidencePrompt?: string
  nextQuestion: string
  /** 每 3-4 轮轻量小结 */
  stageSummary?: string
  /** [成长系统] 本轮用户输入是否有效（有效轮次才计 XP） */
  effective?: boolean
  end: boolean
}

export type GenerateSeminar = (input: SeminarInput) => Promise<SeminarOutput>

/** LiteraryAnalyzerAgent 契约 */
export interface AnalyzeChapterInput {
  chapter: LiteraryChapter
  book: LiteraryBook
  targetDifficulty: CefrLevel
}
export type AnalyzeChapter = (input: AnalyzeChapterInput) => Promise<ChapterAnalysis>
