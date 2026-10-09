create table if not exists public.phantom_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  members text[] not null check (cardinality(members) between 1 and 100),
  captain text not null,
  invite_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint phantom_teams_captain_is_member check (captain = any(members))
);

alter table public.phantom_teams enable row level security;

create or replace function public.join_phantom_team(p_invite_token uuid, p_member text)
returns table (
  id uuid,
  name text,
  members text[],
  captain text,
  invite_token uuid,
  added boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_team public.phantom_teams%rowtype;
begin
  if char_length(btrim(p_member)) not between 1 and 60 then
    raise exception 'Invalid member name';
  end if;

  select t.* into current_team
  from public.phantom_teams as t
  where t.invite_token = p_invite_token
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if exists (
    select 1 from unnest(current_team.members) as existing_members(member_name)
    where lower(btrim(member_name)) = lower(btrim(p_member))
  ) then
    return query select current_team.id, current_team.name, current_team.members,
      current_team.captain, current_team.invite_token, false;
    return;
  end if;

  if cardinality(current_team.members) >= 100 then
    raise exception 'Team is full';
  end if;

  update public.phantom_teams as t
  set members = array_append(t.members, btrim(p_member))
  where t.id = current_team.id
  returning t.* into current_team;

  return query select current_team.id, current_team.name, current_team.members,
    current_team.captain, current_team.invite_token, true;
end;
$$;

revoke all on function public.join_phantom_team(uuid, text) from public, anon, authenticated;
grant execute on function public.join_phantom_team(uuid, text) to service_role;
