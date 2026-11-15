/**
 * Agent —— WordCoachAgent（词场教练）
 *
 * 职责：S4 结算时给出不超过 2 句的鼓励 + 1 条可执行建议。
 * 确定性 Mock 实现（无网络调用），可整体替换。
 */

import type { StepRecord, WordProgressState } from '../wordLabTypes'

export interface WordCoachOutput {
  /** ≤2 句鼓励 */
  encourage: string
  /** 1 条可执行建议 */
  suggestion: string
  /** 统计 */
  stats: {
    total: number
    guessedRight: number
    spelledRight: number
    errorWords: string[]
  }
}

export type WordCoach = (records: StepRecord[], progress: WordProgressState) => WordCoachOutput

const coach: WordCoach = (records, _progress) => {
  const total = records.length
  const guessedRight = records.filter((r) => r.guessCorrect === true).length
  const spelledRight = records.filter((r) => r.spellingPassed).length
  const errorWords = [...new Set(records
    .filter((r) => r.guessCorrect === false || !r.spellingPassed)
    .map((r) => r.word))]

  const accuracy = total ? Math.round((guessedRight + spelledRight) / (total * 2) * 100) : 0

  let encourage: string
  if (accuracy >= 85) {
    encourage = `${total} 个新词一次过关，猜义与拼写都稳。继续保持这个节奏，阶梯复习会替你把它们焊牢。`
  } else if (accuracy >= 60) {
    encourage = `本场拿下 ${spelledRight}/${total} 个拼写，猜义对了 ${guessedRight} 个。学新词本来就是先模糊后清晰，你已经走在正路上。`
  } else {
    encourage = `别在意正确率——第一遍见面就当混个脸熟。10 分钟后它们会回来找你，那时你会惊喜地发现记住了一半。`
  }

  const suggestion = errorWords.length
    ? `下一步：把「${errorWords.slice(0, 3).join('、')}」写进一句自己的话里，写完念一遍再提交。`
    : `下一步：挑今天任意 3 个新词，各造一个和你生活相关的句子。`

  return { encourage, suggestion, stats: { total, guessedRight, spelledRight, errorWords } }
}

let current: WordCoach = coach

export function setWordCoach(c: WordCoach): void { current = c }
export function resetWordCoach(): void { current = coach }

export function coachWordSession(records: StepRecord[], progress: WordProgressState): WordCoachOutput {
  return current(records, progress)
}
