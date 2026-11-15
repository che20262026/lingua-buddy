/* ================================================================
 * 新增 Agent 2 —— LiteraryAnalyzerAgent
 *
 * 输入：单章文本 + 书籍元数据 + 目标难度
 * 输出：章节分析 JSON（含 chapterBrief）
 *
 * 硬约束：
 *   - 只接收 LiteraryChapter，接口层面拿不到全书；
 *   - 所有 themes / symbols / keyQuotes 的 evidence 必须命中本章原文，
 *     未命中的一律过滤（Mock 与真实 LLM 一视同仁），杜绝编造情节；
 *   - 每章生成 1-2 句 chapterBrief，供下一章研讨作前情摘要；
 *   - 远程生成失败自动回退本地 Mock，保持零后端可完整体验。
 * ================================================================ */

import type { Settings } from '../types'
import type {
  AnalyzeChapter, AnalyzeChapterInput, ChapterAnalysis, ChapterTheme,
  ChapterSymbol, KeyQuote,
} from '../literaryTypes'
import { condenseSummary, estimateCefr } from './literaryCurator'

const NORMALIZE = (s: string): string =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').toLowerCase().trim()

/** 证据是否逐字出现在单章原文中（纯函数，供冒烟测试直接调用） */
export function evidenceInChapter(chapterText: string, evidence: string): boolean {
  if (!evidence.trim()) return false
  return NORMALIZE(chapterText).includes(NORMALIZE(evidence))
}

/**
 * 证据闸门：把任何「书中找不到」的引文剔除。
 * 这是「不得编造情节」在代码层面的实现，而不是一句文档承诺。
 */
export function validateEvidence<T extends ChapterAnalysis>(analysis: T, chapterText: string): T {
  const themes = analysis.themes.filter((t) => evidenceInChapter(chapterText, t.evidence))
  const symbols = analysis.symbols.filter((s) => evidenceInChapter(chapterText, s.evidence))
  const keyQuotes = analysis.keyQuotes.filter((q) => evidenceInChapter(chapterText, q.quote))
  const total = analysis.themes.length + analysis.symbols.length + analysis.keyQuotes.length
  const kept = themes.length + symbols.length + keyQuotes.length
  return {
    ...analysis,
    themes, symbols, keyQuotes,
    evidenceValidated: kept === total,
  }
}

/** 保证恰好 3 个开放性问题，不足时用通用苏格拉底式追问补齐 */
function ensureQuestions(seed: string[], chapterTitle: string): string[] {
  const fallback = [
    `Which single line in ${chapterTitle} most changed your reading, and why?`,
    'What would someone who disagrees with you point to in the text?',
    'If the scene were told from another point of view, what would we notice first?',
  ]
  const out: string[] = []
  for (const q of [...seed, ...fallback]) {
    if (q && !out.includes(q)) out.push(q)
    if (out.length >= 3) break
  }
  return out.slice(0, 3)
}

function buildBrief(summary: string, themes: ChapterTheme[]): string {
  const core = condenseSummary(summary)
  const names = themes.slice(0, 2).map((t) => t.name).join('、')
  return names ? `${core}本章围绕${names}展开。` : core
}

/** 默认本地分析器：素材全部来自本章节选，无需任何 API */
export function mockAnalyzeChapter(input: AnalyzeChapterInput): ChapterAnalysis {
  const { chapter, book, targetDifficulty } = input
  const chapterText = chapter.paragraphs.join('\n\n')
  const estimated = estimateCefr(chapterText)
  // 目标难度只影响词汇选取数量，不覆盖从原文统计出的 CEFR
  const wordCap = targetDifficulty === 'A1' || targetDifficulty === 'A2' ? 3
    : targetDifficulty === 'B1' ? 5 : 8

  const base: ChapterAnalysis = {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    summaryZh: chapter.summaryZh,
    cefr: estimated,
    themes: chapter.seedThemes.slice(0, 4),
    characters: chapter.seedCharacters.slice(0, 4),
    symbols: chapter.seedSymbols.slice(0, 4),
    historicalContext: chapter.historicalContext
      || `${book.title}（${book.author}, ${book.year}）的教学节选；背景信息以本章文本为准。`,
    hardWords: chapter.glosses.slice(0, wordCap).map((g) => ({
      word: g.word, meaningZh: g.meaningZh, note: g.note,
    })),
    keyQuotes: chapter.keyQuotes.slice(0, 4),
    discussionQuestions: ensureQuestions(chapter.seedQuestions, chapter.title),
    chapterBrief: buildBrief(chapter.summaryZh, chapter.seedThemes),
    evidenceValidated: true,
    disclaimer: '分析仅依据本章原文节选；所有证据均经逐字校验，未命中者已剔除。分级简化与中文注释不参与证据校验。本结果为学习参考，不是文学定论，也不是官方评分。',
  }
  return validateEvidence(base, chapterText)
}

/* ---------------- 可替换服务层（与 generateDialogue 同款风格） ---------------- */

let currentAnalyzer: AnalyzeChapter = async (input) => mockAnalyzeChapter(input)

export function setChapterAnalyzer(fn: AnalyzeChapter): void {
  currentAnalyzer = fn
}

export function resetChapterAnalyzer(): void {
  currentAnalyzer = async (input) => mockAnalyzeChapter(input)
}

