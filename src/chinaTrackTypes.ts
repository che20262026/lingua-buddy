/**
 * China Learner Track —— 本土应试与真实能力桥接资源库
 * 数据契约（内容层扩展，不新建学习机制）
 *
 * 设计原则（详见 README 第十九章）：
 * - 分类锚定「学生可自我识别的具体卡点」，不使用「应试英语」这类宽泛标签；
 * - 每个单元必须带 struggle，且必须在 UI 中可见；
 * - assessmentFocus 决定反馈优先级，不决定分数；
 * - examTags 只做筛选，不把资源库切成互斥的考试路径；
 * - 全部内容原创；若未来引入开放许可词表/例句，必须逐条标注 source.type 与 license；
 * - 不做提分承诺、不做分数预测、不假定全国高考政策统一。
 */

/** 反馈优先级枚举：定义在内容层，types.ts 单向引用，避免类型循环 */
export type AssessmentFocus =
  | 'logic_structure' | 'chinglish_diagnosis' | 'task_completion' | 'continuation_coherence'

export type TrackId = 'A' | 'B' | 'C' | 'D'

export type ExamTag = 'gaokao' | 'cet4' | 'cet6' | 'kaoyan' | 'gaokao_listening'

/** 资源库只覆盖这三个 CEFR 区间，复用现有 difficulty 而不新增难度机制 */
export type TrackCefr = 'A2' | 'B1' | 'B2'

/** 只复用三个既有引擎，不新增 Agent（结构级写作反馈引擎除外） */
export type TrackEngine = 'dialogue' | 'writing_feedback' | 'wordlab'

/** 与需求给定的 source.type 取值一致；本项目全部种子为 original */
export type ResourceSourceType = 'original' | 'cc' | 'mit' | 'bsd'

export interface ResourceSource {
  type: ResourceSourceType
  attribution: string
  license: string
}

/**
 * 需求给定 content 的五个字段全部保留；
 * 以下是为「结构级引导」补的可选字段，不改变给定字段的语义。
 */
export interface TrackContent {
  /** 简短中文引导 */
  promptZh: string
  /** 中文或英文的输入材料 */
  sourceText: string
  /** 要练习或诊断的语言模式 */
  targetPattern: string
  /** 学生典型产出样例（原创生成，非真实学生数据） */
  contrastExample: string
  /** 地道的改写样例 */
  rewriteExample: string
  /** 结构级引导问题：轨道 A 的逻辑骨架 / 轨道 B 的逻辑三问 / 轨道 C 的任务清单 */
  scaffold?: string[]
  /** 轨道 A / D 的诊断选项 */
  diagnosisOptions?: string[]
  /** 正确诊断选项（与 diagnosisOptions 中的某一项完全一致） */
  diagnosisKey?: string
  /** 同一模式的另外 1–2 个原创学生风格例句 */
  extraExamples?: string[]
  /** 母语负迁移提示：说明中文思维习惯，不评判学生 */
  transferNote?: string
  /** 地道搭配注释（供 china_track 场景词包复用，不是简单中文翻译） */
  collocationNotes?: string[]
  /** 听说机考题型说明（仅轨道 C 的 examAware 单元；不含任何分数或提分话术） */
  examBrief?: string
  /** 轨道 C 的微场景对 AI 扮演者的角色要求 */
  interlocutor?: string
  /** 轨道 C 的交际任务关键词（用于结构级「任务是否完成」判定，不做语法评判） */
  taskKeys?: string[]
}

export interface TrackUnit {
  id: string
  track: TrackId
  /** 一句话描述具体卡点，必须是学生可自我识别的中文 */
  struggle: string
  examTags: ExamTag[]
  cefr: TrackCefr
  engine: TrackEngine
  content: TrackContent
  source: ResourceSource
  assessmentFocus: AssessmentFocus
  /** 仅轨道 C：听说机考感知单元，默认隐藏，需省份配置启用 */
  examAware?: boolean
  /** 关联的 china_track 场景词包 */
  packTag?: 'chinglish_fix' | 'speaking_core'
}

export interface TrackMeta {
  id: TrackId
  title: string
  subtitle: string
  /** 研究依据对应的真实能力锚点（不是题型标签） */
  anchor: string
  focus: AssessmentFocus
  emblem: string
  tone: 'brand' | 'mint' | 'sun' | 'coral'
}

/* ---------------- 省份配置（纯本地，不上传、不追踪） ---------------- */

export type ProvinceId =
  | 'none' | 'guangdong' | 'beijing' | 'shanghai'
  | 'zhejiang' | 'jiangsu' | 'shandong' | 'other'

export interface ProvinceOption {
  id: ProvinceId
  label: string
  /** 已实施 / 已公布听说机考的地区，选择后自动启用感知卡（仍可手动关闭） */
  autoEnable: boolean
  note: string
}

/** 第 29 个键 lingua_china_track：只存内容层的完成记录与省份配置 */
export interface ChinaTrackState {
  /** unitId → 首次完成 ISO 时间 */
  completed: Record<string, string>
  province: ProvinceId
  /** 听说机考感知卡开关，默认 false */
  listeningExamEnabled: boolean
  /** 用户是否主动改过开关（用于区分「自动启用」与「手动覆盖」） */
  examOverride: boolean
  version: number
}

export const CHINA_TRACK_DEFAULTS: ChinaTrackState = {
  completed: {},
  province: 'none',
  listeningExamEnabled: false,
  examOverride: false,
  version: 1,
}

/** 来源小字的统一渲染；非 original 必须显示许可 */
export function sourceLabel(source: ResourceSource): string {
  if (source.type === 'original') return `原创 · ${source.attribution}`
  return `${source.type.toUpperCase()} · ${source.attribution} · ${source.license}`
}

/** 反馈优先级说明：写进 UI，也供 WritingFeedbackEngine 分派 */
export const FOCUS_PRIORITY: Record<AssessmentFocus, { title: string; first: string; notFirst: string }> = {
  logic_structure: {
    title: '优先看逻辑结构',
    first: '先确认「谁做了什么、因果是什么、转折在哪里」是否清晰',
    notFirst: '不优先纠语法、不优先堆高级词汇',
  },
  continuation_coherence: {
    title: '优先看续写衔接',
    first: '先确认人物状态与情节方向是否承接上一句、情节是否真的推进',
    notFirst: '不优先评语言、不优先数形容词',
  },
  task_completion: {
    title: '优先看任务完成',
    first: '先确认这个真实交际任务有没有被做完（说满 2–3 句、把话接住）',
    notFirst: '不优先评发音、不优先纠语法',
  },
  chinglish_diagnosis: {
    title: '优先给诊断',
    first: '先确认问题属于哪一种母语负迁移模式，再给出地道改写',
    notFirst: '不给分数、不做逐句语法纠错',
  },
}

/** 明确不做的事：UI 与 README 都引用同一份常量，避免话术漂移 */
export const NO_PROMISES = [
  '不提供分数预测，不承诺提分',
  '不提供「万能模板」「必考」「保过」话术',
  '不假定全国高考政策统一，机考感知卡默认关闭',
  '不复制任何培训机构讲义、教辅范文或真题原文',
] as const
