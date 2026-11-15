/**
 * useSpeech —— 对话语音层的统一封装
 *
 * 职责：
 *   1. 从浏览器真实加载音色（getVoices + voiceschanged），处理「加载中 / 0 个 / 1 个」三种状态；
 *   2. 按句朗读 AI 回复，维护「正在朗读哪条、哪一句」的状态；
 *   3. 与语音输入互斥（麦克风占用时拒绝发声）；
 *   4. 随时可打断（输入、切页、开关切换都会立即 cancel）。
 *
 * 绝不硬编码音色名称：音色列表只来自 speechSynthesis.getVoices()。
 *
 * ────────────────────────────────────────────────────────────────
 * [TTS 自动朗读 Bug 修复 · 2026-11-13]
 * 根因：自动朗读发生在音色列表就绪之前，speakWithVoice() 会在
 *       getVoices() 为空时立刻静默进入「演示模式」，不发声；
 *       而手动「重播」时音色早已加载完，所以能响。
 * 本层改动（关键行均标注 [FIX-n]）：
 *   - [FIX-1] 引擎层 waitForVoices() 已在 speakWithVoice 内等待音色，本层不再自己判空；
 *   - [FIX-2] onBlocked 回调保存「被拦截的那条」，用 blocked 状态给 UI 轻量提示；
 *   - [FIX-3] resume() 在用户点击手势内重放，可绕过 Chrome autoplay 的 NotAllowedError；
 *   - [FIX-4] 麦克风占用不再静默 return，且 micBusy 会被正确复位；
 *   - [FIX-5] 暴露 forceRelease()，供 send() 在发送瞬间强制清掉假死的互斥锁。
 * ────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import {
  canSpeakNow, forceReleaseMic, isMicActive, speakWithVoice, speechSupported, stopSpeaking,
  type SpeakBlockReason, type SpeakSession,
} from '../lib/speech'
import {
  accentOf, isEnglishVoice, toVoiceInfo,
  type VoiceInfo,
} from '../voiceTypes'
import { voiceForCharacter } from '../services/voicePreferences'

/** 音色列表的加载状态 */
export type VoiceLoadState = 'loading' | 'ready' | 'empty' | 'unsupported'

/** 一次朗读的元信息 */
export interface SpeakMeta {
  /** 气泡 ID：用于高亮正在朗读的那条 */
  id: string
  /** 说话角色名：显示在「朗读中」状态条上 */
  speaker: string
  /** 角色绑定音色优先；缺省用全局 */
  sceneId?: string
  characterId?: string
  /** 强制使用指定音色（试听用） */
  voiceURI?: string
  rate?: number
}

/** [FIX-2] 播放被拦截时暴露给 UI 的最小信息（不弹窗，只给一条轻提示） */
export interface SpeakBlocked {
  reason: SpeakBlockReason
}

export interface UseSpeechResult {
  /** 浏览器是否支持 speechSynthesis */
  supported: boolean
  /** 音色加载状态 */
  state: VoiceLoadState
  /** 当前设备真实可用的全部音色 */
  voices: VoiceInfo[]
  /** 其中英语音色 */
  englishVoices: VoiceInfo[]
  /** 有没有英语音色可用 */
  hasEnglish: boolean
  /** 正在朗读的气泡 ID */
  speakingId: string | null
  /** 正在朗读的角色名 */
  speakingSpeaker: string
  /** 当前朗读到第几句（从 0 开始） */
  sentenceIndex: number
  /** 本条回复共几句 */
  sentenceTotal: number
  /** 是否处于演示模式（设备不提供音色，模拟朗读动画） */
  demoMode: boolean
  /** 麦克风是否被占用（识别 / 录音中） */
  micBusy: boolean
  /** [FIX-2] 播放被浏览器拦截 / 麦克风假死时的轻量提示状态 */
  blocked: SpeakBlocked | null
  /** 朗读一段文本 */
  speak: (text: string, meta: SpeakMeta) => void
  /** 试听（不消耗轮次、不发 XP） */
  audition: (text: string, voiceURI?: string, rate?: number) => void
  /** 立刻停止 */
  stop: () => void
  /** [FIX-3] 用户点「点击播放」时，在手势内重放上一次被拦截的朗读 */
  resume: () => void
  /** [FIX-2] 用户主动忽略这条提示 */
  dismissBlocked: () => void
  /** [FIX-5] 强制释放麦克风互斥锁（发送消息瞬间调用，杜绝假死拦截朗读） */
  forceRelease: () => void
  /** 重新拉取音色（voiceschanged 之外的手动刷新） */
  refresh: () => void
}

