/**
 * 每日计划（今日推荐）—— 读取 active 等级，不读 recommended
 *
 * 应用里「每日计划」的实际落点是学习页的「今日小目标」卡片：
 * 它一边显示既有 XP 目标环，一边按用户当前选择的等级推荐一条内容。
 * 这里只做内容推荐：不发 XP、不写入口、不新建学习流程、不改变任何反馈逻辑。
 */

import type { LevelModule, LevelPreference } from '../levelTypes'
import { LEVEL_CONTENT_POOL } from '../data/levelPool'

export interface DailyTask {
  level: string
  label: string
  detail: string
  module: LevelModule
  itemId: string
}

/**
 * 稳定推荐：同一天、同一 active 等级返回同一条；等级一变，推荐立刻跟着变。
 * 注意：只使用 pref.active，绝不读取推荐等级字段 —— 尊重用户当前的手动选择。
 */
export function recommendDailyTask(
  pref: LevelPreference,
  pool = LEVEL_CONTENT_POOL,
  daySeed = new Date().toISOString().slice(0, 10),
): DailyTask {
  const level = pref.active
  const candidates = pool.filter((i) => i.cefr === level)
  const list = candidates.length ? candidates : pool
  let hash = 0
  for (const ch of `${daySeed}:${level}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const item = list[hash % Math.max(list.length, 1)]
  return {
    level,
    label: item.title,
    detail: item.blurb,
    module: item.module,
    itemId: item.id,
  }
}
