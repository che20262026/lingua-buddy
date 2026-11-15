/* ================================================================
 * 新增 Agent 1 —— LiteraryCuratorAgent
 *
 * 职责：管理内置书库元数据、章节切分、阅读进度、前情摘要。
 * 输出：书籍列表、章节列表（每章字数 + CEFR 估计）、单章上下文。
 *
 * 长文本原则（硬约束）：任何对外接口都只返回「单章」，
 * 绝不提供把全书拼成一段文本的方法，从源头上杜绝整本书进单次 LLM 调用。
 * ================================================================ */

import type {
  AnalyzedCefr, CefrLevel, ChapterBrief, ChapterTheme, ChapterCharacter,
  LibraryState, LiteraryBook, LiteraryChapter, ReadingProgressRecord,
  ReadingProgressState, ReadingViewMode,
} from '../literaryTypes'

export interface BookListItem {
  id: string
  title: string
  author: string
  year: number
  cefr: CefrLevel
  emblem: string
  coverFrom: string
  coverTo: string
  blurb: string
  chapterCount: number
  totalWords: number
  source: string
  publicDomainRegion: string
  licenseNote: string
  excerptNote: string
  custom: boolean
  /** 已完成章节 / 总章节 */
  completed: number
  percent: number
}

export interface ChapterSummary {
  id: string
  title: string
  order: number
  excerptRange: string
  wordCount: number
  cefr: CefrLevel
  paragraphCount: number
  hasBrief: boolean
}

/* ---------------- 文本统计（纯函数，可单测） ---------------- */

