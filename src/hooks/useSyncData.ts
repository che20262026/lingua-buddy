import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { PersistedData } from '../types'
import { isSupabaseConfigured, supabase, toSyncError } from '../lib/supabase'
import { useApp } from '../store/useAppStore'

/**
 * [云同步] 与 Supabase user_data 表的 data_type 一一对应。
 * 只同步三类核心数据；其余 28 个 localStorage 键（含 apiKey / asrKey）永远留在本机。
 * 以后要扩同步范围，只需在此登记，表结构无需改动。
 */
export const SYNC_TYPES = [
  'lingua_profile',
  'lingua_mistakes',
  'lingua_review_queue',
] as const

export interface SyncPayload {
  profile: PersistedData['profile']
  mistakes: PersistedData['mistakes']
  reviewQueue: PersistedData['reviewQueue']
}

export type ConflictChoice = 'local' | 'cloud'
export type SyncPhase = 'idle' | 'checking' | 'pushing' | 'pulling' | 'conflict' | 'ready' | 'error'

interface CloudRow {
  data_type: string
  json_data: unknown
}

/** 本地是否已有"值得保留"的学习痕迹（不能只看键存在，loadData 总会给默认值） */
function hasLocalLearning(d: PersistedData): boolean {
  return d.profile.xp > 0
    || d.profile.totalSessions > 0
    || d.profile.streak > 1
    || d.mistakes.length > 0
    || d.reviewQueue.length > 0
    || d.texts.length > 0
    || d.sessions.length > 0
}

/** 云端是否已有实质数据，而不是三行空壳 */
function hasCloudLearning(rows: CloudRow[]): boolean {
  return rows.some((r) => {
    const v = r.json_data
    if (Array.isArray(v)) return v.length > 0
    if (v && typeof v === 'object') {
      const p = v as Record<string, unknown>
      return Number(p.xp ?? 0) > 0 || Number(p.totalSessions ?? 0) > 0
    }
    return false
  })
}

function buildPayload(d: PersistedData): SyncPayload {
  return { profile: d.profile, mistakes: d.mistakes, reviewQueue: d.reviewQueue }
}

function payloadFromRows(rows: CloudRow[]): Partial<SyncPayload> {
  const out: Partial<SyncPayload> = {}
  for (const r of rows) {
    const v = r.json_data
    if (r.data_type === 'lingua_profile' && v && typeof v === 'object' && !Array.isArray(v)) {
      out.profile = v as PersistedData['profile']
    }
    if (r.data_type === 'lingua_mistakes' && Array.isArray(v)) {
      out.mistakes = v as PersistedData['mistakes']
    }
    if (r.data_type === 'lingua_review_queue' && Array.isArray(v)) {
      out.reviewQueue = v as PersistedData['reviewQueue']
    }
  }
  return out
}

/** 只覆盖三类同步键，其余 28 个本地键一律原样保留 */
function applyCloud(current: PersistedData, cloud: Partial<SyncPayload>): PersistedData {
  return {
    ...current,
    profile: { ...current.profile, ...(cloud.profile ?? {}) },
    mistakes: Array.isArray(cloud.mistakes) ? cloud.mistakes : current.mistakes,
    reviewQueue: Array.isArray(cloud.reviewQueue) ? cloud.reviewQueue : current.reviewQueue,
  }
}

export interface UseSyncData {
  configured: boolean
  user: User | null
  authBusy: boolean
  phase: SyncPhase
  message: string
  lastSyncedAt: string | null
  conflictOpen: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resolveConflict: (choice: ConflictChoice) => Promise<void>
  deferConflict: () => void
  pushNow: () => Promise<void>
}

/* =======================================================================
 * [模块级共享 store · 全应用单例]
 *
 * 为什么要提升到模块级：首页的登录横幅与设置页的账号卡片都要读同一份会话。
 * 若每个组件各调一次 useSyncData()，onAuthStateChange 会被订阅多次，
 * 登录时 handleSignedIn 会跑多遍 —— 多余的 fetchCloud 网络往返 + 重复推送。
 * 这里把「会话订阅 + 会话级状态」做成真正的单例：
 *   - supabase.auth.onAuthStateChange 全应用只订阅一次；
 *   - user / phase / message / lastSyncedAt / conflictOpen / authBusy 共享同一份；
 *   - React 侧用 useSyncExternalStore 订阅，天然避免「两处真相」与重复请求。
 *
 * canAutoPushRef / skipNextPushRef 是模块级守卫标志（名字沿用历史），
 * 分别负责「允许自动推送」与「拉取后抑制一次回推」。
 * ======================================================================= */

