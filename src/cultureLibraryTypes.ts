/* ================================================================
 * 「三层储量体系」全部新增类型 —— 独立于 cultureTypes.ts / types.ts
 *
 * 第 1 层 种子库        : lingua_culture_videos（离线可用，零 API 调用）
 * 第 2 层 播放列表注册表: lingua_playlist_registry（储量增长引擎）
 * 第 3 层 白名单频道    : 注册表内嵌的 channels（人工精选，不自动收录）
 *
 * 硬约束（类型层面即可验证）：
 *   - 不存在 search.list / captions.download / apiKey / streamUrl 字段；
 *   - 非种子条目的唯一来源是 playlistItems.list；
 *   - 单个视频不是储量单位，播放列表才是。
 * ================================================================ */

import type {
  CefrLevel, CultureLibraryState, CultureTheme, CultureVideo, VideoPlatform,
} from './cultureTypes'

/** 内容来源（与「播放平台」分离：VOA 的视频托管在 YouTube 官方播放器上） */
export type CultureSource =
  | 'voa'              // VOA Learning English —— 美国联邦政府作品 / 公有领域
  | 'ted-ed'           // TED-Ed —— CC BY-NC-ND 4.0
  | 'british-council'  // British Council | LearnEnglish —— 嵌入权限需逐一确认
  | 'pexels'           // Pexels 免费 B-roll
  | 'pixabay'          // Pixabay 免费 B-roll
  | 'ted'              // 旧版内置的 TED Talks 条目

/** 条目的获取途径。枚举里没有「搜索」，编译期就排除 search.list 产物 */
export type VideoAcquisition = 'seed' | 'playlistItems.list'

/** videoId 的可验证状态：不编造 ID，未固定到单条视频时显式标记 */
export type VideoIdStatus = 'verified' | 'playlist-only'

/** 同步运行模式：默认 mock（零网络），只有配置了服务端代理才走远端 */
export type PlaylistSyncMode = 'mock' | 'proxy'

/**
 * 扩展后的视频条目契约。
 * 旧 5 条手配条目不带这些字段，由迁移函数补 seed/source/topic 等；
 * 新种子与同步产物都必须满足这里的必填字段。
 */
export interface LibraryVideoEntry extends CultureVideo {
  source: CultureSource
  /** YouTube 官方视频 ID（11 位）或 TED slug；没有可验证 ID 时为空串 */
  videoId: string
  /** 所属播放列表 ID，可选（单条 TED-Ed / 旧条目可能没有） */
  playlistId?: string
  /** 6 个主题分类之一；旧条目由迁移从 theme 继承 */
  topic: CultureTheme
  /** 原创文化主题标签（字符串数组，不复制任何字幕） */
  culturalThemes: string[]
  /** true = 内置种子；false = 播放列表同步产物 */
  seed: boolean
  /** 获取途径：审计用，杜绝 search.list 产物进入视频库 */
  acquiredVia: VideoAcquisition
  /** 官方播放列表 / 原页面链接（来源依据） */
  officialUrl: string
  idStatus: VideoIdStatus
  /** 应用内原创学习卡标题说明，避免与平台原始标题混淆 */
  titleNote?: string
  /** 同步产物：来自哪个播放列表与同步时间 */
  syncedFrom?: string
  syncedAt?: number
}

/* ---------------- 第 2 层：播放列表注册表 ---------------- */

export interface PlaylistRegistryEntry {
  /** YouTube 播放列表 ID（PL 开头）；全部来自可验证的官方频道页面 */
  playlistId: string
  source: CultureSource
  label: string
  topicHint: CultureTheme
  cefrHint: CefrLevel
  lastFetchedAt: number | null
  videoCount: number
  enabled: boolean
  /** 该 playlistId 的来源依据：官方频道页面 / 官方公开链接 */
  verifiedUrl: string
  /** 维护备注：为什么启用或停用 */
  note: string
}

/** 第 3 层：人工精选的频道白名单（不依赖任何自动搜索） */
export interface WhitelistedChannel {
  id: string
  name: string
  handle: string
  url: string
  source: CultureSource
  /** 已纳入注册表管理的播放列表 ID */
  playlistIds: string[]
  status: 'verified' | 'pending-verification'
  note: string
}

export interface PlaylistRegistryState {
  version: number
  playlists: PlaylistRegistryEntry[]
  channels: WhitelistedChannel[]
  /** 最近一次手动同步的时间；null = 从未同步 */
  lastSyncAt: number | null
  /**
   * 可选的服务端代理地址。API Key 只留在代理侧，客户端不保存、不拼接 key 参数。
   * 留空 = mock 模式，完全不联网。
   */
  proxyEndpoint: string
  /** 累计消耗的 playlistItems.list 配额单位（1 单位/次） */
  quotaUnitsUsed: number
}

/* ---------------- 同步服务的输入输出 ---------------- */

/** playlistItems.list 返回的单条 snippet（只取元数据，不取任何媒体/字幕资源） */
export interface PlaylistItemSnippet {
  videoId: string
  title: string
  channelTitle?: string
  publishedAt?: string
  description?: string
}

export interface PlaylistItemsResponse {
  items?: PlaylistItemSnippet[]
  nextPageToken?: string
  error?: string
}

export interface PlaylistSyncResult {
  playlistId: string
  source: CultureSource
  mode: PlaylistSyncMode
  fetchedAt: number
  fetched: number
  added: number
  skipped: number
  quotaUnits: number
  error?: string
}

export interface PlaylistSyncReport {
  startedAt: number
  finishedAt: number
  mode: PlaylistSyncMode
  results: PlaylistSyncResult[]
  added: number
  skipped: number
  quotaUnits: number
}

/* ---------------- 库健康度 ---------------- */

export interface TopicHealth {
  topic: CultureTheme
  label: string
  emblem: string
  count: number
  minimum: number
  low: boolean
}

export interface LibraryHealth {
  total: number
  seedCount: number
  syncedCount: number
  playlistCount: number
  enabledPlaylistCount: number
  syncedPlaylistCount: number
  embeddableCount: number
  embeddableRate: number
  voaCount: number
  voaShare: number
  topics: TopicHealth[]
  lowTopics: CultureTheme[]
  lastSyncAt: number | null
  /** 是否存在任何通过实时搜索获得的条目（恒为 false） */
  searchListEntries: number
  healthy: boolean
}

export interface CultureLibraryExpansionReport {
  created: string[]
  /** 被补齐扩展字段的旧手配条目数量 */
  patchedVideos: number
  /** 本次补入的种子条目数量 */
  addedSeedVideos: number
  /** 按 videoId / id 去重移除的重复条目数量 */
  duplicatesRemoved: number
  reseededPlaylists: number
  legacyKeysTouched: string[]
  skipped: boolean
}

/** 供验收逐条断言的结构化合规事实 */
export interface PlaylistSyncAudit {
  noSearchList: boolean
  noApiKeyInClient: boolean
  noAutoFetchOnLoad: boolean
  manualTriggerOnly: boolean
  rateLimited: boolean
  cached: boolean
  noCaptionsDownload: boolean
  quotaUnitsPerCall: number
  searchListDailyQuota: number
  generalDailyQuota: number
}
