import type { PersistedData } from '../types'
/** [新增] 大文本持久层：IndexedDB 主存，localStorage 只留索引 */
import {
  clearBigText, createMemoryBackend, getBigTextBackend, isPersistentBackend, setBigTextBackend,
} from './db'
/** [新增] 索引化纯函数：把正文拆成「索引（localStorage）+ 正文（IndexedDB）」 */
import {
  isHeavyBook, isHeavyVideo, mergeCultureState, mergeLibraryState,
  planBigTextMigration, slimCultureForStorage, slimLibraryForStorage, toBookStub, toVideoStub,
} from './bigText'
import type { LibraryState, LiteraryBook } from '../literaryTypes'
import type { CultureLibraryState, CultureVideo } from '../cultureTypes'
/** [新增] 四个文学键的默认值来自独立种子文件，避免与 literaryStorage 形成循环依赖 */
import {
  DEFAULT_LIBRARY_STATE, DEFAULT_READING_PROGRESS, DEFAULT_SEMINARS,
  DEFAULT_LITERARY_NOTES, LITERARY_SETTING_DEFAULTS,
} from '../data/librarySeed'
/** [修改点] 四个文化键的默认值同样来自独立种子文件 */
import {
  DEFAULT_CULTURE_LIBRARY, DEFAULT_WATCH_PROGRESS, DEFAULT_POSTWATCH_SESSIONS,
  DEFAULT_CULTURE_NOTES, CULTURE_SETTING_DEFAULTS,
} from '../data/cultureSeed'

/** [新增] 播放列表注册表默认值（三层储量体系的第 2 层） */
import { DEFAULT_PLAYLIST_REGISTRY } from '../data/playlistRegistrySeed'
/** [新增] 词场 6 个键的默认值（构造器保证每次新对象，避免共享引用） */
import { WORD_LAB_DEFAULTS } from './wordLabStorage'
import { DEFAULT_DAILY_LIMIT } from '../wordLabTypes'
/** [新增] 成长系统 4 个键的默认值；迁移在独立文件里，避免与 storage 循环引用 */
import { GROWTH_DEFAULTS } from './growthStorage'
/** [新增] China Learner Track 第 29 键的默认值 */
import { CHINA_TRACK_DEFAULTS } from '../chinaTrackTypes'
/** [新增] 对话语音层第 31 键的默认值 */
import { DEFAULT_VOICE_PREFERENCES } from '../voiceTypes'
/** [新增] CEFR 等级层第 30 键的默认值 */
import { DEFAULT_LEVEL_PREFERENCE } from '../levelTypes'

/** [修改点] 原 8 个键名与语义不变，追加文学 4 键 + 文化 4 键 + 注册表 1 键 + 词场 6 键 + S2.5 的 1 键 */
export const KEYS = {
  profile: 'lingua_profile',
  texts: 'lingua_texts',
  scenarios: 'lingua_scenarios',
  sessions: 'lingua_sessions',
  mistakes: 'lingua_mistakes',
  reviewQueue: 'lingua_review_queue',
  settings: 'lingua_settings',
  voiceReports: 'lingua_voice_reports',
  library: 'lingua_library',
  readingProgress: 'lingua_reading_progress',
  seminars: 'lingua_seminars',
  literaryNotes: 'lingua_literary_notes',
  cultureVideos: 'lingua_culture_videos',
  watchProgress: 'lingua_watch_progress',
  postWatchSessions: 'lingua_postwatch_sessions',
  cultureNotes: 'lingua_culture_notes',
  playlistRegistry: 'lingua_playlist_registry',
  wordProgress: 'lingua_word_progress',
  wordSessionDraft: 'lingua_word_session_draft',
  wordDailyQuota: 'lingua_word_daily_quota',
  wordErrors: 'lingua_word_errors',
  wordMediaCache: 'lingua_word_media_cache',
  deckSelection: 'lingua_deck_selection',
  /** [S2.5 新增] 第 24 个键：发音漏读 flags，与拼写易错本隔离 */
  pronunciationFlags: 'lingua_pronunciation_flags',
  /** [成长系统新增] 第 25-28 个键 */
  growth: 'lingua_growth',
  achievementsState: 'lingua_achievements',
  xpLedger: 'lingua_xp_ledger',
  activityHeatmap: 'lingua_activity_heatmap',
  /** [China Learner Track 新增] 第 29 个键：完成记录与省份配置 */
  chinaTrack: 'lingua_china_track',
  /** [CEFR 等级层新增] 第 30 个键：等级筛选偏好 */
  levelPreference: 'lingua_level_preference',
  /** [对话语音层新增] 第 31 个键：自动朗读开关 + 音色偏好 + 角色音色绑定 */
  voicePreferences: 'lingua_voice_preferences',
} as const

