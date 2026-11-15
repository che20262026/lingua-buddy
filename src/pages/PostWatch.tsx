import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { uid } from '../lib/utils'
import { speak, stopSpeaking } from '../lib/speech'
import { SRS_INTERVALS } from '../services/coach'
/** [新增] 观后生词一键加入词场队列 */
import { enqueueWordFromContext } from '../lib/wordLabFlow'
import { notesFor } from '../services/cultureCurator'
import { analyzeVideoCulture, mockAnalyzeVideoCulture } from '../services/cultureAnalyzer'
import {
  buildPostWatchReport, generatePostWatchReply, hasConcreteDetail, mockPostWatchTurn,
  postWatchOpeningLine, postWatchUserMessage,
} from '../services/postWatchDirector'
import type {
  CultureAnalysis, GuidanceStrength, PostWatchInput, PostWatchMessage,
  PostWatchSession, PostWatchState,
} from '../cultureTypes'
import type { Mistake, ReviewItem } from '../types'
import { ChatBubble } from '../components/FeedbackCard'
import { PostWatchFeedbackCard } from '../components/PostWatchFeedbackCard'
import {
  BackgroundCardView, CultureLoadError, CultureLoader, CultureSection,
  SeedQuestionCards,
} from '../components/CultureBits'
import { Card, Chip, EmptyState, Icon, IconButton, Modal, ProgressBar, SectionTitle, Toggle } from '../components/ui'
/** [成长系统] 完成观后讨论 / 有效轮次统一发放 */
import { XP_RULES } from '../growthTypes'

const GUIDANCE_LABEL: Record<GuidanceStrength, string> = {
  light: '轻轻提点', medium: '恰到好处', strong: '步步追问',
}

