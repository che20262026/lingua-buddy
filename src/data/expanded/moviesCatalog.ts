/* ================================================================
 * 电影数据适配层：从 src/data/culture-movies.json 静态导入
 *
 * 合规策略（预告片纯净化）：
 *  - 只提供【官方预告片】，彻底移除全片跳转字段（watchUrl / watchPlatform）。
 *  - trailerUrl 填官方平台的 iframe 嵌入链接（B站 player.bilibili.com），
 *    当前 10 部中 2 部已填入经核实的真实 IGN 预告片 BV 号，其余留空 → UI 降级海报。
 *    绝不编造 BV 号；补齐新片时必须先到官方渠道核实嵌入链接。
 *  - 不写任何 localStorage 键；电影不属于视频白名单，不进 groupByTheme。
 * ================================================================ */

import raw from '../culture-movies.json'

/** 电影完整契约（与 JSON 字段一一对应） */
export interface MovieEntry {
  id: string
  title: string
  titleCn: string
  year: number
  doubanRating: number
  /** 中英双语简介 */
  intro: { zh: string; en: string }
  /** 本地占位海报（public/posters/*.svg，纯代码绘制） */
  posterUrl: string
  /** 官方预告片 iframe 嵌入链接；空串 = 触发海报降级 */
  trailerUrl: string
}

/** 允许嵌入官方预告片的平台域名白名单（拒绝搜索页 / 盗版站） */
export const ALLOWED_TRAILER_HOSTS = [
  'player.bilibili.com', 'www.youtube-nocookie.com', 'www.youtube.com',
] as const

export const MOVIE_CATALOG: MovieEntry[] = raw as MovieEntry[]

/** 按豆瓣评分降序（UI 默认排序） */
export const MOVIES_BY_RATING: MovieEntry[] = [...MOVIE_CATALOG]
  .sort((a, b) => b.doubanRating - a.doubanRating)

/** trailerUrl 是否为合法官方预告片嵌入域名（http(s) + 白名单） */
export function isLegitTrailerUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol)) return false
    return ALLOWED_TRAILER_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
  } catch { return false }
}

/** 是否有可播放的官方预告片：合法域名 + 必须带具体视频 ID（不是裸域名/搜索页） */
export function hasOfficialTrailer(m: MovieEntry): boolean {
  const url = (m.trailerUrl || '').trim()
  if (!isLegitTrailerUrl(url)) return false
  return /[?&]bvid=BV[0-9A-Za-z]{10}/.test(url) || /\/embed\/[\w-]+/.test(url)
}
