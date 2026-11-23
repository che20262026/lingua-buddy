import { useEffect, useRef, useState } from 'react'
import type { Settings, VoiceAssessment } from '../types'
import type { PronunciationCompletion, WordEntry } from '../wordLabTypes'
import { ieltsLevelByCefr } from '../data/ieltsLevels'
import { assessRecording, assessVoice, transcriptMetrics, VOICE_METRIC_LABELS } from '../services/voiceAssessor'
import { hasVoiceForLang, recordingSupported, speak, startRecording, checkMicrophone, type RecordingHandle } from '../lib/speech'
import { useApp } from '../store/useAppStore'
import { HighlightSentence } from './WordReadAloud'
import { Card, Chip, Icon, SectionTitle } from './ui'

/**
 * [多语言·俄语专项] 独立 S2.5：跟读 + 前端录音评分。
 *
 * 设计约束（与英语 S2.5 WordReadAloud 彻底分离，互不影响）：
 * - 只展示俄语原句（带重音 exampleRu + 中文 exampleCn）、播放原音、录音、评分结果；
 *   **绝不显示变格表**——那是 S2 验证页的事。
 * - 评分纯前端：MediaRecorder 录音 → assessRecording（Web Audio 解码成 PCM → analyzePcm
 *   提取能量/语速/停顿/自相关 F0）→ assessVoice 出参考分。不请求任何后端接口。
 * - 分数是「练习参考分」，不是官方雅思 Band；免责声明来自 voiceAssessor 的 VOICE_DISCLAIMER。
 * - 无麦/拒绝权限/环境不支持：隐藏录音按钮，给「我已大声朗读，直接进入下一步」降级出口，
 *   既不卡住学习流，也不伪造评分。
 * - 手动模式：录音只由 handle.stop()（用户点停止）结束，没有任何静音/时长自动停止定时器。
 * - 完成回调沿用 handleReadAloudDone → commit(...,'spell')，五步 S3 逻辑零改动。
 */

export interface PronunciationStepProps {
  entry: WordEntry
  settings: Settings
  /** 默认朗读目标：含目标词的完整例句（俄语走 examples[0] 带重音写法） */
  sentence: string
  onContinue: (completion: PronunciationCompletion) => void
}

type Phase = 'idle' | 'recording' | 'scoring' | 'result' | 'degraded'

/** 语速参考档：以例句词数 / 实际发声时长换算的 wpm 归类 */
function paceLabel(wpm: number): { text: string; tone: 'mint' | 'sun' | 'coral' } {
  if (wpm > 0 && wpm < 110) return { text: '偏慢', tone: 'sun' }
  if (wpm > 170) return { text: '偏快', tone: 'coral' }
  return { text: '适中', tone: 'mint' }
}

