/* ================================================================
 * 新增 Agent 2 —— CultureAnalyzerAgent
 *
 * 输入：视频元数据 + 用户提供的短注释 / 原创摘要（或 Mock 数据）。
 * 输出：文化主题 / 关键表达短引用 / 背景卡 / 讨论种子问题。
 *
 * 硬约束：
 *   - AnalyzeVideoCultureInput 类型层面没有 transcript / captions / fullText 字段，
 *     从源头杜绝「整段字幕全文进单次 LLM 调用」；
 *   - keyExpressions 只收录单句 / 短语级短引用，超长一律截断或剔除；
 *   - backgroundCard ≤ 150 字；文化说明克制、不做刻板印象（附免责声明）；
 *   - 远程生成失败自动回退本地 Mock，保持零后端可完整体验。
 * ================================================================ */

import type { Settings } from '../types'
import type {
  AnalyzeVideoCulture, AnalyzeVideoCultureInput, BackgroundCard, CulturalTheme,
  CultureAnalysis, KeyExpression,
} from '../cultureTypes'
import { PLATFORM_POLICIES, SHORT_QUOTE_NOTE } from '../data/cultureSeed'

/** 短引用上限：短语 / 单句级别，绝不复制整段台词或字幕脚本 */
export const MAX_EXPRESSION_CHARS = 90
export const MAX_BACKGROUND_CHARS = 150

/** 背景卡上限（150 字） */
export function clampBackground(text: string): string {
  const t = text.trim()
  return t.length <= MAX_BACKGROUND_CHARS ? t : `${t.slice(0, MAX_BACKGROUND_CHARS - 1)}…`
}

/**
 * 短引用闸门：超长 / 多句 / 带字幕时间轴特征的内容一律拒绝。
 * 这是「不复制完整字幕脚本」在代码层面的实现。
 */
export function isShortQuote(expression: string): boolean {
  const t = expression.trim()
  if (!t || t.length > MAX_EXPRESSION_CHARS) return false
  // 一整段台词（>1 句）或明显的时间轴文本不算短引用
  if ((t.match(/[.!?]/g) || []).length > 1) return false
  if (/-->\s*\d{2}:\d{2}|\d{2}:\d{2}:\d{2},\d{3}/.test(t)) return false
  return true
}

/** 讨论种子：保证恰好 3 个开放问题，且都指向视频具体细节 */
function ensureSeeds(seed: string[], title: string): string[] {
  const fallback = [
    `Which specific moment in "${title}" stayed with you, and what did you see or hear there?`,
    'What did the speaker/person actually do at that moment? Describe one concrete detail.',
    'How would the same scene be described differently in your own context?',
  ]
  const out: string[] = []
  for (const q of [...seed, ...fallback]) {
    if (q && !out.includes(q)) out.push(q)
    if (out.length >= 3) break
  }
  return out.slice(0, 3)
}

/** 默认本地分析器：素材全部来自视频元数据里的原创注释，无需任何 API */
export function mockAnalyzeVideoCulture(input: AnalyzeVideoCultureInput): CultureAnalysis {
  const { video, userNotes } = input
  const policy = PLATFORM_POLICIES[video.platform]

  const themes: CulturalTheme[] = video.seedThemes.map((s) => ({
    theme: s.theme, briefZh: s.briefZh, watchFor: s.watchFor,
  }))

  // 只保留短语级短引用，并统一挂上「非字幕」来源标注
  const keyExpressions: KeyExpression[] = video.seedExpressions
    .filter((e) => isShortQuote(e.expression))
    .slice(0, 5)
    .map((e) => ({ ...e, sourceNote: e.sourceNote || SHORT_QUOTE_NOTE }))

  const noteSuffix = userNotes.length
    ? ` 你为本条内容补了 ${userNotes.length} 条原创短注释，讨论时可优先引用自己记下的细节。`
    : ''

  const backgroundCard: BackgroundCard = {
    title: `${video.titleZh} · 文化背景`,
    contentZh: clampBackground(
      `${video.summaryZh} 来源为${policy.label}（${policy.tier === 'open-license' ? '明确开放许可' : '官方嵌入播放器'}）。${policy.note}${noteSuffix}`,
    ),
  }

  return {
    videoId: video.id,
    culturalThemes: themes,
    keyExpressions,
    backgroundCard,
    discussionSeeds: ensureSeeds(video.seedQuestions, video.title),
    disclaimer: '文化背景说明只针对这条视频的场景，属学习参考，不是对任何国家或群体的整体概括，也不构成刻板印象判断。应用内只展示带来源与大致时间段的短引用，不复制完整字幕脚本；字幕请用播放器自带 CC。',
  }
}

/* ---------------- 可替换服务层（与 generateDialogue 同款风格） ---------------- */

let currentAnalyzer: AnalyzeVideoCulture = async (input) => mockAnalyzeVideoCulture(input)

