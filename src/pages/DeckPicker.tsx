import { useApp } from '../store/useAppStore'
import { DECK_IDS, DECK_META, CHINA_DECK_IDS } from '../data/wordDecks'
import { remainingQuota, startWordSession } from '../lib/wordLabFlow'
import { Card, Chip, Icon, SectionTitle } from '../components/ui'
import type { DeckId } from '../wordLabTypes'

/** 词库选择页：7 个词库、分片词数、已学进度 */
export function DeckPicker() {
  const app = useApp()
  const { data } = app
  const active = data.deckSelection.activeDeckId
  const remaining = remainingQuota(data.wordDailyQuota)
  const quotaFull = remaining <= 0

  const counts: Record<string, number> = {}
  for (const p of Object.values(data.wordProgress.words)) {
    counts[p.deckId] = (counts[p.deckId] || 0) + 1
  }

  return (
    <div className="animate-in space-y-5">
      <button type="button" onClick={() => app.navigate('wordLab')}
        className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-800">
        <Icon name="left" size={14} />返回词场首页
      </button>

      <Card>
        <SectionTitle title="挑一个词库" subtitle="7 个分级词库，按分片加载；换库不会丢失已学词进度。"
          right={<Chip tone={quotaFull ? 'sun' : 'mint'}>{quotaFull ? '今日新词已满' : `今日还可学 ${remaining} 个`}</Chip>} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {DECK_IDS.map((id: DeckId) => {
            const meta = DECK_META[id]
            const learned = counts[id] || 0
            const selected = active === id
            return (
              <div key={id}
                className={`rounded-2xl border p-3.5 transition ${selected ? 'border-brand-300 bg-brand-50/60' : 'border-white/80 bg-white/70'}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-soft">{meta.emblem}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-display text-sm font-black text-ink">{meta.name}</p>
                      {selected && <Chip tone="brand">当前</Chip>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">{meta.subtitle}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">
                      分片大小 {meta.shardSize} 词 · 已开始 {learned} 词
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={quotaFull} onClick={() => startWordSession(app, id)}
                    className="btn-primary flex-1 !py-2 !text-[11px] disabled:opacity-40">
                    <Icon name="cards" size={13} />{quotaFull ? '今日已满' : '开始学习'}
                  </button>
                  <button type="button" onClick={() => {
                    app.update((prev) => ({ ...prev, deckSelection: { activeDeckId: id, pickedAt: Date.now() } }))
                    /** [成长系统] 选库是 0 XP 标记事件，只驱动「换一片矿区」等广度成就 */
                    app.awardXp({
                      id: `wordlab:deck:${id}:selected`,
                      source: 'wordlab', action: 'deck_selected', amount: 0, meta: { internal: true },
                    })
                    app.notify(`已切换到「${meta.name}」`)
                  }} className="btn-ghost !py-2 !text-[11px]">设为当前</button>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* [China Learner Track] 两个场景词包：并列注册，复用同一套五步闭环 */}
      <Card testId="china-track-packs">
        <SectionTitle title="场景词包 · China Learner Track"
          subtitle="标记 source: china_track；来自轨道 D 的纠偏搭配与轨道 C 的开口核心表达，五步学习法完全不变。"
          right={<Chip tone="coral">{CHINA_DECK_IDS.length} 个词包</Chip>} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {CHINA_DECK_IDS.map((id: DeckId) => {
            const meta = DECK_META[id]
            const learned = counts[id] || 0
            const selected = active === id
            return (
              <div key={id} data-testid={`china-pack-${id}`}
                className={`rounded-2xl border p-3.5 transition ${selected ? 'border-brand-300 bg-brand-50/60' : 'border-white/80 bg-white/70'}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-soft">{meta.emblem}</span>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-black text-ink">{meta.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{meta.subtitle}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Chip tone="coral" className="!px-2 !py-0.5 !text-[10px]">source: {meta.source}</Chip>
                      <Chip tone="slate" className="!px-2 !py-0.5 !text-[10px]">已开始 {learned} 条</Chip>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted">
                  释义是「地道搭配注释」而非中文直译；完成后同样进入艾宾浩斯阶梯与 SM-2 队列。
                </p>
                <button type="button" disabled={quotaFull} onClick={() => startWordSession(app, id)}
                  className="btn-primary mt-2.5 w-full !py-2 !text-[11px] disabled:opacity-40">
                  <Icon name="cards" size={13} />{quotaFull ? '今日已满' : '开始学习这个词包'}
                </button>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="rounded-2xl bg-white/60 p-4 text-center text-[11px] leading-relaxed text-muted">
        词表来自公开考试大纲的事实性词频清单；释义自行改写，例句为自建模板句；配图走离线 SVG / emoji 兜底，零网络请求。
        China Learner Track 场景词包全部原创，来源与许可分层见 README 第十九章。
      </div>
    </div>
  )
}
