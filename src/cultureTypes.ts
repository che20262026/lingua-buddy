/* ================================================================
 * 「文化视角视频」Culture Watch —— 全部新增类型，独立于现有 types.ts
 *
 * 设计原则：
 *   - 与 literaryTypes.ts 同构：单独一个文件，旧 types.ts 只做「接线」；
 *   - 与现有 CEFR 联合类型同构（重复声明，避免循环 type import）；
 *   - 视频只记录「元数据 + 官方嵌入参数」，类型层面不存在
 *     videoBlob / streamUrl / fullCaptionText 之类的字段，
 *     从源头杜绝「下载 / 转存 / 抓流 / 复制完整字幕」。
 * ================================================================ */

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
export type FeedbackLevel = 'none' | 'minor' | 'major'
export type CaptionPreference = 'on' | 'off' | 'bilingual'
export type GuidanceStrength = 'light' | 'medium' | 'strong'

/** 视频主题分类（书架/首页筛选维度）
 *  [修改点] 三层储量体系把 4 类扩展到 6 类；旧 4 个值一字不改，属于纯追加 */
export type CultureTheme =
  | 'daily-life'
  | 'festivals'
  | 'work-social'
  | 'history-landmarks'
  | 'science-nature'
  | 'arts-media'

/**
 * 允许接入的平台白名单（最高优先级硬约束）。
 *
 * 第一优先级：明确开放许可 / 可嵌入
 *   ted    —— TED / TED-Ed，CC BY-NC-ND 4.0，官方 embed.ted.com 可嵌入，保留署名
 *   pexels —— Pexels 免费视频，License 允许使用
 *   pixabay—— Pixabay 免费视频，Content License 允许使用
 *   cc     —— 明确标注 Creative Commons 或公有领域的教育视频
 *
 * 第二优先级：官方嵌入播放器
 *   youtube—— 仅通过 YouTube IFrame Player API / youtube-nocookie.com 官方嵌入
 *   voa    —— VOA Learning English，嵌入视为链接行为，不存储副本
 *
 * 明确排除（不在枚举里 = 编译期就无法接入）：
 *   BBC    —— 许可限制通常不允许自由嵌入；若需提及，只能「链接到原页面」（linkOnly）
 *   任何版权不明、来源不明、用户上传的影视切片、需破解播放地址的内容
 */
export type VideoPlatform = 'ted' | 'pexels' | 'pixabay' | 'cc' | 'youtube' | 'voa'

/** 嵌入方式：官方 iframe / 仅链接到原页面 / 纯占位（Mock） */
export type EmbedMode = 'iframe' | 'linkOnly' | 'placeholder'

/** 每个平台对应的许可与合规说明（UI 展示 + 白名单校验） */
export interface PlatformPolicy {
  id: VideoPlatform
  label: string
  tier: 'open-license' | 'official-embed'
  license: string
  attribution: string
  /** 官方嵌入域名白名单，buildOfficialEmbedUrl 会逐字校验 */
  allowedHosts: string[]
  note: string
}

/* ---------------- 视频元数据 ---------------- */

/** 分段观看标记：由元数据预配置，不在客户端解析字幕 */
export interface VideoSegment {
  id: string
  label: string
  /** 起始秒；仅用于官方播放器的 start 参数或展示，不解析视频流 */
  startSec: number
  hintZh: string
}

/**
 * 「关键表达」短引用：单句或短语级别，标注来源与大致时间戳。
 * 严禁放完整字幕脚本 / 整段台词；Mock 数据全部为原创示例注释。
 */
export interface KeyExpression {
  expression: string
  meaningZh: string
  /** 在视频的什么场景下出现（原创中文描述，不是字幕抄录） */
  context: string
  /** 可选，大致时间段（如 "01:10–01:35"），不是逐字字幕时间轴 */
  timestampHint?: string
  /** 短引用出处标注 */
  sourceNote?: string
}

/** 用户提供的短注释 / 原创摘要（分析器的输入素材，不是字幕全文） */
export interface VideoNote {
  id: string
  text: string
  createdAt: number
}

