/**
 * S2.5 跟读朗读 —— 识别、词级比对、音量检测、降级与 Mock 服务
 *
 * 克制原则（最高优先级）：
 * 1. 反馈只回答「这句话你读完整了吗」，不回答「你读得准不准」；
 * 2. 只做「目标例句 ↔ 识别文本」的**词级集合匹配**，不做音素比对、不做置信度评分、
 *    不接任何商业发音评测 API（Azure / 讯飞 / ELSA 均不在范围内）；
 * 3. 降级时绝不伪造识别结果：自评跟读的 mode 固定为 `selfReported`，
 *    `coverage` 不参与 UI 展示；Mock 结果固定带 `mock: true` 与「演示模式」角标。
 *
 * 可替换性：`setPronunciationRecognizer()` 可整体换掉识别入口（测试 / 未来换引擎）。
 */

import type { PersistedData } from '../types'
import type {
  PronunciationCompletion, PronunciationFlagsState, PronunciationResult,
} from '../wordLabTypes'
import { DEFAULT_PRONUNCIATION_FLAGS } from '../wordLabTypes'

/* ---------------- 策略常量（纯数据，便于单测） ---------------- */

export const READ_ALOUD_POLICY = {
  /** 少于 0.8 秒的录音提示「没听清，再试一次」，且不计入重试次数 */
  minRecordingMs: 800,
  /** [手动模式·兼容保留] 原「录音最长 10 秒」上限，现不再自动停止；仅作历史语义占位 */
  maxRecordingMs: 10_000,
  /** 有效尝试最多 2 次；之后出现「暂时跳过」出口 */
  maxAttempts: 2,
  /** 全程 RMS 低于该阈值视为静音 */
  silenceRms: 0.012,
  /** Mock 演示固定模拟 1.5 秒「识别中」 */
  mockDelayMs: 1500,
  /** Mock 覆盖率区间 70%–100% */
  mockMinCoverage: 0.7,
  mockMaxCoverage: 1,
} as const

/** UI 与文案里一律不允许出现的评判性措辞（供冒烟测试逐条扫描） */
export const FORBIDDEN_FEEDBACK = [
  '准确率', '正确率', '发音得分', '发音评分', '百分制', '星级', '音素级',
  '发音不标准', '你读错了', '读得不准', '判定为', '得分：',
] as const

/* ---------------- 词级比对（纯函数） ---------------- */

export interface SentenceToken { raw: string; key: string }

/** 按空白切句，key 去掉附着标点并小写；保留 raw 供 UI 原样渲染 */
export function sentenceTokens(sentence: string): SentenceToken[] {
  return sentence.trim().split(/\s+/).filter(Boolean).map((raw) => ({
    raw,
    key: raw.replace(/[^A-Za-z'-]/g, '').toLowerCase(),
  })).filter((t) => t.key.length > 0)
}

/** 轻度词形归一：仅处理最常见的屈折，绝不引入词库或网络 */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1)
  return w
}

export interface PronunciationCoverage {
  tokens: SentenceToken[]
  /** 与 tokens 等长：该位置的词是否被识别到 */
  matched: boolean[]
  matchedCount: number
  total: number
  missedWords: string[]
  /** 0–1，仅内部用于挑文案，UI 只展示「读到了 X/Y 个词」 */
  coverage: number
  transcript: string
  /** 结果来源，UI 用它决定是否显示「演示模式」角标 */
  mock: boolean
}

/**
 * 集合匹配：识别文本里出现过的词（含轻度屈折归一）即视为「读到了」。
 * 不比较顺序、不比较音素、不比较置信度、不产生分数。
 */
