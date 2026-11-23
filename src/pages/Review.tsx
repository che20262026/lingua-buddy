import { useState } from 'react'
import { useApp, useDerived } from '../store/useAppStore'
import { promoteReviewItem, SRS_INTERVALS } from '../services/coach'
import { summarizeVoice } from '../services/voiceAssessor'
import { getIeltsLevel } from '../data/ieltsLevels'
import { lookupWord, ACHIEVEMENTS } from '../data/mockData'
/** [新增] 词场复习并入本页：统一调度器输出与既有 reviewQueue 合并展示 */
import { findWord } from '../data/wordDecks'
import { advanceProgress, dueWords, wordLabStats } from '../lib/wordScheduler'
import { speak } from '../lib/speech'
import { formatDate } from '../lib/utils'
import type { ReviewItem } from '../types'
import { Card, Chip, EmptyState, Icon, ProgressBar, ProgressRing, SectionTitle } from '../components/ui'
import { EBBINGHAUS_STEPS_MS } from '../wordLabTypes'
/** [成长系统] 复习批次 XP 与今日复习 XP 汇总 */
import { XP_RULES } from '../growthTypes'
import { todayKey } from '../lib/storage'

type Tab = 'queue' | 'mistakes' | 'words' | 'wordLab'
const DAY = 24 * 60 * 60 * 1000

/**
 * [复习页降噪] 发音练习 / 语音评测引导卡在复习页关闭。
 * 只隐藏这一块引导 UI —— 语音服务、评测数据、今日报告与
 * 「发音待留意」列表全部保留，用户仍可从设置页 / 成长页进入评测。
 */
const SHOW_PRONUNCIATION_REVIEW = false

function dueLabel(item: ReviewItem): string {
  const days = Math.ceil((item.dueAt - Date.now()) / DAY)
  if (days <= 0) return '今天到期'
  if (days === 1) return '明天复习'
  return `${days} 天后`
}