export interface CultureVideo {
  id: string
  title: string
  titleZh: string
  platform: VideoPlatform
  theme: CultureTheme
  tags: string[]
  cefr: CefrLevel
  /** 时长（秒），仅元数据 */
  durationSec: number
  durationLabel: string
  /** 是否允许嵌入；false 时 UI 必须降级为「在新窗口观看」 */
  embeddable: boolean
  embedMode: EmbedMode
  /**
   * 官方嵌入用的「视频 ID / slug」，不是 URL、不是播放地址、不是流地址。
   * buildOfficialEmbedUrl() 会依据平台拼成官方 embed 域名。
   */
  embedId?: string
  /** 在原平台观看的正规页面 URL（降级 / 署名用） */
  watchUrl: string
  /** 署名（TED CC BY-NC-ND 要求保留） */
  attribution: string
  /** 许可说明 */
  licenseNote: string
  /** 原创剧情/内容梗概（1-3 句中文），供分析器与背景卡使用，不是字幕 */
  summaryZh: string
  /** 封面占位：原创渐变 + 装饰符号，不使用任何第三方剧照 */
  emblem: string
  coverFrom: string
  coverTo: string
  blurb: string
  /** 预配置分段（可为空） */
  segments: VideoSegment[]
  /** 原创示例短引用（3-5 条，全部短语/单句，不复制字幕全文） */
  seedExpressions: KeyExpression[]
  /** 研讨种子问题 / 文化主题素材 */
  seedThemes: CulturalThemeSeed[]
  seedQuestions: string[]
  /** 平台是否自带官方字幕（UI 只用播放器自带 CC，不重新渲染字幕全文） */
  nativeCaptions: boolean
  /** 用户自有、明确标注可嵌入的条目（预留，不开放任意上传） */
  custom?: boolean

  /* ---------------- [修改点] 三层储量体系的扩展字段 ----------------
   * 全部为可选：旧 5 条手配条目与旧存档无需改动即可通过类型检查，
   * 由 cultureLibraryMigration.ts 在初始化时补齐并按 seed:true 标记。
   * 完整必填契约见 cultureLibraryTypes.ts 的 LibraryVideoEntry。
   * ---------------------------------------------------------------- */
  /** 内容来源（VOA / TED-Ed / British Council / Pexels / Pixabay / TED） */
  source?: string
  /** 官方视频 ID / slug；没有可验证 ID 时为空串，绝不编造 */
  videoId?: string
  /** 所属播放列表 ID（可选） */
  playlistId?: string
  /** 6 类主题；旧条目由迁移从 theme 继承 */
  topic?: CultureTheme
  /** 原创文化主题标签（字符串数组） */
  culturalThemes?: string[]
  /** true = 种子库；false = 播放列表同步产物 */
  seed?: boolean
  /** 获取途径，枚举里没有「搜索」 */
  acquiredVia?: 'seed' | 'playlistItems.list'
  /** 官方播放列表 / 原页面链接（来源依据） */
  officialUrl?: string
  /** ID 可验证状态 */
  idStatus?: 'verified' | 'playlist-only'
  /** 应用内原创学习卡标题说明 */
  titleNote?: string
  /** 同步产物的来源播放列表与时间 */
  syncedFrom?: string
  syncedAt?: number
}

export interface CulturalThemeSeed {
  theme: string
  briefZh: string
  watchFor: string
}

export interface CultureLibraryState {
  seedVersion: number
  /** 预配置播放列表（本地索引）；只有元数据，没有任何视频文件或字幕 */
  videos: CultureVideo[]
}

/* ---------------- CultureAnalyzerAgent ---------------- */

export interface CulturalTheme {
  theme: string
  /** 简短文化背景说明，1-2 句，克制、不做刻板印象 */
  briefZh: string
  watchFor: string
}

export interface BackgroundCard {
  title: string
  /** 150 字以内的文化背景卡 */
  contentZh: string
}

export interface CultureAnalysis {
  videoId: string
  culturalThemes: CulturalTheme[]
  keyExpressions: KeyExpression[]
  backgroundCard: BackgroundCard
  discussionSeeds: string[]
  /** 明确声明不复制字幕全文 */
  disclaimer: string
}

