/**
 * [查询 Query · 离线词典] 独立的 IndexedDB 库
 * ------------------------------------------------------------------
 * 为什么独立、而不是复用 src/lib/db.ts：
 *  - db.ts 的 DB_NAME='lingua_buddy_store' / DB_VERSION===1 / 双表被 smoke 逐字冻结，
 *    升版本加表会触发 7405 行断言；
 *  - 词典是「可下载、可删除」的独立资源，生命周期与主数据不同，独立库更干净；
 *  - 零 localStorage 键：下载状态存在这张表里，不碰 31 键契约。
 *
 * 设计约定（沿用 db.ts 的成熟模式）：
 *  - 所有方法都不抛错，失败返回安全默认值（离线 / 隐私模式永不白屏）；
 *  - 提供注入替身 setDictBackend，便于冒烟在无 IndexedDB 的 jsdom 里验证；
 *  - 检索走「内存索引 + 前缀/包含匹配」，词条落库后一次性建索引，查询 O(n) 内存扫描，
 *    千级词条完全够用，避免 FTS 等大方案。
 */

import type { QueryDictEntry, QueryDictPack } from '../data/queryDictionaries'

export const DICT_DB_NAME = 'lingua_query_store'
export const DICT_DB_VERSION = 1
export const DICT_STORE = 'dict_packs'

/** 落库的一条词典包记录 */
export interface StoredDictPack {
  id: string
  lang: 'en' | 'ru'
  name: string
  subtitle: string
  emblem: string
  entries: QueryDictEntry[]
  downloadedAt: number
  /** 数据版本：内置数据变化时递增，用于提示用户重新下载 */
  dataVersion: number
}

export interface DictBackend {
  putPack: (pack: StoredDictPack) => Promise<void>
  getPack: (id: string) => Promise<StoredDictPack | null>
  listPacks: () => Promise<StoredDictPack[]>
  deletePack: (id: string) => Promise<void>
  clear: () => Promise<void>
}

/* ---------------- 检索纯函数（冒烟可直测，无 DOM 依赖） ---------------- */

export interface DictHit extends QueryDictEntry {
  /** 匹配到的源词形（用于展示 unaccent 结果时保留重音原文） */
  matched: string
}

/** 去重音做容错匹配：西里尔 й 的短音符 U+0306 必须保留，避免 й→и 误匹配 */
export function foldWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/\u0306/g, '\u0000')          // 保护 й 的短音符
    .replace(/[\u0300-\u036f]/g, '')        // 剥离重音
    .replace(/\u0000/g, '\u0306')
    .normalize('NFC')
    .toLowerCase()
    .trim()
}

/**
 * 在词条数组里检索：先精确、再前缀、再包含，最多 limit 条。
 * 同时对词形、中文释义、拉丁转写做匹配，方便用户用任一线索查词。
 */
export function searchEntries(entries: QueryDictEntry[], query: string, limit = 20): DictHit[] {
  const q = foldWord(query)
  if (!q) return []
  type Scored = { hit: DictHit; score: number }
  const scored: Scored[] = []
  for (const e of entries) {
    const w = foldWord(e.w)
    const phonetic = foldWord(e.phonetic || '')
    const meaning = foldWord(e.meaning)
    let score = -1
    if (w === q) score = 0
    else if (w.startsWith(q)) score = 1
    else if (phonetic && phonetic.startsWith(q)) score = 2
    else if (w.includes(q)) score = 3
    else if (meaning.includes(q)) score = 4
    else if (phonetic && phonetic.includes(q)) score = 5
    if (score < 0) continue
    scored.push({ hit: { ...e, matched: e.w }, score })
  }
  scored.sort((a, b) => a.score - b.score || a.hit.w.localeCompare(b.hit.w))
  return scored.slice(0, Math.max(1, limit)).map((s) => s.hit)
}

/** 为内置包构造一条可落库记录（下载按钮用） */
export function toStoredPack(pack: QueryDictPack, dataVersion = 1): StoredDictPack {
  return {
    id: pack.id, lang: pack.lang, name: pack.name, subtitle: pack.subtitle, emblem: pack.emblem,
    entries: pack.entries, downloadedAt: Date.now(), dataVersion,
  }
}

/* ---------------- 注入替身（冒烟用） ---------------- */

let injected: DictBackend | null = null

export function setDictBackend(backend: DictBackend | null): void { injected = backend }
export function getDictBackend(): DictBackend | null { return injected }
export function isPersistentDictBackend(): boolean { return injected === null && typeof indexedDB !== 'undefined' }

/* ---------------- 原生 IndexedDB 实现 ---------------- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return }
    let req: IDBOpenDBRequest
    try { req = indexedDB.open(DICT_DB_NAME, DICT_DB_VERSION) }
    catch (err) { reject(err); return }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DICT_STORE)) {
        db.createObjectStore(DICT_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB blocked'))
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    let request: IDBRequest<T>
    try {
      const transaction = db.transaction(DICT_STORE, mode)
      request = run(transaction.objectStore(DICT_STORE))
    } catch (err) {
      db.close()
      reject(err)
      return
    }
    request.onsuccess = () => { resolve(request.result); db.close() }
    request.onerror = () => { reject(request.error); db.close() }
  }))
}

const nativeBackend: DictBackend = {
  async putPack(pack) { await tx('readwrite', (s) => s.put(pack) as IDBRequest<IDBValidKey>) },
  async getPack(id) {
    try { return (await tx<StoredDictPack | undefined>('readonly', (s) => s.get(id))) ?? null }
    catch { return null }
  },
  async listPacks() {
    try { return (await tx<StoredDictPack[]>('readonly', (s) => s.getAll())) ?? [] }
    catch { return [] }
  },
  async deletePack(id) { await tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>) },
  async clear() { await tx('readwrite', (s) => s.clear() as IDBRequest<undefined>) },
}

function backend(): DictBackend {
  return injected ?? nativeBackend
}

/* ---------------- 对外 API：全部吞掉异常，永不打断 UI ---------------- */

export async function downloadPack(pack: QueryDictPack): Promise<boolean> {
  try { await backend().putPack(toStoredPack(pack)); return true }
  catch { return false }
}

export async function getPack(id: string): Promise<StoredDictPack | null> {
  try { return await backend().getPack(id) }
  catch { return null }
}

export async function listDownloadedPacks(): Promise<StoredDictPack[]> {
  try { return await backend().listPacks() }
  catch { return [] }
}

export async function deletePack(id: string): Promise<boolean> {
  try { await backend().deletePack(id); return true }
  catch { return false }
}

export async function clearDictionaryData(): Promise<void> {
  try { await backend().clear() }
  catch { /* 离线兜底：清空失败不影响主数据 */ }
}
