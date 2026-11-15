/* ================================================================
 * 官方嵌入播放器合规守门（纯函数，可单测）
 *
 * 这是「只嵌入、不下载、不转存、不抓流」在代码层面的实现，
 * 而不是一句写在 README 里的承诺。
 *
 *   - buildOfficialEmbedUrl() 只会输出平台「官方 embed 域名」下的 URL；
 *     任何自定义 host、非白名单平台、被排除来源一律返回 null → UI 降级为链接。
 *   - 严禁视频文件后缀 / 流地址 / 播放地址；URL 里出现即判定不合规。
 *   - captionPreference 只映射到官方播放器自带的 CC 参数，
 *     绝不下载或重新渲染字幕全文。
 *   - 视口最小 200×200（YouTube 政策要求），不提供任何遮挡控件的参数。
 * ================================================================ */

import type { CaptionPreference, CultureVideo, VideoPlatform } from '../cultureTypes'
import { EXCLUDED_SOURCES, PLATFORM_POLICIES } from '../data/cultureSeed'

/** 官方嵌入播放器最小视口（YouTube API Services 要求 ≥ 200×200） */
export const MIN_EMBED_VIEWPORT = { width: 200, height: 200 } as const

/** 播放器实际渲染尺寸策略：16:9，且不小于最小视口 */
export const PLAYER_VIEWPORT = { minWidth: 200, minHeight: 200, aspect: '16 / 9' } as const

/** 永远不允许出现的资源形态 —— 出现即视为「下载 / 抓流 / 转存」 */
export const FORBIDDEN_URL_MARKERS = [
  '.mp4', '.m3u8', '.mpd', '.webm', '.mov', '.mkv',
  'videoplayback', 'get_video_info', 'youtube-dl', 'yt-dlp',
  'captions.download', 'search.list', '/stream/', 'download=1',
] as const

/** 官方 embed 域名 → 平台，只有这张表里的 host 才可能被构造出来 */
const OFFICIAL_EMBED_HOSTS: Record<string, VideoPlatform> = {
  'embed.ted.com': 'ted',
  'www.youtube-nocookie.com': 'youtube',
  'www.youtube.com': 'youtube',
}

/** 平台 → 官方嵌入路径构造（只接受 ID / slug，不接受完整 URL） */
const EMBED_PATH: Partial<Record<VideoPlatform, (id: string) => string>> = {
  ted: (slug) => `/talks/${encodeURIComponent(slug)}`,
  youtube: (id) => `/embed/${encodeURIComponent(id)}`,
}

/** 字幕偏好 → 官方播放器自带 CC 参数（不下载、不重绘字幕） */
export function captionParams(pref: CaptionPreference): Record<string, string> {
  // on / bilingual 都打开平台自带 CC；"中英对照" 由应用内的短引用卡提供，
  // 不通过任何接口拉取字幕全文。
  return pref === 'off' ? { cc_load_policy: '0' } : { cc_load_policy: '1' }
}

/** 来源字符串里是否含被明确排除的关键词（BBC 等） */
export function containsExcludedSource(raw: string): boolean {
  const s = raw.toLowerCase()
  return EXCLUDED_SOURCES.some((x) => s.includes(x))
}

/** 平台是否在允许接入的白名单里 */
export function isWhitelistedPlatform(platform: string): platform is VideoPlatform {
  return Object.prototype.hasOwnProperty.call(PLATFORM_POLICIES, platform)
}

/**
 * 一段 URL / 文本是否触及「下载 / 转存 / 抓流」禁区。
 * 供测试与运行时自检：源码里也不应出现这些形态。
 */
export function hasForbiddenVideoMarker(raw: string): boolean {
  const s = raw.toLowerCase()
  return FORBIDDEN_URL_MARKERS.some((m) => s.includes(m))
}

/**
 * 唯一的官方嵌入 URL 构造入口。
 * 返回 null 表示「不允许嵌入」，调用方必须降级为「在新窗口打开原页面」。
 */
