/**
 * 词库注册表与分片加载入口
 *
 * 分片策略：每个词库按 shardSize（300-500）切片，按需加载单片；
 * 种子阶段每库只有一个分片（50 词），接口与真实分片完全一致，
 * 后续扩充词表只需增加分片文件，不改动加载逻辑。
 */

import type { DeckId, DeckMeta, WordEntry } from '../../wordLabTypes'
import { JUNIOR_3500_SEED } from './junior3500'
import { SENIOR_5000_SEED } from './senior5000'
import { CET4_SEED } from './cet4'
import { CET6_SEED } from './cet6'
import { IELTS55_SEED } from './ielts55'
import { IELTS65_SEED } from './ielts65'
import { IELTS75_SEED } from './ielts75'
/** [China Learner Track] 两个场景词包：并列注册，不改动原有 7 个分级词库 */
import {
  CHINA_TRACK_DECK_IDS, CHINA_TRACK_DECK_META,
  CHINGLISH_FIX_SEED, SPEAKING_CORE_SEED,
} from './chinaTrackPacks'

/**
 * DECK_META 含全部 9 个 id（7 个分级词库 + 2 个 china_track 场景词包），
 * 保证 WordLabHome / WordSession 用 DECK_META[deckId] 查新词包时不会落空。
 * DECK_IDS 仍严格是原来的 7 个，旧逻辑、旧断言与旧存档语义零改动。
 */
export const DECK_META: Record<DeckId, DeckMeta> = {
  junior_3500: { id: 'junior_3500', name: '初中 3500', subtitle: '课标基础词 · A1-A2', cefr: 'A2', shardSize: 300, emblem: '🌱', tint: 'mint' },
  senior_5000: { id: 'senior_5000', name: '高中 5000', subtitle: '考纲核心词 · A2-B1', cefr: 'B1', shardSize: 300, emblem: '🌿', tint: 'brand' },
  cet4: { id: 'cet4', name: '四级核心', subtitle: 'CET-4 · B1', cefr: 'B1', shardSize: 400, emblem: '📘', tint: 'brand' },
  cet6: { id: 'cet6', name: '六级核心', subtitle: 'CET-6 · B2', cefr: 'B2', shardSize: 400, emblem: '📗', tint: 'sun' },
  ielts_55: { id: 'ielts_55', name: '雅思 5.5', subtitle: '校园与生活场景 · B1', cefr: 'B1', shardSize: 500, emblem: '🥉', tint: 'coral' },
  ielts_65: { id: 'ielts_65', name: '雅思 6.5', subtitle: '学术与社会议题 · B2', cefr: 'B2', shardSize: 500, emblem: '🥈', tint: 'coral' },
  ielts_75: { id: 'ielts_75', name: '雅思 7.5', subtitle: '高阶学术表达 · C1', cefr: 'C1', shardSize: 500, emblem: '🥇', tint: 'sun' },
  ...CHINA_TRACK_DECK_META,
}

/** 原有 7 个分级词库：显式数组，不受场景词包扩容影响 */
export const DECK_IDS: DeckId[] = [
  'junior_3500', 'senior_5000', 'cet4', 'cet6', 'ielts_55', 'ielts_65', 'ielts_75',
]

/** [China Learner Track] 两个场景词包 id（source='china_track'） */
export const CHINA_DECK_IDS: DeckId[] = [...CHINA_TRACK_DECK_IDS]

/** 全量 id：仅用于跨库查找与外部生词匹配 */
export const ALL_DECK_IDS: DeckId[] = [...DECK_IDS, ...CHINA_DECK_IDS]

/** 种子数据（内存中的「第 1 片」）；生产环境可替换为 fetch 分片 JSON */
const SEEDS: Record<DeckId, WordEntry[]> = {
  junior_3500: JUNIOR_3500_SEED,
  senior_5000: SENIOR_5000_SEED,
  cet4: CET4_SEED,
  cet6: CET6_SEED,
  ielts_55: IELTS55_SEED,
  ielts_65: IELTS65_SEED,
  ielts_75: IELTS75_SEED,
  chinglish_fix: CHINGLISH_FIX_SEED,
  speaking_core: SPEAKING_CORE_SEED,
}

/** 可替换的分片加载器：默认走内存种子；测试/未来可用 setShardLoader 注入 fetch 版本 */
export type ShardLoader = (deckId: DeckId, shardIndex: number) => Promise<WordEntry[]>

const inMemoryLoader: ShardLoader = async (deckId, shardIndex) => {
  const shard = SEEDS[deckId] || []
  const size = DECK_META[deckId].shardSize
  return shard.slice(shardIndex * size, (shardIndex + 1) * size)
}

let shardLoader: ShardLoader = inMemoryLoader

export function setShardLoader(loader: ShardLoader): void { shardLoader = loader }
export function resetShardLoader(): void { shardLoader = inMemoryLoader }

export async function loadShard(deckId: DeckId, shardIndex = 0): Promise<WordEntry[]> {
  return shardLoader(deckId, shardIndex)
}

/** 同步取种子第 1 片（UI 首屏用；与 loadShard(…, 0) 结果一致） */
export function firstShard(deckId: DeckId): WordEntry[] {
  return [...(SEEDS[deckId] || [])]
}

/** 词表内查找（跨全部词库，小写匹配；找不到返回 undefined） */
export function findWord(word: string): WordEntry | undefined {
  const key = word.toLowerCase().trim()
  for (const id of ALL_DECK_IDS) {
    const hit = SEEDS[id].find((w) => w.word.toLowerCase() === key)
    if (hit) return hit
  }
  return undefined
}

/** 各库种子词数（测试/健康度用） */
export function seedCounts(): Record<DeckId, number> {
  const out = {} as Record<DeckId, number>
  for (const id of DECK_IDS) out[id] = SEEDS[id].length
  return out
}