export const analyzeChapter: AnalyzeChapter = (input) => currentAnalyzer(input)

function extractJson(content: string): Record<string, unknown> {
  const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('LLM 返回内容中没有 JSON')
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
}

const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback

function arr<T>(v: unknown, map: (x: Record<string, unknown>) => T, fallback: T[]): T[] {
  if (!Array.isArray(v)) return fallback
  const out = v.filter((x) => x && typeof x === 'object').map((x) => map(x as Record<string, unknown>))
  return out.length ? out : fallback
}

/** 远程结果归一化：与 Mock 合并，再统一过证据闸门 */
export function normalizeChapterAnalysis(
  parsed: Record<string, unknown>, input: AnalyzeChapterInput,
): ChapterAnalysis {
  const fallback = mockAnalyzeChapter(input)
  const chapterText = input.chapter.paragraphs.join('\n\n')
  const themes = arr<ChapterTheme>(parsed.themes, (x) => ({
    name: str(x.name, ''), evidence: str(x.evidence, ''),
  }), fallback.themes).filter((t) => t.name)
  const symbols = arr<ChapterSymbol>(parsed.symbols, (x) => ({
    item: str(x.item, ''), meaning: str(x.meaning, ''), evidence: str(x.evidence, ''),
  }), fallback.symbols).filter((s) => s.item)
  const keyQuotes = arr<KeyQuote>(parsed.keyQuotes, (x) => ({
    quote: str(x.quote, ''), whyItMatters: str(x.whyItMatters, ''),
  }), fallback.keyQuotes).filter((q) => q.quote)
  const characters = arr(parsed.characters, (x) => ({
    name: str(x.name, ''), traits: str(x.traits, ''), arc: str(x.arc, ''),
  }), fallback.characters).filter((c) => c.name)
  const hardWords = arr(parsed.hardWords, (x) => ({
    word: str(x.word, ''), meaningZh: str(x.meaningZh, ''), note: str(x.note, ''),
  }), fallback.hardWords).filter((w) => w.word)
  const questions = Array.isArray(parsed.discussionQuestions)
    ? parsed.discussionQuestions.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    : []
  const cefr = str(parsed.cefr, fallback.cefr)
  const merged: ChapterAnalysis = {
    ...fallback,
    chapterTitle: str(parsed.chapterTitle, fallback.chapterTitle),
    summaryZh: str(parsed.summaryZh, fallback.summaryZh),
    cefr: (['A2', 'B1', 'B2', 'C1'].includes(cefr) ? cefr : fallback.cefr) as ChapterAnalysis['cefr'],
    themes, characters, symbols, keyQuotes, hardWords,
    historicalContext: str(parsed.historicalContext, fallback.historicalContext),
    discussionQuestions: ensureQuestions([...questions, ...fallback.discussionQuestions], input.chapter.title),
    chapterBrief: buildBrief(str(parsed.summaryZh, fallback.summaryZh), themes),
  }
  return validateEvidence(merged, chapterText)
}

/** 可选 OpenAI 兼容端点：payload 里只有「单章文本」，没有全书 */
export function createRemoteAnalyzer(settings: Settings): AnalyzeChapter {
  return async (input) => {
    try {
      const chapterText = input.chapter.paragraphs.join('\n\n')
      const sys = `You are the LiteraryAnalyzerAgent of LinguaBuddy. Analyze ONLY the single chapter excerpt provided. Never use knowledge of the rest of the book. Every "evidence" and every "quote" MUST be a verbatim short substring of the given chapter text; if you cannot find verbatim support, omit that item. Do NOT invent plot, characters, or quotations. Do NOT give a single "correct theme": present themes as reading hypotheses. Learner level: ${input.targetDifficulty}. Return ONLY JSON with keys: chapterTitle, summaryZh (2-3 Chinese sentences), cefr (A2/B1/B2/C1), themes[{name,evidence}], characters[{name,traits,arc}], symbols[{item,meaning,evidence}], historicalContext, hardWords[{word,meaningZh,note}], keyQuotes[{quote,whyItMatters}], discussionQuestions[3 open questions].`
      const res = await fetch(settings.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: settings.apiModel || 'gpt-4o-mini',
          temperature: 0.4,
          messages: [
            { role: 'system', content: sys },
            {
              role: 'user',
              content: JSON.stringify({
                bookTitle: input.book.title,
                author: input.book.author,
                year: input.book.year,
                chapterTitle: input.chapter.title,
                chapterExcerptRange: input.chapter.excerptRange,
                chapterText,
                targetDifficulty: input.targetDifficulty,
              }),
            },
          ],
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('响应格式不符合预期')
      return normalizeChapterAnalysis(extractJson(content), input)
    } catch (err) {
      console.warn('[LinguaBuddy] 章节分析远程调用失败，已回退本地 Mock：', err)
      return mockAnalyzeChapter(input)
    }
  }
}

/** 设置页变化时同步分析器（与 configureGenerator 并列调用） */
export function configureAnalyzer(settings: Settings): void {
  if (settings.apiMode === 'custom' && settings.apiEndpoint.trim()) {
    setChapterAnalyzer(createRemoteAnalyzer(settings))
  } else {
    resetChapterAnalyzer()
  }
}
