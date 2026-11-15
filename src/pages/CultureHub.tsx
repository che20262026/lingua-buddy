import { useMemo, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { CULTURE_SOURCE_NOTICE, THEME_LABELS } from '../data/cultureSeed'
import { filterVideos, groupByTheme, hasValidProvenance } from '../services/cultureCurator'
import type { CultureTheme } from '../cultureTypes'
import {
  CultureHeader, CultureSection, PlatformBadges, SourceNotice, VideoCover,
} from '../components/CultureBits'
import { LibraryHealthPanel, PlaylistRegistryPanel } from '../components/CultureLibraryPanels'
import { Card, Chip, EmptyState, Icon, ProgressBar } from '../components/ui'
import { cn } from '../lib/utils'
/** [CEFR 等级层] 视频模块共用同一套等级面板、内容池与统一筛选服务 */
import { LevelPanel } from '../components/LevelPanel'
import { LevelContentList } from '../components/LevelContentList'
import { activeLevel } from '../services/levelFilter'

/** 三条学习路径并列说明：强调「新增」而非「替代」 */
function ThreePaths() {
  return (
    <Card>
      <div className="grid gap-2 sm:grid-cols-3 text-[11px] leading-relaxed">
        <div className="rounded-2xl bg-brand-50/70 p-3">
          <p className="font-bold text-brand-600">角色对话 · Dialogue</p>
          <p className="mt-1 text-ink/75">模拟场景，练「开口说」；AI 扮演角色，反馈偏语法与用词。</p>
        </div>
        <div className="rounded-2xl bg-mint-100/60 p-3">
          <p className="font-bold text-mint-600">文学研讨 · Seminar</p>
          <p className="mt-1 text-ink/75">细读单章文本，练「观点 + 原文证据」，AI 是引导者。</p>
        </div>
        <div className="rounded-2xl bg-coral-100/60 p-3">
          <p className="font-bold text-coral-600">文化视角 · Culture Watch</p>
          <p className="mt-1 text-ink/75">看官方嵌入视频，练「文化语境 + 真实语速 + 地道短表达」，观后讨论走独立 Agent。</p>
        </div>
      </div>
    </Card>
  )
}

export function CultureHub() {
  const { data, navigate } = useApp()
  const [theme, setTheme] = useState<CultureTheme | 'all'>('all')
  const [keyword, setKeyword] = useState('')

  // [CEFR 等级层] 视频模块的等级基准统一从 LevelFilterService 读取，页面只透传 activeLevel
  const targetCefr = activeLevel(data.levelPreference, 'video')

  // 纯本地索引筛选：不调用任何 search API，也不做实时网络搜索
  const buckets = useMemo(
    () => groupByTheme(data.cultureVideos, data.watchProgress, targetCefr),
    [data.cultureVideos, data.watchProgress, targetCefr],
  )
  const filtered = useMemo(
    () => filterVideos(data.cultureVideos, data.watchProgress, {
      theme, keyword, targetCefr,
    }),
    [data.cultureVideos, data.watchProgress, theme, keyword, targetCefr],
  )
  const visibleBuckets = theme === 'all' && !keyword.trim()
    ? buckets
    : [{ theme: 'all' as const, label: '筛选结果', emblem: '🔎', hint: '本地索引', videos: filtered }]
  const total = filterVideos(data.cultureVideos, data.watchProgress, { targetCefr }).length
  const watched = Object.values(data.watchProgress || {}).filter((r) => r?.watched).length
  // 只统计通过白名单与许可准入的视频
  const whitelisted = data.cultureVideos.videos.filter(hasValidProvenance).length

  return (
    <div className="animate-in space-y-5">
      <CultureHeader eyebrow="CULTURE WATCH · 文化视角视频" title="看一段真实英语，聊一层文化语境"
        subtitle="观看 → 理解 → 产出。视频只通过平台官方播放器嵌入，不下载、不转存、不复制完整字幕。"
        right={<Chip tone="coral">{total} 个视频</Chip>} />

      <SourceNotice text={CULTURE_SOURCE_NOTICE} />

      {/* [CEFR 等级层] 内容列表页顶部：等级是过滤器，不是门槛 */}
      <LevelPanel module="video" />

      {/* 快速入口 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => navigate('cultureReview')}
          className="card flex items-center gap-3 p-4 text-left transition hover:border-brand-300">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon name="chart" size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">文化复习 · 观看记录</p>
            <p className="truncate text-xs text-muted">已看 {watched} 条 · 新增表达 · 观后讨论记录</p>
          </div>
          <Icon name="right" size={16} className="text-muted" />
        </button>
        <button type="button" onClick={() => navigate('settings')}
          className="card flex items-center gap-3 p-4 text-left transition hover:border-brand-300">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint-100 text-mint-600"><Icon name="gear" size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">字幕偏好与观后讨论</p>
            <p className="truncate text-xs text-muted">开 / 关 / 中英对照 · 是否自动进入讨论</p>
          </div>
          <Icon name="right" size={16} className="text-muted" />
        </button>
      </div>

      {/* 主题筛选 + 本地关键词（不联网） */}
      <Card>
        <div className="hide-scroll flex gap-1.5 overflow-x-auto pb-1">
          {([{ id: 'all' as const, label: '全部', emblem: '🎬' },
            ...(Object.keys(THEME_LABELS) as CultureTheme[]).map((t) => ({
              id: t, label: THEME_LABELS[t].label, emblem: THEME_LABELS[t].emblem,
            }))]).map((o) => (
            <button key={o.id} type="button" onClick={() => setTheme(o.id)}
              className={cn('shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-bold transition',
                theme === o.id ? 'bg-brand-500 text-white shadow-soft' : 'bg-brand-50 text-brand-600 hover:bg-brand-100')}>
              {o.emblem} {o.label}
            </button>
          ))}
        </div>
        <input className="field mt-2.5 !py-2 !text-xs" value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="在本地索引里筛标题 / 主题标签（不联网、不调用搜索接口）" />
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          预配置播放列表 + 本地索引：客户端只做筛选与展示，不做实时搜索，不暴露任何 API Key。
          白名单准入 {whitelisted}/{data.cultureVideos.videos.length} 条。
        </p>
      </Card>

      {/* [CEFR 等级层] 分级视频来源池：只经 LevelFilterService 取内容；播放仍走既有官方嵌入白名单 */}
      <LevelContentList module="video" />

      {/* [新增] 三层储量体系：库健康度 + 播放列表注册表（同步只由按钮手动触发） */}
      <LibraryHealthPanel library={data.cultureVideos} registry={data.playlistRegistry} />
      <PlaylistRegistryPanel />

      {/* 视频卡片 */}
      {visibleBuckets.every((b) => b.videos.length === 0) ? (
        <EmptyState emblem="🎬" title="没有匹配的视频"
          desc="换个主题或关键词试试；也可以到设置页确认视频库已正确加载。"
          action={<button type="button" onClick={() => { setTheme('all'); setKeyword('') }}
            className="btn-primary !px-4 !py-2 !text-xs">清除筛选</button>} />
      ) : (
        visibleBuckets.filter((b) => b.videos.length).map((bucket) => (
          <CultureSection key={bucket.theme} title={`${bucket.emblem} ${bucket.label}`}
            subtitle={bucket.hint} right={<Chip tone="slate">{bucket.videos.length} 条</Chip>}>
            <div className="space-y-2.5">
              {bucket.videos.map((v) => (
                <button key={v.id} type="button" onClick={() => navigate('watch', { videoId: v.id })}
                  className="card flex w-full items-start gap-3.5 p-4 text-left transition hover:border-brand-300">
                  <VideoCover emblem={v.emblem} from={v.coverFrom} to={v.coverTo} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-1.5">
                      <p className="en-text truncate text-sm font-bold text-ink">{v.title}</p>
                      {v.watched && <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">✓ 已看</Chip>}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {v.titleZh} · {v.durationLabel} · 约 {v.expressionCount} 条短引用 · {v.segmentCount} 个分段
                    </p>
                    <div className="mt-2">
                      <PlatformBadges video={{
                        cefr: v.cefr, platform: v.platform,
                        embeddable: v.embeddable, nativeCaptions: v.nativeCaptions,
                      }} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-ink/75">{v.blurb}</p>
                    <p className="mt-1.5 rounded-xl bg-brand-50/60 px-2.5 py-1.5 text-[10px] leading-relaxed text-brand-700">
                      推荐理由：{v.reason}
                    </p>
                    <p className="mt-1.5 truncate text-[10px] leading-relaxed text-muted">
                      来源：{v.platformLabel} · 许可：{v.licenseNote}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar value={v.watched ? 1 : 0} className="!h-1.5" />
                      <span className="shrink-0 text-[10px] font-semibold text-brand-600">
                        {v.embeddable ? '官方嵌入' : v.embedMode === 'placeholder' ? 'Mock 占位' : '链接观看'}
                      </span>
                    </div>
                  </div>
                  <Icon name="right" size={16} className="mt-1 shrink-0 text-muted" />
                </button>
              ))}
            </div>
          </CultureSection>
        ))
      )}

      <CultureSection title="三种学习模式，互不替代" subtitle="文化视频与角色对话、文学研讨并列，各自有独立的 Agent。">
        <ThreePaths />
      </CultureSection>

      <p className="rounded-2xl bg-white/60 p-4 text-center text-[11px] leading-relaxed text-muted">
        观看与观后讨论产生的新词仍写进现有 <code className="text-brand-600">lingua_review_queue</code>，
        语言问题写进 <code className="text-brand-600">lingua_mistakes</code>，XP 与连续天数沿用
        <code className="text-brand-600"> lingua_profile</code>。旧流程完全不受影响。
      </p>
    </div>
  )
}
