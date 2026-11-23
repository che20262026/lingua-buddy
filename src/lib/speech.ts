import type { Settings } from '../types'
import { detectVoiceEnvironment, unsupportedVoiceMessage } from './mobileVoice'

/**
 * 浏览器语音能力封装：朗读 / 云端听写 / 本地录音 / 录音转文字 四级降级。
 *
 * 现实环境里 SpeechRecognition 经常「构造器存在但一定失败」：
 *   - 预览面板 / iframe 未声明 allow="microphone" → not-allowed
 *   - 内嵌浏览器、离线或网络受限 → network / service-not-allowed
 * 因此不能只用「构造器在不在」判断可用性，必须做权限预检、错误码翻译，
 * 并提供 MediaRecorder 本地录音作为仍然可用的发音练习降级路径。
 *
 * v1.3 [手动模式] 重构录音生命周期：
 *   1. Start / Stop 只能由用户点 UI 触发；静音、总时长、原生 onend 都不再自动提交；
 *   2. 浏览器静音断开就续听（最多 40 次无进展），把「是否说完」的决定权留给用户；
 *   3. finish('emit') 是全模块唯一的文字提交出口，且只在 manual stop 后可达；
 *   4. 录音器（MediaRecorder）移除 maxMs 定时器，只由 handle.stop() 触发 onDone。
 * 保留：权限预检、错误码翻译、降级录音、final/interim 合并、续段 off-by-one 修复。
 */

export const speechSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

export const recognitionSupported = (): boolean => {
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export const recordingSupported = (): boolean => {
  if (typeof window === 'undefined') return false
  const w = window as unknown as {
    MediaRecorder?: unknown
    navigator?: { mediaDevices?: { getUserMedia?: unknown } }
  }
  return Boolean(w.MediaRecorder && w.navigator?.mediaDevices?.getUserMedia)
}

/** 嵌在 iframe 里时，麦克风常被外层 Permissions Policy 直接屏蔽 */
export const isInIframe = (): boolean => {
  if (typeof window === 'undefined') return false
  try { return window.self !== window.top } catch { return true }
}

export function openInNewTab(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(window.open(window.location.href, '_blank', 'noopener,noreferrer'))
  } catch { return false }
}

/** iframe 里用户看不到地址栏，提供一键复制当前应用链接 */
export async function copyPageLink(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href)
      return true
    }
  } catch { /* 权限或不支持，交给 UI 显示可手动复制的链接 */ }
  return false
}

export const pageLink = (): string =>
  typeof window === 'undefined' ? '' : window.location.href

export interface SpeechSupport {
  recognition: boolean
  recording: boolean
  secureContext: boolean
  inIframe: boolean
  canDoSomething: boolean
  hint: string
}

export function describeSpeechSupport(): SpeechSupport {
  const recognition = recognitionSupported()
  const recording = recordingSupported()
  const inIframe = isInIframe()
  const secureContext = typeof window === 'undefined'
    ? false
    : (window.isSecureContext ?? (/^https:$/.test(window.location.protocol)
      || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)))
  const canDoSomething = recognition || recording

  let hint = ''
  if (!secureContext) {
    hint = '当前页面不是安全上下文（需要 HTTPS 或 localhost），浏览器会禁用麦克风。'
  } else if (!canDoSomething) {
    hint = '当前环境既没有语音识别、也不支持本地录音；文本输入完全可用，练习不会中断。'
  } else if (inIframe) {
    hint = '页面嵌在预览面板中，麦克风权限常被外层拦截。点「在新标签页打开」并允许麦克风，识别与录音即可正常使用。'
  } else if (!recognition) {
    hint = '浏览器没有自带语音识别服务；可用「录一段并转写」录下发音，再补写文字或配置转写服务。'
  }
  return { recognition, recording, secureContext, inIframe, canDoSomething, hint }
}

/* ---------------- 朗读（speechSynthesis） ---------------- */

/**
 * 麦克风占用标记 —— TTS 与语音识别必须「逻辑互斥」。
 *
 * 只靠 echoCancellation 是不够的：移动端回声消除并不可靠，
 * AI 的声音被自己识别成用户输入是真实发生过的事故。
 * 所以这里维护一个显式状态：识别 / 录音期间禁止 speak()，
 * 且开始识别前必须先 cancel 掉正在进行的朗读。
 */
let micActive = false

export function isMicActive(): boolean {
  return micActive
}

export function setMicActive(active: boolean): void {
  micActive = active
}

/**
 * TTS 是否被允许发声：麦克风占用时一律拒绝。
 * 这是互斥的第二道闸门（第一道是调用方主动 cancel）。
 */
export function canSpeakNow(): boolean {
  return !micActive
}

/**
 * [TTS 修复] 发送消息前强制释放麦克风占用标记。
 * SpeechRecognition 的 onend 在某些异常路径（iframe 权限、network 中断、
 * 组件卸载）不会触发，模块级 micActive 会永远卡在 true，把后续所有朗读静默吞掉。
 * 发送动作本身就是明确的「我已经说完了」，此时无条件解锁是安全的。
 */
export function forceReleaseMic(): void {
  micActive = false
}

