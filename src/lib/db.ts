/* ================================================================
 * 大文本持久层：IndexedDB（主）+ 内存替身（降级 / 单测）
 *
 * 为什么要它：
 *   书架的书籍全文（5 本公版书 ≈ 42KB）与文化视频的完整条目（50 条 ≈ 122KB）
 *   原本被整份写进 localStorage。这两块数据在 JS bundle 里本来就有一份，
 *   写进 localStorage 属于双份存储；而用户自己添加的长文本（自定义短篇、
 *   同步来的播放列表条目）会持续把 5MB 配额吃满，最终触发
 *   QuotaExceededError —— 那时整份存档写入失败，学习记录一起丢。
 *
 * 分工（严格对齐 README 的 31 键契约）：
 *   localStorage → 只放「索引 / 状态标志 / 阅读进度」，轻量、可同步读
 *   IndexedDB     → 放「大段文本」：书籍章节、视频内容卡、字幕素材
 *
 * 纯前端：不依赖任何后端。IndexedDB 不可用时（老浏览器 / 隐私模式）
 * 自动降级为「不瘦身」——行为与升级前逐项一致，绝不丢数据。
 *
 * 所有方法都不抛异常：存储层的问题绝不允许打断学习流程。
 * ================================================================ */

export const DB_NAME = 'lingua_buddy_store'
export const DB_VERSION = 1
/** 表一：书籍全文与章节 */
export const STORE_BOOKS = 'library_books'
/** 表二：文化长文背景卡、字幕素材等媒体内容 */
export const STORE_MEDIA = 'culture_media'

export interface BigTextBackend {
  /** 底层实现标识 */
  readonly kind: 'indexeddb' | 'memory'
  /**
   * true 表示「可以把大文本从 localStorage 挪走」——
   * 只有真正有独立持久介质的后端才为 true。
   * 内存替身由测试注入时也为 true（它代表一个可写的独立存储）；
   * 自动降级用的空后端为 false（此时保持旧行为，不做任何瘦身）。
   */
  readonly persistent: boolean
  putBook(book: unknown): Promise<boolean>
  putBooks(books: unknown[]): Promise<number>
  getBook(id: string): Promise<unknown | null>
  listBooks(): Promise<unknown[]>
  putMedia(video: unknown): Promise<boolean>
  putMedias(videos: unknown[]): Promise<number>
  getMedia(id: string): Promise<unknown | null>
  listMedias(): Promise<unknown[]>
  clear(): Promise<void>
}

/* ---------------------------------------------------------------- *
 * IndexedDB 原生实现
 * ---------------------------------------------------------------- */

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 请求失败'))
  })
}

function openNativeDb(): Promise<IDBDatabase | null> {
  return new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return resolve(null)
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          db.createObjectStore(STORE_BOOKS, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      // 打不开 / 被旧版本占用 / 隐私模式禁用 —— 一律降级，绝不抛错
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function createIndexedDbBackend(db: IDBDatabase): BigTextBackend {
  const tx = <T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction
      try {
        transaction = db.transaction(store, mode)
      } catch (err) {
        reject(err)
        return
      }
      transaction.oncomplete = () => resolve(undefined as T)
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 事务失败'))
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 事务中止'))
      void run(transaction.objectStore(store)).then(resolve, reject)
    })

  const writeAll = async (store: string, items: unknown[]): Promise<number> => {
    if (!items.length) return 0
    await tx(store, 'readwrite', async (s) => {
      for (const item of items) await requestToPromise(s.put(item))
    })
    return items.length
  }

  return {
    kind: 'indexeddb',
    persistent: true,
    async putBook(book) {
      try {
        const id = (book as { id?: unknown } | null)?.id
        if (typeof id !== 'string' || !id) return false
        await writeAll(STORE_BOOKS, [book])
        return true
      } catch { return false }
    },
    async putBooks(books) {
      try {
        const valid = books.filter((b) => typeof (b as { id?: unknown } | null)?.id === 'string')
        return await writeAll(STORE_BOOKS, valid)
      } catch { return 0 }
    },
    async getBook(id) {
      try {
        const value = await tx(STORE_BOOKS, 'readonly', (s) => requestToPromise(s.get(id)))
        return (value as unknown) ?? null
      } catch { return null }
    },
    async listBooks() {
      try {
        const value = await tx(STORE_BOOKS, 'readonly', (s) => requestToPromise(s.getAll()))
        return Array.isArray(value) ? (value as unknown[]) : []
      } catch { return [] }
    },
    async putMedia(video) {
      try {
        const id = (video as { id?: unknown } | null)?.id
        if (typeof id !== 'string' || !id) return false
        await writeAll(STORE_MEDIA, [video])
        return true
      } catch { return false }
    },
    async putMedias(videos) {
      try {
        const valid = videos.filter((v) => typeof (v as { id?: unknown } | null)?.id === 'string')
        return await writeAll(STORE_MEDIA, valid)
      } catch { return 0 }
    },
    async getMedia(id) {
      try {
        const value = await tx(STORE_MEDIA, 'readonly', (s) => requestToPromise(s.get(id)))
        return (value as unknown) ?? null
      } catch { return null }
    },
    async listMedias() {
      try {
        const value = await tx(STORE_MEDIA, 'readonly', (s) => requestToPromise(s.getAll()))
        return Array.isArray(value) ? (value as unknown[]) : []
      } catch { return [] }
    },
    async clear() {
      try {
        await tx(STORE_BOOKS, 'readwrite', (s) => requestToPromise(s.clear()))
      } catch { /* 忽略 */ }
      try {
        await tx(STORE_MEDIA, 'readwrite', (s) => requestToPromise(s.clear()))
      } catch { /* 忽略 */ }
    },
  }
}

