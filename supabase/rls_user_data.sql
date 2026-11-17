-- =============================================================================
-- LinguaBuddy · user_data 表 RLS 加固（复查版 · 可直接粘贴到 Supabase SQL Editor）
-- =============================================================================
-- 用法：整段粘贴 → Run。脚本**幂等**，可重复执行，不删数据、不改表结构。
-- 目标：每个登录用户只能 SELECT / INSERT / UPDATE **自己**的行；
--       任何人（包括只拿到 anon key 的第三方）都无法读取或修改他人数据。
--
-- ⚠️ 三条必须先知道的事实：
--   1. SQL Editor 以 postgres 角色运行，而 postgres 默认带 BYPASSRLS 属性，
--      **在这里执行看不到 RLS 的效果**——这不是脚本没生效，是执行者身份的问题。
--   2. 真正的验证方式见第 5 节：切换 role 模拟登录用户，或直接看策略查询结果。
--   3. RLS 只对「用 anon / authenticated 角色发起」的请求生效；
--      service_role 带 BYPASSRLS，**绝不能把 service_role key 放进前端**。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 前置检查：表必须存在
--    不存在时给出明确指引，而不是抛一堆看不懂的语法错误
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.user_data') is null then
    raise exception 'public.user_data 不存在：请先执行建表脚本 supabase/migrations/20261114190000_create_user_data.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. 开启 RLS + 收紧表级授权
--    · revoke from public：PostgreSQL 的 PUBLIC 是伪角色，代表「所有人」。
--      不显式收回，就等于给表留了一道谁都能走的后门。
--    · revoke from anon：未登录访客一律无权访问（哪怕拿到了 anon key）。
--    · grant to authenticated：只给登录用户，且只给 select / insert / update 三项。
--      应用从不需要删行，所以**不授予 delete**——少一个口子少一分风险。
-- -----------------------------------------------------------------------------
alter table public.user_data enable row level security;

revoke all on table public.user_data from public;
revoke all on table public.user_data from anon;
grant select, insert, update on table public.user_data to authenticated;

-- -----------------------------------------------------------------------------
-- 3. 三条策略：全部以 auth.uid() = user_id 限定「只能动自己的行」
--    先 drop 再 create：脚本可重复执行，且策略定义始终唯一、不会叠加
-- -----------------------------------------------------------------------------

-- 3.1 SELECT：读不到别人的行
--     auth.uid() 取自当前请求的 JWT；未登录时为 NULL，
--     NULL = user_id 结果为 NULL（非真），因此匿名请求一行都拿不到。
drop policy if exists "user_data_select_own" on public.user_data;
create policy "user_data_select_own" on public.user_data
  for select to authenticated
  using (auth.uid() = user_id);

-- 3.2 INSERT：不能把数据挂到别人名下
--     with check 管的是「写进去的这一行」必须满足什么条件。
drop policy if exists "user_data_insert_own" on public.user_data;
create policy "user_data_insert_own" on public.user_data
  for insert to authenticated
  with check (auth.uid() = user_id);

-- 3.3 UPDATE：using 管「能改哪些行」，with check 管「改完仍必须属于自己」
--     两者都写，才能堵住「把 user_id 改成别人后越权保存」这个经典漏洞。
--     少写 with check 的话，用户就能把自家行的 user_id 改成别人的 UID 并保存成功。
drop policy if exists "user_data_update_own" on public.user_data;
create policy "user_data_update_own" on public.user_data
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3.4 移除历史遗留的 delete 策略：需求只允许 select / insert / update
--     （若将来要加「清空我的云端数据」功能，把下面两行加回来即可：
--       grant delete on public.user_data to authenticated;
--       create policy "user_data_delete_own" on public.user_data
--         for delete to authenticated using (auth.uid() = user_id); ）
drop policy if exists "user_data_delete_own" on public.user_data;

-- -----------------------------------------------------------------------------
-- 4. 顺带收紧函数权限
--    · upsert_user_data 保持 SECURITY INVOKER（RLS 依然生效），
--      并显式声明一次：将来若有人改成 SECURITY DEFINER，RLS 会被绕过。
--    · 触发器函数的 EXECUTE 默认被 PostgreSQL 授予 PUBLIC，这里收回。
--    · 用 to_regprocedure 判存在，函数不存在时跳过，避免第一次执行就报错中断。
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.upsert_user_data(text,jsonb)') is not null then
    execute 'revoke all on function public.upsert_user_data(text, jsonb) from public';
    execute 'grant execute on function public.upsert_user_data(text, jsonb) to authenticated';
  end if;
  if to_regprocedure('public.set_user_data_updated_at()') is not null then
    execute 'revoke all on function public.set_user_data_updated_at() from public';
  end if;
end $$;

-- =============================================================================
-- 5. 只读验证：执行完跑这三条，把结果对一遍
-- =============================================================================

-- 5.1 RLS 开关（rls_enabled 必须为 t）
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'user_data';

-- 5.2 策略清单（应恰好 3 条：insert / select / update，全部 to authenticated，
--     qual / with_check 里都出现 auth.uid() = user_id）
select policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'user_data'
order by policyname;

-- 5.3 表级授权（anon 应查无此项；authenticated 应只有 insert / select / update）
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'user_data'
order by grantee, privilege_type;

-- =============================================================================
-- 6. 越权模拟测试（可选，手动整段执行）
--    把 <user-a-uuid> / <user-b-uuid> 换成 Authentication 页面里的真实 UUID；
--    执行后 rollback，不留任何痕迹。
--    期望：user-a 只能看见自己的行；改 user-b 的行影响 0 行。
-- =============================================================================
-- begin;
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<user-a-uuid>","role":"authenticated"}';
--
-- -- 期望：只返回 user-a 自己的行（若表里只有 user-b 的数据，这里应是 0）
-- select count(*) as visible_rows from public.user_data;
--
-- -- 期望：UPDATE 0（改不到别人的行）
-- update public.user_data set json_data = '{}'::jsonb where user_id = '<user-b-uuid>';
--
-- -- 期望：INSERT 0 0（挂不到别人名下）
-- insert into public.user_data (user_id, data_type, json_data)
-- values ('<user-b-uuid>', 'lingua_profile', '{}'::jsonb);
--
-- rollback;
