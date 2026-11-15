import type {
  AnalysisResult, IeltsAssessment, PersistedData, ReviewItem, Scenario, Session,
  SessionReport, Settings, VoiceAssessment,
} from '../types'
import { clamp, uid } from '../lib/utils'
import { ACHIEVEMENTS, WORD_BANK } from '../data/mockData'
import {
  IELTS_DIMENSIONS, assessIeltsDimensions, getIeltsLevel, ieltsUpgradeAdvice,
  nextIeltsLevel, normalizeBand,
} from '../data/ieltsLevels'
import { summarizeVoice, VOICE_DISCLAIMER } from './voiceAssessor'

/* ================================================================
 * Agent 3 —— CoachAgent
 * 输入：对话历史 / 错误记录 / 目标词汇 / 用户表现
 * 输出：会话报告、复习任务、掌握度与 XP、间隔重复队列、成就判定
 * ================================================================ */

export interface CoachInput {
  session: Session
  scenario: Scenario
  analysis?: AnalysisResult
  settings: Settings
  /** 本场（及历史）语音评判记录；有真实音频时用于替换文本推算的发音分 */
  voiceReports?: VoiceAssessment[]
}

const DAY = 24 * 60 * 60 * 1000
/** 间隔重复间隔（天）：0 表示立即进入今日队列 */
export const SRS_INTERVALS = [0, 1, 2, 4, 7, 15, 30]

