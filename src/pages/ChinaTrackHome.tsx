/**
 * China Learner Track 资源库首页
 *
 * - 四轨道并列，每卡展示 2–3 条 struggle 短句作为入口；
 * - 资源单元卡展示 struggle / examTags / cefr / engine / 来源小字 / 反馈优先级；
 * - examTags 只做筛选，不把资源切成互斥的考试路径；
 * - 不新增底部导航项，本页由「学习」页的入口卡进入。
 */

import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import {
  ALL_UNITS, EXAM_TAGS, EXAM_TAG_LABELS, TRACKS, struggleTeasers, visibleUnits,
} from '../data/chinaTrack'
import {
  FOCUS_PRIORITY, NO_PROMISES, sourceLabel,
  type ExamTag, type TrackId,
} from '../chinaTrackTypes'
import { Card, Chip, Icon, ProgressBar, SectionTitle } from '../components/ui'
import { ProvinceConfig } from '../components/ProvinceConfig'
import { unitCompletionRate } from '../services/chinaTrack'

const EXAM_AWARE_TOTAL = ALL_UNITS.filter((u) => u.examAware).length

export function ChinaTrackHome() {
  const app = useApp()
  const { chinaTrack } = app.data
  const [track, setTrack] = useState<TrackId | 'all'>(app.params.chinaTrackFilter ?? 'all')
  const [examTag, setExamTag] = useState<ExamTag | 'all'>('all')
  const units = visibleUnits(chinaTrack, { track, examTag })
  const rate = unitCompletionRate(chinaTrack, ALL_UNITS.length)

  return (
    <div className="animate-in space-y-5">
      <button type="button" onClick={() => app.navigate('home')}
        className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-800">
        <Icon name="left" size={14} />返回学习页
      </button>

      <section className="animate-in overflow-hidden rounded-[28px] bg-gradient-to-br from-[#3f6d63] via-[#3b7d78] to-[#2c5b74] p-6 text-white shadow-float sm:p-8">
        <Chip tone="slate" className="bg-white/20 text-white">CHINA LEARNER TRACK · 内容层扩展</Chip>
        <h1 className="font-display mt-4 text-[24px] font-black leading-tight sm:text-3xl">
          不刷题，<br />把你卡住的那一下说清楚
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/85">
          四个轨道对应四个可以被自己认出来的具体困境：中文构思后硬翻、读不透原文逻辑、
          从来没被要求开口、语法正确却不地道。练习复用现有的对话、词场与复习引擎。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold">
            已完成 {Object.keys(chinaTrack.completed ?? {}).length} / {ALL_UNITS.length} 个资源单元
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold">全程 Mock 可体验</span>
        </div>
        <div className="mt-4"><ProgressBar value={rate} className="!bg-white/20 [&>div]:!bg-white" /></div>
        <p className="mt-3 text-[11px] leading-relaxed text-white/75">
          {NO_PROMISES[0]}；{NO_PROMISES[1]}。这里只做真实能力锚点，不做「应试刷题器」。
        </p>
      </section>

      <ProvinceConfig />

      {/* 四轨道并列 */}
      <Card>
        <SectionTitle title="四个轨道" subtitle="每张卡列出 2–3 个「这是不是我的问题」。同一卡点可能同时服务多个考试。"
          right={<Chip tone="mint">{TRACKS.length} 个轨道</Chip>} />
        <div className="grid gap-3 sm:grid-cols-2">
          {TRACKS.map((t) => {
            const teasers = struggleTeasers(t.id, 3)
            const count = visibleUnits(chinaTrack, { track: t.id }).length
            return (
              <div key={t.id} data-testid={`track-${t.id}`}
                className="rounded-2xl border border-white/80 bg-white/70 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-soft">{t.emblem}</span>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-black text-ink">轨道 {t.id} · {t.title}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-brand-600">{t.subtitle}</p>
                  </div>
                </div>
                <p className="mt-2.5 text-[10px] leading-relaxed text-muted">{t.anchor}</p>
                <ul className="mt-3 space-y-1.5">
                  {teasers.map((u) => (
                    <li key={u.id} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink">
                      <span className="font-black text-brand-500">·</span>{u.struggle}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Chip tone={t.tone}>{FOCUS_PRIORITY[t.focus].title}</Chip>
                  <button type="button" onClick={() => { setTrack(t.id); setExamTag('all') }}
                    data-testid={`track-open-${t.id}`}
                    className="btn-ghost !px-3 !py-1.5 !text-[10px]">
                    查看 {count} 个单元<Icon name="right" size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* 筛选（只筛选，不切路径） */}
      <Card>
        <SectionTitle title="资源单元" subtitle="examTags 只用于筛选；完成记录与复习队列对所有考试共用。"
          right={<Chip tone="brand">当前 {units.length} 个</Chip>} />
        <div className="flex flex-wrap gap-2">
          {(['all', 'A', 'B', 'C', 'D'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTrack(t)}
              data-testid={`filter-track-${t}`}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${track === t
                ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted hover:bg-brand-50'}`}>
              {t === 'all' ? '全部轨道' : `轨道 ${t}`}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {(['all', ...EXAM_TAGS] as const).map((tag) => (
            <button key={tag} type="button" onClick={() => setExamTag(tag)}
              data-testid={`filter-exam-${tag}`}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${examTag === tag
                ? 'bg-mint-500 text-white' : 'bg-white text-muted hover:bg-mint-50'}`}>
              {tag === 'all' ? '全部考试' : EXAM_TAG_LABELS[tag]}
            </button>
          ))}
        </div>
        <p data-testid="exam-aware-state" className="mt-3 text-[10px] leading-relaxed text-muted">
          {chinaTrack.listeningExamEnabled
            ? `听说机考感知卡已启用：轨道 C 额外可见 ${EXAM_AWARE_TOTAL} 张题型说明卡（不打分、不预测成绩）。`
            : `听说机考感知卡默认关闭：${EXAM_AWARE_TOTAL} 张题型说明卡已隐藏，可在上方按省份启用。`}
        </p>
      </Card>

      {/* 资源单元卡 */}
      <div className="space-y-3">
        {units.length === 0 && (
          <Card><p className="text-center text-xs text-muted">这个筛选下暂时没有单元，换个标签看看。</p></Card>
        )}
        {units.map((u) => {
          const done = Boolean(chinaTrack.completed?.[u.id])
          return (
            <div key={u.id} data-testid={`unit-card-${u.id}`}
              className="card animate-in p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-[11px] font-black text-brand-600">{u.id}</span>
                <div className="min-w-0 flex-1">
                  <p data-testid={`unit-struggle-${u.id}`} className="text-sm font-bold leading-relaxed text-ink">
                    {u.struggle}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{u.content.targetPattern}</p>
                </div>
                {done && <Chip tone="mint">已完成</Chip>}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {u.examTags.map((t) => <Chip key={t} tone="slate" className="!px-2 !py-0.5 !text-[10px]">{EXAM_TAG_LABELS[t]}</Chip>)}
                <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">CEFR {u.cefr}</Chip>
                <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">engine: {u.engine}</Chip>
                {u.examAware && <Chip tone="coral" className="!px-2 !py-0.5 !text-[10px]">机考感知</Chip>}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                {FOCUS_PRIORITY[u.assessmentFocus].title} · {FOCUS_PRIORITY[u.assessmentFocus].notFirst}
              </p>
              <p className="mt-1 text-[10px] text-muted">来源：{sourceLabel(u.source)}</p>

              <button type="button" onClick={() => app.navigate('chinaUnit', { chinaUnitId: u.id })}
                className="btn-primary mt-3 w-full !py-2 !text-xs">
                <Icon name="edit" size={14} />{done ? '再练一次' : '开始练习'}<Icon name="right" size={13} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl bg-white/60 p-4 text-[10px] leading-relaxed text-muted">
        <p className="font-bold text-ink">来源与许可分层</p>
        <p className="mt-1">本资源库 40 个单元全部为原创（source.type = original），原创诊断卡、微场景与逻辑拆解练习，
          不复制任何培训机构讲义、教辅范文、机经回忆或真题原文。</p>
        <p className="mt-1">词表与例句若未来扩充，只允许使用明确开放许可的来源：
          KyleBing/english-vocabulary（BSD-3-Clause）、ECDICT（MIT）、Tatoeba（CC BY 2.0 FR，仅限已校对句子并标注作者署名）；
          非原创内容必须逐条标注 source.type 与 license。详见 README 第十九章。</p>
        <p className="mt-2">{NO_PROMISES.join(' · ')}。</p>
      </div>
    </div>
  )
}
