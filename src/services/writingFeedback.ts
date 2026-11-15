/**
 * WritingFeedbackEngine —— 结构级写作 / 翻译反馈（本轮唯一允许新增的引擎）
 *
 * 严格边界：
 * - 只回答「逻辑骨架是否清晰」「意群拆分是否合理」「情节是否推进」
 *   「是否承接上一句」「交际任务是否完成」「属于哪种母语负迁移模式」；
 * - 不做逐句语法纠错、不做发音评分、不给分数、不预测提分、不提供模板句型库；
 * - assessmentFocus 决定反馈优先级，而不是决定分数；
 * - 默认 100% 本地确定性实现（即 Mock 降级），无 API、无网络也能完整体验；
 *   自定义兼容端点只被允许补充「结构级结论文案」，不能改变上述边界。
 */

import type { AssessmentFocus, TrackUnit } from '../chinaTrackTypes'
import { FOCUS_PRIORITY } from '../chinaTrackTypes'
import type { Settings } from '../types'

export interface WritingFeedbackInput {
  unit: TrackUnit
  /** 对 content.scaffold 的逐条回答；未作答的用空串 */
  answers: string[]
  /** 用户英文产出（结构骨架 / 续写 / 交际任务 / 诊断说明） */
  draft: string
  /** 轨道 A / D 的诊断选项 */
  diagnosisChoice?: string
}

export interface FeedbackCheck {
  key: string
  label: string
  passed: boolean
  hint: string
}

export interface WritingFeedbackResult {
  focus: AssessmentFocus
  /** 结构级结论，不是分数、不是等级 */
  verdict: 'clear' | 'partial' | 'missing'
  headline: string
  checks: FeedbackCheck[]
  /** 按 focus 排序的反馈优先级（第 1 条永远是本轨最该看的东西） */
  priorities: string[]
  /** 轨道 D 的诊断结论 */
  diagnosis?: {
    pattern: string
    correct: boolean
    transferNote: string
    rewrite: string
    extraExamples: string[]
  }
  /** 地道搭配注释 */
  collocations: string[]
  nextStep: string
  /** 恒为 true：本引擎不输出分数 */
  noScore: true
  /** 是否走本地 Mock 实现 */
  isMock: boolean
  disclaimer: string
}

/** 引擎职责边界：README 与冒烟测试都引用这份常量 */
export const ENGINE_SCOPE = {
  does: [
    '逻辑骨架与因果/转折标记',
    '意群拆分与语序调整',
    '情节推进节点与衔接方向',
    '交际任务是否完成',
    '母语负迁移模式识别',
  ],
  doesNot: [
    '逐句语法纠错',
    '发音评分',
    '分数或等级预测',
    '提分承诺与「必考」话术',
    '模板句型库 / 万能句',
  ],
} as const

const DISCLAIMER = '这里只给结构级观察，不给分数、不预测考试结果，也不承诺提分。'

/* ---------------- 纯文本工具（不依赖 DOM，便于单测） ---------------- */

export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1)
}
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
export function countHits(text: string, words: string[]): number {
  const lower = text.toLowerCase()
  return words.reduce((n, w) => n + (lower.includes(w.toLowerCase()) ? 1 : 0), 0)
}
export function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text)
}

const LOGIC_MARKERS = [
  'because', 'so', 'although', 'though', 'however', 'while', 'whereas',
  'which', 'therefore', 'rather than', 'as a result', 'since', 'but', 'yet',
  'first', 'then', 'instead', 'that is why', 'as', 'unless',
]
/** 逐词死译的高频痕迹：只用于判断「是否还在照中文铺」，不是语法错误列表 */
const WORD_FOR_WORD_MARKS = [
  'very very', 'learn knowledge', 'improve our ability', 'improve ability',
  'is true', 'more bad', 'no spirit', 'enlarge eyesight', 'influence to',
]
const PAIRED_CONNECTORS = [
  /\bbecause\b[\s\S]*?\bso\b/i,
  /\balthough\b[\s\S]*?\bbut\b/i,
  /\bsince\b[\s\S]*?\btherefore\b/i,
]
const EMOTION_WORDS = [
  'happy', 'sad', 'excited', 'nervous', 'worried', 'moved', 'joy', 'tears',
  'cried', 'heart', 'felt', 'beautiful', 'wonderful', 'extremely', 'very',
  'dreamlike', 'emotional', 'upset', 'afraid', 'lonely',
]
const ACTION_WORDS = [
  'stepped', 'picked', 'lifted', 'handed', 'opened', 'turned', 'folded',
  'put', 'walked', 'reached', 'set', 'counted', 'read', 'held', 'pushed',
  'slipped', 'stopped', 'called', 'waited', 'decided', 'noticed', 'took',
  'gave', 'moved', 'let go', 'stepped in', 'sat', 'kept', 'looked',
]
const COHESION_MARKERS = [
  'he ', 'she ', 'they ', 'it ', 'his ', 'her ', 'their ', 'the ',
  'so ', 'but ', 'then ', 'when ', 'until ', 'as ', 'only when', 'before ',
]

