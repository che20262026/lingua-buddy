/**
 * [全局错误边界] 应用崩溃时的「防白屏灯塔」。
 *
 * 设计定调：不画一个冷冰冰的红色堆栈框，而是一张气鼓鼓的卡通小脸——
 * 先让情绪被接住，再给一条明确的退路（重新加载）。视觉沿用晨雾蓝 +
 * coral/sun 暖色板，图标纯内联 SVG：离线包里不多一个网络请求。
 *
 * 边界纪律（React 官方错误边界规范）：
 * 1. 必须是 class 组件；getDerivedStateFromError 只负责切换降级状态，
 *    componentDidCatch 只负责记录，两者都不做重试、不发请求；
 * 2. 不吞错：控制台保留原始 error 与 componentStack，便于现场取证；
 *    另留 onError 钩子给未来接监控，但组件自身绝不发起任何网络调用；
 * 3. 捕获范围覆盖「渲染期 / 生命周期」的未捕获异常，兜住整棵子树；
 *    事件处理器与异步 Promise 里的错误仍需各自 try/catch（React 的固有边界）；
 * 4. 降级 UI 用 fixed inset-0 全屏覆盖，role="alert" + aria-live 播报，
 *    按钮 ≥44px 且 focus-visible 有可见焦点圈；不自动 reload、无定时器。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  /** 可选诊断钩子：仅用于本地日志 / 未来接入监控，组件自身不发起任何网络请求 */
  onError?: (error: Error, info: ErrorInfo) => void
}

type ErrorBoundaryState = { hasError: boolean }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  /** 渲染期出错 → 立刻切到降级 UI，避免 React 卸载整棵树露出白屏 */
  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  /** 记录而非吞掉：保留堆栈，并把诊断权交给调用方 */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 应用渲染异常：', error, info.componentStack)
    this.props.onError?.(error, info)
  }

  /** 全屏降级页里唯一的用户动作：完整重载，让应用从干净状态重新起步 */
  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        data-testid="error-boundary-fallback"
        role="alert"
        aria-live="assertive"
        className="app-bg fixed inset-0 z-[100] flex min-h-screen items-center justify-center px-6 py-10"
      >
        <div className="card animate-in flex w-full max-w-sm flex-col items-center gap-4 px-7 py-9 text-center">
          <svg
            data-testid="error-boundary-icon"
            aria-hidden="true"
            viewBox="0 0 120 120"
            className="h-28 w-28"
          >
            {/* 柔光底盘 + 暖黄脸蛋 */}
            <circle cx="60" cy="62" r="54" fill="#ffe9e3" />
            <circle cx="60" cy="62" r="42" fill="#fff2cf" stroke="#ffc95c" strokeWidth="3" />
            {/* 额头上的漫画怒气十字 */}
            <path d="M96 8 L108 20 L96 32 L84 20 Z" fill="#ffffff" stroke="#f97356"
              strokeWidth="3" strokeLinejoin="round" />
            <path d="M92 16 L100 24 M100 16 L92 24" stroke="#e05a3d"
              strokeWidth="3" strokeLinecap="round" />
            {/* 向内下压的怒眉 */}
            <path d="M36 48 L54 55" stroke="#1c2440" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M84 48 L66 55" stroke="#1c2440" strokeWidth="4.5" strokeLinecap="round" />
            {/* 圆眼睛 + 一点高光 */}
            <circle cx="45" cy="66" r="5" fill="#1c2440" />
            <circle cx="75" cy="66" r="5" fill="#1c2440" />
            <circle cx="46.5" cy="64.5" r="1.6" fill="#ffffff" />
            <circle cx="76.5" cy="64.5" r="1.6" fill="#ffffff" />
            {/* 气鼓鼓的腮红 */}
            <ellipse cx="33" cy="78" rx="7" ry="4" fill="#ff9478" opacity="0.7" />
            <ellipse cx="87" cy="78" rx="7" ry="4" fill="#ff9478" opacity="0.7" />
            {/* 撇起来的嘴 */}
            <path d="M48 88 Q60 80 72 88" fill="none" stroke="#1c2440"
              strokeWidth="4" strokeLinecap="round" />
          </svg>

          <h1 className="text-xl font-bold leading-relaxed text-ink">哎呀，应用开小差了</h1>
          <p className="text-[11px] leading-relaxed text-muted">
            别担心，学习进度都保存在本地，重新加载就能回来。
          </p>
          <button
            type="button"
            data-testid="error-boundary-reload"
            onClick={this.handleReload}
            className="btn-primary mt-1 min-h-[44px] w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }
}
