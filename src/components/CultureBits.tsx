/* ================================================================
 * [新增] 文化视角视频模块共享 UI 零件
 *
 * 不引入任何新品牌色：全部使用 brand / mint / sun / coral 既有色阶。
 * 播放器严格合规：官方 embed 域名、视口 ≥ 200×200、
 * 不在 iframe 上叠任何遮挡层（加载/失败态都是「替换」而非「覆盖」）。
 * ================================================================ */

import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  BackgroundCard, CaptionPreference, CulturalTheme, CultureVideo,
  KeyExpression, VideoSegment,
} from '../cultureTypes'
import { PLATFORM_POLICIES } from '../data/cultureSeed'
import {
  buildOfficialEmbedUrl, fallbackLabel, PLAYER_VIEWPORT,
} from '../services/culturePlayer'
import { cn } from '../lib/utils'
import { speak } from '../lib/speech'
import type { Settings } from '../types'
import { Chip, EmptyState, Icon, SectionTitle } from './ui'

/** 页头标签：观后讨论 / 文化首页与对话页、研讨页明确区分 */
export function CultureHeader({ eyebrow, title, subtitle, right }: {
  eyebrow: string; title: string; subtitle: string; right?: ReactNode
}) {
  return (
    <div className="animate-in">
      <Chip tone="coral" className="!px-2.5 !py-1 !text-[10px] tracking-widest">{eyebrow}</Chip>
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-black leading-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">{subtitle}</p>
        </div>
        {right}
      </div>
    </div>
  )
}

/** 版权 / 来源说明条 */
export function SourceNotice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-brand-200/50 bg-brand-50/60 p-3.5">
      <Icon name="info" size={15} className="mt-0.5 shrink-0 text-brand-600" />
      <div>
        <p className="text-[11px] font-bold text-brand-700">视频来源与许可 · Whitelist only</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink/70">{text}</p>
      </div>
    </div>
  )
}

/** 平台 / 许可 / 嵌入状态徽章；只需要几个元数据字段，详情页与列表项都能传 */
export function PlatformBadges({ video }: {
  video: Pick<CultureVideo, 'cefr' | 'platform' | 'embeddable' | 'nativeCaptions'>
}) {
  const policy = PLATFORM_POLICIES[video.platform]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip tone="brand" className="!px-2 !py-0.5 !text-[10px]">{video.cefr}</Chip>
      <Chip tone="mint" className="!px-2 !py-0.5 !text-[10px]">{policy?.label || video.platform}</Chip>
      <Chip tone="sun" className="!px-2 !py-0.5 !text-[10px]">
        {policy?.tier === 'open-license' ? '开放许可' : '官方嵌入'}
      </Chip>
      <Chip tone={video.embeddable ? 'brand' : 'coral'} className="!px-2 !py-0.5 !text-[10px]">
        {video.embeddable ? '可嵌入' : '需在原平台观看'}
      </Chip>
      {video.nativeCaptions && <Chip tone="slate" className="!px-2 !py-0.5 !text-[10px]">官方 CC 字幕</Chip>}
    </div>
  )
}

/** 原创渐变封面占位 + 装饰符号，不用任何第三方剧照 */
export function VideoCover({ emblem, from, to, size = 'md' }: {
  emblem: string; from: string; to: string; size?: 'sm' | 'md' | 'lg'
}) {
  const box = size === 'lg' ? 'h-24 w-24 text-4xl' : size === 'sm' ? 'h-11 w-11 text-lg' : 'h-16 w-16 text-2xl'
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-soft', from, to, box)}>
      <span aria-hidden="true">{emblem}</span>
    </div>
  )
}

/** 加载态 */
export function CultureLoader({ text = '正在准备文化卡片…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14">
      <div className="spinner h-9 w-9" />
      <p className="text-sm font-semibold text-brand-600">{text}</p>
      <p className="text-xs text-muted">CultureAnalyzerAgent 正在整理文化背景与短引用</p>
    </div>
  )
}

