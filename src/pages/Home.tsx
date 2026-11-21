import { useEffect, useRef, useState } from 'react'
import { useApp, useDerived } from '../store/useAppStore'
import { analyzeText } from '../services/textAnalyzer'
import { SAMPLE_TEXT, SAMPLE_TEXTS } from '../data/mockData'
import { getIeltsLevel } from '../data/ieltsLevels'
import { speak } from '../lib/speech'
import { Card, Chip, EmptyState, Icon, Loader, ProgressRing, SectionTitle } from '../components/ui'
/** [CEFR 等级层] 每日计划的今日推荐读取 active 等级，不读 recommended */
import { recommendDailyTask } from '../services/dailyPlan'
import { SyncBanner } from '../components/SyncBanner'
import { DailyGoalModal } from '../components/DailyGoalModal'

const MIN_CHARS = 30

/** sessionStorage：本次会话不再自动弹出「今日目标」弹窗（不新增 localStorage 键） */
const GOAL_DISMISS_KEY = 'lingua_home_goal_dismissed'

function goalDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(GOAL_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function markGoalDismissed(): void {
  try {
    window.sessionStorage.setItem(GOAL_DISMISS_KEY, '1')
  } catch {
    /* 隐私模式存不了就算了，不影响功能 */
  }
}

/**
 * [更多模块] 四个学习模式 —— 原先是首页中上部四张整宽宣传卡，
 * 挤在真正的功能区前面，是「界面乱」的主因。现在收成底部一张 2×2 小网格，
 * 文案与跳转一个没少，只是把视觉重量让给「今日目标」和「对话界面」。
 */
const MODULE_TILES = [
  { id: 'library', title: '经典英文文学研读', chip: '公版书单', icon: '📚', tint: 'bg-mint-100', view: 'library' as const },
  { id: 'culture', title: '文化视角视频', chip: '官方嵌入', icon: '🎬', tint: 'bg-coral-100', view: 'cultureHub' as const },
  { id: 'wordLab', title: '词场 · 主动词库学习', chip: '7 个词库', icon: '🃏', tint: 'bg-sun-100', view: 'wordLab' as const },
  { id: 'chinaTrack', title: '本土应试与真实能力桥接资源库', chip: '四个轨道', icon: '🧭', tint: 'bg-mint-100', view: 'chinaTrack' as const },
]

export function Home() {
  const { data, update, navigate, notify, draftText, setDraftText } = useApp()
  const { unfinished, dueReviews } = useDerived()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [goalOpen, setGoalOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const chars = draftText.trim().length
  const level = getIeltsLevel(data.settings.ieltsLevel)
  /** [CEFR 等级层] 今日计划跟着用户当前选择走，而不是推荐等级 */
  const todayTask = recommendDailyTask(data.levelPreference)
  const goalPct = Math.min(1, data.profile.todayXp / Math.max(data.profile.dailyGoal, 1))
  const levelLine = `${level.emblem} 当前目标 IELTS ${level.band} · ${level.name}（CEFR ${level.cefr}）`

  /* 今日目标弹窗：本次会话首次进入首页时自动弹一次；
     用户点「隐藏」后本次会话不再自动弹出，入口卡随时可以手动点开。 */
  useEffect(() => {
    if (goalDismissed()) return
    markGoalDismissed()
    setGoalOpen(true)
  }, [])

  const runAnalysis = (text: string) => {
    setError('')
    if (text.trim().length < MIN_CHARS) {
      setError(`再多点内容吧～至少需要 ${MIN_CHARS} 个字符，Agent 才能看清这段文字的轮廓。`)
      return
    }
    setLoading(true)
    // 模拟 Agent 思考，给本地分析一个可见的加载态
    window.setTimeout(() => {
      try {
        const result = analyzeText({
          text: text.trim(),
          targetDifficulty: data.settings.difficulty,
          ieltsLevelId: data.settings.ieltsLevel,
        })
        update((prev) => ({
          ...prev,
          texts: [result, ...prev.texts].slice(0, 20),
          scenarios: [
            ...result.scenarios.map((s) => ({ ...s, sourceAnalysisId: result.id })),
            ...prev.scenarios,
          ].slice(0, 80),
        }))
        setLoading(false)
        navigate('analysis', { analysisId: result.id })
      } catch (err) {
        setLoading(false)
        setError(`分析时遇到一点小状况：${String(err)}。可以换个文本再试一次。`)
      }
    }, 720)
  }

  const onUpload = (file?: File) => {
    if (!file) return
    const ok = /\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith('text/')
    if (!ok) {
      setError('只支持 .txt 或 .md 纯文本文件哦。')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('文件有点大（上限 2MB），换一小段文本试试。')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result || '')
      setDraftText(content)
      setError('')
      notify(`已载入「${file.name}」，检查一下就能生成场景啦`)
    }
    reader.onerror = () => setError('文件读取失败，可能是编码格式不受支持，试试直接粘贴文本。')
    reader.readAsText(file, 'utf-8')
  }

  return (
    <div className="space-y-5">
      {/* [云同步] 未登录告警横幅：真机第一屏就能看见「数据只在本机」，点一下直接登录。
          已登录（已同步）时该组件自动不渲染，首页不再被它占住黄金位。 */}
      <SyncBanner />

      {/* ① 今日目标：整页第一个模块。完整内容在弹窗里，这里只留显眼入口。 */}
      <button type="button" onClick={() => setGoalOpen(true)} data-testid="daily-goal-entry"
        className="card flex w-full items-center gap-4 p-4 text-left transition hover:border-brand-300">
        <ProgressRing value={goalPct} label={`${data.profile.todayXp}`} sub={`/ ${data.profile.dailyGoal} XP`} size={72} />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-black text-ink">今日目标 · 每天一点点就够</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{levelLine}</span>
          <span data-testid="daily-plan-task"
            className="mt-1.5 block rounded-xl bg-brand-50/70 px-2.5 py-1.5 text-[10px] leading-relaxed text-brand-700">
            今日推荐 · 按当前等级 {todayTask.level}：{todayTask.label}（{todayTask.module}）
          </span>
          <span className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-brand-600">
            查看完整今日目标<Icon name="right" size={12} />
          </span>
        </span>
      </button>

      {/* ② 对话界面：紧跟在今日目标下面，中间不再插任何干扰元素。 */}
      <Card className="animate-in">
        <SectionTitle title="今天想聊哪一段英文？" subtitle="粘贴、上传，或者直接拿示例文本开一场冒险。" />
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => { setDraftText(SAMPLE_TEXT); setError(''); notify('示例文本已就位，点击「生成学习场景」开始 ✨') }}
            className="btn-primary !px-4 !py-2 !text-xs">
            <Icon name="sparkles" size={15} />Try an example
          </button>
          {SAMPLE_TEXTS.slice(1).map((s) => (
            <button key={s.label} type="button" onClick={() => { setDraftText(s.text); setError('') }}
              className="btn-ghost !px-3 !py-2 !text-xs">{s.label}</button>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost !px-3 !py-2 !text-xs">
            <Icon name="upload" size={15} />上传 .txt / .md
          </button>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="hidden"
            onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        <textarea value={draftText} onChange={(e) => { setDraftText(e.target.value); setError('') }}
          placeholder="Paste any English text here… 例如一段小故事、一封邮件、一篇新闻，或课本里的一段对话。"
          rows={7}
          className="field en-text min-h-[150px] resize-y text-[15px] leading-relaxed" />
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>{chars} 字符 · {draftText.trim() ? draftText.trim().split(/\s+/).length : 0} 词</span>
          {draftText && (
            <button type="button" onClick={() => { setDraftText(''); setError('') }} className="font-semibold text-brand-600 hover:underline">清空</button>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-coral-100 px-4 py-3 text-xs font-semibold text-coral-600">
            <Icon name="info" size={15} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {loading ? <Loader /> : (
          <button type="button" onClick={() => runAnalysis(draftText)} disabled={loading}
            className="btn-primary mt-4 w-full !py-3.5 !text-base">
            <Icon name="sparkles" size={18} />生成学习场景<Icon name="right" size={16} />
          </button>
        )}

        {/* 大肥鱼自由对话：原先是首页一块独立大板块，现在收成对话区里的一个按钮。
            仍是唯一入口，仍不新增底部导航项。 */}
        <div className="mt-3 border-t border-brand-50 pt-3">
          <button type="button" onClick={() => navigate('freeTalk')} data-testid="home-freetalk-entry"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-[13px] font-bold text-brand-600 transition hover:bg-brand-100">
            <Icon name="fish" size={18} />大肥鱼自由对话
          </button>
          <p className="mt-1.5 text-center text-[10px] leading-relaxed text-muted">
            没有剧本，挑一条有脾气的胖鱼，用英 / 美 / 澳口音瞎聊
          </p>
        </div>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
          无需 API Key · 分析与进度保存在本机浏览器 · 随时可在设置页清空
        </p>
      </Card>

      {/* 续玩 / 待复习提示：只在真的有事时出现 */}
      {(unfinished || dueReviews.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {unfinished && (
            <button type="button" onClick={() => navigate('dialogue', { sessionId: unfinished.id, scenarioId: unfinished.scenarioId })}
              className="card flex items-center gap-3 p-4 text-left transition hover:border-brand-300">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon name="play" size={18} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">继续上次对话</p>
                <p className="truncate text-xs text-muted">{unfinished.scenarioTitle} · 已进行 {unfinished.turns} 轮</p>
              </div>
              <Icon name="right" size={16} className="text-muted" />
            </button>
          )}
          {dueReviews.length > 0 && (
            <button type="button" onClick={() => navigate('review')}
              className="card flex items-center gap-3 p-4 text-left transition hover:border-brand-300">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sun-100 text-[#a56a08]"><Icon name="cards" size={18} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{dueReviews.length} 张卡片到期</p>
                <p className="truncate text-xs text-muted">趁记忆还热，去复习页打个卡</p>
              </div>
              <Icon name="right" size={16} className="text-muted" />
            </button>
          )}
        </div>
      )}

      {/* 历史文本 */}
      <section>
        <SectionTitle title="最近读过的文本" subtitle="每次分析结果都已存档，随时可以重新开一场对话。" />
        {data.texts.length === 0 ? (
          <EmptyState emblem="📄" title="还没有分析过文本" desc="贴上第一段英文，三个 Agent 就会开始为你工作。" />
        ) : (
          <div className="space-y-2.5">
            {data.texts.slice(0, 5).map((t) => (
              <button key={t.id} type="button" onClick={() => navigate('analysis', { analysisId: t.id })}
                className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-lg">📖</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{t.topic}</p>
                  <p className="truncate text-xs text-muted">{t.scenarios.length} 个场景 · {t.keywords.length} 个重点词 · {t.cefr}</p>
                </div>
                <Icon name="right" size={16} className="text-muted" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 更多模块：四个学习模式的入口，收成 2×2 小网格沉到页面底部 */}
      <section>
        <SectionTitle title="更多模块" subtitle="四个学习模式并列，不新增底部导航项；资源库只从这里进。" />
        <div className="grid grid-cols-2 gap-2.5">
          {MODULE_TILES.map((m) => (
            <button key={m.id} type="button" onClick={() => navigate(m.view)}
              className="card flex min-w-0 flex-col items-start gap-1.5 p-3 text-left transition hover:border-brand-300">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${m.tint} text-base`}>{m.icon}</span>
              <span className="min-w-0">
                <span className="block text-[12px] font-bold leading-snug text-ink">{m.title}</span>
                <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600">{m.chip}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <button type="button" onClick={() => speak('Every sentence you try is a step forward.', data.settings)}
        className="mx-auto flex min-h-[44px] items-center gap-2 text-xs font-semibold text-brand-600 hover:underline">
        <Icon name="headphones" size={15} />试听一句今日鼓励（浏览器朗读）
      </button>

      {/* 今日目标弹窗：放在页面末尾，DOM 顺序在正文之后 */}
      <DailyGoalModal
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        onHide={() => { markGoalDismissed(); setGoalOpen(false) }}
        todayXp={data.profile.todayXp}
        dailyGoal={data.profile.dailyGoal}
        totalXp={data.profile.xp}
        streak={data.profile.streak}
        task={todayTask}
        levelLine={levelLine} />
    </div>
  )
}
