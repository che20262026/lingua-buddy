import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../types'
import type { PronunciationCompletion, PronunciationResult, WordEntry } from '../wordLabTypes'
import {
  READ_ALOUD_POLICY, feedbackText, pronunciationSupport,
  startReadAloudAttempt, toPronunciationResult, sentenceTokens,
  type PronunciationCoverage, type ReadAloudAttemptHandle,
} from '../services/pronunciation'
import { speak } from '../lib/speech'
import { Card, Chip, Icon, SectionTitle } from './ui'

/**
 * S2.5 跟读朗读（WordReadAloud）—— S2 验证页内部的后半段，不是独立页面。
 *
 * 流程：听标准音（自动 / 再听 / 慢速 / 只听单词）→ 跟读录音（≤10s，0.8s 最短，静音检测）
 *      → 克制反馈（只回答「读完整了吗」）→ 再读一次（≤2）/ 暂时跳过 / 去拼写。
 *
 * 严禁：百分制、星级、音素级准确率、「发音不标准」「你读错了」等判定性文案，
 *      以及把「我读完了」包装成识别成功（自评固定 mode='selfReported'）。
 */

export interface WordReadAloudProps {
  entry: WordEntry
  /** 默认朗读目标：S2 里含目标词的完整例句 */
  sentence: string
  settings: Settings
  /** 点击进入 S3；跳过时 skipped=true，XP 逻辑不变、不阻塞 */
  onContinue: (completion: PronunciationCompletion) => void
}

/** 目标词（含常见屈折）在例句 token 里是否命中 */
function isTargetToken(key: string, word: string): boolean {
  const w = word.toLowerCase()
  if (key === w) return true
  if (key === `${w}s` || key === `${w}es` || key === `${w}ed` || key === `${w}ing`) return true
  if (w.endsWith('e') && (key === `${w.slice(0, -1)}ing` || key === `${w.slice(0, -1)}ed`)) return true
  if (w.endsWith('y') && key === `${w.slice(0, -1)}ies`) return true
  return false
}

/** 例句逐词渲染：目标词始终高亮；有了结果后命中词绿、漏词灰。S2 例句区也复用它 */
export function HighlightSentence({ sentence, target, coverage }: {
  sentence: string
  target: string
  coverage?: PronunciationCoverage | null
}) {
  const tokens = sentenceTokens(sentence)
  return (
    <span className="en-text">
      {tokens.map((t, i) => {
        const isTarget = isTargetToken(t.key, target)
        const hit = coverage?.matched[i]
        const cls = coverage
          ? (hit ? 'bg-mint-100 text-emerald-700' : 'text-slate-400')
          : 'text-inherit'
        return (
          <span key={`${t.raw}-${i}`}>
            <span className={`inline-block rounded px-0.5 ${cls} ${isTarget ? 'font-black text-brand-700 underline decoration-2 decoration-brand-400 underline-offset-2' : ''}`}>
              {t.raw}
            </span>{' '}
          </span>
        )
      })}
    </span>
  )
}

/** 12 格音量条：Mock 模式用静态占位波形，真实录音用 RMS 电平 */
function WaveformBars({ level, mock, active }: { level: number; mock: boolean; active: boolean }) {
  const heights = mock
    ? [8, 15, 23, 12, 28, 18, 32, 14, 24, 11, 19, 9]
    : Array.from({ length: 12 }, (_, i) => {
      const base = 6 + (i % 4) * 3
      return active ? Math.min(34, base + Math.round(level * 260)) : base
    })
  return (
    <div className="flex h-9 items-center justify-center gap-1" aria-hidden="true">
      {heights.map((h, i) => (
        <span key={i} className={`w-1.5 rounded-full transition-all ${active ? 'bg-brand-500' : 'bg-brand-200'}`}
          style={{ height: `${h}px` }} />
      ))}
    </div>
  )
}

