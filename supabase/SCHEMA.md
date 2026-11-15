# LinguaBuddy · Supabase 数据库 Schema 设计

> 目标库：Supabase（PostgreSQL 15+） · 迁移文件：`supabase/migrations/20261114190000_create_user_data.sql`
> 本设计只建 **1 张表**，不改动前端任何 `localStorage` 键名、语义与业务逻辑。

## 一、概述

前端目前是纯本地存储：31 个 `lingua_*` 键各自保存一份 JSON。云端采用**单表 JSON 快照**：
一个用户 × 一种数据类型 = 一行。三类核心数据先接入，其余键可零 DDL 扩展。

## 二、ER 关系

```
auth.users (Supabase 内置)
   │ 1
   │
   │ *  (user_id → auth.users.id, on delete cascade)
public.user_data
   └─ unique (user_id, data_type)
```

- 1 个用户 → 多条 `user_data`（每种 `data_type` 一条）
- 用户被删除 → 其全部学习数据级联清除

## 三、表结构：`public.user_data`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `uuid` | 否 | `gen_random_uuid()` | 主键 |
| `user_id` | `uuid` | 否 | — | 外键 → `auth.users(id)`，级联删除 |
| `data_type` | `text` | 否 | — | 数据类型标识，小写下划线，1–64 字符 |
| `json_data` | `jsonb` | 否 | `'{}'::jsonb` | 整份本地快照，允许 object 或 array |
| `created_at` | `timestamptz` | 否 | `now()` | 首次写入时间 |
| `updated_at` | `timestamptz` | 否 | `now()` | 触发器自动维护，供多设备冲突判断 |

**约束**
- `uk_user_data_user_type UNIQUE (user_id, data_type)` — 幂等 upsert 的前提
- `ck_user_data_type CHECK (data_type ~ '^[a-z0-9_]{1,64}$')` — 宽松格式校验，不锁死枚举
- `ck_user_data_json CHECK (jsonb_typeof(json_data) in ('object','array'))` — 对象/数组都合法

**索引**
- `idx_user_data_user_id (user_id)` — 每条 RLS 策略都按 `user_id` 过滤
- `idx_user_data_updated_at (updated_at desc)` — 按同步时间倒序查询
- `uk_user_data_user_type` 的最左前缀已服务 `(user_id, data_type)` 精确定位

**触发器**：`trg_user_data_updated_at` / `public.set_user_data_updated_at()`，每次 UPDATE 自动刷新 `updated_at`。

## 四、三类核心数据的映射（对照 `src/types.ts`）

| 本地键 | `data_type` | `json_data` 形态 | 主要字段 |
|---|---|---|---|
| `lingua_profile` | `lingua_profile` | 对象 `Profile` | `nickname` `xp` `streak` `dailyGoal` `cefr` `achievements[]` |
| `lingua_mistakes` | `lingua_mistakes` | 数组 `Mistake[]` | `id` `original` `corrected` `type` `mastered` |
| `lingua_review_queue` | `lingua_review_queue` | 数组 `ReviewItem[]` | `id` `kind` `content` `dueAt` `level` |

其余 28 个键（词场 / 成长 / 文学 / 文化 / CEFR / 语音偏好等）直接沿用键名即可，无需改表。
⚠️ 若将来同步 `lingua_settings`，请先剔除 `apiKey` / `asrKey` ——用户自填的第三方密钥不应离开本机。

## 五、RLS（行级安全）

`alter table public.user_data enable row level security;` + `revoke all ... from anon;` + 仅授予 `authenticated` 增删改查。

| 策略 | 操作 | `using` | `with check` |
|---|---|---|---|
| `user_data_select_own` | SELECT | `auth.uid() = user_id` | — |
| `user_data_insert_own` | INSERT | — | `auth.uid() = user_id` |
| `user_data_update_own` | UPDATE | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `user_data_delete_own` | DELETE | `auth.uid() = user_id` | — |

四条全部带 `to authenticated`。`update` 必须同时写 `using` 与 `with check`，否则用户能把 `user_id` 改成别人后越权保存。

> `public` schema 会被 PostgREST 自动暴露：没开 RLS 等于把表公开给任何持有 anon key 的人。
> `service_role` 天然绕过 RLS，只能放在服务端，**绝不进前端代码**。

## 六、便捷 RPC

`public.upsert_user_data(p_data_type text, p_json_data jsonb)` — 默认 `SECURITY INVOKER`，RLS 仍生效；
`user_id` 一律取 `auth.uid()`，不接受客户端传入。仅授予 `authenticated` 执行权限。

```ts
// 读取
const { data } = await supabase.from('user_data')
  .select('json_data, updated_at').eq('data_type', 'lingua_profile').maybeSingle()

// 写入（同一 data_type 有则更新、无则插入）
await supabase.rpc('upsert_user_data', {
  p_data_type: 'lingua_profile',
  p_json_data: profile,
})
```

## 七、设计决策

1. **单表 JSON 而非三张关系表**：本地本就是"键 → JSON 值"，原样搬运最不容易出错；jsonb 未来可加 GIN 索引做内容检索。
2. **`unique(user_id, data_type)`**：让同步天然幂等，避免同类型多条记录产生"到底用哪条"的歧义。
3. **`json_data` 允许 object 或 array**：profile 是对象，错题本与复习队列是数组，一个约束同时容纳。
4. **`data_type` 用宽松正则而非枚举/CHECK 列表**：新增本地键不需要 `ALTER TABLE`，满足"方便以后扩展"。
5. **`updated_at` 触发器**：多设备同步时用它判断哪边更新，避免"登录即无条件覆盖"把真实数据冲掉。
6. **RLS 四条策略 + revoke anon**：读、写、改、删四个方向都封死，且匿名流量完全无权。

## 八、在 Supabase SQL Editor 中执行

1. 打开 Supabase 控制台 → 左侧 **SQL Editor** → **New query**
2. 把 `supabase/migrations/20261114190000_create_user_data.sql` 整段粘贴进去
3. 点 **Run**（或 `Ctrl + Enter`）→ 应显示 `Success. No rows returned`
4. **Table Editor** 里出现 `user_data`，表名旁 RLS 徽标为已启用
5. **Authentication → Policies** 里能看到 4 条 `user_data_*_own` 策略
6. 可选验证：SQL 文件第 7 段取消注释、把 `<your-user-uuid>` 换成真实用户 UUID 后单独运行，确认只能查到自己的行
   （SQL Editor 以 `postgres` 超级用户运行会绕过 RLS，必须 `set local role authenticated` 才能验证）

脚本全程幂等（`if not exists` / `drop policy if exists` / `create or replace`），重复执行不会产生重复对象或报错。
