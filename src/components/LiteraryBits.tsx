/* ================================================================
 * [新增] 文学模块共享 UI 零件
 * 不引入任何新品牌色：全部使用 brand / mint / sun / coral 既有色阶，
 * 与现有卡片、Chip、Icon、EmptyState 保持同一视觉语言。
 * ================================================================ */

import type { ReactNode } from 'react'
import type {
  ChapterCharacter, ChapterTheme, KeyQuote, ReadingViewMode,
} from '../literaryTypes'
import { Chip, EmptyState, Icon, SectionTitle } from './ui'
import { cn } from '../lib/utils'

/** 页头标签：研讨页用 SEMINAR 与对话页明确区分，组件仍保持一致 */
export function LiteraryHeader({ eyebrow, title, subtitle, right }: {
  eyebrow: string; title: string; subtitle: string; right?: ReactNode
}) {
  return (
    <div className="animate-in">
      <Chip tone="mint" className="!px-2.5 !py-1 !text-[10px] tracking-widest">{eyebrow}</Chip>
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-black leading-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">{subtitle}</p>
        </div>
        {right}
      </div>
    </div>
  )
}

/** 书架页顶部的简短版权说明 */
export function CopyrightNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-sun-400/30 bg-sun-100/50 p-3.5">
      <Icon name="info" size={15} className="mt-0.5 shrink-0 text-[#a56a08]" />
      <div>
        <p className="text-[11px] font-bold text-[#8a5b08]">版权说明 · Public Domain only</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink/70">{text}</p>
      </div>
    </div>
  )
}

/** 原创渐变封面占位 + 装饰符号，不用任何第三方素材 */
export function BookCover({ emblem, from, to, size = 'md' }: {
  emblem: string; from: string; to: string; size?: 'sm' | 'md' | 'lg'
}) {
  const box = size === 'lg' ? 'h-24 w-20 text-4xl' : size === 'sm' ? 'h-11 w-9 text-lg' : 'h-16 w-14 text-2xl'
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-soft', from, to, box)}>
      <span aria-hidden="true">{emblem}</span>
    </div>
  )
}

const VIEW_LABELS: Array<{ value: ReadingViewMode; label: string; hint: string }> = [
  { value: 'original', label: '原文', hint: '公版原文节选' },
  { value: 'simplified', label: '分级简化', hint: '学习用改写，非原文' },
  { value: 'bilingual', label: '双语注释', hint: '原文 + 中文注释' },
]

/** 三视图切换；移动端也不换行溢出 */
export function ViewSwitcher({ value, onChange }: {
  value: ReadingViewMode; onChange: (v: ReadingViewMode) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="阅读视图">
      {VIEW_LABELS.map((v) => (
        <button key={v.value} type="button" role="tab" aria-selected={value === v.value}
          title={v.hint}
          onClick={() => onChange(v.value)}
          className={cn('rounded-xl px-1 py-2 text-[11px] font-bold transition',
            value === v.value ? 'bg-brand-500 text-white shadow-soft' : 'bg-brand-50 text-brand-600 hover:bg-brand-100')}>
          {v.label}
        </button>
      ))}
    </div>
  )
}

export function ViewModeHint({ mode }: { mode: ReadingViewMode }) {
  const hit = VIEW_LABELS.find((v) => v.value === mode)
  return <p className="mt-1.5 text-[10px] leading-relaxed text-muted">当前：{hit?.label} · {hit?.hint}</p>
}

/** 章节摘要卡（主题 / 人物 / 象征 / 引文 / 讨论问题） */
export function ThemeCards({ themes }: { themes: ChapterTheme[] }) {
  if (!themes.length) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {themes.map((t, i) => (
        <div key={`${t.name}-${i}`} className="rounded-2xl border border-brand-50 bg-white/75 p-3">
          <p className="text-[11px] font-bold text-brand-600">✦ 主题假设 · {t.name}</p>
          <p className="en-text mt-1.5 text-[11px] leading-relaxed text-ink/75">“{t.evidence}”</p>
          <p className="mt-1 text-[10px] text-muted">原文短引 · 已逐字校验</p>
        </div>
      ))}
    </div>
  )
}

export function CharacterCards({ characters }: { characters: ChapterCharacter[] }) {
  if (!characters.length) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {characters.map((c, i) => (
        <div key={`${c.name}-${i}`} className="rounded-2xl border border-mint-400/30 bg-mint-100/40 p-3">
          <p className="en-text text-xs font-bold text-ink">{c.name}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink/75">特质：{c.traits}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink/75">线索：{c.arc}</p>
        </div>
      ))}
    </div>
  )
}

export function QuoteCards({ quotes, onLocate }: {
  quotes: KeyQuote[]
  onLocate?: (quote: string) => void
}) {
  if (!quotes.length) return null
  return (
    <div className="space-y-2">
      {quotes.map((q, i) => (
        <div key={`${q.quote}-${i}`} className="rounded-2xl border border-brand-100 bg-brand-50/50 p-3">
          <p className="en-text text-xs font-semibold leading-relaxed text-ink">“{q.quote}”</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{q.whyItMatters}</p>
          {onLocate && (
            <button type="button" onClick={() => onLocate(q.quote)}
              className="mt-2 flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:underline">
              <Icon name="text" size={12} />回原文找证据
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function QuestionCards({ questions, onPick }: { questions: string[]; onPick?: (q: string) => void }) {
  if (!questions.length) return null
  return (
    <div className="space-y-1.5">
      {questions.map((q, i) => (
        onPick ? (
          <button key={q} type="button" onClick={() => onPick(q)}
            className="en-text w-full rounded-xl bg-white/80 px-3 py-2 text-left text-[11px] font-semibold leading-relaxed text-ink hover:bg-white">
            {i + 1}. {q}
          </button>
        ) : (
          <p key={q} className="en-text rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-ink/80">
            {i + 1}. {q}
          </p>
        )
      ))}
    </div>
  )
}

/** 章节分析加载态（不复用 TextAnalyzerAgent 的 Loader，避免错文案） */
export function LiteraryLoader({ text = '正在研读这一章…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14">
      <div className="spinner h-9 w-9" />
      <p className="text-sm font-semibold text-brand-600">{text}</p>
      <p className="text-xs text-muted">LiteraryAnalyzerAgent 正在核对原文证据、主题与人物卡片</p>
    </div>
  )
}

/** 章节加载失败态：明确原因 + 重试 + 回退出口 */
export function LoadError({ title, desc, onRetry, onBack }: {
  title: string; desc: string; onRetry: () => void; onBack: () => void
}) {
  return (
    <EmptyState emblem="📕" title={title} desc={desc}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onRetry} className="btn-primary !px-4 !py-2 !text-xs">重新加载</button>
          <button type="button" onClick={onBack} className="btn-ghost !px-4 !py-2 !text-xs">返回书架</button>
        </div>
      } />
  )
}

/** 通用小节标题包装，保证与现有页面一致的间距 */
export function LiterarySection({ title, subtitle, right, children }: {
  title: string; subtitle?: string; right?: ReactNode; children: ReactNode
}) {
  return (
    <section>
      <SectionTitle title={title} subtitle={subtitle} right={right} />
      {children}
    </section>
  )
}
