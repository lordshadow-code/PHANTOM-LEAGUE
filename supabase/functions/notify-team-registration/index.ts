const recipient = "juanojeda0219@gmail.com";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TeamSubmission = {
  name: string;
  members: string[];
  captain: string;
  logoData: string;
  discordName: string;
  playerName: string;
  trackerUrl: string;
  memberTrackers: Record<string, string>;
  rank: string;
};
type TeamRecord = {
  id: string;
  name: string;
  members: string[];
  captain: string;
  invite_token?: string;
  captain_user_id?: string | null;
  logo_data?: string | null;
  discord_name: string | null;
  player_name: string | null;
  tracker_url: string | null;
  member_trackers: Record<string, string>;
  rank: string | null;
};
type Team = TeamSubmission & {
  id: string;
  invite_token?: string;
  captain_user_id?: string;
};

function isLogoData(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 700000
    && /^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && value.length <= 500;
  } catch {
    return false;
  }
}

function isMemberTrackers(
  value: unknown,
  members?: string[],
  requireEveryMember = false
): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const trackers = value as Record<string, unknown>;
  const entries = Object.entries(trackers);
  return entries.every(([member, tracker]) =>
    typeof tracker === "string"
    && isHttpUrl(tracker.trim())
    && (!members || members.includes(member)))
    && (!requireEveryMember || !members || members.every((member) => typeof trackers[member] === "string"));
}

function isTeamSubmission(value: unknown): value is TeamSubmission {
  if (
    typeof value !== "object"
    || value === null
    || !("name" in value)
    || !("members" in value)
    || !("captain" in value)
    || typeof value.name !== "string"
    || value.name.trim().length === 0
    || value.name.trim().length > 60
    || !Array.isArray(value.members)
    || value.members.length === 0
    || value.members.length > 100
    || !value.members.every((member: unknown) => typeof member === "string" && member.trim().length > 0)
    || value.members.some((member: string) => member.trim().length > 60)
    || new Set(value.members.map((member: string) => member.trim().toLowerCase())).size !== value.members.length
    || typeof value.captain !== "string"
    || !isLogoData(value.logoData)
    || typeof value.discordName !== "string"
    || value.discordName.trim().length === 0
    || value.discordName.trim().length > 80
    || typeof value.playerName !== "string"
    || value.playerName.trim().length === 0
    || value.playerName.trim().length > 80
    || typeof value.trackerUrl !== "string"
    || !isHttpUrl(value.trackerUrl.trim())
    || !("memberTrackers" in value)
    || !isMemberTrackers(value.memberTrackers, value.members, true)
    || typeof value.rank !== "string"
    || value.rank.trim().length === 0
    || value.rank.trim().length > 60
  ) {
    return false;
  }

  return value.members.includes(value.captain)
    && value.memberTrackers[value.captain].trim() === value.trackerUrl.trim();
}

function response(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    }
  });
}

function isTeamRecord(value: unknown): value is TeamRecord {
  if (
    typeof value !== "object"
    || value === null
    || !("id" in value)
    || !("name" in value)
    || !("members" in value)
    || !("captain" in value)
    || typeof value.id !== "string"
    || ("invite_token" in value && typeof value.invite_token !== "string")
    || ("captain_user_id" in value && !(value.captain_user_id === null || typeof value.captain_user_id === "string"))
    || typeof value.name !== "string"
    || typeof value.captain !== "string"
    || !Array.isArray(value.members)
    || !value.members.every((member: unknown) => typeof member === "string")
    || ("logo_data" in value && !(value.logo_data === null || isLogoData(value.logo_data)))
    || !("discord_name" in value)
    || !(value.discord_name === null || typeof value.discord_name === "string")
    || !("player_name" in value)
    || !(value.player_name === null || typeof value.player_name === "string")
    || !("tracker_url" in value)
    || !(value.tracker_url === null || (typeof value.tracker_url === "string" && isHttpUrl(value.tracker_url)))
    || !("member_trackers" in value)
    || !isMemberTrackers(value.member_trackers, value.members)
    || !("rank" in value)
    || !(value.rank === null || typeof value.rank === "string")
  ) {
    return false;
  }

  return true;
}

