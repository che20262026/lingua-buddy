/* ================================================================
 * 新增 Agent 3 —— SeminarDirectorAgent
 *
 * 与 DialogueDirectorAgent 完全独立：
 *   ✗ 不扮演小说角色  ✗ 不续写小说  ✗ 不做情景模拟  ✗ 不给标准答案 / 正确主题
 *   ✓ 苏格拉底式追问  ✓ 索要原文证据  ✓ 论证 + 语言双反馈  ✓ 中文观点给英文可模仿表达
 *   ✓ 每 3-4 轮轻量小结  ✓ 复用 level / praise 字段兼容现有反馈卡
 *
 * 上下文硬约束：SeminarInput 里只有 chapterText（单章）、chapterBrief（1-2 句）、
 * 主题/人物/引文卡、历史发言。类型层面就不存在「全书」字段。
 * ================================================================ */

import type { Settings } from '../types'
import type {
  ChapterCharacter, ChapterTheme, GenerateSeminar, KeyQuote, SeminarFeedback,
  SeminarInput, SeminarMessage, SeminarOutput, SeminarReport, SeminarSession,
} from '../literaryTypes'
/** [成长系统] 有效轮次判定：XP 只奖励「完成单元」，规则同时写进远程 prompt */
import { EFFECTIVE_RULE_PROMPT, isEffectiveTurn } from './effectiveTurn'

/** [成长系统] 本地 Mock 与远程缺失字段时共用的有效轮次规则 */
export function seminarEffective(input: SeminarInput): boolean {
  return isEffectiveTurn(input.userInput, {
    previous: [...input.history].reverse().find((m) => m.role === 'user')?.text,
  })
}

