/**
 * [PWA] Service Worker 能力探测与共享类型。
 *
 * ⚠️ 注册入口已迁移：本模块**不再调用 registerSW**。
 * 旧实现用 `virtual:pwa-register` 手写注册，再由组件 useEffect 调用；
 * 现在改用 `virtual:pwa-register/react` 的 useRegisterSW hook（见
 * src/components/UpdatePrompt.tsx），注册动作发生在该 hook 内部。
 *
 * 两者只能二选一 —— 若两处都注册，Service Worker 会被注册两次：
 * waiting 事件触发两遍、onNeedRefresh 回调两遍、controlling 后重复刷新。
 * 因此「全应用唯一注册入口」这条红线现在由
 * `virtual:pwa-register/react` 这一处承担，本模块只做能力探测。
 *
 * 能力探测存在的意义：隐私模式 / 老浏览器 / jsdom 等无 serviceWorker 的环境里，
 * 插件自带的 registerSW 会静默降级为 noop（updateServiceWorker 永不触发刷新），
 * UI 层据此提前收声，不弹任何用户看不懂的提示。
 */

/** registerSW 返回的「应用新版本」函数；传 true 才会让 waiting SW 接管并重载页面 */
export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>
/** 旧类型名保留为兼容别名，既有引用无需改动 */
export type UpdateSW = UpdateServiceWorker

/** 当前环境是否真的支持 Service Worker */
export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}