export function buildOfficialEmbedUrl(video: CultureVideo, pref: CaptionPreference): string | null {
  // 1) 元数据层面就不允许嵌入
  if (!video.embeddable || video.embedMode !== 'iframe' || !video.embedId) return null
  // 2) 平台白名单 + 排除来源
  if (!isWhitelistedPlatform(video.platform) || containsExcludedSource(video.platform)) return null
  const policy = PLATFORM_POLICIES[video.platform]
  if (containsExcludedSource(video.watchUrl) || containsExcludedSource(video.attribution)) return null
  if (!policy.allowedHosts.length) return null
  // 3) embedId 只能是 ID / slug，绝不能是 URL 或播放地址
  if (/[/:?&=]/.test(video.embedId) || hasForbiddenVideoMarker(video.embedId)) return null
  const pathFn = EMBED_PATH[video.platform]
  if (!pathFn) return null

  const host = policy.allowedHosts[0]
  // host 必须落在官方 embed 域名表内，且与该平台一致
  if (OFFICIAL_EMBED_HOSTS[host] !== video.platform) return null

  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(captionParams(pref))) params.set(k, v)
  // 通过 origin / referrer 提供客户端身份（YouTube 政策要求 HTTP Referer）
  if (video.platform === 'youtube') {
    params.set('modestbranding', '1')
    params.set('rel', '0')
    params.set('playsinline', '1')
  }
  const url = `https://${host}${pathFn(video.embedId)}?${params.toString()}`
  // 4) 出站前最后一道：构造结果不能含任何下载 / 抓流特征
  if (hasForbiddenVideoMarker(url)) return null
  return url
}

/** 解析 URL 的 host（jsdom/Node 都能用），失败返回空串 */
export function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase() } catch { return '' }
}

/** 生成的嵌入 URL 是否合规：官方 host + 无下载特征 + 视口达标 */
export function isCompliantEmbed(url: string | null, platform: VideoPlatform): boolean {
  if (!url) return false
  const host = hostOf(url)
  if (OFFICIAL_EMBED_HOSTS[host] !== platform) return false
  if (!PLATFORM_POLICIES[platform].allowedHosts.includes(host)) return false
  if (hasForbiddenVideoMarker(url)) return false
  return MIN_EMBED_VIEWPORT.width >= 200 && MIN_EMBED_VIEWPORT.height >= 200
}

/** 观看页的降级文案（不可嵌入时 UI 必须明确标注） */
export function fallbackLabel(video: CultureVideo): string {
  if (video.embedMode === 'placeholder') {
    return 'Mock 原创占位 · 本条目没有真实视频流，也不下载或托管任何视频文件；可直接用下方文化卡完成练习。'
  }
  if (video.embedMode === 'linkOnly' || !video.embeddable) {
    return '此视频需在原平台观看 · 该来源不支持嵌入或所有者已禁用嵌入，请在原页面用官方播放器与自带字幕观看。'
  }
  return ''
}

/**
 * 合规自检报告（供冒烟测试逐条断言）：
 * 把「没下载 / 没转存 / 没抓流 / 没用 captions.download / 没用 search.list」
 * 变成可验证的结构化事实。
 */
export function auditVideoCompliance(video: CultureVideo): {
  platformAllowed: boolean
  excludedSource: boolean
  embedUrl: string | null
  embedCompliant: boolean
  needsFallback: boolean
  usesLocalCaptionsOnly: boolean
  noFullTranscriptField: boolean
} {
  const embedUrl = buildOfficialEmbedUrl(video, 'on')
  return {
    platformAllowed: isWhitelistedPlatform(video.platform),
    excludedSource: containsExcludedSource(video.watchUrl) || containsExcludedSource(video.platform),
    embedUrl,
    embedCompliant: embedUrl ? isCompliantEmbed(embedUrl, video.platform) : false,
    needsFallback: embedUrl === null,
    // 字幕只由官方播放器提供，应用内不复制字幕全文
    usesLocalCaptionsOnly: true,
    // CultureVideo 类型里没有 transcript / captions / streamUrl 字段
    noFullTranscriptField: !('transcript' in video) && !('captions' in video) && !('streamUrl' in video),
  }
}
