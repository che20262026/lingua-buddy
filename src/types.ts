/** LinguaBuddy 数据模型 —— 所有类型均对应 localStorage 中的持久化结构 */

import type { IeltsLevel, IeltsLevelId, IeltsDimensionKey } from './data/ieltsLevels'
/** [新增] 文学模块类型全部在独立文件里，此处只做「接线」 */
import type {
  LibraryState, ReadingProgressState, SeminarState, LiteraryNotesState,
  ReadingViewMode, GuidanceStrength,
} from './literaryTypes'
/** [修改点] 文化视频模块类型同样独立，此处只补 import 与接线字段 */
import type {
  CultureLibraryState, WatchProgressState, PostWatchState, CultureNotesState,
  CaptionPreference,
} from './cultureTypes'
/** [新增] 三层储量体系（播放列表注册表）的类型契约 */
import type { PlaylistRegistryState } from './cultureLibraryTypes'
/** [新增] 词场（Word Lab）模块的类型契约 */
import type {
  WordProgressState, WordSessionDraft, WordDailyQuota, WordError,
  WordMediaCacheState, DeckSelectionState, PronunciationFlagsState,
} from './wordLabTypes'
/** [新增] 成长系统 4 个键的类型契约 */
import type {
  GrowthState, AchievementState, XpLedgerState, ActivityHeatmapState,
} from './growthTypes'
/** [新增] China Learner Track：内容层状态与反馈优先级枚举（单向引用，无类型循环） */
import type { ChinaTrackState, AssessmentFocus } from './chinaTrackTypes'
/** [新增] 统一 CEFR 等级层：内容过滤器偏好（第 30 键） */
import type { LevelPreference } from './levelTypes'
/** [新增] 对话语音层：音色偏好契约（单向引用，无类型循环） */
import type { VoicePreferences } from './voiceTypes'
/** [新增] 对话语音层：等级 → 语言参数契约（单向引用，无类型循环） */
import type { LevelProfile } from './voiceTypes'

export type CEFR = 'A1' | 'A2' | 'B1' | 'B2' | 'C1'

/** [修改点] 追加 5 个文学视图 + 4 个文化视图；原有 8 个路由值一字不改 */
export type View =
  | 'home'
  | 'analysis'
  | 'scenario'
  | 'dialogue'
  | 'report'
  | 'review'
  | 'progress'
  | 'settings'
  | 'library'
  | 'bookDetail'
  | 'reader'
  | 'seminar'
  | 'readingProgress'
  | 'cultureHub'
  | 'watch'
  | 'postWatch'
  | 'cultureReview'
  /** [新增] 词场（Word Lab）四个视图 */
  | 'wordLab'
  | 'deckPicker'
  | 'wordSession'
  | 'errorBook'
  /** [新增] 成长系统两个视图 */
  | 'growth'
  | 'achievements'
  /** [China Learner Track] 资源库首页与单元练习页；不新增底部导航项，归入「学习」 */
  | 'chinaTrack'
  | 'chinaUnit'
  /** [新增] 大肥鱼自由对话：脱离剧本的闲聊沙盒，独立视图 */
  | 'freeTalk'

export interface Keyword {
  word: string
  meaning: string
  example: string
}

export interface Phrase {
  phrase: string
  meaning: string
  example: string
}

export interface GrammarPoint {
  point: string
  explanation: string
}

export interface Character {
  id: string
  name: string
  role: string
  personality: string
  goal: string
  sampleLines: string[]
}

export interface Scenario {
  id: string
  title: string
  goal: string
  characters: Character[]
  targetWords: string[]
  targetPhrases: string[]
  /** 建议句型，UI 中可编辑 */
  sentenceFrames: string[]
  openingLine: string
  suggestedReplies: string[]
  /** 建议轮次，3-6 轮可完成 */
  rounds: number
  /** 归档到 lingua_scenarios 时记录来源分析 */
  sourceAnalysisId?: string
  /** [China Learner Track] 微场景的反馈优先级；缺省 = 沿用原有雅思维度反馈 */
  assessmentFocus?: AssessmentFocus
  /** 原创装饰色，仅用于 UI */
  tint: string
  emblem: string
}

/** 文本对雅思口语练习的适配度（TextAnalyzerAgent 输出） */
export interface IeltsFit {
  band: string
  levelId: IeltsLevelId
  note: string
  focus: string[]
}

export interface AnalysisResult {
  id: string
  sourceText: string
  topic: string
  cefr: CEFR
  summary: string
  keywords: Keyword[]
  phrases: Phrase[]
  grammar: GrammarPoint[]
  scenarios: Scenario[]
  createdAt: number
  /** 可选：旧存档没有该字段时 UI 自动降级 */
  ieltsFit?: IeltsFit
}

export interface Feedback {
  level: 'none' | 'minor' | 'major'
  grammar: string
  wordChoice: string
  naturalness: string
  corrected: string
  praise: string
  /** 本轮对应的雅思维度微点评 */
  ieltsTip?: string
}

