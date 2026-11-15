import type { AnalysisResult, CEFR, GrammarPoint, IeltsFit, Keyword, Phrase } from '../types'
import { clamp, contentWords, extractNames, splitSentences, uid } from '../lib/utils'
import {
  buildGenericScenarios, buildSampleScenarios, FALLBACK_GRAMMAR, FALLBACK_PHRASES,
  GRAMMAR_RULES, lookupWord, PHRASE_RULES, TOPIC_RULES, WORD_BANK,
} from '../data/mockData'
import { getIeltsLevel, ieltsBandFromCefr, ieltsLevelByBand, type IeltsLevelId } from '../data/ieltsLevels'

/* ================================================================
 * Agent 1 —— TextAnalyzerAgent
 * 输入：用户文本 + 目标难度；输出：完整分析结果 JSON
 * 纯本地启发式实现，无网络依赖，任意文本都不会崩溃
 * ================================================================ */

const LEVELS: CEFR[] = ['A1', 'A2', 'B1', 'B2', 'C1']

export interface AnalyzeInput {
  text: string
  targetDifficulty: CEFR
  /** 用户的雅思口语目标档位，用于生成「文本适配度」建议 */
  ieltsLevelId?: IeltsLevelId
}

function estimateLevel(text: string, sentences: string[], words: string[]): CEFR {
  const avgLen = sentences.length ? words.length / sentences.length : 8
  const rare = words.filter((w) => w.length >= 8 || !WORD_BANK[w]).length
  const rareRatio = words.length ? rare / words.length : 0.3
  const subordination = /\b(because|although|which|that|while|if|when|however|therefore)\b/i.test(text) ? 1 : 0
  const score = avgLen * 0.34 + rareRatio * 3.6 + subordination * 0.6
  if (score < 3.4) return 'A1'
  if (score < 4.6) return 'A2'
  if (score < 6.1) return 'B1'
  if (score < 7.8) return 'B2'
  return 'C1'
}

function blend(estimated: CEFR, target: CEFR): CEFR {
  const e = LEVELS.indexOf(estimated)
  const t = LEVELS.indexOf(target)
  return LEVELS[clamp(Math.round(e * 0.7 + t * 0.3), 0, LEVELS.length - 1)]
}

function detectTopic(text: string, words: string[]): string {
  for (const rule of TOPIC_RULES) if (rule.re.test(text)) return rule.topic
  return `关于 ${words[0] || '日常生活'} 的话题`
}

function makeSummary(text: string, topic: string, words: string[], names: string[]): string {
  const isSample = /farmers' market/i.test(text) && /salad/i.test(text)
  if (isSample) {
    return 'Lily 和 Tom 上周末逛了农夫市集，买了新鲜苹果并聊到健康饮食。Lily 想做一顿简单晚餐却拿不准选什么蔬菜，Tom 建议胡萝卜和西红柿，两人最后决定一起做沙拉。'
  }
  const who = names.length ? names.slice(0, 2).join(' 和 ') : '文中人物'
  const focus = words.slice(0, 3).join('、') || topic
  const first = splitSentences(text)[0] || text.slice(0, 90)
  return `这段文字围绕「${topic}」展开，涉及 ${who ? who + '的经历与' : ''}${focus} 等内容。开头提到：${first.slice(0, 62)}${first.length > 62 ? '…' : ''}`
}

function pickKeywords(text: string, words: string[]): Keyword[] {
  const known = words.filter((w) => WORD_BANK[w] || WORD_BANK[w.replace(/s$/, '')] || WORD_BANK[w.replace(/ed$/, '')])
  const pool = [...known, ...words].filter((w, i, arr) => arr.indexOf(w) === i)
  const picked = pool.slice(0, 8)
  while (picked.length < 5) picked.push(['idea', 'plan', 'story', 'question', 'together'][picked.length] || 'idea')
  return picked.map(lookupWord)
}

function pickPhrases(text: string): Phrase[] {
  const hits: Phrase[] = []
  for (const rule of PHRASE_RULES) {
    if (rule.re.test(text)) hits.push({ phrase: rule.phrase, meaning: rule.meaning, example: rule.example })
  }
  for (const p of FALLBACK_PHRASES) {
    if (hits.length >= 5) break
    if (!hits.some((h) => h.phrase === p.phrase)) hits.push(p)
  }
  return hits.slice(0, 6)
}

function pickGrammar(text: string): GrammarPoint[] {
  const hits = GRAMMAR_RULES.filter((r) => r.re.test(text)).map(({ point, explanation }) => ({ point, explanation }))
  for (const g of FALLBACK_GRAMMAR) {
    if (hits.length >= 3) break
    if (!hits.some((h) => h.point === g.point)) hits.push(g)
  }
  return hits.slice(0, 5)
}

function isSampleLike(text: string): boolean {
  return /farmers' market/i.test(text) && /(apples|vegetables|salad)/i.test(text)
}

/** 文本难度与雅思档位的适配度：告诉用户这段素材该练什么 */
function buildIeltsFit(rawCefr: CEFR, targetId?: IeltsLevelId): IeltsFit {
  const band = ieltsBandFromCefr(rawCefr)
  const fitLevel = ieltsLevelByBand(band)
  const target = getIeltsLevel(targetId)
  const gap = band - target.bandValue
  const relation = gap > 1
    ? '略高于当前目标档，适合当作挑战素材'
    : gap < -1
      ? '低于当前目标档，正好用来把简单内容说得更漂亮'
      : '与当前目标档匹配，适合直接开练'
  return {
    band: fitLevel.band,
    levelId: fitLevel.id,
    note: `这段文本的语言难度接近雅思口语 Band ${band.toFixed(1)} 素材，${relation}。`,
    focus: target.focus.slice(0, 2),
  }
}

/** 同步分析；返回结构可直接写入 lingua_texts */
export function analyzeText(input: AnalyzeInput): AnalysisResult {
  const text = (input.text || '').trim()
  const sentences = splitSentences(text)
  const words = contentWords(text)
  const names = extractNames(text)
  const topic = detectTopic(text, words)
  const rawCefr = estimateLevel(text, sentences, words)
  const cefr = blend(rawCefr, input.targetDifficulty)
  const ieltsFit = buildIeltsFit(rawCefr, input.ieltsLevelId)
  const scenarios = isSampleLike(text)
    ? buildSampleScenarios()
    : buildGenericScenarios(topic, words.length ? words : ['the text', 'the idea', 'the story'], names)

  return {
    id: uid('text'),
    sourceText: text,
    topic,
    cefr,
    summary: makeSummary(text, topic, words, names),
    keywords: pickKeywords(text, words),
    phrases: pickPhrases(text),
    grammar: pickGrammar(text),
    scenarios,
    ieltsFit,
    createdAt: Date.now(),
  }
}

/** 预留接口：未来可把 TextAnalyzerAgent 换成远程 LLM，只需实现同样签名 */
export type TextAnalyzer = typeof analyzeText
