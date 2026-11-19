import { useEffect, useState, type FormEvent } from 'react'
import { useSyncData } from '../hooks/useSyncData'
import { Icon } from './ui'

/**
 * [云同步] 登录 / 注册弹窗 —— 首页横幅与设置页共用同一套表单。
 *
 * 移动端要点（对齐 mobile-ui-ux 规范）：
 *   - 底部弹层（sheet）形态，max-height 留出键盘空间，内容可滚动；
 *   - 邮箱 / 密码输入框使用 16px 字号，避免 iOS 聚焦时页面自动放大；
 *   - 主按钮热区 ≥44px；键盘弹出后「登录并同步」始终可见；
 *   - 未配置 Supabase 时不假装能登录：直接说明并给出设置页出路，绝不静默失败。
 */
export interface SyncLoginDialogProps {
  open: boolean
  onClose: () => void
}

export function SyncLoginDialog({ open, onClose }: SyncLoginDialogProps) {
  const sync = useSyncData()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  /* 每次打开都从干净状态开始，避免上一次的半截密码留在输入框里 */
  useEffect(() => {
    if (!open) return
    setEmail('')
    setPassword('')
    setMode('signin')
  }, [open])

  /* Esc 关闭：桌面端习惯；移动端有物理返回键也能走同一条路 */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    void (mode === 'signin' ? sync.signIn(email.trim(), password) : sync.signUp(email.trim(), password))
  }

  return (
    <div data-testid="sync-login-dialog" role="dialog" aria-modal="true" aria-label="登录或注册"
      className="fixed inset-0 z-[85] flex items-end justify-center bg-ink/40 px-3 pb-3 backdrop-blur-sm sm:items-center sm:pb-0"
      onClick={onClose}>
      <div
        className="flex max-h-[86vh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-white shadow-float sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-brand-50 px-4 pb-2 pt-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Icon name="user" size={18} />
            </div>
            <div>
              <p className="font-display text-sm font-black text-ink">账号与云同步</p>
              <p className="text-[10px] text-muted">登录后档案 / 错题本 / 复习队列可跨设备同步</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭登录弹窗"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-brand-50">
            <Icon name="close" size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {!sync.configured ? (
            <div data-testid="sync-login-not-configured"
              className="rounded-2xl bg-sun-100/60 p-3 text-[11px] leading-relaxed text-[#8a5b08]">
              <Icon name="info" size={13} className="mr-1" />
              当前构建未注入 Supabase 配置（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），
              因此无法登录或同步。学习功能不受影响，数据仍完整保存在本机。
              <br />
              配置方法见 <code>.env.example</code> 与 README 第二十七章；重新构建部署后此处即可登录。
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMode('signin')}
                  aria-pressed={mode === 'signin'}
                  className={`min-h-[44px] rounded-2xl px-3 py-2.5 text-xs font-bold transition ${
                    mode === 'signin' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>登录</button>
                <button type="button" onClick={() => setMode('signup')}
                  aria-pressed={mode === 'signup'}
                  className={`min-h-[44px] rounded-2xl px-3 py-2.5 text-xs font-bold transition ${
                    mode === 'signup' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>注册</button>
              </div>
              <label className="mt-3 block text-xs font-bold text-ink">邮箱
                <input className="field mt-1.5 !text-[16px]" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <label className="mt-2.5 block text-xs font-bold text-ink">密码
                <input className="field mt-1.5 !text-[16px]" type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" />
              </label>
              <button type="submit" disabled={sync.authBusy}
                data-testid="sync-login-submit"
                className="btn-primary mt-3 min-h-[46px] w-full !py-3 !text-sm">
                {sync.authBusy ? '请稍候…' : (mode === 'signin' ? '登录并同步' : '注册新账号')}
              </button>
              {sync.message && (
                <p className="mt-2 text-[11px] leading-relaxed text-coral-600" aria-live="polite">{sync.message}</p>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  )
}
