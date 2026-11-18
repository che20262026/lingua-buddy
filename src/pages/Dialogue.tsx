import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { generateDialogue, mockGenerateDialogue, wasLastDialogueLive } from '../services/dialogueDirector'
/** [打字机] 真实 AI 回复逐字上屏；Mock / 历史消息仍显示全文 */
import { TypewriterText } from '../components/TypewriterText'
/** [对话 UI 状态] 思考骨架屏 + 失败友好卡片（纯 UI，不触碰请求链路） */
import { ThinkingSkeleton } from '../components/ThinkingSkeleton'
import { AiErrorCard } from '../components/AiErrorCard'
import { VoiceSupportDialog, type VoiceNotice } from '../components/VoiceSupportDialog'
/** [移动端兼容] UA / 安全上下文 / 手势内直接开麦的统一判断 */
import { detectVoiceEnvironment, unsupportedVoiceMessage } from '../lib/mobileVoice'
import {
  clearAiError, codeFromStatus, getAiError, observeChatHttpStatus, reportAiError, subscribeAiError,
  type AiErrorState,
} from '../components/aiErrorChannel'
/** 只读探测：用于判断「本该走真实 AI 却回退了 Mock」，不发起新请求逻辑 */
import { probeAiMode } from '../services/aiStatus'
/** [AI 错误信号] 取走服务层投递的状态码与中文提示，翻译成对话气泡里的系统提示 */
import { takeAiErrorSignal } from '../services/aiErrorSignal'
import { coachSession } from '../services/coach'
import {
  copyPageLink, describeSpeechSupport, openInNewTab, pageLink, speak,
  startListening, startRecordingWithTranscript, stopSpeaking,
  type CaptureHandle, type ListeningHandle,
} from '../lib/speech'
import { isAsrConfigured, transcribeAudio } from '../services/transcriber'
import { cn, uid } from '../lib/utils'
import { getIeltsLevel } from '../data/ieltsLevels'
import type { ChatMessage, Mistake, ReviewItem, Session, VoiceAssessment } from '../types'
import {
  assessRecording, assessVoice, summarizeVoice, transcriptMetrics, trimVoiceReports,
  type VoiceAssessInput,
} from '../services/voiceAssessor'
import { IeltsBandChip } from '../components/IeltsBits'
import { VoiceAssessmentCard, VoiceSummaryCard } from '../components/VoiceFeedback'
import { Avatar, Card, Chip, EmptyState, Icon, IconButton, Modal, ProgressBar, SectionTitle, Toggle } from '../components/ui'
/** [修改点] FeedbackCard 原样抽取为共享组件，本页 UI 与逻辑零变化 */
import { FeedbackCard } from '../components/FeedbackCard'
/** [成长系统] 所有 XP 发放统一走 awardXp(event)，金额取自规则表 */
import { XP_RULES } from '../growthTypes'
/** [对话语音层] 音色面板 + 角色音色绑定 */
import { VoicePanel } from '../components/VoicePanel'
import { CharacterVoiceList } from '../components/CharacterVoiceBinding'
/** [对话语音层] useSpeech 封装：真实音色加载、按句朗读、TTS 与语音输入互斥 */
import { useSpeech } from '../hooks/useSpeech'
/** [React 最佳实践] 页面卸载时取消在途 /api/chat 请求，避免 await 之后写 state */
import { useAbortableRequest } from '../hooks/useAbortableRequest'
/** [对话语音层] 等级 → 语言参数（句数上限是硬约束） */
import { buildLevelProfile } from '../voiceTypes'
/** [CEFR 等级层] 对话模块的生效等级（跳级 / 留级后立即生效） */
import { activeLevel } from '../services/levelFilter'
import { LevelPanel } from '../components/LevelPanel'
/** [对话语音层] 写入偏好（偏好键与 settings 原子同步） */
import { applyAutoRead, applyAutoVoiceAssignment } from '../services/voicePreferences'
import { characterVoiceKey } from '../voiceTypes'