export interface ChatMessage {
  id: string
  role: 'ai' | 'user' | 'coach'
  speaker: string
  text: string
  translation?: string
  feedback?: Feedback
  at: number
}

export interface DirectorState {
  coveredWords: string[]
  mistakes: string[]
  progress: number
}

/** DialogueDirectorAgent 的输出契约 */
export interface DirectorOutput {
  reply: string
  translation: string
  feedback: Feedback
  hints: string[]
  state: DirectorState
  end: boolean
  summary?: string
  /** 每 3 轮的轻量阶段总结，由 UI 插入一条教练消息 */
  stageSummary?: string
  /** 本轮重点练习的雅思维度 key */
  ieltsFocus?: IeltsDimensionKey
  /** [成长系统] 本轮用户输入是否「有效」（<8 词且未命中目标词 / 纯符号 / 复读 / 离题均为 false） */
  effective?: boolean
}

export interface GenerateDialogueInput {
  summary: string
  topic: string
  scenario: Scenario
  userCharacter: Character
  aiCharacter: Character
  targetWords: string[]
  targetPhrases: string[]
  history: ChatMessage[]
  userInput: string
  difficulty: CEFR
  correction: 'gentle' | 'balanced' | 'detailed'
  turn: number
  forceEnd?: boolean
  /** 可选：雅思档位；缺省时按 CEFR 推断 */
  ieltsLevel?: IeltsLevel
  /** [China Learner Track] 反馈优先级：按场景类型调整，不新建 Agent */
  assessmentFocus?: AssessmentFocus
  /**
   * [对话语音层] 当前等级对应的语言参数（句数上限 / 句长 / 词汇范围 / 语用复杂度）。
   * 缺省时按 difficulty 推断；等级只改语言复杂度，不改角色性格与场景目标。
   */
  levelProfile?: LevelProfile
  /**
   * [真实 AI] 组件卸载时用来取消在途 /api/chat 请求。
   * 由 useAbortableRequest() 生成；Mock 与自定义端点路径忽略它，旧调用零改动。
   */
  signal?: AbortSignal
}

/** 可替换的对话生成服务签名 */
export type GenerateDialogue = (input: GenerateDialogueInput) => Promise<DirectorOutput>

export interface Rewrite {
  original: string
  improved: string
}

/** CoachAgent 给出的雅思口语段位评估 */
export interface IeltsAssessment {
  levelId: IeltsLevelId
  band: number
  targetBand: number
  dimensions: Record<IeltsDimensionKey, number>
  advice: string[]
  disclaimer: string
}

/* ---------------- 语音评判（VoiceAssessmentAgent） ---------------- */

/** 一次发声的可测量声学特征；measured=false 表示只有识别文本、没有真实音频 */
export interface VoiceMetrics {
  durationMs: number
  voicedMs: number
  volumeDb: number
  peakDb: number
  silenceRatio: number
  pauseCount: number
  longestPauseMs: number
  speechRateWpm: number
  pitchRangeSemitones: number
  pitchStability: number
  clarity: number
  energyVariation: number
  syllablePeaks: number
  measured: boolean
}

export interface VoiceAssessment {
  id: string
  createdAt: number
  sessionId?: string
  turn?: number
  scenarioTitle?: string
  levelId: IeltsLevelId
  source: 'recording' | 'recognition'
  transcript?: string
  recognitionConfidence?: number
  metrics: VoiceMetrics
  /** 语音侧可评的两项维度（0–9 练习参考分） */
  dimensions: { fc: number; pr: number }
  /** 仅由 FC/PR 两项换算，不是完整雅思 Band */
  bandRef: number
  overall: number
  strengths: string[]
  suggestions: string[]
  /** 归一化波形（64 点）与音高曲线（32 点，Hz） */
  waveform: number[]
  pitchCurve: number[]
  disclaimer: string
}

export interface VoiceSummary {
  count: number
  avgBand: number
  avgWpm: number
  avgPitchRange: number
  avgClarity: number
  /** 后半程相对前半程的 Band 变化 */
  trend: number
  focus: string
  strengths: string[]
  suggestions: string[]
  latest?: VoiceAssessment
  measuredCount: number
}

export interface SessionReport {
  summary: string
  newWords: string[]
  goodSentences: string[]
  mainMistakes: string[]
  rewrites: Rewrite[]
  reviewTasks: string[]
  mastery: number
  xp: number
  nextGoal: string
  ielts?: IeltsAssessment
  voice?: VoiceSummary
}

export interface Session {
  id: string
  scenarioId: string
  scenarioTitle: string
  userCharacterId: string
  aiCharacterId: string
  messages: ChatMessage[]
  coveredWords: string[]
  mistakes: string[]
  turns: number
  report?: SessionReport
  createdAt: number
  finishedAt?: number
}

export interface Mistake {
  id: string
  original: string
  corrected: string
  type: string
  note: string
  sessionId: string
  createdAt: number
  mastered: boolean
}

