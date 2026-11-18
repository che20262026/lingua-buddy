import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { recognitionSupported, speak, speechSupported, startListening, type ListeningHandle } from '../lib/speech'
import { pronunciationSupport } from '../services/pronunciation'
import {
  judgeFailureMessage, judgePronunciation,
  type PronunciationVerdict,
} from '../services/pronunciationJudge'
import {
  PRONUNCIATION_CHALLENGERS, challengerFor, groupChallengersByCategory,
  type PronunciationChallenger,
} from '../data/wordDecks/pronunciationChallengers'
import { XP_RULES } from '../growthTypes'
import { todayKey } from '../lib/storage'
import { Card, Chip, Icon, SectionTitle } from './ui'
import type { WordEntry } from '../wordLabTypes'

/**
 * [AI 发音评测] 词卡上的发音练习面板
 * ------------------------------------------------------------------
 * 它是五步闭环之外的**辅助面板**，不是新的一步：
 *   - 不参与 draft.step 状态机，不推进 / 不回退 S1→S5；
 *   - 不写入 wordSessionDraft，不影响结算页的 XP 明细；
 *   - 自己的 XP 走统一入口 awardXp()，事件 id 稳定 → 天然幂等。
 *
 * 四条能力：
 *   1. 口音切换（en-US / en-GB / en-AU）→ SpeechSynthesis 按 lang 播放标准音；
 *   2. 录音 → SpeechRecognition 取回文本（不支持时降级为文字输入）；
 *   3. 后端评测 → 得分环 + AI 建议；
 *   4. 易错词库标签页 → 18 个中国学习者高频读错的词，优先推送练习。
 *
 * 防刷双闸门：
 *   - 前端：录音按钮防抖（进行中禁用 + 冷却倒计时），连点也只会发一次；
 *   - 后端：netlify/functions/evaluate.ts 复用 IP 限流，超额直接 429。
 */

/** 三种口音：lang 标签直接喂给 SpeechSynthesis 与 SpeechRecognition */
const ACCENTS = [
  { value: 'en-US', label: '美音', hint: 'American' },
  { value: 'en-GB', label: '英音', hint: 'British' },
  { value: 'en-AU', label: '澳音', hint: 'Australian' },
] as const

type Accent = (typeof ACCENTS)[number]['value']

/** 录音冷却：一次评测结束后 X 秒内不允许再次录音（防连点） */
const COOLDOWN_MS = 3000
/** [手动模式] 兼容保留：录音不再按 8 秒硬顶自动停止，由用户点「读完停下」提交 */
const RECORD_TIMEOUT_MS = 8000

type Phase = 'idle' | 'listening' | 'judging' | 'result'

interface JudgeTarget {
  word: string
  phonetic?: string
  meaningZh?: string
  tip?: string
  /** 来自易错词库时带上原始条目 */
  challenger?: PronunciationChallenger
}

/* ---------------- 得分环（专属组件，不污染通用 ui.tsx） ---------------- */

type ScoreTone = 'excellent' | 'good' | 'poor'

/** 分数 → 语气：≥90 绿 / ≥70 黄 / <70 红 */
export function scoreTone(score: number): ScoreTone {
  if (score >= 90) return 'excellent'
  if (score >= 70) return 'good'
  return 'poor'
}

const TONE_STYLE: Record<ScoreTone, { from: string; to: string; text: string; label: string }> = {
  excellent: { from: '#2bbd85', to: '#5fd6a3', text: '#189a6b', label: '发音到位' },
  good: { from: '#f5ac2b', to: '#ffc95c', text: '#a56a08', label: '接近标准' },
  poor: { from: '#e13b42', to: '#f2555a', text: '#c22f38', label: '还需打磨' },
}

/**
 * 炫酷得分环：渐变描边 + 外圈刻度 + 中心大数字。
 * 动效走 CSS transition（strokeDashoffset），并用 motion-reduce 关掉。
 */
