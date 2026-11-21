/* ================================================================
 * [新增] 书架（文学研读）信息流展示零件
 *
 * 约束：
 * - 纯展示组件，只接 props；不读 store、不写 localStorage、不发 XP。
 * - 全部复用既有 brand / mint / sun / coral 色阶，不引入新品牌色。
 * - 底部悬浮工具条用 role="toolbar" 而不是 <nav>：
 *   冒烟对底部导航有 `nav button === 7` 的硬断言，多一个 <nav> 会直接变红。
 * ================================================================ */

import type { ReactNode } from 'react'
import type { BookListItem } from '../services/literaryCurator'
import type { SeminarSession } from '../literaryTypes'
import { BookCover } from './LiteraryBits'
import { Chip, Icon, ProgressBar } from './ui'
import { cn } from '../lib/utils'

/* ---------------- 横滑分类 Tab ---------------- */

export interface FeedTabItem {
  id: string
  label: string
  /** 可选计数角标；不传就不显示 */
  count?: number
}

export function FeedTabs({ tabs, active, onChange }: {
  tabs: FeedTabItem[]; active: string; onChange: (id: string) => void
}) {
  return (
    <div className="lf-tabs" role="tablist" aria-label="书架分类">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cn('lf-tab', active === t.id && 'lf-tab-active')}>
          {t.label}
          {typeof t.count === 'number' && t.count > 0 && (
            <span className="ml-1 text-[11px] font-bold text-muted">({t.count})</span>
          )}
        </button>
      ))}
    </div>
  )
}

/* ---------------- 纯文字快讯列表 ---------------- */

export interface FeedBriefItem {
  id: string
  text: string
  /** 有真实跳转目标时给 onClick；没有就渲染成纯文字行 */
  onOpen?: () => void
  /** 行尾的浅色说明 */
  meta?: string
}

