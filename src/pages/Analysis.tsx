import { useApp } from '../store/useAppStore'
import { speak } from '../lib/speech'
import { Card, Chip, EmptyState, Icon, SectionTitle } from '../components/ui'
/** [CEFR 等级层] 对话模块共用同一套等级面板与内容池 */
import { LevelPanel } from '../components/LevelPanel'
import { LevelContentList } from '../components/LevelContentList'

export function Analysis() {
  const { data, params, navigate, setDraftText } = useApp()
  const analysis = data.texts.find((t) => t.id === params.analysisId) || data.texts[0]

  if (!analysis) {
    return (
      <div className="space-y-4">
        <EmptyState emblem="🔍" title="还没有可展示的分析" desc="先回首页贴一段英文文本吧。" />
        <button type="button" onClick={() => navigate('home')} className="btn-primary w-full">回到首页</button>
      </div>
    )
  }

  return (
    <div className="animate-in space-y-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('home')} className="btn-ghost !px-3 !py-2 !text-xs"><Icon name="left" size={15} />换一段文本</button>
        <Chip tone="slate">分析于 {new Date(analysis.createdAt).toLocaleDateString('zh-CN')}</Chip>
      </div>

      {/* [CEFR 等级层] 内容列表页顶部：等级是过滤器，不是门槛 */}
      <LevelPanel module="dialogue" />

      {/* 概览 */}
      <section className="overflow-hidden rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-brand-50/70 to-mint-100/60 p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="brand"><Icon name="target" size={12} />文本主题</Chip>
          <Chip tone="sun">CEFR {analysis.cefr}</Chip>
          <Chip tone="mint">{analysis.scenarios.length} 个可玩场景</Chip>
        </div>
        <h1 className="font-display mt-3 text-2xl font-black text-ink">{analysis.topic}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/80">{analysis.summary}</p>
        <details className="mt-4 rounded-2xl bg-white/70 p-3">
          <summary className="flex items-center justify-between text-xs font-bold text-brand-600">
            查看原文 · {analysis.sourceText.length} 字符<Icon name="down" size={14} />
          </summary>
          <p className="en-text mt-3 text-sm leading-relaxed text-ink/75">{analysis.sourceText}</p>
          <button type="button" onClick={() => speak(analysis.sourceText, data.settings)}
            className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand-600">
            <Icon name="speaker" size={14} />朗读原文
          </button>
        </details>
      </section>

      {/* 雅思适配度 */}
      {analysis.ieltsFit && (
        <section className="animate-in rounded-[24px] border border-brand-100 bg-gradient-to-br from-white to-brand-50/70 p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-xl">🎯</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-sm font-black text-ink">雅思口语适配度</p>
                <Chip tone="coral">素材 Band {analysis.ieltsFit.band}</Chip>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink/75">{analysis.ieltsFit.note}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {analysis.ieltsFit.focus.map((f) => <Chip key={f} tone="mint">{f}</Chip>)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 重点词汇 */}
      <section>
        <SectionTitle title="重点词汇" subtitle="点小喇叭听发音；这些词会出现在后面的对话目标里。" right={<Chip tone="brand">{analysis.keywords.length} 个</Chip>} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {analysis.keywords.map((k) => (
            <div key={k.word} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="en-text font-display text-lg font-bold text-ink">{k.word}</p>
                  <p className="mt-0.5 text-xs font-semibold text-brand-600">{k.meaning}</p>
                </div>
                <button type="button" onClick={() => speak(k.example, data.settings)} title="朗读例句" aria-label={`朗读 ${k.word} 例句`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100">
                  <Icon name="speaker" size={15} />
                </button>
              </div>
              <p className="en-text mt-2.5 border-t border-brand-50 pt-2 text-xs leading-relaxed text-muted">{k.example}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 短语 */}
      <section>
        <SectionTitle title="实用短语" subtitle="把整块表达搬进对话，比单个单词更省力。" />
        <div className="space-y-2">
          {analysis.phrases.map((p) => (
            <div key={p.phrase} className="card flex items-start gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-600"><Icon name="text" size={17} /></div>
              <div className="min-w-0 flex-1">
                <p className="en-text text-sm font-bold text-ink">{p.phrase}</p>
                <p className="mt-0.5 text-xs text-brand-600">{p.meaning}</p>
                <p className="en-text mt-1.5 text-xs italic leading-relaxed text-muted">{p.example}</p>
              </div>
              <button type="button" onClick={() => speak(p.example, data.settings)} aria-label="朗读短语例句" className="text-brand-500 hover:text-brand-700"><Icon name="speaker" size={16} /></button>
            </div>
          ))}
        </div>
      </section>

      {/* 语法点 */}
      <section>
        <SectionTitle title="语法观察" subtitle="只挑原文里真正出现过的，轻轻提醒，不背规则。" />
        <div className="space-y-2">
          {analysis.grammar.map((g) => (
            <details key={g.point} className="card !p-0">
              <summary className="flex items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-ink">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-coral-400" />{g.point}</span>
                <Icon name="down" size={15} className="text-muted" />
              </summary>
              <p className="border-t border-brand-50 px-5 pb-4 pt-3 text-xs leading-relaxed text-muted">{g.explanation}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 场景 */}
      <section>
        <SectionTitle title="从这里开始对话" subtitle="每个场景都基于原文生成，目标、角色和目标词都可以再编辑。" />
        <div className="space-y-3">
          {analysis.scenarios.map((s, idx) => (
            <button key={s.id} type="button" onClick={() => navigate('scenario', { analysisId: analysis.id, scenarioId: s.id })}
              className={`card animate-in flex w-full items-center gap-4 bg-gradient-to-br ${s.tint} p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft`}
              style={{ animationDelay: `${idx * 60}ms` }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-2xl shadow-card">{s.emblem}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display text-base font-bold text-ink">{s.title}</p>
                  <Chip tone="slate" className="!bg-white/70">{s.characters.length} 角色</Chip>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink/70">{s.goal}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.targetWords.slice(0, 4).map((w) => (
                    <span key={w} className="en-text rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-brand-600">{w}</span>
                  ))}
                </div>
              </div>
              <Icon name="right" size={18} className="shrink-0 text-ink/40" />
            </button>
          ))}
        </div>
      </section>

      {/* [CEFR 等级层] 分级对话内容池：只经 LevelFilterService 取内容 */}
      <LevelContentList module="dialogue" />

      <button type="button" onClick={() => { setDraftText(analysis.sourceText); navigate('home') }}
        className="btn-ghost w-full"><Icon name="refresh" size={16} />用这段文本重新生成</button>
    </div>
  )
}
