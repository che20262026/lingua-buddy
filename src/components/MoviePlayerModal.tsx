/* ================================================================
 * 电影预告片播放弹窗 —— 应用内直接播放 + 加载失败降级
 *
 * 关键约束：
 *  1. 不用原生 <dialog>（jsdom 未实现 showModal，冒烟会崩），用 div + role=dialog；
 *  2. trailerUrl 非空 → 打开即挂载 16:9 iframe，用户可在应用内播放/暂停/全屏；
 *  3. 3 秒内未 onLoad / iframe onError / trailerUrl 为空 → 自动隐藏 iframe，
 *     降级为海报 + 半透明遮罩 + 文案 + 「去官方平台观看预告」外链按钮；
 *  4. 彻底移除全片跳转外链：本板块只提供预告片，不做任何全片跳转；
 *  5. Esc 关闭 / 遮罩轻关闭 / overscroll-behavior 防滚动穿透 / 焦点落关闭按钮；
 *  6. Modal 必须挂在动画容器之外，避免 transform 破坏 fixed 定位。
 * ================================================================ */

import { useEffect, useId, useRef, useState } from 'react'
import type { MovieEntry } from '../data/expanded/moviesCatalog'
import { hasOfficialTrailer } from '../data/expanded/moviesCatalog'
import { Icon } from './ui'

type PlayerState = 'loading' | 'playing' | 'failed'

/** iframe 最长等待时间：3 秒未触发 onLoad 即判定受限并降级 */
const IFRAME_TIMEOUT_MS = 3000

export function MoviePlayerModal({ movie, onClose }: { movie: MovieEntry; onClose: () => void }) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const canEmbed = hasOfficialTrailer(movie)
  // 无合法预告片源直接降级；有则挂载 iframe 并等待加载
  const [state, setState] = useState<PlayerState>(canEmbed ? 'loading' : 'failed')

  const title = `${movie.titleCn} · ${movie.title}`

  useEffect(() => {
    const id = window.setTimeout(() => closeRef.current?.focus(), 60)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!canEmbed) return
    // 3 秒仍未 onLoad → 判定防盗链 / 跨域拦截，自动降级为海报
    timerRef.current = window.setTimeout(() => {
      setState((s) => (s === 'loading' ? 'failed' : s))
    }, IFRAME_TIMEOUT_MS)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [canEmbed, movie.id])

  const failToCover = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setState('failed')
  }

  const onIframeLoad = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setState('playing')
  }

  /** 官方平台兜底：只在确实有预告片链接时提供外链，空源不给空白页 */
  const openOfficialTrailer = () => {
    if (!movie.trailerUrl) return
    try { window.open(movie.trailerUrl, '_blank', 'noopener,noreferrer') } catch { /* 弹窗被拦截时保持当前弹窗 */ }
  }

  /** 降级态：海报 + 半透明遮罩 + 文案 + 文字外链，绝不白屏 */
  const renderFallback = () => (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800">
      <img src={movie.posterUrl} alt={`${movie.titleCn} 海报`}
        className="absolute inset-0 h-full w-full object-cover object-top" />
      <div className="absolute inset-0 bg-ink/55" />
      <div className="relative z-[1] flex flex-col items-center gap-2 px-4 text-center text-white">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
          <Icon name="play" size={22} />
        </span>
        <p className="text-[13px] font-bold leading-relaxed">当前网络受限，无法加载预告片</p>
        {movie.trailerUrl && (
          <button type="button" onClick={openOfficialTrailer}
            data-testid="movie-trailer-fallback-link"
            className="rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-bold text-brand-600 transition active:scale-95">
            去官方平台观看预告 <Icon name="right" size={13} className="inline" />
          </button>
        )}
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
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭电影详情"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-muted transition hover:bg-slate-200">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* 可滚动内容 */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
          {/* 海报 / 官方预告 iframe 区 */}
          <div data-testid="movie-player-frame" data-player-state={state}>
            {state === 'failed' && renderFallback()}

            {(state === 'loading' || state === 'playing') && (
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink">
                {state === 'loading' && (
                  <div className="absolute inset-0 z-[1] flex items-center justify-center bg-ink/70 text-[12px] font-bold text-white">
                    预告片加载中…
                  </div>
                )}
                <iframe
                  data-testid="movie-trailer-iframe"
                  src={movie.trailerUrl}
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
            本板块只提供官方预告片，不含任何全片片源或盗版链接；如嵌入受限，可点上方链接前往官方平台观看预告。
          </p>
        </div>
      </div>
    </div>
  )
}
