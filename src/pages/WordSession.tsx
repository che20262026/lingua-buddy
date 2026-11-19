import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { firstShard, DECK_META } from '../data/wordDecks'
import { fetchWordMedia, imageSrc } from '../services/wordMedia'
import { coachWordSession } from '../services/wordCoach'
import { buildChoices, compareSpelling, finishWordSession, maskTargetWord, type SpellingCell } from '../lib/wordLabFlow'
import { applyPronunciationResults } from '../services/pronunciation'
import { speak } from '../lib/speech'
import { Card, Chip, EmptyState, Icon, ProgressBar, SectionTitle } from '../components/ui'
import { HighlightSentence, WordReadAloud, pickReadAloudSentence } from '../components/WordReadAloud'
import { PronunciationLab } from '../components/PronunciationLab'
import { challengerFor } from '../data/wordDecks/pronunciationChallengers'
import type { PronunciationCompletion, StepRecord, WordEntry, WordMedia, WordSessionDraft } from '../wordLabTypes'
/** [成长系统] 所有新词 / 重拼 / 跟读标记都走统一发放入口 */
import { XP_RULES } from '../growthTypes'
import { todayKey } from '../lib/storage'

/**
 * 词场学习会话：五步状态机 S1 → S2 → S3 → S4（S0 限流在首页/选库页，S5 排程在结算写入）
 *
 * 设计约束：
 * - S1 必须提交猜测，全程没有「跳过」和「返回上一步」按钮
 * - S2 配图先无英文标注，点开后联动显示 imageAlt 与例句、释义
 * - [S2.5 新增] S2 后半段挂 WordReadAloud：跟读完整例句 → 完成后才出现「去拼写」
 * - S3 打字逐字母比对 / Canvas 手写自评；错词记易错本并强制重拼
 * - S3 书写阶段隐藏目标词：词形 / 音标 / 例句 / 搭配 / 配图文字全部遮蔽，只见释义与发音
 * - 草稿实时写入 lingua_word_session_draft，刷新可续学
 */

type LocalError = { word: string; type: 'guess' | 'spelling'; detail: string }

function blankRecord(spellingMode: 'typing' | 'handwriting'): StepRecord {
  return {
    word: '', guess: '', guessCorrect: null, guessMode: 'choice',
    verifiedKnown: null, spellingTries: 0, spellingPassed: false, spellingMode,
  }
}

export function WordSession() {
  const app = useApp()
  const draft = app.data.wordSessionDraft
  if (!draft) {
    return (
      <div className="animate-in">
        <EmptyState emblem="🃏" title="当前没有进行中的词场" desc="回词场首页挑一批新词，或者先去复习到期的词。"
          action={<button type="button" onClick={() => app.navigate('wordLab')} className="btn-primary">回词场首页</button>} />
      </div>
    )
  }
  return <SessionBody draft={draft} />
}

