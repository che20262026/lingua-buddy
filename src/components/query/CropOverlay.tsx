/**
 * [查询 Query] 拍照后「全屏预览 → 框选裁剪」沉浸式层
 * ------------------------------------------------------------------
 * 移动端 Immersive Page：全屏画布、隐藏普通 Header、底部主操作在拇指区、
 * Safe Area 适配、热区 ≥44px；图片按原始宽高比居中，遮罩四块围出透明选框，
 * Pointer Events 同时支持触摸拖拽 / 四角缩放；确认时用离屏 Canvas 裁出 Base64。
 * 零新增依赖（不引 react-easy-crop），不用原生 <dialog>（jsdom 31 未实现 showModal）。
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from '../ui'
import { cropPixels, dragCrop, INITIAL_CROP, type NormCrop } from '../../lib/cropRect'

export interface CropOverlayProps {
  /** 拍照得到的完整图片 data URL */
  source: string
  /** 确认裁剪：回传裁剪后的 Base64（JPEG ≤1600px） */
  onConfirm: (croppedDataUrl: string) => void
  /** 重拍：回到取景器 */
  onRetake: () => void
  /** AI 提取中：禁用操作并显示进度文案 */
  working?: boolean
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const HANDLES: Array<{ mode: DragMode; cls: string }> = [
  { mode: 'nw', cls: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2' },
  { mode: 'ne', cls: 'right-0 top-0 translate-x-1/2 -translate-y-1/2' },
  { mode: 'sw', cls: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2' },
  { mode: 'se', cls: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2' },
]

export function CropOverlay({ source, onConfirm, onRetake, working = false }: CropOverlayProps) {
  const [crop, setCrop] = useState<NormCrop>(INITIAL_CROP)
  const [imageReady, setImageReady] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ mode: DragMode; x: number; y: number; crop: NormCrop } | null>(null)

  // 打开期间锁 body 滚动；关闭时恢复原 overflow 与 scrollY（与取景器同一约定）
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousScrollY = window.scrollY || 0
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      try { window.scrollTo({ top: previousScrollY, behavior: 'auto' }) } catch { /* jsdom 无 scrollTo */ }
    }
  }, [])

  // Esc 重拍（不做破坏性操作，仅回到取景器）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !working) onRetake() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onRetake, working])

  const startDrag = (mode: DragMode) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (working || !imageReady) return
    e.preventDefault(); e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { mode, x: e.clientX, y: e.clientY, crop }
  }

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const stage = stageRef.current
    if (!drag || !stage) return
    const rect = stage.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dx = (e.clientX - drag.x) / rect.width
    const dy = (e.clientY - drag.y) / rect.height
    setCrop(dragCrop(drag.crop, drag.mode, dx, dy))
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragRef.current = null
  }

  const confirm = () => {
    const img = imageRef.current
    if (!img || !img.naturalWidth || !img.naturalHeight) return
    const p = cropPixels(crop, img.naturalWidth, img.naturalHeight)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = p.dw
      canvas.height = p.dh
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, p.sx, p.sy, p.sw, p.sh, 0, 0, p.dw, p.dh)
      onConfirm(canvas.toDataURL('image/jpeg', 0.9))
    } catch {
      // 裁剪失败不中断：回传原图，仍走服务端视觉解析
      onConfirm(source)
    }
  }

  const pct = (n: number) => `${(n * 100).toFixed(3)}%`
  const left = pct(crop.x)
  const top = pct(crop.y)
  const width = pct(crop.w)
  const height = pct(crop.h)
  const right = pct(crop.x + crop.w)
  const bottom = pct(crop.y + crop.h)

  return (
    <div data-testid="query-crop-overlay" role="dialog" aria-modal="true" aria-label="框选识别区域"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      style={{ overscrollBehavior: 'contain', touchAction: 'none' }}>
      {/* 顶部：说明与关闭 */}
      <div className="relative z-20 flex shrink-0 items-start justify-between gap-3 px-4 pt-[calc(12px+env(safe-area-inset-top))]">
        <div className="max-w-[75%]">
          <p className="text-sm font-bold">拖动选框，仅保留需要识别的文字区域</p>
          <p className="mt-0.5 text-[11px] text-white/70">四角可缩放 · 框内内容才会发给 AI 提取</p>
        </div>
        <button type="button" data-testid="query-crop-close" onClick={onRetake} disabled={working}
          aria-label="关闭裁剪并返回取景器"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/55 disabled:opacity-40">
          <Icon name="close" size={20} />
        </button>
      </div>

      {/* 图片舞台：容器锁宽高比，百分比选框即图片像素比例 */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-3">
        {imageFailed ? (
          <p className="rounded-xl bg-sun-500/85 px-4 py-3 text-center text-[12px] font-semibold">
            照片预览失败，请重拍或手动输入文字。
          </p>
        ) : (
          <div ref={stageRef}
            className="relative max-h-full max-w-full overflow-hidden rounded-xl"
            style={{ aspectRatio: `${imageRef.current?.naturalWidth || 4} / ${imageRef.current?.naturalHeight || 3}` }}>
            <img ref={imageRef} src={source} alt="待识别照片" data-testid="query-crop-image"
              onLoad={() => setImageReady(true)}
              onError={() => { setImageFailed(true); setImageReady(false) }}
              className="block max-h-full max-w-full object-contain" draggable={false} />

            {/* 四块半透明遮罩，中间透出选框 */}
            <div aria-hidden="true" className="absolute left-0 top-0 w-full bg-black/60" style={{ height: top }} />
            <div aria-hidden="true" className="absolute bottom-0 left-0 w-full bg-black/60" style={{ top: bottom }} />
            <div aria-hidden="true" className="absolute bg-black/60" style={{ left: 0, top, width: left, height }} />
            <div aria-hidden="true" className="absolute right-0 bg-black/60" style={{ left: right, top, height }} />

            {/* 选框：整体可拖拽 */}
            <div data-testid="query-crop-box" role="group" aria-label="识别区域选框"
              onPointerDown={startDrag('move')} onPointerMove={moveDrag} onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(59,107,244,0.9)]"
              style={{ left: left || '8%', top: top || '8%', width: width || '84%', height: height || '84%' }}>
              {HANDLES.map((h) => (
                <div key={h.mode} data-testid={`query-crop-handle-${h.mode}`}
                  onPointerDown={startDrag(h.mode)} onPointerMove={moveDrag} onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className={`absolute h-9 w-9 touch-none rounded-full bg-white/90 ${h.cls}`} />
              ))}
              <span className="pointer-events-none absolute -top-6 left-0 rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-bold">
                识别区域
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 底部主操作：拇指区、Safe Area、热区 ≥48px */}
      <div className="relative z-20 flex shrink-0 items-center justify-center gap-4 px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
        <button type="button" data-testid="query-crop-retake" onClick={onRetake} disabled={working}
          className="min-h-[48px] flex-1 rounded-2xl border border-white/45 bg-white/10 px-4 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40">
          重拍
        </button>
        <button type="button" data-testid="query-crop-confirm" onClick={confirm} disabled={working || !imageReady || imageFailed}
          className="min-h-[48px] flex-[1.4] rounded-2xl bg-brand-500 px-4 text-sm font-bold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-40">
          {working ? 'AI 正在提取文字...' : '确认识别'}
        </button>
      </div>
    </div>
  )
}