export function useSpeech(): UseSpeechResult {
  const app = useApp()
  const prefs = app.data.voicePreferences
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [state, setState] = useState<VoiceLoadState>('loading')
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [speakingSpeaker, setSpeakingSpeaker] = useState('')
  const [sentenceIndex, setSentenceIndex] = useState(0)
  const [sentenceTotal, setSentenceTotal] = useState(0)
  const [demoMode, setDemoMode] = useState(false)
  const [micBusy, setMicBusy] = useState(false)
  /** [FIX-2] 拦截提示 */
  const [blocked, setBlocked] = useState<SpeakBlocked | null>(null)
  const sessionRef = useRef<SpeakSession | null>(null)
  /** [FIX-3] 最近一次朗读请求，供 resume() 在用户手势内重放 */
  const lastRequestRef = useRef<{ text: string; meta: SpeakMeta } | null>(null)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  const supported = useMemo(() => speechSupported(), [])

  /** 音色就绪后清掉「麦克风忙」的陈旧状态 */
  const clearMicBusy = useCallback(() => setMicBusy(false), [])

  const pull = useCallback(() => {
    if (!speechSupported()) {
      setState('unsupported')
      setVoices([])
      return
    }
    let list: VoiceInfo[] = []
    try {
      const raw = window.speechSynthesis.getVoices()
      list = (raw || []).map(toVoiceInfo)
    } catch {
      list = []
    }
    setVoices(list)
    // 音色为空可能是「还没加载完」，10 秒后仍是空才判定为设备不支持
    setState(list.length ? 'ready' : 'loading')
  }, [])

  useEffect(() => {
    if (!supported) {
      setState('unsupported')
      return
    }
    pull()
    const synth = window.speechSynthesis
    const onChanged = () => pull()
    try { synth.addEventListener?.('voiceschanged', onChanged) } catch { /* 忽略 */ }
    // Chrome 首次加载音色是异步的：10 秒后仍是空就给出明确降级说明
    const timer = window.setTimeout(() => {
      setState((prev) => (prev === 'loading' ? 'empty' : prev))
    }, 10000)
    return () => {
      try { window.clearTimeout(timer) } catch { /* 忽略 */ }
      try { synth.removeEventListener?.('voiceschanged', onChanged) } catch { /* 忽略 */ }
    }
  }, [supported, pull])

  // 页面切换 / 组件卸载：立刻掐断朗读，绝不留下「幽灵声音」
  useEffect(() => () => {
    sessionRef.current?.cancel()
    sessionRef.current = null
    stopSpeaking()
  }, [])

  const stop = useCallback(() => {
    sessionRef.current?.cancel()
    sessionRef.current = null
    stopSpeaking()
    setSpeakingId(null)
    setSpeakingSpeaker('')
    setSentenceIndex(0)
    setSentenceTotal(0)
    setDemoMode(false)
    setMicBusy(false)          // [FIX-4] 复位
    setBlocked(null)           // [FIX-2] 用户主动停止，不再提示
  }, [])

  /** [FIX-1] 真正的朗读入口：引擎层会等待音色，不再因 getVoices() 为空而静默降级 */
  const speak = useCallback((text: string, meta: SpeakMeta) => {
    const clean = (text || '').trim()
    if (!clean) return
    // [FIX-3] 先记住请求，无论成功或被拦截都能由 resume() 重放
    lastRequestRef.current = { text: clean, meta }

    // 互斥：麦克风占用中不发声。
    // [FIX-4] 不再静默 return —— 明确给出提示，让用户可以一键清锁重放
    if (isMicActive() || !canSpeakNow()) {
      setMicBusy(true)
      setBlocked({ reason: 'mic-busy' })
      return
    }
    setMicBusy(false)
    setBlocked(null)

    sessionRef.current?.cancel()
    setSpeakingId(meta.id)
    setSpeakingSpeaker(meta.speaker)
    setSentenceIndex(0)
    setSentenceTotal(0)
    setDemoMode(false)

    const p = prefsRef.current
    const bound = meta.sceneId && meta.characterId
      ? voiceForCharacter(p, meta.sceneId, meta.characterId)
      : { voiceURI: p.global.voiceURI, rate: p.global.rate }
    const voiceURI = meta.voiceURI ?? bound.voiceURI
    const rate = meta.rate ?? bound.rate

    const session = speakWithVoice(clean, {
      voiceURI,
      rate,
      pitch: p.global.pitch,
      lang: bound.voiceURI ? undefined : (accentOf(p.global.accent) === 'system' ? undefined : p.global.accent),
      onSentence: (i, total) => {
        setSentenceIndex(i)
        setSentenceTotal(total)
      },
      /** [FIX-1] 引擎层在等待超时、确实无音色时才回调演示模式 */
      onDemo: () => setDemoMode(true),
      onEnd: () => {
        sessionRef.current = null
        setSpeakingId(null)
        setSpeakingSpeaker('')
        setSentenceIndex(0)
        setSentenceTotal(0)
        setDemoMode(false)
      },
      /** [FIX-2] 播放被拦截：不抛错、不弹窗，只留一条可点击的轻提示 */
      onBlocked: (reason) => {
        // 演示模式（设备无音色）已有 VoicePanel 的降级说明，不重复打扰
        if (reason === 'empty-voices' || reason === 'unsupported') return
        setBlocked({ reason })
      },
      onError: () => {
        // 静默失败：不弹窗，重播按钮仍可用；拦截类由 onBlocked 接管
      },
    })
    sessionRef.current = session
  }, [])

  /**
   * [FIX-3] 用户点「点击播放」时调用：处在真实用户手势栈内，
   * Chrome 的 autoplay 策略会放行 speechSynthesis.speak()。
   * 同时强制清掉可能假死的麦克风锁（此刻用户已经在打字/点击，麦克风必然空闲）。
   */
  const resume = useCallback(() => {
    const last = lastRequestRef.current
    if (!last) return
    forceReleaseMic()
    setMicBusy(false)
    setBlocked(null)
    speak(last.text, last.meta)
  }, [speak])

  /** [FIX-5] 发送消息瞬间强制解锁，杜绝 SpeechRecognition 的 onend 漏触发导致 TTS 永久静默 */
  const forceRelease = useCallback(() => {
    forceReleaseMic()
    setMicBusy(false)
  }, [])

  const dismissBlocked = useCallback(() => setBlocked(null), [])

  const audition = useCallback((text: string, voiceURI?: string, rate?: number) => {
    const p = prefsRef.current
    const session = speakWithVoice(text, {
      voiceURI: voiceURI ?? p.global.voiceURI,
      rate: rate ?? p.global.rate,
      pitch: p.global.pitch,
      onDemo: () => setDemoMode(true),
      onEnd: () => {
        sessionRef.current = null
        setSpeakingId(null)
        setSpeakingSpeaker('')
        setDemoMode(false)
      },
      onError: () => { /* 静默失败 */ },
    })
    sessionRef.current = session
  }, [])

  const englishVoices = useMemo(() => voices.filter(isEnglishVoice), [voices])

  return {
    supported,
    state,
    voices,
    englishVoices,
    hasEnglish: englishVoices.length > 0,
    speakingId,
    speakingSpeaker,
    sentenceIndex,
    sentenceTotal,
    demoMode,
    micBusy,
    blocked,
    speak,
    audition,
    stop,
    resume,
    dismissBlocked,
    forceRelease,
    refresh: pull,
  }
}
