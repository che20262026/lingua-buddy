import { useState, type FormEvent } from 'react'
import { Card, Chip, Icon, SectionTitle } from './ui'
import { useSyncData } from '../hooks/useSyncData'

const PHASE_TEXT: Record<string, string> = {
  idle: '未同步', checking: '检查云端中…', pushing: '上传中…',
  pulling: '恢复中…', conflict: '等待选择', ready: '已同步', error: '同步失败',
}

/** [云同步] 设置页的登录/注册 + 同步状态 + 冲突选择，纯 UI，逻辑全在 useSyncData */
export function CloudSyncCard() {
  const sync = useSyncData()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    void (mode === 'signin' ? sync.signIn(email.trim(), password) : sync.signUp(email.trim(), password))
  }

  const lastText = sync.lastSyncedAt
    ? new Date(sync.lastSyncedAt).toLocaleTimeString('zh-CN', { hour12: false })
    : null

  return (
    <Card>
      <SectionTitle title="账号与云同步" subtitle="登录后，档案 / 错题本 / 复习队列会在设备间同步；其余设置仍只存本机。"
        right={<Chip tone={sync.configured ? (sync.user ? 'mint' : 'brand') : 'sun'}>
          {sync.configured ? (sync.user ? '已登录' : '未登录') : '未配置'}
        </Chip>} />

      {!sync.configured ? (
        <div data-testid="cloud-not-configured"
          className="rounded-2xl bg-sun-100/60 p-3 text-[11px] leading-relaxed text-[#8a5b08]">
          <Icon name="info" size={14} className="mr-1" />
          未检测到 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。当前仍是纯本地模式，所有学习功能照常可用。
          配置方法见 <code>.env.example</code> 与 README 第二十七章。
        </div>
      ) : sync.user ? (
        <div data-testid="cloud-account-panel">
          <p className="text-xs font-bold text-ink">已登录：{sync.user.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <Chip tone="mint">{PHASE_TEXT[sync.phase] || sync.phase}</Chip>
            {lastText && <span>最近同步 {lastText}</span>}
          </div>
          {sync.message && <p className="mt-2 text-[11px] leading-relaxed text-muted" aria-live="polite">{sync.message}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" data-testid="cloud-push-now" onClick={() => void sync.pushNow()}
              className="btn-ghost !py-2 !text-xs">立即上传</button>
            <button type="button" data-testid="cloud-sign-out" onClick={() => void sync.signOut()}
              className="btn-ghost !py-2 !text-xs">退出登录</button>
          </div>
        </div>
      ) : (
        <form data-testid="cloud-auth-form" onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('signin')}
              className={`seg-btn rounded-xl px-3 py-2 text-xs font-bold transition ${mode === 'signin' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>登录</button>
            <button type="button" onClick={() => setMode('signup')}
              className={`seg-btn rounded-xl px-3 py-2 text-xs font-bold transition ${mode === 'signup' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>注册</button>
          </div>
          <label className="block text-xs font-bold text-ink">邮箱
            <input className="field mt-1.5" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label className="block text-xs font-bold text-ink">密码
            <input className="field mt-1.5" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" />
          </label>
          <button type="submit" disabled={sync.authBusy}
            className="btn-primary w-full !py-2 !text-xs">
            {sync.authBusy ? '请稍候…' : (mode === 'signin' ? '登录并同步' : '注册新账号')}
          </button>
          {sync.message && <p className="text-[11px] leading-relaxed text-coral-600" aria-live="polite">{sync.message}</p>}
        </form>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-muted">
        只同步三类核心数据；<code>apiKey</code> / <code>asrKey</code> 等设置永不离开本机。云端由 RLS 隔离，只有账号本人能读写。
      </p>

      {sync.conflictOpen && (
        <div data-testid="sync-conflict-dialog" role="dialog" aria-modal="true" aria-label="同步冲突"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/30 p-4">
          <div className="glass w-[min(92vw,440px)] rounded-3xl border border-brand-100 p-5 shadow-float">
            <p className="font-display text-base font-black text-ink">两端都有学习数据</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              云端和这台设备都存有学习记录。请选择保留哪一份——另一份会被覆盖，此操作不可撤销。
            </p>
            <div className="mt-4 grid gap-2">
              <button type="button" data-testid="conflict-keep-local" onClick={() => void sync.resolveConflict('local')}
                className="btn-primary w-full !py-2.5 !text-xs">保留本地（覆盖云端）</button>
              <button type="button" data-testid="conflict-use-cloud" onClick={() => void sync.resolveConflict('cloud')}
                className="btn-ghost w-full !py-2.5 !text-xs">使用云端（覆盖本地）</button>
              <button type="button" data-testid="conflict-defer" onClick={sync.deferConflict}
                className="text-[11px] text-muted underline">暂不决定，稍后手动处理</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
