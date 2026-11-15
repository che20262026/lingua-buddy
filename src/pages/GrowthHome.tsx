/**
 * [成长系统] GrowthHome 成长页
 *
 * 只读展示四键快照：等级 / XP 进度、连续天数与冻结卡、今日目标、
 * 最近 90 天热力图、最近获得的成就。所有写入都发生在 awardXp()，本页不发 XP。
 */
import { useApp } from '../store/useAppStore'
import { Card, Chip, EmptyState, Icon, ProgressBar, SectionTitle } from '../components/ui'
import {
  FREEZE_CARDS_PER_MONTH, NO_XP_ACTIONS, XP_RULES, levelName, requiredXp,
  type GrowthBundle,
} from '../growthTypes'
import { dateKey, lastNDays, levelInfo, recentAchievements, todayXp } from '../services/growth'

const HEAT_TONES = [
  'bg-slate-100',
  'bg-mint-100',
  'bg-mint-400/60',
  'bg-brand-300',
  'bg-brand-600',
] as const

function toneOf(v: number): string {
  if (!v) return HEAT_TONES[0]
  if (v < 10) return HEAT_TONES[1]
  if (v < 25) return HEAT_TONES[2]
  if (v < 50) return HEAT_TONES[3]
  return HEAT_TONES[4]
}

