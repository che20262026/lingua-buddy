/**
 * Desktop Pet · 悬浮在输入台旁的电子宠物
 * ------------------------------------------------------------------
 * 定位约定（务必保持）：
 *   - .dp-dock 用 absolute 挂在输入台这个 sticky 容器上，位于输入行**上方右侧**，
 *     不进入 input / send 的 flex 流，所以永远不会把打字区挤窄；
 *   - dock 自身 pointer-events:none，只有小鱼按钮 pointer-events:auto，
 *     即便它飘在最后一条消息上方，也不会挡住滚动与文字选择；
 *   - 所有动作挂在 .dp-body 上，由外层 data-state / data-motion 驱动 CSS keyframes；
 *   - 内层 FatFishAvatar 保留原对外契约，但用 .dp-avatar 关掉它自己的动画，
 *     避免出现「身体两套 keyframes 打架」的抖动。
 *
 * 无障碍：小鱼是真正的 button（≥44px 触摸目标、可见焦点圈），
 * 开心短句用 role=status + aria-live 播报；减少动态效果下动画仍会
 * 以 0.01ms 结束，好让 happy 状态能正常退回底层状态。
 */

import type { AnimationEvent } from 'react'
import type { DesktopPetState, FatFishCharacter } from '../freetalkTypes'
import type { DesktopPetApi } from '../hooks/useDesktopPet'
import { FatFishAvatar } from './FatFishAvatar'
import { cn } from '../lib/utils'

export interface DesktopPetProps {
  character: FatFishCharacter
  state: DesktopPetState
  phrase: DesktopPetApi['phrase']
  nonce: DesktopPetApi['nonce']
  onPoke: DesktopPetApi['poke']
  onHappyEnd: DesktopPetApi['finishHappy']
}

export function DesktopPet({
  character, state, phrase, nonce, onPoke, onHappyEnd,
}: DesktopPetProps) {
  /** 三颗爱心一起冒，但只认第一颗的 animationend 来结束 happy，避免重复 dispatch */
  const handleHeartEnd = (e: AnimationEvent<HTMLSpanElement>) => {
    if (e.animationName !== 'dp-heart-float') return
    if ((e.target as HTMLElement).classList.contains('dp-heart-1')) onHappyEnd()
  }

  return (
    <div className="dp-dock" data-testid="desktop-pet-dock">
      <button
        type="button"
        data-testid="desktop-pet"
        data-state={state}
        data-motion={character.motion}
        aria-label={`摸摸${character.name}，让它开心一下`}
        onClick={onPoke}
        className={cn('dp-pet', `dp-state-${state}`, `ff-motion-${character.motion}`)}
      >
        <span className="dp-body">
          <FatFishAvatar
            id={character.id}
            size={78}
            speaking={state === 'speaking'}
            className="dp-avatar"
          />

          {/* 说话时的小嘴巴：纯 CSS 缩放，不用 JS 改 style */}
          <span className="dp-mouth" aria-hidden="true" />

          {/* 思考中的头顶问号 + 旋转虚线圈 */}
          {state === 'thinking' && (
            <>
              <span className="dp-question" aria-hidden="true">?</span>
              {/* 吐泡泡：三颗错峰上浮；工作大肥鱼换成疲惫的 ☕ + 🥱 */}
              {character.id === 'onee' ? (
                <>
                  <span className="ff-think-bubble ff-work-coffee" aria-hidden="true"
                    style={{ left: '58%', width: 18, height: 18, fontSize: 13 }}>☕</span>
                  <span className="ff-think-bubble ff-work-coffee" aria-hidden="true"
                    style={{ left: '26%', width: 16, height: 16, fontSize: 14, animationDelay: '480ms' }}>🥱</span>
                </>
              ) : (
                [0, 1, 2].map((k) => (
                  <span key={k} className="ff-think-bubble" aria-hidden="true"
                    style={{
                      left: `${22 + k * 18}%`,
                      width: 6 + k * 2,
                      height: 6 + k * 2,
                      animationDelay: `${k * 380}ms`,
                      ['--ff-bubble-drift' as string]: `${6 + k * 6}px`,
                    }} />
                ))
              )}
            </>
          )}

          {/* happy：蹦一下 + 冒爱心 */}
          {state === 'happy' && (
            <>
              <span className="dp-heart dp-heart-1" aria-hidden="true" onAnimationEnd={handleHeartEnd}>♥</span>
              <span className="dp-heart dp-heart-2" aria-hidden="true">♥</span>
              <span className="dp-heart dp-heart-3" aria-hidden="true">♥</span>
            </>
          )}

          {phrase && (
            <span key={nonce} className="dp-say" role="status" aria-live="polite">
              {phrase}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}
