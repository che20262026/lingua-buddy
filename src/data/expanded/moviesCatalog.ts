/* ================================================================
 * 电影数据适配层：从 src/data/culture-movies.json 静态导入
 *
 * 合规策略（用户确认）：
 *  - embedUrl 一律留空：B站/腾讯/爱奇艺全片页有 Referer 防盗链与
 *    X-Frame-Options，第三方 iframe 必然白屏。留空 → UI 直接走海报降级，
 *    零空 iframe、零死链。未来拿到官方分享代码可逐条填入启用 iframe。
 *  - watchUrl 只指向正版平台【站内搜索页】，不编造具体视频 ID / BV 号。
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
  /** 官方预告片 iframe 链接；空串 = 触发海报降级 */
  embedUrl: string
  /** 正版平台全片跳转（站内搜索页，不编造视频 ID） */
  watchUrl: string
  /** 平台名，用于「去【X】看全片」按钮文案 */
  watchPlatform: string
}

/** 合法正版平台白名单（watchUrl 域名校验依据） */
export const ALLOWED_WATCH_HOSTS = [
  'bilibili.com', 'iqiyi.com', 'qq.com', '1905.com',
] as const

export const MOVIE_CATALOG: MovieEntry[] = raw as MovieEntry[]

/** 按豆瓣评分降序（UI 默认排序） */
export const MOVIES_BY_RATING: MovieEntry[] = [...MOVIE_CATALOG]
  .sort((a, b) => b.doubanRating - a.doubanRating)

/** 是否有可用的官方预告片 iframe（空串 = 走降级） */
export function hasOfficialTrailer(m: MovieEntry): boolean {
  return /^https:\/\/(player\.bilibili\.com|www\.youtube\.com\/embed\/|player\.qq\.com)/.test(m.embedUrl || '')
}

/** watchUrl 是否指向合法正版平台 */
export function isLegitWatchUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return ALLOWED_WATCH_HOSTS.some((h) => host === h || host.endsWith('.' + h))
  } catch { return false }
}
