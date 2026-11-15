import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../store/useAppStore'
import { uid } from '../lib/utils'
import { speak, stopSpeaking } from '../lib/speech'
import { useMediaQuery } from '../lib/useMediaQuery'
import { lookupOxfordEntry } from '../data/oxfordGlossary'
import { WordGuide, WordPanel } from '../components/WordPanel'
import { SRS_INTERVALS } from '../services/coach'
/** [新增] 阅读生词一键加入词场队列 */
import { enqueueWordFromContext } from '../lib/wordLabFlow'
import {
  analyzeChapter, mockAnalyzeChapter,
} from '../services/literaryAnalyzer'
import {
  chapterText, getChapter, listChapters, makeChapterBrief, nextChapter, previousChapter,
  progressRecord, readingPercent, splitIntoSentences,
} from '../services/literaryCurator'
import type {
  ChapterAnalysis, ReadingViewMode,
} from '../literaryTypes'
import type { ReviewItem } from '../types'
import {
  CharacterCards, LiteraryLoader, LiterarySection, LoadError,
  QuestionCards, QuoteCards, ThemeCards, ViewModeHint, ViewSwitcher,
} from '../components/LiteraryBits'
import { Card, Chip, EmptyState, Icon, IconButton, ProgressBar, SectionTitle } from '../components/ui'

/** 从本章原文里找出含该词的真实句子，作为词典卡的语料（不编造例句） */
function findSentenceForWord(paragraphs: string[], word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let re: RegExp
  try { re = new RegExp(`\\b${escaped}\\b`, 'i') } catch { return '' }
  for (const p of paragraphs) {
    for (const sentence of splitIntoSentences(p)) {
      if (re.test(sentence)) return sentence.trim().slice(0, 220)
    }
  }
  return ''
}

