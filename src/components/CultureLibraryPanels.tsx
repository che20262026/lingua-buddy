/* ================================================================
 * 三层储量体系的 UI：库健康度面板 + 播放列表注册表面板
 *
 * 「储量丰富」必须可观测、可维护：
 *   - 健康度面板：总条目 / 种子 / 同步 / 主题分布 / 可嵌入率 / 最近同步；
 *   - 注册表面板：每个播放列表的来源、状态、条目数与「同步播放列表」按钮。
 *
 * 硬约束（与 playlistSync.ts 一致）：
 *   - 同步只由用户点击按钮触发，页面加载绝不自动拉取；
 *   - mock 模式零网络零密钥；代理模式由服务端持有 API Key。
 * ================================================================ */

import { useMemo, useState } from 'react'
import { useApp } from '../store/useAppStore'
import type { PlaylistRegistryState } from '../cultureLibraryTypes'
import type { CultureLibraryState } from '../cultureTypes'
import { computeLibraryHealth, percent } from '../lib/cultureLibraryHealth'
import { cooldownRemaining, syncPlaylists } from '../services/playlistSync'
import type { PlaylistSyncReport } from '../cultureLibraryTypes'
import {
  QUOTA_NOTICE, SOURCE_LABELS, SYNC_POLICY,
} from '../data/playlistRegistrySeed'
import { Card, Chip, Icon } from './ui'
import { cn } from '../lib/utils'

