/* ================================================================
 * 新增 Agent 3 —— PostWatchDirectorAgent（观后讨论）
 *
 * 与 DialogueDirectorAgent / SeminarDirectorAgent 完全独立：
 *   Dialogue  = 情景模拟 + 语法纠错（AI 扮演角色）
 *   Seminar   = 文本细读 + 论证引导（回原文找证据）
 *   PostWatch = 基于视听材料的观后讨论（回忆画面/声音细节 → 表达观点）
 *
 * 硬约束：
 *   ✗ 不扮演视频中的人物、不做角色扮演、不续写视频内容
 *   ✗ 不复用任何旧 Agent 的 prompt 逻辑（本文件独立构造 system prompt）
 *   ✓ 先引导回忆「视频里的具体细节」，再过渡到观点表达
 *   ✓ 中文观点 → 英文复述 + 可模仿表达
 *   ✓ 每 3-4 轮轻量小结
 *   ✓ 反馈区分「观点反馈 content」与「语言反馈 language」，
 *     level / praise 兼容现有反馈卡
 *   ✓ 前三轮不早退，保证至少 4 轮内容性对话
 * ================================================================ */

import type { Settings } from '../types'
import type {
  GeneratePostWatchReply, LightIssue, PostWatchFeedback, PostWatchInput,
  PostWatchMessage, PostWatchOutput, PostWatchReport, PostWatchSession,
} from '../cultureTypes'
/** [成长系统] 有效轮次判定：XP 只奖励「完成单元」，规则同时写进远程 prompt */
import { EFFECTIVE_RULE_PROMPT, isEffectiveTurn } from './effectiveTurn'

/** [成长系统] 本地 Mock 与远程缺失字段时共用的有效轮次规则 */
export function postWatchEffective(input: PostWatchInput): boolean {
  return isEffectiveTurn(input.userInput, {
    previous: [...input.history].reverse().find((m) => m.role === 'user')?.text,
  })
}

const CHINESE_RE = /[\u4e00-\u9fff]/
/** 具体细节信号：看到 / 听到 / 某个时刻 / 动作 */
const DETAIL_RE = /\b(i saw|i heard|i noticed|at one point|at the beginning|near the end|in the (video|clip|talk|scene)|the (speaker|person|host|man|woman|crowd)|he (said|did|showed|paused|pointed)|she (said|did|showed|paused|pointed)|there was|they (were|did|showed)|a (pause|moment|detail|shot|scene))\b/i
/** 观点信号 */
const VIEW_RE = /\b(i think|i believe|in my view|i would say|it seems to me|my impression|because|perhaps|maybe|i suspect|i feel|the reason|i would agree|i disagree)\b/i

