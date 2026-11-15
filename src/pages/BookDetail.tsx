import { useApp } from '../store/useAppStore'
import { getBook, listChapters, progressRecord } from '../services/literaryCurator'
import { LiteraryHeader, BookCover, LiterarySection } from '../components/LiteraryBits'
import { Card, Chip, EmptyState, Icon, ProgressBar, SectionTitle } from '../components/ui'
/** [CEFR 等级层] 章节粒度筛选与注释深度只读取统一等级服务 */
import { annotationDepthFor } from '../services/levelFilter'
import { poolItemById } from '../data/levelPool'

export function BookDetail() {
  const { data, params, navigate } = useApp()
  const book = getBook(data.library, params.bookId)
  const chapters = listChapters(data.library, params.bookId)
  const record = progressRecord(data.readingProgress, params.bookId || '', data.settings.readingView)
  const seminarsForBook = data.seminars.filter((s) => s.bookId === params.bookId)

  if (!book) {
    return (
      <div className="space-y-4">
        <EmptyState emblem="📕" title="没有找到这本书" desc="它可能已被移除，或者链接里的书目编号已经失效。" />
        <button type="button" onClick={() => navigate('library')} className="btn-primary w-full">返回书架</button>
      </div>
    )
  }

  const completed = new Set(record.completedChapterIds)
  const pct = chapters.length ? completed.size / chapters.length : 0
  const current = chapters.find((c) => c.id === record.chapterId) || chapters[0]
  const started = Boolean(record.chapterId)
  /** [CEFR 等级层] 同一文本、按等级给不同注释深度（The Reading Corner 思路，不改反馈逻辑） */
  const annotation = annotationDepthFor(data.levelPreference, 'reading')

  return (
    <div className="animate-in space-y-5">
      <button type="button" onClick={() => navigate('library')}
        className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline">
        <Icon name="left" size={14} />返回书架
      </button>

      <div data-testid="reading-level-note" className="rounded-2xl bg-brand-50/70 px-4 py-3 text-[11px] leading-relaxed text-brand-700">
        当前等级 {annotation.level} · 章节按粒度各自标级（章节卡片上的 CEFR 可能与书籍级不同）· 注释深度：{annotation.label}。
        跳级 / 留级只改筛选偏好，不锁任何章节。
      </div>

      <Card>
        <div className="flex items-start gap-4">
          <BookCover emblem={book.emblem} from={book.coverFrom} to={book.coverTo} size="lg" />
          <div className="min-w-0 flex-1">
            <LiteraryHeader eyebrow="BOOK DETAIL · 书籍详情" title={book.title}
              subtitle={`${book.author} · ${book.year || '年代未标注'} · CEFR ${book.cefr}`} />
            <p className="mt-3 text-xs leading-relaxed text-ink/80">{book.blurb}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {book.themes.map((t) => <Chip key={t} tone="brand" className="!px-2 !py-0.5 !text-[10px]">✦ {t}</Chip>)}
              {book.characters.slice(0, 4).map((c) => <Chip key={c} tone="mint" className="!px-2 !py-0.5 !text-[10px]">{c}</Chip>)}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-brand-50 pt-4">
          <div className="flex items-center justify-between text-[11px] font-bold text-ink">
            <span>阅读进度</span><span>{completed.size} / {chapters.length} 章节选</span>
          </div>
          <ProgressBar value={pct} className="mt-2" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('reader', { bookId: book.id, chapterId: (started ? current?.id : chapters[0]?.id) })}
              className="btn-primary !px-4 !py-2 !text-xs">
              <Icon name="book" size={14} />{started ? '继续阅读' : '开始阅读'}
            </button>
            {current && (
              <button type="button" onClick={() => navigate('reader', { bookId: book.id, chapterId: current.id })}
                className="btn-ghost !px-4 !py-2 !text-xs">从头读第一章</button>
            )}
            <button type="button" onClick={() => navigate('readingProgress')}
              className="btn-ghost !px-4 !py-2 !text-xs">阅读进度</button>
          </div>
          {seminarsForBook.length > 0 && (
            <p className="mt-2 text-[11px] text-muted">本书已完成 {seminarsForBook.filter((s) => s.finishedAt).length} 场研讨，共 {seminarsForBook.length} 条会话记录。</p>
          )}
        </div>
      </Card>

      <LiterarySection title="章节列表" subtitle="每章独立分析、独立研讨；章节标题后标注的是教学节选范围，不是完整原书章。"
        right={<Chip tone="sun">{chapters.length} 章</Chip>}>
        {chapters.length === 0 ? (
          <EmptyState emblem="📑" title="这本书还没有章节" desc="可先在书架页添加一篇自有公版短篇。" />
        ) : (
          <div className="space-y-2">
            {chapters.map((c) => (
              <div key={c.id} className="card flex items-center gap-3 p-3.5">
                <button type="button" onClick={() => navigate('reader', { bookId: book.id, chapterId: c.id })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ${completed.has(c.id) ? 'bg-mint-100 text-mint-600' : 'bg-brand-50 text-brand-600'}`}>
                    {completed.has(c.id) ? <Icon name="check" size={15} /> : c.order}
                  </div>
                  <div className="min-w-0">
                    <p className="en-text truncate text-xs font-bold text-ink">{c.title}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted">{c.excerptRange}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Chip tone="slate" className="!px-2 !py-0.5 !text-[10px]">{c.wordCount} 词</Chip>
                      <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">CEFR {c.cefr}</Chip>
                      <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">{c.paragraphCount} 段</Chip>
                      {c.hasBrief && <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">已有前情摘要</Chip>}
                    </div>
                    {poolItemById(`read-ch-${c.id}`) && (
                      <p className="mt-1 line-clamp-1 text-[10px] leading-relaxed text-muted">
                        难度依据：{poolItemById(`read-ch-${c.id}`)?.levelNotes}
                      </p>
                    )}
                  </div>
                </button>
                <Icon name="right" size={15} className="shrink-0 text-muted" />
              </div>
            ))}
          </div>
        )}
      </LiterarySection>

      <Card>
        <SectionTitle title="版权与书源" subtitle="版权状态无法确认的作品一律不内置；本页信息随书一起保存在本机。" />
        <dl className="space-y-2.5 text-[11px] leading-relaxed">
          <div className="rounded-2xl bg-brand-50/60 p-3">
            <dt className="font-bold text-brand-600">来源 Source</dt><dd className="mt-0.5 break-all text-ink/80">{book.source}</dd>
          </div>
          <div className="rounded-2xl bg-brand-50/60 p-3">
            <dt className="font-bold text-brand-600">公有领域适用地区 Public Domain Region</dt><dd className="mt-0.5 text-ink/80">{book.publicDomainRegion}</dd>
          </div>
          <div className="rounded-2xl bg-brand-50/60 p-3">
            <dt className="font-bold text-brand-600">许可说明 License Note</dt><dd className="mt-0.5 text-ink/80">{book.licenseNote}</dd>
          </div>
          <div className="rounded-2xl bg-sun-100/50 p-3">
            <dt className="font-bold text-[#a56a08]">节选声明 Excerpt Note</dt><dd className="mt-0.5 text-ink/80">{book.excerptNote}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[10px] leading-relaxed text-muted">
          不同国家或地区对公有领域的认定规则可能不同；如你所在法域有特别规定，请以当地法律与 Project Gutenberg 的作品页标注为准。
        </p>
      </Card>
    </div>
  )
}
