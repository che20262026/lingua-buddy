import type { VoiceAssessment, VoiceMetrics, VoiceSummary } from '../types'
import type { IeltsLevel } from '../data/ieltsLevels'
import { normalizeBand } from '../data/ieltsLevels'
import { clamp, uid } from '../lib/utils'

/* ================================================================
 * VoiceAssessmentAgent —— CoachAgent 的语音臂
 *
 * 纯浏览器、无后端、无密钥：把 MediaRecorder 录到的音频用 Web Audio
 * 解码成 PCM，测出可观测的声学特征，再按当前雅思档位换算成
 * FC / PR 两项「练习参考分」和具体、温和、可执行的建议。
 *
 * 诚实边界（务必保留）：
 *   - 声学特征能测「节奏、停顿、响度、语调起伏、可懂度代理」；
 *     不能测音素准确度、重音位置、连读与口音。
 *   - 浏览器 SpeechRecognition 多数不返回 confidence；缺失时不臆造。
 *   - 麦克风 AGC / 环境噪声会影响绝对值，趋势比单次分数更可信。
 *   - 这不是、也不冒充官方雅思评分。
 * ================================================================ */

export const VOICE_DISCLAIMER =
  '这是基于录音声学特征的练习参考，不是官方雅思评分：浏览器无法判断音素准确度、重音位置与口音。建议在同一设备、相近环境下比较趋势，最终以真人老师或专业语音评测为准。'

const EPS = 1e-9
const WAVE_POINTS = 64
const PITCH_POINTS = 32
/** 存档上限：波形与曲线较短，仍限制条数避免 localStorage 膨胀 */
export const MAX_VOICE_REPORTS = 40

export interface AcousticFeatures extends VoiceMetrics {
  waveform: number[]
  pitchCurve: number[]
}

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0
  const i = clamp(Math.floor((sortedAsc.length - 1) * p), 0, sortedAsc.length - 1)
  return sortedAsc[Math.round(i)] ?? 0
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** 简易降采样 + 盒式低通，用于基频估计 */
function downsample(src: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate <= toRate) return src
  const step = fromRate / toRate
  const out = new Float32Array(Math.floor(src.length / step))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * step)
    const end = Math.min(src.length, Math.floor((i + 1) * step))
    let sum = 0
    for (let j = start; j < end; j++) sum += src[j] ?? 0
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

/** 归一化自相关求基频；返回 Hz，无法判定返回 0 */
function estimateF0(frame: Float32Array, rate: number): number {
  let energy = 0
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i]
  if (energy / frame.length < 1e-6) return 0

  const minLag = Math.max(16, Math.floor(rate / 350))
  const maxLag = Math.min(Math.floor(frame.length / 2), Math.ceil(rate / 70))
  let bestLag = 0
  let bestScore = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0
    let den = 0
    for (let i = 0; i < frame.length - lag; i++) {
      const a = frame[i] ?? 0
      const b = frame[i + lag] ?? 0
      num += a * b
      den += a * a + b * b
    }
    const score = (2 * num) / (den + EPS)
    if (score > bestScore) { bestScore = score; bestLag = lag }
  }
  if (!bestLag || bestScore < 0.42) return 0
  const f0 = rate / bestLag
  return f0 >= 70 && f0 <= 350 ? f0 : 0
}

/**
 * 从 PCM 提取声学特征。纯函数，可直接喂合成波形做单测。
 * samples 为单声道浮点样本（-1..1），sampleRate 为采样率。
 */
