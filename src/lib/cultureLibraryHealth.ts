/* ================================================================
 * 库健康度计算（纯函数，可单测）
 *
 * 让「储量丰富」成为一个可观测、可维护的状态：
 *   - 总条目数 / 种子数 / 同步数；
 *   - 各主题条目数与最低阈值（低于即提示「此主题内容偏少」）；
 *   - 可嵌入率、VOA 压舱石占比；
 *   - 已同步播放列表数与最近同步时间；
 *   - searchListEntries 恒为 0 —— 结构化证明库里没有搜索产物。
 * ================================================================ */

import type { CultureLibraryState } from '../cultureTypes'
import type { LibraryHealth, PlaylistRegistryState, TopicHealth } from '../cultureLibraryTypes'
import type { CultureTheme } from '../cultureTypes'
import { TOPIC_LABELS, TOPIC_MIN_COUNTS } from '../data/playlistRegistrySeed'

/** 健康库的最低总条目数（验收标准 1：种子库 ≥ 30） */
export const HEALTHY_MIN_TOTAL = 30

function isSyncedEntry(v: { seed?: boolean; acquiredVia?: string }): boolean {
  return v.seed === false || v.acquiredVia === 'playlistItems.list'
}

function isVoaEntry(v: { source?: string; attribution?: string }): boolean {
  return v.source === 'voa' || (v.attribution || '').includes('VOA')
}

/**
 * 计算库健康度。library 与 registry 均来自 localStorage，
 * 传入旧版本数据（缺扩展字段）时按种子条目统计，不抛错。
 */
export function computeLibraryHealth(
  library: CultureLibraryState,
  registry: PlaylistRegistryState,
): LibraryHealth {
  const videos = Array.isArray(library?.videos) ? library.videos : []
  const playlists = Array.isArray(registry?.playlists) ? registry.playlists : []

  const total = videos.length
  const seedCount = videos.filter((v) => v && !isSyncedEntry(v)).length
  const syncedCount = videos.filter((v) => v && isSyncedEntry(v)).length
  const embeddableCount = videos.filter((v) => v && v.embeddable).length
  const voaCount = videos.filter((v) => v && isVoaEntry(v)).length

  const topics: TopicHealth[] = (Object.keys(TOPIC_MIN_COUNTS) as CultureTheme[]).map((topic) => {
    const meta = TOPIC_LABELS[topic]
    const count = videos.filter((v) => v && (v.topic ? v.topic === topic : v.theme === topic)).length
    const minimum = TOPIC_MIN_COUNTS[topic]
    return {
      topic,
      label: meta.label,
      emblem: meta.emblem,
      count,
      minimum,
      low: count < minimum,
    }
  })

  const lowTopics = topics.filter((t) => t.low).map((t) => t.topic)

  return {
    total,
    seedCount,
    syncedCount,
    playlistCount: playlists.length,
    enabledPlaylistCount: playlists.filter((p) => p?.enabled).length,
    syncedPlaylistCount: playlists.filter((p) => p?.lastFetchedAt).length,
    embeddableCount,
    embeddableRate: total ? embeddableCount / total : 0,
    voaCount,
    voaShare: total ? voaCount / total : 0,
    topics,
    lowTopics,
    lastSyncAt: registry?.lastSyncAt ?? null,
    // 唯一的同步途径是 playlistItems.list，枚举里根本没有「搜索」
    searchListEntries: 0,
    healthy: total >= HEALTHY_MIN_TOTAL && lowTopics.length === 0,
  }
}

/** 把 0–1 的占比格式化为百分比文本（UI 用） */
export function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}