export function Review() {
  const { data, update, navigate, notify, params, awardXp } = useApp()
  const { dueReviews } = useDerived()
  const [tab, setTab] = useState<Tab>(params.reviewTab ?? 'queue')
  const [flipped, setFlipped] = useState<string[]>([])
  /** [成长系统] 每 10 次作答算一个复习批次，批次完成才发 XP（每日上限 3 次） */
  const [batchProgress, setBatchProgress] = useState(0)
  const reviewXpToday = data.xpLedger.entries
    .filter((e) => e.action === 'review_batch' && e.at.slice(0, 10) === todayKey())
    .reduce((sum, e) => sum + e.amount, 0)
  const bumpBatch = () => {
    const n = batchProgress + 1
    if (n < 10) { setBatchProgress(n); return }
    setBatchProgress(0)
    const today = todayKey()
    const done = data.xpLedger.entries
      .filter((e) => e.action === 'review_batch' && e.at.slice(0, 10) === today).length
    const r = awardXp({
      id: `review:${today}:batch:${done + 1}`,
      source: 'review', action: 'review_batch', amount: XP_RULES.review_batch,
    })
    notify(r.granted
      ? `复习批次完成！+${r.amount} XP，间隔重复已重新排程 🎉`
      : '今日 3 次复习批次 XP 已发满，继续复习仍会正常排程 🌱')
  }
  const { profile } = data
  /** [新增] 统一调度器输出：词场到期词（source='wordlab'）与既有队列在本页合并展示 */
  const wordDue = dueWords(data.wordProgress)
  const wordStats = wordLabStats(data.wordProgress)
  /** [S2.5 新增] 发音待留意：连续两次漏读的词 + 跳过跟读的词，独立展示，不进拼写易错本 */
  const pronunciationAttention: Array<{ word: string; reason: string; at: string }> = [
    ...Object.values(data.pronunciationFlags?.words ?? {}).map((f) => ({
      word: f.word,
      reason: `连续两次跟读漏掉（${f.missedCount} 次），复习时可多听一遍标准音`,
      at: f.lastMissedAt ? String(f.lastMissedAt).slice(0, 10) : '',
    })),
    ...Object.values(data.wordProgress.words)
      .filter((p) => p.pronunciationSkipped)
      .map((p) => ({ word: p.word, reason: '上次跳过了跟读，复习时会再遇到这个词', at: '' })),
  ].filter((x, i, arr) => arr.findIndex((y) => y.word === x.word) === i)

  const wordCards = (() => {
    const seen = new Set<string>()
    const cards: Array<{ word: string; meaning: string; example: string }> = []
    for (const t of data.texts) {
      for (const k of t.keywords) {
        const key = k.word.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        cards.push(k)
      }
      for (const s of t.scenarios) {
        for (const w of s.targetWords) {
          const key = w.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          cards.push(lookupWord(w))
        }
      }
    }
    return cards.slice(0, 60)
  })()

  const queue = [...data.reviewQueue].sort((a, b) => a.dueAt - b.dueAt)
  const voiceSummary = summarizeVoice(data.voiceReports, getIeltsLevel(data.settings.ieltsLevel))

  const answer = (item: ReviewItem, remembered: boolean) => {
    update((prev) => ({
      ...prev,
      reviewQueue: prev.reviewQueue.map((q) => q.id === item.id ? promoteReviewItem(q, remembered) : q),
    }))
    notify(remembered
      ? `记住啦！「${item.content}」将在 ${SRS_INTERVALS[Math.min(item.level + 1, SRS_INTERVALS.length - 1)]} 天后回来`
      : '没问题，这张卡片今天再陪你练一次 🌱')
    bumpBatch()
  }

  const toggleMastered = (id: string) => {
    update((prev) => ({
      ...prev, mistakes: prev.mistakes.map((m) => m.id === id ? { ...m, mastered: !m.mastered } : m),
    }))
  }

  const removeMistake = (id: string) => {
    update((prev) => ({ ...prev, mistakes: prev.mistakes.filter((m) => m.id !== id) }))
    notify('已从错题本移除')
  }

  /** [新增] 词场卡片作答：统一调度器只前进/回退一级，答错不清零 */
  const answerWord = (word: string, correct: boolean) => {
    update((prev) => {
      const p = prev.wordProgress.words[word]
      if (!p) return prev
      return {
        ...prev,
        wordProgress: {
          ...prev.wordProgress,
          words: { ...prev.wordProgress.words, [word]: advanceProgress(p, correct) },
        },
      }
    })
    const p = data.wordProgress.words[word]
    const ladderDone = p && p.status === 'ladder' && p.ladderStep + 1 >= EBBINGHAUS_STEPS_MS.length
    notify(correct
      ? `记住啦！「${word}」${ladderDone ? '已走完学习阶梯，并入 SM-2 队列' : '按艾宾浩斯阶梯排到下一次复习'}`
      : `没关系，「${word}」只回退一级、不清零，稍后再见一次 🌱`)
    bumpBatch()
  }

  /** 队列卡片只写一份：compact 形态用于置顶焦点区，不渲染作答按钮，避免抢走 tab 内的作答入口 */
  const renderQueueCard = (item: ReviewItem, compact = false) => {
    const due = item.dueAt <= Date.now()
    return (
      <Card key={item.id} className={due ? '!border-brand-200' : ''}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone={item.kind === 'mistake' ? 'coral' : item.kind === 'phrase' ? 'mint' : 'brand'}>
                {item.kind === 'mistake' ? '错题' : item.kind === 'phrase' ? '短语' : '单词'}
              </Chip>
              <Chip tone={due ? 'sun' : 'slate'}>{dueLabel(item)}</Chip>
              <span className="text-[10px] text-muted">第 {item.level + 1} 阶</span>
            </div>
            <p className="en-text mt-2 break-words text-base font-bold text-ink">{item.content}</p>
            <p className="mt-1 text-xs text-brand-600">{item.meaning}</p>
            <p className="en-text mt-1.5 text-xs italic leading-relaxed text-muted">{item.example}</p>
            {item.lastReviewedAt && <p className="mt-1.5 text-[10px] text-muted">上次复习：{formatDate(item.lastReviewedAt)}</p>}
          </div>
          <button type="button" onClick={() => speak(item.content, data.settings)} aria-label="朗读卡片"
            className="flex h-11 w-11 shrink-0 items-center justify-center text-brand-500 hover:text-brand-700">
            <Icon name="speaker" size={16} /></button>
        </div>
        {!compact && (
          <div className="mt-3 flex gap-2 border-t border-brand-50 pt-3">
            <button type="button" onClick={() => answer(item, false)} className="btn-ghost flex-1 !py-2 !text-xs">
              <Icon name="refresh" size={14} />再练一次</button>
            <button type="button" onClick={() => answer(item, true)} className="btn-primary flex-1 !py-2 !text-xs">
              <Icon name="check" size={14} />记住了</button>
          </div>
        )}
      </Card>
    )
  }

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'queue', label: '复习队列', count: queue.length },
    { id: 'mistakes', label: '错题本', count: data.mistakes.length },
    { id: 'words', label: '词汇卡', count: wordCards.length },
    { id: 'wordLab', label: '词场', count: wordDue.length },
  ]

  return (
    <div className="animate-in space-y-5">
      {/* ① 间隔重复队列：置顶焦点区。只露前两张，长列表收进「全部复习队列」 */}
      <section data-testid="review-queue-focus">
        <SectionTitle title="间隔重复队列" subtitle="答对就拉长间隔，忘了就今天再见一次。"
          right={<Chip tone="brand">待复习 {queue.length} 张</Chip>} />
        {queue.length === 0 ? (
          <EmptyState emblem="🗓️" title="队列还是空的" desc="完成一场对话后，新词、短语和易错表达会自动排进来。"
            action={<button type="button" onClick={() => navigate('home')} className="btn-primary">去开始对话</button>} />
        ) : (
          <>
            <div className="space-y-2.5">{queue.slice(0, 2).map((item) => renderQueueCard(item, true))}</div>
            <button type="button" onClick={() => setTab('queue')}
              className="btn-primary mt-3 min-h-[48px] w-full !text-sm">
              <Icon name="cards" size={16} />开始复习{queue.length > 2 ? ` · 还有 ${queue.length - 2} 张` : ''}
            </button>
          </>
        )}
      </section>

      {/* 学习状态总览 */}
      <section className="rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-brand-50/60 to-sun-100/50 p-5 shadow-card">
        <div className="flex items-center gap-5">
          <div className="rounded-full bg-white p-1 shadow-card">
            <ProgressRing value={Math.min(1, profile.todayXp / Math.max(profile.dailyGoal, 1))}
              label={`${profile.todayXp}`} sub={`/ ${profile.dailyGoal} XP`} size={92} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-black text-ink">今日目标</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">连续学习 {profile.streak} 天 · 累计 {profile.xp} XP · {data.sessions.filter((s) => s.finishedAt).length} 场对话</p>
            <ProgressBar value={Math.min(1, profile.todayXp / Math.max(profile.dailyGoal, 1))} className="mt-3" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ACHIEVEMENTS.filter((a) => profile.achievements.includes(a.id)).map((a) => (
                <Chip key={a.id} tone="sun" title={a.desc}>{a.emblem} {a.name}</Chip>
              ))}
              {!profile.achievements.length && <Chip tone="slate">完成首场对话即可解锁成就</Chip>}
            </div>
          </div>
        </div>
      </section>

      {/* [成长系统] 今日复习批次 XP：完成 10 次作答才算一批，每日上限 3 批 */}
      <div data-testid="review-xp-today"
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-50/80 px-4 py-3">
        <p className="text-[11px] font-bold text-brand-700">
          今日复习 XP：{reviewXpToday} / {XP_RULES.review_batch * 3} · 每完成 10 次作答算一批（15 XP），每日最多 3 批
        </p>
        <p className="text-[10px] font-semibold text-muted">本批进度 {batchProgress} / 10</p>
      </div>

      {/* 到期提醒 */}
      {dueReviews.length > 0 && (
        <button type="button" onClick={() => setTab('queue')}
          className="flex w-full items-center gap-3 rounded-2xl bg-coral-100/70 px-4 py-3 text-left">
          <Icon name="clock" size={18} className="text-coral-600" />
          <p className="flex-1 text-xs font-bold text-coral-600">{dueReviews.length} 张卡片正在等你，趁热打铁最有效</p>
          <Icon name="right" size={15} className="text-coral-600" />
        </button>
      )}

      {/* 发音练习卡：Feature Flag 关闭入口，语音服务 / 评测数据 / 今日报告全部保留 */}
      {SHOW_PRONUNCIATION_REVIEW && voiceSummary && (
        <Card>
          <SectionTitle title="发音练习" subtitle="从你最近的录音里挑出最值得练的一点。" right={<Chip tone="brand">{voiceSummary.count} 段评测</Chip>} />
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/50 p-3">
            <p className="text-[10px] font-bold text-muted">今日重点</p>
            <p className="mt-1 text-xs leading-relaxed text-ink">{voiceSummary.focus}</p>
          </div>
          <div className="mt-2 space-y-1.5">
            {voiceSummary.suggestions.slice(0, 2).map((s) => (
              <p key={s} className="flex items-start gap-1.5 rounded-xl bg-sun-100/60 px-2.5 py-2 text-[10px] leading-relaxed text-[#8a5b08]">
                <Icon name="bulb" size={12} className="mt-0.5 shrink-0" />{s}
              </p>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('settings')} className="btn-primary !py-2 !text-xs">
              <Icon name="mic" size={14} />去试音并评测</button>
            <button type="button" onClick={() => navigate('progress')} className="btn-ghost !py-2 !text-xs">
              <Icon name="chart" size={14} />看发音趋势</button>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-muted">
            {voiceSummary.avgWpm} wpm 平均语速 · 参考 Band {voiceSummary.avgBand.toFixed(1)} · 练习参考分，非官方雅思评分。
          </p>
        </Card>
      )}

      {/* 分板块入口：2×2 紧凑网格，文案与切换逻辑不变 */}
      <div className="grid grid-cols-2 gap-2">
        {tabs.map((t) => {
          const icon = t.id === 'queue' ? 'cards' : t.id === 'mistakes' ? 'flag'
            : t.id === 'words' ? 'book' : 'sparkles'
          const active = tab === t.id
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={active}
              className={`rv-entry flex min-h-[60px] items-center gap-2.5 rounded-2xl px-3 text-left transition ${
                active ? 'rv-entry-active' : 'rv-entry-idle'}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                active ? 'bg-white/90 text-brand-600' : 'bg-brand-50 text-brand-500'}`}>
                <Icon name={icon} size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold">{t.label}</span>
                <span className="block text-[10px] opacity-70">{t.count} 项</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* 全部复习队列：由顶部「开始复习」进入，完整列表按需查看 */}
      {tab === 'queue' && (
        <section>
          <SectionTitle title="全部复习队列" subtitle={`共 ${queue.length} 张，按到期时间排序；作答后自动重新排程。`} />
          {queue.length === 0 ? (
            <EmptyState emblem="🗓️" title="队列还是空的" desc="完成一场对话后，新词、短语和易错表达会自动排进来。"
              action={<button type="button" onClick={() => navigate('home')} className="btn-primary">去开始对话</button>} />
          ) : (
            <div className="space-y-2.5">{queue.map((item) => renderQueueCard(item))}</div>
          )}
        </section>
      )}

      {/* 错题本 */}
      {tab === 'mistakes' && (
        <section>
          <SectionTitle title="错题本" subtitle="每一条都是一次真实的表达尝试，改好就收进口袋。" />
          {data.mistakes.length === 0 ? (
            <EmptyState emblem="🛠️" title="错题本干干净净" desc="对话中出现的可改写表达会自动收进这里，随时标记「已掌握」。" />
          ) : (
            <div className="space-y-2.5">
              {data.mistakes.map((m) => (
                <Card key={m.id} className={m.mastered ? 'opacity-70' : ''}>
                  <div className="flex items-center justify-between gap-2">
                    <Chip tone={m.mastered ? 'mint' : 'coral'}>{m.mastered ? '已掌握' : m.type}</Chip>
                    <button type="button" onClick={() => removeMistake(m.id)} aria-label="移除错题" className="text-muted hover:text-coral-600">
                      <Icon name="close" size={15} /></button>
                  </div>
                  <p className="en-text mt-2 break-words text-sm text-ink/70 line-through decoration-coral-400/60">{m.original}</p>
                  <div className="my-2 flex items-center gap-2 text-brand-500"><Icon name="down" size={13} /><span className="text-[10px] font-bold">推荐改写</span></div>
                  <p className="en-text rounded-xl bg-mint-100/60 p-2.5 text-sm font-semibold text-ink">{m.corrected}</p>
                  <p className="mt-2 text-[10px] text-muted">{m.note} · {formatDate(m.createdAt)}</p>
                  <button type="button" onClick={() => toggleMastered(m.id)} className="btn-ghost mt-3 w-full !py-2 !text-xs">
                    <Icon name="check" size={14} />{m.mastered ? '重新加入练习' : '标记已掌握'}</button>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 词汇卡 */}
      {tab === 'words' && (
        <section>
          <SectionTitle title="目标词汇卡" subtitle="点卡片翻面看释义与例句，先自己回想再看答案。" />
          {wordCards.length === 0 ? (
            <EmptyState emblem="📚" title="还没有词汇卡" desc="分析一段文本后，重点词汇会自动变成可翻面的卡片。"
              action={<button type="button" onClick={() => navigate('home')} className="btn-primary">贴一段英文</button>} />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {wordCards.map((k) => {
                const open = flipped.includes(k.word)
                return (
                  <button key={k.word} type="button" onClick={() => setFlipped((prev) => open ? prev.filter((x) => x !== k.word) : [...prev, k.word])}
                    className={`card min-h-[112px] p-4 text-left transition hover:border-brand-300 ${open ? '!bg-brand-50/70' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="en-text font-display text-lg font-bold text-ink">{k.word}</p>
                      <span className="text-[10px] font-semibold text-muted">{open ? '释义 / 例句' : '点击翻面'}</span>
                    </div>
                    {open ? (
                      <div className="animate-in mt-2">
                        <p className="text-xs font-bold text-brand-600">{k.meaning}</p>
                        <p className="en-text mt-1.5 text-xs italic leading-relaxed text-muted">{k.example}</p>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted">先想一想：这个词是什么意思？</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* [S2.5 新增] 独立卡片，与拼写易错本 / 词汇卡分开，避免两类问题混淆 */}
          <Card className="mt-4" testId="pronunciation-flags">
            <SectionTitle title="发音待留意" subtitle="只记录跟读里连续漏掉的词与跳过的跟读；和拼写易错本分开，互不混排。"
              right={<Chip tone="slate">{pronunciationAttention.length} 个词</Chip>} />
            {pronunciationAttention.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-muted">
                暂时没有需要留意的词。跟读里连续两次漏掉同一个词时，这里会轻轻记一笔。
              </p>
            ) : (
              <div className="space-y-2">
                {pronunciationAttention.map((f) => (
                  <div key={f.word} className="flex items-start gap-2 rounded-2xl bg-white/70 px-3 py-2.5">
                    <Chip tone="sun">跟读</Chip>
                    <div className="min-w-0">
                      <p className="en-text text-xs font-bold text-ink">{f.word}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{f.reason}{f.at ? ` · ${f.at}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      {/* [新增] 词场 tab：艾宾浩斯阶梯 + SM-2 统一调度，与既有队列合并展示 */}
      {tab === 'wordLab' && (
        <section>
          <SectionTitle title="词场复习" subtitle="新词走 10min→1d→3d→7d→15d→30d 学习阶梯，毕业后并入 SM-2；答错只回退一级。"
            right={<Chip tone="brand">在学 {wordStats.learning} · 已掌握 {wordStats.mastered}</Chip>} />
          {wordDue.length === 0 ? (
            <EmptyState emblem="🌱" title="暂时没有到期的词" desc="新词结算后 10 分钟会第一次回来；阅读与观后加入的生词也走这条阶梯。"
              action={<button type="button" onClick={() => navigate('wordLab')} className="btn-primary">去词场首页</button>} />
          ) : (
            <div className="space-y-2.5">
              {wordDue.map((p) => {
                const entry = findWord(p.word)
                const originLabel = p.origin === 'wordlab' ? '词场新词' : p.origin === 'reading' ? '阅读生词' : '视频生词'
                const stage = p.status === 'ladder'
                  ? `阶梯第 ${p.ladderStep + 1} / ${EBBINGHAUS_STEPS_MS.length} 级`
                  : `SM-2 第 ${p.sm2Level + 1} 阶`
                return (
                  <Card key={p.word} className="!border-brand-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip tone="brand">source: wordlab</Chip>
                          <Chip tone={p.origin === 'wordlab' ? 'mint' : 'sun'}>{originLabel}</Chip>
                          <Chip tone="slate">{stage}</Chip>
                        </div>
                        <p className={entry?.language === 'ru' ? 'mt-2 break-words text-base font-bold text-ink' : 'en-text mt-2 break-words text-base font-bold text-ink'}>
                          {entry?.language === 'ru' ? (entry.wordAccented ?? entry.word) : (entry?.word ?? p.word)}
                        </p>
                        <p className="mt-1 text-xs text-brand-600">{entry?.meaningZh ?? '词场学习词'}</p>
                        <p className={`mt-1.5 text-xs italic leading-relaxed text-muted ${entry?.language === 'ru' ? '' : 'en-text'}`}>
                          {entry?.examples[0] ?? `Review "${p.word}" in your own sentence.`}
                        </p>
                        <p className="mt-1.5 text-[10px] text-muted">
                          复习 {p.reviewCount} 次 · 错 {p.errorCount} 次{p.lastReviewedAt ? ` · 上次 ${formatDate(p.lastReviewedAt)}` : ''}
                        </p>
                      </div>
                      <button type="button" data-testid={entry?.language === 'ru' ? 'review-word-speak-ru' : undefined}
                        onClick={() => speak(entry?.word ?? p.word, data.settings, entry?.language === 'ru' ? 'ru-RU' : undefined)}
                        aria-label="朗读卡片"
                        className="text-brand-500 hover:text-brand-700"><Icon name="speaker" size={16} /></button>
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-brand-50 pt-3">
                      <button type="button" onClick={() => answerWord(p.word, false)} className="btn-ghost flex-1 !py-2 !text-xs">
                        <Icon name="refresh" size={14} />再练一次</button>
                      <button type="button" onClick={() => answerWord(p.word, true)} className="btn-primary flex-1 !py-2 !text-xs">
                        <Icon name="check" size={14} />记住了</button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
          <button type="button" onClick={() => navigate('errorBook')}
            className="btn-ghost mt-3 w-full !py-2 !text-xs">
            <Icon name="book" size={14} />打开词场易错本（{data.wordErrors.filter((e) => !e.resolved).length} 个待攻克）
          </button>
        </section>
      )}

      <div className="rounded-2xl bg-white/60 p-4 text-center text-[11px] leading-relaxed text-muted">
        复习间隔：{SRS_INTERVALS.join(' → ')} 天。词场新词先走艾宾浩斯阶梯（10min → 1d → 3d → 7d → 15d → 30d），毕业后并入上表。所有记录保存在本机 localStorage，换设备不会同步。
      </div>
    </div>
  )
}
