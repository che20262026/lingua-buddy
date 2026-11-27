import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import type { PersistedData, View } from '../types'
import {
  clearAllData, DEFAULT_DATA, DEFAULT_SETTINGS, loadData, saveData, migrateBigTextStorage,
} from '../lib/storage'
/** [大数据迁移] IndexedDB 正文水合：内置条目走 bundle，自定义条目从库里补回 */
import { clearBigText, getBigTextBackend } from '../lib/db'
import { clearDictionaryData } from '../lib/dictionaryDb'
/** [查询 Query] 视觉识别缓存（7 天 TTL）随「清空全部数据」一并清除 */
import { clearVisionCache } from '../lib/visionCache'
import { hydrateCulture, hydrateLibrary } from '../lib/bigText'
import type { LiteraryBook } from '../literaryTypes'
import type { CultureVideo } from '../cultureTypes'
import { configureGenerator } from '../services/dialogueDirector'
/** [新增] 文学模块两个可替换服务与轻量迁移 */
import { configureAnalyzer } from '../services/literaryAnalyzer'
import { configureSeminarGenerator } from '../services/seminarDirector'
import { migrateLiteraryData } from '../lib/literaryStorage'
/** [修改点] 文化模块两个可替换服务与轻量迁移 */
import { configureCultureAnalyzer } from '../services/cultureAnalyzer'
import { configurePostWatchGenerator } from '../services/postWatchDirector'
import { migrateCultureData } from '../lib/cultureStorage'
/** [新增] 词场模块迁移 */
import { migrateWordLabData } from '../lib/wordLabStorage'
/** [新增] 成长系统：幂等迁移 + 统一发放服务 + profile 只读镜像 */
import { migrateGrowthData, mirrorProfile } from '../lib/growthStorage'
/** [对话语音层] 音色偏好的幂等迁移（第 31 键） */
import { ensureVoiceDefaults, migrateVoiceData } from '../lib/voiceStorage'
import { awardXp as awardXpService, configureGrowth, resetGrowthConfig } from '../services/growth'
import type { XpEvent, XpResult } from '../growthTypes'
import { evaluateAchievements } from '../services/coach'
/** [China Learner Track] 结构级反馈引擎随设置切换，默认本地 Mock */
import { configureWritingFeedback, resetWritingFeedbackProvider } from '../services/writingFeedback'
import type { TrackId } from '../chinaTrackTypes'

export interface NavParams {
  analysisId?: string
  scenarioId?: string
  sessionId?: string
  characterId?: string
  /** [修改点] 追加文学模块导航参数，原 4 个不变 */
  bookId?: string
  chapterId?: string
  seminarId?: string
  paragraphIndex?: number
  /** [修改点] 追加文化模块导航参数 */
  videoId?: string
  postWatchId?: string
  /** [新增] 词场模块导航参数：复习页默认打开哪个 tab */
  reviewTab?: 'queue' | 'mistakes' | 'words' | 'wordLab'
  /** [China Learner Track] 单元练习页与首页轨道筛选 */
  chinaUnitId?: string
  chinaTrackFilter?: TrackId | 'all'
}

