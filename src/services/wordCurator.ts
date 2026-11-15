/**
 * Agent —— WordCuratorAgent（词库策展）
 *
 * 职责：
 * - 按分片加载词库（每片 300-500 词，禁止一次性加载全量）
 * - 对已学词去重（不看已学过的词）
 * - 生成新词队列：受每日新词上限约束（S0 限流）
 * - 阅读/观后生词走 enqueueExternalWords：一键加入、不计当日新词上限
 *
 * 可替换性：getNextWords 是唯一出口，测试可 setNextWordsProvider 注入 Mock。
 */

import {
  ALL_DECK_IDS, DECK_IDS, DECK_META, firstShard, loadShard,
  setShardLoader, resetShardLoader,
} from '../data/wordDecks'
import type { WordEntry, WordProgressState } from '../wordLabTypes'

export type NextWordsProvider = (deckId: string, count: number) => Promise<WordEntry[]>

const defaultProvider: NextWordsProvider = async (deckId, count) => {
  /** [China Learner Track] 两个场景词包也能走同一套分片加载与五步闭环 */
  if (!ALL_DECK_IDS.includes(deckId as never)) return []
  // 分片加载：先读第 1 片，不够再读第 2 片（种子阶段单片已够）
  const words: WordEntry[] = [...firstShard(deckId as never)]
  if (words.length < count) {
    const second = await loadShard(deckId as never, 1)
    for (const w of second) if (!words.some((x) => x.word === w.word)) words.push(w)
  }
  return words
}

let provider: NextWordsProvider = defaultProvider

export function setNextWordsProvider(p: NextWordsProvider): void { provider = p }
export function resetNextWordsProvider(): void { provider = defaultProvider }
export { setShardLoader, resetShardLoader, DECK_META, DECK_IDS, ALL_DECK_IDS }

/**
 * 取一批新词：分片加载 → 按词表顺序 → 跳过已学（去重）→ 截取 count 条
 * 幂等：连续两次调用对同一 progress 返回相同序列（不含已学词）。
 */
export async function getNextWords(
  deckId: string,
  progress: WordProgressState,
  count: number,
): Promise<WordEntry[]> {
  const all = await provider(deckId, count + Object.keys(progress.words).length)
  const learned = new Set(Object.keys(progress.words))
  const fresh: WordEntry[] = []
  for (const w of all) {
    const key = w.word.toLowerCase()
    if (learned.has(key) || fresh.some((f) => f.word.toLowerCase() === key)) continue
    fresh.push(w)
    if (fresh.length >= count) break
  }
  return fresh
}

/**
 * 阅读 / 观后生词一键入队：
 * 返回要新增的 WordEntry（调用方写入 progress，origin 标 'reading' | 'video'）。
 * 不占用当日新词上限（上限只约束 wordlab 会话新词）。
 */
export function enqueueExternalWord(word: string, origin: 'reading' | 'video'): WordEntry | null {
  const key = word.toLowerCase().trim()
  if (!key) return null
  // 优先匹配当前词库词表；命不中则用轻量兜底条目
  for (const id of ALL_DECK_IDS) {
    const hit = firstShard(id).find((w) => w.word.toLowerCase() === key)
    if (hit) return { ...hit, tags: [...hit.tags, 'external'] }
  }
  return null
}

/** 外部生词的轻量兜底条目（词表未覆盖时） */
export function makeExternalEntry(word: string, origin: 'reading' | 'video', meaningZh: string): WordEntry {
  return {
    word: word.trim(),
    phonetic: '',
    pos: '',
    meaningZh: meaningZh.slice(0, 20),
    meaningEn: '',
    tags: ['external', origin],
    cefr: 'B1',
    examples: [`Review "${word.trim()}" in your own sentence.`],
    imageQuery: `a simple scene related to ${word.trim()}`,
    imageAlt: `A simple scene related to ${word.trim()}`,
    imageUrl: '',
    collocations: [],
  }
}
