import { useTypewriter } from '../hooks/useTypewriter'

interface TypewriterTextProps {
  /** store 里的完整回复；组件只控制「显示多少」，绝不改 store 数据 */
  text: string
  /** 只有真实 AI 的最新一条回复才播放动画；Mock / 历史消息直接显示全文 */
  enabled?: boolean
  /** 传流则走 SSE 逐字上屏；不传则走 30ms 定时器模拟 */
  stream?: ReadableStream<string> | null
  intervalMs?: number
  className?: string
  testId?: string
}

/**
 * [打字机] 渲染层组件：整段文本仍是一个 <span>，所以父级 <p> 的
 * textContent 与 TTS 自动朗读、冒烟断言完全兼容（动画关闭时即全文）。
 * 播放中显示光标，点一下（或按 Enter / Space）可跳过动画。
 */
export function TypewriterText({
  text,
  enabled = true,
  stream = null,
  intervalMs,
  className,
  testId,
}: TypewriterTextProps) {
  const { visible, isTyping, skip } = useTypewriter({ text, stream, enabled, intervalMs })
  return (
    <span
      data-testid={testId}
      className={className}
      onClick={isTyping ? skip : undefined}
      onKeyDown={isTyping
        ? (e) => { if (e.key === 'Enter' || e.key === ' ') skip() }
        : undefined}
      role={isTyping ? 'button' : undefined}
      tabIndex={isTyping ? 0 : undefined}
      title={isTyping ? '点击立即显示全部' : undefined}
    >
      {visible}
      {isTyping && <span aria-hidden="true" className="ml-0.5 animate-pulse text-brand-400">▍</span>}
    </span>
  )
}
