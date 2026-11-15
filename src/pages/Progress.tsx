import { useApp, useDerived } from '../store/useAppStore'
import { ACHIEVEMENTS } from '../data/mockData'
import { formatDate } from '../lib/utils'
import { todayKey } from '../lib/storage'
import { bandProgress, getIeltsLevel } from '../data/ieltsLevels'
import { summarizeVoice } from '../services/voiceAssessor'
import { IeltsBandChip, IeltsDimensionBars, IeltsLadder } from '../components/IeltsBits'
import { VoiceEmptyHint, VoiceTrendBars } from '../components/VoiceFeedback'
import { Card, Chip, EmptyState, Icon, ProgressBar, ProgressRing, SectionTitle } from '../components/ui'

export function Progress() {
  const { data, navigate } = useApp()
  const { totalTurns, coveredWords } = useDerived()
  const { profile } = data
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

  return (
    <div className="animate-in space-y-5">
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

      {/* 雅思段位路径 */}
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

      {/* 发音表现趋势 */}
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

      {/* 游戏化路径 */}
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

      {/* 成就 */}
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

      {/* 会话历史 */}
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
}
