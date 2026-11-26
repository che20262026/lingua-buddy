/**
 * [全局语言切换] 查询页右上角与设置页共用的唯一控件
 * ------------------------------------------------------------------
 * 状态真源只有一份：useAppStore 的 settings.wordLanguage（第 7 键 nova_settings，
 * 31 键契约不变）。两处都通过 update() 读写同一字段，天然双向绑定；
 * 旧存档缺字段时由 loadData 浅合并补 'en'，合法 'ru' 原样保留。
 *
 * 两种形态共用同一份选项列表：
 *  - popover：查询页 Header 右上角徽标按钮 + 浮层（页面容器无 overflow:hidden）；
 *  - inline ：设置页分组内直接铺两枚按钮（设置卡有 overflow:hidden，不能用绝对浮层）。
 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { Icon } from './ui'

export type LearningLanguage = 'en' | 'ru'

export const LANGUAGE_OPTIONS: Array<{ value: LearningLanguage; flag: string; label: string; hint: string }> = [
  { value: 'en', flag: '🇬🇧', label: '英语', hint: 'English' },
  { value: 'ru', flag: '🇷🇺', label: '俄语', hint: 'Русский' },
]

export function languageLabel(lang: LearningLanguage): string {
  return lang === 'ru' ? '🇷🇺 俄语' : '🇬🇧 英语'
}

interface LanguageSwitcherProps {
  variant?: 'popover' | 'inline'
  /** 触发按钮 testid（仅 popover） */
  buttonTestId?: string
  /** 选项面板 testid（两种形态都挂） */
  sheetTestId?: string
  /** 选项 testid 前缀，最终形如 `${prefix}-en` / `${prefix}-ru` */
  optionTestIdPrefix?: string
}

export function LanguageSwitcher({
  variant = 'popover',
  buttonTestId = 'query-lang-badge',
  sheetTestId = 'query-lang-sheet',
  optionTestIdPrefix = 'query-lang',
}: LanguageSwitcherProps) {
  const { data, update } = useApp()
  const lang: LearningLanguage = data.settings.wordLanguage ?? 'en'
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // 浮层点击外部 / Esc 关闭；inline 形态没有浮层，跳过监听
  useEffect(() => {
    if (variant !== 'popover' || !open) return
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [variant, open])

  const choose = (next: LearningLanguage) => {
    update((prev) => prev.settings.wordLanguage === next
      ? prev
      : { ...prev, settings: { ...prev.settings, wordLanguage: next } })
    setOpen(false)
  }

  const optionList = (
    <div role="menu" aria-label="选择学习语言" className={variant === 'popover' ? 'space-y-0.5' : 'grid grid-cols-2 gap-1.5'}>
      {LANGUAGE_OPTIONS.map((o) => {
        const active = lang === o.value
        return (
          <button key={o.value} type="button" role="menuitemradio" aria-checked={active}
            data-testid={`${optionTestIdPrefix}-${o.value}`}
            onClick={() => choose(o.value)}
            className={`flex min-h-[44px] items-center gap-2 rounded-xl px-2.5 text-left transition ${
              active ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-muted hover:bg-slate-200'
            }`}>
            <span className="text-base leading-none" aria-hidden="true">{o.flag}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold text-ink">{o.label}</span>
              <span className="block text-[10px] text-muted">{o.hint}</span>
            </span>
            {active && <Icon name="check" size={14} className="shrink-0 text-brand-600" />}
          </button>
        )
      })}
    </div>
  )

  if (variant === 'inline') {
    return <div data-testid={sheetTestId} className="w-full">{optionList}</div>
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" data-testid={buttonTestId} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-brand-100 bg-white px-3 py-1.5 text-[11px] font-bold text-brand-600 shadow-sm transition hover:bg-brand-50">
        <span aria-hidden="true">🌐</span>
        <span>{languageLabel(lang)}</span>
        <Icon name="down" size={12} />
      </button>
      {open && (
        <div data-testid={sheetTestId}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-44 rounded-2xl border border-brand-100 bg-white p-1.5 shadow-float">
          {optionList}
        </div>
      )}
    </div>
  )
}
