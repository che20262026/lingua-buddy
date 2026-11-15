import { useCallback, useEffect, useRef, useState } from 'react'
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

/**
 * 登录后的分流规则（避免"推本地"与"拉云端"互相冲掉真实数据）：
 *   云端空           → 上传本地（首次登录）
 *   云端有、本地空   → 直接拉取覆盖本地（新设备）
 *   云端有、本地有   → 弹窗交给用户决定，绝不擅自覆盖
 *
 * 之后本地核心状态每次变化，延迟 3 秒防抖推送；冲突未决 / 未登录 / 拉取中一律不推。
 */
export function useSyncData(): UseSyncData {
  const { data, update } = useApp()
  const [user, setUser] = useState<User | null>(null)
  const [phase, setPhase] = useState<SyncPhase>('idle')
  const [message, setMessage] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)

  const dataRef = useRef(data)
  const sessionRef = useRef<Session | null>(null)
  const handledUserRef = useRef<string | null>(null)
  const canAutoPushRef = useRef(false)
  const skipNextPushRef = useRef(false)
  const pendingCloudRef = useRef<Partial<SyncPayload>>({})

  useEffect(() => { dataRef.current = data }, [data])

  /** 推送：三行 upsert；user_id 取自已登录 session，RLS 会校验归属 */
  const push = useCallback(async (snapshot: PersistedData) => {
    const session = sessionRef.current
    if (!supabase || !session) return
    const uid = session.user.id
    const p = buildPayload(snapshot)
    setPhase('pushing')
    try {
      const { error } = await supabase.from('user_data').upsert([
        { user_id: uid, data_type: 'lingua_profile', json_data: p.profile },
        { user_id: uid, data_type: 'lingua_mistakes', json_data: p.mistakes },
        { user_id: uid, data_type: 'lingua_review_queue', json_data: p.reviewQueue },
      ], { onConflict: 'user_id,data_type' })
      if (error) {
        setPhase('error')
        setMessage(toSyncError(error))
        return
      }
      setLastSyncedAt(new Date().toISOString())
      setPhase('ready')
      setMessage('已同步到云端')
    } catch (err) {
      setPhase('error')
      setMessage(toSyncError(err))
    }
  }, [])

  /** 拉取并覆盖本地三类键；抑制锁避免刚拉下来的数据又被防抖推回去 */
  const pull = useCallback(async (cloud: Partial<SyncPayload>) => {
    canAutoPushRef.current = false
    skipNextPushRef.current = true
    setPhase('pulling')
    update((prev) => applyCloud(prev, cloud))
    canAutoPushRef.current = true
    setPhase('ready')
  }, [update])

  const fetchCloud = useCallback(async (): Promise<CloudRow[] | null> => {
    if (!supabase) return null
    try {
      const { data: rows, error } = await supabase
        .from('user_data')
        .select('data_type, json_data')
        .in('data_type', [...SYNC_TYPES])
      if (error) {
        setPhase('error')
        setMessage(toSyncError(error))
        return null
      }
      return (rows ?? []) as CloudRow[]
    } catch (err) {
      setPhase('error')
      setMessage(toSyncError(err))
      return null
    }
  }, [])

  const handleSignedIn = useCallback(async (session: Session) => {
    canAutoPushRef.current = false
    setPhase('checking')
    setMessage('正在检查云端数据…')
    const rows = await fetchCloud()
    if (rows === null) return

    const cloud = payloadFromRows(rows)
    if (!hasCloudLearning(rows)) {
      await push(dataRef.current)
      canAutoPushRef.current = true
      setMessage('首次登录，本机数据已上传到云端')
      return
    }
    if (!hasLocalLearning(dataRef.current)) {
      await pull(cloud)
      setMessage('已从云端恢复学习数据')
      return
    }
    pendingCloudRef.current = cloud
    setConflictOpen(true)
    setPhase('conflict')
    setMessage('两端都有学习数据，请选择保留哪一份')
  }, [fetchCloud, push, pull])

  /** 会话订阅：getSession 负责刷新后恢复，onAuthStateChange 负责本次登录/退出 */
  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return
      sessionRef.current = session
      setUser(session.user)
      if (handledUserRef.current === session.user.id) return
      handledUserRef.current = session.user.id
      void handleSignedIn(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        sessionRef.current = session
        setUser(session.user)
        if (handledUserRef.current === session.user.id) return
        handledUserRef.current = session.user.id
        void handleSignedIn(session)
      } else if (event === 'SIGNED_OUT') {
        sessionRef.current = null
        handledUserRef.current = null
        canAutoPushRef.current = false
        setUser(null)
        setPhase('idle')
        setMessage('已退出登录，学习数据仍保存在本机')
      }
    })

    return () => { cancelled = true; subscription.unsubscribe() }
  }, [handleSignedIn])

  /** 核心：本地状态变化后 3 秒防抖自动推送 */
  useEffect(() => {
    if (!isSupabaseConfigured || !user || !canAutoPushRef.current) return
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false
      return
    }
    const timer = window.setTimeout(() => { void push(dataRef.current) }, 3000)
    return () => window.clearTimeout(timer)
  }, [data, user, push])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) { setMessage('尚未配置 Supabase 环境变量'); return }
    setAuthBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(toSyncError(error))
    } catch (err) {
      setMessage(toSyncError(err))
    } finally {
      setAuthBusy(false)
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) { setMessage('尚未配置 Supabase 环境变量'); return }
    setAuthBusy(true)
    setMessage('')
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setMessage(toSyncError(error)); return }
      if (!data.session) setMessage('注册成功，请先查收验证邮件完成验证，再回来登录')
    } catch (err) {
      setMessage(toSyncError(err))
    } finally {
      setAuthBusy(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(toSyncError(error))
  }, [])

  const resolveConflict = useCallback(async (choice: ConflictChoice) => {
    setConflictOpen(false)
    if (choice === 'local') {
      await push(dataRef.current)
      canAutoPushRef.current = true
      setMessage('已保留本地数据，并覆盖云端')
    } else {
      await pull(pendingCloudRef.current)
      setMessage('已使用云端数据覆盖本地')
    }
  }, [push, pull])

  /** 暂不决定：关闭弹窗但保持不自动推送，避免误覆盖任何一端 */
  const deferConflict = useCallback(() => {
    setConflictOpen(false)
    setPhase('idle')
    setMessage('已暂缓同步，当前仍使用本地数据；可稍后手动上传')
  }, [])

  const pushNow = useCallback(async () => { await push(dataRef.current) }, [push])

  return {
    configured: isSupabaseConfigured,
    user, authBusy, phase, message, lastSyncedAt, conflictOpen,
    signIn, signUp, signOut, resolveConflict, deferConflict, pushNow,
  }
}
