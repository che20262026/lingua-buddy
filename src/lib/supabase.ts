import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * [云同步] 全应用唯一的 Supabase 客户端。
 *
 * - 只读取 VITE_ 前缀的公开配置（anon key 本就会出现在浏览器里，可安全下发）；
 *   **绝不可**把 service_role key 放进这里，它绕过 RLS。
 * - 未配置环境变量时返回 null：应用保持原来的纯本地 localStorage 模式，
 *   所有学习功能、Mock 降级、PWA 行为照常工作，不产生任何网络请求。
 */
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const isSupabaseConfigured = Boolean(url && anonKey)
console.log("读取到的Supabase URL 是:",url)
console.log("当前读取到的Key开头:",anonKey.substring(0,15)+"...")
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null

/** 把 SDK 错误翻译成人话；不回显任何密钥、token 或原始 endpoint */
export function toSyncError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (/fetch|network|Failed to fetch/i.test(raw)) return '网络连接失败，请检查网络后重试'
  if (/invalid login credentials|Invalid login credentials/i.test(raw)) return '邮箱或密码不正确'
  if (/Email not confirmed|email.*confirm/i.test(raw)) return '邮箱尚未验证，请先查收验证邮件'
  if (/JWT|token|expired|401/i.test(raw)) return '登录状态已过期，请重新登录'
  if (/permission|policy|42501|403|row-level/i.test(raw)) return '没有读写权限，请确认已执行建表 SQL 并开启 RLS'
  if (/user already registered|already been registered/i.test(raw)) return '该邮箱已注册，请直接登录'
  return raw || '操作失败，请稍后重试'
}
