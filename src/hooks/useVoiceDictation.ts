/**
 * useVoiceDictation —— 对话输入台的语音输入层
 * ------------------------------------------------------------------
 * 双通道，自动降级（这是 Android / 国内网络能用的关键）：
 *   ① 首选浏览器自带 startListening —— 桌面 Chrome 上边说边出字，体验最好；
 *   ② 一旦识别服务不可用（国内 Android 上 Chrome 走 Google 被墙，表现为
 *      network / service-not-allowed / 静默 onend 无结果），
 *      自动切到 MediaRecorder 本地录音 → 自家 Netlify 函数用 DeepSeek ASR 转写。
 *      这条路零新增密钥、用户零配置。
 *
 * 复用与边界：
 *   - 识别层复用 lib/speech.startListening，录音层复用 lib/speech.startRecording；
 *   - 转写走 src/services/transcribeAudio.ts（服务端持密钥）；
 *   - 文字只交给调用方追加进输入框，绝不自动发送；
 *   - epoch 防迟到回调、TTS 互斥、卸载 cancel 释放麦克风，全部保留。
 *
 * 数据边界：不新增 localStorage 键、不碰 XP、不写任何学习记录。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  describeSpeechSupport, startListening, startRecording,
  type ListeningHandle, type RecordingHandle,
} from '../lib/speech'
import { transcribeAudioBlob, type TranscribeFailure } from '../services/transcribeAudio'
import type { FatFishAccent } from '../freetalkTypes'
import type { VoiceNotice } from '../components/VoiceSupportDialog'
import { detectVoiceEnvironment, unsupportedVoiceMessage } from '../lib/mobileVoice'

export interface VoiceDictationOptions {
  /** 识别语言：与朗读口音同源（en-US / en-GB / en-AU） */
  accent: FatFishAccent
  /** 拿到最终文字：调用方负责追加进输入框 */
  onTranscript: (text: string) => void
  /** 开始听写前：掐断正在朗读的 TTS */
  onBeforeListen?: () => void
  /** 听写结束（成功 / 失败 / 取消都算）：调用方可恢复挂起的朗读 */
  onSettled?: () => void
}

export interface VoiceDictationApi {
  /** 是否正在听（浏览器识别） */
  listening: boolean
  /** 是否正在录音（降级通道） */
  recording: boolean
  /** 实时字幕（含浏览器未确认片段） */
  interim: string
  /** 状态 / 错误提示文案 */
  note: string
  /** 当前环境是否有任一语音输入能力 */
  supported: boolean
  /** 不支持 / 权限被拒时必须弹窗说明的文案 */
  notice: VoiceNotice | null
  /** 关闭弹窗 */
  dismissNotice: () => void
  /** 点一次：开始 / 停止并出字 */
  toggle: () => void
  /** 强制取消（切角色 / 清空 / 卸载）：丢弃结果并释放麦克风 */
  cancel: () => void
}

/** 识别服务「不可用、该切录音」的错误码（国内 Android 高频命中前三个）
 *  no-speech：静默 onend 连续多次无结果，说明服务根本连不上，同样切录音 */
const FALLBACK_CODES = ['network', 'service-not-allowed', 'not-allowed', 'audio-capture', 'language-not-supported', 'no-speech']

function failureNote(f: TranscribeFailure): string {
  switch (f.reason) {
    case 'rate-limited': return f.detail || '转写太频繁了，稍等一下再试，也可以直接打字。'
    case 'invalid': return f.detail || '音频没能转写，请重试或直接打字。'
    case 'aborted': return '已停止转写，可以直接输入文字。'
    default: return '转写服务暂时不可用，文字输入完全正常，也可以再试一次。'
  }
}

