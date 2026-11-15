import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import { speak } from '../lib/speech'
import { bandProgress, getIeltsLevel } from '../data/ieltsLevels'
import { IeltsDimensionBars } from '../components/IeltsBits'
import { VoiceAssessmentCard, VoiceSummaryCard } from '../components/VoiceFeedback'
import { Card, Chip, EmptyState, Icon, ProgressBar, ProgressRing, SectionTitle } from '../components/ui'
/** [成长系统] 报告页展示统一入账的本次 XP 与等级进度 */
import { levelInfo } from '../services/growth'
import { levelName, XP_RULES } from '../growthTypes'

export function Report() {
  const { data, params, navigate } = useApp()
  const session = data.sessions.find((s) => s.id === params.sessionId)
    || data.sessions.find((s) => s.report)
  const report = session?.report
  const [done, setDone] = useState<number[]>([])

  if (!session || !report) {
    return (
      <div className="space-y-4">
        <EmptyState emblem="📋" title="还没有会话报告" desc="完成一场对话后，教练会把新词、好句和复习任务整理在这里。" />
        <button type="button" onClick={() => navigate('home')} className="btn-primary w-full">去开始一场对话</button>
      </div>
    )
  }

  const scenarioId = params.scenarioId || session.scenarioId
  const analysis = data.texts.find((t) => t.id === params.analysisId)
    || data.texts.find((t) => t.scenarios.some((s) => s.id === scenarioId))
  const scenario = analysis?.scenarios.find((s) => s.id === scenarioId)

  return (
    <div className="animate-in space-y-5">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-500 via-brand-600 to-[#5b46c9] p-6 text-white shadow-float">
        <Chip tone="slate" className="bg-white/20 !text-white">✦ SESSION REPORT · 教练手记</Chip>
        <h1 className="font-display mt-3 text-2xl font-black">{session.scenarioTitle}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/85">{report.summary}</p>
        <div className="mt-5 flex flex-wrap items-center gap-5 rounded-2xl bg-white/12 p-4">
          <div className="rounded-full bg-white/95 p-1">
            <ProgressRing value={report.mastery / 100} size={80} label={`${report.mastery}`} sub="掌握度" />
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2 text-center">
            <div><p className="font-display text-xl font-black">+{report.xp}</p><p className="text-[10px] opacity-80">教练估算 XP</p></div>
            <div><p className="font-display text-xl font-black">{session.turns}</p><p className="text-[10px] opacity-80">对话轮次</p></div>
            <div><p className="font-display text-xl font-black">{report.newWords.length}</p><p className="text-[10px] opacity-80">新词覆盖</p></div>
          </div>
        </div>
      </div>

      {/* [成长系统] 会话报告展示统一入账的本次 XP 与等级进度 */}
      {(() => {
        const lv = levelInfo(data.growth)
        const sceneXp = data.xpLedger.entries
          .filter((e) => e.action === 'round_effective' && e.bucket === scenarioId)
          .reduce((sum, e) => sum + e.amount, 0)
          + (data.xpLedger.entries.some((e) => e.id === `dialogue:scene:${scenarioId}:finish`)
            ? XP_RULES.scene_finish : 0)
        return (
          <Card testId="report-growth">
            <SectionTitle title="本次成长记录" subtitle="有效轮次 + 场景完成由统一入口入账；重复完成同一场景不会重复发放。"
              right={<Chip tone="mint">Lv.{lv.level} · {levelName(lv.level)}</Chip>} />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-brand-50/80 px-2 py-3">
                <p className="font-display text-xl font-black text-brand-600">+{sceneXp}</p>
                <p className="text-[10px] font-semibold text-muted">本场景累计 XP</p>
              </div>
              <div className="rounded-2xl bg-mint-100/70 px-2 py-3">
                <p className="font-display text-xl font-black text-mint-600">{data.growth.streak}</p>
                <p className="text-[10px] font-semibold text-muted">连续活跃天数</p>
              </div>
              <div className="rounded-2xl bg-sun-100/70 px-2 py-3">
                <p className="font-display text-xl font-black text-[#8a5b08]">{data.growth.freezeCards}</p>
                <p className="text-[10px] font-semibold text-muted">剩余冻结卡</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] font-bold text-ink">
              距下一级：{lv.showNumbers ? `${lv.current} / ${lv.required} XP` : `${Math.round(lv.pct * 100)}%`}
            </p>
            <ProgressBar value={lv.pct} className="mt-2" />
          </Card>
        )
      })()}

      <div className="flex items-center gap-2 rounded-2xl bg-mint-100/70 px-4 py-3 text-xs font-semibold text-mint-600">
        <Icon name="check" size={16} />已写入错题本与间隔重复队列，刷新页面也不会丢。
      </div>

      {/* 雅思口语段位评估 */}
      {report.ielts && (
        <Card>
          <SectionTitle title="雅思口语段位评估" subtitle="按官方四项评分维度，把这场对话换算成练习参考分。"
            right={<Chip tone="coral">IELTS SPEAKING</Chip>} />
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/60 p-4">
            <div className="rounded-full bg-white p-1 shadow-card">
              <ProgressRing value={bandProgress(report.ielts.band)} label={report.ielts.band.toFixed(1)} sub="参考 Band" size={96} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-black text-ink">
                目标 {getIeltsLevel(data.settings.ieltsLevel).band} · {getIeltsLevel(data.settings.ieltsLevel).name}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {report.ielts.band >= report.ielts.targetBand
                  ? '本次表现已达到或超过目标档，可以试着把目标往上调半档。'
                  : `距离目标还差 ${(report.ielts.targetBand - report.ielts.band).toFixed(1)} 分，优先补最弱的一项。`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone="brand">掌握度 {report.mastery}</Chip>
                <Chip tone="mint">+{report.xp} XP（含档位系数）</Chip>
              </div>
            </div>
          </div>
          <div className="mt-4"><IeltsDimensionBars dimensions={report.ielts.dimensions} /></div>
          <div className="mt-4 rounded-2xl bg-sun-100/50 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#a56a08]"><Icon name="target" size={14} />升级建议</p>
            <ul className="space-y-1">
              {report.ielts.advice.map((a) => (
                <li key={a} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink/75">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sun-400" />{a}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted">⚠️ {report.ielts.disclaimer}</p>
        </Card>
      )}

      {/* 语音评判：有真实录音时，FC / PR 已并入上面的四维度评估 */}
      {report.voice ? (
        <section className="space-y-2">
          <SectionTitle title="发音表现" subtitle="本场录音的声学特征已写进上面的 FC / PR 参考分。" />
          <VoiceSummaryCard summary={report.voice} level={getIeltsLevel(data.settings.ieltsLevel)} title="本场发音表现" />
          {report.voice.latest && (
            <VoiceAssessmentCard assessment={report.voice.latest}
              level={getIeltsLevel(data.settings.ieltsLevel)} title="最后一段发声" />
          )}
        </section>
      ) : (
        <div className="rounded-2xl bg-brand-50/70 p-3 text-[11px] leading-relaxed text-muted">
          🎙 本场没有录音，发音维度为保守占位值。下次在对话页点「发音评测」录一句英文，报告里就会出现语速、停顿与语调的可视化点评。
        </div>
      )}

      <Card>
        <SectionTitle title="这一轮点亮的新词" subtitle="点一下就能听发音；它们已经排进复习队列。" />
        {report.newWords.length ? (
          <div className="flex flex-wrap gap-2">
            {report.newWords.map((w) => (
              <button key={w} type="button" onClick={() => speak(w, data.settings)}
                className="en-text flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-2 text-sm font-bold text-brand-600 hover:bg-brand-100">
                {w}<Icon name="speaker" size={13} />
              </button>
            ))}
          </div>
        ) : <p className="text-xs text-muted">这一轮还没覆盖目标词，下次试着主动用上一两个。</p>}
      </Card>

      <Card>
        <SectionTitle title="说得很棒的句子" subtitle="保留下来，明天跟读一遍会更牢。" />
        <div className="space-y-2">
          {report.goodSentences.map((s) => (
            <div key={s} className="flex items-start gap-3 rounded-2xl bg-mint-100/50 p-3">
              <Icon name="star" size={15} className="mt-0.5 shrink-0 text-mint-600" />
              <p className="en-text flex-1 text-sm leading-relaxed text-ink">{s}</p>
              <button type="button" onClick={() => speak(s, data.settings)} aria-label="朗读好句" className="text-brand-600"><Icon name="speaker" size={15} /></button>
            </div>
          ))}
        </div>
      </Card>

      {report.mainMistakes.length > 0 && (
        <Card>
          <SectionTitle title="值得再打磨的地方" subtitle="只记影响理解的表达，不打分、不羞辱。" right={<Chip tone="coral">{report.mainMistakes.length} 条</Chip>} />
          <div className="space-y-2">
            {report.mainMistakes.map((m) => (
              <div key={m} className="rounded-2xl bg-coral-100/50 p-3 text-xs leading-relaxed text-ink/80">{m}</div>
            ))}
          </div>
        </Card>
      )}

      {report.rewrites.length > 0 && (
        <Card>
          <SectionTitle title="自然表达改写" subtitle="左边是你说的，右边是更地道的说法。" />
          <div className="space-y-3">
            {report.rewrites.map((r, i) => (
              <div key={i} className="rounded-2xl border border-brand-50 p-3">
                <p className="text-[10px] font-bold text-muted">原句</p>
                <p className="en-text mt-1 text-sm text-ink/70">{r.original}</p>
                <div className="my-2 flex items-center gap-2 text-brand-500"><Icon name="down" size={13} /><span className="text-[10px] font-bold">更自然的说法</span></div>
                <p className="en-text rounded-xl bg-mint-100/60 p-2.5 text-sm font-semibold text-ink">{r.improved}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle title="下一轮复习任务" subtitle="勾选完成，进度会记在心里（本地）。" />
        <div className="space-y-2">
          {report.reviewTasks.map((t, i) => {
            const checked = done.includes(i)
            return (
              <button key={t} type="button" onClick={() => setDone((prev) => checked ? prev.filter((x) => x !== i) : [...prev, i])}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${checked ? 'border-mint-400/50 bg-mint-100/50' : 'border-brand-50 bg-white hover:border-brand-200'}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-mint-500 bg-mint-500 text-white' : 'border-slate-300'}`}>
                  {checked && <Icon name="check" size={12} />}
                </span>
                <span className={`text-xs leading-relaxed ${checked ? 'text-muted line-through' : 'text-ink/80'}`}>{t}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 rounded-2xl bg-brand-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-brand-600"><Icon name="target" size={14} />下一步</p>
          <p className="mt-1 text-xs leading-relaxed text-ink/80">{report.nextGoal}</p>
        </div>
      </Card>

      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => navigate('review')} className="btn-primary"><Icon name="cards" size={16} />去复习</button>
        <button type="button" onClick={() => navigate('scenario', { analysisId: analysis?.id, scenarioId })} className="btn-ghost">
          <Icon name="refresh" size={16} />再练一次</button>
        <button type="button" onClick={() => navigate('home')} className="btn-ghost"><Icon name="home" size={16} />回首页</button>
      </div>
      {scenario && <p className="text-center text-[11px] text-muted">场景「{scenario.title}」的目标词共 {scenario.targetWords.length} 个，本次覆盖 {report.newWords.length} 个。</p>}
    </div>
  )
}
