import { useApp } from '../store/useAppStore'
import { filterVideos } from '../services/cultureCurator'
import {
  CultureHeader, CultureSection, VideoCover,
} from '../components/CultureBits'
import { Card, Chip, EmptyState, Icon, ProgressBar, SectionTitle } from '../components/ui'

export function CultureReview() {
  const { data, navigate } = useApp()
  const videos = data.cultureVideos.videos
  const items = filterVideos(data.cultureVideos, data.watchProgress, { targetCefr: data.settings.difficulty })
  const watchedItems = items.filter((v) => v.watched)
  const sessions = data.postWatchSessions
  const finished = sessions.filter((s) => s.finishedAt).length
  const totalTurns = sessions.reduce((n, s) => n + s.turns, 0)
  const savedExpressions = data.cultureNotes.savedExpressions
  const notes = data.cultureNotes.notes
  const favorites = data.cultureNotes.favorites

  return (
    <div className="animate-in space-y-5">
      <CultureHeader eyebrow="CULTURE REVIEW · 文化复习" title="看过的、聊过的，都留下了"
        subtitle="已看视频、收藏的短表达与观后讨论记录都只存在这台设备的浏览器里，刷新不会丢。"
        right={<Chip tone="coral">{watchedItems.length} / {items.length} 条已看</Chip>} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: '已看视频', value: `${watchedItems.length}/${items.length}`, emblem: '🎬', tone: 'bg-brand-50 text-brand-600' },
          { label: '观后讨论', value: `${finished} 场`, emblem: '💬', tone: 'bg-coral-100 text-coral-600' },
          { label: '讨论轮次', value: `${totalTurns} 轮`, emblem: '🪑', tone: 'bg-sun-100 text-[#a56a08]' },
          { label: '新增表达', value: `${savedExpressions.length} 条`, emblem: '🔤', tone: 'bg-mint-100 text-mint-600' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-3.5 ${s.tone}`}>
            <p className="text-xl">{s.emblem}</p>
            <p className="font-display mt-1 text-lg font-black">{s.value}</p>
            <p className="mt-0.5 text-[10px] font-semibold opacity-75">{s.label}</p>
          </div>
        ))}
      </div>

      <CultureSection title="已看视频" subtitle="点一条可回到观看页，继续看或再开一场观后讨论。">
        {watchedItems.length === 0 ? (
          <EmptyState emblem="🌱" title="还没有看完第一条视频"
            desc="去文化首页挑一条，看完点「我已完成观看」就能解锁观后讨论。"
            action={<button type="button" onClick={() => navigate('cultureHub')} className="btn-primary !px-4 !py-2 !text-xs">去文化首页</button>} />
        ) : (
          <div className="space-y-2.5">
            {watchedItems.map((v) => {
              const rec = data.watchProgress[v.id]
              const segDone = rec?.visitedSegmentIds?.length || 0
              const bookSessions = sessions.filter((s) => s.videoId === v.id)
              return (
                <button key={v.id} type="button" onClick={() => navigate('watch', { videoId: v.id })}
                  className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand-300">
                  <VideoCover emblem={v.emblem} from={v.coverFrom} to={v.coverTo} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="en-text truncate text-xs font-bold text-ink">{v.title}</p>
                      <span className="shrink-0 text-[10px] font-bold text-brand-600">✓ 已看</span>
                    </div>
                    <ProgressBar value={1} className="mt-1.5 !h-1.5" />
                    <p className="mt-1.5 truncate text-[10px] text-muted">
                      {v.platformLabel} · {segDone}/{v.segmentCount} 分段 · 观后讨论 {bookSessions.length} 场
                    </p>
                  </div>
                  <Icon name="right" size={15} className="shrink-0 text-muted" />
                </button>
              )
            })}
          </div>
        )}
      </CultureSection>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <SectionTitle title="收藏的短表达" subtitle="保存在 lingua_culture_notes，同时写入现有复习队列。" />
          {savedExpressions.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted">还没有收藏短表达；在观看页的「关键表达」卡点一下「加入复习队列」就会出现在这里。</p>
          ) : (
            <div className="space-y-1.5">
              {savedExpressions.slice(0, 8).map((e) => (
                <p key={e} className="en-text rounded-xl bg-mint-100/60 px-3 py-2 text-[11px] font-semibold leading-relaxed text-ink/80">“{e}”</p>
              ))}
            </div>
          )}
          <button type="button" onClick={() => navigate('review')} className="btn-ghost mt-3 w-full !py-2 !text-xs">
            去现有复习页打卡 <Icon name="right" size={13} />
          </button>
        </Card>

        <Card>
          <SectionTitle title="文化笔记与收藏" subtitle="原创短注释（不是字幕）与收藏的视频。" />
          <div className="space-y-1.5 text-[11px]">
            <p className="flex justify-between"><span className="text-muted">📝 原创短注释</span><b className="text-ink">{notes.length} 条</b></p>
            <p className="flex justify-between"><span className="text-muted">🔖 收藏视频</span><b className="text-ink">{favorites.length} 条</b></p>
            <p className="flex justify-between"><span className="text-muted">🎬 视频库条目</span><b className="text-ink">{videos.length} 条</b></p>
            <p className="flex justify-between"><span className="text-muted">🔤 入队短表达</span><b className="text-ink">{savedExpressions.length} 条</b></p>
          </div>
          {notes.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {notes.slice(-3).reverse().map((n) => (
                <p key={n.id} className="rounded-xl bg-brand-50/70 px-3 py-2 text-[10px] leading-relaxed text-ink/80">{n.text}</p>
              ))}
            </div>
          )}
        </Card>
      </div>

      {sessions.length > 0 && (
        <CultureSection title="观后讨论记录" subtitle="保存在 lingua_postwatch_sessions，与角色对话、文学研讨记录互不干扰。">
          <Card>
            <div className="space-y-1.5">
              {sessions.slice(0, 6).map((s) => (
                <button key={s.id} type="button"
                  onClick={() => navigate('postWatch', { videoId: s.videoId, postWatchId: s.id })}
                  className="w-full rounded-xl bg-brand-50/70 px-3 py-2 text-left text-[11px] leading-relaxed text-ink/80 hover:bg-brand-100">
                  <b>{s.videoTitleZh}</b> · {s.turns} 轮 · {s.finishedAt ? '已生成小结' : '进行中'}
                  {s.report && <span className="ml-1 text-brand-600">+{s.report.xp} XP</span>}
                </button>
              ))}
            </div>
          </Card>
        </CultureSection>
      )}

      <Card>
        <SectionTitle title="数据落点" subtitle="文化模块新增 5 个键（含播放列表注册表），旧键语义一字未改。" />
        <div className="grid grid-cols-2 gap-1.5 text-[10px] sm:grid-cols-4">
          {['lingua_culture_videos', 'lingua_watch_progress', 'lingua_postwatch_sessions',
            'lingua_culture_notes', 'lingua_playlist_registry'].map((k) => (
            <code key={k} className="truncate rounded-lg bg-coral-100/60 px-2 py-1.5 text-coral-600">{k}</code>
          ))}
          {['lingua_review_queue', 'lingua_mistakes', 'lingua_profile', 'lingua_settings'].map((k) => (
            <code key={k} className="truncate rounded-lg bg-brand-50/70 px-2 py-1.5 text-brand-600">{k}</code>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-muted">
          橙红是新键；蓝色是复用的现有键。观看与观后讨论产生的新词、语言问题、XP 与成就依旧写回原来的队列与档案，
          「文本分析 → 角色对话」与「文学阅读 → 文学研讨」两条流程完全不受影响。
        </p>
      </Card>
    </div>
  )
}