/**
 * [多语言] 指定语种是否有可用 voice（如 ru-RU）。
 * 英语场景不受影响；俄语设备未装语音包时 UI 可据此给出提示。
 */
export function hasVoiceForLang(lang: string): boolean {
  if (!speechSupported()) return false
  try {
    return window.speechSynthesis.getVoices().some((v) => (v.lang || '').replace('_', '-') === lang)
  } catch { return false }
}

export function speak(
  text: string,
  settings: Pick<Settings, 'rate' | 'accent' | 'autoSpeak'>,
  /** [多语言] 可选语种；不传 = 沿用 settings.accent（英语口音），旧调用点零改动 */
  lang?: string,
): void {
  if (!speechSupported() || !text) return
  // 麦克风正在占用时绝不发声，避免把 AI 的声音录回自己耳朵
  if (!canSpeakNow()) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const targetLang = lang ?? settings.accent
    u.lang = targetLang
    u.rate = settings.rate
    u.pitch = 1.02
    const voices = window.speechSynthesis.getVoices()
    const match = voices.find((v) => v.lang?.replace('_', '-') === targetLang)
    if (match) u.voice = match
    window.speechSynthesis.speak(u)
  } catch (err) {
    console.warn('[LinguaBuddy] 朗读失败：', err)
  }
}

export function stopSpeaking(): void {
  if (speechSupported()) {
    try { window.speechSynthesis.cancel() } catch { /* 忽略 */ }
  }
}

/* ---------------- 按句朗读引擎（可选音色 / 语速 / 音高） ---------------- */

/** 播放被浏览器拦截的原因（供 UI 给轻量「点击播放」提示，绝不弹错误弹窗） */
export type SpeakBlockReason = 'not-allowed' | 'mic-busy' | 'empty-voices' | 'unsupported'

export interface SpeakOptions {
  /** 目标音色 voiceURI；为空则由浏览器挑默认 */
  voiceURI?: string
  rate?: number
  pitch?: number
  /** 语言标签 */
  lang?: string
  /** 每句开始时的回调（用于高亮当前气泡 / 句子） */
  onSentence?: (index: number, total: number) => void
  /** 全部读完 */
  onEnd?: () => void
  /** 出错（静默失败：UI 自行决定是否提示） */
  onError?: (err: unknown) => void
  /** [TTS 修复] 播放被拦截时通知 UI，用于展示「点击播放」而非静默吞掉 */
  onBlocked?: (reason: SpeakBlockReason) => void
  /** [TTS 修复] 进入演示（Mock）模式时通知调用方，便于动态更新 UI 角标 */
  onDemo?: () => void
}

/**
 * [TTS 修复] 等待浏览器音色列表就绪。
 *
 * Chrome 首次调用 getVoices() 常返回 []，要等 voiceschanged 事件才填充。
 * 旧实现在音色为空时立刻进入「演示模式」（1 秒动画、不发声），
 * 于是「第一条 AI 回复自动朗读」被静默吞掉 —— 这正是本次 bug 的主因。
 *
 * - 已有音色 → 同步立即交付；
 * - 尚无音色 → 监听 voiceschanged，最多等 timeoutMs；
 * - 超时仍为空 → 交付空数组，由调用方降级到演示模式（保留 Mock 能力）；
 * - 返回取消函数，cancel() 后绝不再发声。
 */
export function waitForVoices(
  onReady: (voices: SpeechSynthesisVoice[]) => void,
  timeoutMs = 2500,
): () => void {
  if (!speechSupported()) { onReady([]); return () => {} }
  const synth = window.speechSynthesis
  let settled = false
  let timer: number | undefined
  const read = (): SpeechSynthesisVoice[] => {
    try { return synth.getVoices() || [] } catch { return [] }
  }
  const finish = (voices: SpeechSynthesisVoice[]) => {
    if (settled) return
    settled = true
    if (timer !== undefined) { try { window.clearTimeout(timer) } catch { /* 忽略 */ } }
    try { synth.removeEventListener?.('voiceschanged', check) } catch { /* 忽略 */ }
    onReady(voices)
  }
  const check = () => {
    const v = read()
    if (v.length) finish(v)
  }
  const initial = read()
  if (initial.length) { onReady(initial); return () => {} }  // 已就绪：同步交付
  try { synth.addEventListener?.('voiceschanged', check) } catch { /* 忽略 */ }
  // 双保险：部分浏览器不派发 voiceschanged，轮询几次也能拿到
  const poll = window.setInterval(() => { if (!settled) check() }, 200)
  timer = window.setTimeout(() => {
    try { window.clearInterval(poll) } catch { /* 忽略 */ }
    finish(read())
  }, timeoutMs)
  return () => {
    try { window.clearInterval(poll) } catch { /* 忽略 */ }
    finish([])
  }
}

export interface SpeakSession {
  /** 立刻停止整条朗读 */
  cancel: () => void
  /** 本次朗读是否处于演示（Mock）模式 */
  mock: boolean
}

let speakSeq = 0

/**
 * 按句切分依次朗读，句间留短停顿。
 *
 * 三条边界：
 *   - 麦克风占用时直接拒绝发声（互斥）；
 *   - 没有可用音色时进入「演示模式」：模拟 1 秒朗读动画后结束，绝不伪造音色列表；
 *   - 任何播放失败都静默吞掉，调用方的「重播」按钮仍然可用。
 */
