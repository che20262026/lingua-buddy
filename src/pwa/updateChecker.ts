/**
 * [PWA] 主动更新检查（registerType:'prompt' 语义不变）
 *
 * 职责边界（与 useRegisterSW 唯一注册入口互补，绝不重复注册）：
 * - 本模块**不调用 registerSW**，只拿已存在的 registration 调 `.update()`，
 *   让浏览器提前发现 waiting 的新 SW —— 注册仍由 UpdatePrompt 的 hook 独占。
 * - prompt 语义不变：发现新版本只置 needRefresh，绝不自动激活等待中的 SW、不抢占客户端、不重载页面。
 * - controllerchange 只置「下次导航生效」的会话标记，不触发任何 UI 强制刷新，
 *   避免打断正在进行的对话 / 录音。
 * - 所有 update 调用异步、失败静默（最多 console.warn），不阻塞首屏。
 */

/** 定时检查周期（毫秒）：默认 60 分钟，改这个值即可配置 */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
/** visibilitychange / online 触发的检查节流窗口（毫秒）：60 秒内不重复 */
export const UPDATE_CHECK_THROTTLE_MS = 60 * 1000

/** 会话级标记：controllerchange 发生后为 true，提示「下次导航生效」，不强制刷新 */
let controllerChangedThisSession = false

/** 供 UI 查询：本会话是否发生了新 SW 接管（只置标记、下次导航生效） */
export function didControllerChange(): boolean {
  return controllerChangedThisSession
}

/** 拿到已注册的 SW，触发一次更新检查；失败静默 */
async function probeUpdate(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const sw = navigator.serviceWorker
    // 残缺环境 / 老浏览器 / 测试桩可能只挂了 register：没有 getRegistration 就安静跳过
    if (typeof sw.getRegistration !== 'function') return
    const reg = await sw.getRegistration()
    // 没有注册（首屏 hook 尚未注册 / 不支持环境）时安静跳过，绝不自己注册
    if (!reg || typeof reg.update !== 'function') return
    await reg.update()
  } catch (error) {
    console.warn('[LinguaBuddy] 更新检查失败，应用仍可正常使用：', error)
  }
}

/**
 * 启动主动检查，返回清理函数供组件卸载时调用。
 * - 立即做一次探测（幂等，无注册时空跑）；
 * - 设_interval_周期检查（默认 60min）；
 * - visibilitychange 回到前台 / online 恢复网络时各查一次（60s 节流）；
 * - controllerchange 只置标记，不 reload。
 */
export function startUpdateChecks(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  if (!('serviceWorker' in navigator)) return () => {}

  // 立即探测一次：无注册时空跑，不阻塞首屏
  void probeUpdate()

  let lastCheck = Date.now()
  const throttledProbe = () => {
    const now = Date.now()
    if (now - lastCheck < UPDATE_CHECK_THROTTLE_MS) return
    lastCheck = now
    void probeUpdate()
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') throttledProbe()
  }
  const onOnline = () => throttledProbe()
  const onControllerChange = () => { controllerChangedThisSession = true }

  const timer = window.setInterval(() => { void probeUpdate() }, UPDATE_CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  // controllerchange 监听同样做存在性守卫：残缺 SW 桩缺 addEventListener 时静默降级
  const sw = navigator.serviceWorker
  const canListenController = typeof sw.addEventListener === 'function' && typeof sw.removeEventListener === 'function'
  if (canListenController) sw.addEventListener('controllerchange', onControllerChange)

  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    if (canListenController) sw.removeEventListener('controllerchange', onControllerChange)
  }
}
