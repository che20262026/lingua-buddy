/**
 * 分级内容池注册表：三个模块共用的唯一内容来源清单
 *
 * LevelFilterService 只从这里读数据；三个列表页不各自维护等级筛选。
 * 来源许可表与排除清单同时以结构化常量导出，供 UI 与冒烟测试引用。
 */

import type { ContentItem, LevelCefr, LevelModule } from '../../levelTypes'
import { basisCount } from '../../levelTypes'
import { DIALOGUE_POOL } from './dialoguePool'
import { READING_POOL } from './readingPool'
import { VIDEO_POOL } from './videoPool'

export const LEVEL_CONTENT_POOL: ContentItem[] = [
  ...DIALOGUE_POOL, ...READING_POOL, ...VIDEO_POOL,
]

export function poolByModule(module: LevelModule): ContentItem[] {
  return LEVEL_CONTENT_POOL.filter((i) => i.module === module)
}

export function poolItemById(id: string): ContentItem | undefined {
  return LEVEL_CONTENT_POOL.find((i) => i.id === id)
}

/** 来源与许可分层（README 第二十章表格的结构化版本） */
export interface SourceLicense {
  id: string
  label: string
  modules: LevelModule[]
  license: string
  usage: string
  excluded?: false
}

export const SOURCE_LICENSES: SourceLicense[] = [
  {
    id: 'slanglane_reference', label: 'SlangLane CEFR B1–C2 语用语料库（Zenodo / Harvard Dataverse）',
    modules: ['dialogue'], license: 'CC BY 4.0', usage: '参考语料，不复制条目全文；场景标 slanglane_reference 并署名',
  },
  {
    id: 'ace_cefr_anchor', label: 'Ace-CEFR 对话数据集（GitHub GliteTech/research-ace-cefr）',
    modules: ['dialogue'], license: '开源（GitHub）', usage: '890 段专家评分对话仅作难度校准分布，不复制文本',
  },
  {
    id: 'original', label: 'LinguaBuddy 原创场景脚本 / 章节简报 / 研讨问题',
    modules: ['dialogue', 'reading'], license: '原创', usage: '第一优先级，始终保留',
  },
  {
    id: 'gutenberg', label: 'Project Gutenberg',
    modules: ['reading'], license: '公有领域', usage: '全文可读；应用内只内嵌既有教学节选，新增篇目仅登记来源',
  },
  {
    id: 'reading_corner_method', label: 'The Reading Corner 分级阅读框架',
    modules: ['reading'], license: '公版书 + 分级框架', usage: '只参考「同一文本、按等级给不同注释深度」的思路，不抓取内容',
  },
  {
    id: 'voa_learning', label: 'VOA Learning English',
    modules: ['video'], license: '公共领域（美国政府作品）', usage: '官方嵌入播放器；不下载、不抓取字幕全文',
  },
  {
    id: 'ted_ed', label: 'TED-Ed',
    modules: ['video'], license: 'CC BY-NC-ND 4.0', usage: '官方嵌入 + 署名 + 非商用',
  },
  {
    id: 'bbc_learning', label: 'BBC Learning English',
    modules: ['video'], license: '嵌入权限逐条确认', usage: '优先嵌入，不可嵌入时降级外链，不得绕过',
  },
  {
    id: 'external_only', label: 'Easy English / Kurzgesagt / All Ears English / mmmEnglish / Veritasium 等',
    modules: ['video'], license: '嵌入权限逐条确认', usage: '仅外链降级，不下载、不转存、不抓取完整字幕',
  },
]

export const EXCLUDED_SOURCES = [
  '任何培训机构的讲义、范文、模板、机经回忆',
  '来源不明的「分级资源合集」「CEFR 万能词表」',
  '禁止 AI 训练的语料（延续 LANA-CASE 排除规则）',
  'SlangLane 条目全文、Ace-CEFR 对话原文、The Reading Corner 页面内容',
  '任何视频文件下载、字幕全文抓取、第三方平台非官方播放器',
] as const

/** The Reading Corner 思路：同一文本、按等级给不同注释深度；不改反馈逻辑 */
export function annotationDepth(level: LevelCefr): 'full' | 'balanced' | 'light' | 'minimal' {
  const map: Record<LevelCefr, 'full' | 'balanced' | 'light' | 'minimal'> = {
    A2: 'full', B1: 'balanced', B2: 'light', C1: 'minimal',
  }
  return map[level]
}

export const ANNOTATION_DEPTH_LABEL: Record<ReturnType<typeof annotationDepth>, string> = {
  full: '双语注释最详细（逐句对照）',
  balanced: '双语注释适中（关键句对照）',
  light: '只在难点句给注释',
  minimal: '以原文为主，几乎不加注释',
}

/** 结构化自检：每个单元 cefrBasis 至少 3 项，字段齐全，等级合法 */
export function validatePool(): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const item of LEVEL_CONTENT_POOL) {
    if (ids.has(item.id)) problems.push(`重复 id: ${item.id}`)
    ids.add(item.id)
    if (!['A2', 'B1', 'B2', 'C1'].includes(item.cefr)) problems.push(`${item.id} cefr 非法`)
    if (basisCount(item.cefrBasis) < 3) problems.push(`${item.id} cefrBasis 少于 3 项`)
    if (!['expert', 'estimated', 'user_override'].includes(item.levelSource)) problems.push(`${item.id} levelSource 非法`)
    if (!item.levelNotes.trim()) problems.push(`${item.id} 缺 levelNotes`)
    if (!item.source || !item.sourceLabel || !item.licenseNote) problems.push(`${item.id} 来源/许可字段不全`)
    if (!['dialogue', 'reading', 'video'].includes(item.module)) problems.push(`${item.id} module 非法`)
    if (item.module === 'video' && item.embeddable === undefined) problems.push(`${item.id} 视频缺 embeddable`)
    if (item.chapterCefr && !item.chapterId) problems.push(`${item.id} 章节等级缺 chapterId`)
  }
  return problems
}

/** 三个模块的池子计数（供 UI 与断言使用） */
export function poolCounts(): Record<LevelModule, number> {
  return {
    dialogue: poolByModule('dialogue').length,
    reading: poolByModule('reading').length,
    video: poolByModule('video').length,
  }
}
