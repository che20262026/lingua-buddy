import { registerSW } from 'virtual:pwa-register'

/** registerSW 返回的「应用新版本」函数；传 true 才会 reload 页面 */
export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>
/** 旧类型名保留为兼容别名，既有引用无需改动 */
export type UpdateSW = UpdateServiceWorker

export interface PwaCallbacks {
  /** 检测到新版本已就绪：只通知 UI，绝不自动刷新 */
  onNeedRefresh: () => void
  /** App Shell 预缓存完成，可以离线打开 */
  onOfflineReady: () => void
  /** 注册失败（隐私模式 / 不支持 / 脚本 404）时仍然可以正常在线使用 */
  onRegisterError?: (error: unknown) => void
}

const NOOP: UpdateServiceWorker = async () => {}

/**
 * [PWA] 全应用唯一的 Service Worker 注册入口。
 *
 * 配合 vite.config.ts 的 registerType: 'prompt'：
 * - 新 SW 进入 waiting 状态只会触发 onNeedRefresh；
 * - 只有用户点击「立即更新」，组件才调用 updateSW(true)；
 * - 绝不 skipWaiting / clientsClaim / 自动 reload，学习到一半不会被打断。
 *
 * 无 serviceWorker 的环境（jsdom、旧浏览器、隐私模式）静默降级为 noop，
 * 应用所有既有功能照常工作。
 */
export function setupServiceWorker(callbacks: PwaCallbacks): UpdateServiceWorker {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return NOOP
  try {
    return registerSW({
      immediate: false,
      onNeedRefresh() { callbacks.onNeedRefresh() },
      onOfflineReady() { callbacks.onOfflineReady() },
      onRegisterError(error) {
        console.warn('[LinguaBuddy] Service Worker 注册失败，应用仍可在线使用：', error)
        callbacks.onRegisterError?.(error)
      },
    })
  } catch (error) {
    console.warn('[LinguaBuddy] Service Worker 初始化失败，应用仍可在线使用：', error)
    return NOOP
  }
}
