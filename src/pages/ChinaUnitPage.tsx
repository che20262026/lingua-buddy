/**
 * China Learner Track 资源单元练习页
 *
 * 一个页面覆盖三种既有引擎：
 * - writing_feedback / wordlab → 结构级 WritingFeedbackEngine（本地 Mock 可完整跑通）；
 * - dialogue → 额外提供「进入对话练习」，复用既有 DialogueDirectorAgent；
 * - packTag → 额外提供「去词场练这个词包」，复用既有 Word Lab 五步闭环。
 *
 * 不新建学习机制，不输出分数，不承诺提分。
 */

import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import { EXAM_TAG_LABELS, findUnit } from '../data/chinaTrack'
import { FOCUS_PRIORITY, NO_PROMISES, sourceLabel } from '../chinaTrackTypes'
import { Card, Chip, EmptyState, Icon, SectionTitle } from '../components/ui'
import { configureWritingFeedback, requestWritingFeedback, type WritingFeedbackResult } from '../services/writingFeedback'
import { completeUnit, startMicroDialogue } from '../services/chinaTrack'

const VERDICT_LABEL: Record<WritingFeedbackResult['verdict'], string> = {
  clear: '结构已经站住了',
  partial: '主要结构在，还有一处没接上',
  missing: '先补结构，别急着换词',
}