/** 90 天按 7 天一列排布；开头补空格对齐到周日，风格接近 GitHub 贡献图 */
function heatmapCells(days: string[], values: Record<string, number>): Array<{ day: string; value: number } | null> {
  const pad = days.length ? new Date(`${days[0]}T00:00:00Z`).getUTCDay() : 0
  const cells: Array<{ day: string; value: number } | null> = Array.from({ length: pad }, () => null)
  for (const day of days) cells.push({ day, value: values[day] ?? 0 })
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function GrowthHome() {
  const { data, navigate } = useApp()
  const bundle: GrowthBundle = {
    growth: data.growth,
    achievements: data.achievementsState,
    ledger: data.xpLedger,
    heatmap: data.activityHeatmap,
  }
  const lv = levelInfo(data.growth)
  const today = dateKey()
  const todayAmount = todayXp(bundle, today)
  const goal = Math.max(1, data.profile.dailyGoal || 30)
  const days = lastNDays(90)
  const cells = heatmapCells(days, data.activityHeatmap.days ?? {})
  const activeDays = days.filter((d) => (data.activityHeatmap.days?.[d] ?? 0) > 0).length
  const recent = recentAchievements(bundle, 8)
  const unlockedCount = data.achievementsState.items.filter((a) => a.unlocked).length
  const todayEntries = data.xpLedger.entries.filter((e) => e.at.slice(0, 10) === today).slice(-6).reverse()

  return (
    <div className="animate-in space-y-5" data-testid="growth-home">
      {/* 等级总览 */}
      <section className="rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-brand-50/70 to-mint-100/60 p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.16em] text-brand-600">GROWTH · 成长系统</p>
            <h1 className="font-display mt-1 text-2xl font-black text-ink">Lv.{lv.level} · {levelName(lv.level)}</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">累计 {data.growth.xp} XP · 等级曲线 requiredXp(level) = 100 + (level − 1) × 50</p>
          </div>
          <Chip tone="brand">{lv.showNumbers ? `${lv.current} / ${lv.required} XP` : `距下一级 ${Math.round(lv.pct * 100)}%`}</Chip>
        </div>
        <ProgressBar value={lv.pct} className="mt-4" />
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          {lv.showNumbers
            ? `再获得 ${Math.max(0, lv.required - lv.current)} XP 升到 Lv.${lv.level + 1}；Lv.${lv.level + 1} → Lv.${lv.level + 2} 需要 ${requiredXp(lv.level + 1)} XP。`
            : '30 级之后只展示距下一级的百分比，等级本身没有上限。'}
        </p>
      </section>

      {/* 连续 / 冻结 / 今日 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '连续活跃', value: `${data.growth.streak} 天`, note: `最长 ${data.growth.longestStreak} 天`, icon: 'flame' as const },
          { label: '冻结卡', value: `${data.growth.freezeCards} / ${FREEZE_CARDS_PER_MONTH}`, note: '每月 1 日重置', icon: 'star' as const },
          { label: '今日 XP', value: `${todayAmount}`, note: `目标 ${goal} XP`, icon: 'target' as const },
          { label: '等级', value: `Lv.${lv.level}`, note: levelName(lv.level), icon: 'trophy' as const },
        ].map((it) => (
          <Card key={it.label} className="!p-4">
            <div className="flex items-center gap-1.5 text-brand-500"><Icon name={it.icon} size={15} /><span className="text-[10px] font-bold">{it.label}</span></div>
            <p className="font-display mt-1.5 text-xl font-black text-ink">{it.value}</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{it.note}</p>
          </Card>
        ))}
      </div>

      <div data-testid="growth-daily-goal" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-50/80 px-4 py-3">
        <p className="text-[11px] font-bold text-brand-700">
          {data.growth.dailyGoalMet ? '今日学习目标已达成，+20 XP 已自动入账 ✨' : `再获得 ${Math.max(0, goal - todayAmount)} XP 即可达成今日目标`}
        </p>
        <p className="text-[10px] font-semibold text-muted">进度 {Math.min(100, Math.round((todayAmount / goal) * 100))}%</p>
      </div>

      {/* 90 天热力图 */}
      {data.settings.showHeatmap ? (
        <Card testId="growth-heatmap">
          <SectionTitle title="最近 90 天 · 活跃热力图"
            subtitle="只记录完成学习单元的日子；浏览页面、翻卡、查看释义都不算活跃。"
            right={<Chip tone="mint">{activeDays} 个活跃日</Chip>} />
          <div className="overflow-x-auto pb-1">
            <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
              {cells.map((cell, i) => cell ? (
                <div key={cell.day} title={`${cell.day} · ${cell.value} XP`} aria-label={`${cell.day} ${cell.value} XP`}
                  className={`h-3 w-3 rounded-[3px] ${toneOf(cell.value)}`} />
              ) : <div key={`pad-${i}`} className="h-3 w-3" />)}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-muted">
            <span>少</span>
            {HEAT_TONES.map((t) => <span key={t} className={`h-3 w-3 rounded-[3px] ${t}`} />)}
            <span>多</span>
            <span className="ml-2">按学习语义配色：浅绿 → 深蓝，越深表示当天 XP 越多</span>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-xs font-semibold text-muted">热力图已在设置页关闭；等级、连续天数与成就不受影响。</p>
        </Card>
      )}

      {/* 最近成就 */}
      <Card>
        <SectionTitle title="最近获得的成就" subtitle={`已解锁 ${unlockedCount} / ${data.achievementsState.items.length} 枚`}
          right={<button type="button" onClick={() => navigate('achievements')} className="btn-ghost !px-3 !py-1.5 !text-xs">全部成就 →</button>} />
        {recent.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recent.map((a) => (
              <div key={a.id} className="min-w-[132px] shrink-0 rounded-2xl bg-sun-100/70 px-3 py-2.5 text-center">
                <p className="text-2xl">{a.emblem}</p>
                <p className="mt-1 text-[11px] font-black text-ink">{a.title}</p>
                <p className="mt-0.5 text-[9px] text-muted">{a.unlockedAt?.slice(0, 10)}</p>
              </div>
            ))}
          </div>
        ) : <EmptyState emblem="🌱" title="还没有解锁的成就" desc="完成第一个词、第一轮有效对话，就会点亮第一枚。" />}
      </Card>

      {/* 今日账本明细 */}
      <Card testId="growth-today-ledger">
        <SectionTitle title="今日入账明细" subtitle="每条都带唯一事件 ID，刷新、重进、多标签页都不会重复发放。" />
        {todayEntries.length ? (
          <div className="space-y-1.5">
            {todayEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2">
                <p className="min-w-0 truncate text-[10px] font-semibold text-muted">{e.action} · {e.id}</p>
                <span className="shrink-0 text-[11px] font-black text-brand-600">+{e.amount}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[11px] leading-relaxed text-muted">今天还没有入账记录，去完成一个学习单元吧。</p>}
      </Card>

      {/* 规则与边界 */}
      <Card>
        <SectionTitle title="XP 规则 · 只奖励完成单元" subtitle="规则表由统一入口 awardXp(event) 执行；限流与 XP 同向，不诱导刷量。" />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {[
            ['完整走完一个词（S1→S3）', `${XP_RULES.word_complete} XP`],
            ['拼错后重拼正确', `+${XP_RULES.spelling_retry} XP`],
            ['一轮有效对话 / 讨论', `${XP_RULES.round_effective} XP · 单场景上限 20`],
            ['完成一个对话场景', `${XP_RULES.scene_finish} XP · 同场景一次`],
            ['完成 ≥4 轮研讨 / 观后讨论', `${XP_RULES.seminar_finish} XP · 同章节 / 视频一次`],
            ['一个复习批次（10 次作答）', `${XP_RULES.review_batch} XP · 每日 3 次`],
            ['达成当日目标', `${XP_RULES.daily_goal} XP · 每日一次`],
            ['连续天数里程碑', '3 / 7 / 14 / 30 / 60 / 100 / 180 / 365 天'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 rounded-xl bg-brand-50/60 px-3 py-2">
              <span className="text-[10px] font-semibold text-ink/80">{k}</span>
              <span className="shrink-0 text-[10px] font-black text-brand-600">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-muted">
          明确不发 XP：{NO_XP_ACTIONS.join('、')}。达到每日新词上限后不再发新词 XP，复习批次照常发放。
        </p>
        <p className="mt-2 rounded-2xl bg-sun-100/60 px-3 py-2.5 text-[10px] leading-relaxed text-[#8a5b08]">
          MVP 限制：活跃日使用本机本地日期（YYYY-MM-DD）判定，本地时间可被手动篡改；当前不做服务端校验、不做加密混淆、不做反作弊弹窗。未来服务端化时迁移该判定。
        </p>
      </Card>
    </div>
  )
}
