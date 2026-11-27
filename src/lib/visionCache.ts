/**
 * [查询 Query · 视觉识别] 独立 IndexedDB 缓存库
 * ------------------------------------------------------------------
 * 为什么独立、不复用 db.ts / dictionaryDb.ts：
 *  - db.ts 的 DB_NAME='lingua_buddy_store' / DB_VERSION===1 / 双表被 smoke 冻结；
 *  - dictionaryDb.ts 的 DICT_DB_VERSION===1 同样被冻结；
 *  - 视觉缓存是「7 天 TTL、可整体清空」的派生数据，生命周期与主数据不同。
 *
 * 契约：
 *  - 只存识别后的纯文本 + 元信息，**绝不存原图 / base64**（隐私 + 配额）；
 *  - TTL 7 天，读取时惰性判过期并删除；
 *  - 无 IndexedDB / 隐私模式 → 降级内存 Map，方法全不抛错；
 *  - setVisionCacheBackend 注入替身，供冒烟在无 jsdom IndexedDB 时验证；
 *  - 清空全部数据时由 useAppStore.resetAll 调用 clearVisionCache()。
 * 零 localStorage 键（31 键契约不变）。
 */

export const VISION_DB_NAME = 'lingua_vision_store'
export const VISION_DB_VERSION = 1
export const VISION_STORE = 'vision_cache'
export const VISION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface VisionCachedResult {
  key: string
  /** 识别出的纯文本（不含原图） */
  text: string
  /** 是否来自降级 / Mock，用于 UI 标注，绝不冒充真实识别 */
  degraded: boolean
  mock: boolean
  createdAt: number
}

export interface VisionCacheBackend {
  readonly kind: 'indexeddb' | 'memory'
  get(key: string, now?: number): Promise<VisionCachedResult | null>
  put(result: VisionCachedResult): Promise<boolean>
  clear(): Promise<void>
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 请求失败'))
  })
}

function openNativeDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return resolve(null)
      const req = indexedDB.open(VISION_DB_NAME, VISION_DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(VISION_STORE)) {
          db.createObjectStore(VISION_STORE, { keyPath: 'key' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
}

function createIndexedDbBackend(db: IDBDatabase): VisionCacheBackend {
  const tx = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction
      try { transaction = db.transaction(VISION_STORE, mode) }
      catch (err) { reject(err); return }
      transaction.oncomplete = () => resolve(undefined as T)
      transaction.onerror = () => reject(transaction.error ?? new Error('视觉缓存事务失败'))
      transaction.onabort = () => reject(transaction.error ?? new Error('视觉缓存事务中止'))
      void run(transaction.objectStore(VISION_STORE)).then(resolve, reject)
    })
  return {
    kind: 'indexeddb',
    async get(key, now = Date.now()) {
      try {
        const value = await tx('readonly', (s) => requestToPromise(s.get(key)))
        const hit = (value as VisionCachedResult | undefined) ?? null
        if (!hit) return null
        if (now - hit.createdAt > VISION_TTL_MS) {
          await tx('readwrite', (s) => requestToPromise(s.delete(key)))
          return null
        }
        return hit
      } catch { return null }
    },
    async put(result) {
      try { await tx('readwrite', (s) => requestToPromise(s.put(result))); return true }
      catch { return false }
    },
    async clear() {
      try { await tx('readwrite', (s) => requestToPromise(s.clear())) } catch { /* 忽略 */ }
    },
  }
}

/** 内存降级：只存文本，不存图；同样做 TTL 与上限淘汰 */
export function createMemoryVisionCache(): VisionCacheBackend {
  const map = new Map<string, VisionCachedResult>()
  const MAX_ENTRIES = 200
  return {
    kind: 'memory',
    async get(key, now = Date.now()) {
      const hit = map.get(key) ?? null
      if (!hit) return null
      if (now - hit.createdAt > VISION_TTL_MS) { map.delete(key); return null }
      return hit
    },
    async put(result) {
      if (map.size >= MAX_ENTRIES) {
        const oldest = [...map.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0]
        if (oldest) map.delete(oldest[0])
      }
      map.set(result.key, result)
      return true
    },
    async clear() { map.clear() },
  }
}

let injected: VisionCacheBackend | null = null
let resolved: VisionCacheBackend | null = null
let pending: Promise<VisionCacheBackend> | null = null

/** 注入替身（单测用）。传 null 恢复自动探测。 */
export function setVisionCacheBackend(backend: VisionCacheBackend | null): void {
  injected = backend
  resolved = null
  pending = null
}

export function getVisionCacheBackend(): Promise<VisionCacheBackend> {
  if (injected) { resolved = injected; return Promise.resolve(injected) }
  if (resolved) return Promise.resolve(resolved)
  if (!pending) {
    pending = openNativeDb()
      .then((db) => {
        const backend = db ? createIndexedDbBackend(db) : createMemoryVisionCache()
        resolved = backend
        return backend
      })
      .catch(() => {
        const backend = createMemoryVisionCache()
        resolved = backend
        return backend
      })
  }
  return pending
}

export async function getVisionCache(key: string, now?: number): Promise<VisionCachedResult | null> {
  try { return await (await getVisionCacheBackend()).get(key, now) } catch { return null }
}

export async function putVisionCache(result: VisionCachedResult): Promise<boolean> {
  try { return await (await getVisionCacheBackend()).put(result) } catch { return false }
}

export async function clearVisionCache(): Promise<void> {
  try { await (await getVisionCacheBackend()).clear() } catch { /* 忽略 */ }
}
