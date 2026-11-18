/**
 * Desktop Pet 状态机 · 大肥鱼电子宠物
 * ------------------------------------------------------------------
 * React 只做一件事：决定当前是 idle / thinking / speaking / happy 四态中的哪一态。
 * 所有“活着”的感觉——呼吸、漂浮、问号、爱心、嘴巴张合——全部交给 CSS
 * @keyframes。这里刻意不出现 setInterval / requestAnimationFrame：
 * 动画不由 JS 每帧改样式驱动，手机端不会因为状态机额外发热。
 *
 * 状态优先级（从高到低）：
 *   happy（用户刚摸过）> thinking（等 AI）> speaking（TTS 朗读）> idle
 * happy 是一次性态：CSS 爱心动画结束后由 onAnimationEnd 回到刚才的底层状态，
 * 因此它在等待 AI 时被摸一下，蹦完还会继续转圈圈。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DesktopPetState, FatFishCharacter } from '../freetalkTypes'

export interface DesktopPetInput {
  /** 正在等 AI（chat 或 summary） */
  thinking: boolean
  /** 正在 TTS 朗读 */
  speaking: boolean
}

export interface DesktopPetApi {
  state: DesktopPetState
  /** happy 时冒出的短句；其它状态为 null */
  phrase: string | null
  /** 同一句话连续触发时用来重放 CSS 动画的序号 */
  nonce: number
  poke: () => void
  finishHappy: () => void
}

/** 通用可爱短句；与人设语气词混在同一个池子里随机取，不串味 */
const EXTRA_PHRASES = ['Hehe~', 'Yay!', 'Hmm~', 'Nice!'] as const

/**
 * 兜底归位时间（ms），略长于最慢那颗爱心的 180ms 延迟 + 900ms 动画。
 * 注意：这不是动画驱动器——位置/缩放/透明度全在 CSS keyframes 里；
 * 它只在浏览器不发 animationend（内嵌 WebView、测试环境）时把状态还回去。
 */
const HAPPY_FALLBACK_MS = 1150

/** 纯函数：不含 happy 的底层状态，方便冒烟直接验证优先级 */
export function resolveBasePetState(input: DesktopPetInput): DesktopPetState {
  if (input.thinking) return 'thinking'
  if (input.speaking) return 'speaking'
  return 'idle'
}

function pickPhrase(character: FatFishCharacter): string {
  const pool: readonly string[] = [...EXTRA_PHRASES, ...character.toneWords]
  return pool[Math.floor(Math.random() * pool.length)]
}

export function useDesktopPet(character: FatFishCharacter, input: DesktopPetInput): DesktopPetApi {
  const base = resolveBasePetState(input)
  const [happy, setHappy] = useState<{ phrase: string; nonce: number } | null>(null)
  const nonceRef = useRef(0)

  const poke = useCallback(() => {
    setHappy((prev) => {
      if (prev) return prev
      nonceRef.current += 1
      return { phrase: pickPhrase(character), nonce: nonceRef.current }
    })
  }, [character])

  const finishHappy = useCallback(() => setHappy(null), [])

  /* 主路径是爱心的 onAnimationEnd；这里是缺失该事件时的安全网（非动画驱动） */
  useEffect(() => {
    if (!happy) return
    const timer = window.setTimeout(finishHappy, HAPPY_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [happy, finishHappy])

  return useMemo(() => ({
    state: happy ? 'happy' : base,
    phrase: happy?.phrase ?? null,
    nonce: happy?.nonce ?? 0,
    poke,
    finishHappy,
  }), [base, happy, poke, finishHappy])
}
