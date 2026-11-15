/**
 * Agent —— WordMediaAgent（单词媒体）
 *
 * 职责：为词条取「图片 + 例句」。默认实现完全离线：
 * - imageUrl 为空 → SVG / emoji 兜底图（按 imageQuery 主题生成主色）
 * - 例句直接使用词条自带例句（自建模板，参考 Tatoeba CC BY 2.0 FR 句式改写）
 * - 结果缓存进 lingua_word_media_cache，避免重复生成
 *
 * 可替换性：fetchWordMedia 可整体替换（未来接 Pexels / Pixabay 免费图库，
 * API Key 只留代理侧，与三层储量体系同一约束）。
 */

import type { WordEntry, WordMedia, WordMediaCacheState } from '../wordLabTypes'

export type WordMediaFetcher = (entry: WordEntry) => Promise<WordMedia>

/** 主题 emoji 兜底表：按 imageQuery 关键词命中 */
const THEME_EMOJI: Array<[RegExp, string, string]> = [
  [/rain|storm|wind|sky|cloud|snow|sun|weather|dusk|dawn|aurora/i, '🌤️', '#7dd3fc'],
  [/mountain|hill|cliff|valley|glacier|summit|ridge/i, '⛰️', '#a7c957'],
  [/sea|river|lake|water|wave|tide|wetland|reservoir/i, '🌊', '#60a5fa'],
  [/forest|tree|plant|garden|flower|leaf|seed|crop|field|farm/i, '🌿', '#4ade80'],
  [/book|library|study|essay|note|class|school|exam|lecture|dorm|campus/i, '📚', '#f472b6'],
  [/lab|science|chart|graph|data|scale|measure|research/i, '🔬', '#a78bfa'],
  [/food|eat|kitchen|cook|dish|fruit|plate|cafeteria|grocery|market|shop/i, '🍎', '#fb923c'],
  [/city|street|road|bridge|traffic|building|office|sign|billboard|skyline/i, '🏙️', '#94a3b8'],
  [/people|family|child|friend|team|crowd|student|teacher|speaker|audience/i, '👥', '#fbbf24'],
  [/car|bus|train|plane|bike|travel|airport|journey|passport/i, '🚲', '#34d399'],
  [/money|price|pay|fee|budget|loan|bank|cash|income|revenue/i, '💰', '#facc15'],
  [/health|doctor|nurse|patient|medicine|hospital|safety|fire/i, '🩺', '#f87171'],
  [/sport|run|climb|gym|football|soccer|chess|race|match/i, '⚽', '#4ade80'],
  [/animal|bird|fox|fish|deer|camel|bear|dog|cat|horse/i, '🦊', '#fdba74'],
  [/art|paint|music|concert|gallery|museum|photo|film|story|novel/i, '🎨', '#c084fc'],
  [/law|court|police|judge|rule|policy|document|contract|official/i, '⚖️', '#cbd5e1'],
]

const DEFAULT_EMOJI: [string, string] = ['🔤', '#a5b4fc']

function pickTheme(entry: WordEntry): [string, string] {
  for (const [re, emoji, tint] of THEME_EMOJI) {
    if (re.test(entry.imageQuery)) return [emoji, tint]
  }
  return DEFAULT_EMOJI
}

/** 默认离线实现：SVG / emoji 兜底 */
const fallbackFetcher: WordMediaFetcher = async (entry) => {
  const [emoji, tint] = pickTheme(entry)
  return {
    word: entry.word,
    imageUrl: '',
    emoji,
    tint,
    examples: entry.examples.length ? entry.examples : [`Use "${entry.word}" in your own sentence.`],
    source: 'fallback',
    cachedAt: Date.now(),
  }
}

let fetcher: WordMediaFetcher = fallbackFetcher

export function setWordMediaFetcher(f: WordMediaFetcher): void { fetcher = f }
export function resetWordMediaFetcher(): void { fetcher = fallbackFetcher }

/** 取媒体：缓存命中直接返回；未命中调 fetcher 并写回缓存 */
export async function fetchWordMedia(
  entry: WordEntry,
  cache: WordMediaCacheState,
): Promise<{ media: WordMedia; cache: WordMediaCacheState }> {
  const key = entry.word.toLowerCase()
  const hit = cache[key]
  if (hit) return { media: hit, cache }
  const media = await fetcher(entry)
  return { media, cache: { ...cache, [key]: media } }
}

/**
 * 内联 SVG 兜底图（data URI，无任何网络请求）
 * hideWord = true 用于 S3 书写阶段：底部不绘制目标词，避免配图变成答案卡。
 */
export function fallbackSvg(entry: WordEntry, media: WordMedia, hideWord = false): string {
  const label = hideWord ? '········' : entry.word.slice(0, 14)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">`
    + `<rect width="320" height="200" rx="18" fill="${media.tint}22"/>`
    + `<circle cx="160" cy="86" r="44" fill="${media.tint}44"/>`
    + `<text x="160" y="102" font-size="48" text-anchor="middle">${media.emoji}</text>`
    + `<text x="160" y="160" font-size="16" font-weight="700" text-anchor="middle" fill="#475569" font-family="sans-serif">${label}</text>`
    + `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** 统一图片地址：有真实图用真实图，否则 SVG 兜底；hideWord 供书写阶段遮蔽词形 */
export function imageSrc(entry: WordEntry, media: WordMedia, hideWord = false): string {
  if (entry.imageUrl) return entry.imageUrl
  if (media.imageUrl) return media.imageUrl
  return fallbackSvg(entry, media, hideWord)
}