export function analyzePcm(samples: Float32Array | number[], sampleRate: number): AcousticFeatures | null {
  const src = samples instanceof Float32Array ? samples : Float32Array.from(samples)
  const rate = sampleRate > 0 ? sampleRate : 44100
  if (src.length < rate * 0.12) return null

  const frameSize = Math.max(128, Math.round(rate * 0.02)) // 20ms
  const frameMs = (frameSize / rate) * 1000
  const frames = Math.floor(src.length / frameSize)
  if (frames < 5) return null

  const db: number[] = []
  const peak: number[] = []
  for (let f = 0; f < frames; f++) {
    let sum = 0
    let mx = 0
    const off = f * frameSize
    for (let i = 0; i < frameSize; i++) {
      const v = src[off + i] ?? 0
      sum += v * v
      const a = Math.abs(v)
      if (a > mx) mx = a
    }
    const rms = Math.sqrt(sum / frameSize)
    db.push(20 * Math.log10(rms + EPS))
    peak.push(mx)
  }

  const sortedDb = [...db].sort((a, b) => a - b)
  const noiseFloor = percentile(sortedDb, 0.15)
  const peakDb = percentile(sortedDb, 0.98)
  const threshold = Math.max(noiseFloor + 7, peakDb - 34, -60)
  const audible = peakDb > -58
  const voiced = db.map((d) => audible && d > threshold)

  let first = voiced.indexOf(true)
  let last = voiced.lastIndexOf(true)
  if (first < 0) { first = 0; last = frames - 1 }
  const voicedCount = voiced.filter(Boolean).length
  const voicedMs = voicedCount * frameMs
  const durationMs = (src.length / rate) * 1000
  const silenceRatio = clamp(1 - voicedCount / Math.max(1, frames), 0, 1)

  // 只统计首尾发声之间的「内部停顿」，开头的准备时间不算卡壳
  let pauseCount = 0
  let longestPauseMs = 0
  let run = 0
  for (let f = first; f <= last; f++) {
    if (voiced[f]) {
      if (run * frameMs >= 220) { pauseCount++; longestPauseMs = Math.max(longestPauseMs, run * frameMs) }
      run = 0
    } else run++
  }

  // 音节峰：平滑能量包络上的局部极大值，最小间隔 110ms
  const smooth = db.map((_, i) => mean(db.slice(Math.max(0, i - 1), Math.min(db.length, i + 2))))
  let syllablePeaks = 0
  let lastPeak = -Infinity
  const minGapFrames = Math.max(2, Math.round(110 / frameMs))
  for (let i = 1; i < smooth.length - 1; i++) {
    if (voiced[i] && (smooth[i] ?? 0) > (smooth[i - 1] ?? 0) && (smooth[i] ?? 0) >= (smooth[i + 1] ?? 0)
      && i - lastPeak >= minGapFrames) {
      syllablePeaks++
      lastPeak = i
    }
  }

  // 高频能量占比：清晰度/辅音可听度的粗略代理
  let hpEnergy = 0
  let rawEnergy = 0
  let prev = 0
  const stride = Math.max(1, Math.floor(rate / 16000))
  for (let i = 0; i < src.length; i += stride) {
    const v = src[i] ?? 0
    const hp = v - 0.97 * prev
    prev = v
    hpEnergy += hp * hp
    rawEnergy += v * v
  }
  const hfRatio = rawEnergy > 0 ? hpEnergy / rawEnergy : 0
  const snr = Math.max(0, peakDb - noiseFloor)
  const clarity = clamp(22 + hfRatio * 160 + snr * 1.05, 0, 100)

  // 基频曲线：降到 8kHz，仅在有声帧上取最多 120 帧，控制计算量
  const ds = downsample(src, rate, 8000)
  const pf = 512
  const hop = 256
  const voicedFrameIdx: number[] = []
  for (let off = 0; off + pf <= ds.length; off += hop) {
    let e = 0
    for (let i = 0; i < pf; i++) { const v = ds[off + i] ?? 0; e += v * v }
    if (e / pf > 1e-6) voicedFrameIdx.push(off)
  }
  const cap = 120
  const strideFrames = Math.max(1, Math.ceil(voicedFrameIdx.length / cap))
  const f0s: number[] = []
  for (let k = 0; k < voicedFrameIdx.length; k += strideFrames) {
    const off = voicedFrameIdx[k] ?? 0
    const f0 = estimateF0(ds.subarray(off, off + pf), 8000)
    if (f0) f0s.push(f0)
  }
  const semitones = f0s.map((f) => 12 * Math.log2(f / 100))
  const sortedSt = [...semitones].sort((a, b) => a - b)
  const pitchRangeSemitones = semitones.length >= 4
    ? clamp(percentile(sortedSt, 0.9) - percentile(sortedSt, 0.1), 0, 24) : 0
  const deltas = semitones.slice(1).map((s, i) => Math.abs(s - (semitones[i] ?? s)))
  const pitchStability = semitones.length >= 4 ? clamp(1 - mean(deltas) / 3, 0, 1) : 0
  const energyVariation = voicedCount > 3 ? std(db.filter((_, i) => voiced[i])) : 0

  // 64 点波形缩略
  const waveform: number[] = []
  const wBucket = Math.max(1, Math.ceil(peak.length / WAVE_POINTS))
  const wMax = Math.max(...peak, EPS)
  for (let i = 0; i < WAVE_POINTS; i++) {
    let m = 0
    for (let j = i * wBucket; j < Math.min(peak.length, (i + 1) * wBucket); j++) m = Math.max(m, peak[j] ?? 0)
    waveform.push(clamp(m / wMax, 0, 1))
  }
  // 32 点音高曲线（Hz，0 表示未检出）
  const pitchCurve: number[] = []
  const pBucket = Math.max(1, Math.ceil(f0s.length / PITCH_POINTS))
  for (let i = 0; i < PITCH_POINTS; i++) {
    const slice = f0s.slice(i * pBucket, (i + 1) * pBucket)
    pitchCurve.push(slice.length ? Math.round(mean(slice)) : 0)
  }

  const estimatedWords = syllablePeaks / 1.5
  const speechRateWpm = clamp(estimatedWords / Math.max(voicedMs, 400) * 60000, 0, 300)

  return {
    durationMs, voicedMs, volumeDb: mean(db.filter((_, i) => voiced[i])) || noiseFloor,
    peakDb, silenceRatio, pauseCount, longestPauseMs,
    speechRateWpm, pitchRangeSemitones, pitchStability, clarity,
    energyVariation, syllablePeaks, measured: true,
    waveform: waveform.map((v) => Math.round(v * 100) / 100),
    pitchCurve,
  }
}