const ORDER: Array<keyof typeof KEYS> = [
  'profile', 'texts', 'scenarios', 'sessions', 'mistakes', 'reviewQueue', 'settings', 'voiceReports',
  'library', 'readingProgress', 'seminars', 'literaryNotes',
  'cultureVideos', 'watchProgress', 'postWatchSessions', 'cultureNotes',
  'playlistRegistry',
  'wordProgress', 'wordSessionDraft', 'wordDailyQuota', 'wordErrors', 'wordMediaCache', 'deckSelection',
  'pronunciationFlags',
  'growth', 'achievementsState', 'xpLedger', 'activityHeatmap',
  'chinaTrack',
  'levelPreference',
  'voicePreferences',
]

export const todayKey = (d = new Date()): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const DEFAULT_SETTINGS: PersistedData['settings'] = {
  difficulty: 'B1',
  ieltsLevel: 'b5',
  rate: 0.95,
  accent: 'en-US',
  showTranslation: true,
  correction: 'balanced',
  autoSpeak: false,
  apiMode: 'mock',
  apiEndpoint: '',
  apiKey: '',
  apiModel: 'gpt-4o-mini',
  asrEndpoint: '',
  asrKey: '',
  asrModel: 'whisper-1',
  /** [修改点] 文学两项默认值；旧存档缺字段时由 loadData 的 merge 自动补齐 */
  readingView: LITERARY_SETTING_DEFAULTS.readingView,
  seminarGuidance: LITERARY_SETTING_DEFAULTS.seminarGuidance,
  /** [修改点] 文化两项默认值；旧存档缺字段时由迁移只补缺、不覆盖 */
  captionPreference: CULTURE_SETTING_DEFAULTS.captionPreference,
  autoEnterPostWatch: CULTURE_SETTING_DEFAULTS.autoEnterPostWatch,
  /** [新增] 词场四项默认值：每日 12 个新词（10-15 可调）、打字拼写、自动发音开、显示配图开 */
  wordDailyLimit: DEFAULT_DAILY_LIMIT,
  wordSpellingMode: 'typing',
  wordAutoSpeak: true,
  wordShowImage: true,
  /** [S2.5 新增] 自动播放标准音 / 跟读默认展开；口音复用既有 accent */
  wordAutoPlayAudio: true,
  wordReadAloudExpanded: true,
  /** [成长系统新增] 默认开启 XP 动画与热力图 */
  showXpAnimation: true,
  showHeatmap: true,
  /** [多语言] 词场默认英语；旧存档浅合并会自动补此字段 */
  wordLanguage: 'en',
}

export const DEFAULT_PROFILE: PersistedData['profile'] = {
  nickname: 'Explorer',
  cefr: 'B1',
  dailyGoal: 30,
  xp: 0,
  streak: 1,
  lastActiveDate: todayKey(),
  todayXp: 0,
  todayDate: todayKey(),
  totalSessions: 0,
  achievements: [],
}