/** 播放器 / 数据加载失败态 */
export function CultureLoadError({ title, desc, onRetry, onBack }: {
  title: string; desc: string; onRetry: () => void; onBack: () => void
}) {
  return (
    <EmptyState emblem="📺" title={title} desc={desc}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onRetry} className="btn-primary !px-4 !py-2 !text-xs">重新加载</button>
          <button type="button" onClick={onBack} className="btn-ghost !px-4 !py-2 !text-xs">返回文化首页</button>
        </div>
      } />
  )
}

/* ---------------------------------------------------------------- *
 * 官方嵌入播放器
 *
 * 合规要点（逐条对应需求）：
 *  - src 由 buildOfficialEmbedUrl 生成，只会是官方 embed 域名；
 *  - 不下载、不转存、不抓流：应用内没有 <video> 与任何媒体文件地址；
 *  - 视口 ≥ 200×200（minWidth/minHeight + 16:9），不遮挡控件与广告；
 *  - 加载态与失败态「替换」iframe，不在播放器上叠任何覆盖层；
 *  - 不可嵌入 / 占位条目直接呈现清晰的降级状态，绝不伪装成可播放；
 *  - 字幕只走平台自带 CC（cc_load_policy），不重新渲染字幕全文。
 * ---------------------------------------------------------------- */

