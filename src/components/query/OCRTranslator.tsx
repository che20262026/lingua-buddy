/**
 * [查询 Query · 板块二] 拍照 / 文字识别与查询
 * ------------------------------------------------------------------
 * 大输入框直接打字粘贴；【拍照识别】→ 全屏取景 → 拍照后框选裁剪 →
 * 裁剪图交给唯一入口 VisionQueryService.analyzeImage()（组件不直接 fetch）。
 * 识别结果转成纯文本后，后续查询/解析只消费文本，绝不重复传图。
 * 失败降级 + AiErrorCard；Mock / 降级结果明确标注，不冒充真实识别。
 */
import { useEffect, useRef, useState } from 'react'
import { useAbortableRequest } from '../../hooks/useAbortableRequest'
import { useCameraCapture, type CameraSnapshot } from '../../hooks/useCameraCapture'
import { askQueryAi, analysisSystemPrompt, ocrSystemPrompt, type QueryAiFailure } from '../../services/queryAi'
import { analyzeVisionImage, type VisionResult } from '../../services/visionQuery'
import { dataUrlToBlob, type VisionAnalyzeOpts } from '../../lib/visionCore'
import { codeFromStatus } from '../aiErrorChannel'
import { AiErrorCard } from '../AiErrorCard'
import { Chip, Icon } from '../ui'
import { CameraOverlay } from './CameraOverlay'
import { CropOverlay } from './CropOverlay'

type Stage = 'idle' | 'compressing' | 'queued' | 'recognizing' | 'waiting-retry' | 'done'

const STAGE_LABEL: Record<Stage, string> = {
  idle: '', compressing: '压缩中…', queued: '排队中…', recognizing: 'AI 正在提取文字...',
  'waiting-retry': '等待重试', done: '完成',
}

