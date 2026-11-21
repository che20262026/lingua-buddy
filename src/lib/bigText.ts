/* ================================================================
 * 大文本索引化（纯函数层）
 *
 * 一句话：把「一本书 / 一条视频」拆成「索引 + 正文」两半——
 *   索引（轻）→ localStorage：书名、作者、封面、章节数、字数、CEFR…
 *   正文（重）→ IndexedDB：章节段落、简化改写、注释、词条、引文、
 *                              视频分段、短引用、文化背景卡、字幕素材
 *
 * 为什么这样切：
 *   1) localStorage 只有 5MB 且同步读写，正文放进去迟早触发配额爆仓；
 *   2) 内置种子本来就在 JS bundle 里有一份，再写一份进 localStorage 纯属双份存储；
 *   3) 用户自己添加的长文本是唯一真正"只增不减"的部分，必须放进有富余配额的地方。
 *
 * 本文件**全是纯函数**：不碰 localStorage、不碰 IndexedDB、不含副作用。
 * 冒烟因此可以直接对它们做真实单测（jsdom 里没有 IndexedDB 也不影响）。
 * ================================================================ */

import { countWords, estimateCefr } from '../services/literaryCurator'
import type { CefrLevel, LibraryState, LiteraryBook, LiteraryChapter } from '../literaryTypes'
import type { CultureLibraryState, CultureVideo } from '../cultureTypes'

/* ---------------------------------------------------------------- *
 * 判定：这一条还带着正文吗？
 * ---------------------------------------------------------------- */

/** 书是否仍带正文（章节段落非空） */
export function isHeavyBook(book: Partial<LiteraryBook> | null | undefined): boolean {
  if (!book || !Array.isArray(book.chapters)) return false
  return book.chapters.some((c) => Array.isArray(c?.paragraphs) && c.paragraphs.length > 0)
}

/** 视频是否仍带内容素材（分段 / 短引用 / 背景卡 / 研讨问题） */
export function isHeavyVideo(video: Partial<CultureVideo> | null | undefined): boolean {
  if (!video) return false
  const nonEmpty = (arr: unknown) => Array.isArray(arr) && arr.length > 0
  return nonEmpty(video.segments) || nonEmpty(video.seedExpressions)
    || nonEmpty(video.seedThemes) || nonEmpty(video.seedQuestions)
}

/* ---------------------------------------------------------------- *
 * 索引化
 * ---------------------------------------------------------------- */

/**
 * 章节 → 轻量索引。
 * 正文三件套（段落 / 简化改写 / 注释）与词条、引文、主题、人物、象征全部清空，
 * 但把「本章字数 / 段落数 / CEFR 估计」算好带过来——
 * 列表页（章节列表 / 阅读进度）直接读这三个值，显示与全量时完全一致。
 */
export function toChapterStub(chapter: LiteraryChapter): LiteraryChapter {
  const paragraphs = Array.isArray(chapter.paragraphs) ? chapter.paragraphs : []
  const text = paragraphs.join(' ')
  return {
    id: chapter.id,
    title: chapter.title,
    order: chapter.order,
    excerptRange: chapter.excerptRange,
    paragraphs: [],
    simplified: [],
    notesZh: [],
    glosses: [],
    keyQuotes: [],
    seedThemes: [],
    seedCharacters: [],
    seedSymbols: [],
    seedQuestions: [],
    summaryZh: chapter.summaryZh,
    historicalContext: chapter.historicalContext,
    wordCount: countWords(text),
    paragraphCount: paragraphs.length,
    cefr: (chapter.cefr ?? estimateCefr(text)) as CefrLevel,
  }
}

/** 书 → 轻量索引：书级元数据全留，章节换成索引形态 */
export function toBookStub(book: LiteraryBook): LiteraryBook {
  return {
    ...book,
    chapters: (Array.isArray(book.chapters) ? book.chapters : []).map(toChapterStub),
  }
}

/** 视频 → 轻量索引：元数据全留，四组内容素材清空，计数保留 */
export function toVideoStub(video: CultureVideo): CultureVideo {
  const segments = Array.isArray(video.segments) ? video.segments : []
  const expressions = Array.isArray(video.seedExpressions) ? video.seedExpressions : []
  return {
    ...video,
    segments: [],
    seedExpressions: [],
    seedThemes: [],
    seedQuestions: [],
    segmentCount: segments.length,
    expressionCount: expressions.length,
  }
}

/** 书库 → 索引形态（写 localStorage 前用） */
export function slimLibraryForStorage(library: LibraryState): LibraryState {
  return {
    ...library,
    books: (Array.isArray(library.books) ? library.books : []).map((b) => (
      isHeavyBook(b) ? toBookStub(b) : b
    )),
  }
}

/** 视频库 → 索引形态（写 localStorage 前用） */
export function slimCultureForStorage(library: CultureLibraryState): CultureLibraryState {
  return {
    ...library,
    videos: (Array.isArray(library.videos) ? library.videos : []).map((v) => (
      isHeavyVideo(v) ? toVideoStub(v) : v
    )),
  }
}

/* ---------------------------------------------------------------- *
 * 合并：内存态 = bundle 全量 ⊕ localStorage 索引 ⊕ IndexedDB 正文
 * ---------------------------------------------------------------- */

/**
 * 合并书库。
 * 规则：**内置书以 bundle 全量为准**（bundle 与当前版本永远一致），
 * localStorage 里的索引只是占位；**自定义书保留 localStorage 里的条目**
 * （正文随后由 IndexedDB 水合补齐）。
 * 顺序：先按 localStorage 的顺序，再补上 localStorage 里没有的内置书。
 */
