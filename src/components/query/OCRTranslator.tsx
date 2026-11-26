/**
 * [查询 Query · 板块二] 拍照 / 文字识别与查询
 * ------------------------------------------------------------------
 * 大输入框直接打字粘贴；【拍照识别】唤起后置摄像头 → 截图 → 复用 /chat 视觉解析
 * （零新增依赖、零新密钥）。权限拒绝 / 不支持 → 明确降级为「手动输入」。
 * 【AI 解析】对文本中的生词、短语、长难句给结构化中文解析；失败降级 + AiErrorCard。
 */
import { useState } from 'react'
import { useAbortableRequest } from '../../hooks/useAbortableRequest'
import { useCameraCapture } from '../../hooks/useCameraCapture'
import { askQueryAi, analysisSystemPrompt, ocrSystemPrompt, type QueryAiFailure } from '../../services/queryAi'
import { codeFromStatus } from '../aiErrorChannel'
import { AiErrorCard } from '../AiErrorCard'
import { Chip, Icon } from '../ui'

export function OCRTranslator({ lang }: { lang: 'en' | 'ru' }) {
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [working, setWorking] = useState<'ocr' | 'analysis' | null>(null)
  const [aiError, setAiError] = useState<QueryAiFailure | null>(null)
  const { nextSignal, isMounted } = useAbortableRequest()
  const cam = useCameraCapture()

  const runOcr = async () => {
    const shot = cam.capture()
    if (!shot) return
    const signal = nextSignal()
    setWorking('ocr'); setAiError(null)
    const ai = await askQueryAi({
      system: ocrSystemPrompt(lang),
      user: '请识别这张图片中的文字并翻译：',
      signal,
      fallbackText: '',
    }, shot.dataUrl)
    cam.stop()
    if (!isMounted() || signal.aborted) { setWorking(null); return }
    if (!ai.ok) {
      setAiError(ai)
      setWorking(null)
      return
    }
    const recognized = ai.content.replace(/^原文[:：]?\s*/i, '').split(/\n\s*\n/)[0].trim()
    if (recognized === 'EMPTY' || !recognized) {
      setAiError({ ok: false, reason: 'empty', detail: '图中未识别到文字，请手动输入。', fallbackText: '' })
    } else {
      setText(recognized)
    }
    setWorking(null)
  }

  const runAnalysis = async () => {
    if (!text.trim()) return
    const signal = nextSignal()
    setWorking('analysis'); setAiError(null); setAnalysis('')
    const ai = await askQueryAi({
      system: analysisSystemPrompt(lang),
      user: text.trim(),
      signal,
      fallbackText: '【本地降级】AI 解析暂不可用。请先用词典查生词，稍后再试结构化解析。',
    })
    if (!isMounted() || signal.aborted) { setWorking(null); return }
    if (ai.ok) setAnalysis(ai.content)
    else { setAnalysis(ai.fallbackText || ''); setAiError(ai) }
    setWorking(null)
  }

  const openCamera = async () => {
    setAiError(null)
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

      {/* 摄像头预览 / 权限降级 */}
      {cam.phase === 'live' && (
        <div data-testid="query-camera-live" className="rounded-2xl overflow-hidden border border-brand-100 bg-black">
          <video ref={cam.videoRef} playsInline muted className="w-full max-h-72 object-contain" />
          <div className="flex gap-2 bg-white p-2">
            <button type="button" data-testid="query-camera-capture" onClick={() => void runOcr()} disabled={working === 'ocr'}
              className="btn-primary min-h-[44px] flex-1 !text-sm disabled:opacity-40">
              <Icon name="camera" size={16} />{working === 'ocr' ? '识别中…' : '截取并识别'}
            </button>
            <button type="button" onClick={cam.stop}
              className="inline-flex min-h-[44px] items-center rounded-2xl border border-brand-100 px-4 text-sm font-semibold text-brand-600">
              取消
            </button>
          </div>
        </div>
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
        拍照走服务端视觉解析（不上传笔迹、不留存储）；无摄像头或未授权时可全程手动输入。
      </p>
    </section>
  )
}