export function Dialogue() {
  const app = useApp()
  const { data, params, navigate, update, notify, awardXp } = app
  const { nextSignal, isMounted } = useAbortableRequest()
  const session = data.sessions.find((s) => s.id === params.sessionId) || data.sessions.find((s) => !s.finishedAt) || data.sessions[0]
  const scenarioId = params.scenarioId || session?.scenarioId
  const analysis = data.texts.find((t) => t.id === params.analysisId)
    || data.texts.find((t) => t.scenarios.some((s) => s.id === scenarioId))
    || data.texts[0]
  const scenario = analysis?.scenarios.find((s) => s.id === scenarioId)
    || data.scenarios.find((s) => s.id === scenarioId)

  const [text, setText] = useState('')
  /** [打字机] 只为「刚刚从真实 AI 返回的那一条」消息播放动画，历史消息不重播 */
  const [typingId, setTypingId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  /** [对话 UI 状态] 当前需要展示的 AI 请求错误；null = 无错误或用户已处理 */
  const [aiError, setAiError] = useState<AiErrorState | null>(null)
  const [retrying, setRetrying] = useState(false)
  /** 本轮发送起始时间：只接受本轮产生的错误，避免历史请求误报 */
  const roundStartRef = useRef(0)
  /** 上一轮用户输入，供「重试」复用 send()，不新增任何请求逻辑 */
  const lastInputRef = useRef('')
  const [ending, setEnding] = useState(false)
  const [hints, setHints] = useState<string[]>(scenario?.suggestedReplies.slice(0, 3) || [])
  const [showHints, setShowHints] = useState(false)
  const [showTranslation, setShowTranslation] = useState(data.settings.showTranslation)
  const [voiceMode, setVoiceMode] = useState<'idle' | 'listening' | 'recording'>('idle')
  const [voiceNote, setVoiceNote] = useState('')
  const [voiceInterim, setVoiceInterim] = useState('')
  const [voiceClip, setVoiceClip] = useState<{ url: string; durationMs: number } | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [needNewTab, setNeedNewTab] = useState(false)
  /** 自动转文字失败时把原因摊开，并给出重试 / 录音转写 / 补写三条路 */
  const [voiceFailure, setVoiceFailure] = useState<{ code: string; message: string } | null>(null)
  /** [移动端兼容] 不支持 / 权限被拒时弹窗，用户必须看到「还能打字」 */
  const [voiceNotice, setVoiceNotice] = useState<VoiceNotice | null>(null)
  const [showManualTranscript, setShowManualTranscript] = useState(false)
  const [manualDraft, setManualDraft] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  /** [对话语音层] 音色面板是否展开 */
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  /** [对话语音层] 录音期间收到的回复先挂起，录完再播；用户中途打字则放弃 */
  const pendingSpeakRef = useRef<{ id: string; speaker: string; text: string; characterId: string } | null>(null)
  /**
   * [TTS 修复] 自动朗读改成「绑定最新 AI 消息」的 effect，而不是塞在 send() 的 await 之后。
   * 旧写法在 AI 气泡尚未渲染进 DOM 时就调用 speak()，且音色往往还没加载完 → 静默无声。
   * 这里记录已朗读过的消息 id，避免进入页面时重复朗读历史气泡。
   */
  const autoSpokenIdRef = useRef<string | null>(null)
  const autoReadRef = useRef(data.voicePreferences.global.autoRead)
  autoReadRef.current = data.voicePreferences.global.autoRead
  const voiceModeRef = useRef(voiceMode)
  voiceModeRef.current = voiceMode
  const bottomRef = useRef<HTMLDivElement>(null)
  const listeningRef = useRef<ListeningHandle | null>(null)
  const captureRef = useRef<CaptureHandle | null>(null)
  const clipUrlRef = useRef<string | null>(null)
  const clipBlobRef = useRef<Blob | null>(null)
  // 每次语音动作领一个 epoch：旧会话迟到的回调不得改写新会话的状态
  const epochRef = useRef(0)
  // finalize 可能在 setTimeout 里执行，用 ref 取最新的语音记录，避免闭包快照漏掉刚录的一段
  const dataRef = useRef(data)
  dataRef.current = data
  const textRef = useRef(text)
  textRef.current = text
  const support = describeSpeechSupport()
  /** [对话语音层] 真实音色加载 + 按句朗读 + 互斥 */
  const speech = useSpeech()
  /** [TTS 修复] 用 ref 固定最新 speak，避免 effect 依赖整个 speech 对象导致重复触发 */
  const speakRef = useRef(speech.speak)
  speakRef.current = speech.speak
  useEffect(() => {
    const latest = [...(session?.messages || [])].reverse().find((m) => m.role === 'ai')
    if (!latest) return
    if (autoSpokenIdRef.current === null) {
      // 首次进入 / 刷新：只建立基线，绝不朗读历史消息
      autoSpokenIdRef.current = latest.id
      return
    }
    if (autoSpokenIdRef.current === latest.id) return
    autoSpokenIdRef.current = latest.id
    if (!autoReadRef.current) return

    const characterId = scenario?.characters.find((c) => c.name === latest.speaker)?.id || ''
    const payload = { id: latest.id, speaker: latest.speaker, text: latest.text, characterId }
    // [TTS 修复·关键行] 双 rAF 保证 AI 气泡已进 DOM 并完成渲染，再触发 speak()
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const bubble = document.querySelector(`[data-testid="ai-bubble-${latest.id}"]`)
        if (!bubble) return  // DOM 未就绪则放弃；手动「重播」按钮仍可用
        if (voiceModeRef.current !== 'idle') {
          pendingSpeakRef.current = payload  // 正在录音 → 挂起，由 flushPendingSpeak 补播
          return
        }
        speakRef.current(latest.text, {
          id: latest.id, speaker: latest.speaker,
          sceneId: scenario?.id, characterId,
        })
      })
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [session?.messages, session?.id, scenario?.id])
  /** [对话语音层] 对话模块的生效等级（perModule.dialogue 优先，回落全局 active） */
  const dialogueLevel = activeLevel(data.levelPreference, 'dialogue')
  const levelProfile = buildLevelProfile(dialogueLevel)
  /** [对话语音层] 等级跳变提示：只提示一次，不打断对话 */
  const lastLevelRef = useRef(dialogueLevel)
  useEffect(() => {
    if (lastLevelRef.current === dialogueLevel) return
    lastLevelRef.current = dialogueLevel
    notify(`已切换到 ${dialogueLevel} 难度，后续回复会相应调整。`)
  }, [dialogueLevel, notify])

  useEffect(() => {
    // 部分嵌入式环境未实现 scrollIntoView，做降级保护
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [session?.messages.length, sending])

  /**
   * [对话 UI 状态] 订阅错误通道 + 只读观察 /api/chat 的 HTTP 状态码。
   * 这里「不包裹 fetch、不改请求、不改降级」：PerformanceObserver 只读取浏览器
   * 已经记录好的 resource timing，用于把 401 / 429 / 500 等精确码送进 UI。
   * 组件卸载时 disconnect + unsubscribe，零残留、不写已卸载组件的 state。
   */
  useEffect(() => {
    /* 重新进入对话页不继承上一次的错误卡；通道是会话内内存态，不写 localStorage */
    clearAiError()
    const dispose = observeChatHttpStatus()
    const unsubscribe = subscribeAiError((next) => {
      if (!isMounted()) return
      if (!next) { setAiError(null); return }
      if (next.at >= roundStartRef.current) setAiError(next)
    })
    return () => { dispose(); unsubscribe() }
  }, [isMounted])

  // 离开页面 / 卸载时必须释放麦克风，否则浏览器录音指示灯会一直亮着
  useEffect(() => () => {
    try { listeningRef.current?.cancel() } catch { /* 忽略 */ }
    try { captureRef.current?.cancel() } catch { /* 忽略 */ }
    if (clipUrlRef.current) {
      try { URL.revokeObjectURL(clipUrlRef.current) } catch { /* jsdom 等环境未实现 */ }
    }
  }, [])

  if (!session || !scenario) {
    return (
      <div className="space-y-4">
        <EmptyState emblem="💬" title="还没有进行中的对话" desc="先挑一个场景和角色，AI 伙伴已经在等你了。" />
        <button type="button" onClick={() => navigate('home')} className="btn-primary w-full">去挑一个场景</button>
      </div>
    )
  }

  const me = scenario.characters.find((c) => c.id === session.userCharacterId) || scenario.characters[0]
  const others = scenario.characters.filter((c) => c.id !== me.id)
  const aiPool = others.length ? others : [me]
  /**
   * [对话语音层] 多角色场景默认一人一个音色：
   * 可用音色 ≥ 角色数时各自分配；不足时按顺序复用（UI 标注「与其他角色共用音色」）。
   * 用户手动指定过的角色不会被覆盖。
   */
  const autoAssignedRef = useRef('')
  useEffect(() => {
    const sceneKey = `${scenario.id}:${aiPool.map((c) => c.id).join(',')}`
    if (autoAssignedRef.current === sceneKey) return
    if (!speech.englishVoices.length || aiPool.length < 2) return
    const hasUnbound = aiPool.some((c) =>
      !data.voicePreferences.perCharacter[characterVoiceKey(scenario.id, c.id)]?.voiceURI)
    if (!hasUnbound) return
    autoAssignedRef.current = sceneKey
    applyAutoVoiceAssignment(app, scenario.id, aiPool.map((c) => c.id), speech.englishVoices)
  }, [scenario, aiPool, speech.englishVoices, data.voicePreferences, app])
  const activeAi = aiPool[session.turns % aiPool.length]
  const progress = Math.min(1, session.turns / Math.max(scenario.rounds, 1))
  const level = getIeltsLevel(data.settings.ieltsLevel)
  const replyOptions = session.turns === 0 ? scenario.suggestedReplies.slice(0, 3) : hints
  const myVoice = data.voiceReports
    .filter((v) => v.sessionId === session.id)
    .sort((a, b) => a.createdAt - b.createdAt)
  const voiceSummary = summarizeVoice(myVoice, level)
  const latestVoice = myVoice[myVoice.length - 1]

  /** 写入第 8 个存储键；裁剪上限避免 localStorage 膨胀 */
  const saveVoiceAssessment = (assessment: VoiceAssessment, quiet = false) => {
    update((prev) => ({ ...prev, voiceReports: trimVoiceReports([...prev.voiceReports, assessment]) }))
    if (!quiet) notify('发音点评已生成，展开下方的卡片看看语速与语调 🎙')
  }

  /** 一次发声的公共上下文（场景、轮次、目标档位） */
  const voiceContext = (source: VoiceAssessInput['source'], extra: Partial<VoiceAssessInput> = {}): VoiceAssessInput => ({
    level, source,
    targetWords: scenario.targetWords,
    sessionId: session.id, turn: session.turns, scenarioTitle: scenario.title,
    ...extra,
  })

  const toggleTranslation = (v: boolean) => {
    setShowTranslation(v)
    update((prev) => ({ ...prev, settings: { ...prev.settings, showTranslation: v } }))
  }

  /** 结束对话：CoachAgent 出报告、写错题本与间隔重复队列、发 XP */
  const finalize = (finalSession: Session) => {
    const { report, reviewItems } = coachSession({
      session: finalSession, scenario, analysis, settings: data.settings,
      voiceReports: dataRef.current.voiceReports,
    })
    const now = Date.now()
    const newMistakes: Mistake[] = finalSession.mistakes.map((m) => {
      const [original, corrected] = m.split(' → ')
      return {
        id: uid('mis'), original: original || m, corrected: corrected || '（见推荐改写）',
        type: '表达改写', note: `来自场景「${scenario.title}」`, sessionId: finalSession.id,
        createdAt: now, mastered: false,
      }
    })
    update((prev) => {
      const queue: ReviewItem[] = [...prev.reviewQueue]
      for (const item of reviewItems) {
        const idx = queue.findIndex((q) => q.content.trim().toLowerCase() === item.content.trim().toLowerCase())
        if (idx >= 0) queue[idx] = { ...queue[idx], dueAt: now, example: item.example }
        else queue.push(item)
      }
      return {
        ...prev,
        sessions: prev.sessions.map((s) => s.id === finalSession.id
          ? { ...finalSession, report, finishedAt: now } : s),
        mistakes: [...newMistakes, ...prev.mistakes].slice(0, 120),
        reviewQueue: queue,
        profile: { ...prev.profile, totalSessions: prev.profile.totalSessions + 1 },
      }
    })
    /** [成长系统] 场景完成奖励：幂等键用 source:id，重进同一场景不重复发；旧 report.xp 仍作教练估算展示 */
    const userText = finalSession.messages.filter((m) => m.role === 'user').map((m) => m.text.toLowerCase()).join(' ')
    const phrases3 = scenario.targetPhrases.filter((p) => p && userText.includes(p.toLowerCase())).length >= 3
    const finishResult = awardXp({
      id: `dialogue:scene:${scenario.id}:finish`,
      source: 'dialogue', action: 'scene_finish', amount: XP_RULES.scene_finish,
      meta: { scenarioId: scenario.id, flags: { phrases3 } },
    })
    notify(finishResult.granted
      ? `会话完成！场景奖励 +${finishResult.amount} XP，报告与复习卡片已生成 🎉`
      : '会话完成！本场景的完成奖励已领取过，报告与复习卡片已更新 🎉')
    navigate('report', { sessionId: finalSession.id, analysisId: analysis?.id, scenarioId: scenario.id })
  }

  const send = async (raw?: string) => {
    const value = (raw ?? text).trim()
    if (!value || sending || ending) return
    /** [对话 UI 状态] 新一轮开始：清掉上一轮错误卡、记录本轮时间与输入（纯 UI 状态） */
    roundStartRef.current = Date.now()
    lastInputRef.current = value
    clearAiError()
    setAiError(null)
    setRetrying(false)
    /** [React 最佳实践] 每轮对话独占一个 AbortSignal；卸载 / 下一轮发送都会取消上一次 */
    const signal = nextSignal()
    /**
     * [TTS 修复·关键行] 发送瞬间强制释放麦克风互斥锁。
     * 无论打字还是语音输入：此刻用户已明确「我说完了」。
     * SpeechRecognition 的 onend 在 iframe 权限 / network 中断 / 组件卸载等
     * 异常路径可能不触发，模块级 micActive 会永远卡在 true，把后续所有
     * 自动朗读静默吞掉。这里先 cancel() 再 forceRelease() 双保险。
     */
    try { listeningRef.current?.cancel() } catch { /* 忽略 */ }
    try { captureRef.current?.cancel() } catch { /* 忽略 */ }
    listeningRef.current = null
    captureRef.current = null
    speech.forceRelease()
    setVoiceMode('idle')
    setVoiceBusy(false)
    const base = session
    const aiChar = aiPool[base.turns % aiPool.length]
    const input = {
      summary: analysis?.summary || '', topic: analysis?.topic || scenario.title,
      scenario, userCharacter: me, aiCharacter: aiChar,
      targetWords: scenario.targetWords, targetPhrases: scenario.targetPhrases,
      history: base.messages, userInput: value,
      difficulty: data.settings.difficulty, correction: data.settings.correction,
      ieltsLevel: level,
      turn: base.turns,
      /** [China Learner Track] 仅微场景带此可选字段，旧场景为 undefined，反馈行为不变 */
      assessmentFocus: scenario.assessmentFocus,
      /** [对话语音层] 当前等级的语言参数：句数上限、句长、词汇范围、语用复杂度 */
      levelProfile,
      /** [React 最佳实践] 卸载时由服务层 abort 掉 /api/chat 的 fetch */
      signal,
    }
    const userMsg: ChatMessage = {
      id: uid('msg'), role: 'user', speaker: me.name, text: value, at: Date.now(),
    }
    setSending(true)
    setText('')
    setShowHints(false)
    update((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => s.id === base.id
        ? { ...s, messages: [...s.messages, userMsg] } : s),
    }))

    let output
    let liveReply = false
    try {
      output = await generateDialogue(input)
      /* 同步读取来源标记：真实 /api/chat 才启用打字机，Mock 与所有降级路径保持全文 */
      liveReply = wasLastDialogueLive()
    } catch (err) {
      /* 卸载 / 主动取消不是失败：不刷警告、不落 Mock、不写任何 state */
      if (!isMounted() || signal.aborted) return
      console.warn('[LinguaBuddy] 生成失败，使用本地兜底：', err)
      output = mockGenerateDialogue(input)
    }
    /* await 之后的唯一闸门：组件已卸载或请求被取消，整段后续渲染全部跳过 */
    if (!isMounted() || signal.aborted) return

    /**
     * [AI 错误信号] 服务层命中 401 / 429 / 500 等失败状态码时，已把状态码与
     * 服务端中文提示投递到只读信箱，这里取走并发布成 UI 错误卡。
     * 刻意放在下面「本该走真实 AI 却拿到 Mock」的判定之前：精确码不该被通用的 unknown 覆盖。
     * 本轮回复仍是本地 Mock（服务层已降级），所以练习不会中断，也不会白屏。
     */
    const errSignal = takeAiErrorSignal()
    if (errSignal) reportAiError(codeFromStatus(errSignal.status), errSignal.message, errSignal.status)

    /**
     * [对话 UI 状态] 服务层对 /api/chat 的所有失败都会静默回退 Mock，UI 拿不到 reject。
     * 这里只读地判断「探测显示本该走真实 AI，却拿到了 Mock」→ 发布一条 UI 错误；
     * 若 PerformanceObserver 已拿到精确码（401 / 429 / 500…）则保留，不用通用码覆盖。
     * probeAiMode 有 60s 缓存且服务层本轮已调用过，因此这里不产生额外网络请求，
     * 更不改变 generateDialogue 的调用、signal、降级结果与任何消息写入。
     */
    if (!liveReply) {
      const mode = await probeAiMode()
      /* 二次 await 后仍守闸门，避免组件卸载后写 state */
      if (!isMounted() || signal.aborted) return
      if (mode.mode === 'live' && !getAiError()) {
        reportAiError('unknown', '真实 AI 未返回本轮回复，已回退本地演示')
      }
    }

    const aiMsg: ChatMessage = {
      id: uid('msg'), role: 'ai', speaker: aiChar.name, text: output.reply,
      translation: output.translation, at: Date.now(),
    }
    /* 只对新气泡启动动画；下一条消息到来时上一条的 enabled 变 false，定时器自动清理 */
    setTypingId(liveReply ? aiMsg.id : null)
    const coachMsg: ChatMessage | null = output.stageSummary ? {
      id: uid('msg'), role: 'coach', speaker: 'Coach', text: output.stageSummary!, at: Date.now(),
    } : null

    const nextSession: Session = {
      ...base,
      messages: [
        ...base.messages,
        { ...userMsg, feedback: output.feedback },
        aiMsg,
        ...(coachMsg ? [coachMsg] : []),
      ],
      coveredWords: output.state.coveredWords,
      mistakes: output.state.mistakes,
      turns: base.turns + 1,
    }
    update((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => s.id === base.id ? nextSession : s),
    }))
    setHints(output.hints.length ? output.hints : scenario.suggestedReplies.slice(0, 3))
    /** [成长系统] 只给 Agent 判定的有效轮次发 XP；单场景 20 XP 上限按场景 ID 全时段聚合 */
    if (output.effective !== false) {
      const usedUnlearnedPhrase = (scenario.targetPhrases ?? []).some((p) => {
        const key = p.toLowerCase().trim()
        return key && value.toLowerCase().includes(key) && !data.wordProgress.words[key]
      })
      awardXp({
        id: `dialogue:${base.id}:turn:${base.turns + 1}`,
        source: 'dialogue', action: 'round_effective', amount: XP_RULES.round_effective,
        meta: { scenarioId: scenario.id, flags: { unusedPhrase: usedUnlearnedPhrase } },
      })
    }
    /**
     * [TTS 修复] 自动朗读已移到上方「绑定最新 AI 消息」的 useEffect：
     * 等气泡真正渲染进 DOM、且音色由 waitForVoices() 就绪后再发声。
     * 这里只保留结束对话的收尾，不再在 await 深处命令式调用 speak()。
     */
    setSending(false)
    if (output.end) {
      setEnding(true)
      window.setTimeout(() => finalize(nextSession), 900)
    }
  }

  /** 把识别到的文字追加进输入框，不覆盖用户已经打好的半句 */
  const appendToInput = (t: string) => {
    const clean = t.trim()
    if (!clean) return
    setText((prev) => prev.trim() ? `${prev.trim()} ${clean}` : clean)
  }

  /**
   * [对话语音层] 录音 / 听写结束后补播挂起的回复。
   * 若用户在这期间已经开始打字，则不再朗读（不打断用户）。
   */
  const flushPendingSpeak = () => {
    const pending = pendingSpeakRef.current
    if (!pending) return
    pendingSpeakRef.current = null
    speech.speak(pending.text, {
      id: pending.id, speaker: pending.speaker,
      sceneId: scenario.id, characterId: pending.characterId,
    })
  }

  const asrConfig = () => ({
    asrEndpoint: data.settings.asrEndpoint,
    asrKey: data.settings.asrKey,
    asrModel: data.settings.asrModel,
  })

  /**
   * 听写主路径：说完自动出字；失败时不再偷偷切到「只有录音没有文字」的模式，
   * 而是把原因和四条出路（重试 / 录音转写 / 补写 / 新标签页）全部摆出来。
   */
  const beginListening = async () => {
    const env = describeSpeechSupport()
    setVoiceFailure(null)
    setShowManualTranscript(false)
    setVoiceInterim('')
    setVoiceBusy(true)

    if (!env.canDoSomething) {
      setVoiceBusy(false)
      setVoiceMode('idle')
      setNeedNewTab(env.inIframe)
      setVoiceFailure({ code: 'unsupported', message: env.hint || '当前环境不支持语音。' })
      setVoiceNote('文本输入完全可用，练习不会中断；也可以在新标签页打开后重试语音。')
      return
    }
    // 浏览器没有自带听写：直接走「录音 + 可选 ASR + 补写」通道
    if (!env.recognition) {
      await beginCapture('当前浏览器没有自带语音识别服务。', { useBrowserRecognition: false })
      return
    }

    const epoch = ++epochRef.current
    setVoiceNote('录音中，请读完点击麦克风停止；中途停顿不会自动结束。')
    setVoiceMode('listening')
    const handle = startListening({
      accent: data.settings.accent,
      retries: 1,
      onInterim: (t) => { if (epoch === epochRef.current) setVoiceInterim(t) },
      onStatus: (m) => { if (epoch === epochRef.current) setVoiceNote(m) },
      onResult: (t, meta) => {
        if (epoch !== epochRef.current) return
        const clean = t.trim()
        if (!clean) return
        appendToInput(clean)
        setVoiceInterim('')
        setVoiceMode('idle')
        setVoiceBusy(false)
        // 听写只给文本与置信度：生成轻量点评，语调/清晰度明确标为「未测」
        saveVoiceAssessment(assessVoice(voiceContext('recognition', {
          features: transcriptMetrics(clean, meta.durationMs),
          transcript: clean,
          recognitionConfidence: meta.confidence || undefined,
        })), true)
        const retryHint = meta.retries ? '（服务中断后自动重试成功）' : ''
        setVoiceNote(meta.partial
          ? `已转成文字：「${clean}」——这段含浏览器未确认的片段，发送前请核对。${retryHint}`
          : `已转成文字：「${clean}」——确认后点发送，也可以先改一改。${retryHint}`)
        listeningRef.current = null
      },
      onError: (code, info) => {
        if (epoch !== epochRef.current) return
        listeningRef.current = null
        setVoiceMode('idle')
        setVoiceInterim('')
        setVoiceBusy(false)
        setVoiceFailure({ code, message: info.message })
        setNeedNewTab(info.action === 'new-tab' || env.inIframe)
        setVoiceNote(info.message)
      },
      onEnd: () => {
        if (epoch !== epochRef.current) return
        listeningRef.current = null
        setVoiceInterim('')
        setVoiceMode((m) => m === 'listening' ? 'idle' : m)
        setVoiceBusy(false)
        flushPendingSpeak()
      },
    })
    if (!handle) {
      setVoiceBusy(false)
      setVoiceMode('idle')
      setVoiceFailure({ code: 'start', message: '语音识别未能启动。' })
      setVoiceNote(env.recording
        ? '语音识别未能启动。可以点「录一段并转写」保留录音并尝试出字，或用文本输入继续。'
        : '语音识别未能启动，请用文本输入继续。')
    } else {
      listeningRef.current = handle
    }
  }

  /**
   * 双通道：MediaRecorder 留下音频，SpeechRecognition 并行出字；
   * 都没有文字时再问一次自定义 ASR 端点，最后还有「补写文字」兜底。
   */
  const beginCapture = async (reason: string, options: { useBrowserRecognition?: boolean } = {}) => {
    const env = describeSpeechSupport()
    if (!env.recording) {
      setVoiceBusy(false)
      setVoiceMode('idle')
      setNeedNewTab(env.inIframe)
      setVoiceFailure({ code: 'no-recorder', message: '当前环境不支持本地录音。' })
      setVoiceNote(`${reason} 当前环境也不支持本地录音；可以点「补写文字」用文本输入继续，或在新标签页打开。`)
      return
    }
    const epoch = ++epochRef.current
    setVoiceFailure(null)
    setVoiceInterim('')
    setVoiceBusy(true)
    setVoiceNote(`${reason} 正在准备麦克风…`)
    const cfg = asrConfig()

    const handle = await startRecordingWithTranscript({
      accent: data.settings.accent,
      useBrowserRecognition: options.useBrowserRecognition ?? env.recognition,
      transcribe: isAsrConfigured(cfg) ? (blob) => transcribeAudio(blob, cfg, 'en') : undefined,
      onInterim: (t) => { if (epoch === epochRef.current) setVoiceInterim(t) },
      onStatus: (m) => { if (epoch === epochRef.current) setVoiceNote(m) },
      onDone: async ({ url, blob, durationMs, transcript, transcriptPartial, transcriptNote }) => {
        if (epoch !== epochRef.current) return
        if (clipUrlRef.current) {
          try { URL.revokeObjectURL(clipUrlRef.current) } catch { /* 忽略 */ }
        }
        clipUrlRef.current = url
        clipBlobRef.current = blob
        setVoiceClip({ url, durationMs })
        setVoiceInterim('')
        setVoiceMode('idle')
        setVoiceBusy(false)
        captureRef.current = null
        const clean = transcript.trim()
        const fallbackText = textRef.current.trim()
        setVoiceNote(`${reason} 已保存 ${(durationMs / 1000).toFixed(1)} 秒录音，正在分析声学特征…`)

        // 真实音频优先；不支持 Web Audio 时退化为「时长 + 文本」简版点评
        const measured = await assessRecording(blob, voiceContext('recording', {
          transcript: clean || fallbackText || undefined,
        }))
        if (measured) {
          saveVoiceAssessment(measured, true)
        } else {
          saveVoiceAssessment(assessVoice(voiceContext('recording', {
            features: transcriptMetrics(clean || fallbackText, durationMs),
            transcript: clean || fallbackText || undefined,
          })), true)
        }
        if (clean) {
          appendToInput(clean)
          setVoiceNote(`✅ 已转成文字：「${clean}」${transcriptPartial ? '（含未确认片段，请核对）' : ''}。${transcriptNote}；确认后点发送，发音点评也一起生成了。`)
        } else {
          setShowManualTranscript(true)
          setVoiceFailure({ code: 'no-transcript', message: transcriptNote })
          setVoiceNote(`录音已保存 ${(durationMs / 1000).toFixed(1)} 秒，但这次没拿到文字：${transcriptNote}。可以点「补写文字」把刚说的英文填进来，或「重试听写」再来一次。`)
        }
        flushPendingSpeak()
      },
      onError: (message) => {
        if (epoch !== epochRef.current) return
        captureRef.current = null
        setVoiceMode('idle')
        setVoiceBusy(false)
        setNeedNewTab(env.inIframe)
        setShowManualTranscript(true)
        setVoiceFailure({ code: 'record-error', message })
        setVoiceNote(`${reason} ${message} 可以直接补写文字，练习不会中断。`)
      },
    })
    if (!handle) {
      setVoiceBusy(false)
      setVoiceMode('idle')
      return
    }
    captureRef.current = handle
    setVoiceMode('recording')
    setVoiceNote(`${reason} 录音中，请读完点击麦克风停止，再提交转写和发音点评。`)
  }

  /** 补写：把系统输入法听写 / 手动打出的英文送进本轮回答，并补进语音记录 */
  const applyManualTranscript = () => {
    const clean = manualDraft.trim()
    if (!clean) { notify('先写一句刚才说的英文，再点「用作本轮回答」'); return }
    appendToInput(clean)
    const last = dataRef.current.voiceReports[dataRef.current.voiceReports.length - 1]
    if (last && last.source === 'recording' && last.sessionId === session.id) {
      update((prev) => ({
        ...prev,
        voiceReports: prev.voiceReports.map((v) => v.id === last.id ? { ...v, transcript: clean } : v),
      }))
    }
    setManualDraft('')
    setShowManualTranscript(false)
    setVoiceFailure(null)
    setVoiceNote(`已把「${clean}」放进输入框，确认后点发送即可。发音点评基于录音本身，不受文字补写影响。`)
  }

  /** 用自定义 ASR 端点重试刚录下的那一段 */
  const retryAsr = async () => {
    const blob = clipBlobRef.current
    const cfg = asrConfig()
    if (!blob || !isAsrConfigured(cfg)) { notify('先录一段，并在设置里配置转写服务'); return }
    setVoiceBusy(true)
    setVoiceNote('正在用转写服务把刚才的录音变成文字…')
    const result = await transcribeAudio(blob, cfg, 'en')
    setVoiceBusy(false)
    if (result.text) {
      setManualDraft(result.text)
      setVoiceNote(`转写成功：「${result.text}」——确认后点「用作本轮回答」。`)
    } else {
      setVoiceNote(`${result.error || '转写失败'}。可以直接补写文字，练习不会中断。`)
    }
  }

  /**
   * 麦克风状态机：听写 → （失败）明确诊断 + 重试/录音转写/补写 → 文本输入。
   * 环境在点击时重新判断，避免「页面打开时可用、后来被权限策略拦掉」的误判。
   */
  const toggleVoice = () => {
    if (voiceMode === 'recording') {
      captureRef.current?.stop()
      captureRef.current = null
      return
    }
    if (voiceMode === 'listening') {
      // stop() 会 flush 最后一句，绝不 abort() 丢字
      listeningRef.current?.stop()
      listeningRef.current = null
      return
    }
    if (voiceBusy) return

    // [对话语音层] 互斥第一道闸门：开始录音前先掐断正在播放的朗读
    const wasSpeaking = Boolean(speech.speakingId)
    speech.stop()
    pendingSpeakRef.current = null
    stopSpeaking() // 先停朗读，避免 AI 的声音被录进去
    setVoiceNote(wasSpeaking ? '已停止朗读，可以开始说话。' : '')
    setVoiceInterim('')
    setNeedNewTab(false)
    setVoiceNotice(null)

    /* 【移动端关键修复】所有决定都在点击的同步上下文里完成：
       不能先 await 再 getUserMedia，否则 iOS / WebView 判定手势已过期。 */
    const mobile = detectVoiceEnvironment()
    const envHere = describeSpeechSupport()
    if (!mobile.secureContext || (!mobile.canUseMicrophone && !envHere.recognition && !envHere.recording)) {
      const message = unsupportedVoiceMessage(mobile)
      setVoiceMode('idle')
      setVoiceBusy(false)
      setVoiceFailure({ code: 'unsupported', message })
      setVoiceNote(message)
      setNeedNewTab(mobile.inIframe || !mobile.secureContext)
      setVoiceNotice({
        title: '语音暂不可用',
        message,
        showNewTab: mobile.inIframe || !mobile.secureContext,
      })
      return
    }
    if (mobile.preferDirectRecording) {
      /* iOS / Android / 微信 / TWA：直接本地录音 + 服务端转写，绕开云端识别 */
      void beginCapture('移动端已切到本地录音转写：', { useBrowserRecognition: false })
      return
    }

    void beginListening()
  }

  /** 主动发音评测：绕开听写，直接录一段音频做声学分析（顺带尝试出字） */
  const startVoiceAssessment = () => {
    if (voiceMode !== 'idle') { void toggleVoice(); return }
    if (voiceBusy || !support.recording) {
      if (!support.recording) notify('当前环境不支持本地录音，请在新标签页用 Chrome / Edge 打开。')
      return
    }
    stopSpeaking()
    void beginCapture('发音评测：说一句英文，说完点一下麦克风就能出点评。')
  }

  const lastAi = [...session.messages].reverse().find((m) => m.role === 'ai')

  return (
    <div className="animate-in space-y-4">
      {/* [CEFR 等级层] 等级标签：跳级 / 留级后，下一轮回复立即按新等级说话 */}
      <LevelPanel module="dialogue" />

      {/* 场景状态条 */}
      <Card className="!p-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('scenario', { analysisId: analysis?.id, scenarioId: scenario.id })}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-label="返回场景详情">
            <Icon name="left" size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-ink">{scenario.emblem} {scenario.title}</p>
            <p className="truncate text-[11px] text-muted">你扮演 {me.name} · AI 出演 {aiPool.map((c) => c.name).join(' / ')}</p>
          </div>
          <button type="button" onClick={() => setConfirmEnd(true)}
            className="rounded-xl border border-coral-100 px-2.5 py-1.5 text-[11px] font-bold text-coral-600 hover:bg-coral-100">结束</button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Avatar name={activeAi.name} size={32} tone="coral" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-ink">本场目标：{scenario.goal}</p>
            <ProgressBar value={progress} className="mt-1.5" />
          </div>
          <span className="shrink-0 text-[11px] font-bold text-brand-600">{session.turns}/{scenario.rounds} 轮</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-muted">已覆盖</span>
          {session.coveredWords.length ? session.coveredWords.map((w) => (
            <Chip key={w} tone="mint" className="en-text !px-2 !py-0.5"><Icon name="check" size={11} />{w}</Chip>
          )) : <span className="text-[11px] text-muted">还没有，试着用一个目标词吧</span>}
          <span className="ml-auto text-[10px] font-semibold text-muted">{session.coveredWords.length}/{scenario.targetWords.length} 词</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-brand-50 pt-3">
          <IeltsBandChip level={level} />
          <span className="text-[10px] font-semibold text-muted">本档重点：{level.focus[0]}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-brand-50 pt-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"><Icon name="text" size={14} />显示中文大意</span>
          <Toggle checked={showTranslation} onChange={toggleTranslation} label="显示翻译" />
        </div>

        {/* [对话语音层] 扬声器开关 + 音色入口 */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-brand-50 pt-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <Icon name="speaker" size={14} />自动朗读 AI 回复
          </span>
          <div className="flex items-center gap-1.5">
            {speech.supported && (
              <Toggle
                checked={data.voicePreferences.global.autoRead}
                onChange={(v) => applyAutoRead(app, v)}
                label="自动朗读 AI 回复"
              />
            )}
            {speech.supported && (
              <button type="button"
                onClick={() => setVoicePanelOpen((v) => !v)}
                aria-label="音色设置"
                data-testid="voice-panel-toggle"
                className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition ${
                  voicePanelOpen ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>
                音色
              </button>
            )}
          </div>
        </div>
        {!speech.supported && (
          <p data-testid="voice-unsupported" className="mt-1.5 text-[10px] leading-relaxed text-muted">
            当前浏览器不支持语音合成，朗读控件已隐藏；文字对话完全不受影响。
          </p>
        )}
        {speech.supported && voicePanelOpen && (
          <>
            <VoicePanel
              voices={speech.voices}
              state={speech.state}
              supported={speech.supported}
              onAudition={speech.audition}
              onClose={() => setVoicePanelOpen(false)}
            />
            <div className="mt-2">
              <CharacterVoiceList
                sceneId={scenario.id}
                characters={aiPool.map((c) => ({ id: c.id, name: c.name, role: c.role }))}
                voices={speech.englishVoices}
                accent={data.voicePreferences.global.accent}
                globalVoiceURI={data.voicePreferences.global.voiceURI}
              />
            </div>
          </>
        )}
      </Card>

      {/* 消息流 */}
      <div className="space-y-4 px-0.5 pb-2">
        {session.messages.map((m, i) => {
          if (m.role === 'coach') {
            return (
              <div key={m.id} className="mx-auto max-w-[92%] animate-in rounded-2xl border border-mint-400/30 bg-mint-100/70 px-4 py-3 text-center">
                <p className="text-[10px] font-bold tracking-widest text-mint-600">COACH · 阶段小结</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/80">{m.text}</p>
              </div>
            )
          }
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex animate-in flex-col items-end" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
                <div className="mb-1 flex items-center gap-1.5 pr-1 text-[10px] font-bold text-muted">{me.name} · 你</div>
                <div className="bubble-me relative max-w-[86%] rounded-3xl rounded-tr-lg bg-brand-500 px-4 py-3 text-white shadow-card">
                  <p className="en-text text-[15px] leading-relaxed">{m.text}</p>
                </div>
                {m.feedback && <div className="w-[86%]"><FeedbackCard feedback={m.feedback} /></div>}
              </div>
            )
          }
          const speaker = scenario.characters.find((c) => c.name === m.speaker)
          const tone = (['coral', 'mint', 'sun'] as const)[scenario.characters.findIndex((c) => c.name === m.speaker) % 3] || 'brand'
          const speaking = speech.speakingId === m.id
          return (
            <div key={m.id} className="flex animate-in items-start gap-2.5" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
              <Avatar name={m.speaker} size={34} tone={tone} />
              <div className="min-w-0 max-w-[82%] flex-1">
                <p className="mb-1 text-[10px] font-bold text-muted">{m.speaker}{speaker ? ` · ${speaker.role}` : ''}</p>
                <div
                  data-testid={`ai-bubble-${m.id}`}
                  className={cn('bubble-ai relative rounded-3xl rounded-tl-lg border bg-white px-4 py-3 shadow-card transition',
                    speaking ? 'border-brand-400 ring-2 ring-brand-200' : 'border-brand-50')}>
                  <p className="en-text text-[15px] leading-relaxed text-ink">
                    <TypewriterText text={m.text} enabled={typingId === m.id} testId={`typewriter-${m.id}`} />
                  </p>
                  {speaking && (
                    <span data-testid="speaking-wave" className="absolute -top-2 right-3 flex items-end gap-0.5 rounded-full bg-brand-500 px-2 py-1">
                      {[0, 1, 2].map((k) => (
                        <span key={k} className="h-1 w-1 animate-bounce rounded-full bg-white" style={{ animationDelay: `${k * 120}ms` }} />
                      ))}
                    </span>
                  )}
                  <div className="mt-2 flex items-center gap-3 border-t border-brand-50 pt-2">
                    {speech.supported ? (
                      <>
                        <button type="button" onClick={() => speech.speak(m.text, {
                          id: m.id, speaker: m.speaker,
                          sceneId: scenario.id,
                          characterId: speaker?.id,
                        })}
                          data-testid={`replay-${m.id}`}
                          className="flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:underline">
                          <Icon name="speaker" size={13} />重播
                        </button>
                        {speaking && (
                          <button type="button" onClick={() => speech.stop()}
                            data-testid={`stop-${m.id}`}
                            className="flex items-center gap-1 text-[11px] font-bold text-coral-600 hover:underline">
                            <Icon name="close" size={12} />停止
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] font-semibold text-muted">当前设备不支持朗读</span>
                    )}
                    {showTranslation && m.translation && (
                      <details className="min-w-0 flex-1 text-right">
                        <summary className="text-[11px] font-semibold text-muted">中文大意 ▾</summary>
                        <p className="mt-1.5 text-left text-[11px] leading-relaxed text-muted">{m.translation}</p>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {/* [对话 UI 状态] 思考中：灰白骨架屏取代原来的空白等待 */}
        {sending && <ThinkingSkeleton speaker={activeAi.name} />}
        {/* [对话 UI 状态] 真实 AI 失败：友好卡片 + 重试，与 Mock 回复并存，练习不中断 */}
        {!sending && aiError && (
          <AiErrorCard
            code={aiError.code}
            detail={aiError.detail}
            retrying={retrying}
            onRetry={() => {
              clearAiError()
              setAiError(null)
              setRetrying(true)
              void send(lastInputRef.current)
            }}
            onDismiss={() => {
              clearAiError()
              setAiError(null)
            }}
          />
        )}
        <div ref={bottomRef} />
      </div>

      {/* 本场发音评测：默认折叠，不打断对话沉浸 */}
      {myVoice.length > 0 && (
        <section className="space-y-2">
          <SectionTitle title="本场发音评测" subtitle="基于真实录音的声学特征，练习参考分而非官方评分。"
            right={<Chip tone="brand">{myVoice.length} 段</Chip>} />
          {voiceSummary && voiceSummary.count >= 2 && (
            <VoiceSummaryCard summary={voiceSummary} level={level} compact title="本场发音趋势" />
          )}
          {latestVoice && (
            <VoiceAssessmentCard
              key={latestVoice.id}
              assessment={latestVoice}
              level={level}
              title={`第 ${(latestVoice.turn ?? 0) + 1} 轮`}
              onRemove={() => update((prev) => ({
                ...prev, voiceReports: prev.voiceReports.filter((v) => v.id !== latestVoice.id),
              }))} />
          )}
        </section>
      )}

      {/* 输入台 */}
      <div className="sticky bottom-[84px] z-20 space-y-2 rounded-3xl border border-white/80 bg-white/95 p-3 shadow-float backdrop-blur">
        {/* [对话语音层] 朗读中状态条：固定在输入框上方，与录音状态互斥、绝不重叠 */}
        {speech.speakingId && voiceMode === 'idle' && (
          <div data-testid="speaking-bar" role="status" aria-live="polite"
            className="animate-in rounded-2xl border border-brand-200 bg-brand-50/85 p-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
                <Icon name="speaker" size={14} />
              </span>
              <p className="min-w-0 flex-1 text-[11px] font-bold text-ink">
                🔊 正在朗读 {speech.speakingSpeaker} 的回复
                {speech.demoMode ? '（演示模式）' : ''}
                {speech.sentenceTotal > 0 ? ` · 第 ${speech.sentenceIndex + 1}/${speech.sentenceTotal} 句` : ''}
              </p>
              <button type="button" onClick={() => speech.stop()}
                data-testid="speaking-stop"
                className="shrink-0 rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-bold text-coral-600 hover:bg-coral-100">
                停止
              </button>
            </div>
          </div>
        )}
        {/* [TTS 修复] 播放被浏览器拦截 / 麦克风假死：轻量提示，用户点一下即可在手势内重放 */}
        {speech.blocked && !speech.speakingId && voiceMode === 'idle' && (
          <div data-testid="speak-blocked" role="status" aria-live="polite"
            className="animate-in flex items-center gap-2 rounded-2xl border border-sun-200 bg-sun-100/70 p-2.5">
            <Icon name="speaker" size={14} />
            <p className="min-w-0 flex-1 text-[11px] font-bold leading-relaxed text-[#a56a08]">
              {speech.blocked.reason === 'mic-busy'
                ? '麦克风状态未释放，朗读被拦下了'
                : '浏览器拦住了自动播放，点一下就能听'}
            </p>
            <button type="button" data-testid="speak-resume" onClick={speech.resume}
              className="shrink-0 rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-bold text-brand-600 hover:bg-brand-50">
              点击播放
            </button>
            <button type="button" aria-label="忽略朗读提示" onClick={speech.dismissBlocked}
              className="shrink-0 rounded-xl px-1.5 py-1 text-[11px] font-bold text-muted hover:bg-white/70">
              ✕
            </button>
          </div>
        )}
        {(voiceMode !== 'idle' || voiceNote || voiceInterim || voiceClip) && !speech.speakingId && (
          <div className="animate-in rounded-2xl border border-brand-100 bg-brand-50/70 p-3" role="status" aria-live="polite">
            <div className="flex items-start gap-2.5">
              <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl',
                voiceMode === 'recording' ? 'bg-coral-100 text-coral-600' : 'bg-white text-brand-600')}>
                <Icon name={voiceMode === 'recording' ? 'mic' : 'headphones'} size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-ink">
                  {voiceMode === 'listening' ? '🎙 录音中，请读完点击麦克风停止…'
                    : voiceMode === 'recording' ? '⏺ 录音中，请读完点击麦克风停止…'
                      : voiceBusy ? '正在准备麦克风…' : '语音助手'}
                </p>
                {voiceInterim && <p className="en-text mt-1 text-xs font-semibold text-brand-600">实时：{voiceInterim}</p>}
                {voiceNote && <p className="mt-1 text-[11px] leading-relaxed text-muted">{voiceNote}</p>}
                {voiceFailure && (
                  <div className="mt-2 rounded-xl border border-sun-200 bg-white/90 p-2.5">
                    <p className="text-[11px] font-bold text-[#a56a08]">这次没能自动转成文字 · {voiceFailure.code}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">选一条路继续，练习不会中断：</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => { void beginListening() }}
                        className="rounded-xl bg-brand-500 px-2.5 py-1.5 text-[11px] font-bold text-white">重试听写</button>
                      <button type="button" onClick={() => { void beginCapture('改用录音转写：') }}
                        className="rounded-xl border border-brand-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-brand-600">录一段并转写</button>
                      <button type="button" onClick={() => setShowManualTranscript(true)}
                        className="rounded-xl border border-brand-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-brand-600">补写文字</button>
                    </div>
                  </div>
                )}
                {showManualTranscript && (
                  <div className="mt-2 rounded-xl border border-brand-100 bg-white/95 p-2.5">
                    <p className="text-[11px] font-bold text-ink">补写刚才说的英文</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted">可以直接粘贴手机 / 系统输入法的听写结果。</p>
                    <textarea value={manualDraft} data-manual-transcript="true"
                      onChange={(e) => setManualDraft(e.target.value)} rows={2}
                      placeholder="Type what you just said…"
                      className="field en-text mt-1.5 min-h-[48px] resize-none !py-2 text-xs" />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" onClick={applyManualTranscript}
                        className="rounded-xl bg-mint-500 px-2.5 py-1.5 text-[11px] font-bold text-white">用作本轮回答</button>
                      {clipBlobRef.current && isAsrConfigured(data.settings) && (
                        <button type="button" onClick={() => { void retryAsr() }}
                          className="rounded-xl border border-brand-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-brand-600">重新转写这段录音</button>
                      )}
                      <button type="button" onClick={() => { setShowManualTranscript(false); setManualDraft('') }}
                        className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-muted">取消</button>
                    </div>
                  </div>
                )}
                {needNewTab && (
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => {
                        if (!openInNewTab()) notify('浏览器拦截了新窗口，请复制下面的链接到新标签页打开')
                      }} className="rounded-xl bg-brand-500 px-3 py-1.5 text-[11px] font-bold text-white">
                        在新标签页打开
                      </button>
                      <button type="button" onClick={async () => {
                        notify(await copyPageLink() ? '链接已复制 ✅ 粘贴到新标签页即可' : '请手动复制下方链接')
                      }} className="rounded-xl border border-brand-200 bg-white px-3 py-1.5 text-[11px] font-bold text-brand-600">
                        复制页面链接
                      </button>
                    </div>
                    <p className="mt-1.5 break-all rounded-xl bg-white/70 px-2 py-1.5 text-[10px] text-muted">{pageLink()}</p>
                  </div>
                )}
                {voiceClip && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/85 p-2">
                    <audio controls src={voiceClip.url} className="h-8 w-full max-w-[240px]" aria-label="回放我的发音" />
                    <button type="button" aria-label="移除录音" onClick={() => {
                      if (clipUrlRef.current) {
                        try { URL.revokeObjectURL(clipUrlRef.current) } catch { /* 忽略 */ }
                      }
                      clipUrlRef.current = null
                      setVoiceClip(null)
                      setVoiceNote('')
                    }} className="shrink-0 text-muted hover:text-ink"><Icon name="close" size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {showHints && (
          <div className="animate-in rounded-2xl bg-sun-100/70 p-3">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-[#a56a08]"><Icon name="bulb" size={13} />可以这样接着说</p>
            <div className="space-y-1.5">
              {hints.map((h) => (
                <button key={h} type="button" onClick={() => { setText(h); setShowHints(false) }}
                  className="en-text block w-full rounded-xl bg-white/80 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-white">{h}</button>
              ))}
            </div>
          </div>
        )}

        <div className="hide-scroll flex gap-2 overflow-x-auto pb-0.5">
          {replyOptions.map((r) => (
            <button key={r} type="button" disabled={sending || ending} onClick={() => send(r)}
              className="en-text shrink-0 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50">
              {r}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea value={text} onChange={(e) => {
            // [对话语音层] 用户一开口就停朗读，并放弃挂起的自动朗读
            if (speech.speakingId) speech.stop()
            pendingSpeakRef.current = null
            // [TTS 修复] 用户已开始输入，不再保留「点击播放」提示
            if (speech.blocked) speech.dismissBlocked()
            setText(e.target.value)
          }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            rows={2} placeholder="Type in English… （也可以试试中文，Agent 会温柔引导你）"
            className="field en-text max-h-28 min-h-[52px] flex-1 resize-none !py-2.5 text-sm" />
          <button type="button" onClick={() => send()} disabled={sending || ending || !text.trim()}
            className="btn-primary !h-[52px] !w-[52px] !rounded-2xl !px-0" aria-label="发送">
            <Icon name="send" size={19} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5">
            <IconButton icon="mic"
              label={voiceMode === 'recording' || voiceMode === 'listening' ? '录音中，点击停止并提交' : '点击开始录音'}
              active={voiceMode !== 'idle'} onClick={() => { void toggleVoice() }}
              className={voiceMode === 'recording' ? 'pulse-ring relative !border-coral-500 !bg-coral-500 !text-white'
                : voiceMode === 'listening' ? 'pulse-ring relative' : ''} />
            <IconButton icon="headphones" label="发音评测：录一句并生成语速/停顿/语调点评"
              onClick={startVoiceAssessment} className={voiceMode === 'recording' ? 'pulse-ring relative' : ''} />
            <IconButton icon="bulb" label="提示" active={showHints} onClick={() => setShowHints(!showHints)} />
            {speech.supported && (
              <IconButton icon="speaker" label="重播上一句" onClick={() => {
                if (!lastAi) return
                const sp = scenario.characters.find((c) => c.name === lastAi.speaker)
                speech.speak(lastAi.text, { id: lastAi.id, speaker: lastAi.speaker, sceneId: scenario.id, characterId: sp?.id })
              }} />
            )}
            <IconButton icon="flag" label="结束对话并生成报告" onClick={() => setConfirmEnd(true)} />
          </div>
          <span className="text-right text-[10px] leading-tight text-muted">
            {voiceMode === 'listening' || voiceMode === 'recording'
              ? '录音中，请读完点击麦克风停止 · 停顿不会自动结束'
              : support.recognition ? '点麦克风开始录音，读完再点一次停止'
                : support.recording ? '录音转写 / 文本可用' : '语音不可用 · 文本输入已就绪'}
            <br />🎧 = 发音评测（语速/停顿/语调）
          </span>
        </div>
      </div>

      <Modal open={confirmEnd} title="现在就收尾吗？" danger confirmText="结束并生成报告" cancelText="再聊两轮"
        desc="教练会立刻整理会话报告，把新词与错题写进复习队列。已经说过的内容都会保留。"
        onClose={() => setConfirmEnd(false)} onConfirm={() => { setConfirmEnd(false); finalize(session) }} />

      {/* [移动端兼容] 语音不可用 / 权限被拒：明确弹窗并给出文字输入出路 */}
      {voiceNotice && (
        <VoiceSupportDialog notice={voiceNotice} onClose={() => setVoiceNotice(null)} />
      )}
    </div>
  )
}
