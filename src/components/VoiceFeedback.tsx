import type { ReactNode } from 'react'
import type { IeltsLevel } from '../data/ieltsLevels'
import { bandProgress } from '../data/ieltsLevels'
import { cn, formatDate } from '../lib/utils'
import type { VoiceAssessment, VoiceSummary } from '../types'
import { Card, Chip, Icon, ProgressBar } from './ui'

/* ================================================================
 * 语音评判展示层 —— 对话页 / 报告页 / 复习页 / 进度页 / 自检页共用
 * 原则：所有分数都标注为「练习参考」，未测指标明确留白，不臆造。
 * ================================================================ */

const idealWpm = (level: IeltsLevel) => 100 + level.dialogue.userTargetLength * 2

/** 64 点波形 + 32 点音高曲线；无音频时返回一句说明，不画假波形 */
export function VoiceWaveform({ assessment, height = 46 }: { assessment: VoiceAssessment; height?: number }) {
  const wave = assessment.waveform || []
  const pitch = assessment.pitchCurve || []
  if (!assessment.metrics.measured || !wave.length) {
    return (
      <p className="rounded-xl bg-white/70 px-3 py-2.5 text-[10px] leading-relaxed text-muted">
        这次没有录到音频波形（仅拿到识别文本），因此语调、清晰度与响度未测。
      </p>
    )
  }
  const W = 320
  const barW = W / Math.max(wave.length, 1)
  const pitchPts = pitch
    .map((hz, i) => ({ hz, x: (i / Math.max(pitch.length - 1, 1)) * W }))
    .filter((p) => p.hz > 0)
  const pitchPath = pitchPts
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${(height - 4 - ((Math.min(300, p.hz) - 70) / 230) * (height - 10)).toFixed(1)}`)
    .join(' ')

  return (
    <div className="rounded-2xl bg-white/80 p-2.5">
      <div className="mb-1 flex items-center justify-between text-[9px] font-bold text-muted">
        <span>音量波形</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1"><i className="inline-block h-1.5 w-3 rounded-full bg-brand-400" />响度</span>
          {pitchPath && <span className="flex items-center gap-1"><i className="inline-block h-1.5 w-3 rounded-full bg-mint-500" />音高</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-[46px] w-full" role="img"
        aria-label="本次录音的音量波形与音高曲线">
        <rect x="0" y={height - 1} width={W} height="1" fill="#e8ecf8" />
        {wave.map((v, i) => {
          const h = Math.max(1.5, v * (height - 6))
          return <rect key={i} x={i * barW + 0.6} y={height - 2 - h} width={Math.max(1.6, barW - 1.2)} height={h}
            rx="1" fill={v > 0.55 ? '#5b7cf0' : '#a9bcf7'} />
        })}
        {pitchPath && <path d={pitchPath} fill="none" stroke="#2fae86" strokeWidth="1.6" strokeLinejoin="round" opacity="0.85" />}
      </svg>
      <div className="mt-1 flex justify-between text-[9px] text-muted">
        <span>0s</span><span>{(assessment.metrics.durationMs / 1000).toFixed(1)}s</span>
      </div>
    </div>
  )
}

function MetricBar({ label, value, display, hint, tone = 'brand' }: {
  label: string; value: number; display: string; hint?: string; tone?: 'brand' | 'mint' | 'sun'
}) {
  const cls = tone === 'mint' ? 'bg-mint-500' : tone === 'sun' ? 'bg-sun-400' : 'bg-brand-500'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold text-muted">{label}</span>
        <span className="text-[11px] font-black text-ink">{display}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-50">
        <div className={cn('h-full rounded-full transition-all', cls)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
      {hint && <p className="mt-0.5 text-[9px] leading-snug text-muted">{hint}</p>}
    </div>
  )
}

/** 一次发声的完整点评：折叠展示，避免打断对话沉浸 */
export function VoiceAssessmentCard({
  assessment, level, defaultOpen = false, title = '发音点评', onRemove,
}: {
  assessment: VoiceAssessment
  level: IeltsLevel
  defaultOpen?: boolean
  title?: string
  onRemove?: () => void
}) {
  const m = assessment.metrics
  const ideal = idealWpm(level)
  const inRange = m.speechRateWpm >= ideal - 22 && m.speechRateWpm <= ideal + 22
  const unmeasured = !m.measured

  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 to-mint-100/50">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-bold text-ink">
          <Icon name="headphones" size={14} className="shrink-0 text-brand-600" />
          <span className="truncate">🎙 {title} · {unmeasured ? '仅文本' : '声学实测'}</span>
          <Chip tone={unmeasured ? 'slate' : 'mint'} className="!px-2 !py-0.5">参考 {assessment.bandRef.toFixed(1)}</Chip>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-muted">
          {formatDate(assessment.createdAt)}
          <Icon name="down" size={12} className="transition group-open:rotate-180" />
        </span>
      </summary>

      <div className="space-y-3 border-t border-white/70 px-3.5 pb-3.5 pt-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/85 p-2">
            <p className="text-[9px] font-bold text-muted">FC 连贯</p>
            <p className="font-display mt-0.5 text-base font-black text-brand-600">{assessment.dimensions.fc.toFixed(1)}</p>
          </div>
          <div className="rounded-xl bg-white/85 p-2">
            <p className="text-[9px] font-bold text-muted">PR 发音</p>
            <p className="font-display mt-0.5 text-base font-black text-mint-600">{assessment.dimensions.pr.toFixed(1)}</p>
          </div>
          <div className="rounded-xl bg-white/85 p-2">
            <p className="text-[9px] font-bold text-muted">综合</p>
            <p className="font-display mt-0.5 text-base font-black text-ink">{assessment.overall}</p>
          </div>
        </div>
        <p className="text-[9px] leading-relaxed text-muted">
          仅由 FC / PR 两项换算的练习参考分，不是完整雅思 Band；目标档 {level.band}（{level.name}）。
        </p>

        <VoiceWaveform assessment={assessment} />

        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-2xl bg-white/70 p-3 sm:grid-cols-3">
          <MetricBar label="语速" value={(m.speechRateWpm / 220) * 100} display={`${m.speechRateWpm} wpm`}
            tone={inRange ? 'mint' : 'sun'} hint={`本档舒适区 ${ideal - 20}–${ideal + 20}`} />
          <MetricBar label="停顿" value={Math.max(0, 100 - m.pauseCount * 25)} display={unmeasured ? '未测' : `${m.pauseCount} 次`}
            hint={unmeasured ? undefined : m.longestPauseMs ? `最长 ${(m.longestPauseMs / 1000).toFixed(1)}s` : '几乎没有长卡顿'} />
          <MetricBar label="语调起伏" value={(m.pitchRangeSemitones / 12) * 100}
            display={unmeasured ? '未测' : `${m.pitchRangeSemitones.toFixed(1)} 半音`} tone="mint" />
          <MetricBar label="清晰度" value={m.clarity} display={unmeasured ? '未测' : `${m.clarity}`} tone="mint" />
          <MetricBar label="响度" value={Math.max(0, Math.min(100, (m.volumeDb + 60) * 1.7))}
            display={unmeasured ? '未测' : `${m.volumeDb.toFixed(0)} dB`} />
          <MetricBar label="有效发声" value={(1 - m.silenceRatio) * 100}
            display={unmeasured ? '未测' : `${Math.round((1 - m.silenceRatio) * 100)}%`} />
        </div>

        {assessment.transcript && (
          <p className="en-text rounded-xl bg-white/75 px-3 py-2 text-[11px] leading-relaxed text-ink/80">
            「{assessment.transcript}」
            {typeof assessment.recognitionConfidence === 'number' && (
              <span className="ml-1 text-[9px] text-muted">识别置信度 {Math.round(assessment.recognitionConfidence * 100)}%</span>
            )}
          </p>
        )}

        {assessment.strengths.length > 0 && (
          <div className="space-y-1.5">
            {assessment.strengths.map((s) => (
              <p key={s} className="flex items-start gap-1.5 rounded-xl bg-mint-100/70 px-2.5 py-2 text-[10px] leading-relaxed text-mint-700">
                <Icon name="check" size={12} className="mt-0.5 shrink-0" />{s}
              </p>
            ))}
          </div>
        )}
        {assessment.suggestions.length > 0 && (
          <div className="space-y-1.5">
            {assessment.suggestions.map((s) => (
              <p key={s} className="flex items-start gap-1.5 rounded-xl bg-sun-100/70 px-2.5 py-2 text-[10px] leading-relaxed text-[#8a5b08]">
                <Icon name="bulb" size={12} className="mt-0.5 shrink-0" />{s}
              </p>
            ))}
          </div>
        )}

        <p className="flex items-start gap-1.5 text-[9px] leading-relaxed text-muted">
          <Icon name="info" size={12} className="mt-0.5 shrink-0" />{assessment.disclaimer}
        </p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-[10px] font-semibold text-muted underline hover:text-coral-600">
            移除这条点评
          </button>
        )}
      </div>
    </details>
  )
}

/** 汇总卡：报告 / 复习 / 进度页共用 */
export function VoiceSummaryCard({ summary, level, title = '本场发音表现', compact = false }: {
  summary: VoiceSummary
  level: IeltsLevel
  title?: string
  compact?: boolean
}) {
  const trendLabel = summary.trend > 0.15 ? `近半程 +${summary.trend.toFixed(1)} ↗`
    : summary.trend < -0.15 ? `近半程 ${summary.trend.toFixed(1)} ↘` : '走势平稳 →'
  return (
    <Card className="!p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="font-display text-sm font-black text-ink">🎙 {title}</p>
          <p className="mt-0.5 text-[10px] text-muted">{summary.count} 段发声 · {summary.measuredCount} 段含真实音频 · 目标 {level.band}</p>
        </div>
        <Chip tone={summary.trend > 0.15 ? 'mint' : 'brand'}>{trendLabel}</Chip>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: '平均参考分', v: summary.avgBand.toFixed(1), s: 'FC / PR 换算' },
          { k: '平均语速', v: `${summary.avgWpm}`, s: 'wpm' },
          { k: '语调起伏', v: summary.measuredCount ? `${summary.avgPitchRange.toFixed(1)}` : '—', s: '半音' },
          { k: '清晰度', v: summary.measuredCount ? `${summary.avgClarity}` : '—', s: '0–100' },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/50 p-2.5 text-center">
            <p className="text-[9px] font-bold text-muted">{x.k}</p>
            <p className="font-display mt-0.5 text-lg font-black text-brand-600">{x.v}</p>
            <p className="text-[9px] text-muted">{x.s}</p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-bold text-muted">
          <span>参考 Band 进度（目标 {level.bandValue.toFixed(1)}）</span>
          <span>{summary.avgBand.toFixed(1)} / 9.0</span>
        </div>
        <ProgressBar value={bandProgress(summary.avgBand)} className="mt-1.5" />
      </div>

      {!compact && (
        <>
          {summary.strengths.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {summary.strengths.slice(0, 2).map((s) => (
                <p key={s} className="flex items-start gap-1.5 rounded-xl bg-mint-100/60 px-2.5 py-2 text-[10px] leading-relaxed text-mint-700">
                  <Icon name="check" size={12} className="mt-0.5 shrink-0" />{s}
                </p>
              ))}
            </div>
          )}
          {summary.suggestions.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {summary.suggestions.slice(0, 2).map((s) => (
                <p key={s} className="flex items-start gap-1.5 rounded-xl bg-sun-100/60 px-2.5 py-2 text-[10px] leading-relaxed text-[#8a5b08]">
                  <Icon name="bulb" size={12} className="mt-0.5 shrink-0" />{s}
                </p>
              ))}
            </div>
          )}
          {summary.latest && <div className="mt-3"><VoiceWaveform assessment={summary.latest} /></div>}
        </>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-relaxed text-muted">
        <Icon name="info" size={12} className="mt-0.5 shrink-0" />
        练习参考分，非官方雅思评分；浏览器无法判断音素准确度与口音，趋势比单次分数更可信。
      </p>
    </Card>
  )
}

/** 最近若干次参考分的小柱图，进度页用 */
export function VoiceTrendBars({ items, level }: { items: VoiceAssessment[]; level: IeltsLevel }) {
  const recent = [...items].sort((a, b) => a.createdAt - b.createdAt).slice(-8)
  if (!recent.length) return null
  return (
    <div>
      <div className="flex h-[68px] items-end justify-between gap-1.5">
        {recent.map((v) => (
          <div key={v.id} className="flex flex-1 flex-col items-center gap-1" title={`${formatDate(v.createdAt)} · ${v.bandRef.toFixed(1)}`}>
            <span className="text-[9px] font-bold text-brand-600">{v.bandRef.toFixed(1)}</span>
            <div className={cn('w-full rounded-t-lg', v.metrics.measured ? 'bg-gradient-to-t from-brand-500 to-mint-400' : 'bg-slate-300')}
              style={{ height: `${Math.max(6, bandProgress(v.bandRef) * 48)}px` }} />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[9px] leading-relaxed text-muted">
        实心为真实录音，浅色为仅识别文本；目标档 {level.band} 约 {level.bandValue.toFixed(1)} 分。
      </p>
    </div>
  )
}

/** 空状态：还没有任何语音记录时给一句明确引导 */
export function VoiceEmptyHint({ children }: { children?: ReactNode }) {
  return (
    <p className="rounded-2xl bg-brand-50/70 p-3 text-center text-[11px] leading-relaxed text-muted">
      🎙 {children || '还没有发音评测。在对话页点「发音评测」录一句英文，这里就会出现语速、停顿与语调的可视化点评。'}
    </p>
  )
}
