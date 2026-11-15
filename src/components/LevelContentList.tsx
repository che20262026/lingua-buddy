/**
 * LevelContentList —— 三个模块共用的分级内容列表
 *
 * 只通过 LevelFilterService.getContentPool() 取内容，不各自实现等级筛选。
 * 点击行为只复用既有流程：
 * - dialogue：生成普通 Scenario / Session → 既有 Dialogue 页（不新建 Agent）
 * - reading：有 refId 的跳既有书籍 / 章节页；扩展篇目只登记来源，不伪造全文
 * - video：只展示来源、许可与嵌入状态；不播放、不下载、不绕过嵌入权限
 */

import { useApp } from '../store/useAppStore'
import { uid } from '../lib/utils'
import type { Scenario, Session } from '../types'
import type { ContentItem, LevelModule } from '../levelTypes'
import { basisCount } from '../levelTypes'
import { activeLevel, getContentPool } from '../services/levelFilter'
import { Card, Chip, EmptyState, Icon, SectionTitle } from './ui'

const MODULE_LABEL: Record<LevelModule, string> = {
  dialogue: '角色对话', reading: '经典阅读', video: '文化视频',
}

function basisSummary(item: ContentItem): string {
  const b = item.cefrBasis
  const parts: string[] = []
  if (b.vocabCoverage != null) parts.push(`词汇覆盖 ${b.vocabCoverage}`)
  if (b.avgSentenceLength != null) parts.push(`平均句长 ${b.avgSentenceLength}`)
  if (b.syntaxComplexity) parts.push(`句法 ${b.syntaxComplexity}`)
  if (b.speechRateWpm != null) parts.push(`语速 ${b.speechRateWpm} WPM`)
  if (b.pragmaticLoad) parts.push(`语用 ${b.pragmaticLoad}`)
  if (b.accentDiversity) parts.push(`口音 ${b.accentDiversity}`)
  return parts.join(' · ')
}

/** 复用既有 Dialogue 引擎：生成一个普通场景与会话，不改变任何反馈逻辑 */
function startLevelDialogue(app: ReturnType<typeof useApp>, item: ContentItem): void {
  const scenarioId = `level-${item.id}`
  const opening = `Let's try this one: ${item.title}. What would you say first?`
  const scenario: Scenario = {
    id: scenarioId,
    title: item.title,
    goal: item.blurb,
    characters: [
      { id: 'learner', name: 'You', role: '学习者', personality: '愿意开口、允许停顿',
        goal: '把这个场景的交际任务做完', sampleLines: [] },
      { id: 'partner', name: 'Partner', role: item.sourceLabel, personality: '耐心、不打断、不打分',
        goal: '把话接住，让对方多说一句', sampleLines: [opening] },
    ],
    targetWords: item.tags.slice(0, 4),
    targetPhrases: [],
    sentenceFrames: [],
    openingLine: opening,
    suggestedReplies: [
      'Could you say that again, please?',
      'I see your point, and I would add one thing.',
      'Let me think for a second, and then I will answer.',
    ],
    rounds: 3,
    tint: 'from-brand-50 to-mint-100',
    emblem: '💬',
  }
  const now = Date.now()
  const session: Session = {
    id: uid(`level-sess-${item.id}`),
    scenarioId,
    scenarioTitle: scenario.title,
    userCharacterId: 'learner',
    aiCharacterId: 'partner',
    messages: [{
      id: uid('msg'), role: 'ai', speaker: 'Partner', text: opening,
      translation: `当前等级 ${item.cefr} · ${item.levelNotes}`, at: now,
    }],
    coveredWords: [], mistakes: [], turns: 0, createdAt: now,
  }
  app.update((prev) => ({
    ...prev,
    scenarios: [scenario, ...prev.scenarios.filter((s) => s.id !== scenarioId)].slice(0, 80),
    sessions: [session, ...prev.sessions].slice(0, 40),
  }))
  app.notify(`已进入「${item.title}」· 当前等级 ${item.cefr} 💬`)
  app.navigate('dialogue', { scenarioId, sessionId: session.id })
}

export function LevelContentList({ module }: { module: LevelModule }) {
  const app = useApp()
  const pref = app.data.levelPreference
  const level = activeLevel(pref, module)
  const items = getContentPool(module, { preference: pref })
  const showAll = Boolean(pref.showAllLevels)

  const openItem = (item: ContentItem) => {
    if (module === 'dialogue') { startLevelDialogue(app, item); return }
    if (module === 'reading' && item.refId) {
      if (item.chapterId) {
        app.navigate('reader', { bookId: item.refId, chapterId: item.chapterId })
      } else {
        app.navigate('bookDetail', { bookId: item.refId })
      }
      return
    }
    // 扩展篇目 / 视频来源卡：只登记来源，不伪造全文或播放
    app.notify('这条只登记来源与分级依据；内容仍通过既有官方渠道访问，不下载、不转存')
  }

  return (
    <section>
      <SectionTitle
        title={`按等级推荐的内容 · ${MODULE_LABEL[module]}`}
        subtitle={showAll ? '显示全部等级：跳级也不会锁住任何内容。' : `默认显示当前等级 ${level} 的内容；可在上方开启「显示全部等级」。`}
        right={<Chip tone="brand">{items.length} 条</Chip>} />
      {items.length === 0 ? (
        <EmptyState emblem="📚" title="这个等级暂时没有内容" desc="开启「显示全部等级」，或换一个等级看看。" />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} data-testid={`level-item-${item.id}`}
              className="card animate-in flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="en-text truncate text-sm font-bold text-ink">{item.title}</p>
                  {item.titleZh && <p className="mt-0.5 text-[11px] text-muted">{item.titleZh}</p>}
                </div>
                <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">{item.cefr}</Chip>
              </div>

              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-ink/75">{item.blurb}</p>

              <div className="mt-2 flex flex-wrap gap-1">
                <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">依据 {basisCount(item.cefrBasis)} 项</Chip>
                <Chip tone="slate" className="!px-2 !py-0.5 !text-[10px]">
                  {item.levelSource === 'expert' ? '专家/锚点' : item.levelSource === 'estimated' ? '系统估算' : '用户标注'}
                </Chip>
                {item.chapterCefr && <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">章节级 {item.chapterCefr}</Chip>}
                {module === 'video' && (
                  <Chip tone={item.embeddable ? 'mint' : 'coral'} className="!px-2 !py-0.5 !text-[10px]">
                    {item.embeddable ? '官方嵌入' : '外链降级'}
                  </Chip>
                )}
              </div>

              <p className="mt-2 rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
                难度依据：{basisSummary(item)}
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted">为什么是这个等级：{item.levelNotes}</p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                来源：{item.sourceLabel} · 许可：{item.licenseNote}
              </p>

              <button type="button" onClick={() => openItem(item)}
                className="btn-ghost mt-3 w-full !py-2 !text-[11px]">
                {module === 'dialogue' ? '进入这个对话场景'
                  : item.refId ? (item.chapterId ? '去读这一章' : '查看这本书')
                    : '查看来源说明'}
                <Icon name="right" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