export const DEFAULT_DATA: PersistedData = {
  profile: DEFAULT_PROFILE,
  texts: [],
  scenarios: [],
  sessions: [],
  mistakes: [],
  reviewQueue: [],
  settings: DEFAULT_SETTINGS,
  voiceReports: [],
  /** [修改点] 文学四个键的默认值 */
  library: DEFAULT_LIBRARY_STATE,
  readingProgress: DEFAULT_READING_PROGRESS,
  seminars: DEFAULT_SEMINARS,
  literaryNotes: DEFAULT_LITERARY_NOTES,
  /** [修改点] 文化四个键的默认值 */
  cultureVideos: DEFAULT_CULTURE_LIBRARY,
  watchProgress: DEFAULT_WATCH_PROGRESS,
  postWatchSessions: DEFAULT_POSTWATCH_SESSIONS,
  cultureNotes: DEFAULT_CULTURE_NOTES,
  /** [新增] 播放列表注册表默认值（第 17 个键） */
  playlistRegistry: DEFAULT_PLAYLIST_REGISTRY,
  /** [新增] 词场 6 个键的默认值（第 18-23 个键） */
  wordProgress: WORD_LAB_DEFAULTS.wordProgress(),
  wordSessionDraft: WORD_LAB_DEFAULTS.wordSessionDraft(),
  wordDailyQuota: WORD_LAB_DEFAULTS.wordDailyQuota(),
  wordErrors: WORD_LAB_DEFAULTS.wordErrors(),
  wordMediaCache: WORD_LAB_DEFAULTS.wordMediaCache(),
  deckSelection: WORD_LAB_DEFAULTS.deckSelection(),
  /** [S2.5 新增] 第 24 个键 */
  pronunciationFlags: WORD_LAB_DEFAULTS.pronunciationFlags(),
  /** [成长系统新增] 第 25-28 个键（构造器保证新对象） */
  growth: GROWTH_DEFAULTS.growth(),
  achievementsState: GROWTH_DEFAULTS.achievements(),
  xpLedger: GROWTH_DEFAULTS.ledger(),
  activityHeatmap: GROWTH_DEFAULTS.heatmap(),
  /** [China Learner Track 新增] 第 29 个键（新对象，避免共享引用） */
  chinaTrack: { ...CHINA_TRACK_DEFAULTS, completed: {} },
  /** [CEFR 等级层新增] 第 30 个键（新对象，history / perModule 不共享引用） */
  levelPreference: {
    ...DEFAULT_LEVEL_PREFERENCE,
    perModule: { ...DEFAULT_LEVEL_PREFERENCE.perModule },
    history: [],
  },
  /** [对话语音层新增] 第 31 个键（新对象，perCharacter 不共享引用） */
  voicePreferences: {
    ...DEFAULT_VOICE_PREFERENCES,
    global: { ...DEFAULT_VOICE_PREFERENCES.global },
    perCharacter: {},
  },
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed == null ? fallback : (parsed as T)
  } catch {
    return fallback
  }
}

/**
 * 读取所有数据；单键损坏时只回退该键，不影响其余内容。
 *
 * [大数据迁移] 书架与文化两键走特殊合并：
 *   localStorage 里只有「索引」（书名/封面/字数/CEFR…），正文在 IndexedDB；
 *   而 JS bundle 里本来就带着一份**当前版本的全量种子**。
 *   所以内置条目一律以 bundle 全量为准，localStorage 的索引只负责
 *   「这条存在、且用户是否改过它」；自定义 / 同步来的条目保留索引，
 *   正文随后由 IndexedDB 水合补齐。
 */
export function loadData(): PersistedData {
  if (typeof window === 'undefined' || !window.localStorage) return structuredClone(DEFAULT_DATA)
  const result = structuredClone(DEFAULT_DATA)
  for (const key of ORDER) {
    const value = safeParse<unknown>(window.localStorage.getItem(KEYS[key]), null)
    if (value == null) continue
    if (key === 'library') {
      result.library = mergeLibraryState(result.library, value as Partial<LibraryState>)
      continue
    }
    if (key === 'cultureVideos') {
      result.cultureVideos = mergeCultureState(result.cultureVideos, value as Partial<CultureLibraryState>)
      continue
    }
    if (Array.isArray(result[key])) {
      if (Array.isArray(value)) (result[key] as unknown[]) = value
    } else if (typeof value === 'object') {
      result[key] = { ...(result[key] as object), ...(value as object) } as never
    }
  }
  const today = todayKey()
  if (result.profile.todayDate !== today) {
    result.profile.todayDate = today
    result.profile.todayXp = 0
  }
  return result
}

/* ---------------------------------------------------------------- *
 * 大文本瘦身（写 localStorage 之前）
 * ---------------------------------------------------------------- */

/**
 * 书籍索引的派生指标很贵（要跑正则统计字数与 CEFR），
 * 而同一本书对象在内存里是稳定引用，所以缓存一份索引形态复用。
 */
const bookStubCache = new WeakMap<object, LiteraryBook>()
const videoStubCache = new WeakMap<object, CultureVideo>()

function slimBook(book: LiteraryBook): LiteraryBook {
  if (!isHeavyBook(book)) return book
  const hit = bookStubCache.get(book)
  if (hit) return hit
  const stub = toBookStub(book)
  bookStubCache.set(book, stub)
  return stub
}

function slimVideo(video: CultureVideo): CultureVideo {
  if (!isHeavyVideo(video)) return video
  const hit = videoStubCache.get(video)
  if (hit) return hit
  const stub = toVideoStub(video)
  videoStubCache.set(video, stub)
  return stub
}

/**
 * 是否启用瘦身。
 * 默认跟随后端：IndexedDB 可用才瘦身；一旦某次写入失败（配额/隐私模式），
 * 可调用 disableSlimming() 退回旧行为，宁可占地方也绝不丢正文。
 */
let slimOverride: boolean | null = null

export function disableSlimming(): void {
  slimOverride = false
}