export function OfficialEmbedPlayer({ video, captionPreference }: {
  video: CultureVideo
  captionPreference: CaptionPreference
}) {
  const [mode, setMode] = useState<'idle' | 'playing' | 'failed'>('idle')
  const embedUrl = buildOfficialEmbedUrl(video, captionPreference)
  const canEmbed = Boolean(embedUrl)

  const openOriginal = () => {
    try { window.open(video.watchUrl, '_blank', 'noopener,noreferrer') } catch { /* 弹窗被拦时下方仍显示链接 */ }
  }

  // 不可嵌入 / Mock 占位：直接呈现清晰降级态，不伪造播放器
  if (!canEmbed) {
    return (
      <div className="overflow-hidden rounded-3xl border border-brand-100 bg-white" data-player-mode="fallback">
        <div className={cn('flex items-center justify-center bg-gradient-to-br text-5xl text-white', video.coverFrom, video.coverTo)}
          style={{ minHeight: PLAYER_VIEWPORT.minHeight }}>
          <span aria-hidden="true">{video.emblem}</span>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="coral" className="!px-2 !py-0.5 !text-[10px] tracking-widest">
              {video.embedMode === 'placeholder' ? 'MOCK 占位' : 'LINK ONLY'}
            </Chip>
            <Chip tone="slate" className="!px-2 !py-0.5 !text-[10px]">不在应用内播放</Chip>
          </div>
          <p className="mt-2 text-xs font-bold text-ink">
            {video.embedMode === 'placeholder' ? '此条目为 Mock 原创占位，没有真实视频' : '此视频需在原平台观看'}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{fallbackLabel(video)}</p>
          <p className="mt-2 rounded-xl bg-sun-100/60 p-2.5 text-[10px] leading-relaxed text-[#8a5b08]">
            应用不下载、不转存、不抓取任何视频流；下方文化卡与短引用仍可完整使用，观后讨论照常进行。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={openOriginal} className="btn-ghost !px-3 !py-1.5 !text-[11px]">
              在新窗口打开原页面 <Icon name="right" size={12} />
            </button>
            <a href={video.watchUrl} target="_blank" rel="noopener noreferrer"
              className="truncate self-center text-[10px] text-brand-600 hover:underline">{video.watchUrl}</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-player-mode={mode}>
      <div className="overflow-hidden rounded-3xl border border-brand-100 bg-black/5">
        {mode === 'idle' && (
          <div className={cn('flex flex-col items-center justify-center gap-3 bg-gradient-to-br text-white', video.coverFrom, video.coverTo)}
            style={{ minHeight: PLAYER_VIEWPORT.minHeight }}>
            <span className="text-5xl" aria-hidden="true">{video.emblem}</span>
            <p className="en-text max-w-[80%] truncate text-sm font-bold">{video.title}</p>
            <button type="button" onClick={() => setMode('playing')}
              className="flex items-center gap-2 rounded-2xl bg-white/95 px-4 py-2 text-xs font-bold text-brand-600 shadow-card transition hover:bg-white">
              <Icon name="play" size={15} />加载官方播放器
            </button>
            <p className="max-w-[85%] text-center text-[10px] leading-relaxed text-white/85">
              点击后由平台官方播放器加载；字幕请用播放器自带 CC，应用不复制字幕全文。
            </p>
          </div>
        )}

        {mode === 'playing' && (
          /* 播放器区域：没有任何覆盖层，控件与广告完全交给平台 */
          <iframe
            data-official-embed="true"
            data-embed-host={new URL(embedUrl!).hostname}
            title={`${video.title} · ${PLATFORM_POLICIES[video.platform].label} 官方播放器`}
            src={embedUrl!}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            className="block w-full border-0"
            style={{
              minWidth: PLAYER_VIEWPORT.minWidth,
              minHeight: PLAYER_VIEWPORT.minHeight,
              aspectRatio: PLAYER_VIEWPORT.aspect,
            }}
          />
        )}

        {mode === 'failed' && (
          <div className="flex flex-col items-center justify-center gap-2 bg-slate-100 py-10" style={{ minHeight: PLAYER_VIEWPORT.minHeight }}>
            <Icon name="info" size={26} className="text-coral-500" />
            <p className="text-xs font-bold text-ink">官方播放器没能加载</p>
            <p className="max-w-[85%] text-center text-[11px] leading-relaxed text-muted">
              可能是网络或平台限制。请在原平台观看；应用不会尝试下载或改换播放地址。
            </p>
          </div>
        )}
      </div>

      {/* 播放器下方的操作条：不覆盖播放器，不遮挡控件 */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] leading-relaxed text-muted">
          <Icon name="info" size={13} className="shrink-0 text-brand-500" />
          官方嵌入 · 视口 ≥ 200×200 · 不遮挡控件 · 字幕由平台自带 CC 提供
        </div>
        <div className="flex shrink-0 gap-1.5">
          {mode === 'playing' && (
            <button type="button" onClick={() => setMode('failed')}
              className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-muted">加载失败？</button>
          )}
          {mode === 'failed' && (
            <button type="button" onClick={() => setMode('playing')}
              className="rounded-xl bg-brand-50 px-2.5 py-1.5 text-[10px] font-bold text-brand-600">重试</button>
          )}
          <button type="button" onClick={openOriginal}
            className="rounded-xl bg-brand-50 px-2.5 py-1.5 text-[10px] font-bold text-brand-600">在新窗口观看原页面</button>
        </div>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
        字幕偏好「{captionPreference === 'on' ? '开' : captionPreference === 'off' ? '关' : '中英对照'}」只作用于官方播放器自带 CC；
        「中英对照」由下方短引用卡提供，不下载也不重绘字幕全文。
      </p>
    </div>
  )
}

/* ---------------- 内容卡片 ---------------- */

export function BackgroundCardView({ card }: { card: BackgroundCard }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 to-mint-100/50 p-4">
      <div className="flex items-center gap-2">
        <Icon name="bulb" size={15} className="text-brand-600" />
        <p className="text-xs font-bold text-brand-700">文化背景卡 · {card.title}</p>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-ink/80">{card.contentZh}</p>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        只针对这条视频的场景，不是对任何国家或群体的整体概括。
      </p>
    </div>
  )
}

export function CulturalThemeCards({ themes }: { themes: CulturalTheme[] }) {
  if (!themes.length) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {themes.map((t, i) => (
        <div key={`${t.theme}-${i}`} className="rounded-2xl border border-brand-50 bg-white/75 p-3">
          <p className="text-[11px] font-bold text-brand-600">✦ {t.theme}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink/80">{t.briefZh}</p>
          <p className="mt-1.5 rounded-xl bg-brand-50/70 p-2 text-[10px] leading-relaxed text-brand-700">
            👀 观看时注意：{t.watchFor}
          </p>
        </div>
      ))}
    </div>
  )
}

