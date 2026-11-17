/**
 * 大肥鱼自由对话（Free Talk）数据契约
 * ------------------------------------------------------------------
 * 这个文件只放「类型」，不放内容：
 *   - 角色 id / 口音 / 动作 / 主题色 的形状定义在这里；
 *   - 6 个角色的具体人设内容在 src/data/fatFishCharacters.ts；
 *   - 后端 netlify/functions/freetalk.ts 会直接 import 同一份人设表，
 *     保证「前端显示的语气词」与「注入 System Prompt 的语气词」永远是同一份，
 *     杜绝两处各写一套导致的 OOC（出戏）。
 *
 * 三个刻意的设计约束：
 *   1. 口音只有英 / 美 / 澳三档，且都是 Web Speech API 真正认识的 lang 值
 *      （en-GB / en-US / en-AU），不做「英式」「美式」这种自由文本。
 *   2. 主题色拆成「强调色」与「可读文字色」两支：前者只用于装饰与描边，
 *      后者保证正文对比度 ≥ 4.5:1，颜色变了文字依然读得清。
 *   3. 动作只有 6 种，且每个动作对应一条 CSS keyframes（见 src/index.css），
 *      前端不自己算动画，避免「组件里写 style.animation」这种散兵游勇。
 */

/** 6 个大肥鱼的角色 id（同时是前端路由参数与后端白名单） */
export type FatFishId =
  | 'elf'
  | 'loli'
  | 'onee'
  | 'salaryman'
  | 'rocker'
  | 'surfer'

/** 角色对应的朗读口音：严格对应 Web Speech 的 lang 标签 */
export type FatFishAccent = 'en-US' | 'en-GB' | 'en-AU'

/**
 * 朗读时的专属动作：
 *   bounce 精灵式高频蹦跳 / sway 萝莉式左右摇摆 / float 御姐式缓慢浮动
 *   jitter 社畜式疲惫抖动 / rock 摇滚式甩头 / bob 冲浪式随浪起伏
 */
export type FatFishMotion = 'bounce' | 'sway' | 'float' | 'jitter' | 'rock' | 'bob'

/** 角色主题色：accent 只做装饰，accentInk 才允许承载正文 */
export interface FatFishTheme {
  /** 页面渐变起点 */
  bgFrom: string
  /** 页面渐变终点 */
  bgTo: string
  /** 主强调色（按钮、描边、进度） */
  accent: string
  /** 强调色的可读版本（浅底上的文字） */
  accentInk: string
  /** AI 气泡底色 */
  bubble: string
  /** 头像描边色 */
  ring: string
  /** 氛围光晕（半透明） */
  glow: string
}

/** 朗读参数：不同人设的语速与音高略有差异 */
export interface FatFishVoice {
  rate: number
  pitch: number
}

/** 一个大肥鱼角色的完整人设 */
export interface FatFishCharacter {
  id: FatFishId
  /** 角色名（气泡上方显示） */
  name: string
  /** 一句话身份标签（少年 / 青年 / 成年…） */
  title: string
  /** 年龄段 */
  ageBand: string
  /** 一句人设标语 */
  tagline: string
  /** 人设描述：直接进 System Prompt */
  persona: string
  /** 语气词库：每轮至少用一个，直接进 System Prompt */
  toneWords: string[]
  /** 句式约束：直接进 System Prompt */
  sentenceRule: string
  /** 禁用语气：防止串味到别的角色，直接进 System Prompt */
  avoidTone: string
  /** 口音相关的话题偏好（与口音文化叠加） */
  cultureHook: string
  /**
   * 形象描述：这条鱼长什么样（圆脸胖身 / 呆毛 / 配件）。
   * 注入 System Prompt 的【角色形象】段，让模型「知道自己长什么样」——
   * 文字形象与界面里的 SVG 形象说同一种话。
   */
  look: string
  /** 主题色 */
  theme: FatFishTheme
  /** 默认口音 */
  accent: FatFishAccent
  /** 朗读动作 */
  motion: FatFishMotion
  /** 语速 / 音高 */
  voice: FatFishVoice
}

/** 一条自由对话消息 */
export interface FreeTalkMessage {
  /** 气泡唯一 id：朗读时用它标记「哪一条正在发声」 */
  id: string
  role: 'user' | 'ai'
  text: string
  at?: number
}

/** 「结束并总结」返回的人设化反馈 */
export interface FreeTalkSummary {
  /** 聊天感受（角色口吻） */
  feeling: string
  /** 发音建议（角色口吻） */
  pronunciation: string
}

/** 后端返回的请求模式 */
export type FreeTalkMode = 'chat' | 'summary'

/** 口音展示名 */
export const FAT_FISH_ACCENT_LABELS: Record<FatFishAccent, string> = {
  'en-US': '美音 en-US',
  'en-GB': '英音 en-GB',
  'en-AU': '澳音 en-AU',
}

/** 口音展示名（短版，用于紧凑位置） */
export const FAT_FISH_ACCENT_SHORT: Record<FatFishAccent, string> = {
  'en-US': '美音',
  'en-GB': '英音',
  'en-AU': '澳音',
}
