import type {
  ChatMessage, DirectorOutput, Feedback, GenerateDialogue, GenerateDialogueInput,
  Settings,
} from '../types'
import { clamp, containsTarget } from '../lib/utils'
import { HINT_POOL, PRAISE_POOL, SENTENCE_FRAMES, WORD_BANK } from '../data/mockData'
import {
  IELTS_DIMENSIONS, ieltsLevelByCefr, type IeltsDimensionKey, type IeltsLevel,
} from '../data/ieltsLevels'
/** [成长系统] 有效轮次判定：XP 只奖励「完成单元」，规则同时写进远程 prompt */
import { EFFECTIVE_RULE_PROMPT, isEffectiveTurn } from './effectiveTurn'
/** [对话语音层] 等级 → 语言参数：句数上限是硬约束，最后一道闸门在 clampToLevel */
import { clampToLevel, fitCorrectionToLevel, levelProfilePrompt } from '../voiceTypes'
/** [真实 AI] /api/chat 模式探测 + 超时保护；探测失败一律静默回退 Mock */
import { AI_ENDPOINT, createRequestSignal, probeAiMode } from './aiStatus'
/** [AI 错误信号] 服务端返回 4xx/5xx 时，把状态码与中文提示投递到只读信箱，供页面层弹友好卡片 */
import { parseServerErrorMessage, recordAiErrorStatus } from './aiErrorSignal'

/* ================================================================
 * Agent 2 —— DialogueDirectorAgent
 * 统一入口 generateDialogue()，默认是本地 Mock 生成器。
 * 想接真实 LLM：调用 setDialogueGenerator() 或在设置页配置兼容端点。
 * ================================================================ */

type Intent = 'question' | 'suggest' | 'agree' | 'unsure' | 'thanks' | 'end' | 'statement'

const CHINESE_RE = /[\u4e00-\u9fff]/

/** 从输入推断当前雅思档位；旧调用（只有 CEFR）自动按映射取档 */
function levelOf(input: GenerateDialogueInput): IeltsLevel {
  return input.ieltsLevel || ieltsLevelByCefr(input.difficulty)
}

/** 本轮最值得提醒的官方评分维度 */
function focusDimension(
  input: GenerateDialogueInput,
  issues: Issue[],
  usedTarget: string[],
  chinese: boolean,
): IeltsDimensionKey {
  if (chinese) return 'fc'
  if (issues.some((i) => i.type === 'grammar')) return 'gra'
  if (!usedTarget.length) return 'lr'
  const cfg = levelOf(input).dialogue
  const words = input.userInput.trim().split(/\s+/).filter(Boolean).length
  if (words < cfg.userTargetLength) return 'fc'
  const rotation: IeltsDimensionKey[] = ['fc', 'lr', 'gra', 'pr']
  return rotation[input.turn % rotation.length]
}

/** 生成针对某维度的短提示，附在可折叠反馈里 */
function ieltsTipFor(level: IeltsLevel, key: IeltsDimensionKey): string {
  const dim = IELTS_DIMENSIONS.find((d) => d.key === key) || IELTS_DIMENSIONS[0]
  const cfg = level.dialogue
  const goal = level.dimensions[key].split(/[；，]/)[0]
  return `雅思 ${level.band} · ${dim.zh}：${goal}。本档每轮建议说约 ${cfg.userTargetLength} 词。`
}

