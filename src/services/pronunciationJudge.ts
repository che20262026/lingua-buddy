/**
 * [AI 发音评测] 前端评测服务
 * ------------------------------------------------------------------
 * 职责：把「目标单词 + 用户识别文本」发给 /.netlify/functions/evaluate，
 *      拿回结构化评分，并把所有失败路径收敛成一句友好的中文提示。
 *
 * 为什么单独一个服务文件（而不是塞进 dialogueDirector）：
 *   - 对话与评测是两条独立业务线，失败语义、限流码、UI 出口都不同；
 *   - 评测服务不依赖 UI，也不反向依赖对话服务，两边互不牵连。
 *
 * 失败分类（前端自己识别状态码，不依赖浏览器特性）：
 *   rate-limited → 429，被限流
 *   unavailable  → 5xx / 网络故障 / 响应不合法
 *   invalid      → 4xx（参数不合法）
 * ⚠️ 这里**刻意不**依赖 PerformanceObserver 的 responseStatus：
 *   那是 Chrome 109+ 独有的 API，Safari / Firefox 上拿不到状态码，
 *   429 会被静默吞掉。fetch 层显式识别才是跨浏览器的可靠做法。
 */

/** 全应用唯一的发音评测端点（Netlify 生产与本地 Vite 代理同一路径，不做 rewrite） */
export const PRONUNCIATION_ENDPOINT = '/.netlify/functions/evaluate'

/** 后端上游 9s 超时 + 网络往返，留足余量 */
const JUDGE_TIMEOUT_MS = 15_000

/** 统一的友好提示：评测失败与被限流都回这句（与后端 JUDGE_RESTING_MESSAGE 对齐） */
export const JUDGE_RESTING_MESSAGE = '考官正在休息，请稍后再试'

export type JudgeFailureReason = 'rate-limited' | 'unavailable' | 'invalid' | 'aborted'

export interface PronunciationVerdict {
  /** 0–100 的整数分数 */
  score: number
  /** AI 给出的中文发音建议（已清洗，可能为空串） */
  suggestion: string
  model?: string
  provider?: string
}

/** 带分类的评测异常：UI 靠 reason 决定文案与是否允许重试 */
export class PronunciationJudgeError extends Error {
  readonly reason: JudgeFailureReason
  /** 服务端回传的技术细节（只作诊断小字展示，不作为主标题） */
  readonly detail: string

  constructor(reason: JudgeFailureReason, detail = '') {
    super(JUDGE_RESTING_MESSAGE)
    this.name = 'PronunciationJudgeError'
    this.reason = reason
    this.detail = detail
  }
}

/** 失败原因 → 用户看到的主文案。全部收敛成同一句，避免暴露实现细节 */
export function judgeFailureMessage(reason: JudgeFailureReason): string {
  if (reason === 'aborted') return '评测已取消，考官还没来得及打分。'
  return JUDGE_RESTING_MESSAGE
}

/** 建议清洗（与后端同口径的防御性处理：上游输出永远当不可信数据） */
function cleanSuggestion(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const noTags = raw.replace(/<[^>]*>/g, '')
  const noMd = noTags.replace(/[*_`#]+/g, '')
  return noMd.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** 分数校验：非有限数一律判为无效；有效则钳制到 0–100 并取整 */
export function normalizeScore(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * 发一次评测请求。
 * 任何异常路径都抛 PronunciationJudgeError（携带 reason），
 * 调用方只需要 catch 一次即可拿到可展示的文案。
 */
export async function judgePronunciation(input: {
  targetWord: string
  userSpokenText: string
  signal?: AbortSignal
}): Promise<PronunciationVerdict> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (input.signal) {
    if (input.signal.aborted) controller.abort()
    else input.signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  try {
    const res = await fetch(PRONUNCIATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        targetWord: input.targetWord,
        userSpokenText: input.userSpokenText,
      }),
      signal: controller.signal,
    })

    /* 用 text() + JSON.parse：本地 Vite dev 无函数代理时该路径会回落到
       index.html（text/html）；解析失败一律判为 unavailable，不把异常抛给界面 */
    const raw = await res.text()
    let data: {
      ok?: boolean
      score?: unknown
      suggestion?: unknown
      error?: unknown
      rateLimited?: boolean
      model?: unknown
      provider?: unknown
    }
    try {
      data = JSON.parse(raw) as typeof data
    } catch {
      throw new PronunciationJudgeError(res.status === 429 ? 'rate-limited' : 'unavailable', `HTTP ${res.status}`)
    }

    if (res.status === 429) {
      throw new PronunciationJudgeError('rate-limited', typeof data.error === 'string' ? data.error : 'HTTP 429')
    }
    if (res.status >= 400 && res.status < 500) {
      throw new PronunciationJudgeError('invalid', typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
    }
    if (!res.ok || data.ok !== true) {
      throw new PronunciationJudgeError('unavailable', typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
    }

    const score = normalizeScore(data.score)
    if (score === null) {
      throw new PronunciationJudgeError('unavailable', '考官没有给出可解析的分数')
    }

    return {
      score,
      suggestion: cleanSuggestion(data.suggestion),
      model: typeof data.model === 'string' ? data.model : undefined,
      provider: typeof data.provider === 'string' ? data.provider : undefined,
    }
  } catch (err) {
    if (err instanceof PronunciationJudgeError) throw err
    /* AbortError 来自我们自己的超时或外部取消 */
    const name = (err as { name?: string })?.name
    if (name === 'AbortError') throw new PronunciationJudgeError('aborted', '请求超时或已取消')
    throw new PronunciationJudgeError('unavailable', err instanceof Error ? err.message : String(err))
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener('abort', onExternalAbort)
  }
}
