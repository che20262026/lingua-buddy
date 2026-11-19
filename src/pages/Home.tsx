import { useRef, useState } from 'react'
import { useApp, useDerived } from '../store/useAppStore'
import { analyzeText } from '../services/textAnalyzer'
import { SAMPLE_TEXT, SAMPLE_TEXTS } from '../data/mockData'
import { getIeltsLevel } from '../data/ieltsLevels'
import { speak } from '../lib/speech'
import { Card, Chip, EmptyState, Icon, Loader, ProgressRing, SectionTitle } from '../components/ui'
/** [CEFR 等级层] 每日计划的今日推荐读取 active 等级，不读 recommended */
import { recommendDailyTask } from '../services/dailyPlan'
import { SyncBanner } from '../components/SyncBanner'

const MIN_CHARS = 30

export function Home() {
  const { data, update, navigate, notify, draftText, setDraftText } = useApp()
  const { unfinished, dueReviews } = useDerived()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const chars = draftText.trim().length
  const level = getIeltsLevel(data.settings.ieltsLevel)
  /** [CEFR 等级层] 今日计划跟着用户当前选择走，而不是推荐等级 */
  const todayTask = recommendDailyTask(data.levelPreference)

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
      {/* [云同步] 未登录告警横幅：真机第一屏就能看见「数据只在本机」，点一下直接登录 */}
      <SyncBanner />

      {/* Hero */}
      <section className="animate-in overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-500 via-brand-600 to-[#5b46c9] p-6 text-white shadow-float sm:p-8">
        <Chip tone="slate" className="bg-white/20 text-white">✦ 原创角色扮演 · 本地运行</Chip>
        <h1 className="font-display mt-4 text-[26px] font-black leading-tight sm:text-3xl">
          把一段英文，<br />变成一场能开口的对话
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85">
          贴进任意英文文本，LinguaBuddy 会读出它的主题、词汇与语法，再为你搭好场景和角色。接下来，剩下的交给你说。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {['① 贴文本', '② 生成场景', '③ 开口对话', '④ 收报告与复习'].map((s) => (
            <span key={s} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold">{s}</span>
          ))}
        </div>
        <button type="button" onClick={() => navigate('settings')}
          className="mt-4 flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/25">
          {level.emblem} 当前目标 IELTS {level.band} · {level.name}（CEFR {level.cefr}）
          <Icon name="right" size={12} />
        </button>
      </section>

      {/* 续玩 / 待复习提示 */}
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

      {/* [新增] 文学长廊指路牌：与「文本分析 → 角色对话」并列，不替代 */}
      <button type="button" onClick={() => navigate('library')}
        className="card animate-in flex w-full items-center gap-3.5 p-4 text-left transition hover:border-brand-300">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mint-100 text-xl">📚</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-ink">经典英文文学研读</p>
            <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">NEW · 公版书单</Chip>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">按章节读原文、三视图切换、章末进入苏格拉底式文学研讨</p>
        </div>
        <Icon name="right" size={16} className="shrink-0 text-muted" />
      </button>

      {/* [新增] 文化长街指路牌：与文本分析、文学研读并列，不替代 */}
      <button type="button" onClick={() => navigate('cultureHub')}
        className="card animate-in flex w-full items-center gap-3.5 p-4 text-left transition hover:border-brand-300">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral-100 text-xl">🎬</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-ink">文化视角视频</p>
            <Chip tone="coral" className="!px-2 !py-0.5 !text-[10px]">NEW · 官方嵌入</Chip>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">看真实语速、读文化注释，看完进入独立的观后讨论</p>
        </div>
        <Icon name="right" size={16} className="shrink-0 text-muted" />
      </button>

      {/* [新增] 词场指路牌：第四个学习模式，与文本分析 / 文学 / 文化并列 */}
      <button type="button" onClick={() => navigate('wordLab')}
        className="card animate-in flex w-full items-center gap-3.5 p-4 text-left transition hover:border-brand-300">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sun-100 text-xl">🃏</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-ink">词场 · 主动词库学习</p>
            <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">NEW · 7 个词库</Chip>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">猜义 → 验证 → 拼写 → 结算，艾宾浩斯阶梯自动排程</p>
        </div>
        <Icon name="right" size={16} className="shrink-0 text-muted" />
      </button>

      {/* [新增] China Learner Track 指路牌：作为「学习」页下的入口卡，不新增底部导航项 */}
      <button type="button" onClick={() => navigate('chinaTrack')}
        className="card animate-in flex w-full items-center gap-3.5 p-4 text-left transition hover:border-brand-300">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mint-100 text-xl">🧭</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-ink">本土应试与真实能力桥接资源库</p>
            <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">NEW · 四个轨道</Chip>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            中文构思后硬翻 / 读不透原文逻辑 / 从没被要求开口 / 语法正确却不地道
          </p>
        </div>
        <Icon name="right" size={16} className="shrink-0 text-muted" />
      </button>

      {/* [新增] 大肥鱼自由对话指路牌：没有剧本的闲聊沙盒，同样不新增底部导航项 */}
      <button type="button" onClick={() => navigate('freeTalk')}
        data-testid="home-freetalk-entry"
        className="card animate-in flex w-full items-center gap-3.5 p-4 text-left transition hover:border-brand-300">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Icon name="fish" size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-ink">大肥鱼自由对话</p>
            <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">NEW · 6 条鱼</Chip>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            没有剧本，挑一条有脾气的胖鱼，用英 / 美 / 澳口音瞎聊
          </p>
        </div>
        <Icon name="right" size={16} className="shrink-0 text-muted" />
      </button>

      {/* 输入区 */}
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
        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
          无需 API Key · 分析与进度保存在本机浏览器 · 随时可在设置页清空
        </p>
      </Card>

      {/* 今日小目标 */}
      <Card className="flex items-center gap-5">
        <ProgressRing value={Math.min(1, data.profile.todayXp / Math.max(data.profile.dailyGoal, 1))}
          label={`${data.profile.todayXp}`} sub={`/ ${data.profile.dailyGoal} XP`} size={86} />
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-ink">今日目标 · 每天一点点就够</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">完成一轮对话 +8 XP，覆盖目标词另有奖励。连续学习 {data.profile.streak} 天啦。</p>
          <p data-testid="daily-plan-task" className="mt-1.5 rounded-xl bg-brand-50/70 px-2.5 py-1.5 text-[10px] leading-relaxed text-brand-700">
            今日推荐 · 按当前等级 {todayTask.level}：{todayTask.label}（{todayTask.module}）
          </p>
          <div className="mt-2 flex gap-2">
            <Chip tone="sun"><Icon name="flame" size={12} />{data.profile.streak} 天连续</Chip>
            <Chip tone="brand"><Icon name="star" size={12} />{data.profile.xp} 总 XP</Chip>
          </div>
        </div>
      </Card>

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

      <button type="button" onClick={() => speak('Every sentence you try is a step forward.', data.settings)}
        className="mx-auto flex items-center gap-2 text-xs font-semibold text-brand-600 hover:underline">
        <Icon name="headphones" size={15} />试听一句今日鼓励（浏览器朗读）
      </button>
    </div>
  )
}
