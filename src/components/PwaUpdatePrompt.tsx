/**
 * [PWA] 兼容入口：底部更新提示的实现已迁到 UpdatePrompt.tsx。
 *
 * 保留本文件与 PwaUpdatePrompt 导出名，使既有引用 / 冒烟脚本零改动；
 * 新代码请直接使用 UpdatePrompt。更新策略仍为 registerType: 'prompt'。
 */
export { UpdatePrompt, UpdatePrompt as PwaUpdatePrompt } from './UpdatePrompt'
