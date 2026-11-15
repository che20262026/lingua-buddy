import { useCallback, useEffect, useRef } from 'react'

/**
 * [React 最佳实践] 在途网络请求的生命周期守卫。
 * ---------------------------------------------------------------
 * 问题：组件卸载后 fetch 才 resolve，接着 setStatus / update(...)，
 * 轻则 React 警告，重则内存泄漏或把已离开页面的数据写回全局 store。
 *
 * 用法：
 *   const { nextSignal, isMounted } = useAbortableRequest()
 *   const signal = nextSignal()                 // 每次发请求前取新的 signal
 *   const res = await fetch(url, { signal })  // 由服务层合并进 AbortController
 *   if (!isMounted() || signal.aborted) return // await 之后绝不写 state
 *
 * 卸载时 effect cleanup 自动 abort 最后一次请求；新请求会先取消上一次，
 * 避免快速连点产生竞态。不持有任何全局状态，不新增 localStorage 键。
 */
export function useAbortableRequest() {
  const controllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  /** 生成并登记一个新的 AbortSignal；同时取消上一次仍在途的请求 */
  const nextSignal = useCallback((): AbortSignal => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return controller.signal
  }, [])

  /** await 之后的状态更新守卫 */
  const isMounted = useCallback((): boolean => mountedRef.current, [])

  return { nextSignal, isMounted }
}
