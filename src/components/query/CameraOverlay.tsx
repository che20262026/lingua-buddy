/**
 * [查询 Query] 摄像头全屏取景器
 * ------------------------------------------------------------------
 * - fixed inset-0 z-50 黑底铺满整屏，video 用 object-cover 居中取景；
 * - 顶部关闭 + 底部悬浮【拍照】【取消】按钮，热区均 ≥44px；
 * - 不用原生 <dialog>（jsdom 31 未实现 showModal），纯 div + role=dialog；
 * - 打开期间锁 body 滚动；关闭时恢复原 overflow 与 scrollY，避免页面跳回顶部；
 * - overscroll-behavior: contain 兜住触摸滚动穿透（与项目弹层约定一致）。
 */
import { useEffect, type Ref } from 'react'
import { Icon } from '../ui'

export interface CameraOverlayProps {
  videoRef: Ref<HTMLVideoElement>
  onCapture: () => void
  onCancel: () => void
  working?: boolean
  error?: string
}

export function CameraOverlay({ videoRef, onCapture, onCancel, working = false, error = '' }: CameraOverlayProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousScrollY = window.scrollY || 0
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      // 恢复原位置：直接 hidden 会让页面跳回顶部，这里显式还回去
      try { window.scrollTo({ top: previousScrollY, behavior: 'auto' }) } catch { /* jsdom 未实现 scrollTo 时静默 */ }
    }
  }, [])

  return (
    <div data-testid="query-camera-overlay" role="dialog" aria-modal="true" aria-label="拍照识别取景器"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      style={{ overscrollBehavior: 'contain', touchAction: 'none' }}>
      <video ref={videoRef} playsInline muted autoPlay
        className="absolute inset-0 h-full w-full object-cover" />

      {/* 顶部：标题与关闭 */}
      <div className="relative z-10 flex shrink-0 items-center justify-between px-4 pt-[calc(12px+env(safe-area-inset-top))]">
        <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">📷 拍照识别</span>
        <button type="button" data-testid="query-camera-close" onClick={onCancel} aria-label="关闭摄像头"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white transition active:scale-95">
          <Icon name="close" size={20} />
        </button>
      </div>

      {error ? (
        <p role="status" className="relative z-10 mx-4 mt-3 rounded-xl bg-sun-500/90 px-3 py-2 text-center text-[12px] font-semibold text-white">
          {error}
        </p>
      ) : null}

      {/* 底部悬浮操作条 */}
      <div className="relative z-10 mt-auto flex shrink-0 items-center justify-center gap-7 px-6 pb-[calc(28px+env(safe-area-inset-bottom))]">
        <button type="button" data-testid="query-camera-cancel" onClick={onCancel}
          className="min-h-[48px] rounded-2xl border border-white/40 bg-black/35 px-5 text-sm font-bold text-white transition active:scale-95">
          取消
        </button>
        <div className="flex flex-col items-center gap-1">
          <button type="button" data-testid="query-camera-capture" onClick={onCapture} disabled={working}
            aria-label="拍照并识别"
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-white/25 text-white shadow-float transition active:scale-95 disabled:opacity-50">
            <Icon name="camera" size={28} />
          </button>
          <span className="text-[11px] font-semibold text-white/85">{working ? '识别中…' : '拍照'}</span>
        </div>
      </div>
    </div>
  )
}
