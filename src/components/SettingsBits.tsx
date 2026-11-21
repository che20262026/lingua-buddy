import type { ReactNode } from 'react'
import { Icon, type IconName } from './ui'

/* ================================================================
 * 系统设置风格的分组列表原子（参考 MIUI 设置页）
 *
 * 只负责「排版与视觉节奏」，不碰任何业务数据：
 *   SettingsGroup → 浅灰底上的一张白色圆角卡
 *   SettingsRow   → 一行：左彩色圆图标 + 标题/副标题，右开关或值 + 箭头
 *
 * 色值全部走项目既有 Tailwind 色阶（brand / mint / sun / coral / slate），
 * 不引入参考图里的新颜色。
 * ================================================================ */

export type SettingsIconTone = 'blue' | 'mint' | 'sun' | 'coral' | 'slate'

const TONE_CLASS: Record<SettingsIconTone, string> = {
  blue: 'bg-brand-500 text-white',
  mint: 'bg-mint-500 text-white',
  sun: 'bg-sun-500 text-white',
  coral: 'bg-coral-500 text-white',
  slate: 'bg-slate-100 text-slate-600',
}

export function SettingsGroup({
  title, children, danger = false, testId,
}: {
  title?: string
  children: ReactNode
  /** 危险操作分组：标题转珊瑚红，与常规组视觉区分 */
  danger?: boolean
  testId?: string
}) {
  return (
    <section className="settings-group" data-testid={testId}>
      {title ? <h2 className="settings-group-title">{title}</h2> : null}
      <div className={`settings-group-card${danger ? ' settings-group-card--danger' : ''}`}>
        {children}
      </div>
    </section>
  )
}

export function SettingsRow({
  icon, emoji, iconTone = 'blue', title, subtitle, value, trailing,
  onClick, testId, disabled,
}: {
  icon?: IconName
  emoji?: string
  iconTone?: SettingsIconTone
  title: string
  subtitle?: string
  value?: string
  /** 自定义右侧控件（Toggle / 按钮）；不给且可点击时自动渲染箭头 */
  trailing?: ReactNode
  onClick?: () => void
  testId?: string
  disabled?: boolean
}) {
  const clickable = typeof onClick === 'function'
  const content = (
    <>
      {/* 固定 32px 图标位：即使某行没有图标，分隔线仍从文字起点开始 */}
      <span className={`settings-row-icon ${TONE_CLASS[iconTone]}`} aria-hidden="true">
        {icon ? <Icon name={icon} size={17} />
          : emoji ? <span>{emoji}</span>
            : null}
      </span>
      <span className="settings-row-main">
        <span className="settings-row-title">{title}</span>
        {subtitle ? <span className="settings-row-sub">{subtitle}</span> : null}
      </span>
      {value ? <span className="settings-row-value">{value}</span> : null}
      {trailing ?? (clickable
        ? <span className="settings-row-chevron"><Icon name="right" size={16} /></span>
        : null)}
    </>
  )

  if (clickable) {
    return (
      <button type="button" onClick={onClick} disabled={disabled}
        data-testid={testId} className="settings-row">
        {content}
      </button>
    )
  }
  return (
    <div data-testid={testId} className="settings-row">
      {content}
    </div>
  )
}

/** 分组内的自定义内容块（分段按钮 / 输入项 / 复合子组件） */
export function SettingsInline({ children }: { children: ReactNode }) {
  return <div className="settings-inline">{children}</div>
}
