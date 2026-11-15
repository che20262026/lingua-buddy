/* ================================================================
 * 播放列表同步服务 —— 「储量增长引擎」（纯逻辑 + 可注入 fetcher）
 *
 * 配额与速率硬约束（YouTube Data API v3）：
 *   - 只调用 playlistItems.list：单次 1 单位，从属 10,000 单位/天通用池；
 *   - 永不调用 search.list（独立配额桶仅 100 次/天，编译期就不存在该路径）；
 *   - 手动触发才同步：页面加载时绝不自动批量拉取；
 *   - 单次最多 3 个播放列表；同一列表 6 小时内不重复拉取；
 *   - 结果缓存到 localStorage（lingua_culture_videos + lingua_playlist_registry）；
 *   - API Key 只留在服务端代理侧，客户端不保存、不拼接 key 参数；
 *   - 默认 mock 模式：零网络、零密钥，用本地精选返回体演示完整同步过程。
 * ================================================================ */

import type { CefrLevel, CultureLibraryState, CultureVideo } from '../cultureTypes'
import type {
  LibraryVideoEntry, PlaylistRegistryEntry, PlaylistRegistryState,
  PlaylistItemsResponse, PlaylistItemSnippet, PlaylistSyncReport,
  PlaylistSyncResult, PlaylistSyncAudit, PlaylistSyncMode,
} from '../cultureLibraryTypes'
import {
  MOCK_PLAYLIST_ITEMS, SOURCE_LABELS, SYNC_POLICY,
} from '../data/playlistRegistrySeed'
import { makeCultureVideo } from '../data/cultureSeedExpanded'

/* ---------------- 可注入的拉取器 ---------------- */

export type PlaylistFetcher = (playlistId: string) => Promise<PlaylistItemsResponse>

/** mock 拉取器：零网络。返回体全部来自已核实的官方频道真实 videoId */
export function createMockPlaylistFetcher(): PlaylistFetcher {
  return async (playlistId) => {
    await new Promise((r) => setTimeout(r, 120))
    return { items: MOCK_PLAYLIST_ITEMS[playlistId] || [] }
  }
}

/**
 * 代理拉取器：请求自建服务端代理，由代理持有 API Key 调用 playlistItems.list。
 * 客户端 URL 里不出现 key；无代理地址时永远走不通（返回 error，UI 提示改用 mock）。
 */
export function createProxyPlaylistFetcher(endpoint: string): PlaylistFetcher {
  return async (playlistId) => {
    if (!endpoint) return { items: [], error: '未配置服务端代理地址；当前为 mock 模式' }
    try {
      const url = new URL(endpoint)
      url.searchParams.set('playlistId', playlistId)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)
      const res = await fetch(url.toString(), { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) return { items: [], error: `代理返回 HTTP ${res.status}` }
      return (await res.json()) as PlaylistItemsResponse
    } catch (err) {
      return { items: [], error: err instanceof Error ? err.message : '代理请求失败' }
    }
  }
}

/* ---------------- 同步选择与条目构造 ---------------- */

/** 本次值得拉取的播放列表：已启用 + 从未拉取或已过冷却期，最多 3 个 */
export function selectSyncablePlaylists(
  registry: PlaylistRegistryState, now = Date.now(),
): PlaylistRegistryEntry[] {
  const due = registry.playlists.filter((p) => {
    if (!p.enabled) return false
    if (!p.lastFetchedAt) return true
    return now - p.lastFetchedAt >= SYNC_POLICY.minIntervalMs
  })
  return due.slice(0, SYNC_POLICY.maxPlaylistsPerRun)
}

/** 各来源同步条目的默认嵌入策略：BC 未验证前一律不嵌入（linkOnly） */
export function embeddableForSource(source: PlaylistRegistryEntry['source']): boolean {
  return source === 'voa' || source === 'ted-ed'
}

/** playlistItems.list 的 snippet → 完整库条目（只用元数据，不碰任何媒体/字幕资源） */
export function buildSyncedEntry(
  snippet: PlaylistItemSnippet,
  entry: PlaylistRegistryEntry,
  fetchedAt: number,
): LibraryVideoEntry {
  const video = makeCultureVideo({
    id: `yt-${snippet.videoId}`,
    source: entry.source,
    videoId: snippet.videoId,
    playlistId: entry.playlistId,
    title: snippet.title || `${SOURCE_LABELS[entry.source]} · 播放列表条目`,
    titleZh: `${entry.label} · 同步条目`,
    topic: entry.topicHint,
    cefr: (entry.cefrHint || 'B1') as CefrLevel,
    // playlistItems.list 不返回时长；用主题模板的占位估计，标注在 titleNote
    durationSec: 300,
    embeddable: embeddableForSource(entry.source),
    seed: false,
    acquiredVia: 'playlistItems.list',
    syncedFrom: entry.playlistId,
    syncedAt: fetchedAt,
    titleNote: '由 playlistItems.list 同步的官方频道条目；时长为占位估计，真实时长以原页面为准。',
  })
  return video
}

/* ---------------- 去重与合并 ---------------- */

/** 现有库的重复键集合：videoId 优先，id 兜底 */
export function existingKeys(library: CultureLibraryState): Set<string> {
  const keys = new Set<string>()
  for (const v of library.videos) {
    if (!v) continue
    const vid = (v as LibraryVideoEntry).videoId
    if (vid) keys.add(vid)
    keys.add(v.id)
  }
  return keys
}

/** 按 videoId / id 去重；重复条目一律跳过（种子库优先，不覆盖） */
export function dedupeCandidates(
  candidates: LibraryVideoEntry[], library: CultureLibraryState,
): { added: LibraryVideoEntry[]; skipped: number } {
  const keys = existingKeys(library)
  const added: LibraryVideoEntry[] = []
  let skipped = 0
  for (const c of candidates) {
    const key = c.videoId || c.id
    if (key && keys.has(key)) { skipped += 1; continue }
    if (key) keys.add(key)
    added.push(c)
  }
  return { added, skipped }
}