function answered(answers: string[]): number {
  return answers.filter((a) => a && a.trim().length >= 2).length
}

function makeResult(
  unit: TrackUnit,
  checks: FeedbackCheck[],
  extras: Partial<WritingFeedbackResult> = {},
): WritingFeedbackResult {
  const passed = checks.filter((c) => c.passed).length
  const ratio = checks.length ? passed / checks.length : 0
  const verdict: WritingFeedbackResult['verdict'] = ratio >= 0.75 ? 'clear' : ratio >= 0.4 ? 'partial' : 'missing'
  const p = FOCUS_PRIORITY[unit.assessmentFocus]
  const firstMiss = checks.find((c) => !c.passed)
  const headline = verdict === 'clear'
    ? `${p.title} · 这一版结构已经站住了`
    : verdict === 'partial'
      ? `${p.title} · 主要结构在，但还有一处没接上`
      : `${p.title} · 先别急着改词，把结构补上`
  return {
    focus: unit.assessmentFocus,
    verdict,
    headline,
    checks,
    priorities: [p.first, p.notFirst, ...ENGINE_SCOPE.doesNot.slice(0, 2).map((x) => `本引擎不做：${x}`)],
    collocations: unit.content.collocationNotes ?? [],
    nextStep: firstMiss ? firstMiss.hint : '结构已经清楚，可以照这个顺序再写一段，或换同轨道的另一张卡。',
    noScore: true,
    isMock: true,
    disclaimer: DISCLAIMER,
    ...extras,
  }
}

/* ---------------- 四个 focus 的结构级判定 ---------------- */

function evaluateLogic(input: WritingFeedbackInput): WritingFeedbackResult {
  const { unit, answers, draft } = input
  const scaffold = unit.content.scaffold ?? []
  const needed = Math.max(1, Math.ceil(scaffold.length / 2))
  const got = answered(answers)
  const wfMarks = WORD_FOR_WORD_MARKS.filter((m) => draft.toLowerCase().includes(m))
  const paired = PAIRED_CONNECTORS.some((re) => re.test(draft))
  const checks: FeedbackCheck[] = [
    {
      key: 'scaffold', label: '先列了逻辑骨架',
      passed: scaffold.length === 0 || got >= needed,
      hint: `先把 ${scaffold.length} 个引导问题里至少 ${needed} 个写成英文短句，再展开正文。`,
    },
    {
      key: 'logic_markers', label: '因果 / 转折在字面上可见',
      passed: countHits(draft, LOGIC_MARKERS) >= 1,
      hint: '用一个 because / however / which 把关系写出来，读者不用猜就能看出因果和转折。',
    },
    {
      key: 'not_literal', label: '没有停在逐词死译',
      passed: !hasChinese(draft) && wfMarks.length === 0 && !paired,
      hint: '出现了中文或「very very / learn knowledge / because…so」这类逐词痕迹；先换语序和搭配，别先换高级词。',
    },
    {
      key: 'expanded', label: '骨架展开成了完整英文句子',
      passed: wordCount(draft) >= 12 && splitSentences(draft).length >= 1,
      hint: '把骨架展开成至少 12 个英文词的句子，允许改变语序，不允许逐词对应中文。',
    },
  ]
  return makeResult(unit, checks)
}