export function FeedBriefs({ items, title }: { items: FeedBriefItem[]; title: string }) {
  if (!items.length) return null
  return (
    <section aria-label={title}>
      <p className="mb-2 px-1 text-[11px] font-black tracking-[0.16em] text-muted">{title}</p>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.id}>
            {it.onOpen ? (
              <button type="button" onClick={it.onOpen}
                className="flex w-full items-start gap-2 rounded-xl px-1 py-2 text-left transition hover:bg-white/60">
                <span aria-hidden="true" className="lf-brief-dot mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-relaxed text-ink">{it.text}</span>
                  {it.meta && <span className="mt-0.5 block text-[10px] text-muted">{it.meta}</span>}
                </span>
                <Icon name="right" size={13} className="mt-1 shrink-0 text-muted" />
              </button>
            ) : (
              <div className="flex items-start gap-2 px-1 py-2">
                <span aria-hidden="true" className="lf-brief-dot mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-relaxed text-ink">{it.text}</span>
                  {it.meta && <span className="mt-0.5 block text-[10px] text-muted">{it.meta}</span>}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------------- 大图蒙版头条 ---------------- */

export function FeedHero({ item, onOpen, corner }: {
  item: BookListItem; onOpen: () => void; corner?: string
}) {
  return (
    <button type="button" onClick={onOpen}
      className={cn('lf-hero-cover block w-full bg-gradient-to-br p-5 text-left shadow-soft', item.coverFrom, item.coverTo)}>
      {/* 巨幅徽标水印：与文化头条同构的记忆点 */}
      <span aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-4 select-none text-[104px] leading-none text-white/25">
        {item.emblem}
      </span>
      <span aria-hidden="true" className="lf-hero-veil pointer-events-none absolute inset-0 z-[1]" />
      <span className="lf-hero-mark absolute left-4 top-4 z-[2] rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-black text-brand-600 shadow-card">
        经典必读
      </span>
      {corner && (
        <span className="absolute right-4 top-4 z-[2] rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-bold text-white/90">
          {corner}
        </span>
      )}
      <span className="relative z-[2] block pt-[86px]">
        <span className="en-text block font-display text-xl font-black leading-tight text-white">{item.title}</span>
        <span className="mt-1 block text-[11px] font-semibold text-white/80">
          {item.author} · {item.year || '年代未标注'} · {item.chapterCount} 章 · 约 {item.totalWords} 词
        </span>
        <span className="mt-3 inline-flex items-center gap-2">
          <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">CEFR {item.cefr}</Chip>
          {item.percent > 0 && (
            <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">已读 {Math.round(item.percent * 100)}%</Chip>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white">
            开始研读<Icon name="right" size={12} />
          </span>
        </span>
      </span>
    </button>
  )
}

/* ---------------- 书单卡片（信息流条目） ---------------- */

export function FeedBookCard({ item, onOpen }: { item: BookListItem; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className="card flex w-full items-center gap-3.5 p-4 text-left transition hover:border-brand-300">
      <BookCover emblem={item.emblem} from={item.coverFrom} to={item.coverTo} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="en-text truncate text-sm font-bold text-ink">{item.title}</p>
          <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">{item.cefr}</Chip>
          {item.custom && <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">自有短篇</Chip>}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {item.author} · {item.year || '年代未标注'} · {item.chapterCount} 章节选 · 约 {item.totalWords} 词
        </p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{item.blurb}</p>
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar value={item.percent} className="!h-1.5" />
          <span className="shrink-0 text-[10px] font-semibold text-brand-600">{item.completed}/{item.chapterCount}</span>
        </div>
        <p className="mt-1.5 truncate text-[10px] text-muted">来源：{item.source}</p>
      </div>
      <Icon name="right" size={16} className="shrink-0 text-muted" />
    </button>
  )
}

/* ---------------- 研讨媒体卡（播放入口） ---------------- */

export function FeedSeminarCard({ session, onOpen }: {
  session: SeminarSession; onOpen: () => void
}) {
  const when = new Date(session.createdAt)
  const dateText = `${when.getMonth() + 1}月${when.getDate()}日`
  return (
    <button type="button" onClick={onOpen}
      className="lf-hero-cover block w-full bg-gradient-to-br from-brand-600 to-brand-700 text-left shadow-soft">
      <span className="relative block h-28">
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-brand-500/70 to-mint-600/50" />
        <span aria-hidden="true"
          className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-brand-600 shadow-float">
          <span className="cf-play-badge flex items-center justify-center"><Icon name="play" size={20} /></span>
        </span>
        <span className="absolute bottom-2 left-3 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white">
          {session.turns} 轮研讨
        </span>
      </span>
      <span className="relative z-[2] block bg-white/95 px-4 py-3">
        <span className="en-text block truncate text-[13px] font-bold text-ink">{session.chapterTitle}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">
          {session.bookTitle} · {dateText} · {session.role === 'guide' ? '导师主持' : '同伴互评'}
        </span>
        {session.report && (
          <span className="mt-1.5 block line-clamp-2 text-[11px] leading-relaxed text-ink/75">{session.report.summary}</span>
        )}
      </span>
    </button>
  )
}

/* ---------------- 底部悬浮胶囊（书架内部工具条） ---------------- */

export interface FeedDockAction {
  id: string
  icon: 'book' | 'headphones' | 'chart' | 'search' | 'edit'
  label: string
  onOpen: () => void
  disabled?: boolean
}

/** 用 div + role="toolbar"，绝不用 <nav>：底部导航数量被冒烟锁定 */
export function LibraryDock({ actions }: { actions: FeedDockAction[] }) {
  if (!actions.length) return null
  return (
    <div className="lf-dock" role="toolbar" aria-label="书架快捷操作">
      {actions.map((a) => (
        <button key={a.id} type="button" onClick={a.onOpen} disabled={a.disabled}
          className="lf-dock-btn" aria-label={a.label}>
          <Icon name={a.icon} size={15} />
          {a.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- 全屏搜索层（不新增路由） ---------------- */

export interface FeedSearchHit {
  id: string
  kind: '书籍' | '章节' | '研讨' | '批注'
  title: string
  subtitle?: string
  onOpen: () => void
}

export function LibrarySearchSheet({ query, onQueryChange, onClose, hits, hint }: {
  query: string; onQueryChange: (v: string) => void; onClose: () => void
  hits: FeedSearchHit[]; hint: string
}) {
  return (
    <>
      <div className="lf-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="lf-sheet" role="dialog" aria-modal="true" aria-label="搜索书架">
        <div className="flex items-center gap-2 border-b border-brand-50 bg-white px-3 py-2.5">
          <button type="button" onClick={onClose} aria-label="关闭搜索"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Icon name="close" size={17} />
          </button>
          <input className="field !py-2.5" value={query} onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索书名、章节、研讨或批注…" aria-label="搜索书架内容" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-24 pt-3">
          {hits.length === 0 ? (
            <p className="px-1 py-10 text-center text-xs text-muted">{hint}</p>
          ) : (
            <ul className="space-y-1.5">
              {hits.map((h) => (
                <li key={`${h.kind}-${h.id}`}>
                  <button type="button" onClick={h.onOpen}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-card transition hover:bg-brand-50/50">
                    <span className="shrink-0 rounded-lg bg-brand-50 px-2 py-1 text-[10px] font-black text-brand-600">{h.kind}</span>
                    <span className="min-w-0 flex-1">
                      <span className="en-text block truncate text-[13px] font-bold text-ink">{h.title}</span>
                      {h.subtitle && <span className="mt-0.5 block truncate text-[10px] text-muted">{h.subtitle}</span>}
                    </span>
                    <Icon name="right" size={14} className="shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}

/* ---------------- 空态（信息流区块级） ---------------- */

export function FeedEmpty({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-brand-200 bg-white/60 px-5 py-10 text-center">
      <p className="font-display text-sm font-bold text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[30ch] text-[11px] leading-relaxed text-muted">{desc}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  )
}