export function setVideoCultureAnalyzer(fn: AnalyzeVideoCulture): void { currentAnalyzer = fn }
export function resetVideoCultureAnalyzer(): void {
  currentAnalyzer = async (input) => mockAnalyzeVideoCulture(input)
}

/** 可替换入口：默认 Mock，远程失败自动回退 */
export const analyzeVideoCulture: AnalyzeVideoCulture = (input) => currentAnalyzer(input)

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

/**
 * 远程结果归一化：与 Mock 合并，再统一过「短引用闸门」。
 * 真实 LLM 若吐出整段台词或字幕脚本，同样会被剔除。
 */
export function normalizeVideoCulture(
  parsed: Record<string, unknown>, input: AnalyzeVideoCultureInput,
): CultureAnalysis {
  const fallback = mockAnalyzeVideoCulture(input)
  const themes = arr<CulturalTheme>(parsed.culturalThemes, (x) => ({
    theme: str(x.theme, ''), briefZh: str(x.briefZh, ''), watchFor: str(x.watchFor, ''),
  }), fallback.culturalThemes).filter((t) => t.theme)
  const keyExpressions = arr<KeyExpression>(parsed.keyExpressions, (x) => ({
    expression: str(x.expression, ''), meaningZh: str(x.meaningZh, ''),
    context: str(x.context, ''), timestampHint: str(x.timestampHint, ''),
    sourceNote: str(x.sourceNote, SHORT_QUOTE_NOTE),
  }), fallback.keyExpressions)
    .filter((e) => isShortQuote(e.expression))
    .slice(0, 5)
  const bg = (parsed.backgroundCard || {}) as Record<string, unknown>
  const seeds = Array.isArray(parsed.discussionSeeds)
    ? parsed.discussionSeeds.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    : []
  return {
    ...fallback,
    culturalThemes: themes.slice(0, 4),
    keyExpressions: keyExpressions.length ? keyExpressions : fallback.keyExpressions,
    backgroundCard: {
      title: str(bg.title, fallback.backgroundCard.title),
      contentZh: clampBackground(str(bg.contentZh, fallback.backgroundCard.contentZh)),
    },
    discussionSeeds: ensureSeeds([...seeds, ...fallback.discussionSeeds], input.video.title),
  }
}

/** 只把允许注入的字段交给远程端点；payload 里绝不含字幕全文 */
export function buildCulturePayload(input: AnalyzeVideoCultureInput): Record<string, unknown> {
  const { video, userNotes, targetDifficulty } = input
  return {
    title: video.title,
    titleZh: video.titleZh,
    platform: video.platform,
    theme: video.theme,
    cefr: video.cefr,
    durationLabel: video.durationLabel,
    summaryZh: video.summaryZh,
    seedThemes: video.seedThemes,
    seedQuestions: video.seedQuestions,
    seedExpressions: video.seedExpressions.map((e) => ({ expression: e.expression, meaningZh: e.meaningZh })),
    // 用户自有短注释（原创，不是字幕），最多 8 条
    userNotes: userNotes.slice(-8).map((n) => n.text),
    targetDifficulty,
  }
}

/** 可选 OpenAI 兼容端点：payload 里只有元数据 + 短注释 */
export function createRemoteCultureAnalyzer(settings: Settings): AnalyzeVideoCulture {
  return async (input) => {
    try {
      const sys = `You are the CultureAnalyzerAgent of LinguaBuddy. You receive ONLY video metadata plus the learner's own short notes and an ORIGINAL summary. You will NEVER receive a transcript or captions. Do NOT reproduce any video dialogue, subtitle script, or long quotation. "keyExpressions" may contain ONLY single phrases or one short sentence (max ${MAX_EXPRESSION_CHARS} chars), each with meaningZh, context and an approximate timestampHint. Cultural notes must be accurate and restrained: describe the specific scene, never generalise about a whole nation or people, avoid stereotypes. "backgroundCard.contentZh" must be under ${MAX_BACKGROUND_CHARS} Chinese characters. Learner level: ${input.targetDifficulty}. Return ONLY JSON with keys: culturalThemes[{theme,briefZh,watchFor}], keyExpressions[{expression,meaningZh,context,timestampHint}], backgroundCard{title,contentZh}, discussionSeeds[3 open questions about concrete video details].`
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
            { role: 'user', content: JSON.stringify(buildCulturePayload(input)) },
          ],
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('响应格式不符合预期')
      return normalizeVideoCulture(extractJson(content), input)
    } catch (err) {
      console.warn('[LinguaBuddy] 文化分析远程调用失败，已回退本地 Mock：', err)
      return mockAnalyzeVideoCulture(input)
    }
  }
}

/** 设置页变化时同步分析器（与 configureGenerator / configureAnalyzer 并列调用） */
export function configureCultureAnalyzer(settings: Settings): void {
  if (settings.apiMode === 'custom' && settings.apiEndpoint.trim()) {
    setVideoCultureAnalyzer(createRemoteCultureAnalyzer(settings))
  } else {
    resetVideoCultureAnalyzer()
  }
}