function evaluateContinuation(input: WritingFeedbackInput): WritingFeedbackResult {
  const { unit, answers, draft } = input
  const scaffold = unit.content.scaffold ?? []
  const got = answered(answers)
  const actions = countHits(draft, ACTION_WORDS)
  const emotions = countHits(draft, EMOTION_WORDS)
  const checks: FeedbackCheck[] = [
    {
      key: 'logic_questions', label: '先答了人物关系 / 未解张力 / 情感落点',
      passed: scaffold.length === 0 || got >= Math.min(2, scaffold.length),
      hint: '动笔前先答至少两个逻辑问题：人物立场是什么、哪件事还没解决、情绪停在哪里。',
    },
    {
      key: 'plot_advances', label: '情节真的往前走了一步',
      passed: actions >= 2,
      hint: '补一个「人物做了什么」的具体动作（如 lifted / handed / stepped），让处境发生变化。',
    },
    {
      key: 'not_emotion_only', label: '没有用情绪描写替代情节',
      passed: actions > 0 ? emotions <= actions * 2 : false,
      hint: '情绪词比动作多太多；删掉几个 very / excited / nervous，换成可见的动作。',
    },
    {
      key: 'coheres', label: '承接了上一句的人物状态与方向',
      passed: countHits(draft, COHESION_MARKERS) >= 1 && !hasChinese(draft),
      hint: '用代词、人名或 so / but / then 把这一句挂回上一句，别中途换任务或开始写景。',
    },
  ]
  return makeResult(unit, checks)
}

function evaluateTask(input: WritingFeedbackInput): WritingFeedbackResult {
  const { unit, draft } = input
  const keys = unit.content.taskKeys ?? []
  const hit = countHits(draft, keys)
  const sentences = splitSentences(draft)
  const checks: FeedbackCheck[] = [
    {
      key: 'min_sentences', label: '把 2–3 句说完了',
      passed: sentences.length >= 2,
      hint: '再补一句：这个任务只要 2–3 句就算完成，不需要长段落，也不需要完美语法。',
    },
    {
      key: 'task_keys', label: '完成了这个交际任务',
      passed: keys.length === 0 || hit >= 1,
      hint: `试着用上目标表达，例如「${keys.slice(0, 3).join(' / ') || 'I think ... because ...'}」。`,
    },
    {
      key: 'own_words', label: '说出了自己的内容，而不是只回一个词',
      passed: wordCount(draft) >= 8 && !hasChinese(draft),
      hint: '加一个具体细节（时间、原因或一个动作），让对方有话可接。',
    },
    {
      key: 'no_grammar_gate', label: '任务完成判定不看语法与发音',
      passed: true,
      hint: '这一轨不评发音、不纠语法；把话接住就是完成。',
    },
  ]
  return makeResult(unit, checks)
}

function evaluateDiagnosis(input: WritingFeedbackInput): WritingFeedbackResult {
  const { unit, answers, draft, diagnosisChoice } = input
  const key = unit.content.diagnosisKey ?? ''
  const correct = Boolean(key) && diagnosisChoice === key
  const checks: FeedbackCheck[] = [
    {
      key: 'diagnosis', label: '认出了这是哪一种中式英语模式',
      passed: correct,
      hint: key
        ? `再对照三个例句看一次：它们共同的模式是「${key}」。`
        : '先看例句的共同点，再选一个模式。',
    },
    {
      key: 'reasoned', label: '写下了自己的判断依据',
      passed: answered(answers) >= 1 || wordCount(draft) >= 6,
      hint: '用一句中文或英文说说你为什么这么判断，比直接看答案更有助于记住模式。',
    },
    {
      key: 'no_score', label: '本卡只给诊断，不给分数',
      passed: true,
      hint: '这里没有对错分，只有模式识别；诊断完直接看地道改写与地道搭配注释。',
    },
  ]
  return makeResult(unit, checks, {
    diagnosis: {
      pattern: unit.content.targetPattern,
      correct,
      transferNote: unit.content.transferNote ?? '',
      rewrite: unit.content.rewriteExample,
      extraExamples: unit.content.extraExamples ?? [],
    },
  })
}

