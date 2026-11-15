import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import { uid } from '../lib/utils'
import { PUBLIC_DOMAIN_NOTICE } from '../data/librarySeed'
import { countWords, hasValidProvenance, listBookItems } from '../services/literaryCurator'
import type { LiteraryBook, LiteraryChapter } from '../literaryTypes'
import {
  BookCover, CopyrightNote, LiteraryHeader, LiterarySection,
} from '../components/LiteraryBits'
import { Card, Chip, EmptyState, Icon, ProgressBar, SectionTitle } from '../components/ui'
/** [CEFR 等级层] 阅读模块共用同一套等级面板与内容池 */
import { LevelPanel } from '../components/LevelPanel'
import { LevelContentList } from '../components/LevelContentList'

const MAX_CUSTOM_CHARS = 20000

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
  const [form, setForm] = useState({
    title: '', author: '', source: '', region: '', license: '我声明该文本属于公有领域（Public Domain），或我本人拥有相应权利并允许本地学习使用。',
    text: '', declared: false,
  })
  const [formError, setFormError] = useState('')

  // 版权三件套不完整的书一律不展示，从 UI 层兜住「不确定就不内置」
  const items = listBookItems(data.library, data.readingProgress)
    .filter((item) => {
      const book = data.library.books.find((b) => b.id === item.id)
      return book ? (book.custom || hasValidProvenance(book)) : false
    })

  const seminarCount = data.seminars.length
  const patch = (p: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...p }))

  const addCustomBook = () => {
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
    update((prev) => ({ ...prev, library: { ...prev.library, books: [...prev.library.books, book] } }))
    setForm({ title: '', author: '', source: '', region: '', license: form.license, text: '', declared: false })
    setShowForm(false)
    notify('公版短篇已加入书架，可以逐段研读啦 📄')
  }

  return (
    <div className="animate-in space-y-5">
      <LiteraryHeader eyebrow="LITERARY READING · 文学长廊" title="经典英文文学研读"
        subtitle="按章节读原文，再围着一章做一场苏格拉底式研讨。与「角色对话」并列，互不替代。"
        right={<Chip tone="brand">{items.length} 本公版书</Chip>} />

      <CopyrightNote text={PUBLIC_DOMAIN_NOTICE} />

      {/* [CEFR 等级层] 内容列表页顶部：等级是过滤器，不是门槛 */}
      <LevelPanel module="reading" />

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => navigate('readingProgress')}
          className="card flex items-center gap-3 p-4 text-left transition hover:border-brand-300">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon name="chart" size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">阅读进度</p>
            <p className="truncate text-xs text-muted">已读书目 · 章节完成度 · 研讨次数</p>
          </div>
          <Icon name="right" size={16} className="text-muted" />
        </button>
        <button type="button" onClick={() => setShowForm((v) => !v)}
          className="card flex items-center gap-3 p-4 text-left transition hover:border-brand-300">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint-100 text-mint-600"><Icon name="plus" size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">添加自有公版短篇</p>
            <p className="truncate text-xs text-muted">需明确版权声明 · 不开放整本书上传</p>
          </div>
          <Icon name="down" size={16} className="text-muted" />
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

      <LiterarySection title="内置书单" subtitle="均为公有领域作品，每本都标注来源、适用地区与许可说明。"
        right={<Chip tone="sun">已研讨 {seminarCount} 场</Chip>}>
        {items.length === 0 ? (
          <EmptyState emblem="📚" title="书架暂时空着" desc="内置书库未加载成功，可到设置页清空数据后重新播种，或先添加一篇自有公版短篇。" />
        ) : (
          <div className="space-y-2.5">
            {items.map((b) => (
              <button key={b.id} type="button" onClick={() => navigate('bookDetail', { bookId: b.id })}
                className="card flex w-full items-center gap-3.5 p-4 text-left transition hover:border-brand-300">
                <BookCover emblem={b.emblem} from={b.coverFrom} to={b.coverTo} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="en-text truncate text-sm font-bold text-ink">{b.title}</p>
                    <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">{b.cefr}</Chip>
                    {b.custom && <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">自有短篇</Chip>}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted">{b.author} · {b.year || '年代未标注'} · {b.chapterCount} 章节选 · 约 {b.totalWords} 词</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{b.blurb}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar value={b.percent} className="!h-1.5" />
                    <span className="shrink-0 text-[10px] font-semibold text-brand-600">{b.completed}/{b.chapterCount}</span>
                  </div>
                  <p className="mt-1.5 truncate text-[10px] text-muted">来源：{b.source}</p>
                </div>
                <Icon name="right" size={16} className="shrink-0 text-muted" />
              </button>
            ))}
          </div>
        )}
      </LiterarySection>

      {/* [CEFR 等级层] 分级阅读内容池：只经 LevelFilterService 取内容；既有书单常驻「全部内容」视图 */}
      <LevelContentList module="reading" />

      <p className="rounded-2xl bg-white/60 p-4 text-center text-[11px] leading-relaxed text-muted">
        阅读与研讨产生的新词仍写进现有 <code className="text-brand-600">lingua_review_queue</code>，
        语言问题仍写进 <code className="text-brand-600">lingua_mistakes</code>，XP 与连续天数沿用
        <code className="text-brand-600"> lingua_profile</code>。旧流程完全不受影响。
      </p>
    </div>
  )
}