function detectIntent(text: string): Intent {
  const t = text.toLowerCase().trim()
  if (/\b(bye|goodbye|stop|finish|end|that's all|see you|wrap up)\b/.test(t)) return 'end'
  if (/\b(thank you|thanks|cheers)\b/.test(t)) return 'thanks'
  if (/\b(not sure|maybe|i don't know|hard to|no idea|perhaps)\b/.test(t)) return 'unsure'
  if (/\b(how about|let's|let us|i'd like|we could|i suggest|shall we|why don't we)\b/.test(t) || /\?$/.test(t) === false && /\b(let's|we could)\b/.test(t)) return 'suggest'
  if (/\?/.test(t) || /^(what|why|how|which|where|when|who|could|would|can|do|does|is|are)\b/.test(t)) return 'question'
  if (/\b(yes|agree|great|sounds|sure|exactly|right|good idea|i think so|ok)\b/.test(t)) return 'agree'
  return 'statement'
}

interface Issue { type: string; note: string; fixed: string }

const ERROR_RULES: Array<{ re: RegExp; to: string; note: string }> = [
  { re: /\bi am agree\b/gi, to: 'I agree', note: 'agree 是动词，前面不需要 am' },
  { re: /\bi am agree with you\b/gi, to: 'I agree with you', note: 'agree 是动词，前面不需要 am' },
  { re: /\bi very like\b/gi, to: 'I like ... very much', note: 'very 不直接修饰动词 like' },
  { re: /\bdiscuss about\b/gi, to: 'discuss', note: 'discuss 后面不加 about' },
  { re: /\bmore better\b/gi, to: 'better', note: 'better 本身已是比较级' },
  { re: /\b(he|she|it) don't\b/gi, to: '$1 doesn\'t', note: '第三人称单数用 doesn\'t' },
  { re: /\bi no (have|know|like|want|think)\b/gi, to: 'I don\'t $1', note: '否定实义动词要用 don\'t' },
  { re: /\bcan able to\b/gi, to: 'can', note: 'can 和 able to 不叠加' },
  { re: /\bi have (\d{1,3}) years old\b/gi, to: 'I am $1 years old', note: '表达年龄用 be 动词' },
  { re: /\bevery days\b/gi, to: 'every day', note: 'every 后接单数' },
  { re: /\bi am interesting in\b/gi, to: 'I am interested in', note: '形容人的感受用 interested' },
]

/** 返回语法/形式问题列表（纯函数） */
function collectIssues(text: string, detailed: boolean): Issue[] {
  const issues: Issue[] = []
  let draft = text.trim()
  for (const rule of ERROR_RULES) {
    rule.re.lastIndex = 0
    if (rule.re.test(draft)) {
      issues.push({ type: 'grammar', note: rule.note, fixed: draft.replace(rule.re, rule.to) })
      draft = draft.replace(rule.re, rule.to)
    }
    rule.re.lastIndex = 0
  }
  const capitalized = draft.replace(/^([a-z])/, (m) => m.toUpperCase())
  const punctuated = /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`
  if (detailed && punctuated.trim() !== text.trim()) {
    issues.push({ type: 'form', note: '句首大写和句末标点会更完整', fixed: punctuated })
  }
  return issues
}

function finalPolish(text: string, issues: Issue[]): string {
  const base = issues.length ? issues[issues.length - 1].fixed : text.trim()
  return /[.!?]$/.test(base) ? base : `${base}.`
}

/**
 * [China Learner Track] assessmentFocus='task_completion' 时的反馈分支。
 * 轨道 C 的微场景只判断「交际任务有没有做完」：不纠语法、不评发音、不打分、不给改写。
 * 复用同一个 Feedback 结构，避免改动 Dialogue 页与 FeedbackCard。
 */
function buildTaskCompletionFeedback(input: GenerateDialogueInput, raw: string): Feedback {
  const keys = (input.targetWords ?? []).filter(Boolean)
  const lower = raw.toLowerCase()
  const hit = keys.filter((k) => lower.includes(k.toLowerCase()))
  const sentences = raw.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 1).length
  const chinese = CHINESE_RE.test(raw)
  const done = !chinese && sentences >= 2
  return {
    // 这一轨不输出「语法错误」等级，避免反馈退化成语法检查器
    level: 'none',
    grammar: chinese
      ? '这一轮我们试试用英文把任务说完，哪怕只有两个短句。'
      : '这一轨不看语法：把话说完、把话接住，就是完成。',
    wordChoice: hit.length
      ? `你用上了「${hit.slice(0, 2).join(' / ')}」，任务里的关键信息已经说出来了。`
      : keys.length
        ? `下一轮可以带上「${keys[0]}」，把任务要求的信息补上。`
        : '这一轮的信息已经足够让对方接话了。',
    naturalness: '这里不评发音、不打分、也不给「更地道」的改写。',
    corrected: '',
    praise: done
      ? `任务完成 ✅ 你说满了 ${sentences} 句，这个交际任务已经做完了。`
      : '再补一句就完成了：这个任务只要求 2–3 句，不需要长段落 🌱',
    ieltsTip: 'China Learner Track · 优先看任务完成（task_completion），不是发音或语法。',
  }
}

function buildFeedback(input: GenerateDialogueInput, intent: Intent, issues: Issue[], focus: IeltsDimensionKey): Feedback {
  const raw = input.userInput.trim()
  /** [China Learner Track] 只按场景类型换反馈优先级；其余场景行为一字不变 */
  if (input.assessmentFocus === 'task_completion') return buildTaskCompletionFeedback(input, raw)
  const { correction, turn, targetWords, targetPhrases } = input
  const bandLevel = levelOf(input)
  const chinese = CHINESE_RE.test(raw)
  const wordCount = raw.split(/\s+/).filter(Boolean).length
  const usedTarget = targetWords.filter((w) => containsTarget(raw, w))
  const polite = /\b(please|could|would|may i|how about|thank)\b/i.test(raw)
  const praise = PRAISE_POOL[turn % PRAISE_POOL.length]

  if (chinese) {
    const frame = targetPhrases[0] || SENTENCE_FRAMES[turn % SENTENCE_FRAMES.length]
    return {
      level: 'minor',
      grammar: '这一轮我们试试用英文表达，哪怕只有一个短句也很好。',
      wordChoice: `可以借这个句型开头：「${frame}」`,
      naturalness: '模仿句型说出自己的想法，就是最自然的练习方式。',
      corrected: frame.replace('...', targetWords[0] || 'the idea'),
      praise: '愿意表达想法本身就很棒，再用英文试一次吧 🌱',
      ieltsTip: ieltsTipFor(bandLevel, focus),
    }
  }

  const hasRealError = issues.some((i) => i.type === 'grammar')
  const level: Feedback['level'] = correction === 'gentle'
    ? (hasRealError ? 'minor' : 'none')
    : hasRealError ? 'major' : issues.length || wordCount < 5 ? 'minor' : 'none'

  let corrected = ''
  if (hasRealError) corrected = finalPolish(raw, issues)
  else if (correction !== 'gentle' && wordCount < 6) {
    const phrase = targetPhrases[turn % Math.max(targetPhrases.length, 1)] || 'Could you tell me more about ...?'
    corrected = `${raw.replace(/[.!?]+$/, '')}, and ${phrase.toLowerCase().replace('...?', targetWords[0] || 'it')}`
  } else if (correction === 'detailed' && issues.length) {
    corrected = finalPolish(raw, issues)
  }

  const grammar = hasRealError
    ? issues.filter((i) => i.type === 'grammar').map((i) => i.note).join('；') + '。'
    : issues.length && correction === 'detailed'
      ? issues.map((i) => i.note).join('；') + '。'
      : '这一句语法没有问题，意思表达得很清楚。'

  const wordChoice = usedTarget.length
    ? `你用到了目标词 ${usedTarget.join(' / ')}，很棒的主动使用！`
    : `下一轮可以试着带上 "${targetWords[turn % Math.max(targetWords.length, 1)] || 'this word'}"。`

  const naturalness = polite
    ? '语气礼貌自然，听起来很舒服。'
    : correction === 'gentle'
      ? '整体流畅，继续保持就好。'
      : '加一个 "Could you..." 或 "How about..." 会让语气更柔和。'

  return { level, grammar, wordChoice, naturalness, corrected, praise, ieltsTip: ieltsTipFor(bandLevel, focus) }
}

/**
 * [对话语音层] Mock 路径的等级适配：把改写建议调整到当前等级能接住的复杂度。
 * A2 / B1 砍掉从句尾巴；B2 / C1 原样保留（不把高等级用户降级成 A2 句式）。
 */
function fitFeedbackToLevel(feedback: Feedback, input: GenerateDialogueInput): Feedback {
  if (!input.levelProfile) return feedback
  return { ...feedback, corrected: fitCorrectionToLevel(feedback.corrected, input.levelProfile) }
}

const OPENERS: Record<Intent, string[]> = {
  question: ['Good question.', 'That\'s a fair question.', 'Hmm, let me think.'],
  suggest: ['I like that idea.', 'That could work nicely.', 'Nice suggestion!'],
  agree: ['Great, we\'re on the same page.', 'Lovely, that works for me.', 'Wonderful!'],
  unsure: ['No worries at all.', 'That\'s completely fine.', 'Take your time.'],
  thanks: ['My pleasure!', 'Happy to help!', 'Anytime!'],
  end: ['It was lovely talking with you.', 'That\'s a nice place to wrap up.', 'Thanks for the chat!'],
  statement: ['I see what you mean.', 'That\'s interesting.', 'Thanks for sharing that.'],
}

function buildReply(input: GenerateDialogueInput, intent: Intent, chinese: boolean): string {
  const { aiCharacter, targetWords, targetPhrases, turn, scenario } = input
  const level = levelOf(input)
  const cfg = level.dialogue
  /**
   * [对话语音层] 等级驱动的句数上限优先于雅思档位：
   * 用户在等级面板里跳级 / 留级后，下一轮回复立刻按新等级的长度说话。
   */
  const profile = input.levelProfile
  const maxSentences = profile ? profile.maxSentences : cfg.sentences
  const { rounds } = scenario
  const word = targetWords[turn % Math.max(targetWords.length, 1)] || 'the idea'
  const phrase = targetPhrases[turn % Math.max(targetPhrases.length, 1)] || 'How about ...?'
  const opener = OPENERS[intent][turn % OPENERS[intent].length]

  if (chinese) {
    const frame = targetPhrases[0] || SENTENCE_FRAMES[turn % SENTENCE_FRAMES.length]
    return `Let's try that in English. You could start with "${frame.replace('...', word)}" — one short sentence is perfect.`
  }

  if (intent === 'end' || turn + 1 >= rounds) {
    const ending = `${opener} We used words like "${word}" today, and that's real progress.`
    return profile ? clampToLevel(ending, profile) : ending
  }

  // 低档给短问句，中高档给可扩展的追问
  const basicFollow = [
    `What do you think about ${word}?`,
    `Can you say more about ${word}?`,
    `How about ${word}?`,
    `Do you like ${word}?`,
  ]
  const richFollow = [
    `What's your take on ${word} here?`,
    `Could you tell me a bit more about ${word}?`,
    `Would "${phrase}" fit what you just said?`,
    `How about we bring ${word} into the next sentence?`,
    `I'm curious how ${word} connects to your idea.`,
  ]
  const simple = maxSentences <= 1
  const followPool = simple ? basicFollow : richFollow
  const follow = followPool[turn % followPool.length]

  // 每 3 轮插入角色口头禅，保持人物语气一致
  const voice = turn > 0 && turn % 3 === 0 && aiCharacter.sampleLines.length
    ? aiCharacter.sampleLines[turn % aiCharacter.sampleLines.length]
    : opener

  if (simple) return follow

  const core = `${voice} ${follow}`
  // 高段位才追加第三句：地道搭配或复合结构，仍严格控制在句数上限内
  if (maxSentences >= 3 && (profile ? true : cfg.useComplexStructures)) {
    const extras = cfg.useIdioms || profile
      ? ['It is worth a closer look, if you ask me.', 'That said, I would still keep it simple.', 'It is a small detail, but it changes the whole picture.']
      : ['That way we can keep the idea in the conversation.', 'We can come back to it once we decide.', 'It also gives us a clearer picture of the plan.']
    const reply = `${core} ${extras[turn % extras.length]}`
    return profile ? clampToLevel(reply, profile) : reply
  }
  return core
}

function buildTranslation(input: GenerateDialogueInput, reply: string, intent: Intent, chinese: boolean): string {
  const intentZh: Record<Intent, string> = {
    question: '在回应你的问题并追问细节',
    suggest: '对你的提议表示欢迎，并补充一个方向',
    agree: '表示赞同，然后把话题往前推一步',
    unsure: '安慰你不用着急，并给一个更简单的切口',
    thanks: '礼貌回应你的感谢',
    end: '在愉快地收尾这次对话',
    statement: '确认了你的意思，并邀请你继续展开',
  }
  const used = Object.entries(WORD_BANK)
    .filter(([w]) => new RegExp(`\\b${w}\\b`, 'i').test(reply))
    .slice(0, 3)
    .map(([, v]) => v.meaning)
  const core = chinese ? '在邀请你用英文再试一次，并给了可模仿的句型' : intentZh[intent]
  return `${input.aiCharacter.name} ${core}（场景：${input.scenario.title}）。${used.length ? `大意关键词：${used.join('、')}。` : ''}`
}

function buildHints(input: GenerateDialogueInput): string[] {
  const { targetPhrases, userInput, scenario } = input
  const level = levelOf(input)
  // 低档给能直接照着说的短句型，高档给带立场/让步的表达
  const levelHints = level.dialogue.useIdioms
    ? ['What I find interesting is that ...', 'I would go along with that, though ...', 'It is worth bearing in mind that ...']
    : ['I think ... because ...', 'Can you say more about ...?', 'I like ... a lot.']
  const pool = [
    ...levelHints,
    ...targetPhrases.map((p) => p.replace('...', input.targetWords[0] || 'it')),
    ...HINT_POOL,
    ...scenario.suggestedReplies,
    ...SENTENCE_FRAMES,
  ]
  const unique: string[] = []
  for (const p of pool) {
    if (!p || unique.includes(p)) continue
    if (userInput && p.toLowerCase() === userInput.trim().toLowerCase()) continue
    unique.push(p)
    if (unique.length >= 3) break
  }
  return unique.slice(0, 3)
}

function buildState(input: GenerateDialogueInput, feedback: Feedback): DirectorOutput['state'] {
  const allUserText = [...input.history.filter((m) => m.role === 'user').map((m) => m.text), input.userInput].join(' ')
  const coveredWords = input.targetWords.filter((w) => containsTarget(allUserText, w))
  const mistakes = input.history
    .filter((m) => m.feedback?.corrected)
    .map((m) => `${m.text} → ${m.feedback!.corrected}`)
  if (feedback.corrected && feedback.corrected.trim() !== input.userInput.trim()) {
    mistakes.push(`${input.userInput.trim()} → ${feedback.corrected}`)
  }
  return {
    coveredWords,
    mistakes: [...new Set(mistakes)],
    progress: clamp((input.turn + 1) / Math.max(input.scenario.rounds, 3), 0, 1),
  }
}

/** 默认 Mock 生成器：无 API 也能完整跑通多轮对话 */
/** [成长系统] 本地 Mock 也要给出 effective，远程未返回该字段时同样用此规则兜底 */
export function dialogueEffective(input: GenerateDialogueInput): boolean {
  return isEffectiveTurn(input.userInput, {
    previous: [...input.history].reverse().find((m) => m.role === 'user')?.text,
    targetWords: [...(input.targetWords ?? []), ...(input.targetPhrases ?? [])],
  })
}

export function mockGenerateDialogue(input: GenerateDialogueInput): DirectorOutput {
  const raw = (input.userInput || '').trim()
  const chinese = CHINESE_RE.test(raw)
  const intent = detectIntent(raw || 'hello')
  const issues = chinese ? [] : collectIssues(raw, input.correction === 'detailed')
  const usedTarget = input.targetWords.filter((w) => containsTarget(raw, w))
  const focus = focusDimension(input, issues, usedTarget, chinese)
  const feedback = fitFeedbackToLevel(buildFeedback(input, intent, issues, focus), input)
  const reply = buildReply(input, intent, chinese)
  const state = buildState(input, feedback)
  const turnNumber = input.turn + 1
  const end = Boolean(input.forceEnd) || turnNumber >= input.scenario.rounds || intent === 'end'
  const stageSummary = !end && turnNumber % 3 === 0
    ? `阶段小结：已经完成 ${turnNumber} 轮，覆盖 ${state.coveredWords.length} 个目标词。保持这个节奏，再往场景目标靠近一点！`
    : undefined
  const summary = end
    ? `本次「${input.scenario.title}」对话共 ${turnNumber} 轮，覆盖目标词 ${state.coveredWords.length} 个。你的表达越来越稳，教练正在整理会话报告。`
    : undefined

  return {
    reply,
    translation: buildTranslation(input, reply, intent, chinese),
    feedback,
    hints: buildHints(input),
    state,
    end,
    summary,
    stageSummary,
    ieltsFocus: focus,
    /** [成长系统] 有效轮次才发 XP；无效输入（过短 / 符号 / 复读 / 无关）不发 */
    effective: dialogueEffective(input),
  }
}

/* -------------------- 可替换服务层 -------------------- */

let currentGenerator: GenerateDialogue = createServerlessGenerator()

/** 注入自定义生成器（例如真实 LLM 实现） */
export function setDialogueGenerator(fn: GenerateDialogue): void {
  currentGenerator = fn
}

export function resetDialogueGenerator(): void {
  /* [真实 AI] 「重置」= 回到自动模式：Serverless 优先、Mock 兜底，
     不再是纯 Mock；用户显式配置的自定义端点仍然优先于它。 */
  currentGenerator = createServerlessGenerator()
}

/**
 * [打字机] 最近一次回复是否真的来自 /api/chat。纯内存标记，不写 localStorage。
 * 只有真实大模型才需要「等待焦虑」的逐字上屏；Mock 是本地即时生成，直接显示全文。
 */
let lastDialogueWasLive = false
export function wasLastDialogueLive(): boolean { return lastDialogueWasLive }

/** 应用统一调用的入口；组件永远不需要关心背后是 Mock 还是 LLM。
 *  每次调用先复位标记：只有 Serverless 成功路径会重新置 true，
 *  自定义端点 / Mock / 任何降级路径都保持 false。 */
export const generateDialogue: GenerateDialogue = (input) => {
  lastDialogueWasLive = false
  return currentGenerator(input)
}

function extractJson(content: string): unknown {
  const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('LLM 返回内容中没有 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalizeRemote(parsed: Record<string, unknown>, input: GenerateDialogueInput): DirectorOutput {
  const fallback = mockGenerateDialogue(input)
  const fb = (parsed.feedback || {}) as Record<string, string>
  const st = (parsed.state || {}) as Record<string, unknown>
  const baseFeedback: Feedback = {
    level: fb.level === 'major' || fb.level === 'minor' ? fb.level : fallback.feedback.level,
    grammar: fb.grammar || fallback.feedback.grammar,
    wordChoice: fb.wordChoice || fallback.feedback.wordChoice,
    naturalness: fb.naturalness || fallback.feedback.naturalness,
    corrected: fb.corrected || fallback.feedback.corrected,
    praise: fb.praise || fallback.feedback.praise,
    ieltsTip: fb.ieltsTip || fallback.feedback.ieltsTip,
  }
  /** [China Learner Track] 远程也不许把「任务完成」场景变成语法纠错或打分 */
  if (input.assessmentFocus === 'task_completion') {
    baseFeedback.level = 'none'
    baseFeedback.corrected = ''
    baseFeedback.naturalness = '这里不评发音、不打分、也不给「更地道」的改写。'
  }
  const rawReply = typeof parsed.reply === 'string' ? parsed.reply : fallback.reply
  /**
   * [对话语音层] 句数上限是硬约束：远程 LLM 不守规矩时在这里截断，
   * 避免超长回复把用户的开口空间压没。
   */
  const reply = input.levelProfile ? clampToLevel(rawReply, input.levelProfile) : rawReply
  return {
    reply,
    translation: typeof parsed.translation === 'string' ? parsed.translation : fallback.translation,
    feedback: {
      ...baseFeedback,
      /** [对话语音层] 改写建议也要匹配当前等级（沿用 baseFeedback，保留 task_completion 的空改写） */
      corrected: input.levelProfile
        ? fitCorrectionToLevel(baseFeedback.corrected, input.levelProfile)
        : baseFeedback.corrected,
    },
    hints: Array.isArray(parsed.hints) ? (parsed.hints as string[]).slice(0, 3) : fallback.hints,
    state: {
      coveredWords: Array.isArray(st.coveredWords) ? (st.coveredWords as string[]) : fallback.state.coveredWords,
      mistakes: Array.isArray(st.mistakes) ? (st.mistakes as string[]) : fallback.state.mistakes,
      progress: typeof st.progress === 'number' ? st.progress : fallback.state.progress,
    },
    end: Boolean(parsed.end ?? fallback.end),
    summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
    stageSummary: typeof parsed.stageSummary === 'string' ? parsed.stageSummary : fallback.stageSummary,
    ieltsFocus: fallback.ieltsFocus,
    /** [成长系统] 远程返回的 effective 优先；缺失或类型不对时用本地同一套规则兜底 */
    effective: typeof parsed.effective === 'boolean' ? parsed.effective : dialogueEffective(input),
  }
}

/** 可选：OpenAI 兼容端点。任何失败都自动回退 Mock，保证体验不中断 */
export function createRemoteGenerator(settings: Settings): GenerateDialogue {
  return async (input: GenerateDialogueInput) => {
    try {
      const band = levelOf(input)
      /**
       * [对话语音层] 等级参数优先于雅思档位描述：
       * 用户在等级面板里选定的等级是显式意图，句数上限必须按它执行。
       */
      const sentenceRule = input.levelProfile
        ? levelProfilePrompt(input.levelProfile)
        : `The learner targets IELTS Speaking Band ${band.band} (${band.name}, approx. CEFR ${input.difficulty}). Reply in at most ${band.dialogue.sentences} English sentences, about ${band.dialogue.wordsPerSentence} words each; ${band.dialogue.useIdioms ? 'natural idiomatic collocations are welcome' : 'avoid idioms and rare words'}; ${band.dialogue.useComplexStructures ? 'you may use subordinate clauses' : 'prefer simple sentences'}.`
      const sys = `You are the DialogueDirectorAgent of LinguaBuddy. Stay in character as ${input.aiCharacter.name} (${input.aiCharacter.role}; ${input.aiCharacter.personality}). ${sentenceRule} Gently use the target words. Give warm, specific, non-shaming feedback aligned with IELTS dimensions FC/LR/GRA/PR. Never speak for the user. Return ONLY JSON with keys: reply, translation (Chinese gist), feedback{level,grammar,wordChoice,naturalness,corrected,praise,ieltsTip}, hints[3], state{coveredWords[],mistakes[],progress}, end(bool), summary(only when end), stageSummary(every 3rd turn), effective(bool). ${EFFECTIVE_RULE_PROMPT} ${input.assessmentFocus ? `assessmentFocus=${input.assessmentFocus}. ${input.assessmentFocus === 'task_completion' ? 'Judge ONLY whether the communicative task was completed (2-3 sentences and the requested information); NEVER correct grammar, NEVER assess pronunciation, NEVER give a score, NEVER promise score gains.' : 'Keep feedback aligned with this assessment focus and do not give scores.'}` : ''}`
      const history = input.history.slice(-8).map((m: ChatMessage) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: `${m.speaker}: ${m.text}`,
      }))
      const res = await fetch(settings.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: settings.apiModel || 'gpt-4o-mini',
          temperature: 0.7,
          messages: [
            { role: 'system', content: sys },
            ...history,
            { role: 'user', content: JSON.stringify({
              scenario: input.scenario.title, goal: input.scenario.goal,
              targetWords: input.targetWords, targetPhrases: input.targetPhrases,
              userInput: input.userInput, turn: input.turn, correction: input.correction,
              ieltsBand: band.band, ieltsFocus: band.focus.slice(0, 2),
              effectiveRule: EFFECTIVE_RULE_PROMPT,
              /** [对话语音层] 等级参数随请求下发，远端据此约束句数与词汇 */
              levelProfile: input.levelProfile
                ? {
                  level: input.levelProfile.level,
                  maxSentences: input.levelProfile.maxSentences,
                  avgSentenceLength: input.levelProfile.avgSentenceLength,
                  vocabRange: input.levelProfile.vocabRange,
                  pragmaticComplexity: input.levelProfile.pragmaticComplexity,
                  constraints: input.levelProfile.constraints,
                }
                : undefined,
              /** [China Learner Track] 只多一个可选字段，旧场景不带此键，行为不变 */
              assessmentFocus: input.assessmentFocus,
            }) },
          ],
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('响应格式不符合预期')
      return normalizeRemote(extractJson(content) as Record<string, unknown>, input)
    } catch (err) {
      console.warn('[LinguaBuddy] 远程生成失败，已回退本地 Mock：', err)
      return mockGenerateDialogue(input)
    }
  }
}

/* ================================================================
 * [真实 AI] Vercel Serverless 生成器 —— generateDialogue() 的新默认电源
 * ----------------------------------------------------------------
 * 优先级：设置页「自定义兼容端点」> /api/chat > 本地 Mock。
 * 任何一步失败（无 Key / 无端点 / 断网 / 超时 / 上游报错 / 返回不是 JSON）
 * 都落到 mockGenerateDialogue()，用户体验零中断。
 * ================================================================ */

type ServerlessMessage = { role: 'system' | 'user' | 'assistant'; content: string }

function buildServerlessMessages(input: GenerateDialogueInput): ServerlessMessage[] {
  const band = levelOf(input)
  /** [对话语音层] 等级参数优先：句数上限是硬约束，远程也不能越界 */
  const sentenceRule = input.levelProfile
    ? levelProfilePrompt(input.levelProfile)
    : `The learner targets IELTS Speaking Band ${band.band} (${band.name}, approx. CEFR ${input.difficulty}). Reply in at most ${band.dialogue.sentences} English sentences, about ${band.dialogue.wordsPerSentence} words each; ${band.dialogue.useIdioms ? 'natural idiomatic collocations are welcome' : 'avoid idioms and rare words'}; ${band.dialogue.useComplexStructures ? 'you may use subordinate clauses' : 'prefer simple sentences'}.`
  const sys = `You are the DialogueDirectorAgent of LinguaBuddy. Stay in character as ${input.aiCharacter.name} (${input.aiCharacter.role}; ${input.aiCharacter.personality}). ${sentenceRule} Gently use the target words. Give warm, specific, non-shaming feedback aligned with IELTS dimensions FC/LR/GRA/PR. Never speak for the user. Return ONLY JSON with keys: reply, translation (Chinese gist), feedback{level,grammar,wordChoice,naturalness,corrected,praise,ieltsTip}, hints[3], state{coveredWords[],mistakes[],progress}, end(bool), summary(only when end), stageSummary(every 3rd turn), effective(bool). ${EFFECTIVE_RULE_PROMPT} ${input.assessmentFocus ? `assessmentFocus=${input.assessmentFocus}. ${input.assessmentFocus === 'task_completion' ? 'Judge ONLY whether the communicative task was completed (2-3 sentences and the requested information); NEVER correct grammar, NEVER assess pronunciation, NEVER give a score.' : 'Keep feedback aligned with this assessment focus and do not give scores.'}` : ''}`
  const history: ServerlessMessage[] = input.history.slice(-8).map((m: ChatMessage) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: `${m.speaker}: ${m.text}`,
  }))
  const current: ServerlessMessage = {
    role: 'user',
    content: JSON.stringify({
      scenario: input.scenario.title, goal: input.scenario.goal,
      targetWords: input.targetWords, targetPhrases: input.targetPhrases,
      userInput: input.userInput, turn: input.turn, correction: input.correction,
      ieltsBand: band.band, ieltsFocus: band.focus.slice(0, 2),
      effectiveRule: EFFECTIVE_RULE_PROMPT,
      levelProfile: input.levelProfile
        ? {
          level: input.levelProfile.level,
          maxSentences: input.levelProfile.maxSentences,
          avgSentenceLength: input.levelProfile.avgSentenceLength,
          vocabRange: input.levelProfile.vocabRange,
          pragmaticComplexity: input.levelProfile.pragmaticComplexity,
        }
        : undefined,
      assessmentFocus: input.assessmentFocus,
    }),
  }
  return [{ role: 'system', content: sys }, ...history, current]
}

/** 当前用户等级：设置面板的显式等级 > 雅思目标档 > CEFR 难度 */
function dialogueLevelOf(input: GenerateDialogueInput): string {
  return String(input.levelProfile?.level || input.ieltsLevel || input.difficulty || 'B1')
}

export function createServerlessGenerator(): GenerateDialogue {
  return async (input: GenerateDialogueInput): Promise<DirectorOutput> => {
    /* 探测模式：本地 Vite dev / 未配 Key / 断网时立即用 Mock，不发 POST */
    const status = await probeAiMode(false, input.signal)
    /* [React 最佳实践] 组件卸载后不再生成任何回复，避免 await 之后写 state */
    if (input.signal?.aborted) throw new DOMException('对话请求已取消', 'AbortError')
    if (status.mode !== 'live') return mockGenerateDialogue(input)

    /* 20s 超时 + 组件卸载 signal 合并成同一个 AbortController，卸载即中断在途 fetch */
    const gate = createRequestSignal(20_000, input.signal)
    try {
      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: gate.signal,
        body: JSON.stringify({
          messages: buildServerlessMessages(input),
          level: dialogueLevelOf(input),
          /** 只作可观测元数据，后端不依赖它；stream 默认 false，因需完整结构化 JSON */
          meta: { scenario: input.scenario.id, turn: input.turn, assessmentFocus: input.assessmentFocus },
        }),
      })
      const raw = await res.text()
      /**
       * [AI 错误信号] 命中任何失败状态码（401 / 429 / 500 …）：先把状态码与
       * 服务端中文提示投递到只读信箱，再照常走下面的降级分支回退本地 Mock
       * —— 练习不中断，提示由页面层翻译成对话气泡里的系统提示。
       * 不依赖浏览器特性，Safari / Firefox 同样能拿到精确码。
       */
      if (!res.ok) recordAiErrorStatus(res.status, parseServerErrorMessage(raw))
      const data = JSON.parse(raw) as { ok?: boolean; content?: string; error?: string }
      if (!res.ok || !data.ok || typeof data.content !== 'string') {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      /* 复用同一套归一化：等级句数钳制、task_completion 约束、effective 兜底全部保留 */
      const output = normalizeRemote(extractJson(data.content) as Record<string, unknown>, input)
      /* [打字机] 只有真正拿到 /api/chat 的结果才允许播放逐字动画 */
      lastDialogueWasLive = true
      return output
    } catch (err) {
      /* 卸载导致的取消是「主动放弃」，不是失败：不刷警告、不落 Mock */
      if (input.signal?.aborted) throw err
      console.warn('[LinguaBuddy] /api/chat 调用失败，已回退本地 Mock：', err)
      return mockGenerateDialogue(input)
    } finally {
      gate.dispose()
    }
  }
}

/** 设置页变化时同步生成器 */
export function configureGenerator(settings: Settings): void {
  if (settings.apiMode === 'custom' && settings.apiEndpoint.trim()) {
    setDialogueGenerator(createRemoteGenerator(settings))
  } else {
    resetDialogueGenerator()
  }
}