export function PostWatch() {
  const { data, params, navigate, update, notify, awardXp } = useApp()
  const video = data.cultureVideos.videos.find((v) => v.id === params.videoId)

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [analysis, setAnalysis] = useState<CultureAnalysis | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [loadNonce, setLoadNonce] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(params.postWatchId || null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [ending, setEnding] = useState(false)
  const [showTranslation, setShowTranslation] = useState(data.settings.showTranslation)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const createdRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  /** 单条视频文化分析 + 观后会话初始化；全程只接触该视频元数据与短注释 */
  useEffect(() => {
    if (!video) return
    let alive = true
    setStatus('loading')
    void (async () => {
      const input = {
        video,
        userNotes: notesFor(data.cultureNotes.notes, video.id).map((n) => ({
          id: n.id, text: n.text, createdAt: n.createdAt,
        })),
        targetDifficulty: data.settings.difficulty,
      }
      let result: CultureAnalysis
      try { result = await analyzeVideoCulture(input) }
      catch (err) {
        console.warn('[LinguaBuddy] 观后讨论的文化分析回退本地 Mock：', err)
        result = mockAnalyzeVideoCulture(input)
      }
      if (!alive) return
      if (!result?.videoId) { setErrorMsg('视频文化分析结果为空'); setStatus('error'); return }
      setAnalysis(result)
      if (!createdRef.current) {
        createdRef.current = true
        const existing = sessionId
          ? data.postWatchSessions.find((s) => s.id === sessionId)
          : data.postWatchSessions.find((s) => s.videoId === video.id && !s.finishedAt)
        if (existing) {
          setSessionId(existing.id)
        } else {
          const opening = postWatchOpeningLine({
            videoTitle: video.title,
            videoTitleZh: video.titleZh,
            videoSummaryZh: video.summaryZh,
            discussionSeeds: result.discussionSeeds,
            culturalThemes: result.culturalThemes,
          })
          const session: PostWatchSession = {
            id: uid('pw'), videoId: video.id, videoTitle: video.title, videoTitleZh: video.titleZh,
            guidance: 'medium',
            messages: [{
              id: uid('msg'), role: 'ai', speaker: '观后讨论引导者', text: opening,
              translation: '引导者先交代视频背景，再抛出一个「先回忆具体细节」的开放问题；不扮演视频人物，也不给标准文化解读。',
              at: Date.now(),
            }],
            turns: 0, coveredExpressions: [], mistakes: [], createdAt: Date.now(),
          }
          update((prev) => ({ ...prev, postWatchSessions: [session, ...prev.postWatchSessions] }))
          setSessionId(session.id)
        }
      }
      setStatus('ready')
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.videoId, loadNonce])

  useEffect(() => { bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }) }, [sending, sessionId])
  useEffect(() => () => { try { stopSpeaking() } catch { /* 忽略 */ } }, [])

  if (!video) {
    return (
      <div className="space-y-4">
        <CultureLoadError title="没有找到这个视频" desc="请先从文化首页或观看页进入观后讨论。"
          onRetry={() => navigate('cultureHub')} onBack={() => navigate('cultureHub')} />
      </div>
    )
  }

  const session = data.postWatchSessions.find((s) => s.id === sessionId)
  const lastAi = session ? [...session.messages].reverse().find((m) => m.role === 'ai') : undefined

  const patchSession = (recipe: (s: PostWatchSession) => PostWatchSession) => {
    update((prev) => ({
      ...prev,
      postWatchSessions: prev.postWatchSessions.map((s) => s.id === sessionId ? recipe(s) : s),
    }))
  }

  const changeGuidance = (guidance: GuidanceStrength) => {
    if (!session) return
    patchSession((s) => ({ ...s, guidance }))
    notify(`观后引导强度：${GUIDANCE_LABEL[guidance]}`)
  }

  /** 回视频找细节：跳回观看页，不假装能在应用内定位字幕时间轴 */
  const locateDetail = () => {
    navigate('watch', { videoId: video.id })
    notify('已回到观看页，挑一个画面/声音细节再接着聊 🎬')
  }

  const buildInput = (base: PostWatchSession, value: string): PostWatchInput => ({
    videoTitle: video.title,
    videoTitleZh: video.titleZh,
    videoSummaryZh: video.summaryZh,
    platform: video.platform,
    culturalThemes: analysis?.culturalThemes || [],
    keyExpressions: analysis?.keyExpressions || [],
    backgroundCard: analysis?.backgroundCard || { title: '', contentZh: '' },
    discussionSeeds: analysis?.discussionSeeds || [],
    history: base.messages,
    userInput: value,
    difficulty: data.settings.difficulty,
    guidance: base.guidance,
    captionPreference: data.settings.captionPreference,
    turn: base.turns,
  })

  /** 结束讨论：写错题本、现有复习队列、XP 与报告 */
  const finalize = (finalSession: PostWatchSession) => {
    if (!analysis) return
    const report = buildPostWatchReport(finalSession, analysis)
    const now = Date.now()
    const newMistakes: Mistake[] = finalSession.mistakes.map((m) => {
      const [original, corrected] = m.split(' → ')
      return {
        id: uid('mis'), original: original || m, corrected: corrected || '（见可模仿表达）',
        type: '观后表达改写', note: `来自观后讨论「${finalSession.videoTitleZh}」`,
        sessionId: finalSession.id, createdAt: now, mastered: false,
      }
    })
    update((prev) => {
      const queue: ReviewItem[] = [...prev.reviewQueue]
      for (const expr of report.newExpressions) {
        const idx = queue.findIndex((q) => q.content.trim().toLowerCase() === expr.toLowerCase())
        if (idx >= 0) queue[idx] = { ...queue[idx], dueAt: now }
        else queue.push({
          id: uid('rev'), kind: 'phrase', content: expr,
          meaning: analysis.keyExpressions.find((e) => e.expression === expr)?.meaningZh || '视频短引用',
          example: `From ${finalSession.videoTitle}`,
          level: 0, dueAt: now + SRS_INTERVALS[0] * 24 * 60 * 60 * 1000, createdAt: now,
        })
      }
      return {
        ...prev,
        postWatchSessions: prev.postWatchSessions.map((s) => s.id === finalSession.id
          ? { ...finalSession, report, finishedAt: now } : s),
        mistakes: [...newMistakes, ...prev.mistakes].slice(0, 120),
        reviewQueue: queue,
      }
    })
    /** [成长系统] 视频完成奖励：同一视频只发一次；flags 供深度成就事件驱动判定 */
    const finishResult = awardXp({
      id: `postwatch:video:${finalSession.videoId}:finish`,
      source: 'postwatch', action: 'postwatch_finish', amount: XP_RULES.postwatch_finish,
      meta: {
        videoId: finalSession.videoId,
        flags: { hasDetail: finalSession.messages.some((m) => m.role === 'user' && hasConcreteDetail(m.text)) },
      },
    })
    /** [成长系统] 讨论覆盖的文化主题：0 XP 标记事件，按主题去重驱动广度成就 */
    for (const t of (analysis?.culturalThemes ?? []).slice(0, 2)) {
      awardXp({
        id: `culture:theme:${t.theme}:discussed`,
        source: 'postwatch', action: 'theme_discussed', amount: 0, meta: { internal: true },
      })
    }
    setEnding(false)
    notify(finishResult.granted
      ? `观后讨论完成！+${finishResult.amount} XP，观点与短引用已收进小结 🎬`
      : '观后讨论完成！本视频的完成奖励已领取过，观点与短引用已更新 🎬')
  }

  const send = async (raw?: string) => {
    const value = (raw ?? text).trim()
    if (!value || sending || ending || !session || !analysis) return
    const base = session
    const input = buildInput(base, value)
    const msg = postWatchUserMessage(value)
    setSending(true)
    setText('')
    update((prev) => ({
      ...prev,
      postWatchSessions: prev.postWatchSessions.map((s) => s.id === base.id
        ? { ...s, messages: [...s.messages, msg] } : s),
    }))

    let output
    try { output = await generatePostWatchReply(input) }
    catch (err) {
      console.warn('[LinguaBuddy] 观后讨论生成失败，使用本地兜底：', err)
      output = mockPostWatchTurn(input)
    }

    const aiMsg: PostWatchMessage = {
      id: uid('msg'), role: 'ai', speaker: '观后讨论引导者', text: output.reply,
      translation: output.translation, culturalBridge: output.culturalBridge, at: Date.now(),
    }
    const coachMsg: PostWatchMessage | null = output.stageSummary ? {
      id: uid('msg'), role: 'coach', speaker: '阶段小结', text: output.stageSummary!, at: Date.now(),
    } : null
    const usedExpr = analysis.keyExpressions.find((e) => value.toLowerCase().includes(e.expression.toLowerCase()))?.expression
    const nextSession: PostWatchSession = {
      ...base,
      messages: [...base.messages, { ...msg, feedback: output.feedback }, aiMsg, ...(coachMsg ? [coachMsg] : [])],
      turns: base.turns + 1,
      coveredExpressions: usedExpr && !base.coveredExpressions.includes(usedExpr)
        ? [...base.coveredExpressions, usedExpr] : base.coveredExpressions,
      mistakes: output.feedback.corrected && output.feedback.corrected.trim() !== value
        ? [...new Set([...base.mistakes, `${value} → ${output.feedback.corrected}`])] : base.mistakes,
    }
    update((prev) => ({
      ...prev,
      postWatchSessions: prev.postWatchSessions.map((s) => s.id === base.id ? nextSession : s),
    }))
    /** [成长系统] 观后讨论有效轮次同样按统一入口发放，bucket 用视频 ID */
    if (output.effective !== false) {
      awardXp({
        id: `postwatch:${base.id}:turn:${base.turns + 1}`,
        source: 'postwatch', action: 'round_effective', amount: XP_RULES.round_effective,
        meta: { scenarioId: `postwatch:${base.videoId}` },
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
      {/* 页头：与对话页 / 研讨页明确区分，组件仍保持一致 */}
      <Card className="!p-4">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => navigate('watch', { videoId: video.id })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-label="回到观看页">
            <Icon name="left" size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="coral" className="!px-2 !py-0.5 !text-[10px] tracking-widest">POST-WATCH · 观后讨论</Chip>
              <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">非角色扮演 · 非文本细读</Chip>
            </div>
            <p className="en-text mt-1.5 truncate font-display text-sm font-bold text-ink">{video.title}</p>
            <p className="truncate text-[11px] text-muted">{video.titleZh} · 基于视听材料的观后表达</p>
          </div>
        </div>
        <p className="mt-3 rounded-2xl bg-brand-50/70 p-3 text-[11px] leading-relaxed text-ink/80">
          <b className="text-brand-600">先回忆细节：</b>引导者会先问「视频里你看到/听到了什么、那个人做了什么」，再过渡到你的观点；不扮演视频人物，也不给标准文化解读。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
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
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-ink">字幕偏好</p>
            <p className="text-[10px] leading-relaxed text-muted">
              当前「{data.settings.captionPreference === 'on' ? '开' : data.settings.captionPreference === 'off' ? '关' : '中英对照'}」· 只作用于官方播放器自带 CC
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-brand-50 pt-3">
          <Icon name="target" size={16} className="shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-ink">讨论进度 · 建议至少 4 轮</p>
            <ProgressBar value={Math.min(1, (session?.turns || 0) / 8)} className="mt-1.5" />
          </div>
          <span className="shrink-0 text-[11px] font-bold text-brand-600">{session?.turns || 0}/8 轮</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-brand-50 pt-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"><Icon name="text" size={14} />显示中文大意</span>
          <Toggle checked={showTranslation} onChange={toggleTranslation} label="显示翻译" />
        </div>
      </Card>

      {status === 'loading' && <Card><CultureLoader text="正在布置观后讨论圆桌…" /></Card>}
      {status === 'error' && (
        <CultureLoadError title="讨论室没能准备好" desc={errorMsg}
          onRetry={() => { setErrorMsg(''); setLoadNonce((n) => n + 1) }}
          onBack={() => navigate('watch', { videoId: video.id })} />
      )}

      {status === 'ready' && analysis && (
        <>
          {/* 上下文卡：背景卡 / 短引用 / 讨论种子 */}
          <details className="card !p-4" open>
            <summary className="flex items-center justify-between text-xs font-bold text-ink">
              视频讨论卡 · 背景 / 短引用 / 种子问题 <Icon name="down" size={14} className="text-muted" />
            </summary>
            <div className="mt-3 space-y-3">
              <BackgroundCardView card={analysis.backgroundCard} />
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-brand-600">？ 讨论种子问题（点击填入输入框）</p>
                <SeedQuestionCards questions={analysis.discussionSeeds}
                  onPick={(q) => setText(`In the video, I noticed that ${q} My view is ...`)} />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-coral-600">“ 可用的短引用（不是字幕全文）</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.keyExpressions.map((e) => (
                    <button key={e.expression} type="button" onClick={() => locateDetail()}
                      className="en-text rounded-xl border border-brand-100 bg-white px-2.5 py-1.5 text-left text-[10px] leading-relaxed text-ink/80 hover:bg-brand-50">
                      “{e.expression}”
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">{analysis.disclaimer}</p>
            </div>
          </details>

          {/* 消息流：复用共享气泡 + 观后反馈卡 */}
          {!session ? (
            <EmptyState emblem="🪑" title="讨论会话还没建好" desc="稍等一下，或回到观看页重新进入本章讨论。" />
          ) : (
            <div className="space-y-4 px-0.5 pb-2">
              {session.messages.map((m, i) => {
                if (m.role === 'coach') {
                  return (
                    <div key={m.id} className="mx-auto max-w-[92%] animate-in rounded-2xl border border-mint-400/30 bg-mint-100/70 px-4 py-3 text-center">
                      <p className="text-[10px] font-bold tracking-widest text-mint-600">POST-WATCH · 阶段小结</p>
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
                      avatarTone={m.role === 'ai' ? 'coral' : 'brand'}
                      label={m.role === 'ai' ? `${m.speaker} · 不扮演视频人物` : undefined}>
                      {m.feedback && m.role === 'user' ? <PostWatchFeedbackCard feedback={m.feedback} /> : undefined}
                    </ChatBubble>
                    {m.role === 'ai' && m.culturalBridge && (
                      <div className="ml-12 mt-1.5 flex flex-wrap items-center gap-2 rounded-2xl bg-sun-100/60 px-3 py-2">
                        <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-[#8a5b08]">{m.culturalBridge}</p>
                        <button type="button" onClick={locateDetail}
                          className="shrink-0 rounded-xl bg-white px-2.5 py-1 text-[10px] font-bold text-brand-600">回视频找细节</button>
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
              <SectionTitle title="观后小结" subtitle={session.report.disclaimer} right={<Chip tone="mint">+{session.report.xp} XP</Chip>} />
              <p className="text-[11px] leading-relaxed text-ink/80">{session.report.summary}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl bg-mint-100/60 p-3">
                  <p className="text-[11px] font-bold text-mint-600">已表达的观点</p>
                  {session.report.viewpoints.length
                    ? <ul className="mt-1 space-y-1 text-[11px] text-ink/80">
                      {session.report.viewpoints.map((p) => <li key={p}>· {p}</li>)}</ul>
                    : <p className="mt-1 text-[11px] text-muted">还没有形成「细节 + 观点」俱备的表达，下次可以先描述一个画面。</p>}
                </div>
                <div className="rounded-2xl bg-sun-100/60 p-3">
                  <p className="text-[11px] font-bold text-[#a56a08]">待探索的问题</p>
                  <ul className="mt-1 space-y-1 text-[11px] text-ink/80">
                    {session.report.openQuestions.map((q) => <li key={q}>· {q}</li>)}</ul>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip tone="brand">用上短引用 {session.report.newExpressions.length} 条</Chip>
                <Chip tone="mint">讨论 {session.turns} 轮</Chip>
              </div>

              {/* [新增] 观后生词一键加入词场队列（origin='video'，不计当日新词上限） */}
              {session.report.newExpressions.length > 0 && (
                <div className="mt-3 rounded-2xl bg-white/70 p-3">
                  <p className="text-[11px] font-bold text-ink">把本场关键词顺手放进词场</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted">从短引用里抽出的实词；加入后走词场的艾宾浩斯阶梯，但不占每日新词额度。</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...new Set(session.report.newExpressions
                      .flatMap((ex) => ex.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []))]
                      .slice(0, 8)
                      .map((w) => (
                        <button key={w} type="button"
                          onClick={() => {
                            enqueueWordFromContext({ data, update, notify }, w, 'video', '')
                            /** [成长系统] 与阅读入队共用 0 XP 标记事件，凑齐两条路径点亮广度成就 */
                            awardXp({
                              id: `wordlab:external:video:${w.toLowerCase()}`,
                              source: 'wordlab', action: 'external_word_enqueued', amount: 0, meta: { internal: true },
                            })
                          }}
                          className="rounded-xl bg-brand-50 px-2.5 py-1.5 text-[11px] font-bold text-brand-700 hover:bg-brand-100">
                          + {w}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              <button type="button" onClick={() => navigate('cultureReview')} className="btn-ghost mt-3 w-full !py-2 !text-xs">
                去文化复习看看 <Icon name="right" size={13} />
              </button>
            </Card>
          )}

          {/* 输入台 */}
          <div className="sticky bottom-[84px] z-20 space-y-2 rounded-3xl border border-white/80 bg-white/95 p-3 shadow-float backdrop-blur">
            <div className="hide-scroll flex gap-2 overflow-x-auto pb-0.5">
              {([
                'In the video, I noticed ...',
                'I think that because ...',
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
                rows={2} placeholder="先说一个你在视频里看到/听到的具体细节，再讲讲你的看法…（也可用中文）"
                disabled={Boolean(session?.finishedAt)}
                className="field en-text max-h-28 min-h-[52px] flex-1 resize-none !py-2.5 text-sm" />
              <button type="button" onClick={() => send()} disabled={sending || ending || !text.trim() || Boolean(session?.finishedAt)}
                className="btn-primary !h-[52px] !w-[52px] !rounded-2xl !px-0" aria-label="发送观后讨论发言">
                <Icon name="send" size={19} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <IconButton icon="play" label="回视频找细节" onClick={locateDetail} />
                <IconButton icon="speaker" label="朗读上一句" onClick={() => lastAi && speak(lastAi.text, data.settings)} />
                <IconButton icon="flag" label="结束讨论并生成小结"
                  onClick={() => setConfirmEnd(true)} disabled={Boolean(session?.finishedAt) || (session?.turns || 0) < 1} />
              </div>
              <span className="text-right text-[10px] leading-tight text-muted">
                🎬 回视频找细节 · 💬 至少 4 轮<br />引导者只追问，不给标准解读
              </span>
            </div>
          </div>
        </>
      )}

      <CultureSection title="观后讨论与另外两条路的区别" subtitle="三条路并列，各有独立 Agent，互不替代。">
        <Card>
          <div className="grid gap-2 text-[11px] leading-relaxed sm:grid-cols-3">
            <div className="rounded-2xl bg-brand-50/70 p-3">
              <p className="font-bold text-brand-600">角色对话</p>
              <p className="mt-1 text-ink/75">情景模拟 + 语法纠错；AI 扮演角色。</p>
            </div>
            <div className="rounded-2xl bg-mint-100/60 p-3">
              <p className="font-bold text-mint-600">文学研讨</p>
              <p className="mt-1 text-ink/75">文本细读 + 原文证据；AI 是文学引导者。</p>
            </div>
            <div className="rounded-2xl bg-coral-100/60 p-3">
              <p className="font-bold text-coral-600">观后讨论</p>
              <p className="mt-1 text-ink/75">视听材料 + 具体细节回忆；AI 追问「你看到/听到了什么」。</p>
            </div>
          </div>
        </Card>
      </CultureSection>

      <Modal open={confirmEnd} title="现在收尾这场观后讨论吗？"
        desc="引导者会整理你表达的观点与待探索的问题，把语言改写写入错题本、用上的短引用写入复习队列。这场讨论记录会保留。"
        confirmText="结束并生成小结" cancelText="再聊两轮" onClose={() => setConfirmEnd(false)}
        onConfirm={() => { setConfirmEnd(false); if (session) { const s = session; setEnding(true); window.setTimeout(() => finalize(s), 300) } }} />
    </div>
  )
}