export function Reader() {
  const { data, params, navigate, update, notify, awardXp } = useApp()
  const found = getChapter(data.library, params.bookId, params.chapterId)
  const book = found?.book
  const chapter = found?.chapter
  const chapters = listChapters(data.library, params.bookId)
  const record = progressRecord(data.readingProgress, params.bookId || '', data.settings.readingView)

  const [viewMode, setViewMode] = useState<ReadingViewMode>(() => record.viewMode || data.settings.readingView)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [analysis, setAnalysis] = useState<ChapterAnalysis | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [loadNonce, setLoadNonce] = useState(0)
  const [activeWord, setActiveWord] = useState<string | null>(null)
  const [noteFor, setNoteFor] = useState<number | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [focusParagraph, setFocusParagraph] = useState<number | null>(params.paragraphIndex ?? null)
  const paraRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const epochRef = useRef(0)

  /* 桌面宽屏把词典挂到布局第三列的槽位；中小屏改用右侧抽屉 */
  const wide = useMediaQuery('(min-width: 1280px)')
  const [wordSlot, setWordSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (typeof document === 'undefined') return
    setWordSlot(document.getElementById('reader-word-slot'))
  }, [wide])

  /** 弹出后可关闭：Esc 键统一收起 */
  useEffect(() => {
    if (!activeWord) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveWord(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeWord])

  /** 单章分析：异步可替换入口；失败时用本地 Mock 再兜一层，再失败才展示错误态 */
  useEffect(() => {
    if (!book || !chapter) return
    const epoch = ++epochRef.current
    let alive = true
    setStatus('loading')
    setActiveWord(null)
    void (async () => {
      try {
        const result = await analyzeChapter({ chapter, book, targetDifficulty: data.settings.difficulty })
        if (!alive || epoch !== epochRef.current) return
        if (!result || !result.chapterId) throw new Error('章节分析结果为空')
        setAnalysis(result)
        // 每章生成一份 chapterBrief 存入书库，供后续章节研讨作前情摘要
        const brief = makeChapterBrief(
          chapter, result.chapterBrief,
          result.themes.map((t) => t.name), result.characters.map((c) => c.name),
        )
        update((prev) => ({
          ...prev,
          library: { ...prev.library, briefs: { ...prev.library.briefs, [chapter.id]: brief } },
        }))
        setStatus('ready')
      } catch (err) {
        if (!alive || epoch !== epochRef.current) return
        try {
          const fallback = mockAnalyzeChapter({ chapter, book, targetDifficulty: data.settings.difficulty })
          setAnalysis(fallback)
          setStatus('ready')
          console.warn('[LinguaBuddy] 章节分析已回退本地 Mock：', err)
        } catch (fatal) {
          setErrorMsg(`章节加载失败：${String(fatal)}`)
          setStatus('error')
        }
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.bookId, params.chapterId, loadNonce, data.settings.difficulty])

  /** 阅读进度：书目 / 章节 / 视图模式 / 位置都落到 lingua_reading_progress */
  useEffect(() => {
    if (!book || !chapter) return
    update((prev) => ({
      ...prev,
      readingProgress: {
        ...prev.readingProgress,
        [book.id]: {
          ...progressRecord(prev.readingProgress, book.id, prev.settings.readingView),
          bookId: book.id,
          chapterId: chapter.id,
          position: focusParagraph ?? 0,
          viewMode,
          updatedAt: Date.now(),
        },
      },
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.bookId, params.chapterId, viewMode])

  /** 从研讨页「回原文找证据」跳转过来时定位段落 */
  useEffect(() => {
    if (typeof params.paragraphIndex === 'number') {
      setFocusParagraph(params.paragraphIndex)
      window.setTimeout(() => paraRefs.current[params.paragraphIndex!]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 120)
    }
  }, [params.paragraphIndex, params.chapterId])

  useEffect(() => () => { try { stopSpeaking() } catch { /* 忽略 */ } }, [])

  /* hooks 必须无条件、按固定顺序执行：派生值一律放在提前 return 之前 */
  const glossMap = useMemo(() => {
    const m = new Map<string, { meaningZh: string; note: string }>()
    for (const w of analysis?.hardWords || []) m.set(w.word.toLowerCase(), { meaningZh: w.meaningZh, note: w.note })
    return m
  }, [analysis])
  const wordPattern = useMemo(() => {
    const words = [...glossMap.keys()].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return words.length ? new RegExp(`\\b(${words.join('|')})\\b`, 'gi') : null
  }, [glossMap])

  /** 牛津式词条：英英释义为主，中文对照与本章原句为辅 */
  const activeEntry = useMemo(() => {
    if (!activeWord) return null
    const gloss = glossMap.get(activeWord.toLowerCase())
    const sentence = chapter ? findSentenceForWord(chapter.paragraphs, activeWord) : ''
    return lookupOxfordEntry(activeWord, gloss?.meaningZh || '', gloss?.note || '', sentence)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWord, glossMap, params.chapterId])

  if (!book || !chapter) {
    return (
      <div className="space-y-4">
        <LoadError title="没有找到这一章" desc="章节编号可能已失效，或书库数据尚未就绪。"
          onRetry={() => navigate('library')} onBack={() => navigate('library')} />
      </div>
    )
  }

  const percent = readingPercent(book, record)
  const notes = data.literaryNotes.notes.filter((n) => n.bookId === book.id && n.chapterId === chapter.id)
  const highlights = new Set(
    data.literaryNotes.highlights
      .filter((h) => h.bookId === book.id && h.chapterId === chapter.id)
      .map((h) => h.paragraphIndex),
  )
  const bookmarked = data.literaryNotes.bookmarks.some((b) => b.bookId === book.id && b.chapterId === chapter.id)
  const paraTexts = viewMode === 'simplified' ? chapter.simplified : chapter.paragraphs
  const alreadySaved = activeWord
    ? data.literaryNotes.savedWords.some((w) => w.toLowerCase() === activeWord.toLowerCase())
    : false

  /** 段落朗读：复用现有 speechSynthesis 封装 */
  const readParagraph = (text: string) => {
    if (!text.trim()) return
    speak(text, data.settings)
  }

  /** 词汇 → 现有 lingua_review_queue（沿用 SM-2 简化调度） */
  const addWordToReview = (word: string) => {
    const gloss = glossMap.get(word.toLowerCase())
    if (!gloss) return
    update((prev) => {
      const exists = prev.reviewQueue.some((r) => r.content.trim().toLowerCase() === word.toLowerCase())
      if (exists) return {
        ...prev,
        literaryNotes: {
          ...prev.literaryNotes,
          savedWords: [...new Set([...prev.literaryNotes.savedWords, word])],
        },
      }
      const item: ReviewItem = {
        id: uid('rev'), kind: 'word', content: word, meaning: gloss.meaningZh,
        example: `From ${book.title}, ${chapter.title}: “${chapter.paragraphs[0].slice(0, 90)}…”`,
        level: 0, dueAt: Date.now() + SRS_INTERVALS[0] * 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
      }
      return {
        ...prev,
        reviewQueue: [...prev.reviewQueue, item],
        literaryNotes: {
          ...prev.literaryNotes,
          savedWords: [...new Set([...prev.literaryNotes.savedWords, word])],
        },
      }
    })
    notify(`「${word}」已加入复习队列，明天会再遇见它一次 📚`)
  }

  /** [新增] 阅读生词 → 词场队列（origin='reading'，不计当日新词上限） */
  const addWordToWordLab = (word: string) => {
    const gloss = glossMap.get(word.toLowerCase())
    enqueueWordFromContext({ data, update, notify }, word, 'reading', gloss?.meaningZh ?? '')
    /** [成长系统] 外部生词入队是 0 XP 标记事件，只驱动广度成就 */
    awardXp({
      id: `wordlab:external:reading:${word.toLowerCase()}`,
      source: 'wordlab', action: 'external_word_enqueued', amount: 0, meta: { internal: true },
    })
  }

  const saveNote = (index: number) => {
    const text = noteDraft.trim()
    if (!text) { notify('先写一句想法，再保存批注'); return }
    update((prev) => ({
      ...prev,
      literaryNotes: {
        ...prev.literaryNotes,
        notes: [...prev.literaryNotes.notes, {
          id: uid('note'), bookId: book.id, chapterId: chapter.id,
          paragraphIndex: index, text, createdAt: Date.now(),
        }],
      },
    }))
    setNoteDraft('')
    setNoteFor(null)
    notify('批注已保存到本机 ✍️')
  }

  const toggleHighlight = (index: number) => {
    update((prev) => {
      const list = prev.literaryNotes.highlights
      const hit = list.find((h) => h.bookId === book.id && h.chapterId === chapter.id && h.paragraphIndex === index)
      return {
        ...prev,
        literaryNotes: {
          ...prev.literaryNotes,
          highlights: hit
            ? list.filter((h) => h.id !== hit.id)
            : [...list, { id: uid('hl'), bookId: book.id, chapterId: chapter.id, paragraphIndex: index, createdAt: Date.now() }],
        },
      }
    })
  }

  const toggleBookmark = () => {
    update((prev) => {
      const list = prev.literaryNotes.bookmarks
      const hit = list.find((b) => b.bookId === book.id && b.chapterId === chapter.id)
      return {
        ...prev,
        literaryNotes: {
          ...prev.literaryNotes,
          bookmarks: hit
            ? list.filter((b) => b.id !== hit.id)
            : [...list, { id: uid('bm'), bookId: book.id, chapterId: chapter.id, createdAt: Date.now() }],
        },
      }
    })
    notify(bookmarked ? '已取消书签' : '本章已加入书签 🔖')
  }

  const removeNote = (id: string) => update((prev) => ({
    ...prev,
    literaryNotes: { ...prev.literaryNotes, notes: prev.literaryNotes.notes.filter((n) => n.id !== id) },
  }))

  const markComplete = () => {
    update((prev) => {
      const rec = progressRecord(prev.readingProgress, book.id, prev.settings.readingView)
      const done = new Set(rec.completedChapterIds)
      done.add(chapter.id)
      return {
        ...prev,
        readingProgress: {
          ...prev.readingProgress,
          [book.id]: { ...rec, bookId: book.id, chapterId: chapter.id, completedChapterIds: [...done], updatedAt: Date.now() },
        },
      }
    })
    notify('这一章读完了，进度已记录 ✅')
  }

  /** 词汇高亮：按整词切分，点击后在旁侧词典栏展开牛津式词条 */
  const renderParagraph = (text: string, pIndex: number) => {
    if (!wordPattern || viewMode === 'simplified') return text
    const parts = text.split(wordPattern)
    return parts.map((part, i) => {
      const hit = glossMap.has(part.toLowerCase())
      if (!hit) return <span key={i}>{part}</span>
      const active = activeWord?.toLowerCase() === part.toLowerCase()
      return (
        <button key={i} type="button" className={`lit-word ${active ? 'lit-word-active' : ''}`}
          onClick={() => setActiveWord(part)} aria-pressed={active}
          title={`在旁侧词典查看：${part}`}>{part}</button>
      )
    })
  }

  const prevCh = previousChapter(book, chapter.id)
  const nextCh = nextChapter(book, chapter.id)

  const closePanel = () => setActiveWord(null)
  const panelNode = activeEntry ? (
    <WordPanel entry={activeEntry} alreadySaved={alreadySaved} compact={wide}
      onClose={closePanel}
      onAddToReview={() => addWordToReview(activeEntry.word)}
      onAddToWordLab={() => addWordToWordLab(activeEntry.word)}
      onSpeak={() => speak(activeEntry.word, data.settings)} />
  ) : null

  return (
    <>
      {/* 桌面宽屏：词典借住布局第三列，真正位于正文旁侧；没选词时显示引导卡 */}
      {wide && wordSlot && createPortal(panelNode || <WordGuide />, wordSlot)}

      {/* 中小屏：右侧滑出抽屉，点遮罩 / × / Esc 均可关闭 */}
      {!wide && activeEntry && (
        <>
          <button type="button" onClick={closePanel} aria-label="关闭词典遮罩"
            className="fixed inset-0 z-40 bg-ink/25" />
          <aside data-word-drawer="true"
            className="animate-in fixed right-0 top-0 z-50 h-full w-[min(92vw,360px)] overflow-y-auto border-l border-brand-100 bg-white/95 p-3 shadow-float">
            {panelNode}
          </aside>
        </>
      )}

      <div className="animate-in space-y-4">
      {/* 章节状态条 */}
      <Card className="!p-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('bookDetail', { bookId: book.id })}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-label="返回书籍详情">
            <Icon name="left" size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-ink">{book.emblem} {chapter.title}</p>
            <p className="truncate text-[11px] text-muted">{book.title} · {chapter.excerptRange}</p>
          </div>
          <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">第 {chapter.order} / {chapters.length} 章</Chip>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Icon name="book" size={16} className="shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-ink">已读 {record.completedChapterIds?.length || 0} / {chapters.length} 章节选</p>
            <ProgressBar value={percent} className="mt-1.5" />
          </div>
          <span className="shrink-0 text-[11px] font-bold text-brand-600">{Math.round(percent * 100)}%</span>
        </div>
        <div className="mt-3 border-t border-brand-50 pt-3">
          <ViewSwitcher value={viewMode} onChange={setViewMode} />
          <ViewModeHint mode={viewMode} />
        </div>
      </Card>

      {status === 'loading' && <Card><LiteraryLoader /></Card>}
      {status === 'error' && (
        <LoadError title="这一章没能加载出来" desc={errorMsg}
          onRetry={() => { setErrorMsg(''); setLoadNonce((n) => n + 1) }}
          onBack={() => navigate('bookDetail', { bookId: book.id })} />
      )}

      {status === 'ready' && analysis && (
        <>
          {/* 正文：大字号、宽行距、注释不打断阅读流；生词释义已移到旁侧词典栏 */}
          <Card className="!p-5 sm:!p-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-brand-600">CHAPTER EXCERPT</p>
                <h2 className="en-text font-display mt-1 text-lg font-black text-ink">{chapter.title}</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <IconButton icon="speaker" label="朗读本章" onClick={() => readParagraph(chapterText(chapter, 'original'))} />
                <IconButton icon="flag" label={bookmarked ? '取消书签' : '加入书签'} active={bookmarked} onClick={toggleBookmark} />
                <IconButton icon="check" label="标记本章已读" onClick={markComplete} />
              </div>
            </div>

            <div className="prose-reading en-text space-y-5 text-ink">
              {paraTexts.map((text, i) => {
                const pNotes = notes.filter((n) => n.paragraphIndex === i)
                return (
                  <div key={i} className="relative">
                    <p ref={(el) => { paraRefs.current[i] = el }}
                      className={`rounded-xl px-2 py-1.5 transition ${highlights.has(i) ? 'lit-highlight' : ''} ${focusParagraph === i ? 'lit-focus' : ''}`}>
                      {renderParagraph(text, i)}
                    </p>
                    {viewMode === 'bilingual' && chapter.notesZh[i] && (
                      <p className="lit-note mt-1.5 rounded-xl bg-brand-50/60 px-3 py-2 text-[11px] leading-relaxed text-muted">
                        {chapter.notesZh[i]}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => readParagraph(chapter.paragraphs[i] || text)}
                        className="flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline">
                        <Icon name="speaker" size={11} />朗读本段
                      </button>
                      <button type="button" onClick={() => { setNoteFor(noteFor === i ? null : i); setNoteDraft('') }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-mint-600 hover:underline">
                        <Icon name="edit" size={11} />批注
                      </button>
                      <button type="button" onClick={() => toggleHighlight(i)}
                        className={`flex items-center gap-1 text-[10px] font-semibold hover:underline ${highlights.has(i) ? 'text-sun-500' : 'text-muted'}`}>
                        <Icon name="star" size={11} />{highlights.has(i) ? '取消高亮' : '高亮'}
                      </button>
                      <span className="ml-auto text-[10px] text-muted">¶ {i + 1}</span>
                    </div>
                    {pNotes.map((n) => (
                      <div key={n.id} className="mt-1.5 flex items-start gap-2 rounded-xl bg-mint-100/60 px-3 py-2">
                        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink/80">📝 {n.text}</p>
                        <button type="button" onClick={() => removeNote(n.id)} aria-label="删除批注" className="text-muted hover:text-coral-600">
                          <Icon name="close" size={12} />
                        </button>
                      </div>
                    ))}
                    {noteFor === i && (
                      <div className="mt-2 rounded-2xl border border-brand-100 bg-white p-2.5">
                        <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2}
                          data-literary-note="true" placeholder="写下你对这一段的想法…（中文或英文都可以）"
                          className="field min-h-[52px] resize-none !py-2 text-xs" />
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => saveNote(i)} className="btn-primary !px-3 !py-1.5 !text-[11px]">保存批注</button>
                          <button type="button" onClick={() => { setNoteFor(null); setNoteDraft('') }} className="btn-ghost !px-3 !py-1.5 !text-[11px]">取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {viewMode === 'simplified' && (
              <p className="mt-4 rounded-xl bg-sun-100/60 p-2.5 text-[10px] leading-relaxed text-[#8a5b08]">
                分级简化是学习用改写，不是原文；研讨时请以「原文」视图的短句作为证据。
              </p>
            )}
            <p className="mt-4 border-t border-brand-50 pt-3 text-[10px] leading-relaxed text-muted">
              {book.excerptNote}
            </p>
          </Card>

          {/* 本章分析：主题 / 人物 / 引文 / 讨论问题 */}
          <LiterarySection title="本章研读卡" subtitle={`CEFR ${analysis.cefr} · ${chapter.paragraphs.length} 段 · 所有证据均经原文逐字校验`}
            right={<Chip tone={analysis.evidenceValidated ? 'mint' : 'sun'}>{analysis.evidenceValidated ? '✓ 证据已校验' : '部分证据已剔除'}</Chip>}>
            <Card>
              <p className="text-xs font-bold text-ink">中文摘要</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink/80">{analysis.summaryZh}</p>
              <div className="mt-3 rounded-2xl bg-brand-50/70 p-3">
                <p className="text-[10px] font-bold tracking-widest text-brand-600">CHAPTER BRIEF · 前情摘要</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink/80">{analysis.chapterBrief}</p>
                <p className="mt-1 text-[10px] text-muted">这一份 1–2 句摘要会作为下一章研讨的前情注入，不会把全书带进对话。</p>
              </div>
              {analysis.historicalContext && (
                <p className="mt-3 text-[11px] leading-relaxed text-muted">背景：{analysis.historicalContext}</p>
              )}
            </Card>
          </LiterarySection>

          <LiterarySection title="主题假设" subtitle="不是标准答案，是可供你检验的读法。">
            <ThemeCards themes={analysis.themes} />
          </LiterarySection>
          <LiterarySection title="人物卡片" subtitle="只看本章节选中能观察到的言行。">
            {analysis.characters.length
              ? <CharacterCards characters={analysis.characters} />
              : <EmptyState emblem="🎭" title="本章没有可确认的人物卡" desc="分析器不会凭空补人；可以回到原文找称呼与对话再判断。" />}
          </LiterarySection>
          <LiterarySection title="关键原文" subtitle="点「回原文找证据」可跳回对应段落。">
            <QuoteCards quotes={analysis.keyQuotes} onLocate={(quote) => {
              const idx = chapter.paragraphs.findIndex((p) => p.toLowerCase().includes(quote.toLowerCase().slice(0, 40)))
              setFocusParagraph(idx >= 0 ? idx : 0)
              window.setTimeout(() => paraRefs.current[idx >= 0 ? idx : 0]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 80)
              notify('已定位到原文段落，找一句能支撑你判断的短引 📖')
            }} />
          </LiterarySection>
          <LiterarySection title="可讨论的问题" subtitle="带着其中一个问题进入研讨，会更容易形成自己的观点。">
            <QuestionCards questions={analysis.discussionQuestions} />
          </LiterarySection>
          <LiterarySection title="本章重点词" subtitle={`共 ${analysis.hardWords.length} 个；点开正文中的高亮词即可加入现有复习队列。`}>
            <div className="flex flex-wrap gap-1.5">
              {analysis.hardWords.length ? analysis.hardWords.map((w) => (
                <button key={w.word} type="button" onClick={() => setActiveWord(w.word)}
                  className="en-text rounded-xl border border-brand-100 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-50">
                  {w.word} <span className="font-normal text-muted">· {w.meaningZh}</span>
                </button>
              )) : <p className="text-[11px] text-muted">本章没有内置重点词。</p>}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted">{analysis.disclaimer}</p>
          </LiterarySection>

          {/* 章节导航 + 进入研讨 */}
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={!prevCh}
                onClick={() => prevCh && navigate('reader', { bookId: book.id, chapterId: prevCh.id })}
                className="btn-ghost !px-3 !py-2 !text-xs disabled:opacity-40"><Icon name="left" size={13} />上一章</button>
              <button type="button" disabled={!nextCh}
                onClick={() => nextCh && navigate('reader', { bookId: book.id, chapterId: nextCh.id })}
                className="btn-ghost !px-3 !py-2 !text-xs disabled:opacity-40">下一章<Icon name="right" size={13} /></button>
              <button type="button" onClick={markComplete} className="btn-ghost !px-3 !py-2 !text-xs">
                <Icon name="check" size={13} />标记已读
              </button>
            </div>
            <button type="button" onClick={() => { markComplete(); navigate('seminar', { bookId: book.id, chapterId: chapter.id }) }}
              className="btn-primary mt-3 w-full !py-3 !text-sm">
              <Icon name="sparkles" size={16} />进入本章研讨 · Seminar<Icon name="right" size={15} />
            </button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">
              研讨里 AI 是引导者 / 学习同伴，不会扮演小说角色；只注入本章原文与上一章 1–2 句前情。
            </p>
          </Card>
        </>
      )}

      {status === 'ready' && !analysis && (
        <EmptyState emblem="📖" title="这一章还没有可分析的内容" desc="回到书架换一章试试。" />
      )}

      <SectionTitle title="批注与书签" subtitle={`本章 ${notes.length} 条批注 · ${highlights.size} 处高亮 · ${bookmarked ? '已加书签' : '未加书签'}`} />
      </div>
    </>
  )
}
