/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** [云同步] 只声明前端可见的公开配置；service_role key 永不进入这里 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
