const recipient = "juanojeda0219@gmail.com";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TeamSubmission = { name: string; members: string[]; captain: string };
type Team = TeamSubmission & { id: string; invite_token: string };
type JoinedTeam = Team & { added: boolean };

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
  ) {
    return false;
  }

  return value.members.includes(value.captain);
}

function response(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    }
  });
}

function isTeam(value: unknown): value is Team {
  if (
    typeof value !== "object"
    || value === null
    || !("id" in value)
    || !("name" in value)
    || !("members" in value)
    || !("captain" in value)
    || !("invite_token" in value)
    || typeof value.id !== "string"
    || typeof value.invite_token !== "string"
    || typeof value.name !== "string"
    || typeof value.captain !== "string"
    || !Array.isArray(value.members)
    || !value.members.every((member: unknown) => typeof member === "string")
  ) {
    return false;
  }

  return true;
}

function isJoinedTeam(value: unknown): value is JoinedTeam {
  return isTeam(value) && "added" in value && typeof value.added === "boolean";
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
        "Access-Control-Allow-Headers": "content-type",
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
    if (body.length > 8192) {
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

  if (payload.action === "create" && "team" in payload && isTeamSubmission(payload.team)) {
    let databaseResponse: Response;
    try {
      databaseResponse = await fetch(`${supabaseUrl}/rest/v1/phantom_teams?select=id,name,members,captain,invite_token`, {
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
          captain: payload.team.captain.trim()
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
    if (!Array.isArray(teams) || !isTeam(teams[0])) {
      console.error("Supabase returned an invalid team after creation.");
      return response({ error: "Could not confirm team registration." }, 502, allowedOrigin);
    }
    team = teams[0];
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
          p_member: payload.member.trim()
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
    if (!Array.isArray(joinedTeams) || !isJoinedTeam(joinedTeams[0])) {
      console.error("Supabase returned an invalid team after joining.");
      return response({ error: "Could not confirm team membership." }, 502, allowedOrigin);
    }
    const joinedTeam = joinedTeams[0];
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
              `Capitán: ${team.captain}`
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
