alter table public.phantom_teams
  add column if not exists logo_data text,
  add column if not exists discord_name text,
  add column if not exists player_name text,
  add column if not exists tracker_url text,
  add column if not exists rank text;

alter table public.phantom_teams
  drop constraint if exists phantom_teams_application_fields_check,
  add constraint phantom_teams_application_fields_check check (
    (
      logo_data is null
      and discord_name is null
      and player_name is null
      and tracker_url is null
      and rank is null
    )
    or
    (
      logo_data is not null
      and char_length(logo_data) <= 700000
      and logo_data ~ '^data:image/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$'
      and discord_name is not null
      and char_length(btrim(discord_name)) between 1 and 80
      and player_name is not null
      and char_length(btrim(player_name)) between 1 and 80
      and tracker_url is not null
      and char_length(tracker_url) <= 500
      and tracker_url ~ '^https?://[^[:space:]]+$'
      and rank is not null
      and char_length(btrim(rank)) between 1 and 60
    )
  );

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
  rank text
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
      current_team.rank;
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
    current_team.rank;
end;
$$;

revoke all on function public.join_phantom_team(uuid, text) from public, anon, authenticated;
grant execute on function public.join_phantom_team(uuid, text) to service_role;