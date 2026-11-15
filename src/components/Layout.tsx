import type { ReactNode } from 'react'
import { useApp, useDerived } from '../store/useAppStore'
import { ACHIEVEMENTS } from '../data/mockData'
import type { View } from '../types'
import { cn } from '../lib/utils'
import { Avatar, Chip, Icon, ProgressRing, Toast, type IconName } from './ui'
/** [成长系统] XP 轻提示与升级横幅只订阅统一入口派发的事件 */
import { XpToast } from './XpToast'
import { LevelUpBanner } from './LevelUpBanner'
/** [PWA] 新版本只提示、由用户点「立即更新」才 reload；全局唯一挂载点 */
import { UpdatePrompt } from './UpdatePrompt'

/** [修改点] 追加「文化」「词场」「成长」三项；原有学习/书架/复习/进度/设置顺序与标签不变 */
const NAV: Array<{ view: View; label: string; icon: IconName }> = [
  { view: 'home', label: '学习', icon: 'home' },
  { view: 'library', label: '书架', icon: 'book' },
  { view: 'cultureHub', label: '文化', icon: 'play' },
  { view: 'wordLab', label: '词场', icon: 'sparkles' },
  { view: 'review', label: '复习', icon: 'cards' },
  { view: 'growth', label: '成长', icon: 'trophy' },
  { view: 'progress', label: '进度', icon: 'chart' },
  { view: 'settings', label: '设置', icon: 'gear' },
]

