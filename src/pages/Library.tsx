import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/useAppStore'
/** [内容扩充] 100+ 本英语文学公版书元数据目录：动态 import 按需加载，不进首屏主 chunk */
import type { BookCatalogEntry } from '../data/expanded/bookCatalog'
import { CatalogBookCard, CatalogFilter, CatalogPager } from '../components/CatalogBits'
import { uid } from '../lib/utils'
/** [大数据迁移] 自定义短篇正文进 IndexedDB；写库失败则退回"不瘦身"，正文仍留 localStorage */
import { getBigTextBackend } from '../lib/db'
import { disableSlimming } from '../lib/storage'
import { PUBLIC_DOMAIN_NOTICE } from '../data/librarySeed'
import { countWords, hasValidProvenance, listBookItems } from '../services/literaryCurator'
import type { LiteraryBook, LiteraryChapter } from '../literaryTypes'
import {
  CopyrightNote, LiteraryHeader,
} from '../components/LiteraryBits'
import {
  FeedBookCard, FeedBriefs, FeedEmpty, FeedHero, FeedSeminarCard, FeedTabs,
  LibraryDock, LibrarySearchSheet,
  type FeedBriefItem, type FeedDockAction, type FeedSearchHit, type FeedTabItem,
} from '../components/LibraryFeedBits'
import { Card, Chip, EmptyState, Icon, SectionTitle } from '../components/ui'
/** [CEFR 等级层] 阅读模块共用同一套等级面板与内容池 */
import { LevelPanel } from '../components/LevelPanel'
import { LevelContentList } from '../components/LevelContentList'

const MAX_CUSTOM_CHARS = 20000

/** 分类 Tab：全部有真实数据支撑，不放没有内容的空栏目 */
type LibraryTab = 'feed' | 'mine' | 'public' | 'level' | 'seminar'

/** 把用户自有公版短篇切成段落；所有引文仍必须是原文子串 */
function makeCustomChapter(text: string): LiteraryChapter {
  const paragraphs = text.replace(/\r/g, '')
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 40)
  const body = paragraphs.length ? paragraphs : [text.trim()]
  const firstLine = (body[0].match(/^[^.!?]+[.!?]?/) || [body[0].slice(0, 80)])[0].trim()
  return {
    id: `custom-ch-${uid('lit')}`,
    title: '短篇全文（用户自有公版文本）',
    order: 1,
    excerptRange: `用户自有公版短篇 · ${countWords(body.join(' '))} 词 · 单章`,
    paragraphs: body,
    simplified: body.map(() => '（该短篇未提供分级简化改写，请切换「原文」或「双语注释」视图。）'),
    notesZh: body.map(() => '用户自有文本：暂无内置中文注释，可在阅读页自行添加批注。'),
    glosses: [],
    keyQuotes: [{ quote: firstLine, whyItMatters: '本章开篇句：可从这里开始提出你的第一个阅读判断。' }],
    seedThemes: [{ name: '文本细读', evidence: firstLine }],
    seedCharacters: [],
    seedSymbols: [],
    seedQuestions: [
      'Which single line in this short text carries the most weight, and why?',
      'What does the opening sentence lead you to expect? Does the rest of the text keep that promise?',
      'If you disagreed with the most obvious reading, which words would you point to?',
    ],
    summaryZh: `这是用户自行添加并明确标注为公有领域的短篇文本，共 ${body.length} 段、约 ${countWords(body.join(' '))} 词。研读从开篇句开始，逐段提出观点并回到原文找证据。`,
    historicalContext: '由使用者提供；版权状态由使用者在添加时明确声明。',
  }
}