export function useVoiceDictation(options: VoiceDictationOptions): VoiceDictationApi {
  const { accent, onTranscript, onBeforeListen, onSettled } = options

  const [listening, setListening] = useState(false)
  const [recording, setRecording] = useState(false)
  const [interim, setInterim] = useState('')
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState<VoiceNotice | null>(null)
  const listeningRef = useRef<ListeningHandle | null>(null)
  const recordingRef = useRef<RecordingHandle | null>(null)
  /** 每次开麦领一个 epoch：卸载 / 切角色 / 重开后，旧回调一律作废 */
  const epochRef = useRef(0)
  /** 是否已因识别失败切到录音（防止 onError 与 onEnd 各触发一次降级） */
  const fellBackRef = useRef(false)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const release = useCallback(() => {
    listeningRef.current?.cancel()
    listeningRef.current = null
    recordingRef.current?.cancel()
    recordingRef.current = null
    setListening(false)
    setRecording(false)
    setInterim('')
  }, [])

  const cancel = useCallback(() => {
    epochRef.current += 1
    fellBackRef.current = false
    release()
    setNote('')
  }, [release])

  /**
   * 降级通道：本地录音 → WAV → 服务端 DeepSeek ASR。
   * 手动模式：录音一直开到用户点停止，没有时长硬顶（ASR 超长会在服务端降级）。
   */
  const startFallbackRecording = useCallback(async (epoch: number, reason: string) => {
    if (epoch !== epochRef.current || fellBackRef.current) return
    fellBackRef.current = true
    listeningRef.current = null
    setListening(false)
    setInterim('')
    setNotice(null)
    const direct = reason === 'mobile-direct'
    setNote(direct
      ? '录音中，请读完点击麦克风停止，文字会转进输入框。'
      : '浏览器语音服务连不上，已切到本地录音…录音中，请读完点击麦克风停止。')

    const handle = await startRecording({
      onError: (message) => {
        if (epoch !== epochRef.current) return
        /* 必须先清掉 handle：否则下次点击会误判成「停止上一轮录音」而直接返回 */
        recordingRef.current = null
        setRecording(false)
        setNote(`${message} 也可以直接用文字输入。`)
        /* 权限被拒 / 不支持：不能只写一行小字，必须弹窗说清还能打字 */
        setNotice({
          title: '麦克风没能启动',
          message: unsupportedVoiceMessage(detectVoiceEnvironment()) + ` ${message}`,
          showNewTab: detectVoiceEnvironment().inIframe,
        })
        optionsRef.current.onSettled?.()
      },
      onDone: async (result) => {
        if (epoch !== epochRef.current) return
        recordingRef.current = null
        setRecording(false)
        setNote('录音完成，正在转成文字…')
        const res = await transcribeAudioBlob(result.blob)
        if (epoch !== epochRef.current) return
        if (res.ok) {
          const clean = res.text.trim()
          if (clean) optionsRef.current.onTranscript(clean)
          setNote(`已从录音转成文字：「${clean}」——确认后点发送。`)
        } else {
          setNote(failureNote(res.failure))
        }
        optionsRef.current.onSettled?.()
      },
    })

    if (handle && epoch === epochRef.current) {
      recordingRef.current = handle
      setRecording(true)
      /* reason 仅用于诊断留痕，不回显给用户（用统一友好文案） */
      void reason
    } else {
      setNote('录音未能启动，请检查麦克风权限，或直接用文字输入。')
      setNotice({
        title: '麦克风没能启动',
        message: unsupportedVoiceMessage(detectVoiceEnvironment()) + ' 请检查麦克风权限，或直接用文字输入。',
        showNewTab: detectVoiceEnvironment().inIframe,
      })
      optionsRef.current.onSettled?.()
    }
  }, [])

  const toggle = useCallback(() => {
    /* 录音中：再点一次 = 停止录音并转写 */
    if (recordingRef.current) {
      recordingRef.current?.stop()
      return
    }
    /* 识别中：再点一次 = 停止并保留已听到的文字 */
    if (listeningRef.current) {
      listeningRef.current.stop()
      return
    }

    const env = describeSpeechSupport()
    const mobile = detectVoiceEnvironment()
    optionsRef.current.onBeforeListen?.()
    const epoch = ++epochRef.current
    fellBackRef.current = false
    setNotice(null)

    /* 非安全上下文 / 两条路都没有：直接弹窗，绝不进入「假装在听」状态。
       注意：桌面只有 SpeechRecognition、没有 MediaRecorder 时仍可识别，不能一刀切。 */
    if (!mobile.secureContext || (!mobile.canUseMicrophone && !env.recognition && !env.recording)) {
      epochRef.current += 1
      setListening(false)
      setRecording(false)
      setInterim('')
      const message = unsupportedVoiceMessage(mobile)
      setNote(message)
      setNotice({
        title: '语音暂不可用',
        message,
        showNewTab: mobile.inIframe || !mobile.secureContext,
      })
      optionsRef.current.onSettled?.()
      return
    }

    /* 【移动端关键修复】点击的同步上下文里直接开麦：
       iOS / Android WebView 要求 getUserMedia 与 AudioContext 在用户手势内初始化。
       旧逻辑先启动云端识别，等 onError 再异步开麦 → 手势已丢失 → 表现为「点了没反应」。 */
    if (mobile.preferDirectRecording) {
      setRecording(true)
      setListening(false)
      setInterim('')
      void startFallbackRecording(epoch, 'mobile-direct')
      return
    }

    /* 桌面没有识别器时同样直接走录音，不浪费一次必败的识别启动 */
    if (!env.recognition) {
      setRecording(true)
      setListening(false)
      setInterim('')
      void startFallbackRecording(epoch, 'unsupported')
      return
    }

    setListening(true)
    setInterim('')
    setNote('录音中，请读完点击麦克风停止；中途停顿没关系，不会自动结束。')

    const handle = startListening({
      accent: optionsRef.current.accent,
      /* 手动模式：不传 silenceMs / timeoutMs，静音与时长都不再自动收尾 */
      onInterim: (t) => { if (epoch === epochRef.current) setInterim(t) },
      onStatus: (m) => { if (epoch === epochRef.current) setNote(m) },
      onResult: (t, meta) => {
        if (epoch !== epochRef.current) return
        const clean = t.trim()
        if (clean) optionsRef.current.onTranscript(clean)
        listeningRef.current = null
        setListening(false)
        setInterim('')
        setNote(meta.partial
          ? `已转成文字（含未确认片段）：「${clean}」——发送前请核对。`
          : `已转成文字：「${clean}」——确认后点发送。`)
        optionsRef.current.onSettled?.()
      },
      onError: (code, info) => {
        if (epoch !== epochRef.current) return
        /* 国内 Android 高频命中：Google 服务不可达 → 无缝切录音 */
        if (FALLBACK_CODES.includes(code) && env.recording) {
          void startFallbackRecording(epoch, code)
          return
        }
        listeningRef.current = null
        setListening(false)
        setInterim('')
        setNote(info.message)
        setNotice({
          title: '语音识别没能启动',
          message: `${info.message} ${unsupportedVoiceMessage(detectVoiceEnvironment())}`,
          showNewTab: detectVoiceEnvironment().inIframe,
        })
        optionsRef.current.onSettled?.()
      },
      onEnd: () => {
        if (epoch !== epochRef.current) return
        /* Google 被墙的典型表现：onstart 后静默等待，最终 onend 无任何文字。
           此时必须切录音，否则用户看到「听完了」却一个字都没有。 */
        if (!fellBackRef.current && !interimRef.current && env.recording) {
          void startFallbackRecording(epoch, 'silent-end')
          return
        }
        listeningRef.current = null
        setListening(false)
        setInterim('')
        optionsRef.current.onSettled?.()
      },
    })

    if (handle) {
      listeningRef.current = handle
    } else {
      void startFallbackRecording(epoch, 'no-handle')
    }
  }, [startFallbackRecording])

  /** interim 的 ref 镜像：onEnd 回调里读它判断「静默结束」 */
  const interimRef = useRef('')
  interimRef.current = interim

  /* 卸载 / 口音切换：丢弃在途会话，绝不留「幽灵麦克风」 */
  useEffect(() => () => {
    epochRef.current += 1
    release()
  }, [release])

  useEffect(() => {
    epochRef.current += 1
    fellBackRef.current = false
    release()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent])

  return {
    listening,
    recording,
    interim,
    note,
    supported: envSupportsAny(),
    notice,
    dismissNotice: () => setNotice(null),
    toggle,
    cancel,
  }
}

/** 任一语音输入能力在就显示麦克风（录音兜底也算） */
function envSupportsAny(): boolean {
  const env = describeSpeechSupport()
  return env.recognition || env.recording
}