/** 文学长廊的五个视图都点亮「书架」标签 */
const LITERARY_VIEWS: View[] = ['library', 'bookDetail', 'reader', 'seminar', 'readingProgress']
/** [修改点] 文化长街的四个视图点亮「文化」标签 */
const CULTURE_VIEWS: View[] = ['cultureHub', 'watch', 'postWatch', 'cultureReview']
/** [新增] 词场的四个视图点亮「词场」标签 */
const WORD_LAB_VIEWS: View[] = ['wordLab', 'deckPicker', 'wordSession', 'errorBook']
/** [成长系统] 成长页与成就页都点亮「成长」标签 */
const GROWTH_VIEWS: View[] = ['growth', 'achievements']
/** [China Learner Track] 资源库两个视图归入「学习」，不新增底部导航项 */
const CHINA_TRACK_VIEWS: View[] = ['chinaTrack', 'chinaUnit']

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 font-display text-lg font-black text-white shadow-soft">
        L
      </div>
      <div className="leading-tight">
        <p className="font-display text-base font-black tracking-tight text-ink">LinguaBuddy</p>
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted">语伴英语 · 对话冒险</p>
      </div>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { data, view, navigate, toast } = useApp()
  const { dueReviews } = useDerived()
  const { profile } = data
  const dailyPct = Math.min(1, profile.todayXp / Math.max(profile.dailyGoal, 1))
  const unlocked = ACHIEVEMENTS.filter((a) => profile.achievements.includes(a.id))

  return (
    <div className="app-bg min-h-screen">
      <Toast message={toast} />
      <XpToast enabled={data.settings.showXpAnimation} />
      <LevelUpBanner enabled={data.settings.showXpAnimation} />
      <UpdatePrompt />
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-3 pb-28 pt-3 sm:px-5 xl:grid-cols-[216px_minmax(0,680px)_216px] xl:pt-6">
        {/* 桌面左侧：今日目标 */}
        <aside className="hidden xl:block">
          <div className="sticky top-6 space-y-4">
            <Brand />
            <div className="card p-5 text-center">
              <p className="mb-3 text-xs font-bold text-muted">今日目标</p>
              <ProgressRing value={dailyPct} label={`${profile.todayXp}/${profile.dailyGoal}`} sub="XP" size={104} />
              <p className="mt-3 text-xs leading-relaxed text-muted">
                {dailyPct >= 1 ? '今天的目标已经达成，太棒了！' : '再练一轮对话，就能点亮今天的进度环。'}
              </p>
            </div>
            <div className="rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-soft">
              <p className="text-xs font-bold opacity-80">今日一句</p>
              <p className="en-text mt-2 text-sm font-semibold leading-relaxed">"Every sentence you try is a step forward."</p>
              <p className="mt-2 text-[11px] opacity-75">每一句开口，都是往前一步。</p>
            </div>
          </div>
        </aside>

        {/* 主栏 */}
        <main className="mx-auto w-full min-w-0 max-w-[680px] xl:col-start-2">
          <header className="glass sticky top-0 z-30 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-white/70 px-3 py-2.5 shadow-card">
            <div className="xl:hidden"><Brand /></div>
            <div className="hidden xl:block">
              <p className="font-display text-sm font-bold text-ink">把一段文字，变成一场对话</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Chip tone="sun"><Icon name="flame" size={13} />{profile.streak} 天</Chip>
              <button type="button" onClick={() => navigate('growth')} aria-label="打开成长页" title="打开成长页">
                <Chip tone="brand"><Icon name="star" size={13} />{profile.xp} XP</Chip>
              </button>
              <button type="button" onClick={() => navigate('settings')} aria-label="个人设置">
                <Avatar name={profile.nickname} size={32} tone="mint" />
              </button>
            </div>
          </header>
          {children}
        </main>

        {/* 桌面右侧：阅读页让位给旁侧生词词典，其余页面仍是成就与待办 */}
        <aside className="hidden xl:block">
          {view === 'reader' ? (
            <div id="reader-word-slot" className="sticky top-6 space-y-4" />
          ) : (
          <div className="sticky top-6 space-y-4">
            <div className="card p-5">
              <p className="mb-1 text-xs font-bold text-muted">成就徽章</p>
              <p className="font-display text-2xl font-black text-ink">{unlocked.length}<span className="text-sm font-semibold text-muted"> / {ACHIEVEMENTS.length}</span></p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ACHIEVEMENTS.slice(0, 6).map((a) => (
                  <div key={a.id} title={`${a.name} · ${a.desc}`}
                    className={cn('flex h-9 w-9 items-center justify-center rounded-xl text-lg',
                      profile.achievements.includes(a.id) ? 'bg-sun-100' : 'bg-slate-100 opacity-40 grayscale')}>
                    {a.emblem}
                  </div>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => navigate('review')} className="card w-full p-5 text-left transition hover:border-brand-200">
              <p className="text-xs font-bold text-muted">待复习卡片</p>
              <p className="mt-1 font-display text-2xl font-black text-brand-600">{dueReviews.length}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">间隔重复队列已为你排好顺序 →</p>
            </button>
            <p className="px-2 text-[11px] leading-relaxed text-muted">
              LinguaBuddy 全程本地运行：文本分析、对话生成与学习记录都保存在这台设备的浏览器里。
            </p>
          </div>
          )}
        </aside>
      </div>

      {/* 底部导航 */}
      <nav className="fixed bottom-3 left-1/2 z-40 w-[min(96vw,600px)] -translate-x-1/2 pb-[env(safe-area-inset-bottom)]">
        <div className="glass flex items-center justify-around overflow-x-auto rounded-3xl border border-white/80 px-2 py-1.5 shadow-float">
          {NAV.map((item) => {
            const active = view === item.view ||
              (item.view === 'home' && ['analysis', 'scenario', 'dialogue', 'report', ...CHINA_TRACK_VIEWS].includes(view)) ||
              (item.view === 'library' && LITERARY_VIEWS.includes(view)) ||
              (item.view === 'cultureHub' && CULTURE_VIEWS.includes(view)) ||
              (item.view === 'wordLab' && WORD_LAB_VIEWS.includes(view)) ||
              (item.view === 'growth' && GROWTH_VIEWS.includes(view))
            return (
              <button key={item.view} type="button" onClick={() => navigate(item.view)}
                className={cn('relative flex min-w-[46px] flex-col items-center gap-0.5 rounded-2xl px-1.5 py-2 text-[11px] font-bold transition sm:min-w-[58px] sm:px-2.5',
                  active ? 'bg-brand-500 text-white shadow-soft' : 'text-muted hover:bg-white/70 hover:text-brand-600')}>
                <Icon name={item.icon} size={19} />
                {item.label}
                {item.view === 'review' && dueReviews.length > 0 && (
                  <span className="absolute right-1.5 top-1 h-2 w-2 rounded-full bg-coral-500" />
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