export function OCRTranslator({ lang }: { lang: 'en' | 'ru' }) {
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [aiError, setAiError] = useState<QueryAiFailure | null>(null)
  const [photo, setPhoto] = useState<CameraSnapshot | null>(null)
  const [visionNotice, setVisionNotice] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [resultMeta, setResultMeta] = useState<{ degraded: boolean; mock: boolean } | null>(null)
  /** 同一 requestId 复用：429 后手动重试不重新生成，服务端幂等命中 */
  const requestIdRef = useRef<string>('')
  const lastPhotoRef = useRef<string>('')
  /** 视觉请求专用 AbortController（与 runAnalysis 的 nextSignal 互不打断）：
   *  点「取消」时 abort 在途识别，避免结果回来后仍 setText+runAnalysis 放大请求。 */
  const visionAbortRef = useRef<AbortController | null>(null)
  const { nextSignal, isMounted } = useAbortableRequest()
  const cam = useCameraCapture()

  // 卸载时中止在途视觉请求，防止离开页面后仍写 state / 打后端
  useEffect(() => () => { visionAbortRef.current?.abort(); visionAbortRef.current = null }, [])

  // 倒计时只在 waiting-retry 状态跑，用户可见，不做自动重试
  useEffect(() => {
    if (countdown <= 0) return
    const t = window.setTimeout(() => setCountdown((n) => Math.max(0, n - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [countdown])

  const runAnalysis = async (overrideText?: string) => {
    const source = (overrideText ?? text).trim()
    if (!source) return
    const signal = nextSignal()
    setStage('done'); setAiError(null); setAnalysis('')
    const ai = await askQueryAi({
      system: analysisSystemPrompt(lang),
      user: source,
      signal,
      fallbackText: '【本地降级】AI 解析暂不可用。请先用词典查生词，稍后再试结构化解析。',
    })
    if (!isMounted() || signal.aborted) return
    if (ai.ok) setAnalysis(ai.content)
    else { setAnalysis(ai.fallbackText || ''); setAiError(ai) }
  }

  /** 裁剪后的 Base64 → 唯一 VisionQueryService → 纯文本 → 自动解析（只消费文本）
   *  reuseRequestId：手动重试时传原 id，服务端幂等命中不重复识别；新拍照不传则重新生成。 */
  const runOcr = async (base64: string, reuseRequestId?: string) => {
    lastPhotoRef.current = base64
    requestIdRef.current = reuseRequestId
      || `vq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setPhoto(null)
    setVisionNotice(''); setResultMeta(null); setAiError(null)
    setStage('compressing')
    // 新一次识别先中止上一轮在途视觉请求（重拍/重试不叠加）
    visionAbortRef.current?.abort()
    const controller = new AbortController()
    visionAbortRef.current = controller
    const opts: VisionAnalyzeOpts = {
      targetLang: lang,
      levelProfile: 'B1',
      requestId: requestIdRef.current,
      signal: controller.signal,
    }
    const result: VisionResult = await analyzeVisionImage(dataUrlToBlob(base64), opts)
    // 取消/卸载/被新请求取代：一律不写 state、不触发解析
    if (!isMounted() || controller.signal.aborted) return
    visionAbortRef.current = null

    if (!result.ok) {
      setStage('waiting-retry')
      setCountdown(result.retryAfterSeconds || 0)
      setResultMeta({ degraded: true, mock: result.mock })
      setVisionNotice(result.code === 'QUEUE_FULL'
        ? '排队已满，请稍后再试。'
        : result.code === 'RATE_LIMITED_LOCAL' || result.code === 'RATE_LIMITED_REMOTE'
          ? (result.code === 'RATE_LIMITED_LOCAL' ? '本地额度已满' : '视觉模型繁忙') + '，请等待倒计时后手动重试。'
          : result.code === 'TIMEOUT' ? '识别超时，可用文本继续查询或稍后重试。' : '识别暂不可用，可用文本继续查询。')
      return
    }

    setStage('queued')  // 压缩/排队对用户可见的短过程，结果到达即 done
    if (result.mock) setVisionNotice('演示模式：当前未配置真实视觉模型，返回的是固定占位文本。')
    else if (result.degraded) setVisionNotice('降级模式：视觉识别不可用，已回退本地演示文本。')
    setResultMeta({ degraded: result.degraded, mock: result.mock })
    const recognized = result.text.trim()
    if (!recognized) {
      setVisionNotice('框选区域内未识别到文字，请重新框选或手动输入。')
      setStage('waiting-retry')
      return
    }
    setText(recognized)
    setCountdown(0)
    // 识别成功自动触发一次 AI 解析（纯文本，不带图）
    void runAnalysis(recognized)
  }

  /** 手动重试：复用同一 requestId，服务端幂等命中，不放大请求 */
  const retryVision = () => {
    if (!lastPhotoRef.current) return
    setCountdown(0)
    void runOcr(lastPhotoRef.current, requestIdRef.current)
  }

  const handleCapture = () => {
    const shot = cam.capture()
    if (!shot) {
      setAiError({ ok: false, reason: 'empty', detail: '画面还没准备好，请稍候再点一次拍照。', fallbackText: '' })
      return
    }
    setAiError(null)
    setPhoto(shot)
    cam.stop()
  }

  const handleRetake = () => {
    setPhoto(null)
    void cam.open()
  }

  const openCamera = async () => {
    setAiError(null)
    setPhoto(null)
    await cam.open()
  }

  const retry = () => { setAiError(null); void runAnalysis() }

  return (
    <section data-testid="query-ocr" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">拍照 / 文字识别与查询</h2>
          <p className="mt-0.5 text-[11px] text-muted">粘贴或拍照取词，AI 解析生词 / 短语 / 长难句</p>
        </div>
        <Chip tone={lang === 'ru' ? 'coral' : 'brand'} className="!text-[10px]">{lang === 'ru' ? '俄语 OCR' : '英语 OCR'}</Chip>
      </div>

      {/* 大输入框 + 拍照按钮 */}
      <div className="rounded-2xl border border-brand-50 bg-white p-3">
        <textarea
          data-testid="query-ocr-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={lang === 'ru' ? '粘贴俄语文本，或点拍照识别…' : '粘贴英文文本，或点拍照识别…'}
          rows={5}
          className="w-full resize-y rounded-xl bg-brand-50/40 p-3 text-sm leading-relaxed text-ink outline-none placeholder:text-muted/60 focus:ring-2 focus:ring-brand-200"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" data-testid="query-ocr-camera" onClick={() => void openCamera()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-brand-50 px-4 text-sm font-semibold text-brand-600 transition hover:bg-brand-100">
            <Icon name="camera" size={17} />📷 拍照识别
          </button>
          <button type="button" data-testid="query-ocr-analyze" onClick={() => void runAnalysis()}
            disabled={!text.trim() || (stage !== 'idle' && stage !== 'done' && stage !== 'waiting-retry')}
            className="btn-primary min-h-[44px] !px-5 !text-sm disabled:opacity-40">
            {stage === 'queued' ? '解析中…' : 'AI 解析'}
          </button>
          {(stage === 'compressing' || stage === 'queued' || stage === 'recognizing') && (
            <button type="button" data-testid="query-ocr-cancel" onClick={() => {
              visionAbortRef.current?.abort()
              visionAbortRef.current = null
              setStage('idle')
            }}
              className="inline-flex min-h-[44px] items-center rounded-2xl border border-brand-100 px-3 text-xs font-semibold text-brand-600">
              取消
            </button>
          )}
        </div>
      </div>

      {/* 可见进度：压缩中 → 排队 → 识别中 → 等待重试/降级 → 完成 */}
      {stage !== 'idle' && stage !== 'done' && (
        <div data-testid="query-ocr-loading" role="status" aria-live="polite"
          className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[12px] font-semibold text-brand-600">
          <span className="h-3 w-3 animate-ping rounded-full bg-brand-500" />
          {STAGE_LABEL[stage]}{countdown > 0 ? `（${countdown}s 后可手动重试）` : ''}
        </div>
      )}
      {stage === 'waiting-retry' && countdown === 0 && lastPhotoRef.current && (
        <button type="button" data-testid="query-ocr-retry-vision" onClick={retryVision}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-brand-500 px-4 text-xs font-bold text-white">
          <Icon name="refresh" size={14} />手动重试识别（复用同一 requestId）
        </button>
      )}
      {visionNotice && (
        <p data-testid="query-vision-notice" role="status"
          className="rounded-xl bg-sun-100/60 px-3 py-2 text-[11px] leading-relaxed text-[#8a5b08]">{visionNotice}</p>
      )}
      {resultMeta?.degraded && (
        <Chip tone="coral" className="!text-[10px]">{resultMeta.mock ? '演示模式' : '降级模式'}</Chip>
      )}

      {/* 摄像头全屏取景 → 框选预览 → 权限降级 */}
      {cam.phase === 'live' && !photo && (
        <CameraOverlay videoRef={cam.videoRef} onCapture={handleCapture} onCancel={cam.stop} error={cam.error} />
      )}
      {photo && (
        <CropOverlay source={photo.dataUrl} onConfirm={(base64) => void runOcr(base64)}
          onRetake={handleRetake} working={stage === 'compressing' || stage === 'recognizing'} />
      )}
      {cam.phase === 'denied' || cam.phase === 'unsupported' || cam.phase === 'error' ? (
        <div data-testid="query-camera-fallback" role="status" className="rounded-xl bg-sun-100/60 px-3 py-3 text-[12px] leading-relaxed text-[#8a5b08]">
          <Icon name="info" size={16} className="mr-1 inline" />{cam.error || '摄像头不可用。'}
          <strong>请直接在上方输入框手动输入文字</strong>，AI 解析照常可用。
        </div>
      ) : null}
      {cam.phase === 'opening' && <p className="text-xs text-brand-600">正在打开摄像头…</p>}

      {aiError && (
        <AiErrorCard code={codeFromStatus(aiError.status || 0)} detail={aiError.detail}
          testId="query-ocr-ai-error" onRetry={retry} onDismiss={() => setAiError(null)} />
      )}
      {analysis && (
        <div data-testid="query-ocr-result" className="rounded-2xl border border-mint-100 bg-mint-100/30 p-3.5">
          <p className="text-[10px] font-bold tracking-wide text-mint-600">结构化解析</p>
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">{analysis}</div>
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-muted">
        拍照后先框选区域，再由服务端视觉模型提取文字（压缩图与缓存均不含原图，7 天 TTL）；无摄像头或未授权时可全程手动输入。
      </p>
    </section>
  )
}
