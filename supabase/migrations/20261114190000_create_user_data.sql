-- =============================================================================
-- LinguaBuddy · Supabase 云同步表 user_data
-- 目标数据库：Supabase (PostgreSQL 15+)
-- 用法：整段粘贴到 Supabase SQL Editor 执行；脚本幂等，可重复运行。
--
-- 设计：一个用户 × 一种 data_type = 一行（unique(user_id, data_type)）。
-- 本地 31 个 localStorage 键按需映射为 data_type，json_data 存整份快照
-- （对象或数组均可）；以后新增本地键不需要改表结构。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 表结构
-- -----------------------------------------------------------------------------
create table if not exists public.user_data (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  data_type   text        not null,
  json_data   jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint uk_user_data_user_type unique (user_id, data_type),
  constraint ck_user_data_type check (data_type ~ '^[a-z0-9_]{1,64}$'),
  constraint ck_user_data_json check (jsonb_typeof(json_data) in ('object', 'array'))
);

comment on table  public.user_data is 'LinguaBuddy 用户学习数据：单表 JSON 快照，一个用户每种 data_type 一行';
comment on column public.user_data.id         is '主键 UUID';
comment on column public.user_data.user_id    is '归属用户，对应 auth.users(id)，用户删除时级联清除';
comment on column public.user_data.data_type  is '数据类型标识，如 lingua_profile / lingua_mistakes / lingua_review_queue；小写下划线，便于扩展';
comment on column public.user_data.json_data  is '整份本地快照（对象或数组）；新增本地键无需改表';
comment on column public.user_data.created_at is '首次写入时间';
comment on column public.user_data.updated_at is '最后同步时间，由触发器自动维护；供多设备冲突判断';

-- -----------------------------------------------------------------------------
-- 2. 索引（唯一约束已覆盖 (user_id, data_type) 精确定位）
-- -----------------------------------------------------------------------------
-- RLS 策略每次按 user_id 过滤，显式单列索引保证策略判定走索引
create index if not exists idx_user_data_user_id on public.user_data (user_id);
-- 按同步时间倒序查最新记录
create index if not exists idx_user_data_updated_at on public.user_data (updated_at desc);

-- -----------------------------------------------------------------------------
-- 3. updated_at 自动维护
-- -----------------------------------------------------------------------------
create or replace function public.set_user_data_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_data_updated_at on public.user_data;
create trigger trg_user_data_updated_at
  before update on public.user_data
  for each row execute function public.set_user_data_updated_at();

-- -----------------------------------------------------------------------------
-- 4. 表级权限 + RLS（用户只能读写自己的数据）
-- -----------------------------------------------------------------------------
revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;

alter table public.user_data enable row level security;

-- select：只能看到自己的行
drop policy if exists "user_data_select_own" on public.user_data;
create policy "user_data_select_own" on public.user_data
  for select to authenticated
  using (auth.uid() = user_id);

-- insert：不能把数据挂到别人名下
drop policy if exists "user_data_insert_own" on public.user_data;
create policy "user_data_insert_own" on public.user_data
  for insert to authenticated
  with check (auth.uid() = user_id);

-- update：using 管「能改哪些行」，with check 管「改完仍必须属于自己」，
-- 两者都写才能防止把 user_id 改成别人后越权保存
drop policy if exists "user_data_update_own" on public.user_data;
create policy "user_data_update_own" on public.user_data
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- delete：只能删自己的行
drop policy if exists "user_data_delete_own" on public.user_data;
create policy "user_data_delete_own" on public.user_data
  for delete to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. 便捷 upsert RPC（可选）
--    前端调用：supabase.rpc('upsert_user_data', { p_data_type, p_json_data })
--    默认 SECURITY INVOKER，RLS 依然生效；user_id 一律取 auth.uid()，
--    不接受客户端传入，从根上杜绝伪造归属。
-- -----------------------------------------------------------------------------
create or replace function public.upsert_user_data(p_data_type text, p_json_data jsonb)
returns public.user_data
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_data;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.user_data (user_id, data_type, json_data)
  values (v_uid, p_data_type, coalesce(p_json_data, '{}'::jsonb))
  on conflict (user_id, data_type)
  do update set json_data = excluded.json_data, updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.upsert_user_data(text, jsonb) from public;
grant execute on function public.upsert_user_data(text, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. 三类核心数据 → data_type / json_data 形态（对照前端 src/types.ts）
--    lingua_profile      对象 Profile      nickname / xp / streak / dailyGoal / cefr / achievements[]
--    lingua_mistakes     数组 Mistake[]    id / original / corrected / type / mastered / createdAt
--    lingua_review_queue 数组 ReviewItem[] id / kind / content / dueAt / level / source
--    其余 28 个本地键（词场 / 成长 / 文学 / 文化 / CEFR / 语音偏好…）
--    可直接沿用各自键名作为 data_type，无需 DDL 变更。
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 7. 可选：验证 RLS 是否真的生效
--    SQL Editor 以 postgres 超级用户运行会绕过 RLS，必须切换角色模拟登录用户。
--    把 <your-user-uuid> 换成 Authentication 页面里的真实用户 UUID。
-- -----------------------------------------------------------------------------
-- begin;
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<your-user-uuid>","role":"authenticated"}';
-- select * from public.user_data;  -- 应只返回该用户的行
-- rollback;