function ScoreRing({ score, size = 124 }: { score: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, score))
  const tone = scoreTone(pct)
  const style = TONE_STYLE[tone]
  const stroke = 10
  const r = (size - stroke * 2 - 14) / 2
  const c = 2 * Math.PI * r
  const center = size / 2
  const gid = `pron-ring-${tone}`
  /** 刻度：每 12° 一个，共 30 根，每 5 根加长 */
  const ticks = Array.from({ length: 30 }, (_, i) => i * 12)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`发音得分 ${pct} 分`}>
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={style.from} />
            <stop offset="100%" stopColor={style.to} />
          </linearGradient>
        </defs>
        <g opacity={0.35}>
          {ticks.map((deg) => {
            const rad = (deg * Math.PI) / 180
            const outer = center + size / 2 - 2
            const inner = outer - (deg % 60 === 0 ? 7 : 4)
            return (
              <line
                key={deg}
                x1={center + Math.cos(rad) * inner} y1={center + Math.sin(rad) * inner}
                x2={center + Math.cos(rad) * outer} y2={center + Math.sin(rad) * outer}
                stroke={style.from} strokeWidth={deg % 60 === 0 ? 2 : 1.2} strokeLinecap="round"
              />
            )
          })}
        </g>
        <circle cx={center} cy={center} r={r} fill="none" stroke="#e5ecff" strokeWidth={stroke} />
        <circle
          cx={center} cy={center} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          className="transition-all duration-700 motion-reduce:transition-none"
          style={{ filter: `drop-shadow(0 3px 10px ${style.from}55)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-3xl font-black leading-none" style={{ color: style.text }}>{pct}</span>
        <span className="mt-1 text-[10px] font-bold" style={{ color: style.text }}>{style.label}</span>
      </div>
    </div>
  )
}

/* ---------------- 主组件 ---------------- */

export interface PronunciationLabProps {
  /** 当前会话词；为空时「当前词」标签页为空态 */
  entry?: WordEntry | null
  /** 初始口音（跟随全局设置） */
  defaultAccent?: Accent
}

export function PronunciationLab({ entry, defaultAccent = 'en-US' }: PronunciationLabProps) {
  const { awardXp, notify } = useApp()
  const [tab, setTab] = useState<'current' | 'challengers'>('current')
  const [accent, setAccent] = useState<Accent>(defaultAccent)
  /** 易错词库里选中的条目（仅 challengers 标签页使用） */
  const [selected, setSelected] = useState<JudgeTarget | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [verdict, setVerdict] = useState<PronunciationVerdict | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState<{ message: string; detail: string } | null>(null)
  const [manualText, setManualText] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const listenRef = useRef<ListeningHandle | null>(null)
  const aliveRef = useRef(true)

  /** 会话词派生的评测目标（纯派生，不进 state，避免两处真相） */
  const entryTarget: JudgeTarget | null = useMemo(() => (entry ? {
    word: entry.word,
    phonetic: entry.phonetic,
    meaningZh: entry.meaningZh,
    tip: entry.pronunciationTip,
  } : null), [entry])

  /** 当前评测目标：随标签页切换 */
  const active = tab === 'current' ? entryTarget : selected

  /** 事件回调里要用最新目标，用 ref 避免闭包读到旧值 */
  const activeRef = useRef<JudgeTarget | null>(null)
  activeRef.current = active

  /* 卸载时释放麦克风；否则录音指示灯会一直亮着 */
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      listenRef.current?.cancel()
      listenRef.current = null
    }
  }, [])

  /* 冷却倒计时 */
  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => window.clearInterval(id)
  }, [cooldown])

  const groups = useMemo(() => groupChallengersByCategory(), [])

  /** 会话词命中易错词库时，在面板顶部优先推送提示 */
  const sessionChallenger = useMemo(() => (entry ? challengerFor(entry.word) : undefined), [entry])

  /** 切换目标：清空上一轮的评测结果（分数、建议、错误都不该跨词残留） */
  const selectChallenger = useCallback((c: PronunciationChallenger) => {
    setSelected({
      word: c.word, phonetic: c.phonetic, meaningZh: c.meaningZh, tip: c.tip, challenger: c,
    })
    setTranscript('')
    setVerdict(null)
    setError(null)
    setNotice('')
    setManualText('')
    setPhase('idle')
    setCooldown(0)
  }, [])

  /** 播放标准音：用当前口音的 lang 标签驱动 SpeechSynthesis */
  const playStandard = useCallback((word: string) => {
    if (!speechSupported()) {
      setNotice('当前浏览器不支持语音合成，没法播放标准音；可以看音标自己读。')
      return
    }
    try {
      /* accent 决定 lang 标签（en-US / en-GB / en-AU），这是「换口音」的核心 */
      speak(word, { rate: 1, accent, autoSpeak: true })
    } catch {
      setNotice('标准音播放失败，可以看音标自己读。')
    }
  }, [accent])

  /**
   * 发放 XP：走统一入口 awardXp()，事件 id 稳定 → 同一词同一天不重复入账。
   * ≥80 分给 10 XP，低于 80 分给 2 XP 鼓励。
   */
  const awardForScore = useCallback((score: number, word: string) => {
    const passed = score >= 80
    const today = todayKey()
    const key = word.toLowerCase()
    const result = awardXp({
      id: `wordlab:${today}:${key}:pronunciation_${passed ? 'pass' : 'try'}`,
      source: 'wordlab',
      action: passed ? 'pronunciation_pass' : 'pronunciation_try',
      amount: passed ? XP_RULES.pronunciation_pass : XP_RULES.pronunciation_try,
      meta: { sessionKey: key, score },
    })
    if (result.granted) {
      notify(`发音评测 ${score} 分，+${result.amount} XP 🎯`)
    } else if (result.reason === 'duplicate') {
      notify('这个词今天已经评过分了，继续练不会重复加分。')
    }
  }, [awardXp, notify])

  /** 发起评测：录音文本与手输文本走同一条路径 */
  const runJudge = useCallback(async (spoken: string, word: string) => {
    if (!aliveRef.current) return
    setPhase('judging')
    setError(null)
    setNotice('')
    try {
      const v = await judgePronunciation({ targetWord: word, userSpokenText: spoken })
      if (!aliveRef.current) return
      setVerdict(v)
      setPhase('result')
      awardForScore(v.score, word)
    } catch (err) {
      if (!aliveRef.current) return
      const reason = (err as { reason?: 'rate-limited' | 'unavailable' | 'invalid' | 'aborted' })?.reason ?? 'unavailable'
      const detail = (err as { detail?: string })?.detail ?? ''
      setError({ message: judgeFailureMessage(reason), detail })
      setPhase('idle')
    } finally {
      if (aliveRef.current) setCooldown(Math.ceil(COOLDOWN_MS / 1000))
    }
  }, [awardForScore])

  /** 开始录音 */
  const startRecording = useCallback(() => {
    if (phase !== 'idle' || cooldown > 0) return
    const current = activeRef.current
    if (!current) return
    setNotice('')
    setError(null)
    setTranscript('')
    setVerdict(null)

    if (!recognitionSupported()) {
      setNotice('你的浏览器不支持语音识别，请用下面的输入框把你读的词打出来，考官照样能评。')
      return
    }
    const support = pronunciationSupport()
    if (!support.available) {
      setNotice(`${support.hint} 也可以用下面的输入框直接打字评测。`)
      return
    }

    setPhase('listening')
    const handle = startListening({
      accent,
      /* 手动模式：不设静音 / 时长自动收尾，读完必须点「读完停下」才打分 */
      retries: 0,
      onStatus: (msg) => { if (aliveRef.current && msg) setNotice(msg) },
      onResult: (text) => {
        if (!aliveRef.current) return
        setTranscript(text)
        void runJudge(text, current.word)
      },
      onError: (_code, info) => {
        if (!aliveRef.current) return
        setNotice(`${info.message} 也可以用下面的输入框直接打字评测。`)
        setPhase('idle')
        setCooldown(Math.ceil(COOLDOWN_MS / 1000))
      },
      onEnd: () => {
        if (!aliveRef.current) return
        /* 没识别到文本时回到 idle；有文本时状态已切到 judging */
        setPhase((p) => (p === 'listening' ? 'idle' : p))
      },
    })
    if (!handle) {
      setNotice('语音识别启动失败，请用下面的输入框直接打字评测。')
      setPhase('idle')
      return
    }
    listenRef.current = handle
  }, [accent, cooldown, phase, runJudge])

  /** 停止录音（保留已听到的文字） */
  const stopRecording = useCallback(() => {
    listenRef.current?.stop()
  }, [])

  /** 手输文本评测 */
  const submitManual = useCallback(() => {
    const current = activeRef.current
    const text = manualText.trim()
    if (!current || !text) return
    if (phase !== 'idle' || cooldown > 0) return
    setTranscript(text)
    void runJudge(text, current.word)
  }, [cooldown, manualText, phase, runJudge])

  /* ---------- 渲染 ---------- */

  const busy = phase === 'listening' || phase === 'judging'
  const hasEntry = Boolean(entry)

  return (
    <Card testId="pronunciation-lab">
      <SectionTitle
        title="AI 发音评测"
        subtitle="听标准音 → 录音 → 考官打分。分数只评价发音本身，不评价拼写。"
        right={<Chip tone={sessionChallenger ? 'coral' : 'brand'}>{sessionChallenger ? '易错词' : '发音练习'}</Chip>}
      />

      {/* 两个标签页：当前词 / 易错词库 */}
      <div className="mb-3 flex gap-1.5">
        <button type="button" onClick={() => setTab('current')}
          disabled={!hasEntry}
          className={`flex-1 rounded-xl px-2 py-2 text-[11px] font-bold disabled:opacity-40 ${
            tab === 'current' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>
          当前词
        </button>
        <button type="button" onClick={() => setTab('challengers')}
          className={`flex-1 rounded-xl px-2 py-2 text-[11px] font-bold ${
            tab === 'challengers' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>
          易错词库 · {PRONUNCIATION_CHALLENGERS.length}
        </button>
      </div>

      {/* 口音选择：两个标签页共用（lang 同时驱动朗读与识别） */}
      <div className="flex items-center gap-2">
        <label htmlFor="pron-accent" className="shrink-0 text-[11px] font-bold text-muted">口音</label>
        <select id="pron-accent" className="field flex-1" value={accent}
          onChange={(e) => setAccent(e.target.value as Accent)}>
          {ACCENTS.map((a) => (
            <option key={a.value} value={a.value}>{a.label} · {a.hint}（{a.value}）</option>
          ))}
        </select>
      </div>

      {tab === 'challengers' ? (
        /* ---------- 易错词库：按错误类型分组 ---------- */
        <div className="mt-3 space-y-3" data-testid="pronunciation-challengers">
          <p className="rounded-xl bg-coral-100/60 px-3 py-2 text-[11px] leading-relaxed text-coral-600">
            这 {PRONUNCIATION_CHALLENGERS.length} 个词是中国学习者最容易读错的高频词。
            点任意一个即可优先练习：先听标准音，再对着麦克风读一遍。
          </p>
          {groups.map((g) => (
            <div key={g.category}>
              <p className="mb-1.5 text-[10px] font-black tracking-widest text-muted">
                {g.label} · {g.items.length}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((c) => (
                  <button key={c.word} type="button"
                    onClick={() => selectChallenger(c)}
                    className={`rounded-xl border px-2.5 py-1.5 text-left transition ${
                      selected?.word === c.word
                        ? 'border-brand-400 bg-brand-50'
                        : 'border-white/80 bg-white/70 hover:border-brand-200'}`}>
                    <span className="en-text block text-[12px] font-bold text-ink">{c.word}</span>
                    <span className="block text-[9px] text-muted">{c.phonetic}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {selected && (
            <p className="rounded-xl bg-brand-50/70 px-3 py-2 text-[11px] leading-relaxed text-brand-700">
              已选中 <span className="en-text font-bold">{selected.word}</span>，在下方开始评测。
            </p>
          )}
        </div>
      ) : (
        <>
          {/* 目标词 */}
          {active ? (
            <div className="mt-3 rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/50 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="en-text font-display text-2xl font-black text-ink">{active.word}</p>
                  {active.phonetic && <p className="mt-0.5 text-[11px] text-muted">{active.phonetic}</p>}
                  {active.meaningZh && <p className="mt-0.5 text-[11px] text-muted">{active.meaningZh}</p>}
                </div>
                <button type="button" onClick={() => playStandard(active.word)}
                  aria-label="试听标准音"
                  className="rounded-xl bg-white p-2 text-brand-600 shadow-soft transition hover:bg-brand-50">
                  <Icon name="speaker" size={18} />
                </button>
              </div>
              {active.tip && (
                <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-brand-700">
                  提示：{active.tip}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-[11px] leading-relaxed text-muted">
              {hasEntry
                ? '点击词卡上的「发音练习」开始评测当前词。'
                : '当前没有会话词。去「易错词库」挑一个词开始练习吧。'}
            </p>
          )}
        </>
      )}

      {/* ---------- 评测区（两个标签页共用） ---------- */}
      {active && (
        <>
          {/* 录音区 */}
          <div className="mt-3 rounded-2xl border border-white/80 bg-white/60 p-3.5">
            <div className="flex items-center gap-2">
              {phase === 'listening' ? (
                <button type="button" onClick={stopRecording} data-testid="pron-stop"
                  className="pron-mic-live btn-primary flex-1 !py-2.5 !text-xs !bg-coral-500">
                  <Icon name="check" size={13} />录音中 · 读完点击停止
                </button>
              ) : (
                <button type="button" onClick={startRecording}
                  disabled={busy || cooldown > 0}
                  className="btn-primary flex-1 !py-2.5 !text-xs disabled:opacity-40">
                  <Icon name="mic" size={13} />
                  {phase === 'judging' ? '考官正在打分…' : cooldown > 0 ? `冷却中 ${cooldown}s` : '点击开始录音'}
                </button>
              )}
              <button type="button" onClick={() => playStandard(active.word)}
                className="btn-ghost !px-3 !py-2.5 !text-[11px]">
                <Icon name="speaker" size={13} />试听
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              点击开始录音（按钮变红并跳动），读完再点「停止」才提交打分；中途停顿不会自动结束。音频不会上传、不会保存。
            </p>
          </div>

          {/* 识别到的文本 */}
          {transcript && (
            <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-bold text-muted">识别到的内容</p>
              <p className="en-text mt-0.5 text-sm italic leading-relaxed text-ink">{transcript}</p>
            </div>
          )}

          {/* 文字输入兜底：浏览器不支持识别时也能评测 */}
          <div className="mt-3">
            <input className="field en-text" value={manualText} onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitManual() }}
              placeholder="也可以直接输入你读的词（评测按拼写比对）" />
            <button type="button" onClick={submitManual}
              disabled={!manualText.trim() || busy || cooldown > 0}
              className="btn-ghost mt-2 w-full !py-2 !text-[11px] disabled:opacity-40">
              用这段文字评测
            </button>
          </div>
        </>
      )}

      {notice && (
        <p className="mt-3 rounded-xl bg-sun-100/70 px-3 py-2 text-[11px] leading-relaxed text-[#8a5b08]">{notice}</p>
      )}

      {error && (
        <div className="mt-3 rounded-2xl border border-danger-200 bg-danger-50 px-3 py-2.5" role="alert">
          <p className="text-[12px] font-bold text-danger-600">{error.message}</p>
          {error.detail && (
            <p className="mt-1 font-mono text-[10px] text-muted">诊断：{error.detail}</p>
          )}
          <button type="button" onClick={startRecording}
            disabled={busy || cooldown > 0}
            className="btn-ghost mt-2 w-full !py-2 !text-[11px] disabled:opacity-40">
            <Icon name="refresh" size={13} />再试一次
          </button>
        </div>
      )}

      {/* 评测结果 */}
      {verdict && phase === 'result' && (
        <div className="mt-3 rounded-2xl border border-white/80 bg-gradient-to-br from-white to-brand-50/60 p-4">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <ScoreRing score={verdict.score} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black tracking-[0.16em] text-brand-600">考官点评</p>
              <p className="mt-1 text-[12px] font-bold leading-relaxed text-ink">
                {verdict.suggestion || (verdict.score >= 80 ? '发音很到位，保持这个感觉！' : '多听几遍标准音，再试一次。')}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {verdict.score >= 80
                  ? `得分达到 80 分线，已发放 ${XP_RULES.pronunciation_pass} XP。`
                  : `还没到 80 分线，发放 ${XP_RULES.pronunciation_try} XP 鼓励你再练。`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone={verdict.score >= 90 ? 'mint' : verdict.score >= 70 ? 'sun' : 'coral'}>
                  {verdict.score} 分
                </Chip>
                {verdict.provider && <Chip tone="slate">{verdict.provider}</Chip>}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
