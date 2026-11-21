/* ================================================================
 * 扩展目录展示卡：书籍元数据卡 / 电影演示卡
 *
 * 纯展示组件，只接 props；不读 store、不写 localStorage、不发 XP。
 * 全部复用项目既有 brand / mint / sun / coral 色阶与 Card / Chip / Icon 原子。
 *
 * 交互约定：
 *  - 书籍元数据卡没有全文，不进 Reader（避免 getChapter 找不到）；
 *    点击展开内联详情，给出「到古登堡计划查看」官方外链。
 *  - 电影卡为演示数据：只给官方预告片搜索外链，绝不渲染 iframe 播放器，
 *    且必须显示「演示数据 · 官方预告」标注。
 * ================================================================ */

import { useState } from 'react'
import type { BookCatalogEntry } from '../data/expanded/bookCatalog'
import type { MovieEntry } from '../data/expanded/moviesCatalog'
import { BookCover } from './LiteraryBits'
import { Chip, Icon } from './ui'
import { cn } from '../lib/utils'

/* ---------------- 书籍元数据卡 ---------------- */

export function CatalogBookCard({ entry }: { entry: BookCatalogEntry }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn('card overflow-hidden transition', open && 'border-brand-300')}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-brand-50/40">
        <BookCover emblem={entry.cover.emblem} from={entry.cover.from} to={entry.cover.to} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="en-text truncate text-sm font-bold text-ink">{entry.title}</p>
            <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">{entry.cefrLevel}</Chip>
          </div>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-brand-600">{entry.titleCn}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {entry.author} · {entry.year || '年代未标注'} · {entry.tags.slice(0, 3).join(' / ')}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{entry.intro.zh}</p>
        </div>
        <Icon name={open ? 'close' : 'right'} size={16} className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="animate-in border-t border-brand-50 px-4 pb-4 pt-3">
          <p className="en-text text-xs italic leading-relaxed text-ink/80">{entry.intro.en}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">{entry.intro.zh}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {entry.tags.map((t) => <Chip key={t} tone="mint" className="!px-2 !py-0.5 !text-[10px]">{t}</Chip>)}
          </div>
          <p className="mt-2.5 rounded-xl bg-sun-100/50 px-3 py-2 text-[10px] leading-relaxed text-[#8a5b08]">
            公版依据：{entry.publicDomainBasis}。本条仅含元数据，无内置章节全文。
          </p>
          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="btn-ghost mt-3 w-full !py-2 !text-xs">
            到古登堡计划查看该书 <Icon name="right" size={13} />
          </a>
        </div>
      )}
    </div>
  )
}

/* ---------------- 电影卡（点击打开播放 / 详情弹窗） ---------------- */

export function MovieCard({ movie, onOpen }: { movie: MovieEntry; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`查看 ${movie.titleCn} 详情`}
      className="card flex w-full items-start gap-3.5 p-4 text-left transition hover:border-brand-300">
      <img src={movie.posterUrl} alt={`${movie.titleCn} 海报`} loading="lazy"
        className="h-24 w-16 shrink-0 rounded-xl object-cover shadow-soft" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-bold text-ink">{movie.titleCn}</p>
          <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">豆瓣 {movie.doubanRating}</Chip>
        </div>
        <p className="en-text mt-0.5 truncate text-[11px] text-muted">{movie.title} · {movie.year}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{movie.intro.zh}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <Chip tone="coral" className="!px-2 !py-0.5 !text-[10px]">官方预告 · 正版跳转</Chip>
          <span className="text-[10px] font-semibold text-brand-600">{movie.watchPlatform}</span>
        </div>
      </div>
      <Icon name="right" size={16} className="mt-1 shrink-0 text-muted" />
    </button>
  )
}

/* ---------------- 筛选器（书籍目录） ---------------- */

export interface CatalogFilterProps {
  cefr: string
  onCefr: (v: string) => void
  tag: string
  onTag: (v: string) => void
  cefrOptions: Array<{ value: string; count: number }>
  tags: string[]
}

export function CatalogFilter({ cefr, onCefr, tag, onTag, cefrOptions, tags }: CatalogFilterProps) {
  return (
    <div className="space-y-2.5 rounded-2xl bg-white/70 p-3.5 shadow-card">
      <div>
        <p className="mb-1.5 text-[10px] font-bold text-muted">按难度筛选</p>
        <div className="hide-scroll flex gap-1.5 overflow-x-auto pb-1">
          {cefrOptions.map((o) => (
            <button key={o.value} type="button" onClick={() => onCefr(o.value)}
              className={cn('shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-bold transition',
                cefr === o.value ? 'bg-brand-500 text-white shadow-soft' : 'bg-brand-50 text-brand-600 hover:bg-brand-100')}>
              {o.value} <span className="opacity-70">{o.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[10px] font-bold text-muted">按主题筛选</p>
        <div className="hide-scroll flex gap-1.5 overflow-x-auto pb-1">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => onTag(t)}
              className={cn('shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-bold transition',
                tag === t ? 'bg-mint-500 text-white shadow-soft' : 'bg-mint-100/70 text-mint-700 hover:bg-mint-100')}>
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------- 分页控件 ---------------- */

export function CatalogPager({ page, totalPages, onPage }: {
  page: number; totalPages: number; onPage: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-3 py-2" role="toolbar" aria-label="目录分页">
      <button type="button" onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0}
        className="btn-ghost !px-3 !py-2 !text-xs disabled:opacity-40">上一页</button>
      <span className="text-[11px] font-bold text-muted">{page + 1} / {totalPages}</span>
      <button type="button" onClick={() => onPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
        className="btn-ghost !px-3 !py-2 !text-xs disabled:opacity-40">下一页</button>
    </div>
  )
}
