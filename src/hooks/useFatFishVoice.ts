/**
 * useFatFishVoice —— 大肥鱼自由对话的朗读层
 * ------------------------------------------------------------------
 * 职责：
 *   1. **音色严格匹配口音**：en-US / en-GB / en-AU 三档，
 *      优先挑 lang 完全一致的英语音色；设备没有对应口音时如实告知，
 *      绝不拿「听起来差不多」的音色糊弄用户。
 *   2. 用角色的语速 / 音高朗读（精灵快而高、御姐慢而低）。
 *   3. 管理「正在朗读哪一条」，供 UI 触发专属 CSS 动作动画。
 *
 * 为什么不用 useSpeech().speak()？
 *   useSpeech 走的是**全局音色偏好**（用户设置里选的那一把），
 *   而本模块的口音是「随角色切换」的第二维度，与全局偏好正交。
 *   这里复用 useSpeech 提供的**真实音色列表**（含 getVoices / voiceschanged
 *   的加载逻辑），但自己驱动 lib/speech 的 speakWithVoice，
 *   因为只有它支持显式传入 lang 标签 —— 这才是「严格匹配国家」的关键。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSpeech } from './useSpeech'
import { speakWithVoice, stopSpeaking, type SpeakSession } from '../lib/speech'
import { accentOf } from '../voiceTypes'
import type { FatFishAccent } from '../freetalkTypes'

export interface FatFishVoiceOptions {
  /** 口音（同时作为朗读 lang 标签） */
  accent: FatFishAccent
  /** 语速 */
  rate: number
  /** 音高 */
  pitch: number
}

export interface FatFishVoiceResolution {
  /** 实际使用的 voiceURI（可能为空 = 交给浏览器挑默认） */
  voiceURI: string
  /** 当前设备是否存在该口音的音色 */
  available: boolean
  /** 是否精确命中该口音 */
  exact: boolean
  /** 朗读时使用的 lang 标签 */
  lang: FatFishAccent
}

export function useFatFishVoice(options: FatFishVoiceOptions) {
  const speech = useSpeech()
  const [speakingKey, setSpeakingKey] = useState<string | null>(null)
  const sessionRef = useRef<SpeakSession | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  /**
   * 口音 → 音色的严格映射。
   * accentOf() 是 voiceTypes 里既有的推导函数（en-US / en-GB / en-AU），
   * 这里直接复用，不另写一套 lang 解析。
   */
  const resolved = useMemo<FatFishVoiceResolution>(() => {
    const list = speech.englishVoices
    const exactVoice = list.find((v) => accentOf(v.lang) === options.accent)
    const fallbackVoice = exactVoice ?? list[0]
    return {
      voiceURI: fallbackVoice?.voiceURI ?? '',
      available: Boolean(exactVoice),
      exact: Boolean(exactVoice),
      lang: options.accent,
    }
  }, [speech.englishVoices, options.accent])

  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved

  /** 朗读一条内容；key 用于标记「哪一条正在读」 */
  const speak = useCallback((key: string, text: string) => {
    const clean = (text || '').trim()
    if (!clean) return
    sessionRef.current?.cancel()
    const o = optionsRef.current
    setSpeakingKey(key)
    const session = speakWithVoice(clean, {
      voiceURI: resolvedRef.current.voiceURI || undefined,
      /* 显式 lang：即使回落到别的音色，浏览器也会按该口音发音 */
      lang: o.accent,
      rate: o.rate,
      pitch: o.pitch,
      onEnd: () => {
        sessionRef.current = null
        setSpeakingKey(null)
      },
      onBlocked: () => {
        /* 被浏览器拦截 / 设备无音色：不弹窗，UI 另有轻提示 */
        setSpeakingKey(null)
      },
      onError: () => { /* 静默失败：重播按钮仍然可用 */ },
      onDemo: () => { /* 演示模式：无音色设备上的模拟朗读 */ },
    })
    sessionRef.current = session
  }, [])

  const stop = useCallback(() => {
    sessionRef.current?.cancel()
    sessionRef.current = null
    stopSpeaking()
    setSpeakingKey(null)
  }, [])

  /** 离开页面：立刻掐断朗读，绝不留下「幽灵声音」 */
  useEffect(() => () => {
    sessionRef.current?.cancel()
    sessionRef.current = null
    stopSpeaking()
  }, [])

  return {
    /** 浏览器是否支持语音合成 */
    supported: speech.supported,
    speak,
    stop,
    /** 正在朗读的那一条的 key（气泡 id） */
    speakingKey,
    /** 音色解析结果：UI 用它提示「当前设备没有该口音」 */
    resolved,
  }
}