export function speakWithVoice(text: string, opts: SpeakOptions = {}): SpeakSession {
  const id = ++speakSeq
  void id
  const sentences = (text || '').trim()
    ? (text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"'“])/).map((s) => s.trim()).filter(Boolean)
    : []
  const EMPTY: SpeakSession = { cancel: () => {}, mock: false }

  if (!sentences.length) {
    opts.onEnd?.()
    return EMPTY
  }
  // [TTS 修复] 麦克风占用不再静默 return，明确告知 UI
  if (!canSpeakNow()) {
    opts.onBlocked?.('mic-busy')
    opts.onEnd?.()
    return EMPTY
  }
  if (!speechSupported()) {
    opts.onBlocked?.('unsupported')
    opts.onEnd?.()
    return EMPTY
  }

  let cancelled = false
  let timers: number[] = []
  let stopWaiting: (() => void) | null = null

  const clearTimers = () => {
    for (const t of timers) { try { window.clearTimeout(t) } catch { /* 忽略 */ } }
    timers = []
  }
  const cancel = () => {
    if (cancelled) return
    cancelled = true
    clearTimers()
    stopWaiting?.()
    stopWaiting = null
    try { window.speechSynthesis.cancel() } catch { /* 忽略 */ }
  }

  /** 音色就绪后才真正开始朗读；voices 为空表示等待超时 → 演示模式 */
  const play = (voices: SpeechSynthesisVoice[]) => {
    if (cancelled) return
    if (!voices.length) {
      // 演示模式：设备不提供音色时模拟 1 秒朗读动画，绝不伪造音色列表
      opts.onDemo?.()
      opts.onBlocked?.('empty-voices')
      opts.onSentence?.(0, sentences.length)
      const t = window.setTimeout(() => { if (!cancelled) opts.onEnd?.() }, 1000)
      timers.push(t)
      return
    }

    /** [TTS 修复] 指定的 voiceURI 在当前设备不存在时回退到第一个英语音色，
     *  而不是留空让浏览器用系统默认语种念英文（也是一类静默失败）。
     *  [多语言] 若 opts.lang 明确指定非英语语种（如 ru-RU），优先匹配该语种音色，
     *  英语默认路径（无 lang 或 lang 为 en-*）一字不变。 */
    const wantLang = opts.lang
    const isNonEnglishLang = wantLang && !/^en/i.test(wantLang)
    const target = (opts.voiceURI && voices.find((v) => v.voiceURI === opts.voiceURI))
      || (isNonEnglishLang && voices.find((v) => (v.lang || '').replace('_', '-') === wantLang))
      || voices.find((v) => /^en/i.test(v.lang || ''))
      || voices[0]

    const speakAt = (index: number) => {
      if (cancelled) return
      if (index >= sentences.length) { opts.onEnd?.(); return }
      opts.onSentence?.(index, sentences.length)
      let u: SpeechSynthesisUtterance
      try { u = new SpeechSynthesisUtterance(sentences[index]) } catch (err) {
        opts.onError?.(err); opts.onEnd?.(); return
      }
      if (target) {
        u.voice = target
        if (target.lang) u.lang = target.lang
      }
      if (opts.lang) u.lang = opts.lang
      if (typeof opts.rate === 'number') u.rate = opts.rate
      if (typeof opts.pitch === 'number') u.pitch = opts.pitch
      u.onend = () => {
        if (cancelled) return
        const t = window.setTimeout(() => speakAt(index + 1), 220)
        timers.push(t)
      }
      u.onerror = (err) => {
        if (cancelled) return
        // [TTS 修复] 浏览器自动播放策略拦截（脱离用户手势的异步调用）
        const code = String((err as { error?: string })?.error || '').toLowerCase()
        if (code === 'not-allowed' || code === 'interrupted' || code === 'audio-busy') {
          opts.onBlocked?.('not-allowed')
        }
        opts.onError?.(err)
        const t = window.setTimeout(() => speakAt(index + 1), 60)
        timers.push(t)
      }
      try { window.speechSynthesis.speak(u) } catch (err) {
        // NotAllowedError 常以同步异常抛出，而不是 onerror
        if (/not-?allowed|interrupted/i.test(String(err))) opts.onBlocked?.('not-allowed')
        opts.onError?.(err)
        opts.onEnd?.()
      }
    }
    // 先掐断上一条，避免两条叠着读
    try { window.speechSynthesis.cancel() } catch { /* 忽略 */ }
    speakAt(0)
  }

  /**
   * [TTS 修复·关键行] 音色未就绪时不立刻降级，先等 voiceschanged。
   * 这就是「AI 气泡出现了却没有声音，手动点重播才响」的根治点：
   * 自动朗读发生在音色加载之前，旧实现直接静默进了演示模式。
   */
  stopWaiting = waitForVoices(play, 2500)

  return { cancel, mock: false }
}

/* ---------------- 错误码翻译与权限自检 ---------------- */

export interface SpeechErrorInfo {
  message: string
  /** record: 走录音转写；new-tab: 引导新标签页；retry: 可重试；text: 回退文本输入 */
  action: 'record' | 'new-tab' | 'retry' | 'text'
}

export function friendlySpeechError(code: string): SpeechErrorInfo {
  const c = (code || '').toLowerCase()
  if (c.includes('abort')) {
    return { message: '已停止听写。', action: 'text' }
  }
  if (c.includes('no-speech')) {
    return { message: '没听到声音。靠近麦克风、把一整句话说完再试一次；文字会在你说完后自动出现，也可以直接用文本输入。', action: 'retry' }
  }
  if (c.includes('audio-capture')) {
    return { message: '没找到可用的麦克风。请检查设备是否连接、是否被其它程序占用。', action: 'retry' }
  }
  if (c.includes('language-not-supported') || c.includes('bad-grammar')) {
    return { message: '当前口音不被识别服务支持，可在设置里切回 English (US) 再试。', action: 'retry' }
  }
  if (c.includes('network') || c.includes('service-not-allowed')) {
    return {
      message: '浏览器自带的语音识别服务连接失败（内嵌浏览器或网络受限时很常见）。可以点「重试听写」，或用「录一段并转写」把录音变成文字。',
      action: 'record',
    }
  }
  if (c.includes('not-allowed') || c.includes('permission') || c.includes('denied')) {
    return {
      message: '麦克风权限被拒绝。请在浏览器地址栏的站点设置里允许麦克风；若正在预览面板中，请在新标签页打开后重试。',
      action: 'new-tab',
    }
  }
  return {
    message: `语音识别暂时不可用（${code || '未知原因'}）。可以重试、录一段再转写，或先用文本输入继续。`,
    action: 'text',
  }
}

function friendlyMicError(name: string, fallback?: unknown): string {
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return '麦克风权限被拒绝。请在地址栏的站点设置里改为「允许」；预览面板中请在新标签页打开。'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '没有检测到麦克风设备。'
  if (name === 'NotReadableError' || name === 'TrackStartError') return '麦克风被其它程序占用，关闭后重试。'
  if (name === 'OverconstrainedError') return '当前麦克风不满足录音参数，换一个输入设备试试。'
  return `麦克风打开失败：${name || String(fallback ?? '未知错误')}`
}

/** 主动探测麦克风权限：拿到流后立刻释放，只为拿到明确结论 */
export async function checkMicrophone(): Promise<{ ok: boolean; reason: string }> {
  if (typeof window === 'undefined') return { ok: false, reason: '当前环境没有浏览器音频接口。' }
  /* [移动端兼容] 先查 HTTPS / 微信 / WebView：这些环境连 getUserMedia 都不会暴露，
     旧代码只回一句「需要 HTTPS」，用户不知道还能打字，也不知道该怎么救。 */
  const env = detectVoiceEnvironment()
  if (!env.canUseMicrophone) return { ok: false, reason: unsupportedVoiceMessage(env) }
  const md = window.navigator?.mediaDevices as MediaDevices | undefined
  if (!md?.getUserMedia) {
    return {
      ok: false,
      reason: unsupportedVoiceMessage(env),
    }
  }
  let stream: MediaStream | null = null
  try {
    stream = await md.getUserMedia({ audio: true })
    return { ok: true, reason: '麦克风可用，权限已授予 ✅' }
  } catch (err) {
    return { ok: false, reason: friendlyMicError((err as { name?: string })?.name || '', err) }
  } finally {
    try { stream?.getTracks().forEach((t) => t.stop()) } catch { /* 忽略 */ }
  }
}

/* ---------------- 语音识别（SpeechRecognition） ---------------- */

interface RecognitionAlternative { transcript: string; confidence?: number }
interface RecognitionResultLike {
  isFinal: boolean
  length: number
  0: RecognitionAlternative
}
interface RecognitionEventLike {
  resultIndex?: number
  results: ArrayLike<RecognitionResultLike>
}
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEventLike) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort?: () => void
}

