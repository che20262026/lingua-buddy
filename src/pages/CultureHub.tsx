import { useMemo, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { CULTURE_SOURCE_NOTICE, THEME_LABELS } from '../data/cultureSeed'
import { filterVideos, groupByTheme, hasValidProvenance } from '../services/cultureCurator'
import type { CultureTheme } from '../cultureTypes'
import {
  CultureSection, PlatformBadges, SourceNotice,
} from '../components/CultureBits'
import { LibraryHealthPanel, PlaylistRegistryPanel } from '../components/CultureLibraryPanels'
import { Card, Chip, EmptyState, Icon } from '../components/ui'
import { cn } from '../lib/utils'
/** [CEFR 等级层] 视频模块共用同一套等级面板、内容池与统一筛选服务 */
import { LevelPanel } from '../components/LevelPanel'
import { LevelContentList } from '../components/LevelContentList'
import { activeLevel } from '../services/levelFilter'

/* ==================================================================
 * [信息流改造] 文化板块主界面
 *
 * 排版骨架吸收「今日头条 / 腾讯新闻」式信息流：圆角搜索 → 横滑下划线 Tab →
 * 纯文字快讯 → 大图蒙版头条 → 视频混排 → 底部胶囊悬浮导航（全局壳层已有）。
 *
 * 三条不可动摇的线：
 *  1. 配色：只用既有 brand / mint / sun / coral 色阶，不引入参考图的蓝；
 *  2. 功能：所有卡片点击仍 navigate('watch', { videoId })，观后讨论 / 字幕点击
 *     全在观看页原样保留；白名单准入、本地索引、手动同步一行未改；
 *  3. 层级：新卡片统一 z-0，绝不占用悬浮电子宠物（z-30+）的层级。
 *
 * 「收纳」的实现：设置 / 统计 / 特定分类过滤全部折叠进右上角齿轮抽屉，
 * DOM 仍保留（既有冒烟断言与键盘可达性不受影响），视觉上主界面只留纯净内容。
 * ================================================================== */

/** 三条学习路径并列说明：放进抽屉，主界面只留内容流 */
function ThreePaths() {
  return (
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
  )
}

/**
 * 信息流分类：把 6 个真实主题映射成新闻式栏目。
 * 不新增任何「音乐」空栏目——库里没有音乐条目就绝不做死 Tab（移动端一票否决）。
 * 「推荐」= 全部；「要闻」= 历史地标 + 科学自然；「影视」= 艺术媒体；
 * 「文化研讨」= 日常生活 + 工作社交；「节庆」= 节日习俗。
 */
type FeedTab = 'recommend' | 'headline' | 'screen' | 'seminar' | 'festival'
const FEED_TABS: Array<{ id: FeedTab; label: string; themes: CultureTheme[] }> = [
  { id: 'recommend', label: '推荐', themes: [] },
  { id: 'headline', label: '要闻', themes: ['history-landmarks', 'science-nature'] },
  { id: 'screen', label: '影视', themes: ['arts-media'] },
  { id: 'seminar', label: '文化研讨', themes: ['daily-life', 'work-social'] },
  { id: 'festival', label: '节庆', themes: ['festivals'] },
]

export function CultureHub() {
  const { data, navigate } = useApp()
  const [theme, setTheme] = useState<CultureTheme | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<FeedTab>('recommend')
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  /** 当前栏目 → 主题集合；点 Tab 同步驱动既有 theme 状态，白名单筛选链完全复用 */
  const pickTab = (t: FeedTab) => {
    setTab(t)
    const cfg = FEED_TABS.find((x) => x.id === t)!
    // 多主题栏目用 all + 客户端二次过滤；单主题栏目直接复用原筛选器
    setTheme(cfg.themes.length === 1 ? cfg.themes[0] : 'all')
  }
  const activeThemes = FEED_TABS.find((t) => t.id === tab)?.themes ?? []
  const feedItems = useMemo(() => {
    const base = keyword.trim() || theme !== 'all' ? filtered : filtered.filter((v) =>
      !activeThemes.length || activeThemes.includes(v.theme))
    return base
  }, [filtered, keyword, theme, activeThemes])

  const visibleBuckets = theme === 'all' && !keyword.trim() && !activeThemes.length
    ? buckets
    : [{ theme: 'all' as const, label: '筛选结果', emblem: '🔎', hint: '本地索引', videos: feedItems }]
  const total = filterVideos(data.cultureVideos, data.watchProgress, { targetCefr }).length
  const watched = Object.values(data.watchProgress || {}).filter((r) => r?.watched).length
  // 只统计通过白名单与许可准入的视频
  const whitelisted = data.cultureVideos.videos.filter(hasValidProvenance).length

  /** 唯一的内容跳转出口：卡片 → 原观看页（播放器 / 短引用 / 观后讨论全在那条链路上） */
  const openVideo = (videoId: string) => navigate('watch', { videoId })

  const allItems = visibleBuckets.flatMap((b) => b.videos)
  const hero = allItems.find((v) => v.embeddable) ?? allItems[0]
  const briefs = allItems.filter((v) => v.id !== hero?.id).slice(0, 5)
  const videos = allItems.filter((v) => v.id !== hero?.id && !briefs.includes(v))

  return (
    <div className="animate-in space-y-4">
      {/* ---------- 0. 轻量页头：保留品牌定位文案，头条式排版不占黄金位 ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-[9px] font-black tracking-[0.18em] text-coral-500">CULTURE WATCH</p>
          <h1 className="font-display text-[17px] font-black leading-tight text-ink">
            看一段真实英语，聊一层文化语境
          </h1>
        </div>
        <Chip tone="coral" className="!px-2.5 !py-0.5 !text-[10px]">{total} 个视频 · 已看 {watched}</Chip>
      </div>

      {/* ---------- 1. 顶部：圆角搜索 + 横滑分类 Tab ---------- */}
      <section aria-label="文化内容检索" className="cf-sticky-head">
        <div className="flex items-start gap-2">
          <div className="cf-search-wrap" data-testid="culture-feed-search">
            <Icon name="search" size={18} className="shrink-0 text-brand-500" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="cf-search-input"
              placeholder="搜索视频 / 文章标题（本地索引，不联网）"
              aria-label="搜索文化视频标题"
            />
            {keyword && (
              <button type="button" onClick={() => setKeyword('')} aria-label="清空搜索"
                className="shrink-0 rounded-full p-1 text-muted hover:bg-brand-50">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <button type="button" data-testid="culture-settings-toggle"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label={settingsOpen ? '收起文化设置' : '展开文化设置'}
            aria-expanded={settingsOpen}
            className={cn('cf-gear shrink-0', settingsOpen && 'bg-brand-500 text-white')}>
            <Icon name="gear" size={19} />
          </button>
        </div>

        <div className="hide-scroll mt-2.5 overflow-x-auto" data-testid="culture-feed-tabs">
          <div role="tablist" aria-label="文化内容分类" className="flex min-w-max gap-1">
            {FEED_TABS.map((t) => {
              const active = tab === t.id
              return (
                <button key={t.id} type="button" role="tab"
                  data-testid={`culture-feed-tab-${t.id}`}
                  aria-selected={active}
                  onClick={() => pickTab(t.id)}
                  className={cn('cf-tab', active && 'cf-tab-active')}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------- 2. 齿轮抽屉：收纳所有杂乱设置 / 统计 / 特定分类过滤 ---------- */}
      <section
        data-testid="culture-settings-drawer"
        aria-label="文化设置与库管理"
        className={cn('cf-drawer', settingsOpen ? 'cf-drawer-open' : 'cf-drawer-closed')}
        aria-hidden={!settingsOpen}>
        <Card className="space-y-4">
          <SourceNotice text={CULTURE_SOURCE_NOTICE} />

          {/* [CEFR 等级层] 等级是过滤器，不是门槛 */}
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

          {/* 原主题筛选 + 本地关键词：归入「特定分类过滤」 */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-muted">特定主题过滤 · 本地索引</p>
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
          </div>

          {/* [CEFR 等级层] 分级视频来源池 */}
          <LevelContentList module="video" />

          {/* 三层储量体系：库健康度 + 播放列表注册表（同步只由按钮手动触发） */}
          <div data-testid="culture-health-panel">
            <LibraryHealthPanel library={data.cultureVideos} registry={data.playlistRegistry} />
          </div>
          <PlaylistRegistryPanel />

          <CultureSection title="三种学习模式，互不替代"
            subtitle="文化视频与角色对话、文学研讨并列，各自有独立的 Agent。">
            <ThreePaths />
          </CultureSection>
        </Card>
      </section>

      {/* ---------- 3. 信息流主体：快讯 → 大图头条 → 视频混排 ---------- */}
      {allItems.length === 0 ? (
        <EmptyState emblem="🎬" title="没有匹配的视频"
          desc="换个栏目或关键词试试；也可以点右上角齿轮确认视频库已正确加载。"
          action={<button type="button"
            onClick={() => { setTheme('all'); setKeyword(''); setTab('recommend') }}
            className="btn-primary !px-4 !py-2 !text-xs">清除筛选</button>} />
      ) : (
        <>
          {/* 筛选态提示：告诉用户当前看的是本地索引过滤结果，不是全网搜索 */}
          {visibleBuckets.length === 1 && visibleBuckets[0].theme === 'all'
            && (keyword.trim() || theme !== 'all' || activeThemes.length > 0) && (
            <div data-testid="culture-feed-filter-note"
              className="flex items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50/70 px-3.5 py-2 text-[11px] font-bold text-brand-700">
              <Icon name="search" size={14} className="shrink-0" />
              筛选结果 · {allItems.length} 条 · {visibleBuckets[0].hint}
            </div>
          )}

          {/* 纯文字快讯列表：左侧小圆点 + 右侧文字，点击进详情 */}
          {briefs.length > 0 && (
            <section data-testid="culture-brief-list" aria-label="文化快讯"
              className="cf-feed-block rounded-3xl border border-white/80 bg-white/90 p-4 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-black text-ink">文化快讯</p>
                <span className="text-[10px] font-semibold text-brand-500">本地索引 · {briefs.length} 条</span>
              </div>
              <ul className="space-y-0.5">
                {briefs.map((v, i) => (
                  <li key={v.id}>
                    <button type="button" data-testid={`culture-brief-${i}`}
                      onClick={() => openVideo(v.id)}
                      className="cf-brief flex w-full items-start gap-2.5 rounded-xl px-1.5 py-2 text-left transition hover:bg-brand-50/60">
                      <span aria-hidden="true" className="cf-brief-dot mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                      <span className="min-w-0 flex-1 text-[12px] font-semibold leading-relaxed text-ink/85">
                        {v.titleZh || v.title}
                      </span>
                      {v.watched && <span className="shrink-0 text-[10px] text-mint-600">✓ 已看</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 大图卡片：宽幅渐变图 + 左上角角标 + 底部黑色渐变蒙版 + 白色粗体标题 */}
          {hero && (
            <section data-testid="culture-feed-hero" aria-label="文化推荐头条"
              className="cf-feed-block cf-hero relative overflow-hidden rounded-3xl shadow-card">
              <button type="button" onClick={() => openVideo(hero.id)}
                className="cf-hero-hit relative block w-full text-left" aria-label={`观看 ${hero.title}`}>
                <div className={cn('relative flex h-44 items-end bg-gradient-to-br sm:h-56', hero.coverFrom, hero.coverTo)}>
                  <span aria-hidden="true" className="absolute right-5 top-3 text-7xl opacity-25 sm:text-8xl">{hero.emblem}</span>
                  <span className="cf-corner absolute left-3 top-3 rounded-lg bg-coral-500 px-2.5 py-1 text-[10px] font-black tracking-wide text-white shadow-soft">
                    文化推荐
                  </span>
                  <div className="cf-hero-veil absolute inset-x-0 bottom-0 px-4 pb-4 pt-12">
                    <p className="en-text text-[17px] font-black leading-snug text-white drop-shadow sm:text-xl">
                      {hero.title}
                    </p>
                    <p className="mt-1 truncate text-[11px] font-medium text-white/85">{hero.titleZh}</p>
                  </div>
                </div>
              </button>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-50 bg-white/90 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">{hero.cefr}</Chip>
                  <span className="text-[10px] text-muted">{hero.durationLabel} · {hero.platformLabel}</span>
                </div>
                <button type="button" onClick={() => openVideo(hero.id)}
                  className="rounded-xl bg-brand-50 px-3 py-1.5 text-[11px] font-bold text-brand-600 hover:bg-brand-100">
                  开始观看 <Icon name="right" size={12} className="inline" />
                </button>
              </div>
            </section>
          )}

          {/* 视频混合列表：卡片中央播放图标，点击唤起原观看页 */}
          {videos.length > 0 && (
            <section data-testid="culture-feed-videos" aria-label="文化视频列表" className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <p className="text-[13px] font-black text-ink">最新视频</p>
                <span className="text-[10px] font-semibold text-muted">{videos.length} 条 · 白名单准入</span>
              </div>
              {videos.map((v, i) => (
                <button key={v.id} type="button"
                  data-testid={`culture-feed-video-${i}`}
                  onClick={() => openVideo(v.id)}
                  className="cf-feed-block cf-video-card flex w-full items-center gap-3 rounded-3xl border border-white/80 bg-white/92 p-3 text-left shadow-card transition hover:border-brand-200">
                  <span className={cn('relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br text-white', v.coverFrom, v.coverTo)}>
                    <span aria-hidden="true" className="text-2xl opacity-80">{v.emblem}</span>
                    <span data-testid={`culture-feed-play-${i}`}
                      className="cf-play-badge absolute inset-0 m-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-brand-600 shadow-soft">
                      <Icon name="play" size={15} />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block en-text truncate text-[13px] font-bold text-ink">{v.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{v.titleZh}</span>
                    <span className="mt-1.5 block">
                      <PlatformBadges video={{
                        cefr: v.cefr, platform: v.platform,
                        embeddable: v.embeddable, nativeCaptions: v.nativeCaptions,
                      }} />
                    </span>
                  </span>
                  <Icon name="right" size={15} className="shrink-0 text-muted" />
                </button>
              ))}
            </section>
          )}

          <p className="rounded-2xl bg-white/60 p-3.5 text-center text-[10px] leading-relaxed text-muted">
            观看与观后讨论产生的新词写进 <code className="text-brand-600">lingua_review_queue</code>，
            语言问题写进 <code className="text-brand-600">lingua_mistakes</code>，
            XP 与连续天数沿用 <code className="text-brand-600">lingua_profile</code>。旧流程完全不受影响。
          </p>
        </>
      )}
    </div>
  )
}
