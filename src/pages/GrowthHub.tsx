/**
 * [任务B] 成长 · 进度合并页 —— 一个入口、一页承载，三 Tab 切换。
 *
 * 数据层零改动：本页只读取 useApp / useDerived / services/growth，
 * 不写任何键、不调用 awardXp、不碰成就倒排索引。所有区块从原
 * Progress.tsx / GrowthHome.tsx / AchievementsPage.tsx 逐字搬运展示逻辑。
 *
 * 默认 Tab 由当前 view 决定（无需改 store 的 navigate / NavParams）：
 *   view === 'progress'     → 趋势（原进度页落点）
 *   view === 'achievements' → 成就（原成就页落点）
 *   其余（growth 等）        → 概览（原成长页落点）
 * 旧三个路径 progress / growth / achievements 都渲染本页，均不 404、不空白。
 */
import { useState } from 'react'
import { useApp, useDerived } from '../store/useAppStore'
import { ACHIEVEMENTS } from '../data/mockData'
import { ACHIEVEMENT_TOTAL } from '../data/achievementSeed'
import { formatDate } from '../lib/utils'
import { todayKey } from '../lib/storage'
import { bandProgress, getIeltsLevel } from '../data/ieltsLevels'
import { summarizeVoice } from '../services/voiceAssessor'
import {
  FREEZE_CARDS_PER_MONTH, NO_XP_ACTIONS, XP_RULES, levelName, requiredXp,
  type Achievement, type AchievementCategory,
} from '../growthTypes'
import { dateKey, lastNDays, levelInfo, recentAchievements, todayXp } from '../services/growth'
import { IeltsBandChip, IeltsDimensionBars, IeltsLadder } from '../components/IeltsBits'
import { VoiceEmptyHint, VoiceTrendBars } from '../components/VoiceFeedback'
import { Card, Chip, EmptyState, Icon, ProgressBar, ProgressRing, SectionTitle } from '../components/ui'

type HubTab = 'overview' | 'trend' | 'achievements'
type AchTab = 'all' | AchievementCategory

const HUB_TABS: Array<{ id: HubTab; label: string; icon: 'star' | 'chart' | 'trophy' }> = [
  { id: 'overview', label: '概览', icon: 'star' },
  { id: 'trend', label: '趋势', icon: 'chart' },
  { id: 'achievements', label: '成就', icon: 'trophy' },
]

