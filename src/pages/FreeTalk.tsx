import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/useAppStore'
import { FAT_FISH_CHARACTERS, findFatFishCharacter } from '../data/fatFishCharacters'
import { FAT_FISH_ACCENT_LABELS, type FatFishAccent, type FatFishId, type FreeTalkMessage, type FreeTalkSummary } from '../freetalkTypes'
import { sendFreeTalkTurn, summarizeFreeTalk, type FreeTalkFailure } from '../services/freetalk'
import { FatFishAvatar } from '../components/FatFishAvatar'
import { DesktopPet } from '../components/DesktopPet'
import { useFatFishVoice } from '../hooks/useFatFishVoice'
import { useDesktopPet } from '../hooks/useDesktopPet'
import { useVoiceDictation } from '../hooks/useVoiceDictation'
import { useAbortableRequest } from '../hooks/useAbortableRequest'
import { ThinkingSkeleton } from '../components/ThinkingSkeleton'
import { AiErrorCard } from '../components/AiErrorCard'
import { VoiceSupportDialog } from '../components/VoiceSupportDialog'
import type { AiErrorCode } from '../components/aiErrorChannel'
import { Icon } from '../components/ui'
import { cn, uid } from '../lib/utils'
import { todayKey } from '../lib/storage'
import { XP_RULES } from '../growthTypes'

/**
 * 大肥鱼自由对话
 * ------------------------------------------------------------------
 * 一个**脱离剧本**的闲聊沙盒：不走场景对话的五步闭环、不写词场草稿、
 * 不动复习队列，只有一条胖鱼陪你用英语瞎聊。
 *
 * 三条设计红线（与项目既有约定一致）：
 *   1. 人设由服务端锁死（System Prompt 在 netlify/functions/freetalk.ts 拼装），
 *      前端只负责「选哪条鱼、什么口音、聊了什么」；
 *   2. 朗读音色严格跟随口音（en-US / en-GB / en-AU），朗读时角色播放专属动作；
 *   3. 上游任何失败都不打断对话：本地演示大肥鱼顶上，同时给一张友好错误卡。
 */

/** 服务端失败分类 → UI 错误码（复用对话模块同一套文案） */
const FAILURE_TO_CODE: Record<FreeTalkFailure['reason'], AiErrorCode> = {
  'rate-limited': 429,
  invalid: 400,
  unavailable: 503,
  aborted: 'network',
}

const ACCENTS: FatFishAccent[] = ['en-US', 'en-GB', 'en-AU']

