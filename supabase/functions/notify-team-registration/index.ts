const recipient = "juanojeda0219@gmail.com";
type TeamSubmission = { name: string; members: string[]; captain: string };

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
    || !value.members.every((member: unknown) => typeof member === "string" && member.trim().length > 0)
    || value.members.join(", ").length > 600
    || typeof value.captain !== "string"
  ) {
    return false;
  }

  return value.members.includes(value.captain);
}

function response(body: Record<string, string>, status: number, origin: string) {
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

Deno.serve(async (request) => {
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const origin = request.headers.get("origin");

  if (!allowedOrigin) {
    console.error("ALLOWED_ORIGIN is not configured.");
    return new Response("Notification service is not configured.", { status: 503 });
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

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!resendApiKey || !fromEmail) {
    console.error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.");
    return response({ error: "Notification service is not configured." }, 503, allowedOrigin);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 8192) {
      return response({ error: "Request is too large." }, 413, allowedOrigin);
    }
    payload = JSON.parse(body);
  } catch (error) {
    console.error("Invalid team registration request:", error);
    return response({ error: "Invalid JSON request." }, 400, allowedOrigin);
  }

  if (!isTeamSubmission(payload)) {
    return response({ error: "Invalid team registration." }, 400, allowedOrigin);
  }

  const team = payload;
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
        subject: `Nuevo equipo registrado: ${team.name.trim()}`,
        text: [
          "Se registró un equipo en PHANTOM.",
          "",
          `Equipo: ${team.name.trim()}`,
          `Integrantes: ${team.members.map((member) => member.trim()).join(", ")}`,
          `Capitán: ${team.captain.trim()}`
        ].join("\n")
      })
    });

    if (!emailResponse.ok) {
      console.error("Resend rejected the notification:", emailResponse.status, await emailResponse.text());
      return response({ error: "The notification could not be sent." }, 502, allowedOrigin);
    }
  } catch (error) {
    console.error("Could not reach Resend:", error);
    return response({ error: "The notification could not be sent." }, 502, allowedOrigin);
  }

  return response({ status: "sent" }, 200, allowedOrigin);
});
