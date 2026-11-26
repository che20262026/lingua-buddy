/**
 * [查询 Query] 框选裁剪的纯数学层
 * ------------------------------------------------------------------
 * 选框坐标统一用「归一化比例」0..1，相对图片真实显示区域（容器已按 naturalWidth/Height
 * 锁 aspect-ratio，因此容器百分比 = 图片像素比例）。这样 Pointer 事件只处理屏幕像素增量，
 * 裁剪时才一次性换算回图片像素，天然适配任意屏宽与横竖屏。
 *
 * 本文件不碰 DOM、不引第三方库（react-easy-crop 会额外增包且 drag 状态难以冒烟），
 * 可被 smoke 用 esbuild 直接单测。
 */

export interface NormCrop {
  x: number
  y: number
  w: number
  h: number
}

export const INITIAL_CROP: NormCrop = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }
const MIN_SIZE = 0.12

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** 把选框约束在图片内，且不小于 MIN_SIZE；拖拽 / 缩放都经此归一化 */
export function clampCrop(crop: NormCrop): NormCrop {
  const w = clamp(crop.w, MIN_SIZE, 1)
  const h = clamp(crop.h, MIN_SIZE, 1)
  return {
    w, h,
    x: clamp(crop.x, 0, 1 - w),
    y: clamp(crop.y, 0, 1 - h),
  }
}

/**
 * 由 Pointer 的像素增量算出新选框。
 * @param mode  'move' 整体平移；n/s/w/e 四角缩放（组合如 'nw'）
 * @param dx,dy 相对「图片显示区域」宽高的比例增量（已除以容器像素尺寸）
 */
export function dragCrop(crop: NormCrop, mode: string, dx: number, dy: number): NormCrop {
  if (mode === 'move') return clampCrop({ ...crop, x: crop.x + dx, y: crop.y + dy })
  let { x, y, w, h } = crop
  if (mode.includes('w')) { x += dx; w -= dx }
  if (mode.includes('e')) { w += dx }
  if (mode.includes('n')) { y += dy; h -= dy }
  if (mode.includes('s')) { h += dy }
  return clampCrop({ x, y, w, h })
}

/** 归一化选框 → 源图像素矩形；maxEdge 限制输出长边以控制 Base64 体积 */
export function cropPixels(crop: NormCrop, naturalW: number, naturalH: number, maxEdge = 1600) {
  const n = clampCrop(crop)
  const sx = Math.round(n.x * naturalW)
  const sy = Math.round(n.y * naturalH)
  const sw = Math.max(1, Math.round(n.w * naturalW))
  const sh = Math.max(1, Math.round(n.h * naturalH))
  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  return {
    sx, sy, sw, sh,
    dw: Math.max(1, Math.round(sw * scale)),
    dh: Math.max(1, Math.round(sh * scale)),
  }
}
