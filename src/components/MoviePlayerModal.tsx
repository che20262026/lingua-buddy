/* ================================================================
 * 电影详情 / 播放弹窗 —— 「官方预告合法嵌入 + 正版平台跳转看全片」
 *
 * 关键约束：
 *  1. 不用原生 <dialog>（jsdom 未实现 showModal，冒烟会崩），用 div + role=dialog；
 *  2. embedUrl 为空 → 绝不渲染 iframe，直接海报降级 + 提示（B站/腾讯/爱奇艺
 *     全片页有 Referer 防盗链 / X-Frame-Options，第三方 iframe 必然白屏）；
 *  3. embedUrl 非空 → 先显示【点击加载预告】遮罩，用户点击才挂 iframe；
 *     onError 或 8s 未 onLoad → 自动降级为海报 + 提示；
 *  4. 底部主按钮「去【平台】看全片」→ 正版平台，target=_blank rel=noopener noreferrer；
 *  5. Esc 关闭 / 遮罩轻关闭 / overscroll-behavior 防滚动穿透 / 焦点落主按钮。
 * ================================================================ */

import { useEffect, useId, useRef, useState } from 'react'
import type { MovieEntry } from '../data/expanded/moviesCatalog'
import { hasOfficialTrailer } from '../data/expanded/moviesCatalog'
import { Icon } from './ui'

type PlayerState = 'cover' | 'gate' | 'loading' | 'playing' | 'failed'

export function MoviePlayerModal({ movie, onClose }: { movie: MovieEntry; onClose: () => void }) {
  const titleId = useId()
  const primaryRef = useRef<HTMLAnchorElement>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const canEmbed = hasOfficialTrailer(movie)
  // embedUrl 为空直接进 cover 降级；有可用官方嵌入则先显示点击加载遮罩
  const [state, setState] = useState<PlayerState>(canEmbed ? 'gate' : 'cover')

  const title = `${movie.titleCn} · ${movie.title}`

  useEffect(() => {
    // 打开后焦点落主按钮（正版观看入口），键盘可达
    const id = window.setTimeout(() => primaryRef.current?.focus(), 60)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current) }, [])

  const failToCover = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setState('failed')
  }

  const startEmbed = () => {
    setState('loading')
    // 8 秒内 iframe 未触发 onLoad 视为防盗链 / 跨域拦截 → 降级
    timerRef.current = window.setTimeout(() => {
      setState((s) => (s === 'loading' ? 'failed' : s))
    }, 8000)
  }

  const onIframeLoad = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setState('playing')
  }

  /** 降级态（cover / failed）：海报 + 播放图标 + 版权提示，绝不白屏 */
  const renderCover = (hint: string) => (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800">
      <img src={movie.posterUrl} alt={`${movie.titleCn} 海报`}
        className="absolute inset-0 h-full w-full object-cover object-top opacity-45" />
      <div className="absolute inset-0 bg-ink/35" />
      <button type="button" onClick={() => hint && canEmbed && setState('gate')}
        aria-label={hint ? '重试加载预告' : '海报'}
        className="relative z-[1] flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-brand-600 shadow-float">
        <Icon name="play" size={26} />
      </button>
      <div className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-ink/85 to-transparent px-4 pb-3 pt-10 text-center">
        <p className="text-[12px] font-bold leading-relaxed text-white">
          受版权保护，请点击下方按钮去官方平台观看预告/全片
        </p>
      </div>
    </div>
  )

  return (
    <div className="dlg-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 px-0 backdrop-blur-sm sm:items-center sm:px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        data-testid="movie-player-modal"
        className="dlg-panel flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-float sm:rounded-3xl">

        {/* 顶部：标题 + 关闭 */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-brand-50 px-4 py-3.5">
          <div className="min-w-0">
            <p id={titleId} className="truncate text-[15px] font-black text-ink">{movie.titleCn}</p>
            <p className="en-text truncate text-[11px] text-muted">
              {movie.title} · {movie.year} · 豆瓣 {movie.doubanRating}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭电影详情"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-muted transition hover:bg-slate-200">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* 可滚动内容 */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
          {/* 海报 / 官方预告 iframe 区 */}
          <div data-testid="movie-player-frame" data-player-state={state}>
            {state === 'cover' && renderCover('')}
            {state === 'failed' && renderCover('预告片在当前网络环境无法嵌入播放')}

            {state === 'gate' && (
              <button type="button" onClick={startEmbed}
                className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 px-4 text-center text-white transition active:scale-[0.99]">
                <img src={movie.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top opacity-30" />
                <span className="absolute inset-0 bg-ink/30" />
                <span className="relative z-[1] flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-brand-600 shadow-float">
                  <Icon name="play" size={24} />
                </span>
                <span className="relative z-[1] text-[13px] font-bold">点击加载官方预告片</span>
                <span className="relative z-[1] text-[10px] opacity-80">如无法加载将自动显示海报，不影响去官方平台看全片</span>
              </button>
            )}

            {(state === 'loading' || state === 'playing') && (
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink">
                {state === 'loading' && (
                  <div className="absolute inset-0 z-[1] flex items-center justify-center bg-ink/70 text-[12px] font-bold text-white">
                    预告片加载中…
                  </div>
                )}
                <iframe
                  data-testid="movie-trailer-iframe"
                  src={movie.embedUrl}
                  title={`${movie.titleCn} 官方预告片`}
                  className="h-full w-full"
                  allow="fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  onLoad={onIframeLoad}
                  onError={failToCover}
                />
              </div>
            )}
          </div>

          {/* 中英双语简介 */}
          <div className="rounded-2xl bg-brand-50/50 p-3.5">
            <p className="text-[12px] font-bold leading-relaxed text-ink">{movie.intro.zh}</p>
            <p className="en-text mt-1.5 text-[11px] italic leading-relaxed text-muted">{movie.intro.en}</p>
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            海报为应用内原创占位图；评分与年份为公开信息，简介为应用内概述。电影不属于视频白名单，不进入观后讨论。
          </p>
        </div>

        {/* 底部：正版平台看全片主按钮 */}
        <div className="shrink-0 border-t border-brand-50 bg-white px-4 py-3.5 pb-[calc(14px_+_env(safe-area-inset-bottom))]">
          <a ref={primaryRef} href={movie.watchUrl} target="_blank" rel="noopener noreferrer"
            data-testid="movie-watch-full"
            className="btn-primary flex min-h-[48px] w-full items-center justify-center gap-2 !text-sm">
            去【{movie.watchPlatform}】看全片 <Icon name="right" size={16} />
          </a>
          <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">
            将在新标签页打开正版平台，片源与播放权限由平台提供
          </p>
        </div>
      </div>
    </div>
  )
}
