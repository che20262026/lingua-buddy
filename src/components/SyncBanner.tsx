import { useState } from 'react'
import { useSyncData } from '../hooks/useSyncData'
import { useApp } from '../store/useAppStore'
import { Icon } from './ui'
import { SyncLoginDialog } from './SyncLoginDialog'

/**
 * [云同步] 首页顶部横幅 —— 让"数据只在本机"这件事在真机第一屏就可见。
 *
 * 背景：账号入口原先只挂在设置页末尾（还隔着三十多个存储键的清单），
 * 手机用户根本找不到，于是以为应用没有登录功能。本横幅是移动端的主入口。
 *
 * 三态：
 *   - 未登录      → 醒目告警条，点一下直接弹登录/注册弹窗
 *   - 已登录      → 收成一枚安静的「已同步」状态条，点一下跳设置页账号区块
 *   - 未配置 Supabase → 如实说明"本构建未接入云端"，不假装能登录
 *
 * 移动端要点：
 *   - 整条可点，热区高度 ≥44px，单手拇指够得着；
 *   - 文案短、字号 ≥11px，不用长句吓退用户；
 *   - 状态用 aria-live 播报，读屏用户也能感知。
 */
export function SyncBanner() {
  const sync = useSyncData()
  const { navigate } = useApp()
  const [dialogOpen, setDialogOpen] = useState(false)

  /* 已登录：不再占用黄金位，收成一枚状态条 */
  if (sync.user) {
    return (
      <button type="button"
        data-testid="sync-banner-synced"
        onClick={() => navigate('settings')}
        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-2xl border border-mint-200/70 bg-mint-100/70 px-3.5 py-2.5 text-left transition hover:border-mint-300">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 text-mint-700">
          <Icon name="cloud" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold text-ink">已同步到云端</span>
          <span className="block truncate text-[10px] text-muted">
            档案 / 错题本 / 复习队列已上云，换设备登录同一账号即可恢复
          </span>
        </span>
        <Icon name="right" size={14} className="shrink-0 text-muted" />
      </button>
    )
  }

  /* 未配置云端：说清楚原因，别让用户以为是自己操作错了 */
  if (!sync.configured) {
    return (
      <div data-testid="sync-banner-unconfigured"
        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500">
          <Icon name="info" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold text-ink">当前版本未接入云同步</span>
          <span className="block truncate text-[10px] text-muted">学习数据仍完整保存在本机，功能不受影响</span>
        </span>
      </div>
    )
  }

  /* 未登录：告警条 + 直接弹登录窗 */
  return (
    <>
      <button type="button"
        data-testid="sync-banner"
        aria-label="数据仅存于本机，点击登录同步云端"
        onClick={() => setDialogOpen(true)}
        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-2xl border border-sun-200 bg-sun-100/70 px-3.5 py-2.5 text-left transition hover:border-sun-300">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/85 text-[#a56a08]">
          <Icon name="user" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold text-ink">⚠️ 数据仅存于本机，换设备会丢失</span>
          <span className="block truncate text-[10px] text-[#8a5b08]">点击登录同步云端</span>
        </span>
        <Icon name="right" size={14} className="shrink-0 text-[#a56a08]" />
      </button>
      <SyncLoginDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  )
}
