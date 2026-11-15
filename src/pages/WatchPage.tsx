import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { uid } from '../lib/utils'
import { speak, stopSpeaking } from '../lib/speech'
import { SRS_INTERVALS } from '../services/coach'
import { notesFor } from '../services/cultureCurator'
import { analyzeVideoCulture, mockAnalyzeVideoCulture } from '../services/cultureAnalyzer'
import { PLATFORM_POLICIES, SHORT_QUOTE_NOTE } from '../data/cultureSeed'
import type { CaptionPreference, CultureAnalysis, VideoNote } from '../cultureTypes'
import type { ReviewItem } from '../types'
import {
  BackgroundCardView, CulturalThemeCards, CultureHeader, CultureLoadError,
  CultureLoader, CultureSection, ExpressionCards, OfficialEmbedPlayer,
  PlatformBadges, SeedQuestionCards, SegmentMarkers, SourceNotice,
} from '../components/CultureBits'
import { Card, Chip, EmptyState, Icon, SectionTitle } from '../components/ui'

const CAPTION_OPTIONS: Array<{ v: CaptionPreference; label: string; hint: string }> = [
  { v: 'on', label: '开', hint: '打开播放器自带 CC' },
  { v: 'off', label: '关', hint: '关闭播放器自带 CC' },
  { v: 'bilingual', label: '中英对照', hint: 'CC 打开 + 应用内短引用卡' },
]

