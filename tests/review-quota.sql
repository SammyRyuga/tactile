-- Run with psql from a disposable local PostgreSQL database.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('test.account_id', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable
  as $$ select jsonb_build_object('is_anonymous', current_setting('test.anonymous', true) = 'true') $$;
\ir ../supabase/migrations/20261121000000_review_quota.sql
\ir ../supabase/migrations/20261122000000_configure_review_quota.sql

insert into auth.users values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');

do $$
begin
  if has_function_privilege('anon', 'public.reserve_tactile_review()', 'execute')
    or has_schema_privilege('authenticated', 'tactile_private', 'usage')
    or has_table_privilege('authenticated', 'tactile_private.review_quota_settings', 'update')
    or has_table_privilege('authenticated', 'tactile_private.review_quota', 'update') then
    raise exception 'Unexpected client privilege on quota enforcement';
  end if;
end;
$$;

set local role authenticated;
set local test.account_id = '00000000-0000-4000-8000-000000000001';
set local test.anonymous = 'true';
do $$ begin
  if public.reserve_tactile_review() then raise exception 'Anonymous session reserved quota'; end if;
end $$;
set local test.anonymous = 'false';
do $$
begin
  for attempt in 1..12 loop
    if not public.reserve_tactile_review() then raise exception 'Default denied attempt %', attempt; end if;
  end loop;
  if public.reserve_tactile_review() then raise exception 'Default allowed a thirteenth attempt'; end if;
end;
$$;

reset role;
update tactile_private.review_quota_settings set hourly_limit = 15 where singleton;
set local role authenticated;
do $$
begin
  for attempt in 13..15 loop
    if not public.reserve_tactile_review() then raise exception 'Updated quota denied attempt %', attempt; end if;
  end loop;
  if public.reserve_tactile_review() then raise exception 'Updated quota allowed a sixteenth attempt'; end if;
end;
$$;
set local test.account_id = '00000000-0000-4000-8000-000000000002';
do $$ begin
  if not public.reserve_tactile_review() then raise exception 'Quota leaked across accounts'; end if;
end $$;
reset role;
update tactile_private.review_quota
set attempts = array[clock_timestamp() - interval '61 minutes']
where account_id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
set local test.account_id = '00000000-0000-4000-8000-000000000001';
do $$ begin
  if not public.reserve_tactile_review() then raise exception 'Expired usage did not reset'; end if;
end $$;

reset role;
rollback;
select 'review-quota assertions passed' as result;
