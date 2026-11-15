import { useApp } from '../store/useAppStore'
import { listBookItems, listChapters } from '../services/literaryCurator'
import { BookCover, LiteraryHeader, LiterarySection } from '../components/LiteraryBits'
import { Card, Chip, EmptyState, Icon, ProgressBar, SectionTitle } from '../components/ui'

export function ReadingProgress() {
  const { data, navigate } = useApp()
  const items = listBookItems(data.library, data.readingProgress)
  const started = items.filter((b) => b.completed > 0 || data.readingProgress[b.id]?.chapterId)
  const finishedSeminars = data.seminars.filter((s) => s.finishedAt).length
  const totalSeminars = data.seminars.length
  const totalTurns = data.seminars.reduce((n, s) => n + s.turns, 0)
  const newWords = data.literaryNotes.savedWords.length
  const notes = data.literaryNotes.notes.length
  const highlights = data.literaryNotes.highlights.length
  const bookmarks = data.literaryNotes.bookmarks.length
  const totalChapters = items.reduce((n, b) => n + b.chapterCount, 0)
  const completedChapters = items.reduce((n, b) => n + b.completed, 0)
  const briefs = Object.keys(data.library.briefs || {}).length

  return (
    <div className="animate-in space-y-5">
      <LiteraryHeader eyebrow="READING PROGRESS · 阅读进度" title="读过的路，都留着脚印"
        subtitle="书目、章节、研讨、新词与批注都只存在这台设备的浏览器里，刷新不会丢。"
        right={<Chip tone="brand">{started.length} / {items.length} 本在读</Chip>} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: '章节完成', value: `${completedChapters}/${totalChapters}`, emblem: '📖', tone: 'bg-brand-50 text-brand-600' },
          { label: '研讨场次', value: `${finishedSeminars} 场`, emblem: '🪑', tone: 'bg-mint-100 text-mint-600' },
          { label: '研讨轮次', value: `${totalTurns} 轮`, emblem: '💬', tone: 'bg-sun-100 text-[#a56a08]' },
          { label: '新增词汇', value: `${newWords} 个`, emblem: '🔤', tone: 'bg-coral-100 text-coral-600' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-3.5 ${s.tone}`}>
            <p className="text-xl">{s.emblem}</p>
            <p className="font-display mt-1 text-lg font-black">{s.value}</p>
            <p className="mt-0.5 text-[10px] font-semibold opacity-75">{s.label}</p>
          </div>
        ))}
      </div>

      <LiterarySection title="已读书目" subtitle="点一本书可回到详情，继续从上次那一章读起。">
        {started.length === 0 ? (
          <EmptyState emblem="🌱" title="还没有开始读第一本书" desc="去书架挑一本公版经典，从第一章的原文开始。"
            action={<button type="button" onClick={() => navigate('library')} className="btn-primary !px-4 !py-2 !text-xs">去书架</button>} />
        ) : (
          <div className="space-y-2.5">
            {started.map((b) => {
              const rec = data.readingProgress[b.id]
              const chapters = listChapters(data.library, b.id)
              const current = chapters.find((c) => c.id === rec?.chapterId)
              const bookSeminars = data.seminars.filter((s) => s.bookId === b.id)
              return (
                <button key={b.id} type="button" onClick={() => navigate('bookDetail', { bookId: b.id })}
                  className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand-300">
                  <BookCover emblem={b.emblem} from={b.coverFrom} to={b.coverTo} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="en-text truncate text-xs font-bold text-ink">{b.title}</p>
                      <span className="shrink-0 text-[10px] font-bold text-brand-600">{Math.round(b.percent * 100)}%</span>
                    </div>
                    <ProgressBar value={b.percent} className="mt-1.5 !h-1.5" />
                    <p className="mt-1.5 truncate text-[10px] text-muted">
                      {b.completed}/{b.chapterCount} 章 · 最近读到 {current?.title || '未开始'} · 研讨 {bookSeminars.length} 场
                    </p>
                  </div>
                  <Icon name="right" size={15} className="shrink-0 text-muted" />
                </button>
              )
            })}
          </div>
        )}
      </LiterarySection>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <SectionTitle title="批注与书签" subtitle="全部保存在 lingua_literary_notes。" />
          <div className="space-y-1.5 text-[11px]">
            <p className="flex justify-between"><span className="text-muted">📝 批注</span><b className="text-ink">{notes} 条</b></p>
            <p className="flex justify-between"><span className="text-muted">🖍 高亮段落</span><b className="text-ink">{highlights} 处</b></p>
            <p className="flex justify-between"><span className="text-muted">🔖 章节书签</span><b className="text-ink">{bookmarks} 个</b></p>
            <p className="flex justify-between"><span className="text-muted">📜 章节前情摘要</span><b className="text-ink">{briefs} 份</b></p>
          </div>
        </Card>
        <Card>
          <SectionTitle title="研讨记录" subtitle="保存在 lingua_seminars，与角色对话记录互不干扰。" />
          <div className="space-y-1.5 text-[11px]">
            <p className="flex justify-between"><span className="text-muted">会话总数</span><b className="text-ink">{totalSeminars} 场</b></p>
            <p className="flex justify-between"><span className="text-muted">已完成</span><b className="text-ink">{finishedSeminars} 场</b></p>
            <p className="flex justify-between"><span className="text-muted">累计发言</span><b className="text-ink">{totalTurns} 轮</b></p>
            <p className="flex justify-between"><span className="text-muted">新词入队</span><b className="text-ink">{newWords} 个</b></p>
          </div>
          {totalSeminars > 0 && (
            <div className="mt-3 space-y-1.5">
              {data.seminars.slice(0, 3).map((s) => (
                <button key={s.id} type="button"
                  onClick={() => navigate('seminar', { bookId: s.bookId, chapterId: s.chapterId, seminarId: s.id })}
                  className="w-full rounded-xl bg-brand-50/70 px-3 py-2 text-left text-[10px] leading-relaxed text-ink/80 hover:bg-brand-100">
                  <b>{s.chapterTitle}</b> · {s.turns} 轮 · {s.finishedAt ? '已生成小结' : '进行中'}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle title="数据落点" subtitle="新模块只新增 4 个键，旧键语义一字未改。" />
        <div className="grid grid-cols-2 gap-1.5 text-[10px] sm:grid-cols-4">
          {['lingua_library', 'lingua_reading_progress', 'lingua_seminars', 'lingua_literary_notes'].map((k) => (
            <code key={k} className="rounded-lg bg-mint-100/60 px-2 py-1.5 text-mint-600">{k}</code>
          ))}
          {['lingua_review_queue', 'lingua_mistakes', 'lingua_profile', 'lingua_settings'].map((k) => (
            <code key={k} className="rounded-lg bg-brand-50/70 px-2 py-1.5 text-brand-600">{k}</code>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-muted">
          绿色是新键；蓝色是复用的现有键。阅读与研讨产生的新词、语言问题、XP 与成就依旧写回原来的队列与档案，
          「文本分析 → 角色对话」的流程完全不受影响。
        </p>
      </Card>
    </div>
  )
}