interface SharedSyncState {
  user: User | null
  phase: SyncPhase
  message: string
  lastSyncedAt: string | null
  conflictOpen: boolean
  authBusy: boolean
}

let sharedState: SharedSyncState = {
  user: null,
  phase: 'idle',
  message: '',
  lastSyncedAt: null,
  conflictOpen: false,
  authBusy: false,
}
const sharedListeners = new Set<() => void>()
/** 每次都换新对象引用 —— useSyncExternalStore 靠引用变化判断是否要重渲染 */
const patchState = (p: Partial<SharedSyncState>) => {
  sharedState = { ...sharedState, ...p }
  for (const l of [...sharedListeners]) l()
}
const subscribeShared = (cb: () => void) => {
  sharedListeners.add(cb)
  return () => { sharedListeners.delete(cb) }
}
const getSharedSnapshot = () => sharedState
const setConflictOpen = (open: boolean) => patchState({ conflictOpen: open })

/* ---- 模块级单例运行时状态 ---- */
/* 注意：这两个是普通模块级变量，不是 React ref —— 没有 .current */
let currentSession: Session | null = null
let handledUserId: string | null = null
let canAutoPushRef = false
let skipNextPushRef = false
let pendingCloudRef: Partial<SyncPayload> = {}
let authSubscribed = false
/** 最新一份本地数据与写入器：由挂载中的 hook 注册给模块级推送逻辑使用 */
let latestData: PersistedData | null = null
let latestUpdate: ((recipe: (prev: PersistedData) => PersistedData) => void) | null = null

/** 推送：三行 upsert；user_id 取自已登录 session，RLS 会校验归属 */
async function push(snapshot: PersistedData | null): Promise<void> {
  const session = currentSession
  if (!supabase || !session || !snapshot) return
  const uid = session.user.id
  const p = buildPayload(snapshot)
  patchState({ phase: 'pushing' })
  try {
    const { error } = await supabase.from('user_data').upsert([
      { user_id: uid, data_type: 'lingua_profile', json_data: p.profile },
      { user_id: uid, data_type: 'lingua_mistakes', json_data: p.mistakes },
      { user_id: uid, data_type: 'lingua_review_queue', json_data: p.reviewQueue },
    ], { onConflict: 'user_id,data_type' })
    if (error) {
      patchState({ phase: 'error', message: toSyncError(error) })
      return
    }
    patchState({ lastSyncedAt: new Date().toISOString(), phase: 'ready', message: '已同步到云端' })
  } catch (err) {
    patchState({ phase: 'error', message: toSyncError(err) })
  }
}

/** 拉取并覆盖本地三类键；抑制锁避免刚拉下来的数据又被防抖推回去 */
async function pull(cloud: Partial<SyncPayload>): Promise<void> {
  canAutoPushRef = false
  skipNextPushRef = true
  patchState({ phase: 'pulling' })
  latestUpdate?.((prev) => applyCloud(prev, cloud))
  canAutoPushRef = true
  patchState({ phase: 'ready' })
}

async function fetchCloud(): Promise<CloudRow[] | null> {
  if (!supabase) return null
  try {
    const { data: rows, error } = await supabase
      .from('user_data')
      .select('data_type, json_data')
      .in('data_type', [...SYNC_TYPES])
    if (error) {
      patchState({ phase: 'error', message: toSyncError(error) })
      return null
    }
    return (rows ?? []) as CloudRow[]
  } catch (err) {
    patchState({ phase: 'error', message: toSyncError(err) })
    return null
  }
}

/**
 * 登录后的分流规则（避免"推本地"与"拉云端"互相冲掉真实数据）：
 *   云端空           → 上传本地（首次登录）
 *   云端有、本地空   → 直接拉取覆盖本地（新设备）
 *   云端有、本地有   → 弹窗交给用户决定，绝不擅自覆盖
 *
 * 之后本地核心状态每次变化，延迟 3 秒防抖推送；冲突未决 / 未登录 / 拉取中一律不推。
 */