export function mergeLibraryState(
  base: LibraryState,
  stored: Partial<LibraryState> | null | undefined,
): LibraryState {
  if (!stored) return base
  const storedBooks = Array.isArray(stored.books) ? stored.books : []
  const baseById = new Map((base.books || []).map((b) => [b.id, b]))
  const storedIds = new Set(storedBooks.map((b) => b?.id).filter(Boolean))
  const books: LiteraryBook[] = storedBooks.map((b) => baseById.get(b.id) ?? b)
  for (const b of base.books || []) if (!storedIds.has(b.id)) books.push(b)
  return {
    seedVersion: typeof stored.seedVersion === 'number' ? stored.seedVersion : base.seedVersion,
    books,
    briefs: { ...(base.briefs || {}), ...(stored.briefs || {}) },
  }
}

/**
 * 合并视频库。规则与书库一致：
 * 内置种子以 bundle 全量为准；同步产物 / 自定义条目保留，正文由 IndexedDB 水合补齐。
 */
export function mergeCultureState(
  base: CultureLibraryState,
  stored: Partial<CultureLibraryState> | null | undefined,
): CultureLibraryState {
  if (!stored) return base
  const storedVideos = Array.isArray(stored.videos) ? stored.videos : []
  const baseById = new Map((base.videos || []).map((v) => [v.id, v]))
  const storedIds = new Set(storedVideos.map((v) => v?.id).filter(Boolean))
  const videos: CultureVideo[] = storedVideos.map((v) => baseById.get(v.id) ?? v)
  for (const v of base.videos || []) if (!storedIds.has(v.id)) videos.push(v)
  return {
    seedVersion: typeof stored.seedVersion === 'number' ? stored.seedVersion : base.seedVersion,
    videos,
  }
}

/* ---------------------------------------------------------------- *
 * 迁移计划：把旧 localStorage 里的正文搬进 IndexedDB
 * ---------------------------------------------------------------- */

export interface BigTextMigrationPlan {
  /** 迁移后 lingua_library 应写入的新值；null 表示无需改动 */
  libraryRaw: string | null
  /** 迁移后 lingua_culture_videos 应写入的新值；null 表示无需改动 */
  cultureRaw: string | null
  /** 需要写进 IndexedDB library_books 的完整书籍 */
  booksToStore: unknown[]
  /** 需要写进 IndexedDB culture_media 的完整视频 */
  videosToStore: unknown[]
  /** 本次是否真的发生了变化（false = 已是索引形态，幂等空跑） */
  changed: boolean
}

function safeParse(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * 纯函数版的迁移规划：读旧 localStorage 原文，算出
 *   - 哪些正文要搬去 IndexedDB
 *   - localStorage 该被替换成什么
 * 幂等性：输入已是索引形态时 returned.changed === false，且不产生任何待存储条目。
 */
export function planBigTextMigration(
  rawLibrary: string | null,
  rawCulture: string | null,
): BigTextMigrationPlan {
  const plan: BigTextMigrationPlan = {
    libraryRaw: null, cultureRaw: null, booksToStore: [], videosToStore: [], changed: false,
  }

  if (rawLibrary) {
    const parsed = safeParse(rawLibrary) as { books?: unknown[] } | null
    const books = parsed && Array.isArray(parsed.books) ? parsed.books : []
    const heavy = books.filter((b) => isHeavyBook(b as Partial<LiteraryBook>))
    if (heavy.length) {
      plan.booksToStore = heavy
      const slim = { ...(parsed as object), books: books.map((b) => (
        isHeavyBook(b as Partial<LiteraryBook>) ? toBookStub(b as LiteraryBook) : b
      )) }
      plan.libraryRaw = JSON.stringify(slim)
      plan.changed = true
    }
  }

  if (rawCulture) {
    const parsed = safeParse(rawCulture) as { videos?: unknown[] } | null
    const videos = parsed && Array.isArray(parsed.videos) ? parsed.videos : []
    const heavy = videos.filter((v) => isHeavyVideo(v as Partial<CultureVideo>))
    if (heavy.length) {
      plan.videosToStore = heavy
      const slim = { ...(parsed as object), videos: videos.map((v) => (
        isHeavyVideo(v as Partial<CultureVideo>) ? toVideoStub(v as CultureVideo) : v
      )) }
      plan.cultureRaw = JSON.stringify(slim)
      plan.changed = true
    }
  }

  return plan
}

/* ---------------------------------------------------------------- *
 * 水合：把 IndexedDB 里的正文补回内存态的索引条目
 * ---------------------------------------------------------------- */

export interface BigTextHydration {
  books: LiteraryBook[]
  videos: CultureVideo[]
}

/**
 * 用 IndexedDB 里的完整正文，替换内存态中"只有索引"的同名条目。
 * 找不到正文的条目原样保留（宁可显示索引，也不丢条目）。
 */
export function hydrateLibrary(library: LibraryState, fullBooks: LiteraryBook[]): LibraryState {
  if (!fullBooks.length) return library
  const byId = new Map(fullBooks.map((b) => [b.id, b]))
  return {
    ...library,
    /**
     * 只给「索引形态」的条目补正文。
     * 内置书在 loadData 阶段已经由 bundle 补成全量（heavy），必须保留当前版本，
     * 绝不能被 IndexedDB 里可能过期的缓存覆盖；只有自定义条目才是索引待补。
     */
    books: (library.books || []).map((b) => (isHeavyBook(b) ? b : (byId.get(b.id) ?? b))),
  }
}

export function hydrateCulture(library: CultureLibraryState, fullVideos: CultureVideo[]): CultureLibraryState {
  if (!fullVideos.length) return library
  const byId = new Map(fullVideos.map((v) => [v.id, v]))
  return {
    ...library,
    videos: (library.videos || []).map((v) => (isHeavyVideo(v) ? v : (byId.get(v.id) ?? v))),
  }
}