const ACH_TABS: Array<{ id: AchTab; label: string }> = [
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
const HEAT_TONES = ['bg-slate-100', 'bg-mint-100', 'bg-mint-400/60', 'bg-brand-300', 'bg-brand-600'] as const
function toneOf(v: number): string {
  if (!v) return HEAT_TONES[0]
  if (v < 10) return HEAT_TONES[1]
  if (v < 25) return HEAT_TONES[2]
  if (v < 50) return HEAT_TONES[3]
  return HEAT_TONES[4]
}
function heatmapCells(days: string[], values: Record<string, number>): Array<{ day: string; value: number } | null> {
  const pad = days.length ? new Date(`${days[0]}T00:00:00Z`).getUTCDay() : 0
  const cells: Array<{ day: string; value: number } | null> = Array.from({ length: pad }, () => null)
  for (const day of days) cells.push({ day, value: values[day] ?? 0 })
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
function achStatus(a: Achievement): { label: string; tone: 'sun' | 'brand' | 'slate' } {
  if (a.unlocked) return { label: '已解锁', tone: 'sun' }
  if (a.progress > 0) return { label: '进行中', tone: 'brand' }
  return { label: '未开始', tone: 'slate' }
}

export function GrowthHub() {
  const { data, navigate, view } = useApp()
  const { totalTurns, coveredWords } = useDerived()
  const [tab, setTab] = useState<HubTab>(
    view === 'progress' ? 'trend' : view === 'achievements' ? 'achievements' : 'overview',
  )
  const [achTab, setAchTab] = useState<AchTab>('all')

  /* ===== 一次性读取数据派生（Tab 切换不重算、不重拉） ===== */
  const profile = data.profile
  const finished = data.sessions.filter((s) => s.finishedAt)
  const mastered = data.mistakes.filter((m) => m.mastered).length
  const dailyPct = Math.min(1, profile.todayXp / Math.max(profile.dailyGoal, 1))
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000)
    const key = todayKey(d)
    const turns = data.sessions
      .filter((s) => todayKey(new Date(s.createdAt)) === key)
      .reduce((sum, s) => sum + s.turns, 0)
    return { key, label: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()], turns }
  })
  const maxTurns = Math.max(1, ...days.map((d) => d.turns))
  const targetLevel = getIeltsLevel(data.settings.ieltsLevel)
  const latestIelts = data.sessions.find((s) => s.report?.ielts)?.report?.ielts
  const voiceSummary = summarizeVoice(data.voiceReports, targetLevel)
  const path = [
    { title: '贴上第一段文本', desc: '让 TextAnalyzerAgent 认识你的兴趣', done: data.texts.length > 0 },
    { title: '完成第一场对话', desc: '和 AI 角色把话说出口', done: finished.length > 0 },
    { title: '覆盖 10 个目标词', desc: '把生词变成自己的表达', done: coveredWords >= 10 },
    { title: '连续学习 3 天', desc: '让节奏慢慢长出来', done: profile.streak >= 3 },
    { title: '积累 100 XP', desc: '解锁下一段冒险', done: profile.xp >= 100 },
  ]
  const nextIndex = path.findIndex((p) => !p.done)

  const bundle = {
    growth: data.growth,
    achievements: data.achievementsState,
    ledger: data.xpLedger,
    heatmap: data.activityHeatmap,
  }
  const lv = levelInfo(data.growth)
  const today = dateKey()
  const todayAmount = todayXp(bundle, today)
  const goal = Math.max(1, data.profile.dailyGoal || 30)
  const day90 = lastNDays(90)
  const cells = heatmapCells(day90, data.activityHeatmap.days ?? {})
  const activeDays = day90.filter((d) => (data.activityHeatmap.days?.[d] ?? 0) > 0).length
  const recent = recentAchievements(bundle, 8)
  const unlockedCount = data.achievementsState.items.filter((a) => a.unlocked).length
  const todayEntries = data.xpLedger.entries.filter((e) => e.at.slice(0, 10) === today).slice(-6).reverse()

  const achItems = data.achievementsState.items
  const achShown = achTab === 'all' ? achItems : achItems.filter((a) => a.category === achTab)
  const achUnlocked = achItems.filter((a) => a.unlocked).length

  /* ===== 概览 Tab（原 GrowthHome 全部区块） ===== */
  const Overview = () => (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-brand-50/70 to-mint-100/60 p-5 shadow-card" data-testid="growth-home">
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

      <Card>
        <SectionTitle title="最近获得的成就" subtitle={`已解锁 ${unlockedCount} / ${data.achievementsState.items.length} 枚`}
          right={<button type="button" onClick={() => setTab('achievements')} className="btn-ghost !px-3 !py-1.5 !text-xs">全部成就 →</button>} />
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

  /* ===== 趋势 Tab（原 Progress 全部区块） ===== */
  const Trend = () => (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-gradient-to-br from-brand-500 via-brand-600 to-[#5b46c9] p-6 text-white shadow-float">
        <p className="text-xs font-bold tracking-widest opacity-80">YOUR ADVENTURE</p>
        <h1 className="font-display mt-1 text-2xl font-black">学习进度</h1>
        <p className="mt-1.5 text-xs opacity-85">每一次开口，都在这条路上留下一个小脚印。</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '总 XP', value: profile.xp, icon: 'star' as const },
            { label: '连续天数', value: profile.streak, icon: 'flame' as const },
            { label: '完成对话', value: finished.length, icon: 'flag' as const },
            { label: '累计轮次', value: totalTurns, icon: 'chart' as const },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-white/12 p-3">
              <Icon name={s.icon} size={15} className="opacity-80" />
              <p className="font-display mt-1.5 text-xl font-black">{s.value}</p>
              <p className="text-[10px] opacity-80">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <Card>
        <SectionTitle title="雅思口语段位路径" subtitle="Band 4 → 9 六档难度，目标档位决定 AI 的句长、用词与反馈维度。"
          right={<IeltsBandChip level={targetLevel} />} />
        <IeltsLadder currentId={data.settings.ieltsLevel} />
        {latestIelts ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/60 p-4">
              <p className="text-[11px] font-bold text-muted">最近一场练习参考</p>
              <p className="font-display mt-1 text-4xl font-black text-brand-600">Band {latestIelts.band.toFixed(1)}</p>
              <p className="mt-1 text-[11px] text-muted">目标 Band {latestIelts.targetBand.toFixed(1)} · {targetLevel.name}</p>
              <ProgressBar value={bandProgress(latestIelts.band)} className="mt-3" />
              <p className="mt-2 text-[10px] leading-relaxed text-muted">四项维度等权换算，非官方评分。</p>
            </div>
            <div className="rounded-2xl border border-brand-50 p-4">
              <p className="mb-2 text-[11px] font-bold text-ink">四项维度参考分</p>
              <IeltsDimensionBars dimensions={latestIelts.dimensions} compact />
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-brand-50/70 p-3 text-center text-[11px] leading-relaxed text-muted">
            完成一场对话后，这里会显示你的四维度参考分与升级重点。
          </p>
        )}
        <button type="button" onClick={() => navigate('settings')} className="btn-ghost mt-4 w-full !py-2 !text-xs">
          <Icon name="gear" size={14} />去设置目标档位
        </button>
      </Card>

      <Card>
        <SectionTitle title="发音表现趋势" subtitle="每段录音的 FC / PR 练习参考分；同设备、相近环境下看趋势更可信。"
          right={<Chip tone="brand">{data.voiceReports.length} 段评测</Chip>} />
        {voiceSummary ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/50 p-2.5">
                <p className="text-[9px] font-bold text-muted">平均参考分</p>
                <p className="font-display mt-0.5 text-xl font-black text-brand-600">{voiceSummary.avgBand.toFixed(1)}</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/50 p-2.5">
                <p className="text-[9px] font-bold text-muted">平均语速</p>
                <p className="font-display mt-0.5 text-xl font-black text-ink">{voiceSummary.avgWpm}<span className="ml-0.5 text-[10px]">wpm</span></p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/50 p-2.5">
                <p className="text-[9px] font-bold text-muted">近半程变化</p>
                <p className={`font-display mt-0.5 text-xl font-black ${voiceSummary.trend > 0.15 ? 'text-mint-600' : voiceSummary.trend < -0.15 ? 'text-coral-600' : 'text-ink'}`}>
                  {voiceSummary.trend > 0 ? '+' : ''}{voiceSummary.trend.toFixed(1)}
                </p>
              </div>
            </div>
            <div className="mt-3"><VoiceTrendBars items={data.voiceReports} level={targetLevel} /></div>
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-sun-100/60 px-2.5 py-2 text-[10px] leading-relaxed text-[#8a5b08]">
              <Icon name="bulb" size={12} className="mt-0.5 shrink-0" />下一阶段重点：{voiceSummary.focus}
            </p>
            <p className="mt-2 text-[9px] leading-relaxed text-muted">练习参考分，非官方雅思评分；浏览器无法判断音素准确度与口音。</p>
          </>
        ) : <VoiceEmptyHint />}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex items-center gap-4">
          <div className="rounded-full bg-brand-50 p-1">
            <ProgressRing value={dailyPct} label={`${profile.todayXp}`} sub={`/ ${profile.dailyGoal}`} size={84} />
          </div>
          <div>
            <p className="font-display text-sm font-bold text-ink">今日目标</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{dailyPct >= 1 ? '今天已经达标，超棒！' : `再拿 ${Math.max(0, profile.dailyGoal - profile.todayXp)} XP 就点亮进度环。`}</p>
            <ProgressBar value={dailyPct} className="mt-2" />
          </div>
        </Card>
        <Card>
          <p className="text-xs font-bold text-muted">最近 7 天活跃度</p>
          <div className="mt-3 flex h-20 items-end justify-between gap-1.5">
            {days.map((d) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t-lg bg-gradient-to-t from-brand-400 to-mint-400 transition-all"
                  style={{ height: `${Math.max(6, (d.turns / maxTurns) * 62)}px`, opacity: d.turns ? 1 : 0.22 }} />
                <span className="text-[10px] text-muted">{d.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted">按当天对话轮次统计</p>
        </Card>
      </div>

      <section>
        <SectionTitle title="冒险路径" subtitle="不赶进度，一格一格往前走就好。" right={<Chip tone="brand">{path.filter((p) => p.done).length}/{path.length}</Chip>} />
        <div className="space-y-2.5">
          {path.map((p, i) => (
            <div key={p.title} className={`card flex items-center gap-3 p-4 ${p.done ? '!bg-mint-100/40' : ''} ${i === nextIndex ? '!border-brand-300 ring-2 ring-brand-100' : ''}`}>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${p.done ? 'bg-mint-500 text-white' : i === nextIndex ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>
                <Icon name={p.done ? 'check' : i === nextIndex ? 'flag' : 'target'} size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{p.title}</p>
                <p className="text-xs text-muted">{p.desc}</p>
              </div>
              {i === nextIndex && <Chip tone="sun">进行中</Chip>}
              {p.done && <Chip tone="mint">已完成</Chip>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="成就徽章" subtitle={`已解锁 ${profile.achievements.length} / ${ACHIEVEMENTS.length} 枚`} right={<Chip tone="sun"><Icon name="trophy" size={12} />{coveredWords} 词已覆盖</Chip>} />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const got = profile.achievements.includes(a.id)
            return (
              <div key={a.id} className={`card p-3 text-center ${got ? '' : 'opacity-55 grayscale'}`}>
                <div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-2xl text-xl ${got ? 'bg-sun-100' : 'bg-slate-100'}`}>{a.emblem}</div>
                <p className="mt-2 text-xs font-bold text-ink">{a.name}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{a.desc}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted">已掌握错题 {mastered} 条 · 复习队列 {data.reviewQueue.length} 张卡片</p>
      </section>

      <section>
        <SectionTitle title="最近的对话" subtitle="点开可以看当时的会话报告。" />
        {data.sessions.length === 0 ? (
          <EmptyState emblem="🚀" title="旅程还没开始" desc="完成第一场对话，这里就会长出第一条记录。"
            action={<button type="button" onClick={() => navigate('home')} className="btn-primary">开始第一场</button>} />
        ) : (
          <div className="space-y-2">
            {data.sessions.slice(0, 8).map((s) => (
              <button key={s.id} type="button"
                onClick={() => s.report ? navigate('report', { sessionId: s.id, scenarioId: s.scenarioId }) : navigate('dialogue', { sessionId: s.id, scenarioId: s.scenarioId })}
                className="card flex w-full items-center gap-3 p-3.5 text-left transition hover:border-brand-300">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon name="text" size={17} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{s.scenarioTitle}</p>
                  <p className="text-[11px] text-muted">{formatDate(s.createdAt)} · {s.turns} 轮 · 覆盖 {s.coveredWords.length} 词</p>
                </div>
                <Chip tone={s.report ? 'mint' : 'sun'}>{s.report ? `掌握度 ${s.report.mastery}` : '进行中'}</Chip>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )

  /* ===== 成就 Tab（原 AchievementsPage 全部区块） ===== */
  const Achievements = () => (
    <div className="space-y-5" data-testid="achievements-page">
      <section className="rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-brand-50/70 to-sun-100/60 p-5 shadow-card">
        <p className="text-[10px] font-black tracking-[0.16em] text-brand-600">ACHIEVEMENTS · 成就图鉴</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black text-ink">{achUnlocked} <span className="text-base font-bold text-muted">/ {ACHIEVEMENT_TOTAL} 枚已点亮</span></h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">成就用来引导行为，不是给已有行为补发奖章；判定只在发放事件发生时触发。</p>
          </div>
        </div>
        <ProgressBar value={ACHIEVEMENT_TOTAL ? achUnlocked / ACHIEVEMENT_TOTAL : 0} className="mt-4" />
      </section>

      <div className="flex flex-wrap gap-1.5">
        {ACH_TABS.map((t) => {
          const count = t.id === 'all' ? achItems.length : achItems.filter((a) => a.category === t.id).length
          const active = achTab === t.id
          return (
            <button key={t.id} type="button" onClick={() => setAchTab(t.id)}
              className={`rounded-xl px-3 py-2 text-[11px] font-bold transition ${active ? 'bg-brand-500 text-white shadow-soft' : 'bg-white/80 text-muted hover:bg-brand-50'}`}>
              {t.label} <span className="opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      <Card>
        <SectionTitle title={`${ACH_TABS.find((t) => t.id === achTab)?.label}成就`} subtitle="隐藏成就在解锁前不会透露条件与进度。"
          right={<Chip tone="mint">{achShown.length} 枚</Chip>} />
        <div className="grid gap-2 sm:grid-cols-2">
          {achShown.map((a) => {
            const hiddenLocked = a.hidden && !a.unlocked
            const st = achStatus(a)
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

  return (
    <div className="animate-in space-y-4" data-testid="growth-hub">
      {/* 三 Tab 分段控件：切换不重拉数据、不重算（派生值都在组件顶层算好） */}
      <div className="flex gap-1.5 rounded-2xl bg-white/80 p-1.5 shadow-sm">
        {HUB_TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition ${
              tab === t.id ? 'bg-brand-500 text-white shadow-soft' : 'text-muted hover:bg-brand-50'}`}>
            <Icon name={t.icon} size={15} />{t.label}
          </button>
        ))}
      </div>
      {/* 只挂载当前 Tab，默认不同时渲染三块，避免首屏卡顿 */}
      {tab === 'overview' && <Overview />}
      {tab === 'trend' && <Trend />}
      {tab === 'achievements' && <Achievements />}
    </div>
  )
}