function formatTime(ts: number | null): string {
  if (!ts) return '从未同步'
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`
}

/* ---------------- 库健康度面板（纯展示，数据来自纯函数） ---------------- */

export function LibraryHealthPanel({ library, registry }: {
  library: CultureLibraryState
  registry: PlaylistRegistryState
}) {
  const health = useMemo(() => computeLibraryHealth(library, registry), [library, registry])
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">📈 库健康度</p>
        <div className="flex items-center gap-1.5">
          <Chip tone={health.healthy ? 'mint' : 'coral'}>
            {health.healthy ? '储量健康' : '待补充'}
          </Chip>
          <Chip tone="slate">最近同步：{formatTime(health.lastSyncAt)}</Chip>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        <div className="rounded-xl bg-brand-50/70 p-2.5">
          <p className="text-lg font-black text-brand-600">{health.total}</p>
          <p className="text-muted">总视频 · 种子 {health.seedCount} / 同步 {health.syncedCount}</p>
        </div>
        <div className="rounded-xl bg-mint-100/60 p-2.5">
          <p className="text-lg font-black text-mint-600">{percent(health.embeddableRate)}</p>
          <p className="text-muted">可嵌入率（其余走外链降级）</p>
        </div>
        <div className="rounded-xl bg-sun-100/70 p-2.5">
          <p className="text-lg font-black text-sun-700">{percent(health.voaShare)}</p>
          <p className="text-muted">VOA 压舱石占比（目标 ≥40%）</p>
        </div>
        <div className="rounded-xl bg-coral-100/60 p-2.5">
          <p className="text-lg font-black text-coral-600">{health.enabledPlaylistCount}/{health.playlistCount}</p>
          <p className="text-muted">启用播放列表 / 已同步 {health.syncedPlaylistCount}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {health.topics.map((t) => (
          <div key={t.topic} className="flex items-center gap-2 text-[11px]">
            <span className="w-4 shrink-0">{t.emblem}</span>
            <span className={cn('w-32 shrink-0 truncate', t.low ? 'font-bold text-coral-600' : 'text-ink/80')}>
              {t.label}
            </span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/10">
              <div className={cn('h-full rounded-full', t.low ? 'bg-coral-400' : 'bg-mint-400')}
                style={{ width: `${Math.min(100, (t.count / Math.max(1, t.minimum)) * 100)}%` }} />
            </div>
            <span className={cn('shrink-0 font-semibold', t.low ? 'text-coral-600' : 'text-muted')}>
              {t.count}/{t.minimum}{t.low ? ' 偏少' : ''}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[10px] leading-relaxed text-muted">
        库里没有任何通过 search.list 获得的条目（{health.searchListEntries} 条）；
        非种子条目的唯一来源是已注册播放列表的 playlistItems.list 同步。
      </p>
    </Card>
  )
}

/* ---------------- 播放列表注册表面板（储量增长引擎） ---------------- */

export function PlaylistRegistryPanel() {
  const { data, update, notify } = useApp()
  const [syncing, setSyncing] = useState(false)
  const [lastReport, setLastReport] = useState<PlaylistSyncReport | null>(null)
  const registry = data.playlistRegistry

  const syncable = cooldownRemaining // 保持引用：面板文案与冷却逻辑同源
  void syncable

  const handleSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const mode = registry.proxyEndpoint ? 'proxy' : 'mock'
      const out = await syncPlaylists({
        registry, library: data.cultureVideos, mode,
      })
      update((prev) => ({
        ...prev,
        cultureVideos: out.library,
        playlistRegistry: out.registry,
      }))
      setLastReport(out.report)
      if (out.report.added > 0) {
        notify(`同步完成：新增 ${out.report.added} 条 · 跳过重复 ${out.report.skipped} 条`)
      } else {
        notify('同步完成：没有新增条目（重复已去重或暂无可同步列表）')
      }
    } catch (err) {
      notify(err instanceof Error ? `同步失败：${err.message}` : '同步失败，请稍后重试')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-ink">🎛️ 播放列表注册表 · 储量增长引擎</p>
          <p className="mt-0.5 text-[11px] text-muted">
            预置 {registry.playlists.length} 个官方播放列表 · 单次最多同步 {SYNC_POLICY.maxPlaylistsPerRun} 个 ·
            同一列表 {SYNC_POLICY.minIntervalMs / 3600000} 小时内不重复拉取
          </p>
        </div>
        <button type="button" onClick={handleSync} disabled={syncing}
          className={cn('btn-primary !px-4 !py-2 !text-xs', syncing && 'opacity-60')}>
          {syncing ? '同步中…' : '🔄 同步播放列表'}
        </button>
      </div>

      <div className="mt-3 space-y-1.5">
        {registry.playlists.map((p) => {
          const cd = cooldownRemaining(p)
          const status = !p.enabled ? { label: '停用 · 待验证嵌入权限', tone: 'slate' as const }
            : p.lastFetchedAt ? { label: cd > 0 ? '冷却中' : '可再同步', tone: 'mint' as const }
              : { label: '待首次同步', tone: 'coral' as const }
          return (
            <div key={p.playlistId} className="rounded-xl bg-white/70 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="min-w-0 truncate text-xs font-bold text-ink">{p.label}</p>
                <Chip tone={status.tone} className="!px-2 !py-0.5 !text-[10px]">{status.label}</Chip>
              </div>
              <p className="mt-1 truncate text-[10px] text-muted">
                {SOURCE_LABELS[p.source]} · {p.topicHint} · {p.cefrHint}
                {p.lastFetchedAt ? ` · 上次 ${formatTime(p.lastFetchedAt)} 拉到 ${p.videoCount} 条` : ''}
              </p>
              <p className="mt-1 truncate text-[10px] text-muted" title={p.note}>
                <a href={p.verifiedUrl} target="_blank" rel="noreferrer"
                  className="text-brand-600 underline decoration-brand-300 underline-offset-2">
                  来源依据
                </a>
                <span className="mx-1">·</span>{p.note}
              </p>
              <p className="mt-0.5 font-mono text-[9px] text-muted/80">{p.playlistId}</p>
            </div>
          )
        })}
      </div>

      {lastReport && (
        <div className="mt-3 rounded-xl bg-mint-100/50 p-3 text-[11px] leading-relaxed">
          <p className="font-bold text-mint-700">
            上次同步（{lastReport.mode === 'mock' ? 'Mock · 零网络' : '代理'}）：+{lastReport.added} 条 · 跳过 {lastReport.skipped} 条 · 消耗 {lastReport.quotaUnits} 单位
          </p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {lastReport.results.map((r) => (
              <li key={r.playlistId} className="truncate">
                · {r.playlistId.slice(0, 22)}… 拉到 {r.fetched} 条，新增 {r.added} 条
                {r.error ? `（${r.error}）` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 rounded-xl bg-brand-50/60 p-3 text-[10px] leading-relaxed text-brand-700">
        {QUOTA_NOTICE}
        当前累计消耗 {registry.quotaUnitsUsed} 单位（每列表每次 1 单位）。
        代理地址{registry.proxyEndpoint ? '已配置（API Key 只留在代理侧）' : '未配置 → Mock 模式，零网络零密钥也能完整体验同步过程'}。
      </p>
    </Card>
  )
}