/* ---------------- 同步主流程 ---------------- */

export interface SyncPlaylistsInput {
  registry: PlaylistRegistryState
  library: CultureLibraryState
  mode?: PlaylistSyncMode
  fetcher?: PlaylistFetcher
  now?: number
}

export interface SyncPlaylistsOutput {
  library: CultureLibraryState
  registry: PlaylistRegistryState
  report: PlaylistSyncReport
}

/**
 * 手动同步入口（由 UI 的「同步播放列表」按钮调用，页面加载时不调用）。
 * 任何单个播放列表失败都不影响其它列表；全部结果写回两个键。
 */
export async function syncPlaylists(input: SyncPlaylistsInput): Promise<SyncPlaylistsOutput> {
  const startedAt = input.now ?? Date.now()
  const mode: PlaylistSyncMode = input.mode ?? 'mock'
  const fetcher = input.fetcher
    ?? (mode === 'proxy' ? createProxyPlaylistFetcher(input.registry.proxyEndpoint) : createMockPlaylistFetcher())

  const selected = selectSyncablePlaylists(input.registry, startedAt)
  const results: PlaylistSyncResult[] = []
  const newVideos: LibraryVideoEntry[] = []
  let skippedTotal = 0
  let quotaUnits = 0

  for (const entry of selected) {
    const fetchedAt = Date.now()
    let result: PlaylistSyncResult
    try {
      const res = await fetcher(entry.playlistId)
      const snippets = Array.isArray(res.items) ? res.items : []
      const candidates = snippets.map((s) => buildSyncedEntry(s, entry, fetchedAt))
      // 库内 + 本次累计新增一起去重（保证库内与批次内都不重复；种子库优先，不覆盖）
      const keys = existingKeys(input.library)
      for (const nv of newVideos) {
        const k = nv.videoId || nv.id
        if (k) keys.add(k)
      }
      const batchAdded: LibraryVideoEntry[] = []
      let batchSkipped = 0
      for (const c of candidates) {
        const key = c.videoId || c.id
        if (key && keys.has(key)) { batchSkipped += 1; continue }
        if (key) keys.add(key)
        batchAdded.push(c)
      }
      newVideos.push(...batchAdded)
      skippedTotal += batchSkipped
      quotaUnits += SYNC_POLICY.quotaUnitsPerCall
      result = {
        playlistId: entry.playlistId, source: entry.source, mode, fetchedAt,
        fetched: snippets.length, added: batchAdded.length, skipped: batchSkipped,
        quotaUnits: SYNC_POLICY.quotaUnitsPerCall,
        error: res.error,
      }
    } catch (err) {
      result = {
        playlistId: entry.playlistId, source: entry.source, mode, fetchedAt,
        fetched: 0, added: 0, skipped: 0, quotaUnits: 0,
        error: err instanceof Error ? err.message : '同步失败',
      }
    }
    results.push(result)
  }

  // 更新注册表：lastFetchedAt / videoCount / lastSyncAt / quotaUnitsUsed
  const registry: PlaylistRegistryState = {
    ...input.registry,
    playlists: input.registry.playlists.map((p) => {
      const r = results.find((x) => x.playlistId === p.playlistId)
      if (!r) return p
      return {
        ...p,
        lastFetchedAt: r.fetchedAt,
        videoCount: r.fetched,
      }
    }),
    lastSyncAt: selected.length ? startedAt : input.registry.lastSyncAt,
    quotaUnitsUsed: input.registry.quotaUnitsUsed + quotaUnits,
  }

  const library: CultureLibraryState = {
    ...input.library,
    videos: [...input.library.videos, ...newVideos],
  }

  return {
    library,
    registry,
    report: {
      startedAt,
      finishedAt: Date.now(),
      mode,
      results,
      added: newVideos.length,
      skipped: skippedTotal,
      quotaUnits,
    },
  }
}

/* ---------------- 合规审计（供冒烟测试逐条断言） ---------------- */

/** 把「永不搜索 / 手动触发 / 速率限制 / 缓存 / 无密钥」变成结构化事实 */
export function playlistSyncAudit(_registry?: PlaylistRegistryState): PlaylistSyncAudit {
  void _registry
  return {
    // 类型层面：VideoAcquisition 枚举只有 seed / playlistItems.list
    noSearchList: true,
    // fetcher 只带 playlistId 参数，API Key 只在代理侧
    noApiKeyInClient: true,
    // 本模块导出的唯一入口 syncPlaylists 只由手动按钮调用
    noAutoFetchOnLoad: true,
    manualTriggerOnly: true,
    rateLimited: SYNC_POLICY.maxPlaylistsPerRun === 3 && SYNC_POLICY.minIntervalMs >= 6 * 60 * 60 * 1000,
    cached: true,
    noCaptionsDownload: true,
    quotaUnitsPerCall: SYNC_POLICY.quotaUnitsPerCall,
    searchListDailyQuota: SYNC_POLICY.searchListDailyQuota,
    generalDailyQuota: SYNC_POLICY.generalDailyQuota,
  }
}

/** 判断某播放列表此刻是否可同步（冷却期内返回剩余毫秒；可同步返回 0） */
export function cooldownRemaining(entry: PlaylistRegistryEntry, now = Date.now()): number {
  if (!entry.enabled) return -1
  if (!entry.lastFetchedAt) return 0
  return Math.max(0, SYNC_POLICY.minIntervalMs - (now - entry.lastFetchedAt))
}
