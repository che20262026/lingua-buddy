import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import { dueWords, wordLabStats } from '../lib/wordScheduler'
import { remainingQuota, startWordSession, SESSION_SIZE } from '../lib/wordLabFlow'
import { DECK_IDS, DECK_META, firstShard } from '../data/wordDecks'
import { Card, Chip, EmptyState, Icon, ProgressBar, ProgressRing, SectionTitle } from '../components/ui'
import type { DeckId } from '../wordLabTypes'

/**
 * 词场首页（S0 限流在这里把关）：
 * - 今日新词额度环：满额时不显示任何诱导继续学新词的按钮
 * - 到期词入口 → 复习页「词场」tab
 * - 当前词库卡片 + 换库入口
 *
 * [首屏 UI 精简] 只动渲染层：
 *   A. 「今日词场 + 当前词库」压成并列双卡（grid-cols-1 / sm:grid-cols-2）。
 *   B. 「概览 + 易错本」两个入口收进一个「更多」下拉，沿用原跳转与原空态逻辑。
 *   C. 五步学习法声明用常量控制不渲染（文案与数据保留在原数组，不删不改名）。
 *   数据计算 / S0 满额拦截 / 配额规则 / 路由 / 全部中文文案一字未改。
 */

/** [改动C] 首屏不展示五步学习法声明；数组内容完整保留，未来改回 true 即可恢复 */
const SHOW_FIVE_STEPS_ON_HOME = false
const FIVE_STEPS: Array<[string, string, string]> = [
  ['S1', '猜义', '先猜再学，不许跳过——错误本身帮助记忆'],
  ['S2', '验证', '配图与例句联动，揭晓中文释义'],
  ['S3', '拼写', '打字逐字母比对，或手写自评'],
  ['S4', '结算', '教练两句话点评，XP 到账'],
  ['S5', '排程', '艾宾浩斯阶梯 10min→1d→3d→7d→15d→30d 自动接管'],
  ['🔁', '并轨', '走完阶梯并入既有 SM-2 复习队列'],
]

