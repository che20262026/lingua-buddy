/* ================================================================
 * 新增 Agent 1 —— CultureCuratorAgent
 *
 * 职责：管理视频库「元数据 + 本地索引」。
 * 输出：按主题 / 难度筛选的视频列表与推荐理由。
 *
 * 硬约束：
 *   - 不负责播放，不产生任何视频 URL / 流地址；
 *   - 客户端只做筛选与展示，绝不调用 search.list 做实时搜索；
 *   - 白名单之外的来源一律过滤掉，版权/许可三件套不完整不放行。
 * ================================================================ */

import type {
  CefrLevel, CultureLibraryState, CultureTheme, CultureVideo,
  VideoPlatform, WatchProgressState,
} from '../cultureTypes'
import { PLATFORM_POLICIES, THEME_LABELS } from '../data/cultureSeed'
import { isWhitelistedPlatform } from './culturePlayer'

export interface VideoListItem {
  id: string
  title: string
  titleZh: string
  platform: VideoPlatform
  platformLabel: string
  tierLabel: string
  theme: CultureTheme
  themeLabel: string
  themeEmblem: string
  tags: string[]
  cefr: CefrLevel
  durationLabel: string
  embeddable: boolean
  embedMode: CultureVideo['embedMode']
  licenseNote: string
  attribution: string
  watchUrl: string
  emblem: string
  coverFrom: string
  coverTo: string
  blurb: string
  nativeCaptions: boolean
  watched: boolean
  segmentCount: number
  expressionCount: number
  /** 推荐理由：由难度 / 主题 / 观看状态确定，确定性可复现 */
  reason: string
}

export interface ThemeBucket {
  theme: CultureTheme
  label: string
  emblem: string
  hint: string
  videos: VideoListItem[]
}

/* ---------------- 书库查询 ---------------- */

export function listVideos(library: CultureLibraryState): CultureVideo[] {
  return Array.isArray(library?.videos) ? library.videos : []
}

export function getVideo(library: CultureLibraryState, videoId?: string): CultureVideo | undefined {
  if (!videoId) return undefined
  return listVideos(library).find((v) => v.id === videoId)
}

/** 版权/许可准入：白名单平台 + 许可说明 + 署名 + 原页面链接，缺一不放行 */
export function hasValidProvenance(video: CultureVideo): boolean {
  return Boolean(
    isWhitelistedPlatform(video.platform)
    && video.licenseNote?.trim()
    && video.attribution?.trim()
    && video.watchUrl?.trim()
    && /^https?:\/\//i.test(video.watchUrl),
  )
}

/** CEFR 顺序，用于「难度不超过目标」的筛选 */
const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1']

export function cefrRank(level: CefrLevel): number {
  return Math.max(0, CEFR_ORDER.indexOf(level))
}

/** 推荐理由：不臆造内容，只依据元数据与观看状态 */
export function recommendReason(video: CultureVideo, target: CefrLevel, watched: boolean): string {
  if (watched) return '已看过 · 可以再练一次观后表达，或挑一个没讨论过的种子问题。'
  const gap = cefrRank(video.cefr) - cefrRank(target)
  const theme = THEME_LABELS[video.theme]?.label || '文化主题'
  if (gap <= -1) return `难度低于你当前的 ${target}，适合练「听清细节 + 复述」，主题是${theme}。`
  if (gap === 0) return `难度与 ${target} 相当，主题是${theme}，适合直接练观点表达。`
  if (gap === 1) return `比 ${target} 略高一点，建议先打开官方字幕看一遍，再进观后讨论。`
  return `比 ${target} 高阶：${theme} 话题语速较快，适合挑战「抓主旨 + 记短引用」。`
}

export function toVideoListItem(
  video: CultureVideo, progress: WatchProgressState, target: CefrLevel,
): VideoListItem {
  const policy = PLATFORM_POLICIES[video.platform]
  const theme = THEME_LABELS[video.theme]
  const watched = Boolean(progress?.[video.id]?.watched)
  return {
    id: video.id,
    title: video.title,
    titleZh: video.titleZh,
    platform: video.platform,
    platformLabel: policy?.label || video.platform,
    tierLabel: policy?.tier === 'open-license' ? '开放许可' : '官方嵌入',
    theme: video.theme,
    themeLabel: theme?.label || video.theme,
    themeEmblem: theme?.emblem || '🎬',
    tags: video.tags,
    cefr: video.cefr,
    durationLabel: video.durationLabel,
    embeddable: video.embeddable,
    embedMode: video.embedMode,
    licenseNote: video.licenseNote,
    attribution: video.attribution,
    watchUrl: video.watchUrl,
    emblem: video.emblem,
    coverFrom: video.coverFrom,
    coverTo: video.coverTo,
    blurb: video.blurb,
    nativeCaptions: video.nativeCaptions,
    watched,
    /** [大数据迁移] 内容素材搬去 IndexedDB 后，计数由索引自带，显示与全量时一致 */
    segmentCount: video.segmentCount ?? (video.segments ? video.segments.length : 0),
    expressionCount: video.expressionCount ?? (video.seedExpressions ? video.seedExpressions.length : 0),
    reason: recommendReason(video, target, watched),
  }
}

/**
 * 按主题 / 难度 / 关键词筛选（纯本地索引，不做任何网络搜索）。
 * keyword 只匹配标题、中文标题与标签。
 */
export function filterVideos(
  library: CultureLibraryState,
  progress: WatchProgressState,
  options: {
    theme?: CultureTheme | 'all'
    maxCefr?: CefrLevel
    keyword?: string
    targetCefr?: CefrLevel
  } = {},
): VideoListItem[] {
  const { theme = 'all', maxCefr, keyword = '', targetCefr = 'B1' } = options
  const kw = keyword.trim().toLowerCase()
  return listVideos(library)
    // 白名单 + 许可准入：版权状态不明确的条目不展示
    .filter((v) => hasValidProvenance(v))
    .filter((v) => theme === 'all' || v.theme === theme)
    .filter((v) => !maxCefr || cefrRank(v.cefr) <= cefrRank(maxCefr))
    .filter((v) => !kw
      || v.title.toLowerCase().includes(kw)
      || v.titleZh.includes(kw)
      || v.tags.some((t) => t.toLowerCase().includes(kw)))
    .map((v) => toVideoListItem(v, progress, targetCefr))
}

/** 首页主题分组：四个主题桶，每桶按 CEFR 排序 */
export function groupByTheme(
  library: CultureLibraryState, progress: WatchProgressState, targetCefr: CefrLevel = 'B1',
): ThemeBucket[] {
  const items = filterVideos(library, progress, { targetCefr })
  return (Object.keys(THEME_LABELS) as CultureTheme[]).map((theme) => ({
    theme,
    label: THEME_LABELS[theme].label,
    emblem: THEME_LABELS[theme].emblem,
    hint: THEME_LABELS[theme].hint,
    videos: items
      .filter((v) => v.theme === theme)
      .sort((a, b) => cefrRank(a.cefr) - cefrRank(b.cefr)),
  }))
}

/* ---------------- 观看进度 ---------------- */

export function watchRecord(progress: WatchProgressState, videoId: string) {
  return progress?.[videoId]
}

export function watchedCount(progress: WatchProgressState): number {
  return Object.values(progress || {}).filter((r) => r?.watched).length
}

/** 某视频的用户原创短注释（来自 lingua_culture_notes，不是字幕） */
export function notesFor<T extends { videoId: string }>(notes: T[], videoId: string): T[] {
  return (Array.isArray(notes) ? notes : []).filter((n) => n.videoId === videoId)
}
