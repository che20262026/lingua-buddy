/**
 * 大肥鱼自由对话 · 离线兜底文案
 * ------------------------------------------------------------------
 * 上游不可用（没配密钥 / 断网 / 被限流 / 5xx）时，前端不会让对话中断，
 * 而是让「本地演示大肥鱼」顶上——但顶上来的这条鱼必须**还是那条鱼**：
 * 语气词、句式、口吻都不能变，否则用户会以为换了个模型。
 *
 * 所以这里按角色各写了一套兜底文案，模板占位符：
 *   {tone}  → 该角色的语气词（从人设表里按消息内容挑一个，保证不重复）
 *   {topic} → 用户这句话里的关键词（截断到 40 字符）
 *
 * 它是「演示」而不是「教学」：文案只求保住人设与节奏，不负责纠正语法。
 */

import type { FatFishId } from '../freetalkTypes'

export interface FatFishFallback {
  /** 兜底回复模板 */
  reply: string
  /** 兜底总结 · 聊天感受 */
  feeling: string
  /** 兜底总结 · 发音建议 */
  pronunciation: string
}

export const FAT_FISH_FALLBACKS: Record<FatFishId, FatFishFallback> = {
  elf: {
    reply: "{tone} That's a wild one! Tell me more about {topic} — I'm collecting cool moments today!",
    feeling: '{tone}今天超有收获的！你说的 {topic} 我记住了，下次咱们接着聊这个关卡~',
    pronunciation: '刚才那个 /θ/ 的音再干脆点，舌尖轻轻抵住上齿送气就行，别用喉咙顶出来。',
  },
  loli: {
    reply: "{tone} That's so cool! I wanna know more about {topic} too~",
    feeling: '{tone}今天和你聊天超开心的！你说的 {topic} 我偷偷记在本子上啦~',
    pronunciation: '刚才那个 /θ/ 的发音，舌头要稍微伸出来一点哦~ 像小蛇吐信子那样轻轻送气~',
  },
  onee: {
    reply: "{tone} Right, I'll circle back to that. Give me the quick version on {topic} — my bandwidth's tight today.",
    feeling: '{tone}这段对话相当高效，多谢配合。你提到的 {topic}，我已经记进 action item 了，咱们回头 touch base。',
    pronunciation: '刚才那个词尾的辅音收得太急了，让它在舌尖多停半拍——就算赶 deadline，发音也别赶。',
  },
  salaryman: {
    reply: '{tone} Tell me more about {topic} — I\'ve got room for one more bite, always.',
    feeling: '{tone}和你聊天太香了！你说的 {topic} 我听得口水都要流下来啦，下次咱们边吃边聊~',
    pronunciation: '刚才那个 /θ/ 的音，舌尖轻轻伸出来一点就好——别急，好饭不怕晚，慢慢把这个音送准。',
  },
  rocker: {
    reply: "{tone} Let's rock! {topic} sounds like the opening riff of a great song!",
    feeling: '{tone}今天这场即兴太带劲了！你说的 {topic} 直接被我写进下一张专辑里了。',
    pronunciation: '刚才那个 /v/ 用嘴唇咬住了，牙齿要碰上下唇，不然听起来就像 /w/。',
  },
  surfer: {
    reply: "{tone} No worries, mate. {topic} sounds like a pretty good swell — I'm in.",
    feeling: '{tone}好轻松的一段时间啊！你说的 {topic} 我记住了，下次退潮的时候再聊。',
    pronunciation: '刚才那个句尾的 /t/ 收得太干脆了，澳式英语里让它稍微带点尾音会更自然。',
  },
}

/** 取某个角色的兜底文案（未知 id 兜到第一条鱼） */
export function fallbackFor(id: FatFishId): FatFishFallback {
  return FAT_FISH_FALLBACKS[id] ?? FAT_FISH_FALLBACKS.elf
}
