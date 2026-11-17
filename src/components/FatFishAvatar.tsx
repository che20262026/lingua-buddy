/**
 * 大肥鱼自由对话 · 6 个角色的立体立绘形象
 * ------------------------------------------------------------------
 * 【形象来源】以用户提供的《Q 版大肥鱼角色设定图》（三视图 + 6 格细节）
 * 为底本，按 image-generator-studio 的结构化提示词做工生图，
 * 生成 6 张风格统一的 3D 盲盒手办 / 黏土公仔质感立绘，
 * 存于 public/fatfish/*.webp（640×640，合计约 0.22MB）。
 *
 * 【为什么从 SVG 换成图片】SVG 能做到干净的代码轮廓，但做不出
 * 真实体积光影与材质反光——用户要的是「像网上养鲸鱼娘一样」
 * 的立体逼真质感，这一点只有真正的渲染图能给。
 *
 * 【保留的对外契约】（一行未动，调用方无感）
 *   - props：id / size / speaking / motion / className / style
 *   - data-testid：fatfish-avatar-<id>
 *   - 动画：ff-avatar + ff-motion-xxx + speaking 时 ff-avatar-speaking
 *     六套 keyframes 只动 transform，prefers-reduced-motion 下自动关闭
 *
 * 【路径】用 import.meta.env.BASE_URL 拼接，Vite base:'./' 下构建为
 * 相对路径，兼容子目录部署与本地打开，不走外链 CDN。
 *
 * 【降级】图片加载失败时显示角色 emoji 占位，不白屏、不阻断练习。
 */

import { useState, type CSSProperties } from 'react'
import { cn } from '../lib/utils'
import { FAT_FISH_CHARACTERS, findFatFishCharacter } from '../data/fatFishCharacters'
import type { FatFishId, FatFishMotion } from '../freetalkTypes'

export interface FatFishAvatarProps {
  /** 角色 id */
  id: FatFishId | string
  /** 像素尺寸（正方形） */
  size?: number
  /** 是否正在朗读：为 true 时播放该角色的专属动作 */
  speaking?: boolean
  /** 覆盖角色默认动作 */
  motion?: FatFishMotion
  className?: string
  style?: CSSProperties
}

/** 加载失败时的 emoji 占位（按角色区分，绝不白屏） */
const FALLBACK_EMOJI: Partial<Record<FatFishId, string>> = {
  elf: '🧝', loli: '🍬', onee: '☕', salaryman: '🍚', rocker: '🎸', surfer: '🏄',
}

/** 立绘资源路径：base 相对路径 + 角色 id，全部走本地 public */
export function fatFishImageUrl(id: FatFishId | string): string {
  return `${import.meta.env.BASE_URL}fatfish/${id}.webp`
}

/**
 * 大肥鱼形象组件。
 * 动作类挂在容器上：`.ff-avatar` + `.ff-motion-xxx`，
 * 朗读中再叠 `.ff-avatar-speaking` 才会真正跑起来。
 */
export function FatFishAvatar({
  id, size = 96, speaking = false, motion, className, style,
}: FatFishAvatarProps) {
  const character = findFatFishCharacter(id) ?? FAT_FISH_CHARACTERS[0]
  const resolvedMotion: FatFishMotion = motion ?? character.motion
  const [failed, setFailed] = useState(false)
  const src = fatFishImageUrl(character.id)

  return (
    <div
      data-testid={`fatfish-avatar-${character.id}`}
      data-speaking={speaking ? 'true' : 'false'}
      className={cn(
        'ff-avatar shrink-0',
        `ff-motion-${resolvedMotion}`,
        speaking && 'ff-avatar-speaking',
        className,
      )}
      style={{ width: size, height: size, ...style }}
    >
      {failed ? (
        <div
          className="flex h-full w-full items-center justify-center rounded-full bg-mint-100"
          role="img"
          aria-label={`${character.name} 形象加载失败占位`}
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          {FALLBACK_EMOJI[character.id] ?? '🐋'}
        </div>
      ) : (
        <img
          src={src}
          alt={`${character.name}（${character.title}）`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full select-none object-contain"
        />
      )}
    </div>
  )
}