export function Library() {
  const { data, update, navigate, notify } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState<LibraryTab>('feed')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({
    title: '', author: '', source: '', region: '', license: '我声明该文本属于公有领域（Public Domain），或我本人拥有相应权利并允许本地学习使用。',
    text: '', declared: false,
  })
  const [formError, setFormError] = useState('')

  // 版权三件套不完整的书一律不展示，从 UI 层兜住「不确定就不内置」
  const items = useMemo(() => listBookItems(data.library, data.readingProgress)
    .filter((item) => {
      const book = data.library.books.find((b) => b.id === item.id)
      return book ? (book.custom || hasValidProvenance(book)) : false
    }), [data.library, data.readingProgress])

  const seminarCount = data.seminars.length

  /** 我的书架：自有短篇 + 有阅读进度 + 有批注/高亮/书签的书 */
  const mineItems = useMemo(() => {
    const notes = data.literaryNotes
    const touched = new Set<string>()
    for (const n of notes?.notes ?? []) touched.add(n.bookId)
    for (const h of notes?.highlights ?? []) touched.add(h.bookId)
    for (const b of notes?.bookmarks ?? []) touched.add(b.bookId)
    return items.filter((i) => i.custom || i.completed > 0 || i.percent > 0 || touched.has(i.id))
  }, [items, data.literaryNotes])

  const builtinItems = useMemo(() => items.filter((i) => !i.custom), [items])

  /* ---------------- [内容扩充] 100+ 本目录：动态 import + 本地筛选 + 分页 ---------------- */
  const [catalog, setCatalog] = useState<BookCatalogEntry[]>([])
  const [catalogTags, setCatalogTags] = useState<string[]>([])
  const [catalogCefr, setCatalogCefr] = useState<Array<{ value: string; count: number }>>([])
  const [catCefr, setCatCefr] = useState('全部')
  const [catTag, setCatTag] = useState('全部')
  const [catPage, setCatPage] = useState(0)
  useEffect(() => {
    let alive = true
    import('../data/expanded/bookCatalog').then((m) => {
      if (!alive) return
      setCatalog(m.BOOK_CATALOG)
      setCatalogTags(['全部', ...m.CATALOG_TAGS.slice(0, 12)])
      setCatalogCefr([
        { value: '全部', count: m.BOOK_CATALOG.length },
        ...(['A1', 'A2', 'B1', 'B2', 'C1'] as const)
          .filter((c) => m.CATALOG_CEFR_COUNTS[c] > 0)
          .map((c) => ({ value: c, count: m.CATALOG_CEFR_COUNTS[c] })),
      ])
    }).catch(() => { /* 目录加载失败不影响原有书架功能 */ })
    return () => { alive = false }
  }, [])

  const CATALOG_PAGE_SIZE = 20
  const filteredCatalog = useMemo(() => catalog.filter((b) =>
    (catCefr === '全部' || b.cefrLevel === catCefr)
    && (catTag === '全部' || b.tags.includes(catTag))), [catalog, catCefr, catTag])
  const catalogTotalPages = Math.max(1, Math.ceil(filteredCatalog.length / CATALOG_PAGE_SIZE))
  const catalogPageItems = useMemo(() => {
    const p = Math.min(catPage, catalogTotalPages - 1)
    return filteredCatalog.slice(p * CATALOG_PAGE_SIZE, (p + 1) * CATALOG_PAGE_SIZE)
  }, [filteredCatalog, catPage, catalogTotalPages])

  /** 头条：优先挑正在读的那本，否则第一本内置公版书 */
  const featured = useMemo(
    () => builtinItems.find((i) => i.percent > 0) ?? builtinItems[0] ?? items[0],
    [builtinItems, items],
  )

  /** 最近一次阅读记录：用于「继续读」与底部工具条的快速入口 */
  const lastRead = useMemo(() => {
    const recs = Object.values(data.readingProgress ?? {})
    if (!recs.length) return null
    return recs.slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
  }, [data.readingProgress])

  const patch = (p: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...p }))

  const addCustomBook = async () => {
    setFormError('')
    const text = form.text.trim()
    if (!form.title.trim() || !form.author.trim() || !form.source.trim() || !form.region.trim()) {
      setFormError('书名、作者、来源与适用地区都要填写，版权状态不能空着。')
      return
    }
    if (!form.declared) {
      setFormError('请先勾选公版 / 权利声明；版权状态不明确的文本不能加入书架。')
      return
    }
    if (text.length < 200 || text.length > MAX_CUSTOM_CHARS) {
      setFormError(`短篇文本需要 200–${MAX_CUSTOM_CHARS} 字符；不提供整本书上传入口。`)
      return
    }
    const chapter = makeCustomChapter(text)
    const book: LiteraryBook = {
      id: `custom-${uid('bk')}`,
      title: form.title.trim(),
      author: form.author.trim(),
      year: 0,
      emblem: '📄',
      coverFrom: 'from-brand-400',
      coverTo: 'to-mint-500',
      blurb: '用户自行添加并明确声明为公有领域的短篇文本，单章研读。',
      cefr: 'B1',
      source: form.source.trim(),
      publicDomainRegion: form.region.trim(),
      licenseNote: form.license.trim(),
      excerptNote: '用户提供全文短篇（≤ 20,000 字符），非整本书。',
      themes: ['文本细读'],
      characters: [],
      chapters: [chapter],
      custom: true,
    }
    /**
     * [大数据迁移] 先把正文写进 IndexedDB，成功后才把书放进内存态 ——
     * 之后 saveData 才会把 localStorage 里的这本书瘦身为索引。
     * 写库失败时关闭瘦身开关，正文退回 localStorage（旧行为），宁可占地方也不能丢。
     */
    const backend = await getBigTextBackend()
    const stored = await backend.putBook(book)
    if (!stored) disableSlimming()
    update((prev) => ({ ...prev, library: { ...prev.library, books: [...prev.library.books, book] } }))
    setForm({ title: '', author: '', source: '', region: '', license: form.license, text: '', declared: false })
    setShowForm(false)
    notify(stored
      ? '公版短篇已加入书架，可以逐段研读啦 📄'
      : '公版短篇已加入书架（已降级为本地存储）📄')
  }

  /* ---------------- 快讯：全部由真实数据推导，不编造 ---------------- */
  const briefs: FeedBriefItem[] = useMemo(() => {
    const notes = data.literaryNotes
    const list: FeedBriefItem[] = []
    if (lastRead) {
      const done = lastRead.completedChapterIds?.length ?? 0
      list.push({
        id: 'brief-continue',
        text: '今日阅读任务：接着上次那一章继续读',
        meta: `已读完 ${done} 章 · 点开回到书籍详情`,
        onOpen: () => navigate('bookDetail', { bookId: lastRead.bookId }),
      })
    } else if (items.length) {
      list.push({
        id: 'brief-start',
        text: '今日阅读任务：从书架里挑一本开始研读',
        meta: `共 ${items.length} 本公版书 · 全部标注来源与许可`,
        onOpen: () => navigate('bookDetail', { bookId: items[0].id }),
      })
    }
    list.push({
      id: 'brief-seminar',
      text: `更新提醒：已完成 ${seminarCount} 场苏格拉底研讨`,
      meta: seminarCount > 0 ? '每一场都留有共识与未决问题' : '读完一章即可发起第一场',
      onOpen: () => navigate('readingProgress'),
    })
    const noteCount = notes?.notes?.length ?? 0
    const highCount = notes?.highlights?.length ?? 0
    list.push({
      id: 'brief-notes',
      text: `批注与高亮：${noteCount} 条批注 · ${highCount} 处高亮`,
      meta: '批注只在阅读页产生，可随时回原文找证据',
      onOpen: () => navigate('readingProgress'),
    })
    const wordCount = notes?.savedWords?.length ?? 0
    list.push({
      id: 'brief-words',
      text: `长难句打卡：已收集 ${wordCount} 个生词`,
      meta: '生词已进入现有复习队列，跟词场共用一份账本',
      onOpen: () => navigate('review'),
    })
    return list
  }, [items, lastRead, seminarCount, data.literaryNotes, navigate])

  /* ---------------- 搜索结果：书名 / 章节 / 研讨 / 批注 ---------------- */
  const hits: FeedSearchHit[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: FeedSearchHit[] = []
    const close = () => setSearchOpen(false)
    for (const item of items) {
      if (item.title.toLowerCase().includes(q) || item.author.toLowerCase().includes(q)) {
        out.push({
          id: item.id, kind: '书籍', title: item.title,
          subtitle: `${item.author} · CEFR ${item.cefr} · ${item.chapterCount} 章`,
          onOpen: () => { close(); navigate('bookDetail', { bookId: item.id }) },
        })
      }
    }
    // [内容扩充] 公版目录卡的标题 / 中译 / 作者 / 标签也进本地搜索；点击切到公版 Tab
    for (const entry of catalog) {
      if (entry.title.toLowerCase().includes(q) || entry.titleCn.includes(q)
        || entry.author.toLowerCase().includes(q) || entry.tags.some((t) => t.includes(q))) {
        out.push({
          id: entry.id, kind: '书籍', title: `${entry.title} · ${entry.titleCn}`,
          subtitle: `${entry.author} · CEFR ${entry.cefrLevel}`,
          onOpen: () => { close(); setTab('public'); setCatTag(entry.tags[0] ?? '全部'); setCatPage(0) },
        })
      }
    }
    for (const book of data.library.books) {
      for (const ch of book.chapters) {
        if (ch.title.toLowerCase().includes(q)) {
          out.push({
            id: ch.id, kind: '章节', title: ch.title, subtitle: book.title,
            onOpen: () => { close(); navigate('reader', { bookId: book.id, chapterId: ch.id }) },
          })
        }
      }
    }
    for (const s of data.seminars) {
      if (s.chapterTitle.toLowerCase().includes(q) || s.bookTitle.toLowerCase().includes(q)) {
        out.push({
          id: s.id, kind: '研讨', title: s.chapterTitle,
          subtitle: `${s.bookTitle} · ${s.turns} 轮`,
          onOpen: () => { close(); navigate('seminar', { bookId: s.bookId, chapterId: s.chapterId, seminarId: s.id }) },
        })
      }
    }
    for (const n of data.literaryNotes?.notes ?? []) {
      if (n.text.toLowerCase().includes(q)) {
        out.push({
          id: n.id, kind: '批注', title: n.text.slice(0, 40), subtitle: '来自阅读页批注',
          onOpen: () => { close(); navigate('reader', { bookId: n.bookId, chapterId: n.chapterId, paragraphIndex: n.paragraphIndex }) },
        })
      }
    }
    return out.slice(0, 30)
  }, [query, items, catalog, data.library.books, data.seminars, data.literaryNotes, navigate])

  /* ---------------- 底部悬浮工具条（书架内部专属） ---------------- */
  const dockActions: FeedDockAction[] = useMemo(() => {
    const actions: FeedDockAction[] = []
    const quickBook = data.library.books.find((b) => b.id === (lastRead?.bookId ?? featured?.id))
    const quickChapter = quickBook?.chapters?.[0]?.id
    actions.push({
      id: 'dock-read', icon: 'book', label: '快速阅读',
      disabled: !quickBook || !quickChapter,
      onOpen: () => { if (quickBook && quickChapter) navigate('reader', { bookId: quickBook.id, chapterId: quickChapter }) },
    })
    const latestSeminar = data.seminars[0]
    actions.push({
      id: 'dock-seminar', icon: 'headphones', label: '研讨回放',
      disabled: !latestSeminar,
      onOpen: () => {
        if (latestSeminar) navigate('seminar', { bookId: latestSeminar.bookId, chapterId: latestSeminar.chapterId, seminarId: latestSeminar.id })
      },
    })
    return actions
  }, [data.library.books, data.seminars, lastRead, featured, navigate])

  const tabs: FeedTabItem[] = [
    { id: 'feed', label: '推荐' },
    { id: 'mine', label: '我的书架', count: mineItems.length },
    { id: 'public', label: '公版原著', count: builtinItems.length + catalog.length },
    { id: 'level', label: '分级阅读' },
    { id: 'seminar', label: '研讨回放', count: seminarCount },
  ]

  /** 分级阅读内容池：同一实例按 Tab 位置升降，不重复渲染 */
  const levelPool = <LevelContentList module="reading" />

  return (
    <>
    <div className="animate-in space-y-5 pb-14">
      <LiteraryHeader eyebrow="LITERARY READING · 文学长廊" title="经典英文文学研读"
        subtitle="按章节读原文，再围着一章做一场苏格拉底式研讨。与「角色对话」并列，互不替代。"
        right={<Chip tone="brand" className="!whitespace-nowrap">{items.length + catalog.length} 本公版书</Chip>} />

      <CopyrightNote text={PUBLIC_DOMAIN_NOTICE} />

      {/* 顶部搜索 + 快捷操作：搜索是整条可点的胶囊，点击进入本地全屏搜索层 */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setSearchOpen(true)} aria-label="搜索书架内容"
          className="lf-search-pill">
          <Icon name="search" size={16} className="shrink-0 text-brand-500" />
          <span>搜索书名、章节、研讨或批注…</span>
        </button>
        <button type="button" onClick={() => setShowForm((v) => !v)}
          aria-label="添加自有公版短篇" title="添加自有公版短篇"
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-card transition active:scale-95">
          <Icon name="plus" size={18} />
        </button>
      </div>

      {/* 快捷入口：与原「阅读进度 / 添加自有公版短篇」两张入口卡同一批出口 */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => navigate('readingProgress')}
          className="flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-white px-3 text-[12px] font-bold text-brand-600 shadow-card transition active:scale-95">
          <Icon name="chart" size={15} />阅读进度
        </button>
        <button type="button" onClick={() => setShowForm((v) => !v)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-white px-3 text-[12px] font-bold text-mint-600 shadow-card transition active:scale-95">
          <Icon name="edit" size={15} />添加短篇
        </button>
        <button type="button" onClick={() => setSearchOpen(true)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-white px-3 text-[12px] font-bold text-muted shadow-card transition active:scale-95">
          <Icon name="search" size={15} />全文检索
        </button>
      </div>

      {showForm && (
        <Card className="animate-in">
          <SectionTitle title="添加自有公版短篇" subtitle="只允许你自己拥有、并明确标注为公有领域的短篇文本；上限 20,000 字符，单章切分。" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-ink">书名
              <input className="field mt-1.5" value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="My Public Domain Short Text" />
            </label>
            <label className="block text-xs font-bold text-ink">作者
              <input className="field mt-1.5" value={form.author} onChange={(e) => patch({ author: e.target.value })} placeholder="Author / Unknown" />
            </label>
            <label className="block text-xs font-bold text-ink">公版来源（Project Gutenberg 等）
              <input className="field mt-1.5" value={form.source} onChange={(e) => patch({ source: e.target.value })} placeholder="https://www.gutenberg.org/ebooks/…" />
            </label>
            <label className="block text-xs font-bold text-ink">适用地区 / 依据
              <input className="field mt-1.5" value={form.region} onChange={(e) => patch({ region: e.target.value })} placeholder="作者逝世年份 / 出版年前于 1929" />
            </label>
          </div>
          <label className="mt-3 block text-xs font-bold text-ink">许可说明
            <input className="field mt-1.5" value={form.license} onChange={(e) => patch({ license: e.target.value })} />
          </label>
          <label className="mt-3 block text-xs font-bold text-ink">短篇正文（{form.text.length} / {MAX_CUSTOM_CHARS} 字符）
            <textarea className="field en-text mt-1.5 min-h-[140px] resize-y leading-relaxed" value={form.text}
              onChange={(e) => patch({ text: e.target.value.slice(0, MAX_CUSTOM_CHARS) })}
              placeholder="Paste your own public-domain short text here…（空行分段）" />
          </label>
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-2xl bg-sun-100/60 p-3 text-[11px] leading-relaxed text-[#8a5b08]">
            <input type="checkbox" className="mt-0.5" checked={form.declared}
              onChange={(e) => patch({ declared: e.target.checked })} />
            我确认该文本已进入公有领域（或我拥有完整权利），且仅用于本机语言学习；版权状态不明确的文本不会加入。
          </label>
          {formError && <p className="mt-2 text-xs font-semibold text-coral-600">{formError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={addCustomBook} className="btn-primary !px-4 !py-2 !text-xs">加入书架</button>
            <button type="button" onClick={() => { setShowForm(false); setFormError('') }} className="btn-ghost !px-4 !py-2 !text-xs">取消</button>
          </div>
        </Card>
      )}

      {/* [CEFR 等级层] 内容列表页顶部：等级是过滤器，不是门槛（常驻，不随 Tab 切换） */}
      <LevelPanel module="reading" />

      {/* 横滑分类 Tab：切换即过滤下方信息流 */}
      <FeedTabs tabs={tabs} active={tab} onChange={(id) => setTab(id as LibraryTab)} />

      {tab === 'level' && levelPool}

      {tab === 'feed' && (
        <div className="space-y-5">
          {/* 纯文字快讯：像资讯列表一样先给「今天该做什么」 */}
          <FeedBriefs items={briefs} title="今日研读速览" />

          {/* 大图蒙版头条：整个书架的记忆点 */}
          {featured ? (
            <FeedHero item={featured} onOpen={() => navigate('bookDetail', { bookId: featured.id })}
              corner={`共 ${items.length} 本`} />
          ) : (
            <EmptyState emblem="📚" title="书架暂时空着" desc="内置书库未加载成功，可到设置页清空数据后重新播种，或先添加一篇自有公版短篇。" />
          )}

          <section>
            <SectionTitle title="内置书单"
              subtitle="均为公有领域作品，每本都标注来源、适用地区与许可说明。"
              right={<Chip tone="sun" className="!whitespace-nowrap">已研讨 {seminarCount} 场</Chip>} />
            {items.length === 0 ? (
              <EmptyState emblem="📚" title="书架暂时空着" desc="内置书库未加载成功，可到设置页清空数据后重新播种，或先添加一篇自有公版短篇。" />
            ) : (
              <div className="space-y-2.5">
                {items.map((b) => (
                  <FeedBookCard key={b.id} item={b} onOpen={() => navigate('bookDetail', { bookId: b.id })} />
                ))}
              </div>
            )}
          </section>

          {levelPool}
        </div>
      )}

      {tab === 'mine' && (
        mineItems.length === 0 ? (
          <FeedEmpty title="还没有属于你的阅读足迹"
            desc="读完任意一章、写下第一条批注，或添加一篇自有公版短篇，这里就会长出内容。"
            action={<button type="button" onClick={() => setTab('feed')} className="btn-primary !px-4 !py-2 !text-xs">
              去书单里挑一本</button>} />
        ) : (
          <div className="space-y-2.5">
            {mineItems.map((b) => (
              <FeedBookCard key={b.id} item={b} onOpen={() => navigate('bookDetail', { bookId: b.id })} />
            ))}
          </div>
        )
      )}

      {tab === 'public' && (
        <div className="space-y-4">
          {/* 原有 5 本带全文的教学基线书：点击仍进 Reader，链路一字未改 */}
          {builtinItems.length > 0 && (
            <section>
              <SectionTitle title="精读基线书单"
                subtitle="这 5 本含逐章原文、分级改写与研讨素材，可进入阅读器逐段研读。"
                right={<Chip tone="brand" className="!whitespace-nowrap">{builtinItems.length} 本</Chip>} />
              <div className="space-y-2.5">
                {builtinItems.map((b) => (
                  <FeedBookCard key={b.id} item={b} onOpen={() => navigate('bookDetail', { bookId: b.id })} />
                ))}
              </div>
            </section>
          )}

          {/* [内容扩充] 100+ 本公版书元数据目录：动态加载 + 筛选 + 分页 */}
          <section data-testid="book-catalog">
            <SectionTitle title="英语文学公版书库"
              subtitle="按难度与主题筛选，每页 20 本。元数据卡提供中英简介与公版依据，全文请到古登堡计划查看。"
              right={<Chip tone="sun" className="!whitespace-nowrap">{catalog.length} 本</Chip>} />
            {catalogTags.length > 0 && (
              <CatalogFilter
                cefr={catCefr}
                onCefr={(v) => { setCatCefr(v); setCatPage(0) }}
                tag={catTag}
                onTag={(v) => { setCatTag(v); setCatPage(0) }}
                cefrOptions={catalogCefr}
                tags={catalogTags}
              />
            )}
            <p className="mt-2.5 text-[11px] font-bold text-muted">
              筛选出 {filteredCatalog.length} 本
            </p>
            <div className="mt-2.5 space-y-2.5">
              {catalogPageItems.map((entry) => (
                <CatalogBookCard key={entry.id} entry={entry} />
              ))}
            </div>
            <CatalogPager page={catPage} totalPages={catalogTotalPages} onPage={setCatPage} />
          </section>
        </div>
      )}

      {tab === 'seminar' && (
        data.seminars.length === 0 ? (
          <FeedEmpty title="还没有研讨记录"
            desc="读完一章后，点「发起研讨」就能围着那章开一场苏格拉底式问答。"
            action={<button type="button" disabled={!featured}
              onClick={() => featured && navigate('bookDetail', { bookId: featured.id })}
              className="btn-primary !px-4 !py-2 !text-xs disabled:opacity-40">
              去读第一章</button>} />
        ) : (
          <div className="space-y-2.5">
            {data.seminars.map((s) => (
              <FeedSeminarCard key={s.id} session={s}
                onOpen={() => navigate('seminar', { bookId: s.bookId, chapterId: s.chapterId, seminarId: s.id })} />
            ))}
          </div>
        )
      )}

      <p className="rounded-2xl bg-white/60 p-4 text-center text-[11px] leading-relaxed text-muted">
        阅读与研讨产生的新词仍写进现有 <code className="text-brand-600">lingua_review_queue</code>，
        语言问题仍写进 <code className="text-brand-600">lingua_mistakes</code>，XP 与连续天数沿用
        <code className="text-brand-600"> lingua_profile</code>。旧流程完全不受影响。
      </p>
    </div>

      {/* 底部悬浮工具条：只在书架页内部出现，不动全局 7 项导航。
          刻意放在 animate-in 容器之外 —— 动画容器残留的 transform 会给 fixed 后代
          创建包含块，把这条工具条钉回文档流。 */}
      <LibraryDock actions={dockActions} />

      {searchOpen && (
        <LibrarySearchSheet query={query} onQueryChange={setQuery} onClose={() => setSearchOpen(false)}
          hits={hits} hint="没有匹配结果。换个书名、章节标题或批注关键词试试。" />
      )}
    </>
  )
}
