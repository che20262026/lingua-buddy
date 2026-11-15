import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { uid } from '../lib/utils'
import { speak, stopSpeaking } from '../lib/speech'
import { SRS_INTERVALS } from '../services/coach'
import { analyzeChapter, mockAnalyzeChapter } from '../services/literaryAnalyzer'
import {
  chapterBriefFor, chapterText, findParagraphForQuote, getChapter,
  seminarCards,
} from '../services/literaryCurator'
import {
  buildSeminarReport, generateSeminar, hasTextEvidence, mockSeminarTurn,
  seminarOpeningLine, userMessage,
} from '../services/seminarDirector'
import type {
  ChapterAnalysis, GuidanceStrength, SeminarInput, SeminarMessage,
  SeminarRole, SeminarSession, SeminarState,
} from '../literaryTypes'
import type { Mistake, ReviewItem } from '../types'
import { ChatBubble, SeminarFeedbackCard } from '../components/FeedbackCard'
import {
  CharacterCards, LiteraryLoader, LiterarySection, LoadError,
  QuestionCards, ThemeCards,
} from '../components/LiteraryBits'
import { Card, Chip, EmptyState, Icon, IconButton, Modal, ProgressBar, SectionTitle, Toggle } from '../components/ui'
/** [成长系统] 完成研讨 / 有效轮次统一发放 */
import { XP_RULES } from '../growthTypes'

const ROLE_LABEL: Record<SeminarRole, string> = { guide: '研讨引导者', peer: '学习同伴' }
const GUIDANCE_LABEL: Record<GuidanceStrength, string> = {
  light: '轻轻提点', medium: '恰到好处', strong: '步步追问',
}