export interface TranscriptMeta {
  confidence: number
  durationMs: number
  /** 含浏览器尚未确认的 interim 片段，UI 应提示用户核对 */
  partial: boolean
  /** 本次会话自动续听次数（浏览器原生 onend / 可恢复错误触发，非自动提交） */
  retries: number
  reason: 'final' | 'manual' | 'error'
}

export interface ListeningOptions {
  accent: Settings['accent']
  onResult: (text: string, meta: TranscriptMeta) => void
  /** 实时字幕：参数已是「已确认 + 待确认」的完整文本 */
  onInterim?: (text: string) => void
  onError?: (code: string, info: SpeechErrorInfo) => void
  onEnd?: () => void
  /** 状态提示：续听 / 等待用户停止 / 服务中断 */
  onStatus?: (message: string) => void
  /**
   * [手动模式·兼容字段] 保留以兼容既有调用方，但**不再产生自动停止**：
   * 静音与总时长都不再替用户结束录音，只有 handle.stop() 才提交。
   */
  timeoutMs?: number
  silenceMs?: number
  retries?: number
}

export interface ListeningHandle {
  /** 停止并保留已听到的文字（走 stop() flush，不丢最后一句） */
  stop: () => void
  /** 丢弃结果并释放麦克风（组件卸载时用） */
  cancel: () => void
}