export function WordReadAloud({ entry, sentence, settings, onContinue }: WordReadAloudProps) {
  /** 默认走演示模式（应用默认 apiMode='mock'），零麦克风也能完整体验；用户可切真实识别 */
  const [mockMode, setMockMode] = useState(settings.apiMode === 'mock')
  const [expanded, setExpanded] = useState(settings.wordReadAloudExpanded)
  const [phase, setPhase] = useState<'idle' | 'listening' | 'recognizing' | 'result'>('idle')
  const [attempts, setAttempts] = useState(0)
  const attemptsRef = useRef(0)
  const [coverage, setCoverage] = useState<PronunciationCoverage | null>(null)
  const [lastResult, setLastResult] = useState<PronunciationResult | null>(null)
  const [lastMissed, setLastMissed] = useState<string[]>([])
  const [selfReported, setSelfReported] = useState(false)
  const [notice, setNotice] = useState('')
  const [degraded, setDegraded] = useState(false)
  const [level, setLevel] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(READ_ALOUD_POLICY.maxRecordingMs / 1000)
  const handleRef = useRef<ReadAloudAttemptHandle | null>(null)
  const aliveRef = useRef(true)
  const targetWord = entry.word.toLowerCase()

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false; handleRef.current?.cancel() }
  }, [])

  /** 换词 / 展开时自动播放一次例句标准音（口音与语速跟随既有设置） */
  useEffect(() => {
    if (!expanded || !settings.wordAutoPlayAudio || !sentence) return
    try { speak(sentence, settings) } catch { /* 无语音能力时静默 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentence, targetWord, expanded])

  /** 切到真实识别时先做四级环境判定，不支持就立即降级，绝不假装识别 */
  useEffect(() => {
    if (mockMode) { setDegraded(false); setNotice(''); return }
    const verdict = pronunciationSupport()
    if (!verdict.available) {
      setDegraded(true)
      setNotice(verdict.hint)
    }
  }, [mockMode])

  /** 录音倒计时（只用于显示，真正的 10s 硬上限在服务层） */
  useEffect(() => {
    if (phase !== 'listening' && phase !== 'recognizing') {
      setSecondsLeft(READ_ALOUD_POLICY.maxRecordingMs / 1000)
      return
    }
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [phase])

  const playSentence = (rate?: number) => {
    try { speak(sentence, rate === undefined ? settings : { ...settings, rate }) } catch { /* noop */ }
  }
  const playWord = () => {
    try { speak(entry.word, settings) } catch { /* noop */ }
  }

  const buildCompletion = (skipped: boolean, result: PronunciationResult | null, missed: string[]): PronunciationCompletion => ({
    word: targetWord,
    skipped,
    attempts: attemptsRef.current,
    ...(result ? { lastResult: result } : {}),
    missedWords: missed,
  })

  /** 降级 / 跳过 / 完成后进入 S3 的唯一出口 */
  const proceed = (completion: PronunciationCompletion) => {
    handleRef.current?.cancel()
    onContinue(completion)
  }

  const startAttempt = () => {
    if (degraded || phase === 'listening' || phase === 'recognizing') return
    setNotice('')
    setSelfReported(false)
    setCoverage(null)
    setLastResult(null)
    setLevel(0)
    setPhase('recognizing')
    const handle = startReadAloudAttempt({
      mode: mockMode ? 'mock' : 'live',
      sentence,
      accent: settings.accent,
      onLevel: (v) => { if (aliveRef.current) setLevel(v) },
      onStatus: (s) => { if (aliveRef.current) setPhase(s) },
    })
    handleRef.current = handle
    void handle.result.then((outcome) => {
      if (!aliveRef.current) return
      handleRef.current = null
      setPhase('idle')
      if (outcome.kind === 'result') {
        const next = attemptsRef.current + 1
        attemptsRef.current = next
        setAttempts(next)
        setCoverage(outcome.coverage)
        setLastMissed(outcome.coverage.missedWords)
        setLastResult(toPronunciationResult(
          outcome.coverage,
          outcome.coverage.mock ? 'mock' : 'recognized',
        ))
        setSelfReported(false)
        setPhase('result')
        return
      }
      // tooShort / silent 不计入重试次数
      if (outcome.kind === 'tooShort' || outcome.kind === 'silent') {
        setNotice(outcome.message)
        return
      }
      if (outcome.kind === 'degrade') {
        setDegraded(true)
        setNotice(outcome.message)
      }
    })
  }

  const stopAttempt = () => {
    handleRef.current?.stop()
    setPhase('recognizing')
  }

  /** 自评跟读：明确标注「未做识别」，绝不生成覆盖率或伪装成识别成功 */
  const finishSelfReported = () => {
    const result: PronunciationResult = {
      coverage: 0,
      missedWords: [],
      mode: 'selfReported',
      at: new Date().toISOString(),
    }
    setSelfReported(true)
    proceed(buildCompletion(false, result, []))
  }

  const skip = () => {
    proceed(buildCompletion(true, lastResult, lastMissed))
  }

  const fb = coverage ? feedbackText(coverage) : null
  const canRetry = attempts < READ_ALOUD_POLICY.maxAttempts
  const readyToSpell = Boolean(coverage)

  if (!expanded) {
    return (
      <Card className="!p-4" >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold text-ink">跟读这句（已收起）</p>
            <p className="mt-0.5 text-[10px] text-muted">随时可以展开；先听一遍标准音再决定。</p>
          </div>
          <button type="button" onClick={() => setExpanded(true)} className="btn-ghost !px-3 !py-2 !text-[11px]">
            <Icon name="mic" size={13} />展开跟读
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card testId="read-aloud">
      <SectionTitle
        title="跟读这句 · S2.5"
        subtitle="先听标准音，再把整句读出来。这里只看「读完整了吗」，不评判发音好坏。"
        right={mockMode ? <Chip tone="sun">演示模式</Chip> : <Chip tone="mint">真实识别</Chip>} />

      {/* 目标例句：目标词始终高亮；有结果后命中词绿、漏词灰 */}
      <div className="rounded-2xl border border-brand-50 bg-white/70 p-3 text-sm italic leading-relaxed">
        <HighlightSentence sentence={sentence} target={entry.word} coverage={coverage} />
      </div>

      {/* Step 1：听标准音 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => playSentence()} className="btn-ghost !px-3 !py-2 !text-[11px]">
          <Icon name="speaker" size={13} />再听一遍
        </button>
        <button type="button" onClick={() => playSentence(0.65)} className="btn-ghost !px-3 !py-2 !text-[11px]">
          <Icon name="play" size={13} />慢速播放
        </button>
        <button type="button" onClick={playWord} className="btn-ghost !px-3 !py-2 !text-[11px]">
          <Icon name="headphones" size={13} />只听目标词
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        口音跟随设置里的「{settings.accent === 'en-GB' ? '英音' : settings.accent === 'en-AU' ? '澳音' : '美音'}」；
        读的是整句，孤立单词只作为辅助听力，不作为识别目标。
      </p>

      {/* 模式切换：演示模式角标始终明确，不与真实结果混淆 */}
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
        <p className="text-[10px] leading-relaxed text-muted">
          {mockMode
            ? '当前为演示模式：结果是模拟的，不代表真实识别，仅用于体验流程。'
            : '当前为真实识别：浏览器会请求麦克风权限，识别结果只用于词级完整性比对。'}
        </p>
        <button type="button" onClick={() => setMockMode((v) => !v)}
          className="shrink-0 rounded-lg bg-white px-2 py-1.5 text-[10px] font-bold text-brand-600 shadow-soft">
          {mockMode ? '切真实识别' : '切演示模式'}
        </button>
      </div>

      {/* 麦克风权限前置说明（移动端与桌面端同一段） */}
      <p className="mt-3 rounded-xl bg-brand-50/70 px-3 py-2 text-[10px] leading-relaxed text-brand-700">
        点击麦克风后浏览器会请求麦克风权限；录音最长 10 秒，只在本地用于「这句话读完整了吗」的词级比对，
        音频不会上传、不会保存。也可以随时听标准音后自己跟读。
      </p>

      {/* Step 2：录音 / 降级自评 */}
      {!degraded ? (
        <div className={`mt-3 rounded-2xl border p-3.5 transition ${
          phase === 'listening' ? 'border-brand-300 bg-brand-50/60'
            : phase === 'recognizing' ? 'border-sun-200 bg-sun-100/40'
              : phase === 'result' ? 'border-mint-200 bg-mint-100/30' : 'border-white/80 bg-white/60'}`}>
          <WaveformBars level={level} mock={mockMode} active={phase === 'listening' || phase === 'recognizing'} />
          <p className="mt-1 text-center text-[11px] font-bold text-ink">
            {phase === 'listening' ? `正在听 · 还剩 ${secondsLeft} 秒`
              : phase === 'recognizing' ? (mockMode ? '演示模式 · 模拟识别中…' : '正在整理听到的文字…')
                : phase === 'result' ? '这一遍读完啦'
                  : (mockMode ? '静态波形占位（演示模式不调用麦克风）' : '准备好了就点麦克风')}
          </p>
          {/* 2 次之后不再提供任何录音入口，只留「去拼写」与「暂时跳过」 */}
          {canRetry && (
            <div className="mt-2.5 flex gap-2">
              {phase === 'listening' || phase === 'recognizing' ? (
                <button type="button" onClick={stopAttempt} className="btn-ghost flex-1 !py-2 !text-xs">
                  <Icon name="check" size={13} />读完了，停止
                </button>
              ) : (
                <button type="button" onClick={startAttempt}
                  className="btn-primary flex-1 !py-2 !text-xs">
                  <Icon name="mic" size={13} />{attempts === 0 ? '开始跟读' : '再读一次'}
                </button>
              )}
            </div>
          )}
          {!canRetry && (
            <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">
              已经读了两次，可以再听一遍标准音，或直接去拼写。
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-[11px] font-bold text-ink">听标准音 + 自评跟读</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">{notice}</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
            这一路没有做语音识别，也不会生成任何覆盖率；点下面按钮只是记一次自评跟读。
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={finishSelfReported} className="btn-primary flex-1 !py-2 !text-xs">
              <Icon name="check" size={13} />我读完了
            </button>
            <button type="button" onClick={skip} className="btn-ghost flex-1 !py-2 !text-xs">暂时跳过</button>
          </div>
        </div>
      )}

      {notice && !degraded && (
        <p className="mt-2.5 rounded-xl bg-sun-100/60 px-3 py-2 text-[11px] leading-relaxed text-[#a56a08]">{notice}</p>
      )}

      {/* Step 3：克制反馈 —— 完整度 / 可选静态提示 / 鼓励语 */}
      {fb && coverage && (
        <div className="mt-3 rounded-2xl bg-gradient-to-br from-mint-100/70 to-white p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-black text-emerald-700">{fb.headline}</p>
            {coverage.mock && <Chip tone="sun">演示模式结果</Chip>}
            {!coverage.mock && <Chip tone="mint">词级比对</Chip>}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink/80">{fb.missedLine}</p>
          {entry.pronunciationTip && (
            <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-[10px] leading-relaxed text-brand-700">
              词库小提示：{entry.pronunciationTip}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-800">{fb.encouragement}</p>
          <p className="mt-2 border-t border-white/80 pt-2 text-[10px] leading-relaxed text-muted">
            只比对有没有读到这些词，不看音素、不给分数、也不下「准不准」的结论。
          </p>
        </div>
      )}

      {selfReported && (
        <p className="mt-2 text-[10px] text-muted">已记为自评跟读，未做语音识别。</p>
      )}

      {/* Step 4：继续 / 跳过。完成后才出现「去拼写」 */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-brand-50 pt-3">
        {readyToSpell && (
          <button type="button" onClick={() => proceed(buildCompletion(false, lastResult, lastMissed))}
            className="btn-primary flex-1 !py-2 !text-xs">
            去拼写<Icon name="right" size={13} />
          </button>
        )}
        {(attempts >= READ_ALOUD_POLICY.maxAttempts || degraded) && (
          <button type="button" onClick={skip} className="btn-ghost flex-1 !py-2 !text-xs">暂时跳过</button>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        跳过不扣 XP，之后复习时会再遇到这个词；跟读最多 2 次，随时可以直接继续。
      </p>
    </Card>
  )
}

/** 供 WordSession 选「含目标词的完整例句」：优先命中，退化到第一条 */
export function pickReadAloudSentence(entry: WordEntry): string {
  const tokens = entry.examples.map((ex) => sentenceTokens(ex))
  const idx = tokens.findIndex((ts) => ts.some((t) => isTargetToken(t.key, entry.word)))
  return entry.examples[idx >= 0 ? idx : 0] ?? ''
}