/**
 * 分析器输入：视频元数据 + 用户短注释 / 原创摘要（或 Mock 数据）。
 * 类型层面没有 transcript / captions / fullText 字段，杜绝整段字幕进 LLM。
 */
export interface AnalyzeVideoCultureInput {
  video: CultureVideo
  userNotes: VideoNote[]
  targetDifficulty: CefrLevel
}

export type AnalyzeVideoCulture = (input: AnalyzeVideoCultureInput) => Promise<CultureAnalysis>

/* ---------------- 观看进度 ---------------- */

export interface WatchProgressRecord {
  videoId: string
  watched: boolean
  /** 完成时间戳；未完成时缺省 */
  completedAt?: number
  /** 上次停留分段 id（只记元数据，不记播放流位置） */
  lastPosition?: string
  /** 已点开过的分段 id */
  visitedSegmentIds: string[]
  updatedAt: number
}

export type WatchProgressState = Record<string, WatchProgressRecord>

/* ---------------- PostWatchDirectorAgent ---------------- */

export interface PostWatchFeedback {
  /** 与现有 Feedback 组件兼容 */
  level: FeedbackLevel
  /** 观点反馈：是否回应了视频内容、是否有具体细节 */
  content: string
  /** 轻量语言反馈 */
  language: string
  corrected?: string
  praise: string
}

/** 极轻量的语言改写提示（观后讨论不做全套语法批改） */
export interface LightIssue {
  note: string
  fixed: string
}

export interface PostWatchMessage {
  id: string
  role: 'ai' | 'user' | 'coach'
  speaker: string
  text: string
  translation?: string
  feedback?: PostWatchFeedback
  culturalBridge?: string
  at: number
}

export interface PostWatchReport {
  summary: string
  viewpoints: string[]
  openQuestions: string[]
  newExpressions: string[]
  xp: number
  disclaimer: string
}

export interface PostWatchSession {
  id: string
  videoId: string
  videoTitle: string
  videoTitleZh: string
  guidance: GuidanceStrength
  messages: PostWatchMessage[]
  turns: number
  coveredExpressions: string[]
  mistakes: string[]
  report?: PostWatchReport
  createdAt: number
  finishedAt?: number
}

export type PostWatchState = PostWatchSession[]

/**
 * 观后讨论输入：视频元数据 + 文化分析结果 + 历史发言 + 最新输入。
 * 与 DialogueDirectorAgent / SeminarDirectorAgent 完全独立：
 *   - 没有 character / roleplay / scenario 字段；
 *   - 没有 chapterText / 全文字段；
 *   - 只有「视频梗概 + 文化卡 + 短引用 + 讨论种子」。
 */
export interface PostWatchInput {
  videoTitle: string
  videoTitleZh: string
  videoSummaryZh: string
  platform: VideoPlatform
  culturalThemes: CulturalTheme[]
  keyExpressions: KeyExpression[]
  backgroundCard: BackgroundCard
  discussionSeeds: string[]
  history: PostWatchMessage[]
  userInput: string
  difficulty: CefrLevel
  guidance: GuidanceStrength
  captionPreference: CaptionPreference
  turn: number
  forceEnd?: boolean
}

export interface PostWatchOutput {
  /** 2-3 句英文，含一个开放问题 */
  reply: string
  translation: string
  feedback: PostWatchFeedback
  culturalBridge?: string
  nextQuestion: string
  /** 每 3-4 轮轻量小结 */
  stageSummary?: string
  /** [成长系统] 本轮用户输入是否有效（有效轮次才计 XP） */
  effective?: boolean
  end: boolean
}

export type GeneratePostWatchReply = (input: PostWatchInput) => Promise<PostWatchOutput>

/* ---------------- 文化笔记 ---------------- */

export interface CultureNote {
  id: string
  videoId: string
  text: string
  createdAt: number
}

export interface CultureNotesState {
  notes: CultureNote[]
  /** 收藏的短表达（写入现有 lingua_review_queue 的同时，在这里记一份供进度页统计） */
  savedExpressions: string[]
  /** 收藏的视频 id */
  favorites: string[]
}
