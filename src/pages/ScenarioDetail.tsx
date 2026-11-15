import { useEffect, useState } from 'react'
import { useApp } from '../store/useAppStore'
import type { Scenario, Session } from '../types'
import { uid } from '../lib/utils'
import { speak } from '../lib/speech'
import { getIeltsLevel } from '../data/ieltsLevels'
import { IeltsBandChip, IeltsDialogueSpec } from '../components/IeltsBits'
import { Avatar, Card, Chip, EmptyState, Icon, SectionTitle } from '../components/ui'

interface FormState {
  goal: string
  names: string[]
  targetWords: string
  sentenceFrames: string
  openingLine: string
  replies: string[]
}

function toForm(s: Scenario): FormState {
  return {
    goal: s.goal,
    names: s.characters.map((c) => c.name),
    targetWords: s.targetWords.join(', '),
    sentenceFrames: s.sentenceFrames.join(', '),
    openingLine: s.openingLine,
    replies: [s.suggestedReplies[0] || '', s.suggestedReplies[1] || '', s.suggestedReplies[2] || ''],
  }
}

const listFrom = (raw: string) => raw.split(/[,，]/).map((x) => x.trim()).filter(Boolean)

export function ScenarioDetail() {
  const { data, params, navigate, update, notify } = useApp()
  const analysis = data.texts.find((t) => t.id === params.analysisId) || data.texts[0]
  const scenario = analysis?.scenarios.find((s) => s.id === params.scenarioId) || analysis?.scenarios[0]
  const [selected, setSelected] = useState(scenario?.characters[0]?.id || '')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<FormState>(() => scenario ? toForm(scenario) : {
    goal: '', names: [], targetWords: '', sentenceFrames: '', openingLine: '', replies: ['', '', ''],
  })

  useEffect(() => {
    if (!scenario) return
    setForm(toForm(scenario))
    setSelected(scenario.characters[0]?.id || '')
    setEditing(false)
  }, [scenario?.id])

  if (!analysis || !scenario) {
    return (
      <div className="space-y-4">
        <EmptyState emblem="🎭" title="没有找到这个场景" desc="回到分析结果页重新挑一个吧。" />
        <button type="button" onClick={() => navigate('analysis', { analysisId: analysis?.id })} className="btn-primary w-full">返回分析结果</button>
      </div>
    )
  }

  const saveEdits = () => {
    const updated: Scenario = {
      ...scenario,
      goal: form.goal.trim() || scenario.goal,
      characters: scenario.characters.map((c, i) => ({ ...c, name: form.names[i]?.trim() || c.name })),
      targetWords: listFrom(form.targetWords).length ? listFrom(form.targetWords) : scenario.targetWords,
      sentenceFrames: listFrom(form.sentenceFrames).length ? listFrom(form.sentenceFrames) : scenario.sentenceFrames,
      openingLine: form.openingLine.trim() || scenario.openingLine,
      suggestedReplies: form.replies.filter((r) => r.trim()) || scenario.suggestedReplies,
    }
    persistScenario(updated)
    setEditing(false)
    notify('场景已更新，用你自己的设定开始对话吧 ✏️')
  }

  const startDialogue = () => {
    const me = scenario.characters.find((c) => c.id === selected) || scenario.characters[0]
    const ai = scenario.characters.find((c) => c.id !== me.id) || scenario.characters[1] || me
    const session: Session = {
      id: uid('sess'),
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      userCharacterId: me.id,
      aiCharacterId: ai.id,
      messages: [{
        id: uid('msg'), role: 'ai', speaker: ai.name, text: scenario.openingLine,
        translation: `${ai.name} 以「${ai.role}」的身份开口，为「${scenario.title}」拉开对话。`, at: Date.now(),
      }],
      coveredWords: [], mistakes: [], turns: 0, createdAt: Date.now(),
    }
    update((prev) => ({ ...prev, sessions: [session, ...prev.sessions].slice(0, 40) }))
    navigate('dialogue', { analysisId: analysis.id, scenarioId: scenario.id, sessionId: session.id })
  }

  const others = scenario.characters.filter((c) => c.id !== selected)
  const level = getIeltsLevel(data.settings.ieltsLevel)

  const persistScenario = (updated: Scenario) => {
    update((prev) => ({
      ...prev,
      texts: prev.texts.map((t) => t.id === analysis.id
        ? { ...t, scenarios: t.scenarios.map((s) => s.id === scenario.id ? updated : s) } : t),
      scenarios: prev.scenarios.map((s) => (s.id === scenario.id && s.sourceAnalysisId === analysis.id) ? updated : s),
    }))
  }

  const applyRounds = () => {
    persistScenario({ ...scenario, rounds: level.dialogue.rounds })
    notify(`轮次已按 IELTS ${level.band} 调整为 ${level.dialogue.rounds} 轮 🪜`)
  }

  return (
    <div className="animate-in space-y-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('analysis', { analysisId: analysis.id })} className="btn-ghost !px-3 !py-2 !text-xs">
          <Icon name="left" size={15} />所有场景
        </button>
        <Chip tone="mint">难度 {data.settings.difficulty}</Chip>
      </div>

      {/* 场景头部 */}
      <section className={`rounded-[28px] bg-gradient-to-br ${scenario.tint} p-6 shadow-card`}>
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/80 text-3xl shadow-card">{scenario.emblem}</div>
          <div>
            <p className="text-[11px] font-bold tracking-widest text-ink/50">SCENARIO · {scenario.rounds} 轮可完成</p>
            <h1 className="font-display mt-1 text-2xl font-black text-ink">{scenario.title}</h1>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-white/75 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-brand-600"><Icon name="target" size={14} />本场目标</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{scenario.goal}</p>
        </div>
      </section>

      {/* 编辑面板 */}
      <Card>
        <button type="button" onClick={() => setEditing(!editing)}
          className="flex w-full items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <Icon name="edit" size={17} className="text-brand-600" />
            <div>
              <p className="text-sm font-bold text-ink">编辑场景设定</p>
              <p className="text-[11px] text-muted">目标、角色名、目标词、开场白都能按你的想法改</p>
            </div>
          </div>
          <Icon name={editing ? 'close' : 'right'} size={16} className="text-muted" />
        </button>
        {editing && (
          <div className="mt-4 space-y-3 border-t border-brand-50 pt-4">
            <label className="block text-xs font-bold text-ink">场景目标
              <textarea className="field mt-1.5" rows={2} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
            </label>
            <div>
              <p className="text-xs font-bold text-ink">角色名（逗号分隔对应角色顺序）</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {form.names.map((n, i) => (
                  <input key={i} className="field" value={n}
                    onChange={(e) => setForm({ ...form, names: form.names.map((x, j) => j === i ? e.target.value : x) })} />
                ))}
              </div>
            </div>
            <label className="block text-xs font-bold text-ink">目标词（英文逗号分隔）
              <input className="field mt-1.5" value={form.targetWords} onChange={(e) => setForm({ ...form, targetWords: e.target.value })} />
            </label>
            <label className="block text-xs font-bold text-ink">建议句型（英文逗号分隔）
              <input className="field mt-1.5" value={form.sentenceFrames} onChange={(e) => setForm({ ...form, sentenceFrames: e.target.value })} />
            </label>
            <label className="block text-xs font-bold text-ink">AI 开场白
              <textarea className="field en-text mt-1.5" rows={2} value={form.openingLine} onChange={(e) => setForm({ ...form, openingLine: e.target.value })} />
            </label>
            <div>
              <p className="text-xs font-bold text-ink">建议回复（3 条）</p>
              <div className="mt-1.5 space-y-2">
                {form.replies.map((r, i) => (
                  <input key={i} className="field en-text" value={r}
                    onChange={(e) => setForm({ ...form, replies: form.replies.map((x, j) => j === i ? e.target.value : x) })} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setForm(toForm(scenario)); setEditing(false) }} className="btn-ghost flex-1">取消</button>
              <button type="button" onClick={saveEdits} className="btn-primary flex-1"><Icon name="check" size={16} />保存修改</button>
            </div>
          </div>
        )}
      </Card>

      {/* 雅思档位参数 */}
      <Card>
        <SectionTitle title="本档练习参数" subtitle="AI 会按目标 Band 控制回复句数、句式与提示难度。"
          right={<IeltsBandChip level={level} />} />
        <IeltsDialogueSpec level={level} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-50/70 p-3">
          <p className="text-[11px] leading-relaxed text-ink/75">
            当前场景 <b>{scenario.rounds} 轮</b> · 本档建议 <b>{level.dialogue.rounds} 轮</b>
          </p>
          <button type="button" onClick={applyRounds} className="btn-ghost !px-3 !py-1.5 !text-xs">
            <Icon name="refresh" size={13} />按本档应用轮次
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {level.focus.map((f) => <Chip key={f} tone="mint">{f}</Chip>)}
        </div>
      </Card>

      {/* 语言装备 */}
      <Card>
        <SectionTitle title="带上这些表达出发" subtitle="对话里用到它们，就会点亮目标词覆盖进度。" />
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-muted">目标词</p>
            <div className="flex flex-wrap gap-2">
              {scenario.targetWords.map((w) => <Chip key={w} tone="brand" className="en-text !text-sm">{w}</Chip>)}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-muted">必用短语</p>
            <div className="flex flex-wrap gap-2">
              {scenario.targetPhrases.map((p) => <Chip key={p} tone="mint" className="en-text">{p}</Chip>)}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-muted">建议句型</p>
            <ul className="space-y-1">
              {scenario.sentenceFrames.map((f) => (
                <li key={f} className="en-text rounded-xl bg-brand-50/70 px-3 py-2 text-xs font-semibold text-brand-700">{f}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-dashed border-brand-200 p-3">
            <p className="text-[11px] font-bold text-muted">AI 会这样开场</p>
            <p className="en-text mt-1 text-sm leading-relaxed text-ink">“{scenario.openingLine}”</p>
            <button type="button" onClick={() => speak(scenario.openingLine, data.settings)} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-600">
              <Icon name="speaker" size={14} />先听一遍
            </button>
          </div>
        </div>
      </Card>

      {/* 角色选择 */}
      <section>
        <SectionTitle title="你想扮演谁？" subtitle="其余角色由 AI 出演，会始终保持各自的语气和目标。" />
        <div className="space-y-2.5">
          {scenario.characters.map((c, i) => {
            const active = c.id === selected
            return (
              <button key={c.id} type="button" onClick={() => setSelected(c.id)}
                className={`card flex w-full items-start gap-3 p-4 text-left transition ${active ? '!border-brand-400 ring-4 ring-brand-100' : 'hover:border-brand-200'}`}>
                <Avatar name={c.name} size={44} tone={(['brand', 'coral', 'mint', 'sun'] as const)[i % 4]} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-base font-bold text-ink">{c.name}</p>
                    <Chip tone={active ? 'brand' : 'slate'}>{active ? '由我扮演' : 'AI 出演'}</Chip>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-brand-600">{c.role}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{c.personality}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink/70">目标：{c.goal}</p>
                  <p className="en-text mt-2 rounded-xl bg-brand-50/70 px-2.5 py-1.5 text-[11px] italic text-muted">“{c.sampleLines[0]}”</p>
                </div>
                <div className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300'}`}>
                  {active && <Icon name="check" size={12} />}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <Card className="!bg-mint-100/50">
        <p className="flex items-center gap-2 text-xs font-bold text-mint-600"><Icon name="sparkles" size={15} />本场阵容</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink/75">
          你：<b>{scenario.characters.find((c) => c.id === selected)?.name}</b> · AI：{others.map((c) => c.name).join('、') || '（将自动补位）'}。
          对话中随时可以点「提示」拿表达，或用建议回复起步。
        </p>
      </Card>

      <button type="button" onClick={startDialogue} className="btn-primary w-full !py-4 !text-base">
        <Icon name="play" size={18} />开始对话冒险<Icon name="right" size={16} />
      </button>
    </div>
  )
}
