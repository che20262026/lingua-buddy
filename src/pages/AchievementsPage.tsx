/**
 * [成长系统] AchievementsPage 成就页
 *
 * 按分类 tab 展示 27 枚成就；已解锁 / 进行中 / 未开始三态区分；
 * 隐藏成就未解锁时只显示「???」和一句模糊提示，绝不显示条件与进度。
 * 本页只读，不触发任何 XP 发放或成就扫描。
 */
import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import { Card, Chip, Icon, ProgressBar, SectionTitle } from '../components/ui'
import type { Achievement, AchievementCategory } from '../growthTypes'
import { ACHIEVEMENT_TOTAL } from '../data/achievementSeed'

type Tab = 'all' | AchievementCategory

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'onboarding', label: '引导' },
  { id: 'consistency', label: '坚持' },
  { id: 'depth', label: '深度' },
  { id: 'breadth', label: '广度' },
  { id: 'hidden', label: '隐藏' },
]

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  onboarding: '引导型', consistency: '坚持型', depth: '深度型',
  breadth: '广度型', hidden: '隐藏型',
}

function statusOf(a: Achievement): { label: string; tone: 'sun' | 'brand' | 'slate' } {
  if (a.unlocked) return { label: '已解锁', tone: 'sun' }
  if (a.progress > 0) return { label: '进行中', tone: 'brand' }
  return { label: '未开始', tone: 'slate' }
}

export function AchievementsPage() {
  const { data, navigate } = useApp()
  const [tab, setTab] = useState<Tab>('all')
  const items = data.achievementsState.items
  const shown = tab === 'all' ? items : items.filter((a) => a.category === tab)
  const unlocked = items.filter((a) => a.unlocked).length

  return (
    <div className="animate-in space-y-5" data-testid="achievements-page">
      <section className="rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-brand-50/70 to-sun-100/60 p-5 shadow-card">
        <p className="text-[10px] font-black tracking-[0.16em] text-brand-600">ACHIEVEMENTS · 成就图鉴</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black text-ink">{unlocked} <span className="text-base font-bold text-muted">/ {ACHIEVEMENT_TOTAL} 枚已点亮</span></h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">成就用来引导行为，不是给已有行为补发奖章；判定只在发放事件发生时触发。</p>
          </div>
          <button type="button" onClick={() => navigate('growth')} className="btn-ghost !px-3 !py-1.5 !text-xs">
            <Icon name="chart" size={14} />回成长页
          </button>
        </div>
        <ProgressBar value={ACHIEVEMENT_TOTAL ? unlocked / ACHIEVEMENT_TOTAL : 0} className="mt-4" />
      </section>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const count = t.id === 'all' ? items.length : items.filter((a) => a.category === t.id).length
          const active = tab === t.id
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`rounded-xl px-3 py-2 text-[11px] font-bold transition ${active ? 'bg-brand-500 text-white shadow-soft' : 'bg-white/80 text-muted hover:bg-brand-50'}`}>
              {t.label} <span className="opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      <Card>
        <SectionTitle title={`${TABS.find((t) => t.id === tab)?.label}成就`} subtitle="隐藏成就在解锁前不会透露条件与进度。"
          right={<Chip tone="mint">{shown.length} 枚</Chip>} />
        <div className="grid gap-2 sm:grid-cols-2">
          {shown.map((a) => {
            const hiddenLocked = a.hidden && !a.unlocked
            const st = statusOf(a)
            const target = a.condition.type === 'count' ? a.condition.target : 0
            return (
              <div key={a.id} data-testid={hiddenLocked ? 'hidden-locked' : 'achievement-card'}
                className={`min-w-0 rounded-2xl border p-3.5 transition ${a.unlocked
                  ? 'border-sun-100 bg-sun-100/60'
                  : hiddenLocked ? 'border-slate-100 bg-slate-50' : 'border-brand-50 bg-white/70'}`}>
                <div className="flex items-start gap-2.5">
                  <span className={`shrink-0 text-2xl ${hiddenLocked ? 'opacity-50 grayscale' : ''}`}>
                    {hiddenLocked ? '❔' : a.emblem}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-ink">{hiddenLocked ? '???' : a.title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                      {hiddenLocked ? (a.hint || '还没到揭开的时候。') : a.description}
                    </p>
                  </div>
                  <Chip tone={hiddenLocked ? 'slate' : st.tone}>{hiddenLocked ? '未解锁' : st.label}</Chip>
                </div>
                {!hiddenLocked && (
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/70 pt-2">
                    <span className="text-[10px] font-semibold text-muted">{CATEGORY_LABEL[a.category]} · 奖励 +{a.rewardXp} XP</span>
                    {a.condition.type === 'count' ? (
                      <span className="text-[10px] font-bold text-brand-600">{Math.min(a.progress, target)} / {target}</span>
                    ) : (
                      <span className="text-[10px] font-semibold text-muted">
                        {a.condition.type === 'streak' ? `连续 ${a.condition.target} 天` : '组合条件'}
                      </span>
                    )}
                  </div>
                )}
                {!hiddenLocked && a.condition.type === 'count' && (
                  <ProgressBar value={Math.min(1, a.progress / Math.max(target, 1))} className="mt-2" />
                )}
                {a.unlocked && a.unlockedAt && (
                  <p className="mt-2 text-[9px] font-semibold text-muted">解锁于 {a.unlockedAt.slice(0, 10)}</p>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <p className="text-[11px] leading-relaxed text-muted">
          成就条件只依赖可核验的学习事件（完成单元、连续天数、组合条件），不依赖「打开页面次数」「停留时长」等不可信信号。
          解锁奖励同样通过 awardXp() 发放，不会绕过统一入口。
        </p>
      </Card>
    </div>
  )
}