/** 只有识别文本、没有音频时的降级特征：只保留时长与语速，其余明确标注未测 */
export function transcriptMetrics(transcript: string, durationMs: number): AcousticFeatures {
  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0
  const safeMs = clamp(durationMs, 600, 120000)
  return {
    durationMs: safeMs, voicedMs: safeMs, volumeDb: 0, peakDb: 0,
    silenceRatio: 0, pauseCount: 0, longestPauseMs: 0,
    speechRateWpm: clamp(words / (safeMs / 60000), 0, 300),
    pitchRangeSemitones: 0, pitchStability: 0, clarity: 0,
    energyVariation: 0, syllablePeaks: 0, measured: false,
    waveform: [], pitchCurve: [],
  }
}

export interface VoiceAssessInput {
  features?: AcousticFeatures | null
  level: IeltsLevel
  source: 'recording' | 'recognition'
  transcript?: string
  durationMs?: number
  recognitionConfidence?: number
  targetWords?: string[]
  sessionId?: string
  turn?: number
  scenarioTitle?: string
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** 把 0–100 的 raw 分映射到练习参考 Band（3.5 起，最高 8.7） */
function rawToBand(raw: number, measured: boolean): number {
  const b = 3.5 + (clamp(raw, 0, 100) / 100) * 5.2
  return normalizeBand(measured ? b : Math.min(b, 6.5))
}

/**
 * 综合评分与建议。纯函数：给定相同特征与档位，结果稳定可复现。
 */
export function assessVoice(input: VoiceAssessInput): VoiceAssessment {
  const { level, source, transcript } = input
  const confidence = typeof input.recognitionConfidence === 'number' && input.recognitionConfidence > 0
    ? clamp(input.recognitionConfidence, 0, 1) * 100 : null
  const f = input.features ?? transcriptMetrics(transcript || '', input.durationMs ?? 3000)
  const m = f
  const measured = m.measured

  // 有识别文本时用真实词数重算语速，比音节估算更准
  const words = transcript?.trim() ? transcript.trim().split(/\s+/).length : m.syllablePeaks / 1.5
  const wpm = transcript?.trim()
    ? clamp(words / (Math.max(m.voicedMs, 500) / 60000), 0, 300)
    : m.speechRateWpm

  const idealWpm = 100 + level.dialogue.userTargetLength * 2  // 各档 110–148
  // 既无识别文本也无实测音频时，语速不可知：给中性分，不给「0 wpm」的误导性建议
  const wpmKnown = Boolean(transcript?.trim()) || m.speechRateWpm > 0
  const pace = wpmKnown ? clamp(100 - Math.abs(wpm - idealWpm) * 0.55, 0, 100) : 60
  const pause = clamp(100 - Math.max(0, m.pauseCount - 1) * 9
    - Math.max(0, m.longestPauseMs - 800) / 25, 0, 100)
  const continuity = clamp(100 - Math.max(0, m.silenceRatio - 0.42) * 150, 0, 100)
  const intonation = measured ? clamp(28 + m.pitchRangeSemitones * 9 + m.pitchStability * 28, 0, 100) : null
  const clarity = measured ? clamp(m.clarity, 0, 100) : null
  const stress = measured ? clamp(42 + m.energyVariation * 9, 0, 100) : null
  const intelligibility = confidence !== null
    ? confidence * 0.55 + (clarity ?? 65) * 0.45
    : clarity !== null ? clarity * 0.75 + pace * 0.25 : 55

  const fcRaw = measured ? pace * 0.42 + pause * 0.3 + continuity * 0.28 : pace * 0.6 + 32
  const prRaw = measured
    ? intelligibility * 0.4 + (clarity ?? 60) * 0.24 + (intonation ?? 55) * 0.21 + (stress ?? 55) * 0.15
    : intelligibility * 0.55 + 38

  const dimensions = {
    fc: rawToBand(fcRaw, measured),
    pr: rawToBand(prRaw, measured),
  }
  const bandRef = normalizeBand((dimensions.fc + dimensions.pr) / 2)
  const overall = Math.round((fcRaw + prRaw) / 2)

  /* ---- 亮点与建议：具体、温和、可执行 ---- */
  const strengths: string[] = []
  const suggestions: string[] = []

  const hits = (input.targetWords || []).filter((t) =>
    transcript?.toLowerCase().includes(t.toLowerCase().replace(/[^a-z'\s-]/g, '').trim()))
  if (hits.length) strengths.push(`把目标词 ${hits.slice(0, 3).join(' / ')} 真的说出来了，词汇在嘴里落地了 🌱`)
  if (wpmKnown && wpm >= idealWpm - 22 && wpm <= idealWpm + 22) {
    strengths.push(`语速约 ${Math.round(wpm)} wpm，落在 ${level.band} 档舒服的区间里`)
  }
  if (measured && (m.pitchRangeSemitones >= 5 || (m.pitchRangeSemitones >= 3.5 && m.pitchStability > 0.6))) {
    strengths.push('语调有起伏，听感不平板，重音变化正在帮听众抓重点')
  }
  if (measured && m.pauseCount <= 1 && m.longestPauseMs < 900) {
    strengths.push('整句几乎一气说完，没有长卡顿，连贯性很稳')
  }
  if (measured && m.clarity >= 70) strengths.push('声音清晰，辅音与词尾听得很清楚')
  if (!strengths.length) strengths.push('愿意开口把这一句说完，本身就很棒 🌱')

  if (!wpmKnown) {
    suggestions.push('这次没能读到可识别的词，也没有音频波形，因此语速与语调未测。换个安静环境、说一句完整的英文再录一次即可。')
  } else if (wpm < idealWpm - 22) {
    suggestions.push(`语速约 ${Math.round(wpm)} wpm，比本档建议的 ${idealWpm - 20}–${idealWpm + 20} 慢一些。先跟读一遍 AI 的朗读，再按那个节奏自己说一次。`)
  } else if (wpm > idealWpm + 26) {
    suggestions.push(`语速约 ${Math.round(wpm)} wpm 偏快。试着在逗号处停半拍，把每个词的词尾（尤其 -s / -ed）说完整，清晰度会立刻上来。`)
  }
  if (measured && m.pauseCount >= 2) {
    suggestions.push(`中间有 ${m.pauseCount} 次较长停顿（最长 ${(m.longestPauseMs / 1000).toFixed(1)} 秒）。卡壳时用 "Let me think…" 或 "What I mean is…" 把空白填上，比沉默更自然。`)
  } else if (measured && m.longestPauseMs >= 1100) {
    suggestions.push(`有一处 ${(m.longestPauseMs / 1000).toFixed(1)} 秒的长停顿。下次准备一个「垫场句」，例如 "That's an interesting question."，给自己争取思考时间。`)
  }
  if (measured && m.pitchRangeSemitones > 0 && m.pitchRangeSemitones < 3) {
    suggestions.push('这一句语调偏平。挑出最重要的那个词，把它说得更高、更亮一点，比如 "I\'d **go** for the fresh apples."')
  }
  if (measured && m.volumeDb < -42) {
    suggestions.push('录到的声音偏轻。靠近麦克风 10–15 cm、关掉旁边的风扇或音乐，再录一次会更容易听清。')
  }
  if (measured && m.clarity < 48) {
    suggestions.push('环境噪声或吞音让清晰度打了折扣。换个安静的地方，刻意把词尾辅音说完，别急着赶下一句。')
  }
  if (measured && m.silenceRatio > 0.62) {
    suggestions.push('有效发声占比偏低，可能是说完后忘了停止录音。下次说完就点一下麦克风，评分会更贴近真实表现。')
  }
  if (!measured) {
    suggestions.push('这次只拿到识别文本、没有音频，语调与清晰度未测。想看完整的发音点评，点「发音评测」录一段即可。')
  }
  if (!suggestions.length) {
    suggestions.push(`保持这个状态，往 ${level.band} 档再走一步：${level.dimensions.pr}`)
  }

  return {
    id: uid('voice'), createdAt: Date.now(),
    sessionId: input.sessionId, turn: input.turn, scenarioTitle: input.scenarioTitle,
    levelId: level.id, source,
    transcript: transcript || undefined,
    recognitionConfidence: confidence !== null ? round1(confidence / 100) : undefined,
    metrics: {
      durationMs: Math.round(m.durationMs), voicedMs: Math.round(m.voicedMs),
      volumeDb: round1(m.volumeDb), peakDb: round1(m.peakDb),
      silenceRatio: round1(m.silenceRatio * 100) / 100,
      pauseCount: m.pauseCount, longestPauseMs: Math.round(m.longestPauseMs),
      speechRateWpm: Math.round(wpm), pitchRangeSemitones: round1(m.pitchRangeSemitones),
      pitchStability: round1(m.pitchStability * 100) / 100,
      clarity: Math.round(m.clarity), energyVariation: round1(m.energyVariation),
      syllablePeaks: m.syllablePeaks, measured: m.measured,
    },
    dimensions, bandRef, overall,
    strengths: strengths.slice(0, 3), suggestions: suggestions.slice(0, 3),
    waveform: m.waveform, pitchCurve: m.pitchCurve,
    disclaimer: VOICE_DISCLAIMER,
  }
}

/** 解码录音 Blob 并评估；环境不支持 Web Audio 时返回 null，由调用方降级 */
export async function assessRecording(
  blob: Blob,
  input: Omit<VoiceAssessInput, 'features' | 'durationMs'>,
): Promise<VoiceAssessment | null> {
  if (typeof window === 'undefined') return null
  const W = window as unknown as {
    AudioContext?: new () => AudioContextLike
    webkitAudioContext?: new () => AudioContextLike
  }
  const Ctor = W.AudioContext || W.webkitAudioContext
  if (!Ctor || typeof blob.arrayBuffer !== 'function') return null

  let ctx: AudioContextLike | null = null
  try {
    ctx = new Ctor()
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
    const channels = Math.min(2, buffer.numberOfChannels)
    const len = buffer.length
    const merged = new Float32Array(len)
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c)
      for (let i = 0; i < len; i++) merged[i] = (merged[i] ?? 0) + (data[i] ?? 0) / channels
    }
    const features = analyzePcm(merged, buffer.sampleRate)
    if (!features) return assessVoice({ ...input, durationMs: 1000 })
    return assessVoice({ ...input, features })
  } catch (err) {
    console.warn('[LinguaBuddy] 音频解码失败，改用时长估算：', err)
    return null
  } finally {
    try { void ctx?.close() } catch { /* 忽略 */ }
  }
}

interface AudioContextLike {
  decodeAudioData: (data: ArrayBuffer) => Promise<{
    numberOfChannels: number
    length: number
    sampleRate: number
    getChannelData: (c: number) => Float32Array
  }>
  close: () => Promise<void> | void
}

/** 汇聚一段/全部语音记录，供报告、复习、进度页使用 */
export function summarizeVoice(items: VoiceAssessment[], level: IeltsLevel): VoiceSummary | undefined {
  if (!items.length) return undefined
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt)
  const measured = sorted.filter((v) => v.metrics.measured)
  const avgBand = mean(sorted.map((v) => v.bandRef))
  const half = Math.floor(sorted.length / 2)
  const trend = half > 0 && sorted.length >= 2
    ? mean(sorted.slice(half).map((v) => v.bandRef)) - mean(sorted.slice(0, half).map((v) => v.bandRef))
    : 0

  const freq = new Map<string, number>()
  sorted.forEach((v) => v.suggestions.forEach((s) => freq.set(s, (freq.get(s) || 0) + 1)))
  const repeated = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
  const strengths = [...new Set(sorted.flatMap((v) => v.strengths))].slice(-3)
  const suggestions = [...new Set([...repeated, ...sorted.flatMap((v) => v.suggestions)])].slice(0, 3)

  return {
    count: sorted.length,
    avgBand: round1(avgBand),
    avgWpm: Math.round(mean(sorted.map((v) => v.metrics.speechRateWpm))),
    avgPitchRange: round1(mean(measured.map((v) => v.metrics.pitchRangeSemitones))),
    avgClarity: Math.round(mean(measured.map((v) => v.metrics.clarity))),
    trend: round1(trend),
    focus: suggestions[0] || level.dimensions.pr,
    strengths, suggestions,
    latest: sorted[sorted.length - 1],
    measuredCount: measured.length,
  }
}

/** 写入存档前裁剪：只保留最近 N 条，波形与曲线取整压缩 */
export function trimVoiceReports(items: VoiceAssessment[]): VoiceAssessment[] {
  return items.slice(-MAX_VOICE_REPORTS)
}

/** 供 UI 显示的中文化指标名与目标区间 */
export const VOICE_METRIC_LABELS = {
  wpm: '语速',
  pause: '停顿',
  pitch: '语调起伏',
  clarity: '清晰度',
  volume: '响度',
} as const