/* ---------------------------------------------------------------- *
 * 内存替身：单测注入用（代表一个可写的独立存储介质）
 * ---------------------------------------------------------------- */

export function createMemoryBackend(): BigTextBackend {
  const books = new Map<string, unknown>()
  const media = new Map<string, unknown>()
  const idOf = (v: unknown): string | null => {
    const id = (v as { id?: unknown } | null)?.id
    return typeof id === 'string' && id ? id : null
  }
  return {
    kind: 'memory',
    persistent: true,
    async putBook(book) {
      const id = idOf(book)
      if (!id) return false
      books.set(id, book)
      return true
    },
    async putBooks(list) {
      let n = 0
      for (const item of list) {
        const id = idOf(item)
        if (!id) continue
        books.set(id, item)
        n += 1
      }
      return n
    },
    async getBook(id) { return books.has(id) ? books.get(id)! : null },
    async listBooks() { return [...books.values()] },
    async putMedia(video) {
      const id = idOf(video)
      if (!id) return false
      media.set(id, video)
      return true
    },
    async putMedias(list) {
      let n = 0
      for (const item of list) {
        const id = idOf(item)
        if (!id) continue
        media.set(id, item)
        n += 1
      }
      return n
    },
    async getMedia(id) { return media.has(id) ? media.get(id)! : null },
    async listMedias() { return [...media.values()] },
    async clear() { books.clear(); media.clear() },
  }
}

/* ---------------------------------------------------------------- *
 * 空后端：自动降级用。persistent=false —— 绝不触发瘦身，保持旧行为。
 * ---------------------------------------------------------------- */

function createNullBackend(): BigTextBackend {
  return {
    kind: 'memory',
    persistent: false,
    async putBook() { return false },
    async putBooks() { return 0 },
    async getBook() { return null },
    async listBooks() { return [] },
    async putMedia() { return false },
    async putMedias() { return 0 },
    async getMedia() { return null },
    async listMedias() { return [] },
    async clear() { /* 无可清 */ },
  }
}

/* ---------------------------------------------------------------- *
 * 后端选择与注入
 * ---------------------------------------------------------------- */

let injected: BigTextBackend | null = null
let resolved: BigTextBackend | null = null
let pending: Promise<BigTextBackend> | null = null

/** 注入后端（单测用）。传 null 恢复自动探测。 */
export function setBigTextBackend(backend: BigTextBackend | null): void {
  injected = backend
  resolved = null
  pending = null
}

/** 取当前后端：注入优先 → IndexedDB → 空后端降级。永不抛错。 */
export function getBigTextBackend(): Promise<BigTextBackend> {
  // 注入后端要同步写入 resolved：isPersistentBackend() 依赖它决定是否瘦身，
  // 漏掉这一步会让测试替身（以及任何手动注入场景）静默退回"不瘦身"分支。
  if (injected) {
    resolved = injected
    return Promise.resolve(injected)
  }
  if (resolved) return Promise.resolve(resolved)
  if (!pending) {
    pending = openNativeDb()
      .then((db) => {
        const backend = db ? createIndexedDbBackend(db) : createNullBackend()
        resolved = backend
        return backend
      })
      .catch(() => {
        const backend = createNullBackend()
        resolved = backend
        return backend
      })
  }
  return pending
}

/**
 * 是否可以把大文本从 localStorage 挪走。
 * 必须在 getBigTextBackend() 解析之后才有意义（未解析时一律保守返回 false）。
 */
export function isPersistentBackend(): boolean {
  return resolved?.persistent === true
}

/** 清空大文本存储（供「清空全部数据」用）。永不抛错。 */
export async function clearBigText(): Promise<void> {
  try {
    const backend = await getBigTextBackend()
    await backend.clear()
  } catch { /* 忽略 */ }
}
