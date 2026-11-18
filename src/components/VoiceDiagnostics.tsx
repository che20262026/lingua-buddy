import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import {
  checkMicrophone, copyPageLink, describeSpeechSupport, openInNewTab, pageLink,
  recordingSupported, speechSupported, startListening, startRecording, stopSpeaking,
  type ListeningHandle, type RecordingHandle,
} from '../lib/speech'
import { isAsrConfigured } from '../services/transcriber'
import { getIeltsLevel } from '../data/ieltsLevels'
import {
  assessRecording, assessVoice, transcriptMetrics, trimVoiceReports,
} from '../services/voiceAssessor'
import type { VoiceAssessment } from '../types'
import { VoiceAssessmentCard } from './VoiceFeedback'
import { Card, Chip, Icon, SectionTitle } from './ui'

/** 设置页的语音自检台：把「为什么录音失败」直接摊开给用户看 */
export function VoiceDiagnostics() {
  const { data, update } = useApp()
  const level = getIeltsLevel(data.settings.ieltsLevel)
  const env = describeSpeechSupport()
  const [mic, setMic] = useState<{ ok: boolean; reason: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [recording, setRecording] = useState(false)
  const [clip, setClip] = useState<{ url: string; durationMs: number } | null>(null)
  const [assessment, setAssessment] = useState<VoiceAssessment | null>(null)
  const [note, setNote] = useState('')
  const [dictating, setDictating] = useState(false)
  const [dictationNote, setDictationNote] = useState('')
  const [dictation, setDictation] = useState<{ text: string; partial: boolean; retries: number } | null>(null)
  const recorderRef = useRef<RecordingHandle | null>(null)
  const listeningRef = useRef<ListeningHandle | null>(null)
  const clipUrlRef = useRef<string | null>(null)

  useEffect(() => () => {
    try { recorderRef.current?.cancel() } catch { /* 忽略 */ }
    try { listeningRef.current?.cancel() } catch { /* 忽略 */ }
    if (clipUrlRef.current) {
      try { URL.revokeObjectURL(clipUrlRef.current) } catch { /* 忽略 */ }
    }
  }, [])

  const runCheck = async () => {
    setChecking(true)
    setMic(null)
    const result = await checkMicrophone()
    setMic(result)
    setChecking(false)
  }

  const runTrial = async () => {
    if (recording) {
      recorderRef.current?.stop()
      recorderRef.current = null
      return
    }
    stopSpeaking() // 别把正在播放的示范音录进去
    setNote('')
    setRecording(true)
    const handle = await startRecording({
      maxMs: 3000,
      onDone: async ({ url, blob, durationMs }) => {
        if (clipUrlRef.current) {
          try { URL.revokeObjectURL(clipUrlRef.current) } catch { /* 忽略 */ }
        }
        clipUrlRef.current = url
        setClip({ url, durationMs })
        setRecording(false)
        recorderRef.current = null
        setNote(`录到 ${(durationMs / 1000).toFixed(1)} 秒，点播放听听自己的发音；正在分析声学特征…`)
        // 试音也走同一套评判引擎：能真实测出响度、语速、停顿与语调起伏
        const measured = await assessRecording(blob, {
          level, source: 'recording', scenarioTitle: '麦克风试音',
        })
        const result = measured || assessVoice({
          level, source: 'recording', scenarioTitle: '麦克风试音',
          features: transcriptMetrics('', durationMs),
        })
        setAssessment(result)
        update((prev) => ({ ...prev, voiceReports: trimVoiceReports([...prev.voiceReports, result]) }))
        setNote(measured
          ? `录到 ${(durationMs / 1000).toFixed(1)} 秒，已生成发音评测并存入练习记录。参考 ${result.bandRef.toFixed(1)}，目标档 ${level.band} 约 ${level.bandValue.toFixed(1)}。`
          : `录到 ${(durationMs / 1000).toFixed(1)} 秒；当前浏览器无法解码音频波形，已生成简版点评（语调/清晰度标为未测）。`)
      },
      onError: (message) => {
        setRecording(false)
        recorderRef.current = null
        setNote(message)
      },
    })
    if (!handle) {
      setRecording(false)
      setNote('当前环境不支持本地录音，请在新标签页用 Chrome / Edge 打开后重试。')
      return
    }
    recorderRef.current = handle
    setNote('录音中，请读完再点一次「试音」停止，然后听回放。')
  }

  /** 听写探针：直接验证「声音 → 文字」这一环，把 interim / 重试结果摊开给用户看 */
  const runDictation = () => {
    if (dictating) {
      listeningRef.current?.stop()
      setDictationNote('正在整理听到的文字…')
      return
    }
    stopSpeaking()
    setDictation(null)
    setDictating(true)
    setDictationNote('录音中，请读完再点一次「听写探针」停止；停顿不会自动结束。')
    const handle = startListening({
      accent: data.settings.accent,
      retries: 1,
      timeoutMs: 10000,
      onInterim: (t) => setDictationNote(`实时：${t}`),
      onStatus: (m) => setDictationNote(m),
      onResult: (t, meta) => {
        setDictation({ text: t, partial: meta.partial, retries: meta.retries })
        setDictationNote(meta.partial
          ? '拿到文字了，但含浏览器未确认的片段，请核对 ✅'
          : '拿到完整文字 ✅（服务中断时会自动重试一次）')
        setDictating(false)
        listeningRef.current = null
      },
      onError: (code, info) => {
        setDictating(false)
        listeningRef.current = null
        setDictationNote(`听写失败（${code}）：${info.message}`)
      },
      onEnd: () => {
        setDictating(false)
        listeningRef.current = null
      },
    })
    if (!handle) {
      setDictating(false)
      setDictationNote('当前环境没有语音识别服务。可在对话页用「录一段并转写」，或在下方配置自定义转写服务。')
    } else {
      listeningRef.current = handle
    }
  }

  const status = (ok: boolean, yes: string, no: string) => (
    <Chip tone={ok ? 'mint' : 'sun'} className="!px-2.5 !py-1">{ok ? `✓ ${yes}` : `· ${no}`}</Chip>
  )

  return (
    <Card>
      <SectionTitle title="麦克风自检" subtitle="语音识别失败时先看这里：能定位权限、运行环境与设备问题。"
        right={<Chip tone="brand">诊断</Chip>} />
      <div className="flex flex-wrap gap-1.5">
        {status(speechSupported(), '朗读可用', '朗读不可用')}
        {status(env.recognition, '语音识别可用', '无语音识别')}
        {status(recordingSupported(), '本地录音可用', '无本地录音')}
        {status(env.secureContext, '安全上下文', '非安全上下文')}
        {status(isAsrConfigured(data.settings), '转写服务已配置', '转写服务未配置')}
        {env.inIframe && <Chip tone="coral" className="!px-2.5 !py-1">· 嵌在预览面板中</Chip>}
      </div>

      <button type="button" onClick={runDictation} disabled={!env.recognition}
        className="btn-ghost mt-3 !px-3 !py-2 !text-xs disabled:opacity-50">
        <Icon name="mic" size={14} />{dictating ? '停止听写并出字' : '听写测试（说一句英文）'}
      </button>
      {dictationNote && (
        <p className="mt-2 rounded-2xl bg-brand-50/70 p-3 text-[11px] leading-relaxed text-brand-700">{dictationNote}</p>
      )}
      {dictation && (
        <div className="mt-2 rounded-2xl border border-mint-400/30 bg-mint-100/60 p-3">
          <p className="en-text text-xs font-semibold text-ink">{dictation.text}</p>
          <p className="mt-1 text-[10px] text-muted">
            {dictation.partial ? '含未确认片段 · 请核对' : '浏览器已确认'} · 自动重试 {dictation.retries} 次
          </p>
        </div>
      )}

      {env.hint && (
        <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-sun-100/60 p-3 text-[11px] leading-relaxed text-[#8a5b08]">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />{env.hint}
        </p>
      )}
      {env.inIframe && (
        <p className="mt-2 break-all rounded-xl bg-brand-50/70 px-2.5 py-2 text-[10px] text-muted">
          应用地址：{pageLink()}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => { void runCheck() }} disabled={checking}
          className="btn-ghost !px-3 !py-2 !text-xs disabled:opacity-50">
          <Icon name="target" size={14} />{checking ? '检测中…' : '检测麦克风权限'}
        </button>
        <button type="button" onClick={() => { void runTrial() }} disabled={!recordingSupported()}
          className="btn-ghost !px-3 !py-2 !text-xs disabled:opacity-50">
          <Icon name="mic" size={14} />{recording ? '停止试音' : '录 3 秒试音'}
        </button>
        {env.inIframe && (
          <>
            <button type="button" onClick={() => openInNewTab()}
              className="rounded-2xl bg-brand-500 px-3 py-2 text-xs font-bold text-white">
              在新标签页打开
            </button>
            <button type="button" onClick={async () => {
              setNote(await copyPageLink() ? '链接已复制 ✅ 粘贴到新标签页即可' : `请手动复制：${pageLink()}`)
            }} className="btn-ghost !px-3 !py-2 !text-xs">
              复制页面链接
            </button>
          </>
        )}
      </div>

      {mic && (
        <p className={`mt-3 rounded-2xl p-3 text-[11px] font-semibold leading-relaxed ${mic.ok ? 'bg-mint-100/70 text-mint-600' : 'bg-coral-100/60 text-coral-600'}`}>
          {mic.ok ? '✓ ' : '✗ '}{mic.reason}
        </p>
      )}
      {note && <p className="mt-2 text-[11px] leading-relaxed text-muted">{note}</p>}
      {clip && (
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-brand-50/70 p-2">
          <audio controls src={clip.url} className="h-8 w-full max-w-[260px]" aria-label="试音回放" />
          <button type="button" aria-label="移除试音" onClick={() => {
            if (clipUrlRef.current) {
              try { URL.revokeObjectURL(clipUrlRef.current) } catch { /* 忽略 */ }
            }
            clipUrlRef.current = null
            setClip(null)
            setAssessment(null)
            setNote('')
          }} className="shrink-0 text-muted hover:text-ink"><Icon name="close" size={14} /></button>
        </div>
      )}
      {assessment && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50/70 px-3 py-2.5">
            <p className="text-[11px] font-bold text-ink">🎯 与目标档对比</p>
            <p className="text-[11px] font-black text-brand-600">
              试音 {assessment.bandRef.toFixed(1)} <span className="text-muted">/</span> 目标 {level.bandValue.toFixed(1)}
            </p>
          </div>
          <VoiceAssessmentCard assessment={assessment} level={level} defaultOpen title="试音评测" />
          <p className="text-[9px] leading-relaxed text-muted">
            已写入练习记录，可在「进度」页看到趋势；试音不是完整回答，分数只用于比较设备与节奏变化。
          </p>
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-muted">
        语音识别依赖浏览器自带服务，离线 / 内嵌环境可能不可用；此时点「录一段并转写」会同时保留录音与实时文字，没拿到文字还可用「补写文字」或自定义转写服务。所有路径都不影响文本输入。
      </p>
    </Card>
  )
}