async function handleSignedIn(session: Session): Promise<void> {
  canAutoPushRef = false
  patchState({ phase: 'checking', message: '正在检查云端数据…' })
  const rows = await fetchCloud()
  if (rows === null) return

  const cloud = payloadFromRows(rows)
  if (!hasCloudLearning(rows)) {
    await push(latestData)
    canAutoPushRef = true
    patchState({ message: '首次登录，本机数据已上传到云端' })
    return
  }
  if (!latestData || !hasLocalLearning(latestData)) {
    await pull(cloud)
    patchState({ message: '已从云端恢复学习数据' })
    return
  }
  pendingCloudRef = cloud
  setConflictOpen(true)
  patchState({ phase: 'conflict', message: '两端都有学习数据，请选择保留哪一份' })
}

/** 会话订阅：getSession 负责刷新后恢复，onAuthStateChange 负责本次登录/退出。全应用只做一次。 */
function ensureAuthSubscription(): void {
  if (authSubscribed || !supabase) return
  authSubscribed = true

  void supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return
    currentSession = session
    patchState({ user: session.user })
    if (handledUserId === session.user.id) return
    handledUserId = session.user.id
    void handleSignedIn(session)
  })

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
      currentSession = session
      patchState({ user: session.user })
      if (handledUserId === session.user.id) return
      handledUserId = session.user.id
      void handleSignedIn(session)
    } else if (event === 'SIGNED_OUT') {
      currentSession = null
      handledUserId = null
      canAutoPushRef = false
      patchState({ user: null, phase: 'idle', message: '已退出登录，学习数据仍保存在本机' })
    }
  })
  /* 订阅随应用生命周期存在，不随单个组件卸载而注销 —— 它是全应用单例 */
  void subscription
}

async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) { patchState({ message: '尚未配置 Supabase 环境变量' }); return }
  patchState({ authBusy: true, message: '' })
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) patchState({ message: toSyncError(error) })
  } catch (err) {
    patchState({ message: toSyncError(err) })
  } finally {
    patchState({ authBusy: false })
  }
}

async function signUp(email: string, password: string): Promise<void> {
  if (!supabase) { patchState({ message: '尚未配置 Supabase 环境变量' }); return }
  patchState({ authBusy: true, message: '' })
  try {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { patchState({ message: toSyncError(error) }); return }
    if (!data.session) patchState({ message: '注册成功，请先查收验证邮件完成验证，再回来登录' })
  } catch (err) {
    patchState({ message: toSyncError(err) })
  } finally {
    patchState({ authBusy: false })
  }
}

async function signOut(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) patchState({ message: toSyncError(error) })
}

async function resolveConflict(choice: ConflictChoice): Promise<void> {
  setConflictOpen(false)
  if (choice === 'local') {
    await push(latestData)
    canAutoPushRef = true
    patchState({ message: '已保留本地数据，并覆盖云端' })
  } else {
    await pull(pendingCloudRef)
    patchState({ message: '已使用云端数据覆盖本地' })
  }
}

/** 暂不决定：关闭弹窗但保持不自动推送，避免误覆盖任何一端 */
function deferConflict(): void {
  setConflictOpen(false)
  patchState({ phase: 'idle', message: '已暂缓同步，当前仍使用本地数据；可稍后手动上传' })
}

async function pushNow(): Promise<void> { await push(latestData) }

/**
 * 读取云同步状态。全应用共享同一份会话（见上方「模块级共享 store」说明），
 * 页面级组件（首页横幅 / 设置页账号卡片）多次调用也只会有一份订阅。
 */
export function useSyncData(): UseSyncData {
  const { data, update } = useApp()

  /* 把最新本地数据与写入器交给模块级推送逻辑 */
  useEffect(() => { latestData = data }, [data])
  useEffect(() => { latestUpdate = update }, [update])

  useEffect(() => { ensureAuthSubscription() }, [])

  const state = useSyncExternalStore(subscribeShared, getSharedSnapshot, getSharedSnapshot)

  /** 核心：本地状态变化后 3 秒防抖自动推送 */
  useEffect(() => {
    if (!isSupabaseConfigured || !state.user || !canAutoPushRef) return
    if (skipNextPushRef) {
      skipNextPushRef = false
      return
    }
    const timer = window.setTimeout(() => { void push(latestData) }, 3000)
    return () => window.clearTimeout(timer)
  }, [data, state.user])

  return {
    configured: isSupabaseConfigured,
    user: state.user,
    authBusy: state.authBusy,
    phase: state.phase,
    message: state.message,
    lastSyncedAt: state.lastSyncedAt,
    conflictOpen: state.conflictOpen,
    signIn, signUp, signOut, resolveConflict, deferConflict, pushNow,
  }
}