/** 极轻量的语言规则（观后讨论只给轻量反馈，不做全套语法批改） */
const LIGHT_RULES: Array<{ re: RegExp; to: string; note: string }> = [
  { re: /\bi am agree\b/gi, to: 'I agree', note: 'agree 是动词，前面不需要 am' },
  { re: /\bdiscuss about\b/gi, to: 'discuss', note: 'discuss 后面不加 about' },
  { re: /\bmore better\b/gi, to: 'better', note: 'better 本身已是比较级' },
  { re: /\bi very like\b/gi, to: 'I like ... very much', note: 'very 不直接修饰动词 like' },
  { re: /\b(he|she|it) don't\b/gi, to: "$1 doesn't", note: '第三人称单数用 doesn\'t' },
]

export type { LightIssue }

export function collectLightIssues(text: string): LightIssue[] {
  const out: LightIssue[] = []
  let draft = text.trim()
  for (const rule of LIGHT_RULES) {
    rule.re.lastIndex = 0
    if (rule.re.test(draft)) {
      out.push({ note: rule.note, fixed: draft.replace(rule.re, rule.to) })
      draft = draft.replace(rule.re, rule.to)
    }
    rule.re.lastIndex = 0
  }
  return out
}

export function hasConcreteDetail(text: string): boolean {
  return DETAIL_RE.test(text) || /我看到|我听到|视频里|画面里|那个人|演讲者|有一个|他(先|还|就)|她(先|还|就)/.test(text)
}

export function hasViewpoint(text: string): boolean {
  return VIEW_RE.test(text) || /我觉得|我认为|因为|也许|可能|我的看法|我同意|不同意/.test(text)
}

/** 角色扮演 / 越界检测器：真实 LLM 若扮演视频人物或续写，输出会被替换回引导者语气 */
export function containsPostWatchRoleplay(reply: string): boolean {
  const t = reply.toLowerCase()
  if (/\b(i am|i'm|speaking as|as)\s+(the\s+)?(speaker|host|presenter|interviewer|narrator|man|woman|child|teacher in the video)\b/.test(t)) return true
  if (/\b(in character|let us act|imagine i am|now i am on stage|let me continue the (talk|video|scene))\b/.test(t)) return true
  return false
}

/** 只把允许注入的字段交给远程端点；payload 里绝不含字幕全文或视频流 */
export function buildPostWatchPayload(input: PostWatchInput): Record<string, unknown> {
  return {
    videoTitle: input.videoTitle,
    videoTitleZh: input.videoTitleZh,
    videoSummaryZh: input.videoSummaryZh,
    platform: input.platform,
    culturalThemes: input.culturalThemes,
    // 短引用（短语/单句），不是字幕脚本
    keyExpressions: input.keyExpressions.map((e) => ({
      expression: e.expression, meaningZh: e.meaningZh, context: e.context,
    })),
    backgroundCard: input.backgroundCard,
    discussionSeeds: input.discussionSeeds,
    history: input.history.slice(-8).map((m) => ({ role: m.role, text: m.text })),
    userInput: input.userInput,
    difficulty: input.difficulty,
    guidance: input.guidance,
    captionPreference: input.captionPreference,
    turn: input.turn,
    /** [成长系统] 把有效轮次判定标准随 payload 交给自定义端点 */
    effectiveRule: EFFECTIVE_RULE_PROMPT,
  }
}

/* ---------------- 引导语料（独立，不复用旧 Agent） ---------------- */

const RECALL_PROBES: Record<PostWatchInput['guidance'], string[]> = {
  light: [
    'Before we get to opinions, could you tell me one thing you actually saw or heard in the video?',
    'Which single moment stayed with you, and what was happening on screen?',
    'Would you describe one small detail you remember from the clip?',
  ],
  medium: [
    'Which specific moment in the video made you think that, and what did the person actually do there?',
    'What did you see or hear at that point? A concrete detail would help us start.',
    'Can you point to one short moment in the video that supports your impression?',
  ],
  strong: [
    'I would like to separate what was on screen from what you inferred: what exactly did you see or hear?',
    'Which observable detail in the clip leads to that reading, and what might someone else have noticed instead?',
    'Describe the moment precisely first — who did what — before we move to your judgement.',
  ],
}

const VIEW_PROBES: Record<PostWatchInput['guidance'], string[]> = {
  light: [
    'That is a clear impression. How would you say it in one English sentence?',
    'Interesting. Would you like to compare that with a moment from your own context?',
    'Thank you. What else about that scene would you like to put into words?',
  ],
  medium: [
    'You have connected a detail to a view. What in the video would someone who disagrees point to?',
    'Why do you think that moment was presented that way?',
    'How would the same scene be described differently in your own culture?',
  ],
  strong: [
    'You have made a claim about the scene. What would count as evidence against it from the same video?',
    'If we looked at that moment from another person\'s perspective, what would change in your description?',
    'Which part of your view comes from the video, and which part comes from your own expectations?',
  ],
}

const OPENERS = {
  both: [
    'You gave a concrete detail from the video and your own view of it — that is exactly the move we are practising.',
    'Good: a moment you noticed, plus what you make of it.',
    'That is a well-grounded response to the clip.',
  ],
  detailOnly: [
    'You went back to what was actually on screen, which is the right place to start.',
    'Thank you for describing the moment rather than jumping to a conclusion.',
    'That detail is a solid starting point.',
  ],
  viewOnly: [
    'I hear a clear view. Let us anchor it in one moment from the video.',
    'That is a definite position, and it is worth testing against the clip.',
    'You have taken a stance, which is the hardest first step.',
  ],
  thin: [
    'This is a good start; let us build it into a description we can discuss.',
    'There is the beginning of an idea here.',
    'Let us slow down and name one moment first.',
  ],
} as const

function pick<T>(pool: readonly T[], seed: number): T {
  return pool[Math.abs(seed) % pool.length]
}

/** 中文观点 → 可模仿的英文表达（不复述整句，只给框架） */
function modelFrame(input: PostWatchInput): string {
  const theme = input.culturalThemes[0]?.theme || 'that moment'
  const expr = input.keyExpressions[0]?.expression
  return expr
    ? `In the video, I noticed "${expr}", and it made me think that ${theme} matters because ...`
    : `In the video, I noticed one moment about ${theme}, and it made me think ... because ...`
}

/* ---------------- 默认 Mock 生成器 ---------------- */

export function mockPostWatchTurn(input: PostWatchInput): PostWatchOutput {
  const raw = (input.userInput || '').trim()
  const chinese = CHINESE_RE.test(raw)
  const detail = !chinese && hasConcreteDetail(raw)
  const detailCn = chinese && hasConcreteDetail(raw)
  const view = hasViewpoint(raw)
  const issues = chinese ? [] : collectLightIssues(raw)
  const wordCount = chinese ? 0 : raw.split(/\s+/).filter(Boolean).length
  const turn = input.turn
  const round = turn + 1

  let opener: string
  let probe: string
  let extra: string

  if (chinese) {
    opener = `Your point is worth keeping. In English you could say: "${modelFrame(input)}".`
    probe = `Which one moment in the video would you put after "I noticed" to make that concrete?`
    extra = `Try the frame out loud in your own words — one detail is enough.`
  } else if (detail && view) {
    opener = pick(OPENERS.both, turn)
    probe = pick(VIEW_PROBES[input.guidance], turn)
    extra = input.guidance === 'strong'
      ? 'Try separating what the camera showed from what you concluded.'
      : 'Try adding one more sentence that links the detail to your view.'
  } else if (detail || detailCn) {
    opener = pick(OPENERS.detailOnly, turn)
    probe = pick(VIEW_PROBES[input.guidance], turn)
    extra = 'Now add "I think ... because ..." so the detail becomes your own view.'
  } else if (view) {
    opener = pick(OPENERS.viewOnly, turn)
    probe = pick(RECALL_PROBES[input.guidance], turn)
    extra = 'Name one concrete moment first; the opinion will land more firmly after that.'
  } else {
    opener = pick(OPENERS.thin, turn)
    probe = pick(RECALL_PROBES[input.guidance], turn)
    extra = 'One thing you saw or heard is all we need for the next step.'
  }

  const reply = `${opener} ${probe} ${extra}`
  const nextQuestion = input.discussionSeeds[turn % Math.max(input.discussionSeeds.length, 1)]
    || 'Which moment in the video would you describe first?'
  const feedback = buildPostWatchFeedback({ input, chinese, detail: detail || detailCn, view, issues, wordCount })
  const culturalBridge = buildCulturalBridge(input, detail || detailCn, view, turn)
  const stageSummary = round % 3 === 0 && !input.forceEnd
    ? `阶段小结（第 ${round} 轮）：我们围绕「${input.videoTitleZh}」聊了 ${round} 次；已经记下 ${input.history.filter((m) => m.role === 'user' && m.feedback?.level === 'none').length} 条「细节 + 观点」俱备的表达，接下来可以试着用卡片上的短引用把话说得更具体。待探索：「${nextQuestion}」。`
    : undefined

  return {
    reply,
    translation: buildTranslation({ chinese, detail: detail || detailCn, view }),
    feedback,
    culturalBridge,
    nextQuestion,
    stageSummary,
    // 前三轮绝不允许自动结束，保证至少能完成 4 轮内容性对话
    end: Boolean(input.forceEnd) || round >= 8,
    /** [成长系统] 有效轮次才发 XP */
    effective: postWatchEffective(input),
  }
}

function buildPostWatchFeedback(args: {
  input: PostWatchInput; chinese: boolean; detail: boolean; view: boolean
  issues: LightIssue[]; wordCount: number
}): PostWatchFeedback {
  const { input, chinese, detail, view, issues, wordCount } = args
  let content: string
  if (detail && view) content = '既回应了视频里的具体细节，也说出了自己的判断，观点有落点。'
  else if (detail) content = '你把画面/声音里的一个细节说清楚了；再补一句「所以我认为……」就成了观点。'
  else if (view) content = '判断很明确，但还没说清它来自视频的哪一个时刻；下一步先描述一个具体细节。'
  else content = '这一轮更接近泛泛印象；试着点出「我看到/听到……」，再接一句自己的看法。'
  if (/\b(because|so|however|although|which means)\b/i.test(input.userInput)) content += '连接词让层次更清楚。'

  let language: string
  if (chinese) language = '中文完全可以表达观点；下一轮挑一个英文框架照着说，哪怕只有一个从句也很好。'
  else if (issues.length) language = issues.map((i) => i.note).join('；') + '。'
  else if (wordCount < 6) language = '句子偏短，加一个 because 从句就能把理由带出来。'
  else if (wordCount > 45) language = '信息量很足；试着拆成两句，让细节与观点各自站住。'
  else language = '用词与句式都能把意思说清楚，没有影响理解的表达问题。'

  const corrected = chinese
    ? modelFrame(input)
    : issues.length
      ? issues[issues.length - 1].fixed
      : !detail && !view && wordCount >= 4
        ? `In the video, I noticed one moment, and it made me think ... because ...`
        : ''

  const praise = detail && view
    ? `你把「${input.culturalThemes[0]?.theme || '这一幕'}」和一个具体画面连起来说了，这正是观后讨论最要紧的动作。`
    : detail
      ? `先描述、再下判断，这个顺序让后面的观点更站得住。`
      : view
        ? `在没有标准答案的地方先给出自己的判断，比复述视频内容难得多。`
        : `愿意先把印象说出来，我们就有了一起打磨的材料。`

  const level: PostWatchFeedback['level'] = issues.length ? 'major'
    : !detail || !view || chinese || wordCount < 6 ? 'minor' : 'none'

  return { level, content, language, corrected: corrected || undefined, praise }
}

function buildCulturalBridge(input: PostWatchInput, detail: boolean, view: boolean, turn: number): string {
  const theme = input.culturalThemes[turn % Math.max(input.culturalThemes.length, 1)]
  const expr = input.keyExpressions[turn % Math.max(input.keyExpressions.length, 1)]
  if (!theme) return ''
  const lead = detail && view
    ? '你把细节接到了文化语境上：'
    : '可以试着把这句话放回视频的文化场景里：'
  return `${lead}${theme.theme} · ${theme.watchFor}${expr ? ` 卡片上的短引用「${expr.expression}」可以作为你说的那一句的落点。` : ''}`
}

function buildTranslation(args: { chinese: boolean; detail: boolean; view: boolean }): string {
  const core = args.chinese
    ? '把你的中文观点收束成一个可模仿的英文句型，并邀请你回视频里找一个具体细节'
    : args.detail && args.view
      ? '肯定你「具体细节 + 自己的观点」的做法，再追问换一个视角会怎么说'
      : args.detail
        ? '接住你描述的画面，请你把它变成一句带 because 的观点'
        : '先请你回忆视频里看到或听到的一个具体时刻，再谈看法'
  return `观后讨论引导者${core}；可折叠查看，不打断英文讨论流。`
}

/* ---------------- 开场白 ---------------- */

/** 观后讨论第一条引导者发言（不扮演人物，只给背景 + 一个细节型开放问题） */
export function postWatchOpeningLine(
  input: Pick<PostWatchInput, 'videoTitle' | 'videoTitleZh' | 'videoSummaryZh' | 'discussionSeeds' | 'culturalThemes'>,
): string {
  const q = input.discussionSeeds[0] || 'Which moment in the video would you describe first?'
  const theme = input.culturalThemes[0]?.theme || 'the cultural context'
  return `We have just watched "${input.videoTitle}". I am your post-watch discussion guide — not a person in the video, and I will not give you a "correct" reading. Before we discuss opinions, let us start with what you actually saw or heard. On the theme of ${theme}: ${q}`
}

/* ---------------- 可替换服务层 ---------------- */

let currentGenerator: GeneratePostWatchReply = async (input) => mockPostWatchTurn(input)

export function setPostWatchGenerator(fn: GeneratePostWatchReply): void { currentGenerator = fn }
export function resetPostWatchGenerator(): void {
  currentGenerator = async (input) => mockPostWatchTurn(input)
}

/** 可替换入口：默认 Mock，远程失败自动回退 */
export const generatePostWatchReply: GeneratePostWatchReply = (input) => currentGenerator(input)

function extractJson(content: string): Record<string, unknown> {
  const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('LLM 返回内容中没有 JSON')
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
}

/** 远程结果归一化：越界（角色扮演 / 无提问 / 过早结束）一律回退本地 Mock */
export function normalizePostWatchOutput(parsed: Record<string, unknown>, input: PostWatchInput): PostWatchOutput {
  const fallback = mockPostWatchTurn(input)
  const fb = (parsed.feedback || {}) as Record<string, unknown>
  const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : fallback.reply
  const roleplay = containsPostWatchRoleplay(reply)
  const hasQuestion = reply.includes('?') || Boolean(parsed.culturalBridge)
  if (roleplay || !hasQuestion) return fallback
  const level = fb.level === 'major' || fb.level === 'minor' ? fb.level : fallback.feedback.level
  const feedback: PostWatchFeedback = {
    level,
    content: typeof fb.content === 'string' && fb.content.trim() ? fb.content : fallback.feedback.content,
    language: typeof fb.language === 'string' && fb.language.trim() ? fb.language : fallback.feedback.language,
    corrected: typeof fb.corrected === 'string' && fb.corrected.trim() ? fb.corrected : fallback.feedback.corrected,
    praise: typeof fb.praise === 'string' && fb.praise.trim() ? fb.praise : fallback.feedback.praise,
  }
  return {
    reply,
    translation: typeof parsed.translation === 'string' && parsed.translation.trim() ? parsed.translation : fallback.translation,
    feedback,
    culturalBridge: typeof parsed.culturalBridge === 'string' && parsed.culturalBridge.trim()
      ? parsed.culturalBridge : fallback.culturalBridge,
    nextQuestion: typeof parsed.nextQuestion === 'string' && parsed.nextQuestion.trim() ? parsed.nextQuestion : fallback.nextQuestion,
    stageSummary: fallback.stageSummary,
    end: input.turn < 3 ? false : Boolean(parsed.end ?? fallback.end),
    /** [成长系统] 远程 effective 优先，缺失时用本地同一套规则兜底 */
    effective: typeof parsed.effective === 'boolean' ? parsed.effective : postWatchEffective(input),
  }
}

/** 独立 system prompt：明确区别于角色扮演与文本细读 */
export function postWatchSystemPrompt(input: PostWatchInput): string {
  return `You are the PostWatchDirectorAgent of LinguaBuddy, facilitating a POST-WATCH discussion about an embedded video. This is NEITHER role-play (you are not a character, never speak as a person in the video, never continue or rewrite the video) NOR literary close reading (there is no text to quote for evidence). Your method: first ask the learner to recall a CONCRETE audio-visual detail — "What did you actually see or hear?", "What did the person do at that moment?", "Why do you think they did that?" — and only then invite an opinion. Never announce a "correct" interpretation or a standard cultural answer. Cultural notes must be restrained and specific to this clip; never generalise about a whole nation or people. If the learner writes in Chinese, restate the idea as a short usable English frame and invite them to imitate it. Every 3rd or 4th turn add a brief Chinese stageSummary of viewpoints and expressions learned. Give feedback with BOTH "content" (did they respond to the video, did they give concrete details) AND "language" (light wording/sentence feedback), always with a specific praise. Reply in 2-3 English sentences and MUST contain one open question. Guidance: ${input.guidance}; learner level: ${input.difficulty}; caption preference: ${input.captionPreference}. You receive only video metadata, short original notes, cultural theme cards and short phrase-level quotations — NEVER a transcript or subtitle script. Return ONLY JSON: reply, translation (Chinese gist), feedback{level:none|minor|major,content,language,corrected,praise}, culturalBridge, nextQuestion, end(bool), effective(bool). ${EFFECTIVE_RULE_PROMPT}`
}

export function createRemotePostWatchGenerator(settings: Settings): GeneratePostWatchReply {
  return async (input) => {
    try {
      const history = buildPostWatchPayload(input).history as Array<{ role: string; text: string }>
      const res = await fetch(settings.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: settings.apiModel || 'gpt-4o-mini',
          temperature: 0.75,
          messages: [
            { role: 'system', content: postWatchSystemPrompt(input) },
            ...history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
            { role: 'user', content: JSON.stringify(buildPostWatchPayload(input)) },
          ],
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('响应格式不符合预期')
      return normalizePostWatchOutput(extractJson(content), input)
    } catch (err) {
      console.warn('[LinguaBuddy] 观后讨论远程调用失败，已回退本地 Mock：', err)
      return mockPostWatchTurn(input)
    }
  }
}

export function configurePostWatchGenerator(settings: Settings): void {
  if (settings.apiMode === 'custom' && settings.apiEndpoint.trim()) {
    setPostWatchGenerator(createRemotePostWatchGenerator(settings))
  } else {
    resetPostWatchGenerator()
  }
}

/* ---------------- 观后讨论报告 ---------------- */

export function buildPostWatchReport(
  session: PostWatchSession,
  analysis: { keyExpressions: Array<{ expression: string }>; discussionSeeds: string[] },
): PostWatchReport {
  const userMessages = session.messages.filter((m) => m.role === 'user')
  const solid = userMessages.filter((m) => m.feedback?.level === 'none')
  const viewpoints = solid.map((m) => m.text.trim().slice(0, 90)).slice(0, 3)
  const openQuestions = analysis.discussionSeeds
    .filter((q, i) => i >= Math.min(viewpoints.length, 2)).slice(0, 3)
  const allText = userMessages.map((m) => m.text.toLowerCase()).join(' ')
  const newExpressions = analysis.keyExpressions
    .filter((e) => allText.includes(e.expression.toLowerCase().replace(/[^a-z' -]/g, '')))
    .map((e) => e.expression)
  const xp = 12 + session.turns * 3 + solid.length * 4 + newExpressions.length * 2
  return {
    summary: `本场围绕「${session.videoTitleZh}」完成 ${session.turns} 轮观后讨论，形成 ${viewpoints.length} 条「具体细节 + 自己的观点」俱备的表达，用上 ${newExpressions.length} 条卡片短引用。评价只看是否回应了视频内容、是否给出具体细节，不设标准文化解读。`,
    viewpoints,
    openQuestions: openQuestions.length ? openQuestions : ['还有哪一个画面/声音细节值得再说一遍？'],
    newExpressions,
    xp,
    disclaimer: '观后小结是学习参考，不是对视频或文化的定论，也不是官方评分；观点由你提出，引导者只负责追问具体细节与文化语境。',
  }
}

/** 供测试与 UI：把一条用户发言包装成 PostWatchMessage */
export function postWatchUserMessage(text: string, speaker = '你'): PostWatchMessage {
  return {
    id: `pw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    role: 'user', speaker, text, at: Date.now(),
  }
}
