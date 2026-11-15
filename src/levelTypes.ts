/**
 * 统一 CEFR 等级层数据契约（内容过滤器，不是新的学习流程）
 *
 * 设计原则（详见 README 第二十章）：
 * - 等级是「建议」不是「门槛」：只改内容池筛选范围，不锁内容、不扣 XP、不清进度；
 * - 三个模块（对话 / 阅读 / 视频）共用同一套字段与 LevelFilterService；
 * - 每个资源单元必须带 cefrBasis（≥3 项依据），可解释、可审计；
 * - 用户跳级/留级只改 lingua_level_preference，绝不改动资源本身的 cefr；
 * - 不自动升降级，不输出 CEFR 分数或证书。
 */

export type LevelCefr = 'A2' | 'B1' | 'B2' | 'C1'
export type LevelModule = 'dialogue' | 'reading' | 'video'
export type LevelSource = 'expert' | 'estimated' | 'user_override'

export const LEVELS: LevelCefr[] = ['A2', 'B1', 'B2', 'C1']
export const LEVEL_MODULES: LevelModule[] = ['dialogue', 'reading', 'video']

/** 难度依据：至少填写 3 项，不能只有标签 */
export interface CefrBasis {
  /** 词汇覆盖率 0–1（常用词表内比例） */
  vocabCoverage?: number
  /** 平均句长（词） */
  avgSentenceLength?: number
  syntaxComplexity?: 'simple' | 'compound' | 'complex'
  /** 视频专用：语速 WPM */
  speechRateWpm?: number
  pragmaticLoad?: 'low' | 'medium' | 'high'
  accentDiversity?: 'single' | 'limited' | 'multi'
}

/** 三个模块共用的等级元数据 */
export interface LevelMeta {
  cefr: LevelCefr
  cefrBasis: CefrBasis
  /** expert = 专家标注 / 锚点校准；estimated = 系统估算；user_override = 预留给用户手动标注单条资源 */
  levelSource: LevelSource
  /** 一句话说明为什么定在这个等级 */
  levelNotes: string
}

/** 分级内容池条目：只描述内容与来源，不承载播放 / 对话逻辑 */
export interface ContentItem extends LevelMeta {
  id: string
  module: LevelModule
  title: string
  titleZh?: string
  /** 内容来源标识，如 original / slanglane_reference / gutenberg / bbc_learning */
  source: string
  sourceLabel: string
  licenseNote: string
  /** 视频专用：官方嵌入是否可用；不可嵌入时降级外链 */
  embeddable?: boolean
  embedMode?: 'official' | 'external' | 'placeholder'
  /** 映射到既有资源 id（场景 / 书籍 / 视频），不改变既有数据 */
  refId?: string
  /** 阅读专用：章节粒度筛选 */
  chapterId?: string
  chapterCefr?: LevelCefr
  blurb: string
  tags: string[]
}

/* ---------------- 等级偏好（第 30 键 lingua_level_preference） ---------------- */

export interface LevelHistoryEntry {
  from: LevelCefr
  to: LevelCefr
  /** ISO 时间 */
  at: string
  action: 'promote' | 'demote' | 'reset'
  /** 作用范围：单模块 / 全部模块 */
  scope: 'module' | 'all'
  module: LevelModule
}

export interface LevelPreference {
  /** 来自问卷自评 / 轻量定位测试；用户不能直接手改 */
  recommended: LevelCefr
  /** 当前生效等级（全局）；单模块以 perModule 为准 */
  active: LevelCefr
  mode: 'recommended' | 'manual'
  history: LevelHistoryEntry[]
  perModule: Record<LevelModule, LevelCefr>
  /** 「显示全部等级」开关，跳级后仍可访问全部内容 */
  showAllLevels: boolean
  /** 可选 3 题轻量自评结果，不输出分数、不阻塞 */
  assessment?: { answers: [number, number, number]; suggested: LevelCefr; at: string }
  version: number
}

export const DEFAULT_LEVEL_PREFERENCE: LevelPreference = {
  recommended: 'B1',
  active: 'B1',
  mode: 'recommended',
  history: [],
  perModule: { dialogue: 'B1', reading: 'B1', video: 'B1' },
  showAllLevels: false,
  version: 1,
}

/** 每个等级的一句话说明，展示在等级面板里 */
export const LEVEL_INFO: Record<LevelCefr, { title: string; summary: string }> = {
  A2: {
    title: 'A2 · 短句起步',
    summary: '短句为主、最常用词汇、单一语用功能（问候 / 请求 / 确认），语速 ≤130 WPM。',
  },
  B1: {
    title: 'B1 · 说清想法',
    summary: '中等句长、可出现从句，能组合「表达观点 + 有限同意」，语速 130–160 WPM。',
  },
  B2: {
    title: 'B2 · 多轮协商',
    summary: '含语用隐含（礼貌打断、间接异议）、多口音、跨文化话题，语速 160–190 WPM。',
  },
  C1: {
    title: 'C1 · 复杂语用',
    summary: '快速语流、讽刺与委婉、学术研讨、交互式 Transcript 定位证据，语速 ≥190 WPM。',
  },
}

/** 3 题轻量自评（不评分、不正式测评、用户可接受也可忽略） */
export const SELF_ASSESSMENT_QUESTIONS = [
  { text: '我读一段英文新闻', options: ['很吃力', '能读懂大意', '基本无障碍'] },
  { text: '我听一段无字幕的英语视频', options: ['只能抓关键词', '能跟上大意', '大部分能听懂'] },
  { text: '我在对话中', options: ['需要先想中文再翻译', '能直接说简单句', '能进行多轮讨论'] },
] as const

export const NO_LEVEL_HARM = [
  '跳级不锁内容：仍可用「显示全部等级」看到全部资源',
  '留级不扣 XP、不清进度、不触发任何负向提示',
  '不按答题表现自动升/降级，调整始终由用户主动发起',
  '不做正式等级考试、不输出 CEFR 分数或证书',
] as const

export function basisCount(basis: CefrBasis): number {
  return Object.values(basis).filter((v) => v !== undefined && v !== null).length
}

export function levelRank(level: LevelCefr): number {
  const i = LEVELS.indexOf(level)
  return i < 0 ? 1 : i
}

export function levelAt(rank: number): LevelCefr {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, rank))]
}

/** 只改偏好、不改资源：返回一份新的偏好对象（纯函数） */
export function isManual(pref: LevelPreference, module: LevelModule): boolean {
  return pref.perModule[module] !== pref.recommended
}
