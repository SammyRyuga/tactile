create table tactile_private.review_quota_settings (
  singleton boolean primary key default true check (singleton),
  hourly_limit integer not null default 12 check (hourly_limit between 1 and 120)
);

alter table tactile_private.review_quota_settings enable row level security;
revoke all on tactile_private.review_quota_settings from public, anon, authenticated;
insert into tactile_private.review_quota_settings default values;

create or replace function public.reserve_tactile_review()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid := auth.uid();
  clock timestamptz;
  recent timestamptz[];
  max_attempts integer;
begin
  if account is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    return false;
  end if;

  select hourly_limit into strict max_attempts
  from tactile_private.review_quota_settings where singleton;

  insert into tactile_private.review_quota(account_id) values (account)
  on conflict do nothing;
  select q.attempts into strict recent
  from tactile_private.review_quota as q where q.account_id = account
  for update;

  clock := clock_timestamp();
  recent := array(select stamp from unnest(recent) as stamp
                  where stamp > clock - interval '1 hour');
  if cardinality(recent) >= max_attempts then
    return false;
  end if;

  update tactile_private.review_quota
  set attempts = array_append(recent, clock)
  where account_id = account;
  return true;
end;
$$;