export interface AppContextValue {
  data: PersistedData
  update: (recipe: (prev: PersistedData) => PersistedData) => void
  view: View
  params: NavParams
  navigate: (view: View, params?: NavParams) => void
  toast: string | null
  notify: (message: string) => void
  /** [成长系统] 唯一 XP 发放入口；所有调用点必须传完整 XpEvent（含幂等 ID） */
  awardXp: (event: XpEvent) => XpResult
  resetAll: () => void
  draftText: string
  setDraftText: (text: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  /** [修改点] loadData 之前跑两次幂等迁移；旧 8 键语义与内容不受影响 */
  const [data, setData] = useState<PersistedData>(() => {
    migrateLiteraryData()
    migrateCultureData()
    migrateWordLabData()
    /** [成长系统] 第四次幂等迁移：旧 profile 的 XP/streak 只迁入一次 */
    migrateGrowthData()
    /** [对话语音层] 第五次幂等迁移：音色偏好与旧 settings 的自动朗读开关对齐 */
    migrateVoiceData()
    ensureVoiceDefaults()
    return loadData()
  })
  const [view, setView] = useState<View>('home')
  const [params, setParams] = useState<NavParams>({})
  const [toast, setToast] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  /**
   * [大数据迁移] 首次写盘闸门：IndexedDB 水合完成前不得落盘。
   * 否则「旧存档正文还在 localStorage、内存已合并全量」时抢先写入
   * 会把正文按索引形态截短，而 IndexedDB 里还没有副本 —— 直接丢数据。
   */
  const [bigTextReady, setBigTextReady] = useState(false)
  const prevRef = useRef<PersistedData | undefined>(undefined)
  const toastTimer = useRef<number | undefined>(undefined)

  /**
   * [大数据迁移] 启动水合（纯本地、异步、失败静默）：
   *   1) 把旧 localStorage 的正文搬进 IndexedDB，原键换成轻量索引；
   *   2) 从 IndexedDB 把自定义书 / 同步视频的正文补回内存态；
   *   3) 全程不阻塞首屏，IndexedDB 不可用时原样跳过（保持旧行为）。
   * 2.5s 兜底解锁：即使存储层异常卡住，也不能让首次写盘永久停摆。
   */
  useEffect(() => {
    let cancelled = false
    const fallback = window.setTimeout(() => {
      if (!cancelled) setBigTextReady(true)
    }, 2500)
    void (async () => {
      try {
        await migrateBigTextStorage()
        const backend = await getBigTextBackend()
        if (!backend.persistent) return // 降级模式：正文仍留在 localStorage，无需水合
        const [books, videos] = await Promise.all([backend.listBooks(), backend.listMedias()])
        if (cancelled) return
        if (books.length) {
          setData((prev) => ({ ...prev, library: hydrateLibrary(prev.library, books as LiteraryBook[]) }))
        }
        if (videos.length) {
          setData((prev) => ({
            ...prev,
            cultureVideos: hydrateCulture(prev.cultureVideos, videos as CultureVideo[]),
          }))
        }
      } catch (err) {
        console.warn('[LinguaBuddy] 大文本水合被跳过（不影响原有数据）：', err)
      } finally {
        if (!cancelled) {
          window.clearTimeout(fallback)
          setBigTextReady(true)
        }
      }
    })()
    return () => { cancelled = true; window.clearTimeout(fallback) }
  }, [])

  useEffect(() => {
    if (!bigTextReady) return
    saveData(data, prevRef.current)
    prevRef.current = data
  }, [data, bigTextReady])

  useEffect(() => {
    configureGenerator(data.settings)
    /** [修改点] 五个可替换服务共用同一份设置 */
    configureAnalyzer(data.settings)
    configureSeminarGenerator(data.settings)
    configureCultureAnalyzer(data.settings)
    configurePostWatchGenerator(data.settings)
    /** [China Learner Track] 第六个可替换服务：mock 模式下纯本地结构级反馈 */
    configureWritingFeedback(data.settings)
  }, [data.settings])

  /** [成长系统] 每日目标跟随旧 profile.dailyGoal，注入服务供「达成当日目标」判定 */
  useEffect(() => {
    configureGrowth({ dailyGoal: data.profile.dailyGoal || 30, enabled: true })
  }, [data.profile.dailyGoal])

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const update = useCallback((recipe: (prev: PersistedData) => PersistedData) => {
    setData((prev) => recipe(prev))
  }, [])

  const navigate = useCallback((next: View, nextParams: NavParams = {}) => {
    setView(next)
    setParams(nextParams)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  /**
   * [成长系统] 唯一 XP 发放入口：所有模块经此调用，服务内部做幂等 / 限流 / 等级 / streak / 成就。
   * 服务实时读写 localStorage 四键（多标签页以磁盘账本为准），成功后把四键快照同步进 React state，
   * 并把 xp / streak / todayXp 回写 profile 作为只读镜像（旧 UI 与旧存档继续可读）。
   */
  const awardXp = useCallback((event: XpEvent): XpResult => {
    const result = awardXpService(event)
    if (result.granted) {
      setData((prev) => {
        const next: PersistedData = {
          ...prev,
          growth: result.bundle.growth,
          achievementsState: result.bundle.achievements,
          xpLedger: result.bundle.ledger,
          activityHeatmap: result.bundle.heatmap,
          profile: mirrorProfile(prev.profile, result.bundle.growth),
        }
        /** [成长系统] 旧 8 枚徽章只读镜像的增量判定，只在发放完成后跑一次，不再每次渲染全量扫描 */
        const unlocked = evaluateAchievements(next)
        if (unlocked.length) {
          next.profile = { ...next.profile, achievements: [...next.profile.achievements, ...unlocked] }
        }
        return next
      })
    }
    return result
  }, [])

  const resetAll = useCallback(() => {
    clearAllData()
    /** [大数据迁移] 31 键与 IndexedDB 两张表一并清空，避免残留正文下次冷启动又被水合回来 */
    void clearBigText()
    /** [查询 Query] 独立词典库与视觉缓存一并清空（不新增 localStorage 键） */
    void clearDictionaryData()
    void clearVisionCache()
    setData(structuredClone(DEFAULT_DATA))
    prevRef.current = undefined
    setDraftText('')
    configureGenerator(DEFAULT_SETTINGS)
    /** [修改点] 清空数据后四个新服务同步回到 Mock */
    configureAnalyzer(DEFAULT_SETTINGS)
    configureSeminarGenerator(DEFAULT_SETTINGS)
    configureCultureAnalyzer(DEFAULT_SETTINGS)
    configurePostWatchGenerator(DEFAULT_SETTINGS)
    /** [China Learner Track] 清空数据后结构级反馈引擎回到 Mock */
    resetWritingFeedbackProvider()
    configureWritingFeedback(DEFAULT_SETTINGS)
    /** [成长系统] 清空后重置服务内存态，四键由 clearAllData 移除、再由 DEFAULT_DATA 重新播种 */
    resetGrowthConfig()
    configureGrowth({ dailyGoal: DEFAULT_DATA.profile.dailyGoal, enabled: true })
    setView('home')
    setParams({})
    notify('所有学习数据已清空，崭新的旅程开始啦')
  }, [notify])

  const value = useMemo<AppContextValue>(() => ({
    data, update, view, params, navigate, toast, notify, awardXp, resetAll, draftText, setDraftText,
  }), [data, update, view, params, navigate, toast, notify, awardXp, resetAll, draftText])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}

/** 常用派生数据 */
export function useDerived() {
  const { data } = useApp()
  const dueReviews = data.reviewQueue.filter((r) => r.dueAt <= Date.now())
  const totalTurns = data.sessions.reduce((s, item) => s + item.turns, 0)
  const coveredWords = new Set(data.sessions.flatMap((s) => s.coveredWords)).size
  const unfinished = data.sessions.find((s) => !s.finishedAt)
  return { dueReviews, totalTurns, coveredWords, unfinished }
}