export function buildSessionReport(input: CoachInput): SessionReport {
  const { session, scenario, analysis } = input
  const userMessages = session.messages.filter((m) => m.role === 'user')
  const newWords = [...new Set(session.coveredWords)]
  const goodSentences = userMessages
    .filter((m) => m.text.trim().split(/\s+/).length >= 7 && (m.feedback?.level ?? 'none') === 'none')
    .map((m) => m.text.trim())
    .slice(0, 3)
  if (!goodSentences.length && userMessages.length) {
    goodSentences.push(userMessages[userMessages.length - 1].text.trim())
  }

  const mainMistakes = [...new Set(session.mistakes)].slice(0, 5)
  const rewrites = userMessages
    .filter((m) => m.feedback?.corrected && m.feedback.corrected.trim() !== m.text.trim())
    .map((m) => ({ original: m.text.trim(), improved: m.feedback!.corrected }))
    .slice(0, 4)

  const targetTotal = Math.max(scenario.targetWords.length, 1)
  const coverage = clamp(newWords.length / targetTotal, 0, 1)
  const completion = clamp(session.turns / Math.max(scenario.rounds, 1), 0, 1)
  const accuracy = clamp(1 - mainMistakes.length / Math.max(userMessages.length * 1.5, 1), 0, 1)
  const mastery = Math.round((coverage * 0.4 + completion * 0.25 + accuracy * 0.35) * 100)
  const targetLevel = getIeltsLevel(input.settings.ieltsLevel)
  // 高段位挑战给更高的 XP 系数；默认 b5 系数为 1.0
  const xp = Math.round(clamp((20 + newWords.length * 5 + session.turns * 3 + mastery / 10 - mainMistakes.length * 2)
    * targetLevel.xpMultiplier, 20, 180))

  // 本场的语音评判：只有实测声学数据才参与维度打分
  const sessionVoice = (input.voiceReports || []).filter((v) => v.sessionId === session.id)
  const measuredVoice = sessionVoice.filter((v) => v.metrics.measured)
  const voice = summarizeVoice(sessionVoice, targetLevel)

  // 雅思四维度练习参考评估（非官方评分）
  const tokens = userMessages.map((m) => m.text.trim()).join(' ').toLowerCase().match(/[a-z][a-z'-]*/g) || []
  const avgSentenceLength = userMessages.length ? tokens.length / userMessages.length : 0
  const distinctWordRatio = tokens.length ? new Set(tokens).size / tokens.length : 0.5
  const textDimensions = assessIeltsDimensions({
    mastery, coverage, accuracy, turns: session.turns, avgSentenceLength, distinctWordRatio,
  })
  const dimensions = { ...textDimensions }
  if (measuredVoice.length) {
    // 发音维度改为实测主导；流利度由「说话节奏」补充三成
    const pr = measuredVoice.reduce((s, v) => s + v.dimensions.pr, 0) / measuredVoice.length
    const fc = measuredVoice.reduce((s, v) => s + v.dimensions.fc, 0) / measuredVoice.length
    dimensions.pr = normalizeBand(pr * 0.8 + textDimensions.pr * 0.2)
    dimensions.fc = normalizeBand(textDimensions.fc * 0.7 + fc * 0.3)
  }
  const band = normalizeBand((dimensions.fc + dimensions.lr + dimensions.gra + dimensions.pr) / 4)
  const nextLevel = nextIeltsLevel(targetLevel) || targetLevel
  const weakest = [...IELTS_DIMENSIONS].sort((a, b) => dimensions[a.key] - dimensions[b.key])[0]
  const ielts: IeltsAssessment = {
    levelId: targetLevel.id,
    band,
    targetBand: targetLevel.bandValue,
    dimensions,
    advice: ieltsUpgradeAdvice(dimensions, nextLevel, { voiceMeasured: measuredVoice.length > 0 }),
    disclaimer: measuredVoice.length
      ? `四项维度中 FC / PR 已结合 ${measuredVoice.length} 段真实录音的声学特征。${VOICE_DISCLAIMER}`
      : '基于文本与对话表现的练习参考分，非官方雅思评分；本场没有可用的真实录音（听写文本不计入发音分），发音维度为保守占位值，点「发音评测」录一段即可实测。',
  }

  const reviewTasks = [
    `用 ${newWords.slice(0, 3).join(' / ') || scenario.targetWords[0] || 'today\'s word'} 各造一个句子，明天再来复习。`,
    `跟读一句本轮好句，注意语速：${goodSentences[0] || scenario.openingLine}`,
    mainMistakes.length ? `重做 ${mainMistakes.length} 条错题，先自己改写再看推荐答案。` : '打开错题本，把之前标记的 2 条表达重新说一遍。',
    `明天完成复习页里到期的卡片，把「${scenario.title}」的目标词再过一轮。`,
    `雅思 ${targetLevel.band} 冲刺：针对「${weakest.zh}」把「${(goodSentences[0] || scenario.openingLine).slice(0, 42)}…」再说一遍，多加一个细节或例子。`,
    ...(voice?.suggestions.length
      ? [`发音练习：${voice.suggestions[0]}`]
      : ['点对话页的「发音评测」录一句英文，让教练看看你的语速、停顿与语调。']),
  ]

  const nextGoal = newWords.length < scenario.targetWords.length
    ? `下次挑战同一场景，试着把剩下的 ${scenario.targetWords.length - newWords.length} 个目标词也用上。`
    : '目标词已全部覆盖，可以试试更高难度或换一个场景，把表达拉长到 2-3 句。'

  const voicePart = voice?.measuredCount
    ? `另有 ${voice.measuredCount} 段发音评测（平均 ${voice.avgWpm} wpm、参考 Band ${voice.avgBand.toFixed(1)}）。`
    : ''
  const summary = `这次「${scenario.title}」你完成了 ${session.turns} 轮对话，覆盖 ${newWords.length}/${scenario.targetWords.length} 个目标词，掌握度 ${mastery} 分，雅思练习参考 Band ${band.toFixed(1)}（目标 ${targetLevel.band}）。${voicePart}${mainMistakes.length ? `有 ${mainMistakes.length} 处表达值得再打磨，已经放进复习队列。` : '表达很稳，几乎没有影响理解的错误。'}${analysis ? `文本主题：${analysis.topic}（${analysis.cefr}）。` : ''}`

  return {
    summary, newWords, goodSentences, mainMistakes, rewrites, reviewTasks, mastery, xp, nextGoal, ielts, voice,
  }
}

function meaningOf(content: string): string {
  const clean = content.toLowerCase().trim()
  const single = clean.split(/\s+/)[0].replace(/[^a-z'-]/g, '')
  const hit = WORD_BANK[single] || WORD_BANK[single.replace(/s$/, '')]
  return hit?.meaning || '本轮对话中需要复习的表达'
}

/** 把新词、易错表达写入间隔重复队列；已存在的卡片提升/重置等级 */
export function buildReviewItems(input: CoachInput, report: SessionReport): ReviewItem[] {
  const now = Date.now()
  const items: ReviewItem[] = []
  const push = (kind: ReviewItem['kind'], content: string, example: string) => {
    const key = content.toLowerCase().trim()
    if (items.some((i) => i.content.toLowerCase().trim() === key)) return
    items.push({
      id: uid('rev'), kind, content, meaning: meaningOf(content), example,
      level: 0, dueAt: now + SRS_INTERVALS[0] * DAY, createdAt: now,
    })
  }
  report.newWords.forEach((w) => push('word', w, `Try using "${w}" in your own sentence.`))
  input.scenario.targetPhrases.forEach((p) => push('phrase', p, `Pattern: ${p}`))
  report.mainMistakes.forEach((m) => push('mistake', m, 'Rewrite this sentence in a more natural way.'))
  return items
}

/** 复习卡片答对后推进到下一间隔 */
export function promoteReviewItem(item: ReviewItem, remembered: boolean): ReviewItem {
  const level = remembered ? Math.min(item.level + 1, SRS_INTERVALS.length - 1) : 0
  return {
    ...item,
    level,
    dueAt: Date.now() + SRS_INTERVALS[level] * DAY,
    lastReviewedAt: Date.now(),
  }
}

export function evaluateAchievements(data: PersistedData): string[] {
  const { profile, sessions, mistakes, reviewQueue } = data
  const totalTurns = sessions.reduce((sum, s) => sum + s.turns, 0)
  const covered = new Set(sessions.flatMap((s) => s.coveredWords)).size
  const mastered = mistakes.filter((m) => m.mastered).length + reviewQueue.filter((r) => r.level >= 3).length
  const unlocked: string[] = []
  if (profile.totalSessions >= 1 || sessions.length >= 1) unlocked.push('first_step')
  if (covered >= 10) unlocked.push('words_10')
  if (profile.streak >= 3) unlocked.push('streak_3')
  if (profile.xp >= 100) unlocked.push('xp_100')
  if (totalTurns >= 15) unlocked.push('turns_15')
  if (mastered >= 5) unlocked.push('mistakes_5')
  return unlocked.filter((id) => !profile.achievements.includes(id) && ACHIEVEMENTS.some((a) => a.id === id))
}

/** 便捷包装：一次拿到报告 + 复习项（供 UI 结束对话时调用） */
export function coachSession(input: CoachInput): { report: SessionReport; reviewItems: ReviewItem[] } {
  const report = buildSessionReport(input)
  return { report, reviewItems: buildReviewItems(input, report) }
}