/**
 * 把 final 片段与 interim 片段按 resultIndex 合并成一段文本。
 * 导出为纯函数便于单测：即使全部是 interim，也能拿到完整句子。
 */
export function composeTranscript(
  finals: ReadonlyArray<string | undefined | null>,
  interims: ReadonlyMap<number, string> | Record<number, string>,
  includeInterim = true,
): string {
  const interimMap = interims instanceof Map
    ? interims
    : new Map(Object.entries(interims).map(([k, v]) => [Number(k), String(v)]))
  let maxIndex = finals.length - 1
  for (const k of interimMap.keys()) if (k > maxIndex) maxIndex = k
  const parts: string[] = []
  for (let i = 0; i <= maxIndex; i++) {
    const final = (finals[i] || '').trim()
    const interim = includeInterim ? (interimMap.get(i) || '').trim() : ''
    const text = final || interim
    if (text) parts.push(text)
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * [手动模式] 不再设置会话时长硬顶，也不再随静音自动收尾。
 * 浏览器（含 Chrome / Safari）即使 continuous=true 也会在静音数秒后强制 onend，
 * 这里统一「续听」而不是「自动完成」——录音的停止只能由用户点击 UI 触发。
 * 续听连续无进展超过阈值时转为暂停态，保留已听文字，等用户点停止提交。
 */
const MAX_RESTART_WITHOUT_PROGRESS = 40

export function startListening(opts: ListeningOptions): ListeningHandle | null {
  if (!recognitionSupported()) return null
  const w = window as unknown as Record<string, new () => RecognitionLike>
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!Ctor) return null

  // 关键：自动朗读会把 AI 的声音送进麦克风，也会抢占音频设备
  stopSpeaking()

  let startedAt = Date.now() // 仅用于统计本次会话时长，不再作为自动停止依据
  const graceMs = 900 // stop() 之后留给浏览器提交 final 的窗口

  const finals: Array<string | undefined> = []
  const interims = new Map<number, string>()
  let confidenceSum = 0
  let confidenceCount = 0
  let settled = false
  let cancelled = false
  let manual = false
  let stoppedByUs = false
  let restartsWithoutProgress = 0
  let lastErrorCode = ''
  let reason: TranscriptMeta['reason'] = 'final'
  let current: RecognitionLike | null = null
  let graceTimer: number | undefined

  const clearTimers = () => {
    if (graceTimer !== undefined) { try { window.clearTimeout(graceTimer) } catch { /* 忽略 */ } }
    graceTimer = undefined
  }
  const detach = (r: RecognitionLike | null) => {
    if (!r) return
    r.onresult = null; r.onerror = null; r.onend = null
  }
  const fullText = () => composeTranscript(finals, interims, true)
  const confirmedText = () => composeTranscript(finals, interims, false)
  const releaseCurrent = (abort = true) => {
    const r = current
    current = null
    if (!r) return
    detach(r)
    if (!abort) return // 已经用 stop() 正常收尾，不再 abort 干扰浏览器
    try { if (typeof r.abort === 'function') r.abort(); else r.stop() } catch { /* 忽略 */ }
  }

  /**
   * 唯一结算出口。手动模式铁律：
   *   - 只有用户点停止（manual=true）才可能 emit 文字；
   *   - 任何自动事件（静音 / 超时 / 原生 onend / 服务错误）都不 emit；
   *     它们只能「续听」或「报错终止」，绝不替用户提交。
   */
  const finish = (mode: 'emit' | 'error', code = '') => {
    if (settled) return
    settled = true
    clearTimers()
    setMicActive(false)
    const text = fullText()
    releaseCurrent(!stoppedByUs)
    if (mode === 'emit' && text) {
      opts.onResult(text, {
        confidence: confidenceCount ? confidenceSum / confidenceCount : 0,
        durationMs: Date.now() - startedAt,
        partial: confirmedText() !== text,
        retries: restartsWithoutProgress,
        reason,
      })
    } else if (mode === 'error' || (mode === 'emit' && !text && !manual)) {
      const errCode = code || lastErrorCode || 'no-speech'
      opts.onError?.(errCode, friendlySpeechError(errCode))
    }
    // 手动停止且一句话都没听到：静默收尾，不弹「没听到声音」打扰用户
    opts.onEnd?.()
  }

  /** 用户点停止：唯一允许走 emit 的入口 */
  const gracefulStop = (why: TranscriptMeta['reason']) => {
    if (settled || cancelled) return
    manual = true
    stoppedByUs = true
    reason = why
    clearTimers()
    const r = current
    if (!r) { finish('emit'); return }
    try { r.stop() } catch { finish('emit'); return }
    // onend 通常会带着最终结果到来；不来也要在 grace 后结算，不能一直转圈
    graceTimer = window.setTimeout(() => finish('emit'), graceMs)
  }

  const onResult = (e: RecognitionEventLike) => {
    /* resultIndex 是「本批结果要写入的绝对起始下标」，results.length 是本批数量。
       循环上限必须是 from + length，而不是 length —— 后者在 resultIndex=1、length=1
       时一次都不跑（原 off-by-one），clamp 到 length-1 又会覆盖前面的跨会话文字。 */
    const from = Math.max(0, e.resultIndex ?? 0)
    for (let i = from; i < from + e.results.length; i++) {
      const r = e.results[i - from]
      const t = r?.[0]?.transcript?.trim()
      if (!t) continue
      if (r.isFinal) {
        finals[i] = t
        interims.delete(i)
        const c = r[0]?.confidence
        if (typeof c === 'number' && c > 0) { confidenceSum += c; confidenceCount++ }
      } else {
        interims.set(i, t)
      }
    }
    // resultIndex 之前的旧 interim 已被 final 取代，清掉避免重复
    for (const key of [...interims.keys()]) if (key < from) interims.delete(key)
    const text = fullText()
    if (text) opts.onInterim?.(text)
    // 有了新进展就重置「连续无进展」计数，长句中间停顿不会被误判成结束
    if (text) restartsWithoutProgress = 0
  }

  const onError = (e: { error?: string }) => {
    if (settled) return
    const code = e?.error || 'unknown'
    lastErrorCode = code
    // 用户已主动停止：无论浏览器回什么错，都先把已听到的文字交出去
    if (manual) { finish('emit'); return }

    /* 手动模式：识别错误一律不自动提交。
       - 临时抖动（no-speech / aborted）→ 续听；
       - 服务不可用（network / service-not-allowed）且有已听文字 → 保留文字，
         提示用户点停止提交，绝不丢掉已经读出的部分；
       - 服务不可用且无文字 → 报错，让上层走降级 / 补写。 */
    const transient = ['aborted', 'no-speech'].includes(code)
    if (transient && restartsWithoutProgress < MAX_RESTART_WITHOUT_PROGRESS) {
      restartsWithoutProgress++
      restart(code === 'no-speech'
        ? '还没听到声音，继续听…读完请点「停止」。'
        : '会话抖了一下，正在续听…读完请点「停止」。')
      return
    }
    if (fullText()) {
      reason = 'error'
      setMicActive(false)
      releaseCurrent()
      opts.onStatus?.(`识别中断（${code}），已保留听到的内容；点「停止」即可提交。`)
      return // 不 settle：等用户点停止时 emit 已保留文字
    }
    reason = 'error'
    finish('error', code)
  }

  const onEnd = () => {
    if (settled) return
    /* 手动模式：浏览器原生 onend（静音断开 / 服务超时）不再自动提交。
       用户点过停止 → 结算；否则 → 续听，直到用户主动停止或连续无进展到上限。 */
    if (manual) { finish('emit'); return }

    /* 一句都没听到就连续静默结束：这是「服务连不上」的典型信号（Google 被墙），
       快速失败让上层切录音，别让用户对着没反应的麦克风干等。 */
    if (!fullText()) {
      restartsWithoutProgress++
      if (restartsWithoutProgress >= 3) {
        reason = 'error'
        finish('error', 'no-speech')
        return
      }
      restart('还在听…读完请点「停止」。')
      return
    }

    /* 已经听到内容：停顿不算结束，长续听把「是否读完」交还用户 */
    if (restartsWithoutProgress < MAX_RESTART_WITHOUT_PROGRESS) {
      restartsWithoutProgress++
      restart('还在听…停顿没关系，读完请点「停止」。')
      return
    }
    reason = 'error'
    finish('error', lastErrorCode || 'no-speech')
  }

  const createRecognizer = () => {
    if (settled || cancelled) return
    let r: RecognitionLike
    try { r = new Ctor() } catch (err) {
      lastErrorCode = 'init'
      finish('error', `init: ${String(err)}`)
      return
    }
    current = r
    // 互斥：识别器一创建就占用麦克风，TTS 从这一刻起必须闭嘴
    setMicActive(true)
    r.lang = opts.accent
    // continuous=true 避免一停顿就 onend；interimResults 让实时字幕始终有内容
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = onResult
    r.onerror = onError
    r.onend = onEnd
    try { r.start() } catch (err) {
      lastErrorCode = 'start'
      finish('error', `start: ${String(err)}`)
    }
  }

  const restart = (statusMessage: string) => {
    if (settled || cancelled) return
    opts.onStatus?.(statusMessage)
    releaseCurrent()
    createRecognizer()
  }

  /* 手动模式：没有总超时、没有静音计时、没有息屏补偿——
     麦克风一直开到用户主动点「停止」为止；这几样定时器是「替用户结束」的元凶，全部移除。 */

  createRecognizer()
  if (settled) return { stop: () => {}, cancel: () => {} }

  return {
    stop: () => {
      if (settled || cancelled) return
      opts.onStatus?.('正在整理听到的文字…')
      gracefulStop('manual')
    },
    cancel: () => {
      if (settled) return
      cancelled = true
      settled = true
      clearTimers()
      setMicActive(false)
      releaseCurrent()
      // 主动丢弃：不回调 onResult / onError / onEnd
    },
  }
}

/* ---------------- 本地录音（MediaRecorder）兜底 ---------------- */

export interface RecordingResult { url: string; blob: Blob; durationMs: number }
export interface RecordingHandle {
  stop: () => void
  cancel: () => void
}

function pickMimeType(): string {
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder
  if (!MR?.isTypeSupported) return ''
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    try { if (MR.isTypeSupported(t)) return t } catch { /* 忽略 */ }
  }
  return ''
}

