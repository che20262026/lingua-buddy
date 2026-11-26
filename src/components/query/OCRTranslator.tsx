/**
 * [查询 Query · 板块二] 拍照 / 文字识别与查询
 * ------------------------------------------------------------------
 * 大输入框直接打字粘贴；【拍照识别】→ 全屏取景 → 拍照后框选裁剪 → 裁剪 Base64
 * 复用 /chat 多模态视觉解析（零新增依赖、零新密钥、无前端 tesseract）。
 * 识别成功自动填入文本框并触发一次 AI 结构化解析；失败降级 + AiErrorCard。
 */
import { useState } from 'react'
import { useAbortableRequest } from '../../hooks/useAbortableRequest'
import { useCameraCapture, type CameraSnapshot } from '../../hooks/useCameraCapture'
import { askQueryAi, analysisSystemPrompt, ocrSystemPrompt, type QueryAiFailure } from '../../services/queryAi'
import { codeFromStatus } from '../aiErrorChannel'
import { AiErrorCard } from '../AiErrorCard'
import { Chip, Icon } from '../ui'
import { CameraOverlay } from './CameraOverlay'
import { CropOverlay } from './CropOverlay'

export function OCRTranslator({ lang }: { lang: 'en' | 'ru' }) {
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [working, setWorking] = useState<'ocr' | 'analysis' | null>(null)
  const [aiError, setAiError] = useState<QueryAiFailure | null>(null)
  const [photo, setPhoto] = useState<CameraSnapshot | null>(null)
  const { nextSignal, isMounted } = useAbortableRequest()
  const cam = useCameraCapture()

  /** 裁剪后的 Base64 → 服务端视觉模型纯文本提取 → 自动触发结构化解析 */
  const runOcr = async (base64: string) => {
    const signal = nextSignal()
    setPhoto(null)                       // 关闭全屏裁剪层，回到业务页看进度
    setWorking('ocr'); setAiError(null)
    const ai = await askQueryAi({
      system: ocrSystemPrompt(lang),
      user: '请提取图片中的全部文字，只输出纯文本：',
      signal,
      fallbackText: '',
    }, base64)
    if (!isMounted() || signal.aborted) { setWorking(null); return }
    if (!ai.ok) {
      setAiError(ai)
      setWorking(null)
      return
    }
    const recognized = ai.content.replace(/^EMPTY\s*$/i, '').trim()
    if (!recognized) {
      setAiError({ ok: false, reason: 'empty', detail: '框选区域内未识别到文字，请重新框选或手动输入。', fallbackText: '' })
      setWorking(null)
      return
    }
    setText(recognized)
    setWorking(null)
    // 识别成功自动触发一次 AI 解析（新 signal，不取消已完成的 OCR 结果）
    void runAnalysis(recognized)
  }

  /** overrideText 供 OCR 自动解析直接传已识别文本，避免依赖尚未刷新的 text state */
  const runAnalysis = async (overrideText?: string) => {
    const source = (overrideText ?? text).trim()
    if (!source) return
    const signal = nextSignal()
    setWorking('analysis'); setAiError(null); setAnalysis('')
    const ai = await askQueryAi({
      system: analysisSystemPrompt(lang),
      user: source,
      signal,
      fallbackText: '【本地降级】AI 解析暂不可用。请先用词典查生词，稍后再试结构化解析。',
    })
    if (!isMounted() || signal.aborted) { setWorking(null); return }
    if (ai.ok) setAnalysis(ai.content)
    else { setAnalysis(ai.fallbackText || ''); setAiError(ai) }
    setWorking(null)
  }

  /** 拍照：拿完整截图后退出取景器，交给框选层，不直接识别 */
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

  /** 重拍：关闭裁剪层并重新唤起摄像头 */
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
            disabled={!text.trim() || working !== null}
            className="btn-primary min-h-[44px] !px-5 !text-sm disabled:opacity-40">
            {working === 'analysis' ? '解析中…' : 'AI 解析'}
          </button>
        </div>
      </div>

      {/* AI 提取进度：可见过程，明确「正在做什么」 */}
      {working === 'ocr' && (
        <div data-testid="query-ocr-loading" role="status" aria-live="polite"
          className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[12px] font-semibold text-brand-600">
          <span className="h-3 w-3 animate-ping rounded-full bg-brand-500" />AI 正在提取文字...
        </div>
      )}

      {/* 全屏取景器 → 拍照后框选预览 → 权限降级 */}
      {cam.phase === 'live' && !photo && (
        <CameraOverlay
          videoRef={cam.videoRef}
          onCapture={handleCapture}
          onCancel={cam.stop}
          error={cam.error}
        />
      )}
      {photo && (
        <CropOverlay
          source={photo.dataUrl}
          onConfirm={(base64) => void runOcr(base64)}
          onRetake={handleRetake}
          working={working === 'ocr'}
        />
      )}
      {cam.phase === 'denied' || cam.phase === 'unsupported' || cam.phase === 'error' ? (
        <div data-testid="query-camera-fallback" role="status" className="rounded-xl bg-sun-100/60 px-3 py-3 text-[12px] leading-relaxed text-[#8a5b08]">
          <Icon name="info" size={16} className="mr-1 inline" />{cam.error || '摄像头不可用。'}
          <strong>请直接在上方输入框手动输入文字</strong>，AI 解析照常可用。
        </div>
      ) : null}
      {cam.phase === 'opening' && <p className="text-xs text-brand-600">正在打开摄像头…</p>}

      {aiError && (
        <AiErrorCard
          code={codeFromStatus(aiError.status || 0)}
          detail={aiError.detail}
          testId="query-ocr-ai-error"
          onRetry={retry}
          onDismiss={() => setAiError(null)}
        />
      )}

      {analysis && (
        <div data-testid="query-ocr-result" className="rounded-2xl border border-mint-100 bg-mint-100/30 p-3.5">
          <p className="text-[10px] font-bold tracking-wide text-mint-600">结构化解析</p>
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">{analysis}</div>
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-muted">
        拍照后先框选区域，再由服务端视觉模型提取文字（裁剪图不留存储）；无摄像头或未授权时可全程手动输入。
      </p>
    </section>
  )
}