/** 短引用卡：单句/短语，带时间戳与来源标注，可朗读试听、可加入复习队列 */
export function ExpressionCards({ expressions, settings, onSave, saved }: {
  expressions: KeyExpression[]
  settings: Settings
  onSave: (expression: string) => void
  saved: string[]
}) {
  if (!expressions.length) return null
  return (
    <div className="space-y-2">
      {expressions.map((e, i) => {
        const isSaved = saved.includes(e.expression)
        return (
          <div key={`${e.expression}-${i}`} className="rounded-2xl border border-mint-400/30 bg-mint-100/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="en-text text-[13px] font-bold leading-relaxed text-ink">“{e.expression}”</p>
              <button type="button" aria-label={`朗读短引用 ${e.expression}`}
                onClick={() => speak(e.expression, settings)}
                className="shrink-0 rounded-lg bg-white/80 px-2 py-1 text-brand-600">
                <Icon name="speaker" size={13} />
              </button>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-ink/80">{e.meaningZh}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">场景：{e.context}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {e.timestampHint && <Chip tone="slate" className="!px-2 !py-0.5 !text-[10px]">约 {e.timestampHint}</Chip>}
                <span className="text-[10px] text-muted">{e.sourceNote || '短引用 · 非字幕'}</span>
              </div>
              <button type="button" onClick={() => onSave(e.expression)}
                className={cn('shrink-0 rounded-xl px-2.5 py-1 text-[10px] font-bold transition',
                  isSaved ? 'bg-mint-500 text-white' : 'bg-white text-brand-600 hover:bg-brand-50')}>
                {isSaved ? '✓ 已入队' : '＋ 加入复习队列'}
              </button>
            </div>
          </div>
        )
      })}
      <p className="text-[10px] leading-relaxed text-muted">
        以上均为单句 / 短语级短引用，标注来源与大致时间段；应用不展示完整字幕脚本。朗读只用于关键表达试听，不朗读字幕。
      </p>
    </div>
  )
}

export function SeedQuestionCards({ questions, onPick }: {
  questions: string[]; onPick?: (q: string) => void
}) {
  if (!questions.length) return null
  return (
    <div className="space-y-1.5">
      {questions.map((q, i) => (
        onPick ? (
          <button key={q} type="button" onClick={() => onPick(q)}
            className="en-text w-full rounded-xl bg-white/80 px-3 py-2 text-left text-[11px] font-semibold leading-relaxed text-ink hover:bg-white">
            {i + 1}. {q}
          </button>
        ) : (
          <p key={q} className="en-text rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-ink/80">
            {i + 1}. {q}
          </p>
        )
      ))}
    </div>
  )
}

/** 分段观看标记：元数据预配置，不在客户端解析字幕 */
export function SegmentMarkers({ segments, activeId, onPick }: {
  segments: VideoSegment[]
  activeId?: string
  onPick: (segment: VideoSegment) => void
}) {
  if (!segments.length) return null
  return (
    <div className="space-y-1.5">
      {segments.map((s) => (
        <button key={s.id} type="button" onClick={() => onPick(s)}
          className={cn('flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition',
            activeId === s.id ? 'border-brand-300 bg-brand-50' : 'border-brand-50 bg-white/70 hover:bg-white')}>
          <Chip tone="slate" className="!px-2 !py-0.5 !text-[10px] shrink-0">
            {`${String(Math.floor(s.startSec / 60)).padStart(2, '0')}:${String(s.startSec % 60).padStart(2, '0')}`}
          </Chip>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-ink">{s.label}</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{s.hintZh}</p>
          </div>
        </button>
      ))}
      <p className="text-[10px] leading-relaxed text-muted">分段由元数据预配置，只作为观看提示；应用不解析字幕或视频流。</p>
    </div>
  )
}

/** 通用小节标题包装，与现有页面间距一致 */
export function CultureSection({ title, subtitle, right, children }: {
  title: string; subtitle?: string; right?: ReactNode; children: ReactNode
}) {
  return (
    <section>
      <SectionTitle title={title} subtitle={subtitle} right={right} />
      {children}
    </section>
  )
}