/** 纯函数：按 assessmentFocus 分派，永远返回结构级结果 */
export function evaluateWriting(input: WritingFeedbackInput): WritingFeedbackResult {
  switch (input.unit.assessmentFocus) {
    case 'continuation_coherence': return evaluateContinuation(input)
    case 'task_completion': return evaluateTask(input)
    case 'chinglish_diagnosis': return evaluateDiagnosis(input)
    case 'logic_structure':
    default: return evaluateLogic(input)
  }
}

/* ---------------- 可替换服务层（Mock 优先，远程只补文案） ---------------- */

export type WritingFeedbackProvider =
  (input: WritingFeedbackInput) => WritingFeedbackResult | Promise<WritingFeedbackResult>

let provider: WritingFeedbackProvider | null = null

export function setWritingFeedbackProvider(fn: WritingFeedbackProvider | null): void { provider = fn }
export function resetWritingFeedbackProvider(): void { provider = null }

/**
 * 远程归一化：只允许覆盖「结构级结论文案」，其余字段一律取本地结果，
 * 保证自定义端点也无法把本引擎变成语法检查器或打分器。
 */
export function normalizeRemoteFeedback(
  base: WritingFeedbackResult,
  parsed: Record<string, unknown>,
): WritingFeedbackResult {
  const remoteChecks = Array.isArray(parsed.checks) ? parsed.checks as Array<{ passed?: unknown }> : []
  const checks = base.checks.map((c, i) => ({
    ...c,
    passed: typeof remoteChecks[i]?.passed === 'boolean' ? remoteChecks[i].passed as boolean : c.passed,
  }))
  return {
    ...base,
    checks,
    headline: typeof parsed.headline === 'string' ? parsed.headline.slice(0, 80) : base.headline,
    nextStep: typeof parsed.nextStep === 'string' ? parsed.nextStep.slice(0, 120) : base.nextStep,
    isMock: false,
    // 下面三项无论远程返回什么都不放开
    noScore: true,
    priorities: base.priorities,
    disclaimer: DISCLAIMER,
  }
}

export function createRemoteProvider(settings: Settings): WritingFeedbackProvider {
  return async (input) => {
    const base = evaluateWriting(input)
    try {
      const res = await fetch(settings.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: settings.apiModel || 'gpt-4o-mini',
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: `You are the STRUCTURE-ONLY WritingFeedbackEngine of LinguaBuddy. assessmentFocus=${input.unit.assessmentFocus}. You may ONLY comment on logic structure, idea-group splitting, plot advancement, continuation coherence, task completion, and L1-transfer pattern diagnosis. NEVER correct grammar sentence by sentence, NEVER score, NEVER predict exam results, NEVER promise score gains, NEVER provide template sentences. Return ONLY JSON: headline(string), checks(array of {passed:boolean} matching ${base.checks.length} items), nextStep(string).`,
            },
            { role: 'user', content: JSON.stringify({
              struggle: input.unit.struggle,
              targetPattern: input.unit.content.targetPattern,
              sourceText: input.unit.content.sourceText,
              scaffold: input.unit.content.scaffold ?? [],
              answers: input.answers,
              draft: input.draft,
            }) },
          ],
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('响应格式不符合预期')
      const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start < 0 || end < start) throw new Error('响应中没有 JSON')
      return normalizeRemoteFeedback(base, JSON.parse(cleaned.slice(start, end + 1)))
    } catch (err) {
      console.warn('[LinguaBuddy] 结构级远程反馈失败，已回退本地 Mock：', err)
      return base
    }
  }
}

/** 设置页变化时同步；默认（mock / 无端点）永远是本地确定性实现 */
export function configureWritingFeedback(settings: Settings): void {
  if (settings.apiMode === 'custom' && settings.apiEndpoint.trim()) {
    provider = createRemoteProvider(settings)
  } else {
    provider = null
  }
}

/** 统一入口：任何异常都回退本地结构级结果，练习不中断 */
export async function requestWritingFeedback(input: WritingFeedbackInput): Promise<WritingFeedbackResult> {
  const base = evaluateWriting(input)
  if (!provider) return base
  try {
    const out = await provider(input)
    return { ...out, noScore: true, priorities: base.priorities, disclaimer: DISCLAIMER }
  } catch (err) {
    console.warn('[LinguaBuddy] 结构级反馈异常，已回退本地 Mock：', err)
    return base
  }
}
