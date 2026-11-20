create schema if not exists tactile_private;

create table tactile_private.review_quota (
  account_id uuid primary key references auth.users(id) on delete cascade,
  attempts timestamptz[] not null default '{}'
);
alter table tactile_private.review_quota enable row level security;
revoke all on schema tactile_private from public, anon, authenticated;
revoke all on tactile_private.review_quota from public, anon, authenticated;

create function public.reserve_tactile_review()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid := auth.uid();
  clock timestamptz := now();
  recent timestamptz[];
begin
  if account is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    return false;
  end if;

  insert into tactile_private.review_quota(account_id) values (account)
  on conflict do nothing;

  select coalesce(array(
    select stamp from unnest(q.attempts) as stamp
    where stamp > clock - interval '1 hour'
  ), '{}') into recent
  from tactile_private.review_quota as q where q.account_id = account
  for update;

  if cardinality(recent) >= 12 then
    return false;
  end if;

  update tactile_private.review_quota
  set attempts = array_append(recent, clock)
  where account_id = account;
  return true;
end;
$$;
revoke all on function public.reserve_tactile_review() from public, anon;
grant execute on function public.reserve_tactile_review() to authenticated;
