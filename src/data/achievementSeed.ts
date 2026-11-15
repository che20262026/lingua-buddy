/**
 * 成就种子数据（27 条，MVP 控制在 25–30）
 *
 * 引导型 6 / 坚持型 6 / 深度型 6 / 广度型 5 / 隐藏型 4。
 * 每条 condition 只用 count / streak / composite，不依赖「打开页面次数」「停留时长」。
 * ACHIEVEMENT_INDEX 是事件驱动判定用的倒排索引：只检查与本次事件相关的成就。
 */
import type { Achievement, AchievementState } from '../growthTypes'

type Seed = Omit<Achievement, 'progress' | 'unlocked' | 'unlockedAt'>

const S: Seed[] = [
  /* ---------------- 引导型 Onboarding（6） ---------------- */
  {
    id: 'first_word', category: 'onboarding', title: '第一个词落地',
    description: '完整走完一个词的猜义、验证、跟读与拼写。', hidden: false,
    condition: { type: 'count', event: 'word_complete', target: 1 }, rewardXp: 30, emblem: '🌱',
  },
  {
    id: 'first_round', category: 'onboarding', title: '第一次真正开口',
    description: '在角色对话里完成一轮有效表达。', hidden: false,
    condition: { type: 'count', event: 'round_effective', target: 1 }, rewardXp: 30, emblem: '💬',
  },
  {
    id: 'first_seminar', category: 'onboarding', title: '第一次文学研讨',
    description: '完成一次 ≥4 轮的苏格拉底式研讨。', hidden: false,
    condition: { type: 'count', event: 'seminar_finish', target: 1 }, rewardXp: 30, emblem: '🎓',
  },
  {
    id: 'first_read_aloud', category: 'onboarding', title: '第一次跟读',
    description: '在 S2.5 完成一次例句跟读（自评跟读也算）。', hidden: false,
    condition: { type: 'count', event: 'read_aloud_complete', target: 1 }, rewardXp: 30, emblem: '🎙️',
  },
  {
    id: 'second_deck', category: 'onboarding', title: '换一片矿区',
    description: '选择第二个词库，看看不同分级的风景。', hidden: false,
    condition: { type: 'count', event: 'deck_selected', target: 2 }, rewardXp: 30, emblem: '🗂️',
  },
  {
    id: 'first_review_batch', category: 'onboarding', title: '回头看一眼',
    description: '完成第一个复习批次。', hidden: false,
    condition: { type: 'count', event: 'review_batch', target: 1 }, rewardXp: 30, emblem: '🔁',
  },

  /* ---------------- 坚持型 Consistency（6） ---------------- */
  {
    id: 'streak_3', category: 'consistency', title: '三天成习惯',
    description: '连续 3 天达成学习目标。', hidden: false,
    condition: { type: 'streak', target: 3 }, rewardXp: 30, emblem: '🔥',
  },
  {
    id: 'streak_7', category: 'consistency', title: '一周不断线',
    description: '连续 7 天达成每日目标。', hidden: false,
    condition: { type: 'streak', target: 7 }, rewardXp: 50, emblem: '📅',
  },
  {
    id: 'streak_14', category: 'consistency', title: '两周的节奏',
    description: '连续 14 天保持活跃。', hidden: false,
    condition: { type: 'streak', target: 14 }, rewardXp: 60, emblem: '🌿',
  },
  {
    id: 'streak_30', category: 'consistency', title: '一个月的河流',
    description: '连续 30 天保持活跃。', hidden: false,
    condition: { type: 'streak', target: 30 }, rewardXp: 80, emblem: '🌊',
  },
  {
    id: 'freeze_saved', category: 'consistency', title: '有惊无险',
    description: '用掉 1 张冻结卡之后，连续记录仍然保住了。', hidden: false,
    condition: { type: 'count', event: 'freeze_used', target: 1 }, rewardXp: 30, emblem: '❄️',
  },
  {
    id: 'daily_goal_7', category: 'consistency', title: '七次达标',
    description: '累计 7 天达成当日学习目标。', hidden: false,
    condition: { type: 'count', event: 'daily_goal', target: 7 }, rewardXp: 50, emblem: '🎯',
  },

  /* ---------------- 深度型 Depth（6） ---------------- */
  {
    id: 'seminar_evidence_3', category: 'depth', title: '让原文说话',
    description: '在一次研讨中引用原文 3 次。', hidden: false,
    condition: { type: 'composite', mode: 'all', conditions: [
      { type: 'count', event: 'seminar_finish', target: 1 }, { type: 'flag', key: 'evidence3' },
    ] }, rewardXp: 50, emblem: '📖',
  },
  {
    id: 'dialogue_phrases_3', category: 'depth', title: '把新词用出去',
    description: '一次对话里用上 3 个目标短语。', hidden: false,
    condition: { type: 'composite', mode: 'all', conditions: [
      { type: 'count', event: 'scene_finish', target: 1 }, { type: 'flag', key: 'phrases3' },
    ] }, rewardXp: 50, emblem: '🧩',
  },
  {
    id: 'postwatch_detail', category: 'depth', title: '看得见细节',
    description: '在观后讨论里描述一个具体的视频细节。', hidden: false,
    condition: { type: 'composite', mode: 'all', conditions: [
      { type: 'count', event: 'postwatch_finish', target: 1 }, { type: 'flag', key: 'hasDetail' },
    ] }, rewardXp: 50, emblem: '🔍',
  },
  {
    id: 'spelling_retry_master', category: 'depth', title: '自己把字捡回来',
    description: '累计 3 次在拼错后重拼正确。', hidden: false,
    condition: { type: 'count', event: 'spelling_retry', target: 3 }, rewardXp: 40, emblem: '✍️',
  },
  {
    id: 'read_aloud_full', category: 'depth', title: '一句不落',
    description: '一次跟读把整句的词都读到了。', hidden: false,
    condition: { type: 'count', event: 'read_aloud_full', target: 1 }, rewardXp: 40, emblem: '🎧',
  },
  {
    id: 'seminar_4_rounds', category: 'depth', title: '追问到底',
    description: '完成一次 4 轮以上的研讨，并给出自己的主张。', hidden: false,
    condition: { type: 'composite', mode: 'all', conditions: [
      { type: 'count', event: 'seminar_finish', target: 1 }, { type: 'flag', key: 'rounds4' },
    ] }, rewardXp: 50, emblem: '🪜',
  },

  /* ---------------- 广度型 Breadth（5） ---------------- */
  {
    id: 'four_modules', category: 'breadth', title: '四条路都走过',
    description: '在对话、文学、文化、词场四个模块各完成一次学习单元。', hidden: false,
    condition: { type: 'composite', mode: 'all', conditions: [
      { type: 'count', event: 'scene_finish', target: 1 },
      { type: 'count', event: 'seminar_finish', target: 1 },
      { type: 'count', event: 'postwatch_finish', target: 1 },
      { type: 'count', event: 'word_complete', target: 1 },
    ] }, rewardXp: 60, emblem: '🧭',
  },
  {
    id: 'three_decks', category: 'breadth', title: '三座词库',
    description: '在 3 个不同词库各完成 10 个词。', hidden: false,
    condition: { type: 'count', event: 'deck_milestone', target: 3 }, rewardXp: 60, emblem: '📚',
  },
  {
    id: 'culture_themes_4', category: 'breadth', title: '四面来风',
    description: '观看覆盖 4 个文化主题的视频并各完成一次讨论。', hidden: false,
    condition: { type: 'count', event: 'theme_discussed', target: 4 }, rewardXp: 60, emblem: '🌍',
  },
  {
    id: 'wordlab_all_paths', category: 'breadth', title: '顺路捡词',
    description: '从阅读与观后讨论各把 1 个生词放进词场队列。', hidden: false,
    condition: { type: 'count', event: 'external_word_enqueued', target: 2 }, rewardXp: 50, emblem: '🧺',
  },
  {
    id: 'review_10_batches', category: 'breadth', title: '温故十回',
    description: '累计完成 10 个复习批次。', hidden: false,
    condition: { type: 'count', event: 'review_batch', target: 10 }, rewardXp: 60, emblem: '🗓️',
  },

  /* ---------------- 隐藏型 Hidden（4） ---------------- */
  {
    id: 'unknown_phrase', category: 'hidden', title: '没学过的词，先说了',
    description: '在对话里用一个从未学过的目标短语。', hidden: true,
    hint: '有时候，先开口再认识它。',
    condition: { type: 'composite', mode: 'all', conditions: [
      { type: 'count', event: 'round_effective', target: 1 }, { type: 'flag', key: 'unusedPhrase' },
    ] }, rewardXp: 50, emblem: '🪄',
  },
  {
    id: 'early_bird', category: 'hidden', title: '天刚亮的时候',
    description: '凌晨 5–7 点完成一次学习单元。', hidden: true,
    hint: '有些时刻，只有早起的人见过。',
    condition: { type: 'composite', mode: 'all', conditions: [
      { type: 'count', event: 'word_complete', target: 1 }, { type: 'flag', key: 'earlyBird' },
    ] }, rewardXp: 50, emblem: '🌅',
  },
  {
    id: 'comeback_read_aloud', category: 'hidden', title: '还是读了',
    description: '连续 3 天跳过跟读后，第 4 天完成一次跟读。', hidden: true,
    hint: '跳过很多次之后，总有一次会想读出来。',
    condition: { type: 'count', event: 'read_aloud_comeback', target: 1 }, rewardXp: 50, emblem: '🌤️',
  },
  {
    id: 'quiet_100_words', category: 'hidden', title: '悄悄走了一百步',
    description: '累计完整学会 100 个词。', hidden: true,
    hint: '不声不响的日子，也会留下痕迹。',
    condition: { type: 'count', event: 'word_complete', target: 100 }, rewardXp: 80, emblem: '🪨',
  },
]

export const ACHIEVEMENT_SEEDS: Seed[] = S

export function createAchievementState(): AchievementState {
  return {
    items: S.map((s) => ({
      ...structuredClone(s), progress: 0, unlocked: false, unlockedAt: null,
    })),
    version: 1,
  }
}

/** 事件 → 相关成就 ID 的倒排索引：判定只查这里，禁止全量扫描 */
export const ACHIEVEMENT_INDEX: Record<string, string[]> = (() => {
  const index: Record<string, string[]> = {}
  const walk = (cond: Achievement['condition'], id: string) => {
    if (cond.type === 'count') (index[cond.event] ??= []).push(id)
    else if (cond.type === 'composite') cond.conditions.forEach((c) => {
      if (c.type !== 'flag') walk(c, id)
    })
  }
  for (const s of S) {
    if (s.condition.type === 'streak') (index.__streak__ ??= []).push(s.id)
    else walk(s.condition, s.id)
  }
  // 去重（composite 里同一事件可能出现多次）
  for (const k of Object.keys(index)) index[k] = [...new Set(index[k])]
  return index
})()

export const ACHIEVEMENT_TOTAL = S.length