export function compareCoverage(target: string, transcript: string, mock = false): PronunciationCoverage {
  const tokens = sentenceTokens(target)
  const heardRaw = sentenceTokens(transcript).map((t) => t.key)
  const heard = new Set<string>()
  for (const w of heardRaw) { heard.add(w); heard.add(stem(w)) }
  const matched = tokens.map((t) => heard.has(t.key) || heard.has(stem(t.key)))
  const missedWords = tokens.filter((_, i) => !matched[i]).map((t) => t.raw.replace(/[^A-Za-z'-]/g, ''))
  const matchedCount = matched.filter(Boolean).length
  return {
    tokens, matched, matchedCount, total: tokens.length, missedWords,
    coverage: tokens.length ? matchedCount / tokens.length : 0,
    transcript: transcript.trim(), mock,
  }
}

/** 温和、具体、不评判的三段式反馈文案 */
export function feedbackText(c: PronunciationCoverage): {
  headline: string; missedLine: string; encouragement: string
} {
  const headline = `读到了 ${c.matchedCount}/${c.total} 个词`
  if (!c.missedWords.length) {
    return {
      headline,
      missedLine: '整句都读到了，每一个词都在。',
      encouragement: '整句都读到了，语速也很自然。',
    }
  }
  const list = c.missedWords.length <= 3
    ? c.missedWords.map((w) => `\`${w}\``).join(' 和 ')
    : `${c.missedWords.slice(0, 3).map((w) => `\`${w}\``).join('、')} 等 ${c.missedWords.length} 个词`
  return {
    headline,
    missedLine: `这句话里 ${list} 没听清，可以再读一次。`,
    encouragement: '把整句话读出来本身就很棒，剩下的词下次再见。',
  }
}

/* ---------------- 发音漏读 flags（纯函数） ---------------- */

/**
 * 连续两次漏读同一词才记一条 flag。
 * `lastMissedWords` 只由有效识别（recognized / mock）推进，自评跟读与跳过都不参与判定。
 */
export function updatePronunciationFlags(
  state: PronunciationFlagsState,
  missedWords: string[],
  now = Date.now(),
): PronunciationFlagsState {
  const base: PronunciationFlagsState = state ?? structuredClone(DEFAULT_PRONUNCIATION_FLAGS)
  const previous = new Set((base.lastMissedWords || []).map((w) => w.toLowerCase()))
  const current = [...new Set(missedWords.map((w) => w.replace(/[^A-Za-z'-]/g, '').toLowerCase()).filter(Boolean))]
  const words = { ...(base.words || {}) }
  const iso = new Date(now).toISOString()
  for (const w of current) {
    if (!previous.has(w)) continue
    const old = words[w]
    words[w] = {
      word: w,
      missedCount: (old?.missedCount ?? 0) + 1,
      lastMissedAt: iso,
      note: '连续两次跟读都漏掉了这个词，复习时可以多听一遍标准音。',
    }
  }
  return { words, lastMissedWords: current, version: 1 }
}

/**
 * S4 结算后统一合并跟读结果：
 * - 只给已存在的进度条目补 3 个可选字段，不新建词条（不干扰新词额度统计）；
 * - 只写 `lingua_pronunciation_flags`，**绝不写 `lingua_word_errors`**。
 */
export function applyPronunciationResults(
  data: PersistedData,
  completions: Record<string, PronunciationCompletion>,
  now = Date.now(),
): PersistedData {
  if (!completions || !Object.keys(completions).length) return data
  const words = { ...data.wordProgress.words }
  let flags: PronunciationFlagsState = data.pronunciationFlags ?? structuredClone(DEFAULT_PRONUNCIATION_FLAGS)
  for (const [key, c] of Object.entries(completions)) {
    const p = words[key.toLowerCase()]
    if (!p) continue
    words[key.toLowerCase()] = {
      ...p,
      pronunciationAttempts: c.attempts,
      pronunciationSkipped: c.skipped,
      ...(c.lastResult ? { pronunciationLastResult: c.lastResult } : {}),
    }
    if (c.lastResult && (c.lastResult.mode === 'recognized' || c.lastResult.mode === 'mock')) {
      flags = updatePronunciationFlags(flags, c.missedWords, now)
    }
  }
  return {
    ...data,
    wordProgress: { ...data.wordProgress, words },
    pronunciationFlags: flags,
  }
}

/** 由一次有效结果生成留档对象（ISO 时间、mode 绝不伪造） */
export function toPronunciationResult(
  c: PronunciationCoverage,
  mode: PronunciationResult['mode'],
  now = Date.now(),
): PronunciationResult {
  return {
    coverage: c.coverage,
    missedWords: c.missedWords,
    mode,
    at: new Date(now).toISOString(),
  }
}

/* ---------------- 环境判定与降级分类（纯函数） ---------------- */

export interface SupportEnv {
  recognition: boolean
  onLine: boolean
  secureContext: boolean
  inIframe: boolean
}

export type SupportReason = 'ok' | 'unsupported' | 'offline' | 'insecure' | 'iframe'

export interface SupportVerdict { available: boolean; reason: SupportReason; hint: string }

export function readSupportEnv(): SupportEnv {
  if (typeof window === 'undefined') {
    return { recognition: false, onLine: false, secureContext: false, inIframe: false }
  }
  const w = window as unknown as Record<string, unknown>
  let inIframe = false
  try { inIframe = window.self !== window.top } catch { inIframe = true }
  return {
    recognition: Boolean(w.SpeechRecognition || w.webkitSpeechRecognition),
    onLine: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    secureContext: window.isSecureContext ?? true,
    inIframe,
  }
}

/** 四级降级判定：不支持 / 离线 / 非安全上下文 / 预览 iframe 内权限受限 */
export function pronunciationSupport(env: SupportEnv = readSupportEnv()): SupportVerdict {
  if (!env.recognition) {
    return {
      available: false, reason: 'unsupported',
      hint: '你的浏览器不支持语音识别，可以听标准音后自己跟读。',
    }
  }
  if (!env.onLine) {
    return {
      available: false, reason: 'offline',
      hint: '当前没有网络，浏览器自带的语音识别服务连接不上；听标准音后自己跟读就好。',
    }
  }
  if (!env.secureContext) {
    return {
      available: false, reason: 'insecure',
      hint: '当前页面不是安全上下文（需要 HTTPS 或 localhost），麦克风会被浏览器禁用。',
    }
  }
  if (env.inIframe) {
    return {
      available: false, reason: 'iframe',
      hint: '页面嵌在预览面板里，麦克风权限常被外层拦截；也可以听标准音后自己跟读。',
    }
  }
  return { available: true, reason: 'ok', hint: '' }
}

export type FailureKind = 'denied' | 'offline' | 'empty' | 'silent'

/** 把 SpeechRecognition / getUserMedia 的错误码翻译成明确降级种类 */
export function classifyFailure(code: string): FailureKind {
  const c = (code || '').toLowerCase()
  if (c.includes('not-allowed') || c.includes('permission') || c.includes('denied')
    || c.includes('securityerror') || c.includes('service-not-allowed')) return 'denied'
  if (c.includes('network') || c.includes('offline')) return 'offline'
  if (c.includes('audio-capture') || c.includes('notfound') || c.includes('no-speech')) return 'silent'
  return 'empty'
}

export const FAILURE_HINT: Record<FailureKind, string> = {
  denied: '麦克风权限被拒绝。请在浏览器地址栏的站点设置里把麦克风改为「允许」，或点「我读完了」自己跟读。',
  offline: '这次没听清（识别服务没连上），可以再试一次或直接去拼写。',
  empty: '这次没听清，可以再试一次或直接去拼写。',
  silent: '没有检测到声音，请检查麦克风。',
}

/* ---------------- 音量检测（AudioContext，纯本地） ---------------- */

export interface VolumeMeter {
  /** 取一次 RMS 音量（0–1） */
  sample: () => number
  /** 本次录音出现过的最高 RMS */
  readonly peak: number
  close: () => void
}

/** 没有 AudioContext 时返回 null：静音检测降级为「不检测」，绝不阻塞跟读 */
export function createVolumeMeter(stream: MediaStream): VolumeMeter | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: new () => AudioContext
    webkitAudioContext?: new () => AudioContext
  }
  const Ctor = w.AudioContext || w.webkitAudioContext
  if (!Ctor || !stream) return null
  try {
    const ctx = new Ctor()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    let peak = 0
    return {
      sample: () => {
        try {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / buf.length)
          if (rms > peak) peak = rms
          return rms
        } catch { return 0 }
      },
      get peak() { return peak },
      close: () => {
        try { source.disconnect(); analyser.disconnect() } catch { /* noop */ }
        try { void ctx.close() } catch { /* noop */ }
      },
    }
  } catch { return null }
}

/* ---------------- 识别器（可替换） ---------------- */

export interface RecognitionHandle { stop: () => void; cancel: () => void }
export interface RecognitionStartOptions {
  lang: string
  onResult: (transcript: string) => void
  onError: (code: string) => void
  onEnd: () => void
}
export type RecognitionStarter = (opts: RecognitionStartOptions) => RecognitionHandle | null

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }> }) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort?: () => void
}

/** 默认实现：interimResults=false、continuous=false，只取 final 文本 */
const browserRecognizer: RecognitionStarter = (opts) => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, new () => RecognitionLike>
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!Ctor) return null
  let r: RecognitionLike
  try { r = new Ctor() } catch { opts.onError('init'); return null }
  r.lang = opts.lang
  r.continuous = false
  r.interimResults = false
  r.maxAlternatives = 1
  let text = ''
  r.onresult = (e) => {
    for (let i = 0; i < e.results.length; i++) {
      const seg = e.results[i]
      if (seg?.isFinal && seg[0]?.transcript) text += ` ${seg[0].transcript}`
    }
    if (text.trim()) opts.onResult(text.trim())
  }
  r.onerror = (e) => opts.onError(e?.error || 'unknown')
  r.onend = () => opts.onEnd()
  try { r.start() } catch { opts.onError('start'); return null }
  return {
    stop: () => { try { r.stop() } catch { opts.onEnd() } },
    cancel: () => { try { r.abort?.() ?? r.stop() } catch { /* noop */ } },
  }
}

let recognizer: RecognitionStarter = browserRecognizer
export function setPronunciationRecognizer(r: RecognitionStarter): void { recognizer = r }
export function resetPronunciationRecognizer(): void { recognizer = browserRecognizer }

/* ---------------- 一次跟读尝试（Mock / 真实，统一出口） ---------------- */

export type ReadAloudOutcome =
  | { kind: 'result'; coverage: PronunciationCoverage; durationMs: number; mock: boolean }
  /** 不计入重试次数 */
  | { kind: 'tooShort' | 'silent' | 'cancelled'; message: string }
  /** 降级为自评跟读，不伪造识别结果 */
  | { kind: 'degrade'; failure: FailureKind | SupportReason; message: string }

export interface ReadAloudAttemptOptions {
  mode: 'mock' | 'live'
  sentence: string
  accent: string
  onLevel?: (level: number) => void
  onStatus?: (status: 'listening' | 'recognizing') => void
  /** 注入随机源 / 时间源便于测试 */
  random?: () => number
  now?: () => number
  maxMs?: number
  mockDelayMs?: number
}

export interface ReadAloudAttemptHandle {
  result: Promise<ReadAloudOutcome>
  /** 用户主动停止录音 */
  stop: () => void
  /** 组件卸载：丢弃结果 */
  cancel: () => void
}

/**
 * Mock 模式：静态波形 + 1.5 秒「识别中」+ 覆盖率 70%–100% 的模拟漏词，结果带 mock: true。
 * 真实模式：权限前置 → 用户点停止才结算（无时长硬顶、无静音自动结束）→ 最短时长 / 静音 / 空结果降级。
 */
export function startReadAloudAttempt(opts: ReadAloudAttemptOptions): ReadAloudAttemptHandle {
  const rand = opts.random ?? Math.random
  const clock = opts.now ?? Date.now
  const maxMs = opts.maxMs ?? READ_ALOUD_POLICY.maxRecordingMs  // [手动模式] 兼容字段，不再用于自动停止
  const startedAt = clock()
  let settled = false
  let cancelled = false
  let manualStop = false
  let transcript = ''
  let errorCode = ''
  let recognizerHandle: RecognitionHandle | null = null
  let meter: VolumeMeter | null = null
  let stream: MediaStream | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let levelTimer: ReturnType<typeof setInterval> | undefined
  let resolveResult: (o: ReadAloudOutcome) => void = () => {}
  const result = new Promise<ReadAloudOutcome>((resolve) => { resolveResult = resolve })

  const cleanup = () => {
    if (levelTimer !== undefined) clearInterval(levelTimer)
    try { recognizerHandle?.cancel() } catch { /* noop */ }
    try { meter?.close() } catch { /* noop */ }
    try { stream?.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
  }

  const finish = (outcome: ReadAloudOutcome) => {
    if (settled) return
    settled = true
    cleanup()
    resolveResult(outcome)
  }

  const settleLive = () => {
    if (cancelled) { finish({ kind: 'cancelled', message: '' }); return }
    const durationMs = clock() - startedAt
    if (durationMs < READ_ALOUD_POLICY.minRecordingMs) {
      finish({ kind: 'tooShort', message: '没听清，再试一次（这次录音太短了）。' })
      return
    }
    if (meter && meter.peak < READ_ALOUD_POLICY.silenceRms) {
      finish({ kind: 'silent', message: FAILURE_HINT.silent })
      return
    }
    if (errorCode) {
      const failure = classifyFailure(errorCode)
      finish({ kind: 'degrade', failure, message: FAILURE_HINT[failure] })
      return
    }
    if (!transcript.trim()) {
      finish({ kind: 'degrade', failure: 'empty', message: FAILURE_HINT.empty })
      return
    }
    opts.onStatus?.('recognizing')
    finish({
      kind: 'result',
      coverage: compareCoverage(opts.sentence, transcript, false),
      durationMs,
      mock: false,
    })
  }

  /* ---- Mock：不碰麦克风、不发网络、不伪造真实识别 ---- */
  if (opts.mode === 'mock') {
    opts.onStatus?.('recognizing')
    timer = setTimeout(() => {
      if (cancelled) { finish({ kind: 'cancelled', message: '' }); return }
      const tokens = sentenceTokens(opts.sentence)
      const target = READ_ALOUD_POLICY.mockMinCoverage
        + rand() * (READ_ALOUD_POLICY.mockMaxCoverage - READ_ALOUD_POLICY.mockMinCoverage)
      const missCount = Math.min(tokens.length, Math.round(tokens.length * (1 - target)))
      const order = tokens.map((_, i) => i).sort(() => rand() - 0.5)
      const drop = new Set(order.slice(0, missCount))
      const heard = tokens.filter((_, i) => !drop.has(i)).map((t) => t.raw).join(' ')
      finish({
        kind: 'result',
        coverage: compareCoverage(opts.sentence, heard, true),
        durationMs: opts.mockDelayMs ?? READ_ALOUD_POLICY.mockDelayMs,
        mock: true,
      })
    }, opts.mockDelayMs ?? READ_ALOUD_POLICY.mockDelayMs)
    return {
      result,
      stop: () => { manualStop = true },
      cancel: () => { cancelled = true; finish({ kind: 'cancelled', message: '' }) },
    }
  }

  /* ---- 真实模式：四级降级判定（不支持 / 离线 / 不安全 / iframe） ---- */
  const verdict = pronunciationSupport()
  if (!verdict.available) {
    finish({ kind: 'degrade', failure: verdict.reason, message: verdict.hint })
    return { result, stop: () => {}, cancel: () => {} }
  }

  const md = typeof window !== 'undefined'
    ? (window.navigator?.mediaDevices as MediaDevices | undefined)
    : undefined

  const begin = async () => {
    // 麦克风权限前置：拿一个流同时用于音量检测；失败立即降级，不假装识别
    if (md?.getUserMedia) {
      try {
        stream = await md.getUserMedia({ audio: true })
        meter = createVolumeMeter(stream)
        if (meter) {
          levelTimer = setInterval(() => { opts.onLevel?.(meter?.sample() ?? 0) }, 90)
        }
      } catch (err) {
        const name = (err as { name?: string })?.name || ''
        finish({
          kind: 'degrade', failure: 'denied',
          message: classifyFailure(name) === 'denied' ? FAILURE_HINT.denied : FAILURE_HINT.silent,
        })
        return
      }
    }
    opts.onStatus?.('listening')
    recognizerHandle = recognizer({
      lang: opts.accent,
      onResult: (t) => { transcript = t },
      onError: (code) => { errorCode = code },
      onEnd: () => { if (!settled && manualStop) settleLive() },
    })
    if (!recognizerHandle) {
      finish({ kind: 'degrade', failure: 'unsupported', message: '你的浏览器不支持语音识别，可以听标准音后自己跟读。' })
      return
    }
    /* 手动模式：没有 setTimeout 时长硬顶。
       只有用户点 stop() 才 settleLive()；浏览器原生 onEnd 不再自动结算。 */
  }
  void begin()

  return {
    result,
    stop: () => {
      if (settled) return
      manualStop = true
      try { recognizerHandle?.stop() } catch { /* noop */ }
      // 浏览器可能不触发 onend，兜底直接结算
      setTimeout(() => settleLive(), 120)
      settleLive()
    },
    cancel: () => { cancelled = true; finish({ kind: 'cancelled', message: '' }) },
  }
}