export function FreeTalk() {
  const { awardXp, notify } = useApp()
  const { nextSignal, isMounted } = useAbortableRequest()

  /** 当前角色 */
  const [characterId, setCharacterId] = useState<FatFishId>('elf')
  /** 当前口音：切换角色时回到该角色的默认口音 */
  const [accent, setAccent] = useState<FatFishAccent>('en-US')
  /** 对话记录（会话内内存态，不写 localStorage —— 这是个沙盒，不是学习记录） */
  const [messages, setMessages] = useState<FreeTalkMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [failure, setFailure] = useState<FreeTalkFailure | null>(null)
  const [summary, setSummary] = useState<{ data: FreeTalkSummary; live: boolean } | null>(null)
  const [retrying, setRetrying] = useState(false)
  /** [Desktop Pet] 悬浮宠物显隐：纯会话态，刷新后回到默认显示，不新增 localStorage 键 */
  const [petVisible, setPetVisible] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  /** 上一句用户输入，供「重试」复用 */
  const lastInputRef = useRef('')

  const character = findFatFishCharacter(characterId) ?? FAT_FISH_CHARACTERS[0]
  const voice = useFatFishVoice({ accent, rate: character.voice.rate, pitch: character.voice.pitch })

  /**
   * [Desktop Pet] 状态机只吃两个既有信号：
   *   sending / summarizing → thinking；voice.speakingKey → speaking。
   * 它不记第二份派生状态，也不跑定时器；happy 由组件内一次性态叠加。
   */
  const pet = useDesktopPet(character, {
    thinking: sending || summarizing,
    speaking: voice.speakingKey !== null,
  })

  /**
   * [语音输入] 听写层：识别文字追加进输入框，不自动发送。
   * onBeforeListen：开麦前掐断朗读（anim 态），避免胖鱼的声音被自己听回去；
   * 真正的 TTS/麦克风互斥由 lib/speech 的 micActive 闸门保证。
   */
  const dictation = useVoiceDictation({
    accent,
    onTranscript: (spoken) => setText((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken)),
    onBeforeListen: () => voice.stop(),
  })

  /** 主题变量：换角色时整页配色跟着换，组件代码一行不动 */
  const themeStyle = useMemo(() => ({
    '--ff-bg-from': character.theme.bgFrom,
    '--ff-bg-to': character.theme.bgTo,
    '--ff-accent': character.theme.accent,
    '--ff-accent-ink': character.theme.accentInk,
    '--ff-bubble': character.theme.bubble,
    '--ff-ring': character.theme.ring,
    '--ff-glow': character.theme.glow,
  }) as React.CSSProperties, [character])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [messages.length, sending, summary])

  /** 换角色：取消在途听写、口音回到该角色的默认，朗读立刻停下 */
  const pickCharacter = useCallback((id: FatFishId) => {
    const next = findFatFishCharacter(id)
    if (!next) return
    dictation.cancel()
    voice.stop()
    setCharacterId(id)
    setAccent(next.accent)
    setFailure(null)
    setSummary(null)
  }, [dictation, voice])

  /** 发一轮 */
  const send = useCallback(async (raw?: string) => {
    const value = (raw ?? text).trim()
    /* 听写中禁止发送：半句话发出去体验很差，先让用户说完 / 停止 */
    if (!value || sending || summarizing || dictation.listening || dictation.recording) return
    lastInputRef.current = value
    setFailure(null)
    setSummary(null)
    setText('')
    setSending(true)
    /** 重试中：新一轮开始就复位，否则错误卡的按钮会一直停在「正在重试…」 */
    setRetrying(false)

    const userMsg: FreeTalkMessage = { id: uid('ft'), role: 'user', text: value, at: Date.now() }
    const history: FreeTalkMessage[] = [...messages, userMsg]
    setMessages(history)

    const signal = nextSignal()
    const result = await sendFreeTalkTurn({
      character: characterId,
      accent,
      messages: history,
      signal,
    })
    /* await 之后的唯一闸门：组件已卸载或请求被取消，后续渲染全部跳过 */
    if (!isMounted() || signal.aborted) return

    const aiMsg: FreeTalkMessage = { id: uid('ft'), role: 'ai', text: result.reply, at: Date.now() }
    setMessages([...history, aiMsg])
    setSending(false)
    if (result.failure) setFailure(result.failure)

    /* 自动朗读：角色专属动作动画由 speakingKey 触发 */
    if (voice.supported) voice.speak(aiMsg.id, aiMsg.text)
  }, [accent, characterId, dictation.listening, dictation.recording, isMounted, messages, nextSignal, sending, summarizing, text, voice])

  /** 结束并总结：让 AI 以当前角色的口吻交一份 { feeling, pronunciation } */
  const finish = useCallback(async () => {
    if (summarizing) return
    if (!messages.length) { notify('先跟大肥鱼聊两句，再让它写总结～'); return }
    setSummarizing(true)
    setFailure(null)
    const signal = nextSignal()
    const result = await summarizeFreeTalk({
      character: characterId,
      accent,
      messages,
      signal,
    })
    if (!isMounted() || signal.aborted) return
    setSummarizing(false)
    setSummary({ data: result.summary, live: result.live })
    if (result.failure) setFailure(result.failure)

    /** 每日每条鱼只发一次奖励（事件 id 幂等） */
    const xp = awardXp({
      id: `freetalk:${todayKey()}:${characterId}:summary`,
      source: 'freetalk',
      action: 'freetalk_summary',
      amount: XP_RULES.freetalk_summary,
      meta: { characterId, accent, live: result.live },
    })
    if (xp.granted) notify(`本次聊天总结完成，+${xp.amount} XP 🎉`)
  }, [accent, awardXp, characterId, isMounted, messages, nextSignal, notify, summarizing])

  const reset = useCallback(() => {
    dictation.cancel()
    voice.stop()
    setMessages([])
    setSummary(null)
    setFailure(null)
    setText('')
  }, [dictation, voice])

  return (
    <div className="ff-stage space-y-4 rounded-3xl p-4 sm:p-5" style={themeStyle} data-testid="freetalk-page">
      {/* ---------------- 角色选择 ---------------- */}
      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">大肥鱼自由对话</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              没有剧本、没有任务——挑一条鱼，用英语瞎聊就行。
            </p>
          </div>
          <button type="button" onClick={reset} data-testid="freetalk-reset"
            className="shrink-0 rounded-xl border border-white/70 bg-white/80 px-2.5 py-1.5 text-[11px] font-bold text-muted transition hover:text-ink">
            清空
          </button>
        </div>
        <div className="hide-scroll -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
          {FAT_FISH_CHARACTERS.map((c) => {
            const active = c.id === characterId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCharacter(c.id)}
                data-testid={`freetalk-character-${c.id}`}
                aria-pressed={active}
                className={cn(
                  'flex w-[104px] shrink-0 flex-col items-center gap-1 rounded-3xl border-2 px-2 py-2.5 text-center transition',
                  active
                    ? 'border-transparent bg-white shadow-card'
                    : 'border-white/70 bg-white/55 hover:bg-white/80',
                )}
                style={active ? { borderColor: c.theme.accent } : undefined}
              >
                <FatFishAvatar id={c.id} size={54} />
                <span className="text-[11px] font-bold leading-tight text-ink">{c.name}</span>
                <span className="text-[10px] leading-tight text-muted">{c.title}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------------- 舞台：当前角色 ---------------- */}
      <section className="rounded-3xl border border-white/80 bg-white/85 p-4 shadow-card">
        <div className="flex items-start gap-3">
          <FatFishAvatar id={character.id} size={88} speaking={voice.speakingKey !== null} />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-ink">{character.name}</h3>
            <p className="text-[11px] font-semibold text-muted">{character.title} · {character.tagline}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {character.toneWords.map((w) => (
                <span key={w}
                  className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold"
                  style={{ color: character.theme.accentInk }}>
                  {w}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 口音：TTS 音色严格跟随它 */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-3">
          <span className="text-[11px] font-bold text-muted">口音</span>
          <div className="flex gap-1.5" role="group" aria-label="选择口音">
            {ACCENTS.map((a) => {
              const active = a === accent
              return (
                <button key={a} type="button" onClick={() => setAccent(a)}
                  data-testid={`freetalk-accent-${a}`}
                  aria-pressed={active}
                  className={cn(
                    'min-h-[36px] rounded-xl px-3 text-[11px] font-bold transition',
                    active ? 'text-white shadow-soft' : 'bg-white/80 text-muted hover:text-ink',
                  )}
                  style={active ? { background: character.theme.accent } : undefined}>
                  {FAT_FISH_ACCENT_LABELS[a]}
                </button>
              )
            })}
          </div>
        </div>

        {voice.supported && !voice.resolved.available && (
          <p data-testid="freetalk-accent-missing" className="mt-2 text-[10px] leading-relaxed text-muted">
            当前设备没有 {FAT_FISH_ACCENT_LABELS[accent]} 的音色，朗读会退回最接近的英语音色；
            文字聊天不受影响。
          </p>
        )}
        {!voice.supported && (
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            当前浏览器不支持语音合成，朗读控件已隐藏；文字聊天完全不受影响。
          </p>
        )}
      </section>

      {/* ---------------- 消息流 ---------------- */}
      {/* pb-24 给悬浮宠物留出停泊位：它飘在输入台上方，不挤占输入行宽度 */}
      <section className="space-y-3 pb-24" aria-live="polite">
        {!messages.length && (
          <div className="rounded-3xl border border-dashed border-white/90 bg-white/60 px-5 py-8 text-center">
            <p className="font-display text-sm font-bold text-ink">{character.name}正在发呆…</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              说点什么吧，它会用 {FAT_FISH_ACCENT_LABELS[accent]} 回你一整段。
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex animate-in flex-col items-end">
                <div className="mb-1 flex items-center gap-1.5 pr-1 text-[10px] font-bold text-muted">你</div>
                <div className="max-w-[86%] rounded-3xl rounded-tr-lg bg-ink/85 px-4 py-2.5 text-white shadow-card">
                  <p className="en-text text-[15px] leading-relaxed">{m.text}</p>
                </div>
              </div>
            )
          }
          const speaking = voice.speakingKey === m.id
          return (
            <div key={m.id} className="flex animate-in items-start gap-2.5">
              <FatFishAvatar id={character.id} size={38} speaking={speaking} />
              <div className="min-w-0 max-w-[84%] flex-1">
                <p className="mb-1 text-[10px] font-bold text-muted">
                  {character.name} · {FAT_FISH_ACCENT_LABELS[accent]}
                </p>
                <div className={cn('ff-bubble relative rounded-3xl rounded-tl-lg border px-4 py-3 shadow-card',
                  speaking && 'ring-2 ring-offset-1')}
                  style={speaking ? { boxShadow: `0 0 0 3px ${character.theme.glow}` } : undefined}>
                  <p className="en-text text-[15px] leading-relaxed text-ink">{m.text}</p>
                  {speaking && (
                    <span data-testid="freetalk-wave" aria-hidden="true"
                      className="absolute -top-2 right-3 flex items-end gap-0.5 rounded-full px-2 py-1"
                      style={{ background: character.theme.accent }}>
                      {[0, 1, 2].map((k) => (
                        <span key={k} className="h-1 w-1 rounded-full bg-white"
                          style={{ animation: `ff-wave 0.9s ease-in-out ${k * 120}ms infinite` }} />
                      ))}
                    </span>
                  )}
                  {voice.supported && (
                    <div className="mt-2 flex items-center gap-3 border-t border-black/5 pt-2">
                      <button type="button" onClick={() => voice.speak(m.id, m.text)}
                        data-testid={`freetalk-replay-${i}`}
                        className="flex items-center gap-1 text-[11px] font-bold hover:underline"
                        style={{ color: character.theme.accentInk }}>
                        <Icon name="speaker" size={13} />重播
                      </button>
                      {speaking && (
                        <button type="button" onClick={voice.stop} data-testid="freetalk-stop"
                          className="flex items-center gap-1 text-[11px] font-bold text-coral-600 hover:underline">
                          <Icon name="close" size={12} />停止
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {sending && <ThinkingSkeleton speaker={character.name} />}

        {failure && !sending && (
          <AiErrorCard
            code={FAILURE_TO_CODE[failure.reason]}
            detail={failure.detail}
            retrying={retrying}
            onRetry={() => {
              setFailure(null)
              setRetrying(true)
              void send(lastInputRef.current)
            }}
            onDismiss={() => setFailure(null)}
            testId="freetalk-error-card"
          />
        )}

        {/* ---------------- 人设化总结 ---------------- */}
        {summary && (
          <div data-testid="freetalk-summary" className="animate-in rounded-3xl border-2 bg-white/92 p-4 shadow-card"
            style={{ borderColor: character.theme.ring }}>
            <div className="flex items-center gap-2">
              <FatFishAvatar id={character.id} size={34} />
              <p className="font-display text-sm font-bold text-ink">
                {character.name}的收尾总结
                <span className="ml-1.5 text-[10px] font-semibold text-muted">
                  {summary.live ? '真实 AI' : '本地演示'}
                </span>
              </p>
            </div>
            <div className="mt-3 space-y-2">
              <div className="rounded-2xl p-3" style={{ background: character.theme.bubble }}>
                <p className="text-[10px] font-bold" style={{ color: character.theme.accentInk }}>聊天感受</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">{summary.data.feeling}</p>
              </div>
              <div className="rounded-2xl bg-sun-100/70 p-3">
                <p className="text-[10px] font-bold text-[#a56a08]">发音建议</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">{summary.data.pronunciation}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {voice.supported && (
                <button type="button" onClick={() => voice.speak('summary', summary.data.feeling)}
                  data-testid="freetalk-summary-speak"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl px-3 text-[12px] font-bold text-white transition hover:opacity-90"
                  style={{ background: character.theme.accent }}>
                  <Icon name="speaker" size={14} />朗读总结
                </button>
              )}
              <button type="button" onClick={reset}
                className="inline-flex min-h-[40px] items-center rounded-2xl border border-black/10 bg-white px-3 text-[12px] font-semibold text-muted transition hover:text-ink">
                再来一轮
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </section>

      {/* ---------------- 输入台 ---------------- */}
      <div className="sticky bottom-[84px] z-20 space-y-2 rounded-3xl border border-white/80 bg-white/95 p-3 shadow-float backdrop-blur">
        {/* [Desktop Pet] 绝对定位在输入行上方右侧：不占 flex 宽度，不挡打字与发送 */}
        {petVisible && (
          <DesktopPet
            character={character}
            state={pet.state}
            phrase={pet.phrase}
            nonce={pet.nonce}
            onPoke={pet.poke}
            onHappyEnd={pet.finishHappy}
          />
        )}
        {/* [语音输入] 实时字幕：点「停止」才收进输入框，未确认片段提示核对 */}
        {(dictation.listening || dictation.recording || dictation.interim) && (
          <div data-testid="freetalk-dictation-interim" aria-live="polite"
            className="ff-dictation-live rounded-2xl border px-3 py-2 text-[12px] leading-relaxed">
            <span className="mr-1.5 font-bold" style={{ color: character.theme.accentInk }}>🎙 录音中：</span>
            <span className="en-text text-ink">{dictation.interim || '正在听，请继续说…'}</span>
            <span className="ml-1 text-[10px] text-muted">（读完点麦克风停止，未确认片段请核对）</span>
          </div>
        )}
        {!dictation.listening && !dictation.recording && dictation.note && (
          <p data-testid="freetalk-dictation-note" role="status"
            className="rounded-2xl bg-black/[0.04] px-3 py-1.5 text-[10px] leading-relaxed text-muted">
            {dictation.note}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => {
              /* 用户一开口就掐断朗读，并取消在途听写（手动输入与听写互斥） */
              if (dictation.listening || dictation.recording) dictation.cancel()
              if (voice.speakingKey) voice.stop()
              setText(e.target.value)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            rows={2}
            placeholder="Type in English… （中文也行，胖鱼会接住你）"
            data-testid="freetalk-input"
            className="field en-text max-h-28 min-h-[52px] flex-1 resize-none !py-2.5 text-sm"
          />
          {/* [语音输入] 手动模式：点击开始录音（变色+波形），再点一次停止并提交 */}
          <button type="button" onClick={dictation.toggle}
            data-testid="freetalk-mic"
            aria-label={dictation.recording || dictation.listening ? '录音中，点击停止并提交' : '点击开始录音'}
            aria-pressed={dictation.listening || dictation.recording}
            className={cn(
              'flex h-[52px] w-[44px] shrink-0 items-center justify-center rounded-2xl border-2 transition',
              dictation.listening || dictation.recording
                ? 'ff-mic-live border-transparent text-white'
                : 'border-white/80 bg-white/85 text-muted hover:text-ink',
            )}
            style={dictation.listening || dictation.recording ? { background: character.theme.accent } : undefined}>
            <Icon name="mic" size={19} />
          </button>
          <button type="button" onClick={() => void send()} disabled={sending || summarizing || dictation.listening || dictation.recording || !text.trim()}
            data-testid="freetalk-send"
            className="btn-primary !h-[52px] !w-[52px] !rounded-2xl !px-0"
            style={{ background: character.theme.accent }}
            aria-label="发送">
            <Icon name="send" size={19} />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-[10px] leading-tight text-muted">
            {dictation.recording
              ? '录音中，请读完点击麦克风停止。'
              : dictation.listening
              ? '录音中，请读完点击麦克风停止；停顿不会自动结束。'
              : summary ? '已经收尾啦，可以点「再来一轮」重新开聊。'
                : '点麦克风开始录音，读完再点一次停止并转成文字。'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {/* [Desktop Pet] 碍事就收起来；纯会话态，不写 localStorage */}
            <button type="button" onClick={() => setPetVisible((v) => !v)}
              data-testid="freetalk-pet-toggle"
              aria-pressed={petVisible}
              aria-label={petVisible ? '收起悬浮宠物' : '唤出悬浮宠物'}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl border border-white/80 bg-white/85 px-3 text-[12px] font-bold text-muted transition hover:text-ink">
              <Icon name="fish" size={13} />
              {petVisible ? '收起宠物' : '唤出宠物'}
            </button>
            <button type="button" onClick={() => void finish()}
              disabled={summarizing || sending || !messages.length}
              data-testid="freetalk-finish"
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-2xl bg-ink px-3.5 text-[12px] font-bold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-45">
              <Icon name="flag" size={13} />
              {summarizing ? '总结中…' : '结束并总结'}
            </button>
          </div>
        </div>
      </div>

      {/* [兼容降级] 浏览器不支持 / 权限被拒时明确弹窗，绝不静默失败 */}
      {dictation.notice && (
        <VoiceSupportDialog notice={dictation.notice} onClose={dictation.dismissNotice} />
      )}
    </div>
  )
}
