/**
 * useVoiceDictation —— 对话输入台的语音听写层
 * ------------------------------------------------------------------
 * 职责边界（刻意做薄）：
 *   1. 复用 lib/speech 的 startListening（超时 / 静音收尾 / 自动重试 /
 *      权限降级 / TTS 互斥全部在那里，这里一行都不重写）；
 *   2. 只处理「一次听写会话」的 UI 状态：listening / interim / note；
 *   3. 把识别出的文字**交给调用方追加进输入框**，绝不自动发送——
 *      用户必须能核对 / 修改后再发，这是对话场景的红线。
 *
 * 为什么单独抽 hook 而不是塞进页面：
 *   - 主对话页已有一份内联听写逻辑；抽出来后两个对话页可以共用同一套状态机，
 *     避免「两处各写一遍、修一处漏一处」。
 *   - 冒烟可以单独 loadModule 测状态机，不必依赖真实麦克风。
 *
 * 数据边界：完全在内存里，不新增 localStorage 键、不碰 XP、不写任何学习记录。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { describeSpeechSupport, startListening, type ListeningHandle } from '../lib/speech'
import type { FatFishAccent } from '../freetalkTypes'

export interface VoiceDictationOptions {
  /** 识别语言：与朗读口音同源（en-US / en-GB / en-AU） */
  accent: FatFishAccent
  /** 拿到最终文字：调用方负责追加进输入框 */
  onTranscript: (text: string) => void
  /** 开始听写前：掐断正在朗读的 TTS（lib/speech 也会互斥，这里额外清 UI 动画态） */
  onBeforeListen?: () => void
  /** 听写结束（成功 / 失败 / 取消都算）：调用方可恢复挂起的朗读 */
  onSettled?: () => void
}

export interface VoiceDictationApi {
  /** 是否正在听 */
  listening: boolean
  /** 实时字幕（含浏览器未确认片段，UI 应标注「请核对」） */
  interim: string
  /** 状态 / 错误提示文案 */
  note: string
  /** 当前环境是否有浏览器自带听写 */
  supported: boolean
  /** 点一次：开始听写或停止并出字 */
  toggle: () => void
  /** 强制取消（切角色 / 清空 / 卸载）：丢弃结果并释放麦克风 */
  cancel: () => void
}

export function useVoiceDictation(options: VoiceDictationOptions): VoiceDictationApi {
  const { accent, onTranscript, onBeforeListen, onSettled } = options

  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [note, setNote] = useState('')
  const handleRef = useRef<ListeningHandle | null>(null)
  /** 每次开麦领一个 epoch：卸载 / 切角色 / 重开后，旧识别器的迟到回调一律作废 */
  const epochRef = useRef(0)
  /** 回调取最新 props，避免闭包快照锁死旧口音 / 旧角色 */
  const optionsRef = useRef(options)
  optionsRef.current = options

  const release = useCallback(() => {
    handleRef.current?.cancel()
    handleRef.current = null
    setListening(false)
    setInterim('')
  }, [])

  const cancel = useCallback(() => {
    epochRef.current += 1
    release()
    setNote('')
  }, [release])

  const toggle = useCallback(() => {
    /* 正在听：再点一次 = 停止并保留已听到的文字 */
    if (handleRef.current) {
      handleRef.current.stop()
      return
    }

    const env = describeSpeechSupport()
    if (!env.recognition) {
      /* 没有自带听写：如实告知，文本输入完全不受影响 */
      setNote(env.hint || '当前浏览器没有语音识别服务，请用文字输入继续。')
      return
    }

    optionsRef.current.onBeforeListen?.()
    const epoch = ++epochRef.current
    setListening(true)
    setInterim('')
    setNote(env.inIframe
      ? '正在听… 预览面板可能屏蔽麦克风，说完停顿一下即可出字。'
      : '正在听… 说完停顿一下自动出字，再点一次麦克风也能停止。')

    const handle = startListening({
      accent: optionsRef.current.accent,
      onInterim: (t) => { if (epoch === epochRef.current) setInterim(t) },
      onStatus: (m) => { if (epoch === epochRef.current) setNote(m) },
      onResult: (t, meta) => {
        if (epoch !== epochRef.current) return
        const clean = t.trim()
        if (clean) optionsRef.current.onTranscript(clean)
        handleRef.current = null
        setListening(false)
        setInterim('')
        setNote(meta.partial
          ? `已转成文字（含未确认片段）：「${clean}」——发送前请核对。`
          : `已转成文字：「${clean}」——确认后点发送。`)
        optionsRef.current.onSettled?.()
      },
      onError: (_code, info) => {
        if (epoch !== epochRef.current) return
        handleRef.current = null
        setListening(false)
        setInterim('')
        setNote(info.message)
        optionsRef.current.onSettled?.()
      },
      onEnd: () => {
        if (epoch !== epochRef.current) return
        handleRef.current = null
        setListening(false)
        setInterim('')
        optionsRef.current.onSettled?.()
      },
    })

    if (handle) {
      handleRef.current = handle
    } else {
      setListening(false)
      setNote('语音识别未能启动，请用文字输入继续。')
    }
  }, [])

  /* 卸载 / 口音切换：丢弃在途会话，绝不留「幽灵麦克风」 */
  useEffect(() => () => {
    epochRef.current += 1
    handleRef.current?.cancel()
    handleRef.current = null
  }, [])

  useEffect(() => {
    /* accent 变化即作废上一口音的听写，避免用英音识别器收澳音的话 */
    epochRef.current += 1
    release()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent])

  return {
    listening,
    interim,
    note,
    supported: describeSpeechSupport().recognition,
    toggle,
    cancel,
  }
}
