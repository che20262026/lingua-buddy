/* ================================================================
 * 首页场景选择区 —— 40 个预设场景，按等级 Tab 分类展示
 *
 * 铁律：
 *  1. 等级只用于分类与「挑战模式」小字提示，绝不拦截点击。
 *     任何等级的用户点任何场景，都直接进入对话（零弹窗、零 notify 报错）。
 *  2. 不读写任何 localStorage 键；Tab 选择是纯会话态（useState）。
 *  3. 复用既有 Scenario / Session 结构与 Dialogue 引擎，不新建 Agent。
 *  4. 沿用项目既有 brand / mint / sun / coral 配色与 Card / Chip / Icon 原子。
 * ================================================================ */

import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import { uid } from '../lib/utils'
import type { Scenario, Session } from '../types'
import { activeLevel } from '../services/levelFilter'
import {
  SCENE_BANDS, SCENE_LIBRARY, filterScenesByBand, isChallenge,
  type SceneBand, type ScenePreset,
} from '../data/sceneLibrary'
import { Card, Chip, Icon, SectionTitle } from './ui'

type AppApi = ReturnType<typeof useApp>

/** 复用既有 Dialogue 引擎：把预设场景转成一个普通场景 + 会话，直接开聊 */
function startSceneDialogue(app: AppApi, preset: ScenePreset): void {
  const scenarioId = `scene-${preset.id}`
  const opening = preset.openingLine
  const scenario: Scenario = {
    id: scenarioId,
    title: `${preset.title} · ${preset.titleEn}`,
    goal: preset.desc,
    characters: [
      { id: 'learner', name: 'You', role: '学习者', personality: '愿意开口、允许停顿',
        goal: '把这个场景的交际任务做完', sampleLines: [] },
      { id: 'partner', name: 'Partner', role: preset.titleEn, personality: '耐心、不打断、不打分',
        goal: '把话接住，让对方多说一句', sampleLines: [opening] },
    ],
    targetWords: preset.targetWords,
    targetPhrases: [],
    sentenceFrames: [],
    openingLine: opening,
    suggestedReplies: [
      'Could you say that again, please?',
      'Let me think for a second, and then I will answer.',
      'That is interesting. I would add one thing.',
    ],
    rounds: 4,
    tint: 'from-brand-50 to-mint-100',
    emblem: preset.emblem,
  }
  const now = Date.now()
  const session: Session = {
    id: uid(`scene-sess-${preset.id}`),
    scenarioId,
    scenarioTitle: scenario.title,
    userCharacterId: 'learner',
    aiCharacterId: 'partner',
    messages: [{
      id: uid('msg'), role: 'ai', speaker: 'Partner', text: opening,
      translation: `场景等级 ${preset.level} · ${preset.desc}`, at: now,
    }],
    coveredWords: [], mistakes: [], turns: 0, createdAt: now,
  }
  app.update((prev) => ({
    ...prev,
    scenarios: [scenario, ...prev.scenarios.filter((s) => s.id !== scenarioId)].slice(0, 80),
    sessions: [session, ...prev.sessions].slice(0, 40),
  }))
  app.notify(`已进入「${preset.title}」· ${preset.level} 💬`)
  app.navigate('dialogue', { scenarioId, sessionId: session.id })
}

export function SceneLibrary() {
  const app = useApp()
  const [band, setBand] = useState<SceneBand>('all')
  const scenes = filterScenesByBand(SCENE_LIBRARY, band)
  const userLevel = activeLevel(app.data.levelPreference, 'dialogue')

  return (
    <section id="scene-library" data-testid="scene-library">
      <Card>
        <SectionTitle
          title="预设场景库"
          subtitle="40 个生活 / 职场 / 学术 / 旅行场景，按等级分类；想挑战哪一级都可以直接进。"
          right={<Chip tone="brand">{SCENE_LIBRARY.length} 个场景</Chip>} />

        {/* 等级 Tab：底部高亮下划线（不是实心块） */}
        <div data-testid="scene-band-tabs" role="tablist"
          className="hide-scroll mb-3 flex gap-1 overflow-x-auto border-b border-brand-50">
          {SCENE_BANDS.map((b) => (
            <button key={b.id} type="button" role="tab" aria-selected={band === b.id}
              data-testid={`scene-band-${b.id}`} onClick={() => setBand(b.id)}
              className={`shrink-0 border-b-2 px-3 py-2 text-[12px] font-bold transition ${
                band === b.id
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-muted hover:text-ink'
              }`}>
              {b.label}
            </button>
          ))}
        </div>

        {/* 紧凑场景卡网格：名称 / 简短描述 / 等级 badge / 挑战模式小字 */}
        <div className="grid gap-2 sm:grid-cols-2">
          {scenes.map((s) => {
            const challenge = isChallenge(userLevel, s.level)
            return (
              <button key={s.id} type="button" data-testid={`scene-${s.id}`}
                onClick={() => startSceneDialogue(app, s)}
                className="card flex min-w-0 items-center gap-2.5 p-3 text-left transition hover:border-brand-300">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-base">
                  {s.emblem}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold text-ink">{s.title}</span>
                  <span className="en-text block truncate text-[10px] text-muted">{s.titleEn}</span>
                  <span className="mt-0.5 block truncate text-[10px] leading-relaxed text-muted">{s.desc}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">{s.level}</Chip>
                  {challenge && (
                    <span data-testid={`scene-challenge-${s.id}`}
                      className="text-[9px] font-bold text-coral-600">挑战模式</span>
                  )}
                </span>
                <Icon name="right" size={14} className="shrink-0 text-muted" />
              </button>
            )
          })}
        </div>

        <p className="mt-3 text-center text-[10px] leading-relaxed text-muted">
          点击任意场景即可开始对话；「挑战模式」只是提示，不会限制你选择更高等级。
        </p>
      </Card>
    </section>
  )
}