export async function startRecording(opts: {
  onDone: (result: RecordingResult) => void
  onError: (message: string) => void
  /** [手动模式·兼容字段] 不再产生自动停止；录音只由 handle.stop() 结束 */
  maxMs?: number
}): Promise<RecordingHandle | null> {
  if (!recordingSupported()) {
    opts.onError('当前环境不支持本地录音（需要 getUserMedia + MediaRecorder），请改用文本输入。')
    return null
  }
  stopSpeaking()

  let stream: MediaStream
  try {
    stream = await window.navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (err) {
    opts.onError(friendlyMicError((err as { name?: string })?.name || '', err))
    return null
  }

  const MR = (window as unknown as { MediaRecorder: typeof MediaRecorder }).MediaRecorder
  const mime = pickMimeType()
  let recorder: MediaRecorder
  try {
    recorder = mime ? new MR(stream, { mimeType: mime }) : new MR(stream)
  } catch (err) {
    try { stream.getTracks().forEach((t) => t.stop()) } catch { /* 忽略 */ }
    opts.onError(`录音器初始化失败：${String(err)}`)
    return null
  }

  const chunks: BlobPart[] = []
  const startedAt = Date.now()
  let done = false

  const release = () => {
    // 互斥：麦克风释放后，TTS 才被允许重新发声
    setMicActive(false)
    try { stream.getTracks().forEach((t) => t.stop()) } catch { /* 忽略 */ }
  }
  const finish = (emit: boolean) => {
    if (done) return
    done = true
    release()
    if (!emit) return
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' })
      if (!blob.size) { opts.onError('没有录到声音，请检查麦克风后重试。'); return }
      opts.onDone({ url: URL.createObjectURL(blob), blob, durationMs: Date.now() - startedAt })
    } catch (err) {
      opts.onError(`录音保存失败：${String(err)}`)
    }
  }

  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
  recorder.onerror = () => {
    if (!done) { done = true; release(); opts.onError('录音过程中出错，请重试。') }
  }
  recorder.onstop = () => finish(true)

  try { recorder.start(250) } catch (err) {
    release()
    opts.onError(`录音启动失败：${String(err)}`)
    return null
  }
  // 互斥：录音一启动就占用麦克风，TTS 必须闭嘴
  setMicActive(true)

  /* 手动模式：没有 maxMs 自动停止定时器——录音一直开到用户点「停止」。
     浏览器原生可能在后台挂起 MediaRecorder，但那属于环境故障，由 onerror 处理，
     绝不「到点自动提交」。 */

  return {
    stop: () => {
      if (done) return
      try { if (recorder.state !== 'inactive') recorder.stop(); else finish(true) }
      catch { finish(true) }
    },
    cancel: () => {
      if (done) return
      done = true // 先标记为丢弃，onstop 就不会再产出音频
      release()
      try { if (recorder.state !== 'inactive') recorder.stop() } catch { /* 忽略 */ }
    },
  }
}