export interface ReviewItem {
  id: string
  kind: 'word' | 'phrase' | 'mistake'
  content: string
  meaning: string
  example: string
  level: number
  dueAt: number
  createdAt: number
  lastReviewedAt?: number
  /** [新增] 复习来源：词场 / 阅读 / 视频 / 本土资源库；旧卡片缺省时视为对话/阅读来源 */
  source?: 'wordlab' | 'reading' | 'video' | 'china_track'
}

export interface Profile {
  nickname: string
  cefr: CEFR
  dailyGoal: number
  xp: number
  streak: number
  lastActiveDate: string
  todayXp: number
  todayDate: string
  totalSessions: number
  achievements: string[]
}

export interface Settings {
  difficulty: CEFR
  /** 雅思口语目标档位；与 difficulty 双向联动 */
  ieltsLevel: IeltsLevelId
  rate: number
  accent: 'en-US' | 'en-GB' | 'en-AU'
  showTranslation: boolean
  correction: 'gentle' | 'balanced' | 'detailed'
  autoSpeak: boolean
  /** 预留 LLM 接口：默认 mock，用户在设置页填写后走自定义兼容端点 */
  apiMode: 'mock' | 'custom'
  apiEndpoint: string
  apiKey: string
  apiModel: string
  /** 可选 ASR 端点：默认留空 = 不启用，保持零后端零密钥 */
  asrEndpoint: string
  asrKey: string
  asrModel: string
  /** [修改点] 新增两项：阅读视图默认值、研讨引导强度；旧字段语义不变 */
  readingView: ReadingViewMode
  seminarGuidance: GuidanceStrength
  /** [修改点] 新增两项：文化视频默认字幕偏好、是否自动进入观后讨论 */
  captionPreference: CaptionPreference
  autoEnterPostWatch: boolean
  /** [新增] 词场四项：每日新词上限 / 拼写模式 / 自动发音 / 显示配图 */
  wordDailyLimit: number
  wordSpellingMode: 'typing' | 'handwriting'
  wordAutoSpeak: boolean
  wordShowImage: boolean
  /** [S2.5 新增] 进入验证页时自动播放一遍例句标准音（默认开） */
  wordAutoPlayAudio: boolean
  /** [S2.5 新增] 跟读区域是否默认展开（默认开）；口音直接复用 accent，不新增字段 */
  wordReadAloudExpanded: boolean
  /** [成长系统新增] 显示 +XP 轻提示 / 显示 90 天热力图 */
  showXpAnimation: boolean
  showHeatmap: boolean
  /** [多语言] 词场当前语言；缺省 = en（旧存档零迁移）。不影响对话/阅读等其他模块的语言。 */
  wordLanguage: 'en' | 'ru'
}

/** [修改点] 追加 4 个文学键 + 4 个文化键对应的字段；原有 8 个字段类型与语义完全不变 */
export interface PersistedData {
  profile: Profile
  texts: AnalysisResult[]
  scenarios: Scenario[]
  sessions: Session[]
  mistakes: Mistake[]
  reviewQueue: ReviewItem[]
  settings: Settings
  /** 语音评判记录（第 8 个键，旧存档缺字段时自动补空数组） */
  voiceReports: VoiceAssessment[]
  library: LibraryState
  readingProgress: ReadingProgressState
  seminars: SeminarState
  literaryNotes: LiteraryNotesState
  /** 文化视频模块（第 13-16 个键） */
  cultureVideos: CultureLibraryState
  watchProgress: WatchProgressState
  postWatchSessions: PostWatchState
  cultureNotes: CultureNotesState
  /** [新增] 播放列表注册表（第 17 个键 lingua_playlist_registry，三层储量体系的第 2 层） */
  playlistRegistry: PlaylistRegistryState
  /** [新增] 词场 6 个键（第 18-23 个键） */
  wordProgress: WordProgressState
  wordSessionDraft: WordSessionDraft | null
  wordDailyQuota: WordDailyQuota
  wordErrors: WordError[]
  wordMediaCache: WordMediaCacheState
  deckSelection: DeckSelectionState
  /** [S2.5 新增] 第 24 个键：发音漏读记录，与拼写易错本完全隔离 */
  pronunciationFlags: PronunciationFlagsState
  /** [成长系统新增] 第 25-28 个键：权威成长数据 / 成就 / 幂等账本 / 90 天热力图 */
  growth: GrowthState
  achievementsState: AchievementState
  xpLedger: XpLedgerState
  activityHeatmap: ActivityHeatmapState
  /** [China Learner Track 新增] 第 29 个键：完成记录 + 省份配置（纯本地） */
  chinaTrack: ChinaTrackState
  /** [CEFR 等级层新增] 第 30 个键：只存筛选偏好，不存资源等级 */
  levelPreference: LevelPreference
  /** [对话语音层新增] 第 31 个键：自动朗读开关 + 音色偏好 + 角色音色绑定 */
  voicePreferences: VoicePreferences
}
