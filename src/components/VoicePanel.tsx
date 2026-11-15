/**
 * VoicePanel —— 音色选择面板
 *
 * 三条铁律：
 *   1. 音色列表只来自浏览器真实的 getVoices()，绝不硬编码音色名称；
 *   2. 必须处理三种状态：加载中 / 0 个音色 / 只有 1 个英语音色；
 *   3. 不承诺音色数量 —— 面板只描述「当前设备提供了几个」。
 *
 * 试听不关闭面板、不消耗会话轮次、不发 XP。
 */

import { useMemo, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { Card, Chip, Icon, Toggle } from './ui'
import {
  ACCENT_LABELS, GENDER_HINT_LABEL, accentLabel, guessGenderHint,
  type VoiceAccentKey, type VoiceInfo,
} from '../voiceTypes'
import { applyVoiceGlobal, groupVoicesByAccent, voicesForAccent } from '../services/voicePreferences'
import type { VoiceLoadState } from '../hooks/useSpeech'

/** 固定的试听句：不消耗轮次，也不发 XP */
export const AUDITION_SAMPLE = 'Hi, nice to meet you. Shall we start?'

const ACCENT_OPTIONS: Array<{ key: VoiceAccentKey; label: string }> = [
  { key: 'en-US', label: '美音' },
  { key: 'en-GB', label: '英音' },
  { key: 'en-AU', label: '澳音' },
  { key: 'en-other', label: '其他英语' },
  { key: 'system', label: '跟随系统默认' },
]

export interface VoicePanelProps {
  voices: VoiceInfo[]
  state: VoiceLoadState
  supported: boolean
  onAudition: (text: string, voiceURI?: string, rate?: number) => void
  onClose: () => void
}

export function VoicePanel({ voices, state, supported, onAudition, onClose }: VoicePanelProps) {
  const app = useApp()
  const prefs = app.data.voicePreferences
  const [showOther, setShowOther] = useState(false)

  const { english, other } = useMemo(() => groupVoicesByAccent(voices), [voices])
  const candidates = useMemo(() => voicesForAccent(voices, prefs.global.accent), [voices, prefs.global.accent])
  const englishCount = english.length

  /** 降级说明：任何一种都要说清楚，不静默失败 */
  const degradeHint = (() => {
    if (!supported) {
      return '当前浏览器不支持语音合成（speechSynthesis），朗读相关控件已隐藏；文字对话完全不受影响。'
    }
    if (state === 'loading') return '正在加载音色…（Chrome 等浏览器会异步加载，首次可能需要几秒）'
    if (state === 'empty' || englishCount === 0) {
      return voices.length
        ? '未找到英语音色。可在系统设置里安装英语语音包后再来；不会用中文音色硬读英文。'
        : '当前浏览器未提供语音合成音色，可继续用文字对话。'
    }
    return ''
  })()

  return (
    <div data-testid="voice-panel" className="animate-in mt-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
          <Icon name="speaker" size={13} />对话音色
        </p>
        <button type="button" onClick={onClose} aria-label="收起音色面板"
          className="shrink-0 rounded-lg p-1 text-muted hover:text-ink"><Icon name="close" size={13} /></button>
      </div>

      {/* 降级说明：0 音色 / 不支持 / 加载中都必须说清楚 */}
      {degradeHint && (
        <p data-testid="voice-degrade" className="mt-2 rounded-xl bg-white/85 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
          {degradeHint}
        </p>
      )}

      {supported && (
        <>
          {/* 口音偏好 */}
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-bold text-muted">口音偏好</p>
            <div className="flex flex-wrap gap-1.5">
              {ACCENT_OPTIONS.map((opt) => (
                <button key={opt.key} type="button"
                  onClick={() => applyVoiceGlobal(app, { accent: opt.key })}
                  aria-pressed={prefs.global.accent === opt.key}
                  data-testid={`voice-accent-${opt.key}`}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                    prefs.global.accent === opt.key
                      ? 'bg-brand-500 text-white'
                      : 'bg-white text-brand-700 hover:bg-brand-100'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
              口音只是筛选条件；具体用哪个音色由设备提供，改这里不会影响对话内容。
            </p>
          </div>

          {/* 音色数量说明：不承诺数量，只描述当前设备 */}
          <p data-testid="voice-count" className="mt-3 text-[10px] font-semibold text-muted">
            {state === 'loading'
              ? '正在统计当前设备的音色…'
              : `当前设备提供 ${englishCount} 个英语音色${englishCount === 1 ? '（只有 1 个也完全可用）' : ''}`}
          </p>

          {/* 英语音色列表 */}
          {englishCount > 0 && (
            <div className="mt-1.5 space-y-1">
              {candidates.map((v) => {
                const active = prefs.global.voiceURI === v.voiceURI
                const gender = guessGenderHint(v.name)
                return (
                  <div key={v.voiceURI} data-testid={`voice-option-${v.voiceURI}`}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${
                      active ? 'bg-white ring-1 ring-brand-300' : 'bg-white/70'}`}>
                    <button type="button" onClick={() => applyVoiceGlobal(app, { voiceURI: v.voiceURI })}
                      aria-pressed={active}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-brand-500' : 'bg-slate-200'}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-bold text-ink">{v.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1">
                          <Chip tone="brand" className="!px-1.5 !py-0 !text-[9px]">{accentLabel(v.lang)}</Chip>
                          {gender !== 'unknown' && (
                            <span className="text-[9px] text-muted">{GENDER_HINT_LABEL[gender]}（系统未提供，仅供参考）</span>
                          )}
                        </span>
                      </span>
                    </button>
                    <button type="button" aria-label={`试听 ${v.name}`}
                      onClick={() => onAudition(AUDITION_SAMPLE, v.voiceURI)}
                      className="shrink-0 rounded-lg p-1.5 text-brand-600 hover:bg-brand-100">
                      <Icon name="play" size={13} />
                    </button>
                  </div>
                )
              })}
              {candidates.length === 0 && (
                <p className="rounded-xl bg-white/80 px-2.5 py-2 text-[10px] text-muted">
                  这个口音下当前设备没有可用音色，已回退到系统默认。
                </p>
              )}
            </div>
          )}

          {/* 其他语言：折叠，仅供调试 */}
          {other.length > 0 && (
            <div className="mt-2">
              <button type="button" onClick={() => setShowOther((v) => !v)}
                className="flex items-center gap-1 text-[10px] font-bold text-muted hover:text-ink">
                <Icon name={showOther ? 'down' : 'right'} size={11} />
                其他语言（{other.length}）
              </button>
              {showOther && (
                <div className="mt-1 space-y-0.5">
                  {other.map((v) => (
                    <p key={v.voiceURI} className="truncate px-2 text-[10px] text-muted">
                      {v.name} · {v.lang || '未知语言'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 语速与音高 */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="flex items-center justify-between text-[10px] font-bold text-muted">
                语速
                <span className="text-brand-600">{prefs.global.rate.toFixed(2)}x</span>
              </span>
              <input type="range" min={0.7} max={1.2} step={0.05} value={prefs.global.rate}
                data-testid="voice-rate"
                onChange={(e) => applyVoiceGlobal(app, { rate: Number(e.target.value) })}
                className="mt-1 w-full accent-brand-500" />
            </label>
            <label className="block">
              <span className="flex items-center justify-between text-[10px] font-bold text-muted">
                音高
                <span className="text-brand-600">{prefs.global.pitch.toFixed(2)}</span>
              </span>
              <input type="range" min={0.8} max={1.2} step={0.05} value={prefs.global.pitch}
                data-testid="voice-pitch"
                onChange={(e) => applyVoiceGlobal(app, { pitch: Number(e.target.value) })}
                className="mt-1 w-full accent-brand-500" />
            </label>
          </div>

          {/* 试听句：不消耗轮次、不发 XP */}
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/85 px-2.5 py-2">
            <p className="en-text min-w-0 flex-1 truncate text-[11px] text-ink">“{AUDITION_SAMPLE}”</p>
            <button type="button" onClick={() => onAudition(AUDITION_SAMPLE)}
              data-testid="voice-audition"
              className="shrink-0 rounded-xl bg-brand-500 px-2.5 py-1.5 text-[11px] font-bold text-white">
              试听
            </button>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
            试听只是听一句示例，不会消耗轮次、不会发 XP，也不会写进会话历史。
          </p>
        </>
      )}
    </div>
  )
}

/** 自动朗读开关（对话页与设置页共用同一份状态） */
export function AutoReadToggle({ compact = false }: { compact?: boolean }) {
  const app = useApp()
  const prefs = app.data.voicePreferences
  const on = prefs.global.autoRead
  if (compact) {
    return (
      <button type="button" onClick={() => applyVoiceGlobal(app, { autoRead: !on })}
        aria-pressed={on} aria-label={on ? '关闭自动朗读' : '开启自动朗读'}
        data-testid="auto-read-toggle"
        className={`rounded-xl p-2 transition ${on ? 'bg-brand-500 text-white' : 'bg-white text-muted'}`}>
        <Icon name="speaker" size={16} />
      </button>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-semibold text-muted">自动朗读 AI 回复</span>
      <Toggle checked={on} onChange={(v) => applyVoiceGlobal(app, { autoRead: v })} label="自动朗读 AI 回复" />
    </div>
  )
}

/** 口音标签（设置页展示用） */
export const accentLabelFor = (accent: VoiceAccentKey): string => ACCENT_LABELS[accent]