/* ---------------- 双通道采集：录音 + 同时转文字 ---------------- */

export interface AsrResultLike { text?: string; error?: string }

export interface CaptureResult extends RecordingResult {
  /** 录音期间拿到的文字（浏览器听写或外部 ASR） */
  transcript: string
  /** 文字含浏览器未确认的 interim 片段 */
  transcriptPartial: boolean
  /** 转写过程的说明，UI 可直接展示 */
  transcriptNote: string
}

export interface CaptureHandle {
  stop: () => void
  cancel: () => void
}

/**
 * 一边用 MediaRecorder 留下真实音频，一边争取把声音变成文字：
 *   浏览器 SpeechRecognition 并行听写 → 没有文字时再走外部 ASR 端点 → 都没有时由 UI 引导补写。
 * 这样即使云端识别服务偶发抽风，用户也不会「只拿到一段录音、输入框空空如也」。
 */
export async function startRecordingWithTranscript(opts: {
  accent: Settings['accent']
  onDone: (result: CaptureResult) => void
  onError: (message: string) => void
  onInterim?: (text: string) => void
  onStatus?: (message: string) => void
  maxMs?: number
  /** 外部 ASR：返回 { text } 或 { error }；不传则跳过 */
  transcribe?: (blob: Blob) => Promise<AsrResultLike>
  /** 云端识别刚失败过就关掉，避免同一故障反复触发，默认 true */
  useBrowserRecognition?: boolean
}): Promise<CaptureHandle | null> {
  let transcript = ''
  let transcriptPartial = false
  let transcriptNote = ''
  let listening: ListeningHandle | null = null
  let recording: RecordingHandle | null = null
  let transcriptSettled = false
  let resolveTranscript: (() => void) | null = null
  const transcriptDone = new Promise<void>((resolve) => { resolveTranscript = resolve })
  const markTranscriptSettled = () => {
    if (transcriptSettled) return
    transcriptSettled = true
    resolveTranscript?.()
  }

  const handle = await startRecording({
    maxMs: opts.maxMs,
    onDone: async (result) => {
      // 听写可能还在 grace 窗口里提交最后一句，等它一下（最多 1 秒）
      if (listening && !transcriptSettled) {
        await Promise.race([
          transcriptDone,
          new Promise<void>((resolve) => { window.setTimeout(resolve, 1000) }),
        ])
      }
      if (!transcript.trim() && opts.transcribe) {
        opts.onStatus?.('正在用转写服务把录音变成文字…')
        try {
          const asr = await opts.transcribe(result.blob)
          if (asr?.text?.trim()) {
            transcript = asr.text.trim()
            transcriptPartial = false
            transcriptNote = '由自定义转写服务生成'
          } else {
            transcriptNote = asr?.error || '转写服务没有返回文字'
          }
        } catch (err) {
          transcriptNote = `转写服务调用失败：${String(err)}`
        }
      }
      if (!transcriptNote) {
        transcriptNote = transcript
          ? (transcriptPartial ? '浏览器实时听写（含未确认片段，请核对）' : '浏览器实时听写')
          : '本次没有拿到文字，可补写后继续'
      }
      markTranscriptSettled()
      opts.onDone({ ...result, transcript: transcript.trim(), transcriptPartial, transcriptNote })
    },
    onError: (message) => {
      listening?.cancel()
      markTranscriptSettled()
      opts.onError(message)
    },
  })
  if (!handle) return null
  recording = handle

  if (opts.useBrowserRecognition !== false && recognitionSupported()) {
    listening = startListening({
      accent: opts.accent,
      /* 手动模式：timeoutMs / silenceMs 已是兼容字段，不产生自动停止；
         并行听写只负责实时出字，收尾完全由下面的 recording.stop() 驱动。 */
      retries: 0,
      onInterim: (t) => opts.onInterim?.(t),
      onResult: (t, meta) => {
        transcript = t
        transcriptPartial = meta.partial
        markTranscriptSettled()
      },
      onError: () => markTranscriptSettled(),
      onEnd: () => markTranscriptSettled(),
      onStatus: (m) => opts.onStatus?.(m),
    })
  }
  if (!listening) markTranscriptSettled()

  return {
    stop: () => {
      // 先让听写 flush 最后一句，再停录音；onDone 会等听写结算
      listening?.stop()
      recording?.stop()
      listening = null
      recording = null
    },
    cancel: () => {
      listening?.cancel()
      recording?.cancel()
      markTranscriptSettled()
    },
  }
}