export function PronunciationStep({ entry, settings, sentence, onContinue }: PronunciationStepProps) {
  const app = useApp()
  const ruSentence = entry.examples[0] || sentence
  const cnSentence = entry.examples[1] || ''
  const speechLang = 'ru-RU'
  const ruVoiceMissing = !hasVoiceForLang(speechLang)
  const level = ieltsLevelByCefr(entry.cefr)

  const [phase, setPhase] = useState<Phase>(() => (recordingSupported() ? 'idle' : 'degraded'))
  const [seconds, setSeconds] = useState(0)
  const [notice, setNotice] = useState('')
  const [assessment, setAssessment] = useState<VoiceAssessment | null>(null)
  const [attempts, setAttempts] = useState(0)
  const handleRef = useRef<RecordingHandle | null>(null)
  const aliveRef = useRef(true)
  const [degradedReason, setDegradedReason] = useState('')

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false; handleRef.current?.cancel() }
  }, [])

  /** 手录正计时（只用于显示；结束只由用户点停止触发，没有自动硬顶） */
  useEffect(() => {
    if (phase !== 'recording') { setSeconds(0); return }
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [phase])

  const playOriginal = () => {
    if (ruVoiceMissing) {
      app.notify('当前设备未安装俄语语音包，无法朗读原音；你仍可录音跟读。')
      return
    }
    try { speak(ruSentence, settings, speechLang) } catch { /* 无语音能力时静默 */ }
  }

  const startRec = async () => {
    if (phase === 'recording' || phase === 'scoring') return
    setNotice('')
    setAssessment(null)
    setPhase('recording')
    const handle = await startRecording({
      onError: (message) => {
        if (!aliveRef.current) return
        handleRef.current = null
        setNotice(message)
        // 用户拒绝权限 / 环境失效：切到降级出口，不阻塞学习流
        void checkMicrophone().then((verdict) => {
          if (!aliveRef.current) return
          if (!verdict.ok) {
            setDegradedReason(verdict.reason)
            setPhase('degraded')
          } else {
            setPhase('idle')
          }
        })
      },
      onDone: ({ blob, durationMs }) => {
        if (!aliveRef.current) return
        handleRef.current = null
        setPhase('scoring')
        void scoreBlob(blob, durationMs)
      },
    })
    handleRef.current = handle
    if (!handle) setPhase((p) => (p === 'recording' ? 'idle' : p))
  }

  /** 纯前端评分：Web Audio 解码 → PCM 特征 → 参考分。失败时用文本降级点评，绝不空手。 */
  const scoreBlob = async (blob: Blob, durationMs: number) => {
    const transcript = ruSentence // 用户跟读的目标句，用作语速词数参考（无后端 ASR）
    const measured = await assessRecording(blob, {
      level, source: 'recording', transcript, targetWords: [entry.word],
      scenarioTitle: `俄语跟读 · ${entry.wordAccented || entry.word}`,
    })
    const result = measured || assessVoice({
      level, source: 'recording', transcript,
      features: transcriptMetrics(transcript, durationMs), targetWords: [entry.word],
    })
    if (!aliveRef.current) return
    setAssessment(result)
    setAttempts((n) => n + 1)
    setPhase('result')
    app.notify('录音评分已生成，看看语速与流畅度参考 🎙')
  }

  const stopRec = () => {
    handleRef.current?.stop()
  }

  const retry = () => {
    setAssessment(null)
    setNotice('')
    setPhase('idle')
  }

  const proceed = () => {
    handleRef.current?.cancel()
    const result: PronunciationCompletion = {
      word: entry.word.toLowerCase(),
      skipped: false,
      attempts,
      ...(assessment ? {
        lastResult: {
          coverage: Math.min(1, assessment.overall / 100),
          missedWords: [],
          mode: 'mock' as const,
          at: new Date().toISOString(),
        },
      } : {}),
      missedWords: [],
    }
    onContinue(result)
  }

  const proceedDegraded = () => {
    onContinue({
      word: entry.word.toLowerCase(), skipped: true, attempts: 0, missedWords: [],
    })
  }

  const metrics = assessment?.metrics
  const pace = paceLabel(metrics?.speechRateWpm ?? 0)

  return (
    <Card testId="pronunciation-step" className="!p-5">
      <SectionTitle
        title="跟读评分 · S2.5"
        subtitle="先听原音，再大声跟读整句；评分只在本地计算，不会上传录音。"
        right={<Chip tone="brand">俄语 · ru-RU</Chip>} />

      {/* 顶部原句区：带重音俄语 + 中文翻译，用户看得见原句才跟读 */}
      <div data-testid="ru-readaloud-source" className="mt-3 rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
        <p className="text-[10px] font-black tracking-widest text-brand-600">跟读原句 · 请看清再读</p>
        <p data-testid="ru-readaloud-ru" className="en-text mt-1.5 text-base font-bold leading-relaxed text-ink">
          <HighlightSentence sentence={ruSentence} target={entry.word} />
        </p>
        <p data-testid="ru-readaloud-cn" className="mt-1 text-xs font-medium leading-relaxed text-muted">
          {cnSentence}
        </p>
      </div>

      {/* 播放原音：无 ru-RU 语音包时给 toast，不静默 */}
      <button type="button" onClick={playOriginal} data-testid="ru-play-original"
        className="btn-ghost mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 !py-2.5 !text-sm">
        <Icon name="speaker" size={17} />播放原音
        {ruVoiceMissing && <Chip tone="sun" className="!text-[10px]">未装语音包</Chip>}
      </button>

      {notice && (
        <p data-testid="ru-record-notice" className="mt-2 rounded-xl bg-sun-100/60 px-3 py-2 text-[11px] leading-relaxed text-[#a56a08]">
          {notice}
        </p>
      )}

      {/* 录音 / 降级出口 */}
      {phase === 'degraded' ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-ink">无法使用麦克风</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            {degradedReason || '当前浏览器不支持录音或未获得麦克风权限。'}
            你仍可先听原音、自己大声朗读一遍，然后直接继续。
          </p>
          <button type="button" onClick={proceedDegraded} data-testid="ru-readaloud-degraded"
            className="btn-primary mt-3 min-h-[48px] w-full !py-2.5 !text-sm">
            我已大声朗读，直接进入下一步<Icon name="right" size={15} />
          </button>
        </div>
      ) : (
        <div className={`mt-4 rounded-2xl border p-4 transition ${
          phase === 'recording' ? 'border-coral-300 bg-coral-100/30'
            : phase === 'scoring' ? 'border-sun-200 bg-sun-100/40'
              : phase === 'result' ? 'border-mint-200 bg-mint-100/30' : 'border-white/80 bg-white/60'}`}>
          <div className="flex items-center justify-center gap-2">
            {phase === 'recording' ? (
              <>
                <span data-testid="ru-rec-dot" className="h-3 w-3 animate-pulse rounded-full bg-coral-500" aria-hidden="true" />
                <p className="text-sm font-bold text-ink">录音中 · 已录 {seconds} 秒，读完点停止</p>
              </>
            ) : phase === 'scoring' ? (
              <p className="text-sm font-bold text-ink">正在本地分析声学特征…</p>
            ) : phase === 'result' ? (
              <p className="text-sm font-bold text-ink">这一遍读完啦</p>
            ) : (
              <p className="text-sm font-bold text-ink">准备好了就点开始录音</p>
            )}
          </div>

          {phase === 'recording' ? (
            <button type="button" onClick={stopRec} data-testid="ru-rec-stop"
              className="pron-mic-live btn-ghost mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 !py-2.5 !text-sm !border-coral-400 !text-coral-600">
              <Icon name="check" size={16} />录音中 · 读完点击停止
            </button>
          ) : phase !== 'scoring' && (
            <button type="button" onClick={startRec} data-testid="ru-rec-start"
              className="btn-primary mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 !py-2.5 !text-sm">
              <Icon name="mic" size={16} />{attempts > 0 ? '再录一次' : '开始录音'}
            </button>
          )}
        </div>
      )}

      {/* 评分结果卡：语速 / 流畅度 / 参考分，三项维度齐全 */}
      {phase === 'result' && assessment && (
        <div data-testid="ru-score-card" className="mt-3 rounded-2xl bg-gradient-to-br from-mint-100/70 to-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-emerald-700">录音参考评分</p>
            <Chip tone="sun">本地参考 · 非官方评分</Chip>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div data-testid="ru-score-pace" className="rounded-xl bg-white/80 p-2.5 text-center">
              <p className="text-[10px] font-bold text-muted">{VOICE_METRIC_LABELS.wpm}</p>
              <p className="mt-1 text-sm font-black text-ink">{pace.text}</p>
              <p className="mt-0.5 text-[10px] text-muted">{Math.round(metrics?.speechRateWpm ?? 0)} 词/分</p>
            </div>
            <div data-testid="ru-score-fluency" className="rounded-xl bg-white/80 p-2.5 text-center">
              <p className="text-[10px] font-bold text-muted">流畅度</p>
              <p className="mt-1 text-sm font-black text-ink">{metrics && metrics.longestPauseMs > 1200 ? '有停顿' : '连贯'}</p>
              <p className="mt-0.5 text-[10px] text-muted">最长停顿 {((metrics?.longestPauseMs ?? 0) / 1000).toFixed(1)}s</p>
            </div>
            <div data-testid="ru-score-overall" className="rounded-xl bg-white/80 p-2.5 text-center">
              <p className="text-[10px] font-bold text-muted">参考评分</p>
              <p className="mt-1 text-lg font-black text-brand-600">{assessment.overall}</p>
              <p className="mt-0.5 text-[10px] text-muted">/ 100 · 参考 {assessment.bandRef}</p>
            </div>
          </div>
          {assessment.strengths.length > 0 && (
            <p className="mt-2.5 rounded-xl bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-ink/80">
              亮点：{assessment.strengths.join('；')}
            </p>
          )}
          {assessment.suggestions.length > 0 && (
            <p className="mt-1.5 rounded-xl bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-ink/80">
              建议：{assessment.suggestions.join('；')}
            </p>
          )}
          <p className="mt-2 border-t border-white/80 pt-2 text-[10px] leading-relaxed text-muted">
            {assessment.disclaimer}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={retry} data-testid="ru-score-retry"
              className="btn-ghost flex min-h-[48px] flex-1 items-center justify-center gap-1.5 !py-2.5 !text-sm">
              <Icon name="refresh" size={15} />重录
            </button>
            <button type="button" onClick={proceed} data-testid="ru-score-next"
              className="btn-primary flex min-h-[48px] flex-1 items-center justify-center gap-1.5 !py-2.5 !text-sm">
              完成，下一步<Icon name="right" size={15} />
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