export function WatchPage() {
  const { data, params, navigate, update, notify } = useApp()
  const video = data.cultureVideos.videos.find((v) => v.id === params.videoId)

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [analysis, setAnalysis] = useState<CultureAnalysis | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [loadNonce, setLoadNonce] = useState(0)
  const [activeSegmentId, setActiveSegmentId] = useState<string>('')
  const [noteText, setNoteText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // 用户原创短注释 → 转成分析器输入（不是字幕）
  const userNotes: VideoNote[] = video
    ? notesFor(data.cultureNotes.notes, video.id).map((n) => ({
      id: n.id, text: n.text, createdAt: n.createdAt,
    }))
    : []

  /** 单条视频分析：远程失败 → 本地 Mock；素材只有元数据 + 短注释 */
  useEffect(() => {
    if (!video) return
    let alive = true
    setStatus('loading')
    void (async () => {
      let result: CultureAnalysis
      try {
        result = await analyzeVideoCulture({
          video,
          userNotes: notesFor(data.cultureNotes.notes, video.id).map((n) => ({
            id: n.id, text: n.text, createdAt: n.createdAt,
          })),
          targetDifficulty: data.settings.difficulty,
        })
      } catch (err) {
        console.warn('[LinguaBuddy] 文化分析回退本地 Mock：', err)
        result = mockAnalyzeVideoCulture({
          video,
          userNotes: notesFor(data.cultureNotes.notes, video.id).map((n) => ({
            id: n.id, text: n.text, createdAt: n.createdAt,
          })),
          targetDifficulty: data.settings.difficulty,
        })
      }
      if (!alive) return
      if (!result?.videoId) { setErrorMsg('文化分析结果为空'); setStatus('error'); return }
      setAnalysis(result)
      setStatus('ready')
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.videoId, loadNonce])

  useEffect(() => () => { try { stopSpeaking() } catch { /* 忽略 */ } }, [])

  if (!video) {
    return (
      <div className="space-y-4">
        <CultureLoadError title="没有找到这个视频" desc="请先从文化首页选一条视频再进入观看页。"
          onRetry={() => navigate('cultureHub')} onBack={() => navigate('cultureHub')} />
      </div>
    )
  }

  const policy = PLATFORM_POLICIES[video.platform]
  const progress = data.watchProgress[video.id]
  const watched = Boolean(progress?.watched)
  const saved = data.cultureNotes.savedExpressions
  const favorite = data.cultureNotes.favorites.includes(video.id)

  const patchProgress = (patch: Partial<NonNullable<typeof progress>>) => {
    update((prev) => {
      const base = prev.watchProgress[video.id] || {
        videoId: video.id, watched: false, visitedSegmentIds: [], updatedAt: Date.now(),
      }
      return {
        ...prev,
        watchProgress: {
          ...prev.watchProgress,
          [video.id]: { ...base, ...patch },
        },
      }
    })
  }

  const pickSegment = (seg: { id: string; label: string }) => {
    setActiveSegmentId(seg.id)
    const visited = progress?.visitedSegmentIds || []
    patchProgress({
      lastPosition: seg.id,
      visitedSegmentIds: visited.includes(seg.id) ? visited : [...visited, seg.id],
    })
    notify(`已切到分段「${seg.label}」· 这是元数据提示，不解析字幕或视频流`)
  }

  /** 短引用 → 写入现有 lingua_review_queue（沿用 SRS 调度）+ 文化笔记统计 */
  const saveExpression = (expression: string) => {
    const hit = analysis?.keyExpressions.find((e) => e.expression === expression)
    const now = Date.now()
    update((prev) => {
      const queue: ReviewItem[] = [...prev.reviewQueue]
      const idx = queue.findIndex((q) => q.content.trim().toLowerCase() === expression.toLowerCase())
      if (idx >= 0) queue[idx] = { ...queue[idx], dueAt: now }
      else queue.push({
        id: uid('rev'), kind: 'phrase', content: expression,
        meaning: hit?.meaningZh || '视频短引用',
        example: hit?.context || `From ${video.title}`,
        level: 0, dueAt: now + SRS_INTERVALS[0] * 24 * 60 * 60 * 1000, createdAt: now,
      })
      const savedExpressions = prev.cultureNotes.savedExpressions.includes(expression)
        ? prev.cultureNotes.savedExpressions
        : [...prev.cultureNotes.savedExpressions, expression]
      return { ...prev, reviewQueue: queue, cultureNotes: { ...prev.cultureNotes, savedExpressions } }
    })
    notify(`「${expression}」已加入复习队列 🔤`)
  }

  const addNote = () => {
    const text = noteText.trim()
    if (!text) return
    if (text.length > 300) { notify('短注释请控制在 300 字以内，不要粘贴字幕全文'); return }
    update((prev) => ({
      ...prev,
      cultureNotes: {
        ...prev.cultureNotes,
        notes: [...prev.cultureNotes.notes, {
          id: uid('cn'), videoId: video.id, text, createdAt: Date.now(),
        }].slice(0, 200),
      },
    }))
    setNoteText('')
    notify('原创短注释已保存，重新分析时会作为素材（不是字幕）')
  }

  const toggleFavorite = () => {
    update((prev) => ({
      ...prev,
      cultureNotes: {
        ...prev.cultureNotes,
        favorites: favorite
          ? prev.cultureNotes.favorites.filter((id) => id !== video.id)
          : [...prev.cultureNotes.favorites, video.id],
      },
    }))
    notify(favorite ? '已取消收藏' : '已收藏这条视频 🔖')
  }

  /** 观看完成 → 解锁「进入观后讨论」；纯点击不发 XP（XP 只奖励完成单元） */
  const markWatched = () => {
    patchProgress({ watched: true, completedAt: Date.now() })
    notify('观看完成！已解锁观后讨论，聊完 4 轮才算一个学习单元 🎬')
    if (data.settings.autoEnterPostWatch) {
      window.setTimeout(() => {
        navigate('postWatch', { videoId: video.id })
        bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
      }, 500)
    }
  }

  const setCaption = (v: CaptionPreference) => {
    update((prev) => ({ ...prev, settings: { ...prev.settings, captionPreference: v } }))
    notify(`字幕偏好：${CAPTION_OPTIONS.find((o) => o.v === v)?.label}`)
  }

  return (
    <div className="animate-in space-y-4">
      {/* 页头 */}
      <Card className="!p-4">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => navigate('cultureHub')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-label="返回文化首页">
            <Icon name="left" size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="coral" className="!px-2 !py-0.5 !text-[10px] tracking-widest">WATCH · 观看与理解</Chip>
              <Chip tone="slate" className="!px-2 !py-0.5 !text-[10px]">{video.durationLabel}</Chip>
            </div>
            <p className="en-text mt-1.5 truncate font-display text-sm font-bold text-ink">{video.title}</p>
            <p className="truncate text-[11px] text-muted">{video.titleZh} · {policy.label}</p>
          </div>
        </div>
        <div className="mt-3"><PlatformBadges video={video} /></div>
        <p className="mt-2.5 rounded-2xl bg-brand-50/70 p-3 text-[11px] leading-relaxed text-ink/80">
          <b className="text-brand-600">内容梗概（原创，非字幕）：</b>{video.summaryZh}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-brand-50 pt-3">
          <span className="text-[11px] font-semibold text-muted">字幕偏好（只作用于平台自带 CC）</span>
          <button type="button" onClick={toggleFavorite}
            className={`rounded-xl px-2.5 py-1.5 text-[10px] font-bold ${favorite ? 'bg-sun-100 text-[#a56a08]' : 'bg-slate-100 text-muted'}`}>
            {favorite ? '🔖 已收藏' : '🔖 收藏'}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {CAPTION_OPTIONS.map((o) => (
            <button key={o.v} type="button" title={o.hint} onClick={() => setCaption(o.v)}
              className={`rounded-xl px-1 py-1.5 text-[10px] font-bold transition ${data.settings.captionPreference === o.v ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-600'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </Card>

      {status === 'loading' && <Card><CultureLoader text="正在整理这条视频的文化背景…" /></Card>}
      {status === 'error' && (
        <CultureLoadError title="文化卡片没能准备好" desc={errorMsg}
          onRetry={() => { setErrorMsg(''); setLoadNonce((n) => n + 1) }}
          onBack={() => navigate('cultureHub')} />
      )}

      {status === 'ready' && analysis && (
        <>
          {/* 播放器：主体，任何注释都不叠在播放器上 */}
          <OfficialEmbedPlayer video={video} captionPreference={data.settings.captionPreference} />

          {/* 来源 / 许可说明（完整版） */}
          <SourceNotice text={`${policy.label} · ${policy.license}。署名：${video.attribution}。${policy.note}`} />

          {/* 分段观看 + 观看完成 */}
          <Card>
            <SectionTitle title="分段观看" subtitle="时间段由元数据预配置，只作观看提示，不解析字幕或视频流。"
              right={<Chip tone="slate">{progress?.visitedSegmentIds?.length || 0}/{video.segments.length} 已看</Chip>} />
            <SegmentMarkers segments={video.segments} activeId={activeSegmentId} onPick={pickSegment} />
            <div className="mt-3 flex flex-wrap gap-2 border-t border-brand-50 pt-3">
              <button type="button" onClick={markWatched}
                className={`btn-ghost !px-3 !py-2 !text-[11px] ${watched ? '!border-mint-300 !bg-mint-100 !text-mint-600' : ''}`}>
                <Icon name="check" size={14} />{watched ? '✓ 已完成观看' : '我已完成观看'}
              </button>
              {watched && (
                <button type="button" onClick={() => navigate('postWatch', { videoId: video.id })}
                  className="btn-primary !px-4 !py-2 !text-[11px]">
                  进入观后讨论 <Icon name="right" size={13} />
                </button>
              )}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              {watched
                ? data.settings.autoEnterPostWatch ? '已按设置自动进入观后讨论。' : '观看完成后即可进入观后讨论；也可在设置页开启自动进入。'
                : '看完后点「我已完成观看」解锁观后讨论；Mock 占位与链接降级条目也可直接完成闭环。'}
            </p>
          </Card>

          {/* 文化背景卡 + 主题卡 */}
          <CultureSection title="理解 · 文化背景" subtitle="只针对这条视频的场景，克制、不做刻板印象概括。">
            <Card className="space-y-3">
              <BackgroundCardView card={analysis.backgroundCard} />
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-brand-600">✦ 文化主题 · 观看时注意什么</p>
                <CulturalThemeCards themes={analysis.culturalThemes} />
              </div>
              <p className="text-[10px] leading-relaxed text-muted">{analysis.disclaimer}</p>
            </Card>
          </CultureSection>

          {/* 短引用卡：单句 / 短语，带来源与时间戳，可朗读、可入队 */}
          <CultureSection title="关键表达 · 短引用" subtitle={SHORT_QUOTE_NOTE}
            right={<Chip tone="mint">{saved.filter((s) => analysis.keyExpressions.some((e) => e.expression === s)).length} 条已入队</Chip>}>
            <Card>
              <ExpressionCards expressions={analysis.keyExpressions} settings={data.settings}
                onSave={saveExpression} saved={saved} />
            </Card>
          </CultureSection>

          {/* 讨论种子问题 */}
          <CultureSection title="观后讨论种子问题" subtitle="先回忆视频里的具体细节，再表达观点。">
            <Card>
              <SeedQuestionCards questions={analysis.discussionSeeds}
                onPick={(q) => { setNoteText(`我想回答：${q}`); notify('问题已放进下方输入框，可先写下自己的观察') }} />
              {watched && (
                <button type="button" onClick={() => navigate('postWatch', { videoId: video.id })}
                  className="btn-ghost mt-3 w-full !py-2 !text-xs">
                  带着这些问题进入观后讨论 <Icon name="right" size={13} />
                </button>
              )}
            </Card>
          </CultureSection>

          {/* 用户原创短注释：进入分析器的素材，不是字幕 */}
          <Card>
            <SectionTitle title="我的原创短注释" subtitle="只写你自己看到的细节或想法；不要粘贴字幕全文。分析器会把它当作素材。"
              right={<Chip tone="slate">{userNotes.length} 条</Chip>} />
            <div className="flex items-end gap-2">
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2}
                placeholder="例如：I noticed the speaker paused before the last sentence…（≤300 字）"
                className="field min-h-[52px] flex-1 resize-none !py-2.5 text-xs" />
              <button type="button" onClick={addNote} className="btn-primary !h-[52px] !px-4 !text-xs" aria-label="保存短注释">保存</button>
            </div>
            {userNotes.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {userNotes.slice(-4).reverse().map((n) => (
                  <p key={n.id} className="rounded-xl bg-brand-50/70 px-3 py-2 text-[11px] leading-relaxed text-ink/80">{n.text}</p>
                ))}
                <button type="button" onClick={() => setLoadNonce((x) => x + 1)}
                  className="text-[10px] font-bold text-brand-600 hover:underline">用最新短注释重新分析 →</button>
              </div>
            )}
          </Card>

          {/* 原页面 / 署名 */}
          <Card>
            <SectionTitle title="来源与署名" subtitle="视频始终在平台官方播放器里播放，应用不保存任何副本。" />
            <div className="space-y-1.5 text-[11px] leading-relaxed">
              <p><b className="text-ink">平台：</b><span className="text-muted">{policy.label} · {policy.tier === 'open-license' ? '明确开放许可' : '官方嵌入播放器'}</span></p>
              <p><b className="text-ink">许可：</b><span className="text-muted">{video.licenseNote}</span></p>
              <p><b className="text-ink">署名：</b><span className="text-muted">{video.attribution}</span></p>
              <a href={video.watchUrl} target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 font-bold text-brand-600 hover:underline">
                在新窗口打开原页面 <Icon name="right" size={12} />
              </a>
            </div>
          </Card>

          <div ref={bottomRef} />
        </>
      )}

      {!status && <EmptyState emblem="🎬" title="视频内容未就绪" desc="返回文化首页重新选择一条视频。" />}
    </div>
  )
}
