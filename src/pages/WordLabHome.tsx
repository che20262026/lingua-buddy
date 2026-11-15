import { useApp } from '../store/useAppStore'
import { dueWords, wordLabStats } from '../lib/wordScheduler'
import { remainingQuota, startWordSession, SESSION_SIZE } from '../lib/wordLabFlow'
import { DECK_IDS, DECK_META } from '../data/wordDecks'
import { Card, Chip, EmptyState, Icon, ProgressBar, ProgressRing, SectionTitle } from '../components/ui'
import type { DeckId } from '../wordLabTypes'

/**
 * 词场首页（S0 限流在这里把关）：
 * - 今日新词额度环：满额时不显示任何诱导继续学新词的按钮
 * - 到期词入口 → 复习页「词场」tab
 * - 当前词库卡片 + 换库入口
 */
export function WordLabHome() {
  const app = useApp()
  const { data } = app
  const stats = wordLabStats(data.wordProgress)
  const due = dueWords(data.wordProgress)
  const remaining = remainingQuota(data.wordDailyQuota)
  const quotaFull = remaining <= 0
  const activeDeck = data.deckSelection.activeDeckId
  const meta = activeDeck ? DECK_META[activeDeck] : null
  const deckLearned = activeDeck
    ? Object.values(data.wordProgress.words).filter((p) => p.deckId === activeDeck).length
    : 0

  const begin = async (deckId: DeckId) => { await startWordSession(app, deckId) }

  return (
    <div className="animate-in space-y-5">
      <section className="rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-mint-50/60 to-brand-50/70 p-5 shadow-card">
        <div className="flex items-center gap-5">
          <div className="rounded-full bg-white p-1 shadow-card">
            <ProgressRing value={Math.min(1, remaining / Math.max(data.wordDailyQuota.limit, 1))}
              label={`${remaining}`} sub={`/ ${data.wordDailyQuota.limit} 新词`} size={92} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-black text-ink">今日词场</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              已学 {data.wordDailyQuota.newWordsLearned} 个新词 · 在学 {stats.learning} · 已掌握 {stats.mastered}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              新词每天最多 {data.wordDailyQuota.limit} 个（可在设置里调 10-15），复习不受限。
            </p>
            {quotaFull && (
              <div className="mt-2 rounded-xl bg-sun-100/70 px-3 py-2 text-[11px] font-bold text-[#8a5b08]">
                今日新词已学满。复习不占用额度，先去消化今天的词吧。
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 到期复习入口 */}
      <button type="button" onClick={() => app.navigate('review', { reviewTab: 'wordLab' })}
        className="flex w-full items-center gap-3 rounded-2xl bg-coral-100/70 px-4 py-3 text-left transition hover:bg-coral-100">
        <Icon name="clock" size={18} className="text-coral-600" />
        <p className="flex-1 text-xs font-bold text-coral-600">
          {due.length > 0 ? `${due.length} 个词到了复习时间，趁热打铁最有效` : '还没有到期词——新词学完 10 分钟后回来'}
        </p>
        <Icon name="right" size={15} className="text-coral-600" />
      </button>

      {/* 当前词库 */}
      <Card>
        <SectionTitle title="当前词库" subtitle="换了词库，已学词的进度都会保留。"
          right={meta ? <Chip tone="mint">{meta.emblem} {meta.name}</Chip> : undefined} />
        {meta ? (
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-display text-lg font-black text-ink">{meta.emblem} {meta.name}</p>
                <p className="mt-0.5 text-xs text-muted">{meta.subtitle} · CEFR {meta.cefr}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-black text-brand-600">{deckLearned}</p>
                <p className="text-[10px] font-bold text-muted">已开始学</p>
              </div>
            </div>
            <ProgressBar value={Math.min(1, deckLearned / 50)} className="mt-3" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => begin(meta.id)} disabled={quotaFull}
                className="btn-primary !py-2 !text-xs disabled:opacity-40">
                <Icon name="cards" size={14} />
                {quotaFull ? '今日新词已满' : `学 ${Math.min(SESSION_SIZE, remaining)} 个新词`}
              </button>
              <button type="button" onClick={() => app.navigate('deckPicker')} className="btn-ghost !py-2 !text-xs">
                <Icon name="book" size={14} />换词库
              </button>
            </div>
          </div>
        ) : (
          <EmptyState emblem="🃏" title="还没选词库" desc="先挑一个适合你水平的词库，五步学习法马上开始。"
            action={<button type="button" onClick={() => app.navigate('deckPicker')} className="btn-primary">去挑词库</button>} />
        )}
      </Card>

      {/* 学习模式说明 */}
      <Card>
        <SectionTitle title="五步学习法" subtitle="每个新词都走一遍完整闭环。" />
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['S1', '猜义', '先猜再学，不许跳过——错误本身帮助记忆'],
            ['S2', '验证', '配图与例句联动，揭晓中文释义'],
            ['S3', '拼写', '打字逐字母比对，或手写自评'],
            ['S4', '结算', '教练两句话点评，XP 到账'],
            ['S5', '排程', '艾宾浩斯阶梯 10min→1d→3d→7d→15d→30d 自动接管'],
            ['🔁', '并轨', '走完阶梯并入既有 SM-2 复习队列'],
          ].map(([tag, name, desc]) => (
            <div key={name} className="flex items-start gap-2.5 rounded-2xl bg-white/70 p-3">
              <span className="mt-0.5 flex h-7 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-[10px] font-black text-brand-700">{tag}</span>
              <div>
                <p className="text-xs font-bold text-ink">{name}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 易错本入口 */}
      <Card>
        <SectionTitle title="易错本" subtitle="猜错词义或拼错的词自动收进来，连对两次自动销账。" />
        {data.wordErrors.length === 0 ? (
          <p className="rounded-2xl bg-mint-100/50 p-3 text-[11px] leading-relaxed text-ink/70">
            目前空空如也——学习时拼错或猜错的词会自动出现在这里。
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 p-3">
            <p className="text-xs font-bold text-ink">
              {data.wordErrors.filter((e) => !e.resolved).length} 个待攻克 · 共 {data.wordErrors.length} 条记录
            </p>
            <button type="button" onClick={() => app.navigate('errorBook')} className="btn-ghost !py-2 !text-xs">
              打开易错本<Icon name="right" size={13} />
            </button>
          </div>
        )}
      </Card>

      <div className="rounded-2xl bg-white/60 p-4 text-center text-[11px] leading-relaxed text-muted">
        7 个词库全部来自公开考试大纲词表（事实性清单）；释义自行改写，例句为自建模板。
        数据只保存在本机 localStorage。
      </div>
    </div>
  )
}

export function deckName(deckId: DeckId): string {
  return DECK_META[deckId].name
}

export { DECK_IDS }
