/**
 * [查询 Query] 摄像头拍照 Hook
 * ------------------------------------------------------------------
 * - 优先后置摄像头（facingMode:'environment'），拿不到就退回任意摄像头；
 * - 权限拒绝 / 不支持 / 无设备 → 全部走结构化状态，UI 可降级为「手动输入」；
 * - 截图走离屏 canvas 压缩到 ≤1600px 的 JPEG data URL，控制体积（chat 图片上限）；
 * - 卸载 / 关闭时立刻 stop 所有 track，绝不泄漏摄像头占用。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraPhase = 'idle' | 'opening' | 'live' | 'denied' | 'unsupported' | 'error'

export interface CameraSnapshot {
  dataUrl: string
  width: number
  height: number
}

export function useCameraCapture() {
  const [phase, setPhase] = useState<CameraPhase>('idle')
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setPhase('idle')
  }, [])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const open = useCallback(async (): Promise<boolean> => {
    setError('')
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPhase('unsupported')
      setError('当前浏览器或网络环境不支持摄像头，请手动输入文字。')
      return false
    }
    setPhase('opening')
    const tryStream = async (facingMode: 'environment' | 'user'): Promise<MediaStream | null> => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1600 }, height: { ideal: 1200 } },
          audio: false,
        })
      } catch { return null }
    }
    let stream = await tryStream('environment')
    if (!stream) stream = await tryStream('user')
    if (!stream) {
      // 区分「用户拒绝」与其他：再试一次无约束，被拒即 denied
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      } catch (err) {
        const name = (err as { name?: string })?.name
        const denied = name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError'
        setPhase(denied ? 'denied' : 'unsupported')
        setError(denied
          ? '摄像头权限被拒绝，请在浏览器设置里允许后重试，或直接手动输入文字。'
          : '未找到可用摄像头，请手动输入文字。')
        return false
      }
    }
    streamRef.current = stream
    setPhase('live')
    // 等 React 把 <video> 挂上后再绑定 srcObject
    window.setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().catch(() => { /* 自动播放被拦时用户仍可点截图 */ })
      }
    }, 0)
    return true
  }, [])

  const capture = useCallback((): CameraSnapshot | null => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return null
    const vw = video.videoWidth || 1280
    const vh = video.videoHeight || 960
    const scale = Math.min(1, 1600 / Math.max(vw, vh))
    const w = Math.round(vw * scale)
    const h = Math.round(vh * scale)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, w, h)
      return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), width: w, height: h }
    } catch {
      setError('截图失败，请重试或手动输入文字。')
      return null
    }
  }, [])

  return { phase, error, videoRef, open, capture, stop, setPhase, setError }
}