function toClientTeam(
  record: TeamRecord,
  includeInviteCredentials: boolean,
  includeDiscordName = false
): Team {
  const team: Team = {
    id: record.id,
    name: record.name,
    members: record.members,
    captain: record.captain,
    logoData: record.logo_data || "",
    discordName: includeDiscordName ? record.discord_name || "" : "",
    playerName: record.player_name || "",
    trackerUrl: record.tracker_url || "",
    memberTrackers: record.member_trackers,
    rank: record.rank || ""
  };
  if (includeInviteCredentials && record.invite_token && record.captain_user_id) {
    team.invite_token = record.invite_token;
    team.captain_user_id = record.captain_user_id;
  }
  return team;
}

async function getDiscordIdentity(
  supabaseUrl: string,
  serviceRoleKey: string,
  accessToken: string
): Promise<{ userId: string; discordId: string } | { error: string; status: number }> {
  let authResponse: Response;
  try {
    authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${accessToken}`
      }
    });
  } catch (error) {
    console.error("Could not verify the Discord session:", error);
    return { error: "Could not verify the captain's Discord session.", status: 502 };
  }

  if (!authResponse.ok) {
    return { error: "A valid Discord sign-in is required to create a team.", status: 401 };
  }

  let user: unknown;
  try {
    user = await authResponse.json();
  } catch (error) {
    console.error("Supabase Auth returned invalid user data:", error);
    return { error: "Could not verify the captain's Discord session.", status: 502 };
  }
  if (
    typeof user !== "object"
    || user === null
    || !("id" in user)
    || typeof user.id !== "string"
    || !("app_metadata" in user)
    || typeof user.app_metadata !== "object"
    || user.app_metadata === null
  ) {
    console.error("Supabase Auth returned an invalid user.");
    return { error: "Could not verify the captain's Discord session.", status: 502 };
  }

  const metadata = user.app_metadata;
  const hasDiscordProvider = ("provider" in metadata && metadata.provider === "discord")
    || ("providers" in metadata && Array.isArray(metadata.providers) && metadata.providers.includes("discord"));
  if (!hasDiscordProvider) {
    return { error: "Sign in with Discord to create a team and manage its invitation.", status: 403 };
  }

  const identities = "identities" in user && Array.isArray(user.identities) ? user.identities : [];
  let discordId: string | undefined;
  for (const identity of identities) {
    if (
      typeof identity === "object"
      && identity !== null
      && "provider" in identity
      && identity.provider === "discord"
    ) {
      let providerId: unknown = "provider_id" in identity ? identity.provider_id : undefined;
      if (
        typeof providerId !== "string"
        && "identity_data" in identity
        && typeof identity.identity_data === "object"
        && identity.identity_data !== null
      ) {
        if ("sub" in identity.identity_data) {
          providerId = identity.identity_data.sub;
        }
        if (typeof providerId !== "string" && "id" in identity.identity_data) {
          providerId = identity.identity_data.id;
        }
      }
      if (typeof providerId === "string" && /^\d{17,20}$/.test(providerId)) {
        discordId = providerId;
        break;
      }
    }
  }
  if (!discordId) {
    return { error: "Could not verify the Discord account identity.", status: 403 };
  }

  return { userId: user.id, discordId };
}

Deno.serve(async (request) => {
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const origin = request.headers.get("origin");

  if (!allowedOrigin) {
    console.error("ALLOWED_ORIGIN is not configured.");
    return new Response("Team service is not configured.", { status: 503 });
  }
  if (origin !== allowedOrigin) {
    return new Response("Forbidden.", { status: 403 });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
      }
    });
  }
  if (request.method !== "POST") {
    return response({ error: "Method not allowed." }, 405, allowedOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
    return response({ error: "Team service is not configured." }, 503, allowedOrigin);
  }
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 750000) {
      return response({ error: "Request is too large." }, 413, allowedOrigin);
    }
    payload = JSON.parse(body);
  } catch (error) {
    console.error("Invalid team request:", error);
    return response({ error: "Invalid JSON request." }, 400, allowedOrigin);
  }

  if (typeof payload !== "object" || payload === null || !("action" in payload)) {
    return response({ error: "Invalid team request." }, 400, allowedOrigin);
  }

  let team: Team;
  let event: "created" | "joined" | "none";
  if (payload.action === "admin-list") {
    const adminDiscordId = Deno.env.get("PHANTOM_ADMIN_DISCORD_ID");
    if (!adminDiscordId || !/^\d{17,20}$/.test(adminDiscordId)) {
      console.error("PHANTOM_ADMIN_DISCORD_ID is not configured with a valid Discord ID.");
      return response({ error: "Admin access is not configured." }, 503, allowedOrigin);
    }
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {
      return response({ error: "Sign in with the authorized Discord account." }, 401, allowedOrigin);
    }
    const identity = await getDiscordIdentity(supabaseUrl, serviceRoleKey, accessToken);
    if ("error" in identity) {
      return response({ error: identity.error }, identity.status, allowedOrigin);
    }
    if (identity.discordId !== adminDiscordId) {
      return response({ error: "Admin access is restricted." }, 403, allowedOrigin);
    }

    const adminFields = [
      "id", "name", "members", "captain", "discord_name",
      "player_name", "tracker_url", "member_trackers", "rank"
    ].join(",");
    let databaseResponse: Response;
    try {
      databaseResponse = await fetch(
        `${supabaseUrl}/rest/v1/phantom_teams?select=${adminFields}&order=created_at.desc&limit=1000`,
        {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `******
          }
        }
      );
    } catch (error) {
      console.error("Could not reach Supabase to load admin team submissions:", error);
      return response({ error: "Could not load team submissions." }, 502, allowedOrigin);
    }
    if (!databaseResponse.ok) {
      console.error("Supabase rejected the admin team query:", databaseResponse.status, await databaseResponse.text());
      return response({ error: "Could not load team submissions." }, 502, allowedOrigin);
    }
    const records: unknown = await databaseResponse.json();
    if (!Array.isArray(records) || !records.every(isTeamRecord)) {
      console.error("Supabase returned invalid admin team data.");
      return response({ error: "Could not verify team submissions." }, 502, allowedOrigin);
    }
    return response({
      teams: records.map((record: TeamRecord) => toClientTeam(record, false, true))
    }, 200, allowedOrigin);
  }

  if (payload.action === "create" && "team" in payload && isTeamSubmission(payload.team)) {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {
      return response({ error: "Sign in with Discord to create a team." }, 401, allowedOrigin);
    }
    const captainIdentity = await getDiscordIdentity(supabaseUrl, serviceRoleKey, accessToken);
    if ("error" in captainIdentity) {
      return response({ error: captainIdentity.error }, captainIdentity.status, allowedOrigin);
    }

    let databaseResponse: Response;
    try {
      databaseResponse = await fetch(`${supabaseUrl}/rest/v1/phantom_teams?select=id,name,members,captain,invite_token,captain_user_id,logo_data,discord_name,player_name,tracker_url,member_trackers,rank`, {
        method: "POST",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          name: payload.team.name.trim(),
          members: payload.team.members.map((member) => member.trim()),
          captain: payload.team.captain.trim(),
          captain_user_id: captainIdentity.userId,
          logo_data: payload.team.logoData,
          discord_name: payload.team.discordName.trim(),
          player_name: payload.team.playerName.trim(),
          tracker_url: payload.team.trackerUrl.trim(),
          member_trackers: payload.team.memberTrackers,
          rank: payload.team.rank.trim()
        })
      });
    } catch (error) {
      console.error("Could not reach Supabase to create the team:", error);
      return response({ error: "Could not register the team." }, 502, allowedOrigin);
    }

    if (!databaseResponse.ok) {
      console.error("Supabase rejected team creation:", databaseResponse.status, await databaseResponse.text());
      return response({ error: "Could not register the team." }, 502, allowedOrigin);
    }

    const teams: unknown = await databaseResponse.json();
    if (!Array.isArray(teams) || !isTeamRecord(teams[0])) {
      console.error("Supabase returned an invalid team after creation.");
      return response({ error: "Could not confirm team registration." }, 502, allowedOrigin);
    }
    team = toClientTeam(teams[0], true);
    event = "created";
  } else if (
    payload.action === "join"
    && "inviteToken" in payload
    && typeof payload.inviteToken === "string"
    && uuidPattern.test(payload.inviteToken)
    && "member" in payload
    && typeof payload.member === "string"
    && payload.member.trim().length > 0
    && payload.member.trim().length <= 60
    && "trackerUrl" in payload
    && typeof payload.trackerUrl === "string"
    && isHttpUrl(payload.trackerUrl.trim())
  ) {
    let databaseResponse: Response;
    try {
      databaseResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/join_phantom_team`, {
        method: "POST",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_invite_token: payload.inviteToken,
          p_member: payload.member.trim(),
          p_tracker_url: payload.trackerUrl.trim()
        })
      });
    } catch (error) {
      console.error("Could not reach Supabase to join the team:", error);
      return response({ error: "Could not join the team." }, 502, allowedOrigin);
    }

    if (!databaseResponse.ok) {
      const details = await databaseResponse.text();
      console.error("Supabase rejected team join:", databaseResponse.status, details);
      return response({ error: "The invitation is invalid or the team cannot accept more members." }, 400, allowedOrigin);
    }

    const joinedTeams: unknown = await databaseResponse.json();
    if (!Array.isArray(joinedTeams) || !isTeamRecord(joinedTeams[0]) || !("added" in joinedTeams[0]) || typeof joinedTeams[0].added !== "boolean") {
      console.error("Supabase returned an invalid team after joining.");
      return response({ error: "Could not confirm team membership." }, 502, allowedOrigin);
    }
    const joinedTeam = { ...toClientTeam(joinedTeams[0], false), added: joinedTeams[0].added };
    team = joinedTeam;
    event = joinedTeam.added ? "joined" : "none";
  } else {
    return response({ error: "Invalid team action or data." }, 400, allowedOrigin);
  }

  let emailNotified = Boolean(resendApiKey && fromEmail);
  if (!emailNotified && event !== "none") {
    console.error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured; team data was saved without email notification.");
  }
  if (event !== "none") {
    if (resendApiKey && fromEmail) {
      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipient],
            subject: event === "joined"
              ? `Nuevo integrante en ${team.name}`
              : `Nuevo equipo registrado: ${team.name}`,
            text: [
              event === "joined"
                ? "Un integrante nuevo se unió a un equipo de PHANTOM."
                : "Se registró un equipo en PHANTOM.",
              "",
              `Equipo: ${team.name}`,
              `Integrantes: ${team.members.join(", ")}`,
              `Capitán: ${team.captain}`,
              `Nombre de juego: ${team.playerName}`,
              `Rango: ${team.rank}`,
              ...team.members.map((member) =>
                `Tracker de ${member}: ${team.memberTrackers[member] || (member === team.captain ? team.trackerUrl : "")}`)
            ].join("\n")
          })
        });

        if (!emailResponse.ok) {
          console.error("Resend rejected the notification:", emailResponse.status, await emailResponse.text());
          emailNotified = false;
        }
      } catch (error) {
        console.error("Could not reach Resend:", error);
        emailNotified = false;
      }
    }
  }

  const added = event === "joined";
  return response({ team, added, emailNotified }, 200, allowedOrigin);
});