export function countWords(text: string): number {
  return (text.match(/[A-Za-z][A-Za-z'-]*/g) || []).length
}

export function splitIntoSentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
}

/** 与现有 CEFR 字段保持同构的难度估计：句长 + 长词比例，确定性、可复现 */
export function estimateCefr(text: string): AnalyzedCefr {
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || []
  if (!words.length) return 'A2'
  const sentences = splitIntoSentences(text)
  const avgSentence = words.length / Math.max(sentences.length, 1)
  const longRatio = words.filter((w) => w.length >= 8).length / words.length
  if (avgSentence >= 27 || longRatio >= 0.23) return 'C1'
  if (avgSentence >= 19 || longRatio >= 0.15) return 'B2'
  if (avgSentence >= 11 || longRatio >= 0.07) return 'B1'
  return 'A2'
}

/** 单章文本（只有单章，没有全书） */
export function chapterText(chapter: LiteraryChapter, mode: ReadingViewMode = 'original'): string {
  if (mode === 'simplified') return chapter.simplified.join('\n\n')
  return chapter.paragraphs.join('\n\n')
}

/* ---------------- 书库查询 ---------------- */

export function listBooks(library: LibraryState): LiteraryBook[] {
  return Array.isArray(library?.books) ? library.books : []
}

export function getBook(library: LibraryState, bookId?: string): LiteraryBook | undefined {
  if (!bookId) return undefined
  return listBooks(library).find((b) => b.id === bookId)
}

export function getChapter(
  library: LibraryState, bookId?: string, chapterId?: string,
): { book: LiteraryBook; chapter: LiteraryChapter } | undefined {
  const book = getBook(library, bookId)
  if (!book) return undefined
  const chapter = book.chapters.find((c) => c.id === chapterId) || book.chapters[0]
  return chapter ? { book, chapter } : undefined
}

export function listChapters(library: LibraryState, bookId?: string): ChapterSummary[] {
  const book = getBook(library, bookId)
  if (!book) return []
  return book.chapters.map((c) => ({
    id: c.id,
    title: c.title,
    order: c.order,
    excerptRange: c.excerptRange,
    wordCount: countWords(c.paragraphs.join(' ')),
    cefr: estimateCefr(c.paragraphs.join(' ')),
    paragraphCount: c.paragraphs.length,
    hasBrief: Boolean(library.briefs?.[c.id]),
  }))
}

export function nextChapter(book: LiteraryBook, chapterId: string): LiteraryChapter | undefined {
  const idx = book.chapters.findIndex((c) => c.id === chapterId)
  return idx >= 0 ? book.chapters[idx + 1] : undefined
}

export function previousChapter(book: LiteraryBook, chapterId: string): LiteraryChapter | undefined {
  const idx = book.chapters.findIndex((c) => c.id === chapterId)
  return idx > 0 ? book.chapters[idx - 1] : undefined
}

/* ---------------- 进度 ---------------- */

export function progressRecord(
  state: ReadingProgressState, bookId: string, fallbackView: ReadingViewMode = 'original',
): ReadingProgressRecord {
  return state?.[bookId] || {
    bookId,
    chapterId: '',
    position: 0,
    viewMode: fallbackView,
    completedChapterIds: [],
    updatedAt: 0,
  }
}

export function readingPercent(book: LiteraryBook, record?: ReadingProgressRecord): number {
  if (!book.chapters.length) return 0
  const done = record?.completedChapterIds?.length || 0
  return Math.max(0, Math.min(1, done / book.chapters.length))
}

export function listBookItems(
  library: LibraryState, progress: ReadingProgressState,
): BookListItem[] {
  return listBooks(library).map((b) => {
    const rec = progress?.[b.id]
    const chapters = listChapters(library, b.id)
    return {
      id: b.id, title: b.title, author: b.author, year: b.year, cefr: b.cefr,
      emblem: b.emblem, coverFrom: b.coverFrom, coverTo: b.coverTo, blurb: b.blurb,
      chapterCount: chapters.length,
      totalWords: chapters.reduce((s, c) => s + c.wordCount, 0),
      source: b.source, publicDomainRegion: b.publicDomainRegion,
      licenseNote: b.licenseNote, excerptNote: b.excerptNote, custom: Boolean(b.custom),
      completed: rec?.completedChapterIds?.length || 0,
      percent: readingPercent(b, rec),
    }
  })
}

/* ---------------- 前情摘要 ---------------- */

/** 把 2-3 句中文摘要压成 1-2 句，作为 chapterBrief 的兜底 */
export function condenseSummary(summary: string): string {
  const parts = summary.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean)
  return parts.slice(0, 2).join('') || summary.slice(0, 80)
}

/**
 * 取「上一章」的 chapterBrief（1-2 句），作为本章研讨的前情摘要。
 * 未生成过 brief 时退化为上一章的摘要前两句，绝不会去读全书。
 */
export function chapterBriefFor(
  library: LibraryState, book: LiteraryBook, chapterId: string,
): string {
  const prev = previousChapter(book, chapterId)
  if (!prev) return '这是本书的开端，尚无前情。'
  const stored: ChapterBrief | undefined = library.briefs?.[prev.id]
  if (stored?.text) return condenseSummary(stored.text)
  return `上一章「${prev.title}」：${condenseSummary(prev.summaryZh)}`
}

/** 生成 / 写入一份 chapterBrief（由 LiteraryAnalyzerAgent 调用） */
export function makeChapterBrief(
  chapter: LiteraryChapter, briefText: string, themes: string[], characters: string[],
): ChapterBrief {
  return {
    chapterId: chapter.id,
    text: condenseSummary(briefText),
    themes,
    characters,
    generatedAt: Date.now(),
  }
}

/** 研讨上下文卡片：只从单章分析里挑，绝不携带其他章节 */
export function seminarCards(analysis: {
  themes: ChapterTheme[]
  characters: ChapterCharacter[]
  keyQuotes: { quote: string; whyItMatters: string }[]
}) {
  return {
    themes: analysis.themes.slice(0, 4),
    characters: analysis.characters.slice(0, 4),
    keyQuotes: analysis.keyQuotes.slice(0, 4),
  }
}

/** 版权三件套完整性校验：缺一不入库 / 不展示 */
export function hasValidProvenance(book: LiteraryBook): boolean {
  return Boolean(
    book.source?.trim() && book.publicDomainRegion?.trim()
    && book.licenseNote?.trim() && book.excerptNote?.trim()
    && book.source.toLowerCase().includes('gutenberg'),
  )
}

/** 定位某条原文短引所在段落，供「回原文找证据」跳转 */
export function findParagraphForQuote(chapter: LiteraryChapter, quote: string): number {
  const needle = quote.replace(/[’]/g, "'").toLowerCase().slice(0, 40)
  const idx = chapter.paragraphs.findIndex((p) => p.replace(/[’]/g, "'").toLowerCase().includes(needle))
  return idx >= 0 ? idx : 0
}