function SessionBody({ draft }: { draft: WordSessionDraft }) {
  const app = useApp()
  const { data } = app
  const meta = DECK_META[draft.deckId]
  const wordKey = draft.words[draft.index] ?? ''
  const entry: WordEntry | undefined = wordKey
    ? firstShard(draft.deckId).find((w) => w.word.toLowerCase() === wordKey)
    : undefined

  const [record, setRecord] = useState<StepRecord>(() => ({
    ...blankRecord(data.settings.wordSpellingMode), word: wordKey,
  }))
  const [guessMode, setGuessMode] = useState<'choice' | 'free'>('choice')
  const [choice, setChoice] = useState('')
  const [freeGuess, setFreeGuess] = useState('')
  const [showAnnotation, setShowAnnotation] = useState(false)
  const [spellInput, setSpellInput] = useState('')
  const [cells, setCells] = useState<SpellingCell[] | null>(null)
  const [media, setMedia] = useState<WordMedia | null>(null)
  const [errors, setErrors] = useState<LocalError[]>([])
  const [handwritingMode, setHandwritingMode] = useState<'typing' | 'handwriting'>(data.settings.wordSpellingMode)
  /** [AI 发音评测] 词卡上的发音练习面板是否展开；它是闭环之外的辅助面板，不参与状态机 */
  const [pronOpen, setPronOpen] = useState(false)
  /** [S2.5 新增] 整场各词的跟读结果，S4 结算时统一合并进进度与发音 flags */
  const [readAloudResults, setReadAloudResults] = useState<Record<string, PronunciationCompletion>>({})
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)

  /** 换词时重置本词的所有临时状态 */
  useEffect(() => {
    setRecord({ ...blankRecord(data.settings.wordSpellingMode), word: wordKey })
    setGuessMode('choice')
    setChoice('')
    setFreeGuess('')
    setShowAnnotation(false)
    setSpellInput('')
    setCells(null)
    setHandwritingMode(data.settings.wordSpellingMode)
    setPronOpen(false)
    if (entry && data.settings.wordAutoSpeak) {
      try { speak(entry.word, data.settings) } catch { /* 浏览器无语音能力时静默 */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordKey])

  /** WordMediaAgent：命中缓存直接返回，未命中生成 SVG/emoji 兜底并写回缓存 */
  useEffect(() => {
    if (!entry) return
    let alive = true
    fetchWordMedia(entry, data.wordMediaCache).then(({ media: m, cache }) => {
      if (!alive) return
      setMedia(m)
      const key = entry.word.toLowerCase()
      if (!data.wordMediaCache[key]) {
        app.update((prev) => prev.wordMediaCache[key] ? prev : ({ ...prev, wordMediaCache: cache }))
      }
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.word])

  /** Canvas 手写：鼠标/指针绘制（jsdom 无 canvas context 时自动降级为自评） */
  useEffect(() => {
    if (draft.step !== 'spell' || handwritingMode !== 'handwriting') return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext?.('2d')
    if (!canvas || !ctx) return
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#4f46e5'
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const down = (e: PointerEvent) => { drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
    const move = (e: PointerEvent) => {
      if (!drawing.current) return
      const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke()
    }
    const up = () => { drawing.current = false }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
    }
  }, [draft.step, handwritingMode, wordKey])

  const choices = entry ? buildChoices(entry, draft.deckId) : []

  /** 提交草稿：把当前词的记录写回，并推进到下一步 / 下一个词 */
  const commit = (next: StepRecord, nextStep: 'guess' | 'verify' | 'spell' | 'summary', nextIndex = draft.index) => {
    const records = [...draft.records]
    records[draft.index] = next
    app.update((prev) => ({
      ...prev,
      wordSessionDraft: { ...draft, index: nextIndex, step: nextStep, records },
    }))
    setRecord(next)
  }

  const advance = (next: StepRecord) => {
    const nextIndex = draft.index + 1
    if (nextIndex >= draft.words.length) commit(next, 'summary', draft.index)
    else commit(next, 'guess', nextIndex)
  }

  /* ---------------- S1 猜义（强制提交，无跳过） ---------------- */
  const submitGuess = () => {
    if (!entry) return
    const guess = guessMode === 'choice' ? choice.trim() : freeGuess.trim()
    if (!guess) return
    const correct = guessMode === 'choice' ? guess === entry.meaningZh : null
    if (correct === false) {
      setErrors((prev) => [...prev, { word: entry.word, type: 'guess', detail: guess }])
    }
    const next: StepRecord = {
      ...record, word: entry.word.toLowerCase(), guess,
      guessCorrect: correct, guessMode,
    }
    commit(next, 'verify')
  }

  /* ---------------- S2 → S2.5 → S3 ---------------- */
  /**
   * [S2.5 修改点] 原 submitVerify(known) 直接 commit 到 'spell'；
   * 现在改由跟读组件的 onContinue 触发：先收下本词跟读结果，再进入 S3。
   * S1 / S3 / S4 / S5 的逻辑一字未动。
   */
  const handleReadAloudDone = (completion: PronunciationCompletion) => {
    setReadAloudResults((prev) => ({ ...prev, [completion.word]: completion }))
    commit({ ...record }, 'spell')
  }

  /* ---------------- S3 拼写 ---------------- */
  const submitSpelling = () => {
    if (!entry || !spellInput.trim()) return
    const result = compareSpelling(entry.word, spellInput)
    const tries = record.spellingTries + 1
    if (result.correct) {
      advance({ ...record, spellingTries: tries, spellingPassed: true, spellingMode: handwritingMode })
    } else {
      setCells(result.cells)
      setErrors((prev) => [...prev, { word: entry.word, type: 'spelling', detail: spellInput.trim() }])
      setRecord((r) => ({ ...r, spellingTries: tries, spellingMode: handwritingMode }))
      app.update((prev) => ({
        ...prev,
        wordSessionDraft: {
          ...draft,
          records: draft.records.map((r, i) => i === draft.index
            ? { ...r, spellingTries: tries, spellingPassed: false, spellingMode: handwritingMode } : r),
        },
      }))
    }
  }

  const retrySpelling = () => {
    setSpellInput('')
    setCells(null)
    if (canvasRef.current?.getContext?.('2d')) {
      const c = canvasRef.current
      const ctx = c.getContext('2d')
      ctx?.clearRect(0, 0, c.width, c.height)
    }
  }

  /* ---------------- S4 结算 + S5 排程 ---------------- */
  const coaching = coachWordSession(draft.records.filter(Boolean), data.wordProgress)
  /** [成长系统] S4 结算页展示本次 XP 明细与每日新词上限提示 */
  const quotaToday = data.wordDailyQuota.date === todayKey()
  const learnedToday = quotaToday ? data.wordDailyQuota.newWordsLearned : 0
  const wordLimit = quotaToday ? data.wordDailyQuota.limit : data.settings.wordDailyLimit
  const retryCount = draft.records.filter(Boolean)
    .filter((r) => r.spellingPassed && r.spellingTries >= 2).length
  const estimatedXp = draft.words.length * XP_RULES.word_complete + retryCount * XP_RULES.spelling_retry
  const finish = () => {
    const { next } = finishWordSession(data, draft, errors)
    /** [S2.5 修改点] 只多这一行：结算后合并跟读结果，不触碰额度 / 拼写易错本 */
    app.update(() => applyPronunciationResults(next, readAloudResults))
    const today = todayKey()
    const hour = new Date().getHours()
    let gained = 0

    /** [成长系统] 1. 完整走完五步的词，按「日期 + 词」幂等发 10 XP；达到每日上限由服务侧拦下 */
    for (const word of draft.words) {
      const r = app.awardXp({
        id: `wordlab:${today}:word:${word.toLowerCase()}`,
        source: 'wordlab', action: 'word_complete', amount: XP_RULES.word_complete,
        meta: {
          dailyWordLimit: data.settings.wordDailyLimit, deckId: draft.deckId,
          flags: { earlyBird: hour >= 5 && hour < 7 },
        },
      })
      if (r.granted) gained += r.amount
    }

    /** [成长系统] 2. 拼错后重拼正确 +2，每词每会话上限 +2（服务按 sessionKey 聚合） */
    for (const rec of draft.records.filter(Boolean)) {
      if (!rec.spellingPassed || rec.spellingTries < 2) continue
      const r = app.awardXp({
        id: `wordlab:${today}:${draft.startedAt}:${rec.word}:spelling_retry`,
        source: 'wordlab', action: 'spelling_retry', amount: XP_RULES.spelling_retry,
        meta: { sessionKey: `${draft.startedAt}:${rec.word}` },
      })
      if (r.granted) gained += r.amount
    }

    /** [成长系统] 3. 跟读只做 0 XP 标记事件（跳过不发），供成就事件驱动判定 */
    for (const [word, done] of Object.entries(readAloudResults)) {
      if (done.skipped) continue
      app.awardXp({
        id: `wordlab:${today}:${draft.startedAt}:${word}:read_aloud`,
        source: 'wordlab', action: 'read_aloud_complete', amount: 0, meta: { internal: true },
      })
      if (done.lastResult && done.lastResult.mode !== 'selfReported' && done.missedWords.length === 0) {
        app.awardXp({
          id: `wordlab:${today}:${draft.startedAt}:${word}:read_aloud_full`,
          source: 'wordlab', action: 'read_aloud_full', amount: 0, meta: { internal: true },
        })
      }
    }

    /** [成长系统] 3.1 之前连续跳过 ≥3 次跟读、本场又完整读出来 → 隐藏成就标记（0 XP） */
    const skippedBefore = Object.values(data.wordProgress.words).filter((p) => p.pronunciationSkipped).length
    const readThisTime = Object.values(readAloudResults).some((c) => !c.skipped)
    if (readThisTime && skippedBefore >= 3) {
      app.awardXp({
        id: `wordlab:${today}:read_aloud_comeback`,
        source: 'wordlab', action: 'read_aloud_comeback', amount: 0, meta: { internal: true },
      })
    }

    /** [成长系统] 4. 词库里程碑：每库每 10 词记一次（0 XP），供广度成就判定 */
    const deckCount = Object.values(next.wordProgress.words).filter((p) => p.deckId === draft.deckId).length
    if (deckCount >= 10) {
      app.awardXp({
        id: `wordlab:deck:${draft.deckId}:milestone:${Math.floor(deckCount / 10)}`,
        source: 'wordlab', action: 'deck_milestone', amount: 0, meta: { internal: true },
      })
    }

    app.notify(gained > 0
      ? `结算完成，+${gained} XP，${draft.words.length} 个新词已排入艾宾浩斯阶梯`
      : `结算完成，今日新词 XP 已达上限（复习仍有 XP），${draft.words.length} 个词已排入复习阶梯`)
    app.navigate('wordLab')
  }

  /* ==================== 渲染 ==================== */

  if (draft.step === 'summary' || draft.index >= draft.words.length) {
    return (
      <div className="animate-in space-y-5">
        <section className="rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-brand-50/70 to-sun-100/60 p-5 shadow-card">
          <p className="text-[10px] font-black tracking-[0.16em] text-brand-600">S4 · 本场结算</p>
          <h2 className="mt-1 font-display text-2xl font-black text-ink">这一批新词，已经出发了 🎒</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {meta.name} · 共 {coaching.stats.total} 词 · 猜义命中 {coaching.stats.guessedRight} · 拼写通过 {coaching.stats.spelledRight}
          </p>
        </section>

        <Card>
          <SectionTitle title="WordCoach 教练说" subtitle="两句话，不多说。" right={<Chip tone="mint">+{draft.words.length * 10} XP</Chip>} />
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-mint-100/60 p-4">
            <p className="text-xs font-bold leading-relaxed text-ink">{coaching.encourage}</p>
            <p className="mt-2 text-xs leading-relaxed text-brand-700">{coaching.suggestion}</p>
          </div>
          {coaching.stats.errorWords.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-muted">易错本收录：</span>
              {coaching.stats.errorWords.map((w) => <Chip key={w} tone="coral">{w}</Chip>)}
            </div>
          )}
        </Card>

        <Card testId="wordlab-xp-breakdown">
          <SectionTitle title="本次 XP 明细" subtitle="XP 只奖励完整走完五步的词，不按点击次数发放。"
            right={<Chip tone="mint">预计 +{estimatedXp} XP</Chip>} />
          <div className="space-y-2">
            {[
              [`新词完成 ${draft.words.length} × ${XP_RULES.word_complete}`, `${draft.words.length * XP_RULES.word_complete} XP`],
              [`拼错后重拼正确 ${retryCount} × ${XP_RULES.spelling_retry}`, `${retryCount * XP_RULES.spelling_retry} XP`],
              ['跟读朗读 / 跳过跟读', '0 XP'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2">
                <p className="text-[11px] font-semibold text-ink/80">{label}</p>
                <span className="text-[11px] font-black text-brand-600">{value}</span>
              </div>
            ))}
          </div>
          {learnedToday >= wordLimit ? (
            <p className="mt-3 rounded-2xl bg-sun-100/70 px-3 py-2.5 text-[11px] font-bold leading-relaxed text-[#8a5b08]">
              今日新词已达标，继续学习不再发放新词 XP，复习仍可获得 XP。
            </p>
          ) : (
            <p className="mt-3 text-[10px] leading-relaxed text-muted">
              今日还可获得 {Math.max(0, wordLimit - learnedToday)} 个新词 XP；达到上限后不再发放新词 XP，复习批次仍按 15 XP 发放（每日 3 次）。
            </p>
          )}
        </Card>

        <Card>
          <SectionTitle title="S5 · 算法已接管排程" subtitle="之后不需要你手动决定何时复习。" />
          <div className="space-y-2">
            {[
              ['10 分钟', '第 1 次阶梯复习'],
              ['1 / 3 / 7 天', '第 2-4 次阶梯复习'],
              ['15 / 30 天', '第 5-6 次阶梯复习'],
              ['毕业之后', '并入既有 SM-2 队列（0→1→2→4→7→15→30 天）'],
            ].map(([when, what]) => (
              <div key={when} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5">
                <Chip tone="brand">{when}</Chip>
                <p className="text-[11px] leading-relaxed text-ink/80">{what}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted">
            答错只回退一级、不清零；阅读与观后加入的生词同样进入这条阶梯，但不占今日新词额度。
          </p>
        </Card>

        <button type="button" onClick={finish} className="btn-primary w-full !py-3">
          <Icon name="check" size={16} />完成并排程
        </button>
      </div>
    )
  }

  if (!entry) {
    return (
      <EmptyState emblem="🧭" title="词条加载失败" desc="当前词不在分片里，回词场首页重新起一场。"
        action={<button type="button" onClick={() => app.navigate('wordLab')} className="btn-primary">回词场首页</button>} />
    )
  }

  const stepNo = draft.step === 'guess' ? 'S1' : draft.step === 'verify' ? 'S2' : 'S3'
  const stepName = draft.step === 'guess' ? '猜义' : draft.step === 'verify' ? '验证' : '拼写'
  const pct = (draft.index + (draft.step === 'guess' ? 0.1 : draft.step === 'verify' ? 0.45 : 0.75)) / draft.words.length

  return (
    <div className="wl-stage animate-in">
      {/* 进度条：没有返回上一步按钮 —— 融入渐层的轻量毛玻璃条 */}
      <div className="wl-glass mx-auto max-w-[600px] rounded-2xl p-3.5">
        <div className="flex items-center justify-between gap-2">
          <Chip tone="brand">{stepNo} · {stepName}</Chip>
          <span className="text-[11px] font-bold text-brand-600">
            {draft.index + 1} / {draft.words.length} · {meta.emblem} {meta.name}
          </span>
        </div>
        <ProgressBar value={pct} className="mt-2.5 !bg-brand-100/70" />
      </div>

      {/* S1/S2 词卡显示单词；S3 书写阶段换成「回忆提示卡」——不出现任何词形 */}
      {draft.step === 'spell' ? (
        <div className="wl-glass mx-auto mt-5 max-w-[600px] rounded-[28px] px-5 py-7">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black tracking-[0.16em] text-brand-600">只给提示，不显示单词</p>
              <p className="mt-2 font-display text-2xl font-black leading-snug text-ink">
                {maskTargetWord(entry.meaningZh, entry.word)}
              </p>
              <p className="en-text mt-2 text-sm italic leading-relaxed text-muted">
                {maskTargetWord(entry.meaningEn, entry.word)}
              </p>
            </div>
            <button type="button" onClick={() => { try { speak(entry.word, data.settings) } catch { /* noop */ } }}
              aria-label="听发音提示" className="rounded-xl bg-brand-50 p-2.5 text-brand-600 hover:bg-brand-100">
              <Icon name="speaker" size={20} />
            </button>
          </div>
          {data.settings.wordShowImage && media && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/80 bg-white/60">
              <img src={imageSrc(entry, media, true)} alt={maskTargetWord(entry.imageAlt, entry.word)}
                className="h-28 w-full object-contain" />
            </div>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-muted">
            书写时已隐藏词形、音标、例句与搭配；只靠释义、配图和发音回忆，写完才判分。
          </p>
        </div>
      ) : (
        <div className="mx-auto mt-5 max-w-[600px] py-6 text-center">
          <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
            <p className="en-text wl-word font-black text-ink">{entry.word}</p>
            {/* [AI 发音评测] 命中易错词库时优先标记，引导用户去练发音 */}
            {challengerFor(entry.word) && <Chip tone="coral">易错词</Chip>}
          </div>
          <p className="mt-3 text-xs font-medium tracking-wide text-muted">{entry.phonetic} · {entry.pos} · CEFR {entry.cefr}</p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button type="button" onClick={() => { try { speak(entry.word, data.settings) } catch { /* noop */ } }}
              aria-label="朗读单词" className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-brand-50 px-4 text-sm font-bold text-brand-600 transition hover:bg-brand-100">
              <Icon name="speaker" size={18} />朗读
            </button>
            {/* [AI 发音评测] 展开发音练习面板：闭环之外的辅助功能，不推进 S1→S5 */}
            <button type="button" onClick={() => setPronOpen((v) => !v)}
              aria-expanded={pronOpen}
              aria-label="发音练习"
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 text-sm font-bold transition ${
                pronOpen ? 'bg-brand-500 text-white' : 'bg-white/70 text-brand-600 hover:bg-white'}`}>
              <Icon name="mic" size={15} />发音练习
            </button>
          </div>
          {pronOpen && (
            <div className="wl-glass mx-auto mt-5 max-w-[520px] rounded-2xl p-4 text-left">
              <PronunciationLab entry={entry} defaultAccent={data.settings.accent} />
            </div>
          )}
        </div>
      )}

      {/* S1 猜义：4 选 1 或自由输入；必须提交 */}
      {draft.step === 'guess' && (
        <div className="wl-glass mx-auto mt-4 max-w-[600px] rounded-[28px] p-5">
          <SectionTitle title="先自己猜一次" subtitle="猜错也没关系——猜过之后再揭晓，记得更牢。没有跳过按钮。" />
          <div className="mb-3 flex gap-1.5">
            <button type="button" onClick={() => setGuessMode('choice')}
              className={`min-h-[44px] flex-1 rounded-xl px-2 text-xs font-bold transition ${guessMode === 'choice' ? 'bg-brand-500 text-white shadow-sm' : 'bg-white/70 text-muted'}`}>
              4 选 1
            </button>
            <button type="button" onClick={() => setGuessMode('free')}
              className={`min-h-[44px] flex-1 rounded-xl px-2 text-xs font-bold transition ${guessMode === 'free' ? 'bg-brand-500 text-white shadow-sm' : 'bg-white/70 text-muted'}`}>
              自己写中文意思
            </button>
          </div>
          {guessMode === 'choice' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {choices.map((c) => (
                <button key={c} type="button" onClick={() => setChoice(c)}
                  className={`wl-choice min-h-[52px] rounded-2xl border p-3 text-left text-xs font-bold transition ${choice === c ? 'border-brand-400 bg-brand-50 text-brand-700 shadow-sm' : 'border-white/90 bg-white/80 text-ink hover:border-brand-200'}`}>
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <input className="field !bg-white/85" value={freeGuess} onChange={(e) => setFreeGuess(e.target.value)}
              placeholder="写下你猜的中文意思（≤20 字也行）" />
          )}
          <button type="button" onClick={submitGuess}
            disabled={guessMode === 'choice' ? !choice : !freeGuess.trim()}
            className="btn-primary mt-4 w-full !py-3 disabled:opacity-40">
            提交猜测<Icon name="right" size={15} />
          </button>
          <p className="mt-2 text-[10px] leading-relaxed text-muted">提交后才进入验证环节，本场不能返回上一步。</p>
        </div>
      )}

      {/* S2 验证：配图（先无标注）→ 英文标注 + 例句 + 释义 */}
      {draft.step === 'verify' && (
        <div className="wl-glass mx-auto mt-4 max-w-[600px] rounded-[28px] p-5">
          <SectionTitle title="来验证一下" subtitle="先看图，再点开英文标注，最后对照释义与例句。"
            right={<Chip tone={record.guessCorrect === true ? 'mint' : record.guessCorrect === false ? 'coral' : 'slate'}>
              {record.guessCorrect === true ? '猜对了' : record.guessCorrect === false ? '猜错了' : '自由猜测'}
            </Chip>} />
          {data.settings.wordShowImage && media && (
            <div className="overflow-hidden rounded-2xl border border-white/90 bg-white/70">
              <img src={imageSrc(entry, media)} alt={entry.imageAlt} className="h-44 w-full object-contain" />
              {showAnnotation && (
                <p className="en-text border-t border-brand-50 px-3 py-2 text-[11px] italic leading-relaxed text-muted">
                  {entry.imageAlt}
                </p>
              )}
            </div>
          )}
          {data.settings.wordShowImage && (
            <button type="button" onClick={() => setShowAnnotation(true)} disabled={showAnnotation}
              className="btn-ghost mt-2.5 w-full !py-2.5 !text-[11px] disabled:opacity-50">
              {showAnnotation ? '英文标注已显示' : '显示图片英文标注'}
            </button>
          )}

          <div className="mt-4 rounded-2xl bg-white/80 p-4">
            <p className="text-[10px] font-black tracking-widest text-brand-600">揭晓释义</p>
            <p className="mt-1 font-display text-xl font-black text-ink">{entry.meaningZh}</p>
            <p className="en-text mt-1 text-xs italic leading-relaxed text-muted">{entry.meaningEn}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.collocations.map((c) => <Chip key={c} tone="mint">{c}</Chip>)}
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            {entry.examples.map((ex) => (
              <p key={ex} className="en-text rounded-xl bg-white/70 px-3 py-2 text-xs italic leading-relaxed text-ink/80">
                <HighlightSentence sentence={ex} target={entry.word} />
              </p>
            ))}
          </div>
          {record.guess && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted">你刚才的猜测：{record.guess}</p>
          )}
          {/* [S2.5 修改点] 自评按钮只记录「熟不熟」，不再直接跳 S3；跟读完成后由下方组件放行 */}
          <div className="mt-4 flex gap-2 border-t border-white/70 pt-4">
            <button type="button" onClick={() => setRecord((r) => ({ ...r, verifiedKnown: false }))}
              className={`${record.verifiedKnown === false ? 'btn-primary' : 'btn-ghost'} min-h-[48px] flex-1 !py-2 !text-xs`}>还不熟</button>
            <button type="button" onClick={() => setRecord((r) => ({ ...r, verifiedKnown: true }))}
              className={`${record.verifiedKnown === true ? 'btn-primary' : 'btn-ghost'} min-h-[48px] flex-1 !py-2 !text-xs`}>我认识</button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            先标记一下熟不熟，再往下跟读这句；跟读完成后会出现「去拼写」。
          </p>
        </div>
      )}

      {/* [S2.5 新增] 跟读区域留在 S2 页面下方，不跳转新页面，图—句—音同屏连贯 */}
      {draft.step === 'verify' && (
        <WordReadAloud key={wordKey} entry={entry} sentence={pickReadAloudSentence(entry)}
          settings={data.settings} onContinue={handleReadAloudDone} />
      )}

      {/* S3 拼写：打字逐字母比对 / Canvas 手写自评 */}
      {draft.step === 'spell' && (
        <div className="wl-glass mx-auto mt-4 max-w-[600px] rounded-[28px] p-5">
          <SectionTitle title="把单词拼出来" subtitle="书写时不显示单词，凭释义与发音回忆；拼错记进易错本并强制重拼一次。"
            right={<Chip tone="slate">已试 {record.spellingTries} 次</Chip>} />
          <div className="mb-3 flex gap-1.5">
            <button type="button" onClick={() => setHandwritingMode('typing')}
              className={`min-h-[44px] flex-1 rounded-xl px-2 text-xs font-bold transition ${handwritingMode === 'typing' ? 'bg-brand-500 text-white shadow-sm' : 'bg-white/70 text-muted'}`}>打字拼写</button>
            <button type="button" onClick={() => setHandwritingMode('handwriting')}
              className={`min-h-[44px] flex-1 rounded-xl px-2 text-xs font-bold transition ${handwritingMode === 'handwriting' ? 'bg-brand-500 text-white shadow-sm' : 'bg-white/70 text-muted'}`}>手写自评</button>
          </div>

          {handwritingMode === 'typing' ? (
            <>
              <input className="field en-text !bg-white/90 !py-4 !text-base" value={spellInput} autoComplete="off" spellCheck={false}
                onChange={(e) => setSpellInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitSpelling() }}
                placeholder="不提示字母数，凭记忆拼写" />
              {cells && (
                <div className="mt-3 rounded-2xl bg-white/80 p-3">
                  <p className="text-[10px] font-bold text-muted">逐字母比对（绿色正确 / 红色需修改）</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {cells.map((c, i) => (
                      <span key={i} className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 font-mono text-sm font-bold ${c.ok ? 'bg-mint-100 text-emerald-700' : 'bg-coral-100 text-coral-700'}`}>
                        {c.ch}
                      </span>
                    ))}
                  </div>
                  <button type="button" onClick={retrySpelling} className="btn-ghost mt-3 w-full !py-2.5 !text-xs">
                    <Icon name="refresh" size={14} />重拼一次
                  </button>
                </div>
              )}
              <button type="button" onClick={submitSpelling} disabled={!spellInput.trim() || !!cells}
                className="btn-primary mt-4 w-full !py-3 disabled:opacity-40">
                提交拼写<Icon name="right" size={15} />
              </button>
            </>
          ) : (
            <>
              <canvas ref={canvasRef} width={600} height={180}
                className="w-full touch-none rounded-2xl border border-brand-100 bg-white/90" />
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                用鼠标或手指在上方凭记忆写出刚才那个词，再按自己的判断自评；手写不做 OCR，完全离线，书写过程中不会显示词形。
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => {
                  setErrors((prev) => [...prev, { word: entry.word, type: 'spelling', detail: '手写自评：再试一次' }])
                  setRecord((r) => ({ ...r, spellingTries: r.spellingTries + 1 }))
                  retrySpelling()
                }} className="btn-ghost min-h-[48px] flex-1 !py-2 !text-xs">再试一次</button>
                <button type="button" onClick={() => advance({
                  ...record, spellingTries: record.spellingTries + 1,
                  spellingPassed: true, spellingMode: 'handwriting',
                })} className="btn-primary min-h-[48px] flex-1 !py-2 !text-xs">我拼对了<Icon name="check" size={14} /></button>
              </div>
            </>
          )}
          <button type="button" onClick={() => { try { speak(entry.word, data.settings) } catch { /* noop */ } }}
            className="btn-ghost mt-3 w-full !py-2.5 !text-[11px]">
            <Icon name="speaker" size={14} />听发音提示（不显示拼写）
          </button>
        </div>
      )}
    </div>
  )
}
