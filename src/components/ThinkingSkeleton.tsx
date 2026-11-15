/**
 * [对话 UI 状态] AI 思考中的骨架屏 —— 取代原先「空白 + 三个小点」的等待。
 *
 * 设计定调（沿用 LinguaBuddy 柔和晨雾蓝，不引入新字体 / 外部资源以守住离线包）：
 *   记忆点 = 气泡顶部一条来回扫过的「推进轨」，配合三点呼吸与两行灰白骨架条，
 *   让「正在思考」有形状、有节奏，而不是一片空白。
 *
 * 纯展示组件：无 state、无定时器、无副作用，动画全部交给 CSS，
 * 因此组件卸载时不存在任何需要清理的资源（React 最佳实践）。
 * 无障碍：role="status" + aria-live="polite" + aria-busy，屏幕阅读器会播报状态；
 * prefers-reduced-motion 下所有动画在 index.css 中被关闭，进度轨变为静态细线。
 */
export function ThinkingSkeleton({ speaker = 'AI', testId = 'thinking-skeleton' }: {
  speaker?: string
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="AI 正在思考，正在生成回复"
      className="flex animate-in items-start gap-2.5"
    >
      <div aria-hidden="true" className="skeleton-breathe h-[34px] w-[34px] shrink-0 rounded-full bg-brand-100" />
      <div className="min-w-0 max-w-[82%] flex-1">
        <p className="mb-1 text-[10px] font-bold text-muted">{speaker} · 正在思考</p>
        <div className="bubble-ai relative overflow-hidden rounded-3xl rounded-tl-lg border border-brand-50 bg-white px-4 py-3.5 shadow-card">
          {/* 唯一的强调色动效：一条扫描轨，暗示「请求正在推进」而非卡死 */}
          <span aria-hidden="true" className="skeleton-track absolute left-0 top-0 h-[2px]" />
          <div aria-hidden="true" className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="skeleton-dot h-1.5 w-1.5 rounded-full bg-brand-400"
                style={{ animationDelay: `${i * 140}ms` }}
              />
            ))}
          </div>
          <div aria-hidden="true" className="mt-2.5 space-y-2">
            <div className="skeleton-bar h-2 w-[88%] rounded-full" />
            <div className="skeleton-bar h-2 w-[62%] rounded-full" style={{ animationDelay: '160ms' }} />
          </div>
          <span className="sr-only">AI 正在生成回复，请稍候</span>
        </div>
      </div>
    </div>
  )
}
