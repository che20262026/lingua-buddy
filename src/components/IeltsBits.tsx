import type { IeltsDimensionKey, IeltsLevel, IeltsLevelId } from '../data/ieltsLevels'
import { IELTS_DIMENSIONS, IELTS_LEVELS } from '../data/ieltsLevels'
import { cn } from '../lib/utils'
import { Chip, Icon, ProgressBar } from './ui'

/** 段位徽章：Band 区间 + 档位名 + CEFR */
export function IeltsBandChip({ level, className = '' }: { level: IeltsLevel; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-bold text-brand-600', className)}>
      <span>{level.emblem}</span>
      <span>IELTS {level.band}</span>
      <span className="text-brand-400">·</span>
      <span>{level.name}</span>
      <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px]">{level.cefr}</span>
    </span>
  )
}

/** 官方四维度练习参考分（0–9） */
export function IeltsDimensionBars({ dimensions, compact = false }: {
  dimensions: Record<IeltsDimensionKey, number>
  compact?: boolean
}) {
  return (
    <div className="space-y-2.5">
      {IELTS_DIMENSIONS.map((d) => (
        <div key={d.key}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
              <span>{d.emblem}</span>{d.zh}
              {!compact && <span className="font-normal text-muted">· {d.en}</span>}
            </span>
            <span className="font-display text-sm font-black text-brand-600">{dimensions[d.key].toFixed(1)}</span>
          </div>
          <ProgressBar value={dimensions[d.key] / 9} />
          {!compact && <p className="mt-1 text-[10px] leading-relaxed text-muted">{d.desc}</p>}
        </div>
      ))}
    </div>
  )
}

/** 六档阶梯：展示 Band 4 → 9 的路径，可点击切换目标档 */
export function IeltsLadder({ currentId, onSelect }: {
  currentId: IeltsLevelId
  onSelect?: (id: IeltsLevelId) => void
}) {
  const currentIndex = IELTS_LEVELS.findIndex((l) => l.id === currentId)
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {IELTS_LEVELS.map((l, i) => {
        const active = l.id === currentId
        const passed = i < currentIndex
        const cls = cn('rounded-2xl border p-2.5 text-center transition',
          active ? 'border-brand-400 bg-brand-500 text-white shadow-soft'
            : passed ? 'border-mint-400/40 bg-mint-100/60 text-ink'
              : 'border-brand-50 bg-white text-muted',
          onSelect && !active && 'hover:border-brand-300')
        const inner = (
          <>
            <div className="text-lg">{l.emblem}</div>
            <p className={cn('font-display mt-0.5 text-xs font-black', active ? 'text-white' : 'text-ink')}>{l.band}</p>
            <p className={cn('mt-0.5 text-[10px] leading-tight', active ? 'text-white/85' : 'text-muted')}>{l.name}</p>
            {active && <p className="mt-1 text-[9px] font-bold opacity-90">当前目标</p>}
            {passed && !active && <p className="mt-1 flex items-center justify-center gap-0.5 text-[9px] font-bold text-mint-600"><Icon name="check" size={10} />已越过</p>}
          </>
        )
        return onSelect
          ? <button key={l.id} type="button" onClick={() => onSelect(l.id)} className={cls}>{inner}</button>
          : <div key={l.id} className={cls}>{inner}</div>
      })}
    </div>
  )
}

/** 一档之差的表达示范 */
export function IeltsUpgradeExample({ level }: { level: IeltsLevel }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-brand-600">
        <Icon name="sparkles" size={13} />往上一档，表达可以这样变
      </p>
      <p className="en-text text-xs text-muted line-through decoration-coral-400/70">{level.upgrade.from}</p>
      <div className="my-1.5 flex items-center gap-1.5 text-brand-400"><Icon name="down" size={12} /></div>
      <p className="en-text text-xs font-semibold text-ink">{level.upgrade.to}</p>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">{level.upgrade.note}</p>
    </div>
  )
}

/** 对话生成参数可视化 */
export function IeltsDialogueSpec({ level }: { level: IeltsLevel }) {
  const c = level.dialogue
  const items = [
    { label: 'AI 回复', value: `${c.sentences} 句以内` },
    { label: '单句长度', value: `约 ${c.wordsPerSentence} 词` },
    { label: '你每轮', value: `建议 ${c.userTargetLength} 词` },
    { label: '目标词', value: `每轮 ${c.targetWordsPerRound} 个` },
    { label: '建议轮次', value: `${c.rounds} 轮` },
    { label: '纠错', value: c.correction === 'gentle' ? '轻轻提点' : c.correction === 'balanced' ? '恰到好处' : '细致一些' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl bg-white/70 px-2.5 py-2">
          <p className="text-[10px] text-muted">{it.label}</p>
          <p className="mt-0.5 text-xs font-bold text-ink">{it.value}</p>
        </div>
      ))}
    </div>
  )
}

/** 档位顶部小标，供多处复用 */
export function IeltsLevelHeader({ level }: { level: IeltsLevel }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip tone="brand">IELTS Speaking {level.band}</Chip>
      <Chip tone="mint">CEFR {level.cefr}</Chip>
      <Chip tone="sun">XP ×{level.xpMultiplier.toFixed(2).replace(/0$/, '')}</Chip>
    </div>
  )
}