export function ChinaUnitPage() {
  const app = useApp()
  const unit = findUnit(app.params.chinaUnitId ?? '')
  const scaffold = unit?.content.scaffold ?? []
  const [answers, setAnswers] = useState<string[]>(scaffold.map(() => ''))
  const [draft, setDraft] = useState('')
  const [choice, setChoice] = useState('')
  const [feedback, setFeedback] = useState<WritingFeedbackResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ granted: boolean; amount: number } | null>(null)

  if (!unit) {
    return (
      <div className="space-y-4">
        <EmptyState emblem="🧭" title="没有找到这个资源单元" desc="回到资源库挑一张卡再试一次。" />
        <button type="button" onClick={() => app.navigate('chinaTrack')} className="btn-primary w-full">返回资源库</button>
      </div>
    )
  }

  const focus = FOCUS_PRIORITY[unit.assessmentFocus]

  const runFeedback = async () => {
    setBusy(true)
    try {
      // 设置可能刚变化；用同一份 settings 同步结构级引擎，默认仍是本地 Mock
      configureWritingFeedback(app.data.settings)
      const result = await requestWritingFeedback({ unit, answers, draft, diagnosisChoice: choice || undefined })
      setFeedback(result)
    } finally {
      setBusy(false)
    }
  }

  const finish = () => {
    const r = completeUnit(app, unit)
    setDone({ granted: r.xp.granted, amount: r.xp.amount })
    app.notify(r.xp.granted
      ? `本单元已完成：+${r.xp.amount} XP，结构提示已排进复习队列 ✅`
      : '本单元今天已经入过账，继续练习不重复发 XP，复习卡片仍在 🌱')
  }

  return (
    <div className="animate-in space-y-5">
      <button type="button" onClick={() => app.navigate('chinaTrack', { chinaTrackFilter: unit.track })}
        className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-800">
        <Icon name="left" size={14} />返回资源库 · 轨道 {unit.track}
      </button>

      {/* 单元头：struggle 必须可见 */}
      <Card testId="china-unit-head">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-xs font-black text-brand-600">{unit.id}</span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-brand-600">轨道 {unit.track} · 这是不是我的问题？</p>
            <h1 className="font-display mt-1 text-base font-black leading-relaxed text-ink" data-testid="unit-struggle">
              {unit.struggle}
            </h1>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {unit.examTags.map((t) => <Chip key={t} tone="slate" className="!px-2 !py-0.5 !text-[10px]">{EXAM_TAG_LABELS[t]}</Chip>)}
          <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">CEFR {unit.cefr}</Chip>
          <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">engine: {unit.engine}</Chip>
          <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">{focus.title}</Chip>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">来源：{sourceLabel(unit.source)}</p>
        <p className="mt-2 rounded-2xl bg-brand-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-brand-700">
          {focus.first}；{focus.notFirst}。本页不输出分数。
        </p>
      </Card>

      {/* 材料 */}
      <Card>
        <SectionTitle title="先看材料" subtitle={unit.content.promptZh} />
        <div className="rounded-2xl bg-slate-50 p-3.5">
          <p className="text-[10px] font-bold text-muted">输入材料</p>
          <p className="en-text mt-1.5 text-[13px] leading-relaxed text-ink">{unit.content.sourceText}</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl bg-coral-50/70 p-3">
            <p className="text-[10px] font-bold text-coral-600">学生典型产出（原创样例）</p>
            <p className="en-text mt-1 text-[12px] leading-relaxed text-ink">{unit.content.contrastExample}</p>
          </div>
          <div className="rounded-2xl bg-mint-50/70 p-3">
            <p className="text-[10px] font-bold text-mint-600">要练 / 要诊断的模式</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink">{unit.content.targetPattern}</p>
          </div>
        </div>
        {unit.content.extraExamples?.length ? (
          <div className="mt-3">
            <p className="text-[10px] font-bold text-muted">同一模式的另外几句</p>
            <ul className="mt-1 space-y-1">
              {unit.content.extraExamples.map((e, i) => (
                <li key={i} className="en-text rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-ink">{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {unit.content.examBrief && (
          <p data-testid="exam-brief" className="mt-3 rounded-2xl bg-sun-100/70 px-3 py-2.5 text-[11px] leading-relaxed text-[#8a5b08]">
            <strong>题型感知：</strong>{unit.content.examBrief}
          </p>
        )}
      </Card>

      {/* 结构级引导 */}
      <Card testId="china-unit-practice">
        <SectionTitle title="先厘清结构，再动笔" subtitle="这些回答只用于结构级观察，不做逐句语法纠错、不给分数。" />
        {scaffold.map((q, i) => (
          <label key={i} className="mt-2.5 block text-[11px] font-bold text-ink">
            {i + 1}. {q}
            <input className="field mt-1.5 !text-[12px]" value={answers[i] ?? ''}
              data-testid={`scaffold-${i}`}
              onChange={(e) => setAnswers((prev) => prev.map((a, j) => j === i ? e.target.value : a))}
              placeholder="用中文或英文写一句都行，先写下来" />
          </label>
        ))}

        {unit.content.diagnosisOptions?.length ? (
          <div className="mt-4">
            <p className="text-[11px] font-bold text-ink">先判断：这句话的问题是什么？</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unit.content.diagnosisOptions.map((o) => (
                <button key={o} type="button" onClick={() => setChoice(o)}
                  data-testid={`diagnosis-${o}`}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${choice === o
                    ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted hover:bg-brand-50'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="mt-4 block text-[11px] font-bold text-ink">
          你的英文产出（结构骨架 / 续写 / 2–3 句交际任务 / 诊断说明）
          <textarea className="field en-text mt-1.5 min-h-[110px] resize-y text-[13px] leading-relaxed"
            data-testid="unit-draft" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Write 2–3 sentences here… 不必追求完美语法，先把结构写清楚。" rows={5} />
        </label>

        <button type="button" onClick={runFeedback} disabled={busy}
          className="btn-primary mt-3 w-full !py-3 !text-sm disabled:opacity-50">
          <Icon name="bulb" size={16} />{busy ? '正在整理结构…' : '获取结构级反馈'}<Icon name="right" size={15} />
        </button>
        <p className="mt-2 text-center text-[10px] text-muted">
          本地结构级反馈，无 API 也能完整使用；自定义端点失败会自动回退 Mock。
        </p>
      </Card>

      {/* 结构级反馈 */}
      {feedback && (
        <Card testId="china-unit-feedback">
          <SectionTitle title={feedback.headline} subtitle={VERDICT_LABEL[feedback.verdict]}
            right={<Chip tone={feedback.isMock ? 'mint' : 'sun'}>{feedback.isMock ? '本地 Mock' : '结构级远程'}</Chip>} />
          <div data-testid="focus-priority" className="rounded-2xl bg-brand-50/70 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-brand-700">
            反馈优先级：{focus.title} · {feedback.priorities[0]}
          </div>
          <ul className="mt-3 space-y-2">
            {feedback.checks.map((c) => (
              <li key={c.key} className="rounded-2xl border border-white/80 bg-white/70 p-3">
                <p className="flex items-center gap-2 text-[11px] font-bold text-ink">
                  <span className={c.passed ? 'text-mint-600' : 'text-coral-500'}>{c.passed ? '✓' : '○'}</span>{c.label}
                </p>
                {!c.passed && <p className="mt-1 text-[10px] leading-relaxed text-muted">{c.hint}</p>}
              </li>
            ))}
          </ul>

          {feedback.diagnosis && (
            <div data-testid="diagnosis-result" className="mt-3 rounded-2xl bg-slate-50 p-3.5">
              <p className="text-[11px] font-bold text-ink">
                诊断模式：{feedback.diagnosis.pattern}
                <span className="ml-2 text-[10px] font-semibold text-brand-600">
                  {feedback.diagnosis.correct ? '（判断一致）' : '（再对照一次例句）'}
                </span>
              </p>
              {feedback.diagnosis.transferNote && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  <strong>母语负迁移：</strong>{feedback.diagnosis.transferNote}
                </p>
              )}
              <p className="en-text mt-2 rounded-xl bg-white p-2.5 text-[12px] leading-relaxed text-ink">
                地道改写：{feedback.diagnosis.rewrite}
              </p>
              <p className="mt-2 text-[10px] text-muted">这里只给诊断与改写，不给分数、不做逐句语法纠错。</p>
            </div>
          )}

          {feedback.collocations.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-bold text-ink">地道搭配注释（可加入词场纠偏词包）</p>
              <ul className="mt-1.5 space-y-1">
                {feedback.collocations.map((c, i) => (
                  <li key={i} className="en-text rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-ink">{c}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 rounded-2xl bg-mint-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-mint-700">
            下一步：{feedback.nextStep}
          </p>
          <p data-testid="no-score" className="mt-2 text-[10px] text-muted">
            本引擎不给分数（noScore）· {feedback.disclaimer}
          </p>
        </Card>
      )}

      {/* 复用既有引擎的入口 */}
      <Card>
        <SectionTitle title="接着用现有引擎练" subtitle="不新建 Agent、不新建学习机制；只是把这张卡接到已有路径上。" />
        <div className="grid gap-2 sm:grid-cols-2">
          {unit.engine === 'dialogue' && (
            <button type="button" onClick={() => startMicroDialogue(app, unit)}
              className="btn-ghost !py-2.5 !text-[11px]">
              <Icon name="mic" size={14} />进入对话练习（既有 Dialogue）
            </button>
          )}
          {unit.packTag && (
            <button type="button" onClick={() => { app.notify('已打开词库选择页，找到 china_track 场景词包即可开始五步闭环'); app.navigate('deckPicker') }}
              className="btn-ghost !py-2.5 !text-[11px]">
              <Icon name="cards" size={14} />去词场练这个词包
            </button>
          )}
        </div>
        {!unit.engine.includes('dialogue') && !unit.packTag && (
          <p className="text-[11px] leading-relaxed text-muted">完成这张卡后，结构提示会进入既有复习队列。</p>
        )}
      </Card>

      {/* 完成单元：写入 XP 与复习队列 */}
      <Card>
        <SectionTitle title="完成本单元" subtitle="写入现有 XP 统一入口（source = china_track）与既有复习队列；同一单元每天只入账一次。" />
        {done ? (
          <div className="rounded-2xl bg-mint-50/70 p-4 text-center">
            <p className="font-display text-sm font-black text-mint-700">
              {done.granted ? `已完成 · +${done.amount} XP` : '今天已入过账 · 可继续练习'}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">结构提示已排进复习队列，明天会再回来一次。</p>
          </div>
        ) : (
          <button type="button" onClick={finish} className="btn-primary w-full !py-3 !text-sm"
            data-testid="complete-unit">
            <Icon name="check" size={16} />完成本单元并写入复习队列
          </button>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => app.navigate('chinaTrack', { chinaTrackFilter: unit.track })}
            className="btn-ghost flex-1 !py-2 !text-[11px]">返回资源库</button>
          <button type="button" onClick={() => app.navigate('review')}
            className="btn-ghost flex-1 !py-2 !text-[11px]">去复习页</button>
        </div>
      </Card>

      <div className="rounded-2xl bg-white/60 p-4 text-center text-[10px] leading-relaxed text-muted">
        {NO_PROMISES.join(' · ')}。<br />
        原创内容 · {sourceLabel(unit.source)} · 结构级反馈不做逐句语法纠错。
      </div>
    </div>
  )
}
