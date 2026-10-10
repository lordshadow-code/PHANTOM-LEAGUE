alter table public.phantom_teams
  add column if not exists captain_user_id uuid references auth.users(id) on delete set null;

create index if not exists phantom_teams_captain_user_id_idx
  on public.phantom_teams(captain_user_id)
  where captain_user_id is not null;

drop function if exists public.join_phantom_team(uuid, text);

create function public.join_phantom_team(p_invite_token uuid, p_member text)
returns table (
  id uuid,
  name text,
  members text[],
  captain text,
  invite_token uuid,
  added boolean,
  logo_data text,
  discord_name text,
  player_name text,
  tracker_url text,
  rank text,
  captain_user_id uuid
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
      current_team.captain, current_team.invite_token, false, current_team.logo_data,
      current_team.discord_name, current_team.player_name, current_team.tracker_url,
      current_team.rank, current_team.captain_user_id;
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
    current_team.captain, current_team.invite_token, true, current_team.logo_data,
    current_team.discord_name, current_team.player_name, current_team.tracker_url,
    current_team.rank, current_team.captain_user_id;
end;
$$;

revoke all on function public.join_phantom_team(uuid, text) from public, anon, authenticated;
grant execute on function public.join_phantom_team(uuid, text) to service_role;
