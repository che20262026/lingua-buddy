/**
 * China Learner Track —— 资源注册表
 *
 * 只做内容层：四轨道元信息、种子汇总与本地筛选。
 * 不新建学习机制；UI 与引擎接线见 pages / services。
 */

import type {
  ChinaTrackState, ExamTag, TrackId, TrackMeta, TrackUnit,
} from '../../chinaTrackTypes'
import { TRACK_A_UNITS } from './trackA'
import { TRACK_B_UNITS } from './trackB'
import { TRACK_C_UNITS } from './trackC'
import { TRACK_D_UNITS } from './trackD'

/** 四轨道并列，顺序固定；不与考试种类做互斥切分 */
export const TRACKS: TrackMeta[] = [
  {
    id: 'A',
    title: '写作与翻译 · 去中式化',
    subtitle: '先拆逻辑，再写英文',
    anchor: '失分集中在中文构思后逐词替换、结构混乱、长难句拆解不足；练的是英文思维重组，不是模板句型。',
    focus: 'logic_structure',
    emblem: '✍️',
    tone: 'brand',
  },
  {
    id: 'B',
    title: '读后续写 · 逻辑先行',
    subtitle: '先厘清逻辑，再动笔',
    anchor: '阅卷反馈指向人物关系混乱、情节与原文脱节、情绪描写过度而情节空缺；练的是结构化逻辑拆解。',
    focus: 'continuation_coherence',
    emblem: '🧭',
    tone: 'mint',
  },
  {
    id: 'C',
    title: '从能读不能说 · 到开口',
    subtitle: '最小可说完',
    anchor: '口语训练量长期接近于零，听说机考在部分地区已纳入总分或录取参考；练的是把真实交际任务做完。',
    focus: 'task_completion',
    emblem: '💬',
    tone: 'sun',
  },
  {
    id: 'D',
    title: '中式英语 · 诊断',
    subtitle: '语法正确，但不地道',
    anchor: '动词堆砌、主语混淆、搭配错配、副词堆叠、连词显隐错位；练的是母语负迁移的模式识别。',
    focus: 'chinglish_diagnosis',
    emblem: '🔍',
    tone: 'coral',
  },
]

/** 40 个原创单元（每轨 10 个）；顺序按 A → B → C → D */
export const ALL_UNITS: TrackUnit[] = [
  ...TRACK_A_UNITS, ...TRACK_B_UNITS, ...TRACK_C_UNITS, ...TRACK_D_UNITS,
]

export const TRACK_UNITS: Record<TrackId, TrackUnit[]> = {
  A: TRACK_A_UNITS,
  B: TRACK_B_UNITS,
  C: TRACK_C_UNITS,
  D: TRACK_D_UNITS,
}

export const EXAM_TAG_LABELS: Record<ExamTag, string> = {
  gaokao: '高考',
  cet4: '四级',
  cet6: '六级',
  kaoyan: '考研',
  gaokao_listening: '高考听说',
}

export const EXAM_TAGS: ExamTag[] = ['gaokao', 'cet4', 'cet6', 'kaoyan', 'gaokao_listening']

/** 首页每张轨道卡展示的 2–3 条 struggle 短句 */
export function struggleTeasers(track: TrackId, n = 3): TrackUnit[] {
  return TRACK_UNITS[track].slice(0, n)
}

export function findUnit(id: string): TrackUnit | undefined {
  return ALL_UNITS.find((u) => u.id === id)
}

export function unitsOfTrack(track: TrackId): TrackUnit[] {
  return TRACK_UNITS[track] ?? []
}

/**
 * 可见单元：
 * - examAware 单元（听说机考感知卡）默认隐藏，只有省份配置启用后才出现；
 * - examTag 只做筛选，不改变任何路径或进度。
 */
export function visibleUnits(
  state: ChinaTrackState,
  opts: { track?: TrackId | 'all'; examTag?: ExamTag | 'all' } = {},
): TrackUnit[] {
  const { track = 'all', examTag = 'all' } = opts
  return ALL_UNITS.filter((u) => {
    if (u.examAware && !state.listeningExamEnabled) return false
    if (track !== 'all' && u.track !== track) return false
    if (examTag !== 'all' && !u.examTags.includes(examTag)) return false
    return true
  })
}

export function countVisible(state: ChinaTrackState, track: TrackId): number {
  return visibleUnits(state, { track }).length
}

/** 全部非原创内容必须标注 type + license；当前种子 100% original */
export function nonOriginalUnits(): TrackUnit[] {
  return ALL_UNITS.filter((u) => u.source.type !== 'original')
}

/** 结构级校验：供冒烟测试与开发期自检，确保每个单元字段齐全 */
export function validateUnits(): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const u of ALL_UNITS) {
    if (ids.has(u.id)) problems.push(`重复 id: ${u.id}`)
    ids.add(u.id)
    if (!u.struggle.trim()) problems.push(`${u.id} 缺 struggle`)
    if (!['A', 'B', 'C', 'D'].includes(u.track)) problems.push(`${u.id} track 非法`)
    if (!u.examTags.length) problems.push(`${u.id} 缺 examTags`)
    if (!['A2', 'B1', 'B2'].includes(u.cefr)) problems.push(`${u.id} cefr 非法`)
    if (!['dialogue', 'writing_feedback', 'wordlab'].includes(u.engine)) problems.push(`${u.id} engine 非法`)
    if (!u.content.promptZh || !u.content.sourceText || !u.content.targetPattern
      || !u.content.contrastExample || !u.content.rewriteExample) problems.push(`${u.id} content 五字段不全`)
    if (!u.source.type || !u.source.attribution || !u.source.license) problems.push(`${u.id} source 字段不全`)
    if (u.source.type !== 'original' && !u.source.license) problems.push(`${u.id} 非原创缺许可`)
    if (!['logic_structure', 'chinglish_diagnosis', 'task_completion', 'continuation_coherence']
      .includes(u.assessmentFocus)) problems.push(`${u.id} assessmentFocus 非法`)
    if (u.content.diagnosisOptions?.length && !u.content.diagnosisKey) problems.push(`${u.id} 缺 diagnosisKey`)
    if (u.content.diagnosisKey && !u.content.diagnosisOptions?.includes(u.content.diagnosisKey)) {
      problems.push(`${u.id} diagnosisKey 不在选项中`)
    }
    if (u.examAware && u.track !== 'C') problems.push(`${u.id} examAware 只能属于轨道 C`)
  }
  return problems
}
