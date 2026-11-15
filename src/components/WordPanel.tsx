import { Chip, Icon } from './ui'
import { OXFORD_DISCLAIMER, type OxfordEntry } from '../data/oxfordGlossary'

interface WordPanelProps {
  entry: OxfordEntry
  alreadySaved: boolean
  compact?: boolean
  onClose: () => void
  onAddToReview: () => void
  onSpeak: () => void
  /** [新增] 一键加入词场队列（不计当日新词上限）；不传则不显示按钮 */
  onAddToWordLab?: () => void
}

/**
 * 阅读页旁侧词典卡。英英释义为主视觉，中文对照与本章原句为辅。
 * 同一份组件同时用于「桌面右侧栏」与「小屏右侧抽屉」，避免两套 DOM。
 */
export function WordPanel({ entry, alreadySaved, compact = false, onClose, onAddToReview, onSpeak, onAddToWordLab }: WordPanelProps) {
  return (
    <section data-word-panel="true" role="dialog" aria-modal="false" aria-label={`${entry.word} 词典释义`}
      className={`card border-brand-100 shadow-float ${compact ? '!p-3.5' : '!p-4'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-widest text-brand-600">DICTIONARY · 词典</p>
          <p className="mt-0.5 text-[10px] text-muted">{compact ? '英英释义优先' : '牛津式词条 · 英英释义优先'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭释义与词典面板" title="关闭（Esc）"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-brand-100 bg-white px-2 py-1 text-[10px] font-bold text-ink transition hover:border-coral-200 hover:bg-coral-100 hover:text-coral-600">
          关闭<Icon name="close" size={12} />
        </button>
      </div>

      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="en-text break-words font-display text-xl font-black leading-tight text-ink">{entry.word}</h3>
          <p className="mt-1 break-words text-[11px] leading-relaxed text-muted">
            {entry.ipa || '—'}{entry.pos ? ` · ${entry.pos}` : ''}
          </p>
        </div>
        <button type="button" onClick={onSpeak} aria-label="朗读这个单词" title="朗读单词"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100">
          <Icon name="speaker" size={15} />
        </button>
      </div>

      {entry.register && (
        <div className="mt-2"><Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">语域 · {entry.register}</Chip></div>
      )}

      {/* 英英释义：整张卡的主角 */}
      <div className="mt-3 rounded-2xl bg-brand-50/80 p-3">
        <p className="text-[10px] font-bold tracking-widest text-brand-600">ENGLISH DEFINITION</p>
        {entry.defEn ? (
          <p className="en-text mt-1.5 text-[13px] font-semibold leading-relaxed text-ink">{entry.defEn}</p>
        ) : (
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            本词暂未收录英英释义，下方只展示本章已有的中文对照与语境，不臆造词典解释。
          </p>
        )}
      </div>

      {entry.defZh && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink/80">
          <b className="font-bold text-ink">中文对照 · </b>{entry.defZh}
        </p>
      )}

      {entry.chapterSentence && (
        <div className="mt-3 rounded-2xl border border-mint-200 bg-mint-100/50 p-3">
          <p className="text-[10px] font-bold tracking-widest text-mint-700">本章原句 · 原文</p>
          <p className="en-text mt-1.5 text-[11px] leading-relaxed text-ink/85">“{entry.chapterSentence}”</p>
        </div>
      )}

      {entry.example && (
        <div className="mt-2.5">
          <p className="text-[10px] font-bold tracking-widest text-muted">学习例句 · 非原文</p>
          <p className="en-text mt-1 text-[11px] leading-relaxed text-ink/75">{entry.example}</p>
        </div>
      )}

      {(entry.forms || entry.collocations || entry.extraNote) && (
        <div className="mt-3 space-y-1.5 border-t border-brand-50 pt-2.5 text-[10px] leading-relaxed text-muted">
          {entry.forms && <p><b className="font-bold text-ink/80">词形 </b>{entry.forms}</p>}
          {entry.collocations && <p><b className="font-bold text-ink/80">搭配 </b>{entry.collocations}</p>}
          {entry.extraNote && <p><b className="font-bold text-ink/80">用法 </b>{entry.extraNote}</p>}
        </div>
      )}

      {entry.chapterNote && (
        <p className="mt-2.5 rounded-xl bg-slate-100/70 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
          <b className="font-bold text-ink/80">本章语境 · </b>{entry.chapterNote}
        </p>
      )}

      <button type="button" onClick={onAddToReview}
        className="btn-primary mt-3 w-full !px-3 !py-2 !text-[11px]">
        <Icon name="plus" size={13} />{alreadySaved ? '更新到复习队列' : '加入复习队列'}
      </button>

      {onAddToWordLab && (
        <button type="button" onClick={onAddToWordLab}
          className="btn-ghost mt-2 w-full !px-3 !py-2 !text-[11px]">
          <Icon name="sparkles" size={13} />一键加入词场队列
        </button>
      )}

      <p className="mt-2.5 border-t border-brand-50 pt-2 text-[10px] leading-relaxed text-muted">
        {OXFORD_DISCLAIMER}
      </p>
    </section>
  )
}

/** 桌面右侧栏在没选词时的引导卡 */
export function WordGuide() {
  return (
    <div data-word-guide="true" className="card !p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon name="book" size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-widest text-brand-600">DICTIONARY</p>
          <p className="text-[11px] font-bold text-ink">生词词典</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        点正文里的<span className="lit-word mx-0.5 px-0.5">蓝色生词</span>，词典会在这里展开：音标、词性、英英释义、本章原句与搭配，还能直接加入复习队列。
      </p>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">按 Esc 或点卡片右上角 × 可随时收起。</p>
    </div>
  )
}