export function Seminar() {
  const { data, params, navigate, update, notify, awardXp } = useApp()
  const found = getChapter(data.library, params.bookId, params.chapterId)
  const book = found?.book
  const chapter = found?.chapter

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [analysis, setAnalysis] = useState<ChapterAnalysis | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [loadNonce, setLoadNonce] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(params.seminarId || null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [ending, setEnding] = useState(false)
  const [showTranslation, setShowTranslation] = useState(data.settings.showTranslation)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const createdRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  /** 单章分析 + 研讨会话初始化；全程只接触当前章节 */
  useEffect(() => {
    if (!book || !chapter) return
    let alive = true
    setStatus('loading')
    void (async () => {
      let result: ChapterAnalysis
      try {
        result = await analyzeChapter({ chapter, book, targetDifficulty: data.settings.difficulty })
      } catch (err) {
        console.warn('[LinguaBuddy] 研讨章节分析回退本地 Mock：', err)
        result = mockAnalyzeChapter({ chapter, book, targetDifficulty: data.settings.difficulty })
      }
      if (!alive) return
      if (!result?.chapterId) { setErrorMsg('章节分析结果为空'); setStatus('error'); return }
      setAnalysis(result)
      if (!createdRef.current) {
        createdRef.current = true
        const existing = sessionId
          ? data.seminars.find((s) => s.id === sessionId)
          : data.seminars.find((s) => s.bookId === book.id && s.chapterId === chapter.id && !s.finishedAt)
        if (existing) {
          setSessionId(existing.id)
        } else {
          const cards = seminarCards(result)
          const opening = seminarOpeningLine({
            chapterTitle: chapter.title,
            chapterBrief: chapterBriefFor(data.library, book, chapter.id),
            discussionQuestions: result.discussionQuestions,
            role: 'guide', themes: cards.themes,
          })
          const session: SeminarSession = {
            id: uid('sem'), bookId: book.id, chapterId: chapter.id,
            chapterTitle: chapter.title, bookTitle: book.title,
            role: 'guide', guidance: data.settings.seminarGuidance,
            messages: [{
              id: uid('msg'), role: 'ai', speaker: ROLE_LABEL.guide, text: opening,
              translation: `研讨引导者先交代前情与本章主题，再抛出第一个开放问题；不扮演小说角色，也不给标准答案。`,
              at: Date.now(),
            }],
            turns: 0, coveredQuotes: [], mistakes: [], createdAt: Date.now(),
          }
          update((prev) => ({ ...prev, seminars: [session, ...prev.seminars] }))
          setSessionId(session.id)
        }
      }
      setStatus('ready')
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.bookId, params.chapterId, loadNonce])

  useEffect(() => { bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }) }, [sending, sessionId])
  useEffect(() => () => { try { stopSpeaking() } catch { /* 忽略 */ } }, [])

  if (!book || !chapter) {
    return (
      <div className="space-y-4">
        <LoadError title="没有找到这一章" desc="请先从书架选一本书、再进入研讨。"
          onRetry={() => navigate('library')} onBack={() => navigate('library')} />
      </div>
    )
  }

  const session = data.seminars.find((s) => s.id === sessionId)
  const cards = analysis ? seminarCards(analysis) : { themes: [], characters: [], keyQuotes: [] }
  const brief = chapterBriefFor(data.library, book, chapter.id)
  const lastAi = session ? [...session.messages].reverse().find((m) => m.role === 'ai') : undefined

  const patchSession = (recipe: (s: SeminarSession) => SeminarSession) => {
    update((prev) => ({
      ...prev,
      seminars: prev.seminars.map((s) => s.id === sessionId ? recipe(s) : s),
    }))
  }

  const changeRole = (role: SeminarRole) => {
    if (!session) return
    patchSession((s) => ({
      ...s, role,
      messages: s.messages.map((m) => m.role === 'ai' ? { ...m, speaker: ROLE_LABEL[role] } : m),
    }))
    notify(`已切换为「${ROLE_LABEL[role]}」语气`)
  }

  const changeGuidance = (guidance: GuidanceStrength) => {
    if (!session) return
    patchSession((s) => ({ ...s, guidance }))
    update((prev) => ({ ...prev, settings: { ...prev.settings, seminarGuidance: guidance } }))
    notify(`研讨引导强度：${GUIDANCE_LABEL[guidance]}`)
  }

  const locateEvidence = (quote?: string) => {
    const q = quote || cards.keyQuotes[0]?.quote || ''
    const idx = findParagraphForQuote(chapter, q)
    navigate('reader', { bookId: book.id, chapterId: chapter.id, paragraphIndex: idx })
    notify('已回到原文段落，挑一句能支撑你判断的短引 📖')
  }

  const buildInput = (base: SeminarSession, value: string): SeminarInput => ({
    chapterText: chapterText(chapter, 'original'),
    chapterTitle: chapter.title,
    chapterBrief: brief,
    themes: cards.themes,
    characters: cards.characters,
    keyQuotes: cards.keyQuotes,
    discussionQuestions: analysis?.discussionQuestions || [],
    role: base.role,
    guidance: base.guidance,
    history: base.messages,
    userInput: value,
    difficulty: data.settings.difficulty,
    turn: base.turns,
  })

  /** 结束研讨：写错题本、复习队列、XP 与研讨报告；不改动现有 CoachAgent */
  const finalize = (finalSession: SeminarSession) => {
    if (!analysis) return
    const report = buildSeminarReport(finalSession, analysis)
    const now = Date.now()
    const newMistakes: Mistake[] = finalSession.mistakes.map((m) => {
      const [original, corrected] = m.split(' → ')
      return {
        id: uid('mis'), original: original || m, corrected: corrected || '（见可模仿表达）',
        type: '研讨表达改写', note: `来自研讨「${finalSession.chapterTitle}」`,
        sessionId: finalSession.id, createdAt: now, mastered: false,
      }
    })
    update((prev) => {
      const queue: ReviewItem[] = [...prev.reviewQueue]
      for (const word of report.newWords) {
        const idx = queue.findIndex((q) => q.content.trim().toLowerCase() === word.toLowerCase())
        if (idx >= 0) queue[idx] = { ...queue[idx], dueAt: now }
        else queue.push({
          id: uid('rev'), kind: 'word', content: word,
          meaning: analysis.hardWords.find((w) => w.word.toLowerCase() === word.toLowerCase())?.meaningZh || '本章重点词',
          example: `From ${finalSession.bookTitle}, ${finalSession.chapterTitle}`,
          level: 0, dueAt: now + SRS_INTERVALS[0] * 24 * 60 * 60 * 1000, createdAt: now,
        })
      }
      return {
        ...prev,
        seminars: prev.seminars.map((s) => s.id === finalSession.id
          ? { ...finalSession, report, finishedAt: now } : s),
        mistakes: [...newMistakes, ...prev.mistakes].slice(0, 120),
        reviewQueue: queue,
      }
    })
    /** [成长系统] 章节完成奖励：同一章节只发一次；flags 供深度成就事件驱动判定 */
    const finishResult = awardXp({
      id: `seminar:chapter:${finalSession.chapterId}:finish`,
      source: 'seminar', action: 'seminar_finish', amount: XP_RULES.seminar_finish,
      meta: {
        chapterId: finalSession.chapterId,
        flags: { evidence3: finalSession.coveredQuotes.length >= 3, rounds4: finalSession.turns >= 4 },
      },
    })
    setEnding(false)
    notify(finishResult.granted
      ? `研讨完成！+${finishResult.amount} XP，观点与开放问题已收进小结 🎓`
      : '研讨完成！本章的完成奖励已领取过，观点与开放问题已更新 🎓')
  }

  const send = async (raw?: string) => {
    const value = (raw ?? text).trim()
    if (!value || sending || ending || !session || !analysis) return
    const base = session
    const input = buildInput(base, value)
    const msg = userMessage(value)
    setSending(true)
    setText('')
    update((prev) => ({
      ...prev,
      seminars: prev.seminars.map((s) => s.id === base.id ? { ...s, messages: [...s.messages, msg] } : s),
    }))

    let output
    try { output = await generateSeminar(input) }
    catch (err) {
      console.warn('[LinguaBuddy] 研讨生成失败，使用本地兜底：', err)
      output = mockSeminarTurn(input)
    }

    const aiMsg: SeminarMessage = {
      id: uid('msg'), role: 'ai', speaker: ROLE_LABEL[base.role], text: output.reply,
      translation: output.translation, evidencePrompt: output.evidencePrompt, at: Date.now(),
    }
    const coachMsg: SeminarMessage | null = output.stageSummary ? {
      id: uid('msg'), role: 'coach', speaker: '阶段小结', text: output.stageSummary!, at: Date.now(),
    } : null
    const usedQuote = hasTextEvidence(input) ? cards.keyQuotes[base.turns % Math.max(cards.keyQuotes.length, 1)]?.quote : undefined
    const nextSession: SeminarSession = {
      ...base,
      messages: [...base.messages, { ...msg, feedback: output.feedback }, aiMsg, ...(coachMsg ? [coachMsg] : [])],
      turns: base.turns + 1,
      coveredQuotes: usedQuote && !base.coveredQuotes.includes(usedQuote)
        ? [...base.coveredQuotes, usedQuote] : base.coveredQuotes,
      mistakes: output.feedback.corrected && output.feedback.corrected.trim() !== value
        ? [...new Set([...base.mistakes, `${value} → ${output.feedback.corrected}`])] : base.mistakes,
    }
    update((prev) => ({
      ...prev,
      seminars: prev.seminars.map((s) => s.id === base.id ? nextSession : s),
    }))
    /** [成长系统] 研讨有效轮次同样按统一入口发放，bucket 用章节 ID 保证重进不重置上限 */
    if (output.effective !== false) {
      awardXp({
        id: `seminar:${base.id}:turn:${base.turns + 1}`,
        source: 'seminar', action: 'round_effective', amount: XP_RULES.round_effective,
        meta: { scenarioId: `seminar:${base.chapterId}` },
      })
    }
    if (data.settings.autoSpeak) speak(output.reply, data.settings)
    setSending(false)
    if (output.end) {
      setEnding(true)
      window.setTimeout(() => finalize(nextSession), 900)
    }
  }

  const toggleTranslation = (v: boolean) => {
    setShowTranslation(v)
    update((prev) => ({ ...prev, settings: { ...prev.settings, showTranslation: v } }))
  }

  return (
    <div className="animate-in space-y-4">
      {/* 研讨页头：与对话页明确区分，组件仍保持一致 */}
      <Card className="!p-4">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => navigate('reader', { bookId: book.id, chapterId: chapter.id })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-label="回到阅读页">
            <Icon name="left" size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px] tracking-widest">SEMINAR · 文学研讨</Chip>
              <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">非角色扮演</Chip>
            </div>
            <p className="en-text mt-1.5 truncate font-display text-sm font-bold text-ink">{chapter.title}</p>
            <p className="truncate text-[11px] text-muted">{book.title} · {chapter.excerptRange}</p>
          </div>
        </div>
        <p className="mt-3 rounded-2xl bg-brand-50/70 p-3 text-[11px] leading-relaxed text-ink/80">
          <b className="text-brand-600">前情摘要：</b>{brief}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-ink">引导者角色</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['guide', 'peer'] as const).map((r) => (
                <button key={r} type="button" onClick={() => changeRole(r)}
                  className={`rounded-xl px-1 py-1.5 text-[10px] font-bold transition ${session?.role === r ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-600'}`}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-ink">引导强度</p>
            <div className="grid grid-cols-3 gap-1">
              {(['light', 'medium', 'strong'] as const).map((g) => (
                <button key={g} type="button" onClick={() => changeGuidance(g)}
                  className={`rounded-xl px-0.5 py-1.5 text-[9px] font-bold transition ${session?.guidance === g ? 'bg-mint-500 text-white' : 'bg-slate-100 text-muted'}`}>
                  {GUIDANCE_LABEL[g]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-brand-50 pt-3">
          <Icon name="target" size={16} className="shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-ink">研讨进度 · 建议至少 4 轮</p>
            <ProgressBar value={Math.min(1, (session?.turns || 0) / 8)} className="mt-1.5" />
          </div>
          <span className="shrink-0 text-[11px] font-bold text-brand-600">{session?.turns || 0}/8 轮</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-brand-50 pt-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"><Icon name="text" size={14} />显示中文大意</span>
          <Toggle checked={showTranslation} onChange={toggleTranslation} label="显示翻译" />
        </div>
      </Card>

      {status === 'loading' && <Card><LiteraryLoader text="正在布置研讨圆桌…" /></Card>}
      {status === 'error' && (
        <LoadError title="研讨室没能准备好" desc={errorMsg}
          onRetry={() => { setErrorMsg(''); setLoadNonce((n) => n + 1) }}
          onBack={() => navigate('bookDetail', { bookId: book.id })} />
      )}

      {status === 'ready' && analysis && (
        <>
          {/* 研讨上下文卡：主题 / 人物 / 问题 / 关键引文 */}
          <details className="card !p-4" open>
            <summary className="flex items-center justify-between text-xs font-bold text-ink">
              本章研讨卡 · 主题 / 人物 / 问题 <Icon name="down" size={14} className="text-muted" />
            </summary>
            <div className="mt-3 space-y-3">
              <div><p className="mb-1.5 text-[11px] font-bold text-brand-600">✦ 主题假设（不是标准答案）</p><ThemeCards themes={cards.themes} /></div>
              <div><p className="mb-1.5 text-[11px] font-bold text-mint-600">◎ 人物卡片</p>
                {cards.characters.length ? <CharacterCards characters={cards.characters} />
                  : <p className="text-[11px] text-muted">本章没有可确认的人物卡。</p>}</div>
              <div><p className="mb-1.5 text-[11px] font-bold text-[#a56a08]">？ 开放问题</p>
                <QuestionCards questions={analysis.discussionQuestions} onPick={(q) => setText(`I think ${q} My reason is ...`)} /></div>
              <div><p className="mb-1.5 text-[11px] font-bold text-brand-600">“ 可引用的原文短句</p>
                <div className="flex flex-wrap gap-1.5">
                  {cards.keyQuotes.map((q) => (
                    <button key={q.quote} type="button" onClick={() => locateEvidence(q.quote)}
                      className="en-text rounded-xl border border-brand-100 bg-white px-2.5 py-1.5 text-left text-[10px] leading-relaxed text-ink/80 hover:bg-brand-50">
                      “{q.quote}”
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">{analysis.disclaimer}</p>
            </div>
          </details>

          {/* 消息流：复用共享气泡与反馈卡 */}
          {!session ? (
            <EmptyState emblem="🪑" title="研讨会话还没建好" desc="稍等一下，或者回到书籍详情重新进入本章研讨。" />
          ) : (
            <div className="space-y-4 px-0.5 pb-2">
              {session.messages.map((m, i) => {
                if (m.role === 'coach') {
                  return (
                    <div key={m.id} className="mx-auto max-w-[92%] animate-in rounded-2xl border border-mint-400/30 bg-mint-100/70 px-4 py-3 text-center">
                      <p className="text-[10px] font-bold tracking-widest text-mint-600">SEMINAR · 阶段小结</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink/80">{m.text}</p>
                    </div>
                  )
                }
                return (
                  <div key={m.id} style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
                    <ChatBubble
                      role={m.role === 'user' ? 'user' : 'ai'}
                      speaker={m.speaker} text={m.text}
                      translation={m.translation} showTranslation={showTranslation}
                      onSpeak={m.role === 'ai' ? () => speak(m.text, data.settings) : undefined}
                      avatarTone={m.role === 'ai' ? 'mint' : 'brand'}
                      label={m.role === 'ai' ? `${m.speaker} · 不扮演小说角色` : undefined}>
                      {m.feedback && m.role === 'user' ? <SeminarFeedbackCard feedback={m.feedback} /> : undefined}
                    </ChatBubble>
                    {m.role === 'ai' && m.evidencePrompt && (
                      <div className="ml-12 mt-1.5 flex flex-wrap items-center gap-2 rounded-2xl bg-sun-100/60 px-3 py-2">
                        <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-[#8a5b08]">{m.evidencePrompt}</p>
                        <button type="button" onClick={() => locateEvidence()}
                          className="shrink-0 rounded-xl bg-white px-2.5 py-1 text-[10px] font-bold text-brand-600">回原文找证据</button>
                      </div>
                    )}
                  </div>
                )
              })}
              {sending && (
                <div className="flex items-center gap-2.5">
                  <div className="h-[34px] w-[34px] rounded-full bg-mint-100" />
                  <div className="flex items-center gap-1.5 rounded-3xl border border-brand-50 bg-white px-4 py-3.5 shadow-card">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* 小结报告 */}
          {session?.report && (
            <Card>
              <SectionTitle title="研讨小结" subtitle={session.report.disclaimer} right={<Chip tone="mint">+{session.report.xp} XP</Chip>} />
              <p className="text-[11px] leading-relaxed text-ink/80">{session.report.summary}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl bg-mint-100/60 p-3">
                  <p className="text-[11px] font-bold text-mint-600">已达成的观点</p>
                  {session.report.agreedPoints.length
                    ? <ul className="mt-1 space-y-1 text-[11px] text-ink/80">
                      {session.report.agreedPoints.map((p) => <li key={p}>· {p}</li>)}</ul>
                    : <p className="mt-1 text-[11px] text-muted">还没有形成带原文依据的观点，下次可以试试先引用一句。</p>}
                </div>
                <div className="rounded-2xl bg-sun-100/60 p-3">
                  <p className="text-[11px] font-bold text-[#a56a08]">待探索的问题</p>
                  <ul className="mt-1 space-y-1 text-[11px] text-ink/80">
                    {session.report.openQuestions.map((q) => <li key={q}>· {q}</li>)}</ul>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip tone="brand">证据引用 {session.report.evidenceHits} 次</Chip>
                <Chip tone="mint">新增词 {session.report.newWords.length} 个</Chip>
              </div>
              <button type="button" onClick={() => navigate('readingProgress')} className="btn-ghost mt-3 w-full !py-2 !text-xs">
                去阅读进度看看 <Icon name="right" size={13} />
              </button>
            </Card>
          )}

          {/* 输入台 */}
          <div className="sticky bottom-[84px] z-20 space-y-2 rounded-3xl border border-white/80 bg-white/95 p-3 shadow-float backdrop-blur">
            <div className="hide-scroll flex gap-2 overflow-x-auto pb-0.5">
              {([
                'I think this because the text says ...',
                'Which line supports that reading?',
                'From another point of view, ...',
              ] as string[]).map((r) => (
                <button key={r} type="button" disabled={sending || ending || Boolean(session?.finishedAt)} onClick={() => send(r)}
                  className="en-text shrink-0 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                  {r}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                rows={2} placeholder="用英文说说你的判断，也可以直接用中文…（记得回原文找一句证据）"
                disabled={Boolean(session?.finishedAt)}
                className="field en-text max-h-28 min-h-[52px] flex-1 resize-none !py-2.5 text-sm" />
              <button type="button" onClick={() => send()} disabled={sending || ending || !text.trim() || Boolean(session?.finishedAt)}
                className="btn-primary !h-[52px] !w-[52px] !rounded-2xl !px-0" aria-label="发送研讨发言">
                <Icon name="send" size={19} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <IconButton icon="text" label="回原文找证据" onClick={() => locateEvidence()} />
                <IconButton icon="speaker" label="朗读上一句" onClick={() => lastAi && speak(lastAi.text, data.settings)} />
                <IconButton icon="flag" label="结束研讨并生成小结"
                  onClick={() => setConfirmEnd(true)} disabled={Boolean(session?.finishedAt) || (session?.turns || 0) < 1} />
              </div>
              <span className="text-right text-[10px] leading-tight text-muted">
                📖 回原文找证据 · 🎓 至少 4 轮<br />引导者只追问，不给标准答案
              </span>
            </div>
          </div>
        </>
      )}

      <LiterarySection title="研讨与角色对话的区别" subtitle="两条路并列，互不替代。">
        <Card>
          <div className="grid gap-2 sm:grid-cols-2 text-[11px] leading-relaxed">
            <div className="rounded-2xl bg-brand-50/70 p-3">
              <p className="font-bold text-brand-600">角色对话 · Dialogue</p>
              <p className="mt-1 text-ink/75">情景模拟 + 语法纠错；AI 扮演小说/场景里的角色，目标是练流利表达。</p>
            </div>
            <div className="rounded-2xl bg-mint-100/60 p-3">
              <p className="font-bold text-mint-600">文学研讨 · Seminar</p>
              <p className="mt-1 text-ink/75">文本分析 + 论证引导；AI 是引导者/同伴，目标是观点、原文证据与逻辑。</p>
            </div>
          </div>
        </Card>
      </LiterarySection>

      <Modal open={confirmEnd} title="现在收尾这场研讨吗？"
        desc="引导者会整理已达成的观点与待探索的问题，把语言改写写入错题本、新增词写入复习队列。这场研讨记录会保留。"
        confirmText="结束并生成小结" cancelText="再聊两轮" onClose={() => setConfirmEnd(false)}
        onConfirm={() => { setConfirmEnd(false); if (session) { const s = session; setEnding(true); window.setTimeout(() => finalize(s), 300) } }} />
    </div>
  )
}
