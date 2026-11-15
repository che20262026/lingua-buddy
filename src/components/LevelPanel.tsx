/**
 * LevelPanel —— 三个模块共用的等级入口与调整面板
 *
 * - 顶部展示「当前等级：B1（推荐）」/「当前等级：B2（手动调整）」；
 * - 面板支持回到推荐 / 挑战更高 / 回到更基础，可选仅当前模块或应用到全部模块；
 * - 「显示全部等级」保证跳级后仍能访问所有内容；
 * - 可选 3 题轻量自评，只给建议等级、不输出分数、用户可接受也可忽略；
 * - 不做自动升降级，不留级惩罚；所有调整由用户点击发起。
 */

import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import {
  LEVEL_INFO, LEVELS, NO_LEVEL_HARM, SELF_ASSESSMENT_QUESTIONS,
  levelRank, type LevelModule,
} from '../levelTypes'
import { activeLevel, isModuleManual } from '../services/levelFilter'
import {
  acceptAssessment, applyLevelChange, applyShowAll, suggestLevel,
  LEVEL_CHANGE_NOTES, type LevelAction, type LevelScope,
} from '../services/levelPreference'
import { Card, Chip, Icon, Toggle } from './ui'

const MODULE_LABEL: Record<LevelModule, string> = {
  dialogue: '角色对话', reading: '经典阅读', video: '文化视频',
}

export function LevelPanel({ module }: { module: LevelModule }) {
  const app = useApp()
  const pref = app.data.levelPreference
  const level = activeLevel(pref, module)
  const manual = isModuleManual(pref, module)
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<LevelScope>('module')
  const [answers, setAnswers] = useState<[number, number, number]>([0, 0, 0])
  const [suggested, setSuggested] = useState<string | null>(null)
  const atTop = level === 'C1'
  const atBottom = level === 'A2'

  const run = (action: LevelAction) => applyLevelChange(app, module, action, scope)

  return (
    <Card testId={`level-panel-${module}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen((v) => !v)}
          data-testid={`level-toggle-${module}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon name="target" size={17} /></span>
          <span className="min-w-0">
            <span data-testid={`level-label-${module}`} className="font-display text-sm font-black text-ink">
              当前等级：{level}（{manual ? '手动调整' : '推荐'}）
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-muted">
              {MODULE_LABEL[module]} · {LEVEL_INFO[level].title} · 点击调整
            </span>
          </span>
          <Icon name={open ? 'down' : 'right'} size={15} className="shrink-0 text-muted" />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-semibold text-muted">显示全部等级</span>
          <Toggle checked={Boolean(pref.showAllLevels)}
            onChange={(v) => applyShowAll(app, v)} label="显示全部等级" />
        </div>
      </div>

      {open && (
        <div data-testid={`level-panel-body-${module}`} className="animate-in mt-4 space-y-3">
          {/* 等级说明 */}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {LEVELS.map((l) => (
              <div key={l} className={`rounded-xl px-3 py-2 text-[10px] leading-relaxed ${l === level ? 'bg-brand-50 text-brand-700' : 'bg-slate-50 text-muted'}`}>
                <strong>{LEVEL_INFO[l].title}</strong> · {LEVEL_INFO[l].summary}
              </div>
            ))}
          </div>

          {/* 作用范围 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-ink">作用范围</span>
            {(['module', 'all'] as LevelScope[]).map((s) => (
              <button key={s} type="button" onClick={() => setScope(s)}
                data-testid={`level-scope-${s}`}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${scope === s ? 'bg-mint-500 text-white' : 'bg-slate-100 text-muted'}`}>
                {s === 'module' ? '仅当前模块' : '应用到全部模块'}
              </button>
            ))}
          </div>

          {/* 三个动作 */}
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" disabled={!manual} onClick={() => run('reset')}
              data-testid="level-reset"
              className="btn-ghost !py-2.5 !text-[11px] disabled:opacity-40">
              <Icon name="refresh" size={14} />回到推荐等级
            </button>
            <button type="button" disabled={atTop} onClick={() => run('promote')}
              data-testid="level-promote"
              className="btn-primary !py-2.5 !text-[11px] disabled:opacity-40">
              <Icon name="sparkles" size={14} />挑战更高等级
            </button>
            <button type="button" disabled={atBottom} onClick={() => run('demote')}
              data-testid="level-demote"
              className="btn-ghost !py-2.5 !text-[11px] disabled:opacity-40">
              <Icon name="down" size={14} />回到更基础的内容
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            当前 {LEVEL_INFO[level].title} · 下一级 {atTop ? '已是最高' : LEVEL_INFO[LEVELS[levelRank(level) + 1]].title} ·
            上一级 {atBottom ? '已是最基础' : LEVEL_INFO[LEVELS[levelRank(level) - 1]].title}
          </p>

          {/* 3 题轻量自评（可选，不阻塞） */}
          <details className="rounded-2xl bg-white/70 p-3">
            <summary className="cursor-pointer text-[11px] font-bold text-brand-600">
              不知道选哪一级？做 3 题极轻量自评（不打分、不做正式测评）
            </summary>
            <div className="mt-3 space-y-2.5">
              {SELF_ASSESSMENT_QUESTIONS.map((q, qi) => (
                <div key={q.text}>
                  <p className="text-[10px] font-semibold text-ink">{qi + 1}. {q.text}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {q.options.map((o, oi) => (
                      <button key={o} type="button"
                        data-testid={`assess-${qi}-${oi}`}
                        onClick={() => setAnswers((prev) => prev.map((a, i) => i === qi ? oi : a) as [number, number, number])}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${answers[qi] === oi ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setSuggested(suggestLevel(answers))}
                  data-testid="assess-suggest" className="btn-ghost !px-3 !py-1.5 !text-[10px]">给我一个建议等级</button>
                {suggested && (
                  <>
                    <Chip tone="sun">建议 {suggested}</Chip>
                    <button type="button" onClick={() => { acceptAssessment(app, answers); setSuggested(null) }}
                      data-testid="assess-accept" className="btn-primary !px-3 !py-1.5 !text-[10px]">采用建议</button>
                    <button type="button" onClick={() => setSuggested(null)}
                      className="text-[10px] font-semibold text-muted hover:underline">忽略</button>
                  </>
                )}
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                只是建议，可以完全忽略；接受后推荐等级会更新，但不会改变任何内容资源的等级标签。
              </p>
            </div>
          </details>

          {/* 边界说明 */}
          <div className="rounded-2xl bg-mint-50/70 p-3">
            <p className="text-[10px] font-bold text-mint-700">跳级 / 留级的边界</p>
            <ul className="mt-1 space-y-0.5">
              {[...LEVEL_CHANGE_NOTES, ...NO_LEVEL_HARM].filter((x, i, arr) => arr.indexOf(x) === i).map((n) => (
                <li key={n} className="text-[10px] leading-relaxed text-muted">· {n}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  )
}
