/**
 * [查询 Query · 板块一] 音视频 AI 翻译
 * ------------------------------------------------------------------
 * 音频（mp3/wav/m4a/webm）→ transcribeAudioBlob（复用现成 ASR）→ /chat 翻译。
 * 视频文件（mp4/mov...）：当前转写接口只吃音频，给明确降级提示 + ffmpeg 抽音轨命令，
 * 不假装支持、不上传大文件。全程防抖（in-flight 锁）+ 超时 + AiErrorCard 降级。
 */
import { useRef, useState } from 'react'
import { useAbortableRequest } from '../../hooks/useAbortableRequest'
import { transcribeAudioBlob } from '../../services/transcribeAudio'
import { askQueryAi, translationSystemPrompt, type QueryAiFailure } from '../../services/queryAi'
import { codeFromStatus } from '../aiErrorChannel'
import { AiErrorCard } from '../AiErrorCard'
import { Chip, Icon } from '../ui'
import type { Settings } from '../../types'

type Stage = 'idle' | 'transcribing' | 'translating' | 'done'

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|webm|opus)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm)$/i
const MAX_BYTES = 8 * 1024 * 1024 // 与 transcribe 服务的 8MiB 上限对齐

export function MediaTranslator({ lang, settings }: { lang: 'en' | 'ru'; settings: Settings }) {
  const [stage, setStage] = useState<Stage>('idle')
  const [source, setSource] = useState('')
  const [translated, setTranslated] = useState('')
  const [notice, setNotice] = useState('')
  const [aiError, setAiError] = useState<QueryAiFailure | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const { nextSignal, isMounted } = useAbortableRequest()

  const pickFile = (file?: File | null) => {
    if (!file || busyRef.current) return
    setNotice(''); setSource(''); setTranslated(''); setAiError(null)
    if (VIDEO_EXT.test(file.name) && !AUDIO_EXT.test(file.name)) {
      setNotice(`「${file.name}」是视频文件。当前仅支持音频转写：请先用 ffmpeg 提取音轨（ffmpeg -i input.mp4 -vn -ar 16000 -ac 1 out.wav），再上传 out.wav。`)
      return
    }
    if (!AUDIO_EXT.test(file.name) && !file.type.startsWith('audio/')) {
      setNotice('请选择音频文件（mp3 / wav / m4a / ogg / webm），单文件不超过 8 MB。')
      return
    }
    if (file.size > MAX_BYTES) {
      setNotice('文件超过 8 MB，转写接口无法处理。请截取前 2 分钟或压低码率后重试。')
      return
    }
    void run(file)
  }

  const run = async (file: File) => {
    busyRef.current = true
    const signal = nextSignal()
    setStage('transcribing')
    try {
      const asr = await transcribeAudioBlob(file, signal)
      if (!isMounted() || signal.aborted) return
      if (!asr.ok) {
        setNotice(asr.failure.reason === 'rate-limited'
          ? '转写服务有点忙（限流），请几十秒后重试。'
          : asr.failure.detail || '转写失败，请换一段更清晰的音频重试。')
        setStage('idle')
        return
      }
      setSource(asr.text)
      setStage('translating')
      const hint = lang === 'ru' ? '源语言为俄语。' : '源语言为英语。'
      const ai = await askQueryAi({
        system: translationSystemPrompt(lang, hint),
        user: asr.text,
        signal,
        fallbackText: '【本地降级】AI 翻译暂不可用，上方是转写原文，可稍后重试。',
      })
      if (!isMounted() || signal.aborted) return
      if (ai.ok) setTranslated(ai.content)
      else {
        setTranslated(ai.fallbackText || '翻译暂不可用，请稍后重试。')
        setAiError(ai)
      }
      setStage('done')
    } finally {
      /* 只释放忙锁：stage 由各分支自己设置（done / idle），不在这里按闭包旧值覆盖 */
      busyRef.current = false
    }
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // jsdom / 非安全上下文降级：选中文本提示手动复制
      setNotice(`${label}已生成，请长按或选中文本手动复制。`)
    }
  }

  const retry = () => {
    const input = fileRef.current?.files?.[0]
    if (input) void run(input)
    else setAiError(null)
  }

  return (
    <section data-testid="query-media" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">音视频 AI 翻译</h2>
          <p className="mt-0.5 text-[11px] text-muted">上传音频，先转写再翻译；{lang === 'ru' ? '俄语' : '英语'} → 中文</p>
        </div>
        <Chip tone={lang === 'ru' ? 'coral' : 'brand'} className="!text-[10px]">{lang === 'ru' ? '俄语' : '英语'}</Chip>
      </div>

      {/* 拖拽 + 点击上传：移动端点按即可，桌面可拖拽 */}
      <div
        data-testid="query-media-dropzone"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]) }}
        className={`rounded-2xl border-2 border-dashed p-5 text-center transition ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-white'}`}
      >
        <Icon name="upload" size={26} className="mx-auto text-brand-500" />
        <p className="mt-2 text-xs font-semibold text-ink">拖拽音频到这里，或点击选择</p>
        <p className="mt-0.5 text-[10px] text-muted">支持 mp3 / wav / m4a / ogg / webm · ≤ 8 MB · 视频请先抽音轨</p>
        <button type="button" data-testid="query-media-pick" onClick={() => fileRef.current?.click()}
          className="btn-primary mt-3 min-h-[44px] !px-5 !text-sm">
          <Icon name="upload" size={16} />选择音频文件
        </button>
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,video/*,.mp4,.mov" className="hidden"
          onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
      </div>

      {notice && <p data-testid="query-media-notice" role="status" className="rounded-xl bg-sun-100/60 px-3 py-2 text-[11px] leading-relaxed text-[#8a5b08]">{notice}</p>}
      {(stage === 'transcribing' || stage === 'translating') && (
        <p data-testid="query-media-progress" className="text-xs font-semibold text-brand-600">
          {stage === 'transcribing' ? '正在转写音频…' : '正在翻译文本…'}
        </p>
      )}

      {aiError && (
        <AiErrorCard
          code={codeFromStatus(aiError.status || 0)}
          detail={aiError.detail}
          testId="query-media-ai-error"
          onRetry={retry}
          onDismiss={() => setAiError(null)}
        />
      )}

      {source && (
        <div data-testid="query-media-source" className="rounded-2xl border border-brand-50 bg-white p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold tracking-wide text-brand-600">转写原文</p>
            <button type="button" data-testid="query-copy-source" onClick={() => void copy(source, '转写原文')}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-2 text-[11px] font-semibold text-brand-600">
              <Icon name="copy" size={14} />复制
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">{source}</p>
        </div>
      )}
      {translated && (
        <div data-testid="query-media-result" className="rounded-2xl border border-mint-100 bg-mint-100/30 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold tracking-wide text-mint-600">中文翻译</p>
            <button type="button" data-testid="query-copy-result" onClick={() => void copy(translated, '译文')}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-2 text-[11px] font-semibold text-mint-600">
              <Icon name="copy" size={14} />复制
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">{translated}</p>
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-muted">
        音频转写最长 120 秒；识别与翻译均由本机服务端代理，失败会自动降级，不会白屏。
      </p>
    </section>
  )
}