/* ---------------- [Android 录音降级] 音频 → 16-bit PCM WAV ---------------- */

/**
 * 把浏览器录下的任意格式（webm/opus/mp4）解码、降采样成单声道 16kHz
 * 的 16-bit PCM WAV —— DeepSeek ASR 只认 WAV / Ogg Opus，
 * 而 MediaRecorder 在 Android Chrome 上默认给 webm，必须转一道。
 *
 * 用 AudioContext 解码（所有现代浏览器都支持 webm/opus 解码），
 * 采样率固定 16000、单声道：120 秒约 3.8MB，稳稳落在 8MiB 上限内。
 * 纯函数式：输入 Blob，输出 WAV Blob；失败抛错由调用方降级。
 */
export async function blobToWav(blob: Blob, targetRate = 16000): Promise<Blob> {
  const Ctx = (window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }).AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) throw new Error('当前浏览器不支持音频解码')

  const ctx = new Ctx()
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    const channels = 1
    const frames = buf.length
    const pcm = new Int16Array(frames * channels)
    /* 单声道：取各声道均值；重采样用简单线性插值，够 ASR 用 */
    const left = buf.getChannelData(0)
    const right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null
    const ratio = buf.sampleRate / targetRate
    for (let i = 0; i < frames; i++) {
      const v = right ? (left[i] + right[i]) / 2 : left[i]
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
    }

    /* ratio≠1 时按目标采样率重采样 */
    const outFrames = Math.max(1, Math.floor(frames / ratio))
    const out = new Int16Array(outFrames)
    for (let i = 0; i < outFrames; i++) {
      const src = i * ratio
      const i0 = Math.floor(src)
      const frac = src - i0
      const a = pcm[i0] || 0
      const b = pcm[Math.min(frames - 1, i0 + 1)] || 0
      out[i] = Math.round(a + (b - a) * frac)
    }

    /* 手写 44 字节 WAV 头（RIFF / fmt / data），零依赖 */
    const bytes = new ArrayBuffer(44 + out.length * 2)
    const view = new DataView(bytes)
    const writeStr = (off: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + out.length * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)          // fmt chunk 长度
    view.setUint16(20, 1, true)           // PCM
    view.setUint16(22, channels, true)
    view.setUint32(24, targetRate, true)
    view.setUint32(28, targetRate * channels * 2, true)
    view.setUint16(32, channels * 2, true)
    view.setUint16(34, 16, true)          // 位深
    writeStr(36, 'data')
    view.setUint32(40, out.length * 2, true)
    new Int16Array(bytes, 44).set(out)

    return new Blob([bytes], { type: 'audio/wav' })
  } finally {
    /* 关掉 AudioContext，避免真机上一堆挂起的音频上下文耗电 */
    try { await ctx.close() } catch { /* 忽略 */ }
  }
}