export function WordLabHome() {
  const app = useApp()
  const { data } = app
  const [moreOpen, setMoreOpen] = useState(false)
  /** [多语言] 语言切换底部面板开关；当前语言来自 settings.wordLanguage（持久化、不新增键） */
  const [langOpen, setLangOpen] = useState(false)
  const currentLang = data.settings.wordLanguage ?? 'en'
  /** 按当前语言取可选词库：俄语只展示 ru_a1/ru_a2，英语展示原 7 库 */
  const visibleDecks = currentLang === 'ru'
    ? (['ru_a1', 'ru_a2'] as DeckId[])
    : DECK_IDS
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

  // 粗进度条：当前词书总进度（已学 / 总词数），与参考图「已学习 1390/2200」同构
  const learnedToday = data.wordDailyQuota.newWordsLearned
  const deckPct = Math.min(1, deckLearned / 50)
  // 剩余天数：按当前每日上限估算剩余词数需要的天数（真实可推导数据，不编造）
  const daysLeft = Math.max(0, Math.ceil((50 - deckLearned) / Math.max(data.wordDailyQuota.limit, 1)))

  return (
    <>
    <div className="wl-board animate-in min-h-screen bg-[#f7f8fb] px-4 pb-32 pt-5 sm:px-6">
      <div className="mx-auto max-w-[640px] space-y-3">
        {/* 改动 A：今日词场 + 当前词库 并列双卡（窄屏堆叠，≥640px 两列等宽） */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* ① 今日词场 */}
          <section className="flex min-w-0 flex-col rounded-3xl bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-black text-ink">今日词场</p>
              <ProgressRing value={Math.min(1, remaining / Math.max(data.wordDailyQuota.limit, 1))}
                label={`${remaining}`} sub={`/ ${data.wordDailyQuota.limit} 新词`} size={54} />
            </div>

            <div className="mt-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display text-lg font-black text-ink">
                  已学习 <span className="text-brand-600">{deckLearned}</span>
                  <span className="text-xs font-bold text-muted"> / 50</span>
                </p>
                <p className="shrink-0 text-[11px] font-bold text-brand-600">剩余 {daysLeft} 天</p>
              </div>
              {/* 粗进度条：品牌主色实心填充，14px 高 */}
              <div className="mt-2 h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500 transition-all duration-500"
                  style={{ width: `${Math.round(deckPct * 100)}%` }} />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                已学 {learnedToday} 个新词 · 在学 {stats.learning} · 已掌握 {stats.mastered}
              </p>
            </div>

            {quotaFull && (
              <div className="mt-2 rounded-xl bg-sun-100/70 px-3 py-2 text-[10px] font-bold text-[#8a5b08]">
                今日新词已学满。复习不占用额度，先去消化今天的词吧。
              </div>
            )}

            {/* 到期复习入口 */}
            <button type="button" onClick={() => app.navigate('review', { reviewTab: 'wordLab' })}
              className="mt-2 flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-brand-50/70 px-3 text-left transition active:scale-[0.99] hover:bg-brand-50">
              <Icon name="clock" size={16} className="shrink-0 text-brand-600" />
              <p className="flex-1 text-[11px] font-bold text-brand-600">
                {due.length > 0 ? `${due.length} 个词到了复习时间，趁热打铁最有效` : '还没有到期词——新词学完 10 分钟后回来'}
              </p>
              <Icon name="right" size={15} className="shrink-0 text-brand-600" />
            </button>

            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              新词每天最多 {data.wordDailyQuota.limit} 个（可在设置里调 10-15），复习不受限。
            </p>
          </section>

          {/* ② 当前词库 */}
          <section className="flex min-w-0 flex-col rounded-3xl bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-black text-ink">当前词库</p>
              {meta && <Chip tone="brand">{meta.emblem} {meta.name}</Chip>}
            </div>

            {meta ? (
              <div className="mt-2 flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-black text-ink">{meta.emblem} {meta.name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted">{meta.subtitle} · CEFR {meta.cefr}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-2xl font-black text-brand-600">{deckLearned}</p>
                    <p className="text-[9px] font-bold text-muted">已开始学</p>
                  </div>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
                    style={{ width: `${Math.round(deckPct * 100)}%` }} />
                </div>
                <p className="mt-1.5 text-[9px] text-muted">换了词库，已学词的进度都会保留。</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                  <button type="button" onClick={() => begin(meta.id)} disabled={quotaFull}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 text-xs font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40">
                    <Icon name="cards" size={14} />
                    {quotaFull ? '今日新词已满' : `学 ${Math.min(SESSION_SIZE, remaining)} 个新词`}
                  </button>
                  {/* 无边框文字按钮：品牌强调色 */}
                  <button type="button" onClick={() => app.navigate('deckPicker')}
                    className="inline-flex min-h-[44px] items-center gap-1 px-2 text-xs font-bold text-brand-600 transition hover:text-brand-700">
                    <Icon name="book" size={14} />换词库
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <EmptyState emblem="🃏" title="还没选词库" desc="先挑一个适合你水平的词库，五步学习法马上开始。"
                  action={<button type="button" onClick={() => app.navigate('deckPicker')} className="btn-primary !py-2 !text-xs">去挑词库</button>} />
              </div>
            )}
          </section>
        </div>

        {/* 改动 C：五步学习法声明 —— 常量控制不渲染；文案数据在 FIVE_STEPS 中完整保留 */}
        {SHOW_FIVE_STEPS_ON_HOME && (
          <Card className="!border-0 !bg-white !p-6 !shadow-sm">
            <SectionTitle title="五步学习法" subtitle="每个新词都走一遍完整闭环。" />
            <div className="grid gap-2 sm:grid-cols-2">
              {FIVE_STEPS.map(([tag, name, desc]) => (
                <div key={name} className="flex items-start gap-2.5 rounded-2xl bg-[#f7f8fb] p-3">
                  <span className="mt-0.5 flex h-7 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-[10px] font-black text-brand-700">{tag}</span>
                  <div>
                    <p className="text-xs font-bold text-ink">{name}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 改动 B：概览 + 易错本 收进一个「更多」入口（条件渲染下拉，不进 DOM 即真正不可见） */}
        <div className="relative flex items-center justify-end gap-2">
          {/* 「更多」按钮保持在 language 按钮之前：冒烟 click(/更多/) 按首个 textContent 命中，
              若 language 按钮在前会被误命中（项目既有坑）。 */}
          <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-white px-4 text-xs font-bold text-brand-600 shadow-sm transition hover:bg-brand-50">
            <Icon name="info" size={15} />更多<Icon name="down" size={13} />
          </button>
          {/* [多语言] 语言切换入口：与「更多」并列的独立按钮，文案唯一不冲突 */}
          <button type="button" data-testid="wordlab-language-entry" aria-expanded={langOpen}
            onClick={() => setLangOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-white px-4 text-xs font-bold text-brand-600 shadow-sm transition hover:bg-brand-50">
            🌐 更多语言
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-[48px] z-20 w-56 rounded-2xl border border-white/80 bg-white p-1.5 shadow-float">
              <button type="button" onClick={() => { setMoreOpen(false); app.navigate('progress') }}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-ink transition hover:bg-brand-50">
                <Icon name="chart" size={15} className="text-brand-600" />概览
              </button>
              <button type="button" onClick={() => { setMoreOpen(false); app.navigate('errorBook') }}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-ink transition hover:bg-brand-50">
                <Icon name="edit" size={15} className="text-brand-600" />打开易错本
              </button>
              <p className="border-t border-slate-100 px-3 py-2 text-[10px] leading-relaxed text-muted">
                {data.wordErrors.length === 0
                  ? '目前空空如也——学习时拼错或猜错的词会自动出现在这里。'
                  : `${data.wordErrors.filter((e) => !e.resolved).length} 个待攻克 · 共 ${data.wordErrors.length} 条记录`}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl px-4 py-3 text-center text-[11px] leading-relaxed text-muted">
          7 个词库全部来自公开考试大纲词表（事实性清单）；释义自行改写，例句为自建模板。
          数据只保存在本机 localStorage。
        </div>
      </div>
    </div>

    {/* [多语言] 语言切换底部面板：挂在 animate-in 容器之外，fixed 定位不被 transform 破坏。
        非原生 dialog（jsdom 未实现 showModal）；Esc / 遮罩轻关闭；纯会话态开关 + settings 持久化选择。 */}
    {langOpen && (
      <div className="dlg-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 backdrop-blur-sm"
        onMouseDown={(e) => { if (e.target === e.currentTarget) setLangOpen(false) }}>
        <div role="dialog" aria-modal="true" aria-label="选择词场语言" data-testid="wordlab-language-sheet"
          className="dlg-panel w-full max-w-lg rounded-t-3xl bg-white pb-[calc(16px_+_env(safe-area-inset-bottom))] shadow-float">
          <div className="flex items-center justify-between border-b border-brand-50 px-4 py-3.5">
            <div>
              <p className="text-[15px] font-black text-ink">选择词场语言</p>
              <p className="mt-0.5 text-[11px] text-muted">切换后词库、发音与拼写键盘同步更新；进度互不覆盖。</p>
            </div>
            <button type="button" onClick={() => setLangOpen(false)} aria-label="关闭语言选择"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-muted">
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="space-y-1.5 px-4 py-3">
            {/* 英语：默认选中，显示当前教材 / 等级 */}
            <button type="button" data-testid="wordlab-lang-en" onClick={() => { app.update((p) => ({ ...p, settings: { ...p.settings, wordLanguage: 'en' } })); setLangOpen(false) }}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${currentLang === 'en' ? 'border-brand-400 bg-brand-50' : 'border-brand-50 bg-white'}`}>
              <span className="text-2xl">🇬🇧</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">英语 English {currentLang === 'en' && <span className="text-brand-600">· 已选中</span>}</span>
                <span className="mt-0.5 block text-[11px] text-muted">7 个分级词库 · 当前教材：{meta?.name ?? '未选'} · CEFR {meta?.cefr ?? '—'}</span>
              </span>
            </button>
            {/* 俄语：可点击切换 */}
            <button type="button" data-testid="wordlab-lang-ru" onClick={() => { app.update((p) => ({ ...p, settings: { ...p.settings, wordLanguage: 'ru' } })); setLangOpen(false) }}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${currentLang === 'ru' ? 'border-brand-400 bg-brand-50' : 'border-brand-50 bg-white'}`}>
              <span className="text-2xl">🇷🇺</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">俄语 Русский {currentLang === 'ru' && <span className="text-brand-600">· 已选中</span>}</span>
                <span className="mt-0.5 block text-[11px] text-muted">ТРКИ A1 / A2 两个词库 · ru-RU 发音 · 西里尔软键盘</span>
              </span>
            </button>
            {/* 预留语种：置灰、不可点击 */}
            {[['🇯🇵', '日语 日本語'], ['🇫🇷', '法语 Français']].map(([flag, label]) => (
              <div key={label} data-testid={`wordlab-lang-soon-${label.split(' ')[1]}`}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 opacity-55">
                <span className="text-2xl">{flag}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-muted">{label}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">敬请期待</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export function deckName(deckId: DeckId): string {
  return DECK_META[deckId].name
}

export { DECK_IDS }
