import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

/* ---------------- 原创线性图标（无第三方图标库） ---------------- */

const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 10.6 12 3l9 7.6V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  cards: <><rect x="3" y="5" width="13" height="15" rx="2" /><path d="M8 3h10a2 2 0 0 1 2 2v12M7 10h6M7 14h4" /></>,
  chart: <><path d="M3 20h18" /><path d="M6 20v-6M11 20V5M16 20v-9M21 20v-4" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>,
  send: <><path d="M21 3 10.5 13.5" /><path d="M21 3 14.5 21l-4-7.5L3 9.5z" /></>,
  bulb: <><path d="M9 18h6M10 21.5h4" /><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8V17h7.6v-2.7A6.5 6.5 0 0 0 12 2.5z" /></>,
  speaker: <><path d="M11 5 6.5 9H3v6h3.5L11 19z" /><path d="M15 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.5 18.5 3.5 19.5l1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M18.5 6 17.5 20h-11L5.5 6M10 10v6M14 10v6" /></>,
  right: <path d="m9 5 7 7-7 7" />,
  left: <path d="m15 5-7 7 7 7" />,
  down: <path d="m5 9 7 7 7-7" />,
  check: <path d="m4 12.5 5 5L20 6.5" />,
  star: <path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" />,
  flame: <path d="M12 22c4.1 0 6.5-2.8 6.5-6.3 0-2.6-1.4-4.6-3-6.2-.3 1.7-1.2 2.6-2.2 3.1.4-3.3-1.3-6.6-3.6-9.1.2 3-1.2 4.6-2.6 6.2-1.2 1.4-1.6 3.1-1.6 5 0 4 2.4 7.3 6.5 7.3z" />,
  sparkles: <><path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  upload: <><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  close: <path d="M6 6 18 18M18 6 6 18" />,
  refresh: <><path d="M20 11a8 8 0 1 0-2 6.5" /><path d="M20 4v7h-7" /></>,
  play: <path d="m8 5 11 7-11 7z" />,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19a2 2 0 0 1 2-2h13" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  text: <><path d="M4 6h16M4 11h13M4 16h16M4 21h9" /></>,
  flag: <><path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8" /></>,
  headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13" width="4" height="7" rx="2" /><rect x="17" y="13" width="4" height="7" rx="2" /></>,
  /** [新增] 大肥鱼：底部导航「鱼塘」用 */
  fish: <>
    <path d="M2.6 12c3.1-4.4 7.2-5.9 10.7-4.3 1.9.9 3.4 2.3 4.3 3.4.4.4 1 .4 1.4 0 .9-1.1 2.4-2.5 4.3-3.4 3.5-1.6 7.6-.1 10.7 4.3-3.1 4.4-7.2 5.9-10.7 4.3-1.9-.9-3.4-2.3-4.3-3.4-.4-.4-1-.4-1.4 0-.9 1.1-2.4 2.5-4.3 3.4-3.5 1.6-7.6.1-10.7-4.3Z" />
    <circle cx="7.4" cy="10.6" r="1.15" fill="currentColor" stroke="none" />
  </>,
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

/* ---------------- 基础组件 ---------------- */

/** [S2.5 修改点] 新增可选 testId，供冒烟测试精确定位跟读卡片；其余行为一字不变 */
export function Card({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) {
  return <div className={cn('card p-5', className)} data-testid={testId}>{children}</div>
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

const TONES: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  mint: 'bg-mint-100 text-mint-600',
  sun: 'bg-sun-100 text-[#a56a08]',
  coral: 'bg-coral-100 text-coral-600',
  slate: 'bg-slate-100 text-slate-600',
}

export function Chip({ children, tone = 'brand', className = '', title }: { children: ReactNode; tone?: keyof typeof TONES; className?: string; title?: string }) {
  return <span title={title} className={cn('chip', TONES[tone] || TONES.brand, className)}>{children}</span>
}

export function Avatar({ name, size = 44, tone = 'brand' }: { name: string; size?: number; tone?: 'brand' | 'coral' | 'mint' | 'sun' }) {
  const bg = {
    brand: 'from-brand-400 to-brand-600',
    coral: 'from-coral-400 to-coral-600',
    mint: 'from-mint-400 to-mint-600',
    sun: 'from-sun-400 to-coral-400',
  }[tone]
  const initial = (name.trim()[0] || 'L').toUpperCase()
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display font-bold text-white shadow-card', bg)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </div>
  )
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-brand-50', className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-mint-400 transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ProgressRing({ value, size = 92, label, sub }: { value: number; size?: number; label: string; sub?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5ecff" strokeWidth="9" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3b6bf4" strokeWidth="9"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          className="transition-all duration-700" />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-lg font-bold leading-none text-ink">{label}</span>
        {sub && <span className="mt-0.5 text-[10px] text-muted">{sub}</span>}
      </div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-brand-500' : 'bg-slate-200')}>
      <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
    </button>
  )
}

export function IconButton({ icon, label, onClick, active = false, disabled = false, className = '' }: {
  icon: IconName; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; className?: string
}) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className={cn('flex h-10 w-10 items-center justify-center rounded-2xl border transition active:scale-95 disabled:opacity-40',
        active ? 'border-brand-300 bg-brand-500 text-white' : 'border-brand-100 bg-white text-brand-600 hover:bg-brand-50', className)}>
      <Icon name={icon} size={18} />
    </button>
  )
}

export function EmptyState({ emblem = '🌱', title, desc, action }: { emblem?: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-brand-200 bg-white/60 px-6 py-12 text-center">
      <div className="mb-3 text-4xl">{emblem}</div>
      <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      {desc && <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Loader({ text = '正在解读文本…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14">
      <div className="spinner h-9 w-9" />
      <p className="text-sm font-semibold text-brand-600">{text}</p>
      <p className="text-xs text-muted">TextAnalyzerAgent 正在辨认主题、词汇与场景</p>
    </div>
  )
}

export function Modal({ open, title, desc, confirmText = '确认', cancelText = '再想想', danger = false, onConfirm, onClose }: {
  open: boolean; title: string; desc?: string; confirmText?: string; cancelText?: string; danger?: boolean;
  onConfirm: () => void; onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-5 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm animate-in rounded-3xl bg-white p-6 shadow-float" onClick={(e) => e.stopPropagation()}>
        <div className={cn('mb-4 flex h-11 w-11 items-center justify-center rounded-2xl', danger ? 'bg-coral-100 text-coral-600' : 'bg-brand-50 text-brand-600')}>
          <Icon name={danger ? 'trash' : 'info'} size={22} />
        </div>
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        {desc && <p className="mt-2 text-sm leading-relaxed text-muted">{desc}</p>}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">{cancelText}</button>
          <button type="button" onClick={onConfirm}
            className={cn('flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98]', danger ? 'bg-coral-500 hover:bg-coral-600' : 'bg-brand-500 hover:bg-brand-600')}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="pointer-events-none fixed left-1/2 top-5 z-[60] w-[min(90vw,420px)] -translate-x-1/2 animate-in">
      <div className="rounded-2xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white shadow-float">{message}</div>
    </div>
  )
}