const CHINESE_RE = /[\u4e00-\u9fff]/
const CLAIM_RE = /\b(i think|i believe|in my view|i would say|i'd argue|it seems to me|my reading is|because|perhaps|maybe|i suspect|i feel|the reason|i read this as)\b/i
const CONNECTOR_RE = /\b(because|so|however|therefore|although|but|while|which means|as a result)\b/i
const TEXT_REFERENCE_RE = /\b(says|the line|the text|the passage|the word|the phrase|the narrator|in chapter|quotes?|evidence)\b/i

/** 极轻量的表达规则（研讨反馈只给「轻量语言反馈」，不做全套语法批改） */
const LIGHT_RULES: Array<{ re: RegExp; to: string; note: string }> = [
  { re: /\bi am agree\b/gi, to: 'I agree', note: 'agree 是动词，前面不需要 am' },
  { re: /\bdiscuss about\b/gi, to: 'discuss', note: 'discuss 后面不加 about' },
  { re: /\bmore better\b/gi, to: 'better', note: 'better 本身已是比较级' },
  { re: /\bi very like\b/gi, to: 'I like ... very much', note: 'very 不直接修饰动词 like' },
  { re: /\b(he|she|it) don't\b/gi, to: "$1 doesn't", note: '第三人称单数用 doesn\'t' },
]

export interface LightIssue { note: string; fixed: string }

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

/** 用户发言里是否真的引用了本章原文（4 词连续片段命中） */
export function findEvidenceInText(userText: string, chapterText: string): number {
  const words = (s: string) => (s.toLowerCase().match(/[a-z][a-z'-]*/g) || [])
  const u = words(userText)
  const c = words(chapterText)
  if (u.length < 4 || c.length < 4) return 0
  const shingle = (arr: string[], i: number) => arr.slice(i, i + 4).join(' ')
  const seen = new Set<string>()
  for (let i = 0; i <= c.length - 4; i++) seen.add(shingle(c, i))
  let hits = 0
  for (let i = 0; i <= u.length - 4; i++) if (seen.has(shingle(u, i))) hits++
  return hits
}

export function hasTextEvidence(input: SeminarInput): boolean {
  const raw = input.userInput.trim()
  return findEvidenceInText(raw, input.chapterText) > 0
    || (/["“”]/.test(raw) && TEXT_REFERENCE_RE.test(raw))
    || (TEXT_REFERENCE_RE.test(raw) && raw.split(/\s+/).length >= 8)
}

export function hasClaim(input: SeminarInput): boolean {
  const raw = input.userInput.trim()
  return CLAIM_RE.test(raw) || /我觉得|我认为|因为|也许|可能|我的看法/.test(raw)
}

/** 角色扮演检测器：真实 LLM 若越界，输出会被替换回引导者语气 */
export function containsRoleplay(reply: string, characterNames: string[]): boolean {
  const t = reply.toLowerCase()
  if (/\b(i am|i'm|as)\s+(the\s+)?(ghost|scrooge|alice|holmes|watson|caterpillar|white rabbit|mr\. bennet|mrs\. bennet|bingley|john)\b/.test(t)) return true
  if (characterNames.some((n) => {
    const name = n.toLowerCase().trim()
    return name.length > 2 && (t.includes(`i am ${name}`) || t.includes(`as ${name}, i`))
  })) return true
  if (/\b(in character|let us act| imagine i am|speaking as)\b/.test(t)) return true
  return false
}

/** 只把允许注入的字段交给远程端点；从构造处杜绝「整本书」 */
export function buildSeminarPayload(input: SeminarInput): Record<string, unknown> {
  return {
    chapterTitle: input.chapterTitle,
    chapterText: input.chapterText,
    chapterBrief: input.chapterBrief,
    themes: input.themes,
    characters: input.characters,
    keyQuotes: input.keyQuotes,
    discussionQuestions: input.discussionQuestions,
    history: input.history.slice(-8).map((m) => ({ role: m.role, text: m.text })),
    userInput: input.userInput,
    role: input.role,
    guidance: input.guidance,
    difficulty: input.difficulty,
    turn: input.turn,
    /** [成长系统] 把有效轮次判定标准随 payload 交给自定义端点 */
    effectiveRule: EFFECTIVE_RULE_PROMPT,
  }
}

/* ---------------- 引导语料 ---------------- */

const PROBES: Record<SeminarInput['role'], Record<SeminarInput['guidance'], string[]>> = {
  guide: {
    light: [
      'That is an interesting reading. What first gave you that impression?',
      'I would like to hear a little more. Which part of the passage stayed with you?',
      'Thank you for sharing that. Where would you like to take the question next?',
    ],
    medium: [
      'That is a clear reading. Which single line in this chapter supports it most strongly?',
      'Why do you think the writer chose to show it that way?',
      'If another reader disagreed, what might they point to in the same passage?',
    ],
    strong: [
      'You have offered a reading. What exactly in the text makes you say that, and which line would you quote?',
      'What assumption does your reading depend on? Could the same line support the opposite view?',
      'What would count as evidence against your own interpretation here?',
    ],
  },
  peer: {
    light: [
      'I follow you. Can I ask what first gave you that impression?',
      'That is a nice angle. Would you say more about it?',
      'I had not noticed that. What made you pick it out?',
    ],
    medium: [
      'I read it a little differently, and I am curious why you chose that line. What in the text convinced you?',
      'Could we test that idea against one short quotation from the chapter?',
      'How would the scene look from another character\'s point of view?',
    ],
    strong: [
      'I want to push back gently: which sentence actually licenses that conclusion?',
      'If we take the opposite position, what in the passage would we lean on instead?',
      'What would change your mind about this reading?',
    ],
  },
}

const OPENERS = {
  hasBoth: [
    'You have given a position and pointed back to the text — that is the move a seminar is built on.',
    'Good: a claim plus a piece of evidence. Let us see how far that reading can travel.',
    'That is a well-grounded reading of this chapter.',
  ],
  claimOnly: [
    'I hear a clear position in what you said.',
    'That is a definite reading, and it is worth testing.',
    'You have taken a stance, which is the hardest first step.',
  ],
  evidenceOnly: [
    'You went back to the passage, which is exactly right.',
    'Thank you for bringing the text into the conversation.',
    'That quotation is a good place to start from.',
  ],
  thin: [
    'This is a good starting point, and I would like to help you make it more arguable.',
    'There is the beginning of an idea here.',
    'Let us slow down and build this into a claim we can examine.',
  ],
} as const

function pick<T>(pool: readonly T[], seed: number): T {
  return pool[Math.abs(seed) % pool.length]
}

function modelExpression(theme: string): string {
  return `I read ${theme ? `the theme of ${theme}` : 'this detail'} as important here, because the text says ...`
}

/* ---------------- 默认 Mock 生成器 ---------------- */

export function mockSeminarTurn(input: SeminarInput): SeminarOutput {
  const raw = (input.userInput || '').trim()
  const chinese = CHINESE_RE.test(raw)
  const claim = hasClaim(input)
  const evidence = !chinese && hasTextEvidence(input)
  const issues = chinese ? [] : collectLightIssues(raw)
  const wordCount = chinese ? 0 : raw.split(/\s+/).filter(Boolean).length
  const themeName = input.themes[0]?.name || 'this chapter'
  const characterNames = input.characters.map((c) => c.name)
  const turn = input.turn
  const round = turn + 1

  let opener: string
  let probe: string
  let extra: string

  if (chinese) {
    // 中文观点：不假装翻译，先给一个可模仿的英文框架，再邀请回原文找证据
    opener = `Your point is worth keeping. In English you could say: "${modelExpression(themeName)}".`
    probe = `Which line in this chapter would you put after "because" to support that reading?`
    extra = `Take one short quotation from the passage and try the frame again in your own words.`
  } else if (claim && evidence) {
    opener = pick(OPENERS.hasBoth, turn)
    probe = pick(PROBES[input.role][input.guidance], turn)
    extra = input.guidance === 'strong'
      ? 'Consider whether the same words could be read the other way round.'
      : 'Try extending the claim by one more sentence of reasoning.'
  } else if (claim) {
    opener = pick(OPENERS.claimOnly, turn)
    probe = pick(PROBES[input.role][input.guidance], turn)
    extra = 'Before we go further, find one short line in the passage that a reader could check.'
  } else if (evidence) {
    opener = pick(OPENERS.evidenceOnly, turn)
    probe = pick(PROBES[input.role][input.guidance], turn)
    extra = 'Now add your own "I think ... because ..." so the quotation becomes an argument.'
  } else {
    opener = pick(OPENERS.thin, turn)
    probe = pick(PROBES[input.role][input.guidance], turn)
    extra = 'A claim plus one quoted line is all we need for the next step.'
  }

  const reply = `${opener} ${probe} ${extra}`
  const nextQuestion = input.discussionQuestions[turn % Math.max(input.discussionQuestions.length, 1)]
    || 'Which line in the passage would you choose as evidence?'

  const feedback = buildSeminarFeedback({ input, chinese, claim, evidence, issues, wordCount, themeName, extra })
  const stageSummary = round % 3 === 0 && !input.forceEnd
    ? `阶段小结（第 ${round} 轮）：我们已经围绕「${themeName}」交换了 ${round} 次看法；目前达成的观点有 ${input.history.filter((m) => m.role === 'user' && m.feedback?.level === 'none').length} 条带证据支撑，待探索的问题是「${nextQuestion}」。这里没有标准答案，只有能不能回到原文自圆其说。`
    : undefined

  return {
    reply,
    translation: buildTranslation({ chinese, claim, evidence, role: input.role }),
    feedback,
    evidencePrompt: evidence ? undefined
      : `回原文找一句能支持你判断的短句——可以点「回原文找证据」直接跳到相关段落。本章可留意的引文：「${input.keyQuotes[turn % Math.max(input.keyQuotes.length, 1)]?.quote || themeName}」`,
    nextQuestion,
    stageSummary,
    end: Boolean(input.forceEnd) || round >= 8,
    /** [成长系统] 有效轮次才发 XP */
    effective: seminarEffective(input),
  }
}

function buildSeminarFeedback(args: {
  input: SeminarInput; chinese: boolean; claim: boolean; evidence: boolean
  issues: LightIssue[]; wordCount: number; themeName: string; extra: string
}): SeminarFeedback {
  const { input, chinese, claim, evidence, issues, wordCount, themeName } = args
  let argument: string
  if (claim && evidence) argument = '观点明确，而且主动回到原文找了依据，论证链完整。'
  else if (claim) argument = '你有清楚的判断，但这一轮还没有把原文短句摆出来；下一步找一句能支撑它的引文。'
  else if (evidence) argument = '你引用了文本，很好；再补一句「所以我认为……」，论证就完整了。'
  else argument = '这一轮更接近描述；试着把「我觉得……因为……」说完整，让观点可被检验。'
  if (CONNECTOR_RE.test(input.userInput)) argument += '连接词让层次更清楚。'

  let language: string
  if (chinese) language = '中文完全可以表达观点；下一轮可以挑一句英文框架照着说，哪怕只有一个从句也很好。'
  else if (issues.length) language = issues.map((i) => i.note).join('；') + '。'
  else if (wordCount < 6) language = '句子偏短，加一个 because 从句就能把理由带出来。'
  else if (wordCount > 45) language = '信息量很足；试着拆成两句，让主张与证据各自站住。'
  else language = '用词与句式都能把意思说清楚，没有影响理解的表达问题。'

  const corrected = chinese
    ? modelExpression(themeName)
    : issues.length
      ? issues[issues.length - 1].fixed
      : !claim && !evidence && wordCount >= 4
        ? `I think ${themeName} matters here, because the text says "..."`
        : ''

  const praise = evidence
    ? `你把「${themeName}」和原文短句连起来看了，这一步正是文学研讨最要紧的动作。`
    : claim
      ? `在没有标准答案的地方先给出自己的判断，这比背一个结论难得多。`
      : `愿意先把想法说出来，讨论就有了可以一起打磨的材料。`

  const level: SeminarFeedback['level'] = issues.length ? 'major'
    : !claim || !evidence || chinese || wordCount < 6 ? 'minor' : 'none'

  return { level, argument, language, corrected: corrected || undefined, praise }
}

function buildTranslation(args: {
  chinese: boolean; claim: boolean; evidence: boolean; role: SeminarInput['role']
}): string {
  const who = args.role === 'guide' ? '研讨引导者' : '学习同伴'
  const core = args.chinese
    ? '把你的中文观点收束成一个可模仿的英文句型，并邀请你回原文补证据'
    : args.claim && args.evidence
      ? '肯定你「观点 + 证据」的做法，再追问这条引文还能不能撑得住反方解读'
      : args.claim
        ? '接住你的判断，然后请你回原文找一句可核对的短引'
        : '先帮你把想法变成一个可讨论的主张，再给一个开放问题'
  return `${who}${core}；可折叠查看，不打断英文研讨流。`
}

/* ---------------- 开场白 ---------------- */

/** 研讨页第一条引导者发言（不扮演角色，只给前情 + 一个开放问题） */
export function seminarOpeningLine(input: Pick<SeminarInput, 'chapterBrief' | 'chapterTitle' | 'discussionQuestions' | 'role' | 'themes'>): string {
  const who = input.role === 'guide' ? '研讨引导者' : '学习同伴'
  const q = input.discussionQuestions[0] || 'Which line in this chapter would you start with?'
  const theme = input.themes[0]?.name || 'this chapter'
  return `Welcome to our seminar on ${input.chapterTitle}. ${input.chapterBrief} I am your ${input.role === 'guide' ? 'discussion guide' : 'fellow reader'} (${who}), not a character from the book, and I will not give you a "correct" answer. Let us begin with ${theme}: ${q}`
}

/* ---------------- 可替换服务层 ---------------- */

let currentGenerator: GenerateSeminar = async (input) => mockSeminarTurn(input)

export function setSeminarGenerator(fn: GenerateSeminar): void { currentGenerator = fn }
export function resetSeminarGenerator(): void { currentGenerator = async (input) => mockSeminarTurn(input) }

export const generateSeminar: GenerateSeminar = (input) => currentGenerator(input)

function extractJson(content: string): Record<string, unknown> {
  const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('LLM 返回内容中没有 JSON')
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
}

/** 远程结果归一化：越界（角色扮演 / 无提问 / 过早结束）一律回退本地 Mock */
export function normalizeSeminarOutput(parsed: Record<string, unknown>, input: SeminarInput): SeminarOutput {
  const fallback = mockSeminarTurn(input)
  const fb = (parsed.feedback || {}) as Record<string, unknown>
  const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : fallback.reply
  const characterNames = input.characters.map((c) => c.name)
  const roleplay = containsRoleplay(reply, characterNames)
  const hasQuestion = reply.includes('?') || Boolean(parsed.evidencePrompt)
  if (roleplay || !hasQuestion) return fallback
  const level = fb.level === 'major' || fb.level === 'minor' ? fb.level : fallback.feedback.level
  const feedback: SeminarFeedback = {
    level,
    argument: typeof fb.argument === 'string' && fb.argument.trim() ? fb.argument : fallback.feedback.argument,
    language: typeof fb.language === 'string' && fb.language.trim() ? fb.language : fallback.feedback.language,
    corrected: typeof fb.corrected === 'string' && fb.corrected.trim() ? fb.corrected : fallback.feedback.corrected,
    praise: typeof fb.praise === 'string' && fb.praise.trim() ? fb.praise : fallback.feedback.praise,
  }
  return {
    reply,
    translation: typeof parsed.translation === 'string' && parsed.translation.trim() ? parsed.translation : fallback.translation,
    feedback,
    evidencePrompt: typeof parsed.evidencePrompt === 'string' ? parsed.evidencePrompt : fallback.evidencePrompt,
    nextQuestion: typeof parsed.nextQuestion === 'string' && parsed.nextQuestion.trim() ? parsed.nextQuestion : fallback.nextQuestion,
    stageSummary: fallback.stageSummary,
    // 前三轮绝不允许自动结束，保证至少能完成 4 轮分析性对话
    end: input.turn < 3 ? false : Boolean(parsed.end ?? fallback.end),
    /** [成长系统] 远程 effective 优先，缺失时用本地同一套规则兜底 */
    effective: typeof parsed.effective === 'boolean' ? parsed.effective : seminarEffective(input),
  }
}

export function createRemoteSeminarGenerator(settings: Settings): GenerateSeminar {
  return async (input) => {
    try {
      const sys = `You are the SeminarDirectorAgent of LinguaBuddy, a Socratic literature seminar facilitator. You are NOT a character in the novel and must never role-play, continue the story, or speak as a fictional person. Never announce a "correct theme" or standard answer. Your reply is 2-4 English sentences and MUST contain one open question or one request for textual evidence. Ask "Why do you think so?", "Which line in the text supports that?", "What if we read it from another character's point of view?". If the learner writes in Chinese, restate the idea as a short usable English frame and invite them to try it. Every 3rd or 4th turn, add a brief stageSummary in Chinese listing agreed points and open questions. Give feedback with BOTH argument quality (claim / evidence / logic) AND light language feedback (wording, sentence, naturalness), always with a specific praise. Guidance strength: ${input.guidance}; facilitator role: ${input.role}; learner difficulty: ${input.difficulty}. Return ONLY JSON: reply, translation (Chinese gist), feedback{level:none|minor|major,argument,language,corrected,praise}, evidencePrompt, nextQuestion, end(bool), effective(bool). ${EFFECTIVE_RULE_PROMPT}`
      const history = buildSeminarPayload(input).history as Array<{ role: string; text: string }>
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
            { role: 'system', content: sys },
            ...history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
            { role: 'user', content: JSON.stringify(buildSeminarPayload(input)) },
          ],
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('响应格式不符合预期')
      return normalizeSeminarOutput(extractJson(content), input)
    } catch (err) {
      console.warn('[LinguaBuddy] 研讨生成远程调用失败，已回退本地 Mock：', err)
      return mockSeminarTurn(input)
    }
  }
}

export function configureSeminarGenerator(settings: Settings): void {
  if (settings.apiMode === 'custom' && settings.apiEndpoint.trim()) {
    setSeminarGenerator(createRemoteSeminarGenerator(settings))
  } else {
    resetSeminarGenerator()
  }
}

/* ---------------- 研讨报告 ---------------- */

/** 结束研讨时生成报告：只统计本场证据使用与新增词汇，不改动现有 CoachAgent 逻辑 */
export function buildSeminarReport(
  session: SeminarSession,
  analysis: { hardWords: Array<{ word: string }>; themes: ChapterTheme[]; characters: ChapterCharacter[]; keyQuotes: KeyQuote[]; discussionQuestions: string[] },
): SeminarReport {
  const userMessages = session.messages.filter((m) => m.role === 'user')
  const evidenceHits = userMessages.filter((m) => m.feedback?.level === 'none').length
  const agreedPoints = userMessages
    .filter((m) => m.feedback?.level === 'none')
    .map((m) => m.text.trim().slice(0, 90))
    .slice(0, 3)
  const openQuestions = analysis.discussionQuestions.filter((q, i) => i >= Math.min(agreedPoints.length, 2)).slice(0, 3)
  const allText = userMessages.map((m) => m.text.toLowerCase()).join(' ')
  const newWords = analysis.hardWords
    .filter((w) => allText.includes(w.word.toLowerCase().replace(/[^a-z'-]/g, '')))
    .map((w) => w.word)
  const xp = 12 + session.turns * 3 + evidenceHits * 4 + newWords.length * 2
  return {
    summary: `本场围绕「${session.chapterTitle}」完成 ${session.turns} 轮研讨，形成 ${agreedPoints.length} 条带原文依据的观点，使用 ${newWords.length} 个本章重点词。研讨不设标准答案，评价只看观点、证据与逻辑是否自洽。`,
    agreedPoints,
    openQuestions: openQuestions.length ? openQuestions : ['还有哪一处的原文值得再读一遍？'],
    evidenceHits,
    newWords,
    xp,
    disclaimer: '研讨小结是学习参考，不是文学定论，也不是官方评分；观点由你提出，引导者只负责追问与索要证据。',
  }
}

/** 供测试与 UI：把一条用户发言包装成 SeminarMessage */
export function userMessage(text: string, speaker = '你'): SeminarMessage {
  return { id: `sm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, role: 'user', speaker, text, at: Date.now() }
}
