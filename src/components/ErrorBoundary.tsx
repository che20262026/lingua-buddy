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
 *
 * ── 双层用法（v2.4）──────────────────────────────────────────────────
 * · variant="screen"（默认）：整场兜底。任何未捕获异常都不会白屏，
 *   代价是这一屏的其它功能也一起暂停，直到用户刷新。
 * · variant="inline"：模块级兜底。罩在「当前页面内容」外面，
 *   某个模块崩了只让这个模块打嗝，底部导航与其余页面照常可用。
 *   配合 resetKey（一般传当前视图 id）：切换视图时自动清空错误状态，
 *   于是「对话崩了 → 点词场」能立刻回到正常，而不是卡死在降级页。
 *   离线功能（词场 / 复习 / 阅读）因此不会被一次崩溃拖下水。
 */
import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from './ui'

export type ErrorBoundaryVariant = 'screen' | 'inline'

type ErrorBoundaryProps = {
  children: ReactNode
  /** 可选诊断钩子：仅用于本地日志 / 未来接入监控，组件自身不发起任何网络请求 */
  onError?: (error: Error, info: ErrorInfo) => void
  /** 变化时清空错误状态：切视图后自动恢复，别的模块不被拖下水 */
  resetKey?: string | number
  /** screen = 全屏兜底；inline = 页面内的小卡片 */
  variant?: ErrorBoundaryVariant
  /** inline 模式的「离开」动作，例如返回首页 */
  onExit?: () => void
  exitLabel?: string
}

type ErrorBoundaryState = {
  hasError: boolean
  /** 每次手动重试 +1，用作子树 key，保证重试后组件真正重新挂载 */
  resetCount: number
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, resetCount: 0 }

  /** 渲染期出错 → 立刻切到降级 UI，避免 React 卸载整棵树露出白屏 */
  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true }
  }

  /** 记录而非吞掉：保留堆栈，并把诊断权交给调用方 */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 应用渲染异常：', error, info.componentStack)
    this.props.onError?.(error, info)
  }

  /** resetKey 变了（例如用户切换到别的视图）→ 清空错误状态，恢复正常渲染 */
  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  /** 模块级重试：清错误 + 换 key，让子树真正重新挂载 */
  private handleReset = () => {
    this.setState((prev) => ({ hasError: false, resetCount: prev.resetCount + 1 }))
  }

  /** 全屏降级页里唯一的用户动作：完整重载，让应用从干净状态重新起步 */
  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      /* key 变化即重挂载：resetKey 切换视图、resetCount 手动重试都会重新挂载子树 */
      return (
        <Fragment key={`${this.props.resetKey ?? 'root'}-${this.state.resetCount}`}>
          {this.props.children}
        </Fragment>
      )
    }
    if (this.props.variant === 'inline') return this.renderInline()
    return this.renderScreen()
  }

  /** 模块级降级：留在页面里，提示「换个模块继续用」 */
  private renderInline() {
    return (
      <div
        data-testid="error-boundary-inline"
        role="alert"
        aria-live="assertive"
        className="animate-in flex flex-col items-center gap-3 rounded-3xl border border-coral-400/30 bg-white px-5 py-6 text-center shadow-card"
      >
        <span
          aria-hidden="true"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-coral-100 text-coral-600"
        >
          <Icon name="info" size={19} />
        </span>
        <div>
          <p className="text-[14px] font-bold leading-relaxed text-ink">这个模块开小差了</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            只是这一页暂时打盹，其它功能不受影响——词场、复习、阅读都能继续用。
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            data-testid="error-boundary-reset"
            onClick={this.handleReset}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-brand-500 px-4 text-[12px] font-bold text-white shadow-soft transition hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:scale-[0.98]"
          >
            <Icon name="refresh" size={14} />
            重试这个模块
          </button>
          {this.props.onExit && (
            <button
              type="button"
              data-testid="error-boundary-exit"
              onClick={this.props.onExit}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-2xl border border-brand-100 bg-white px-3.5 text-[12px] font-semibold text-brand-600 transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:scale-[0.98]"
            >
              <Icon name="home" size={14} />
              {this.props.exitLabel || '返回首页'}
            </button>
          )}
        </div>
      </div>
    )
  }

  /** 全屏降级页：应用整体崩了，只剩这一条明确的退路 */
  private renderScreen() {
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