export function isSlimmingEnabled(): boolean {
  return slimOverride !== null ? slimOverride : isPersistentBackend()
}

/** 写盘前的形态转换：正文留在 IndexedDB，localStorage 只留索引 */
export function slimForStorage(data: PersistedData): PersistedData {
  if (!isSlimmingEnabled()) return data
  return {
    ...data,
    library: slimLibraryForStorage({
      ...data.library,
      books: (data.library?.books || []).map(slimBook),
    }),
    cultureVideos: slimCultureForStorage({
      ...data.cultureVideos,
      videos: (data.cultureVideos?.videos || []).map(slimVideo),
    }),
  }
}

/** 只写发生变化的键，避免无关写入 */
export function saveData(data: PersistedData, prev?: PersistedData): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const outgoing = slimForStorage(data)
    const previous = prev ? slimForStorage(prev) : undefined
    for (const key of ORDER) {
      if (previous && JSON.stringify(previous[key]) === JSON.stringify(outgoing[key])) continue
      window.localStorage.setItem(KEYS[key], JSON.stringify(outgoing[key]))
    }
  } catch (err) {
    console.warn('[LinguaBuddy] localStorage 写入失败：', err)
  }
}

export interface BigTextMigrationReport {
  /** 是否因环境限制跳过（无 IndexedDB / 存储不可用） */
  skipped: boolean
  /** 搬进 IndexedDB 的书籍条目数 */
  booksMoved: number
  /** 搬进 IndexedDB 的视频条目数 */
  videosMoved: number
  /** lingua_library 是否已替换为索引形态 */
  librarySlimmed: boolean
  /** lingua_culture_videos 是否已替换为索引形态 */
  cultureSlimmed: boolean
}

const NOOP_BIG_TEXT_REPORT: BigTextMigrationReport = {
  skipped: true, booksMoved: 0, videosMoved: 0, librarySlimmed: false, cultureSlimmed: false,
}

/**
 * [大数据迁移] 把旧 localStorage 里的正文搬进 IndexedDB。
 *
 * 幂等：输入已是索引形态时直接空跑（changed=false）。
 * 安全：**先写库成功、后删本地正文**——任何一步失败都保留本地原文，绝不丢数据。
 * 纯前端：没有 IndexedDB（老浏览器 / 隐私模式）时整体跳过，
 *         应用保持升级前的行为，一个字节都不改。
 */
export async function migrateBigTextStorage(): Promise<BigTextMigrationReport> {
  if (typeof window === 'undefined' || !window.localStorage) return { ...NOOP_BIG_TEXT_REPORT }
  const backend = await getBigTextBackend()
  if (!backend.persistent) return { ...NOOP_BIG_TEXT_REPORT }
  const report: BigTextMigrationReport = {
    skipped: false, booksMoved: 0, videosMoved: 0, librarySlimmed: false, cultureSlimmed: false,
  }
  try {
    const ls = window.localStorage
    const plan = planBigTextMigration(ls.getItem(KEYS.library), ls.getItem(KEYS.cultureVideos))
    if (!plan.changed) return report
    if (plan.booksToStore.length) {
      const moved = await backend.putBooks(plan.booksToStore)
      report.booksMoved = moved
      if (moved >= plan.booksToStore.length && plan.libraryRaw != null) {
        ls.setItem(KEYS.library, plan.libraryRaw)
        report.librarySlimmed = true
      }
    }
    if (plan.videosToStore.length) {
      const moved = await backend.putMedias(plan.videosToStore)
      report.videosMoved = moved
      if (moved >= plan.videosToStore.length && plan.cultureRaw != null) {
        ls.setItem(KEYS.cultureVideos, plan.cultureRaw)
        report.cultureSlimmed = true
      }
    }
    return report
  } catch (err) {
    console.warn('[LinguaBuddy] 大文本迁移被跳过（不影响原有数据）：', err)
    return { ...NOOP_BIG_TEXT_REPORT }
  }
}

/**
 * 清空全部数据：31 个 localStorage 键 + IndexedDB 里的正文。
 * 清空是异步的（IndexedDB 事务），调用方 await 即可。
 */
export async function clearAllDataAsync(): Promise<void> {
  clearAllData()
  await clearBigText()
}

export function clearAllData(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    for (const key of ORDER) window.localStorage.removeItem(KEYS[key])
  } catch (err) {
    console.warn('[LinguaBuddy] 清空数据失败：', err)
  }
}

/** 供测试与诊断：注入大文本后端（传 null 恢复自动探测） */
export { setBigTextBackend, createMemoryBackend, getBigTextBackend, isPersistentBackend }
