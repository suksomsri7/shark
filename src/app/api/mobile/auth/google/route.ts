// POST /api/mobile/auth/google {idToken} → ตรวจกับ Google JWKS → ออก Bearer (แบบเดียวกับ apple)
// aud ต้องเป็น client ของเราเท่านั้น (web หรือ iOS client id) · iss accounts.google.com · email ต้อง verified
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/core/db";
import { issueMobileToken } from "@/lib/mobile/auth";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function allowedAudiences(): string[] {
  return [process.env.GOOGLE_WEB_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID].filter(
    (x): x is string => !!x,
  );
}

export async function POST(req: Request): Promise<Response> {
  let body: { idToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  if (!idToken) return Response.json({ error: "bad_request" }, { status: 400 });
  const auds = allowedAudiences();
  if (auds.length === 0) return Response.json({ error: "google_disabled" }, { status: 503 });

  let email = "";
  let name: string | undefined;
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: auds,
    });
    if (payload.email_verified !== true) return Response.json({ error: "email_not_verified" }, { status: 401 });
    email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : undefined;
  } catch {
    return Response.json({ error: "invalid_token" }, { status: 401 });
  }
  if (!email) return Response.json({ error: "no_email" }, { status: 401 });

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) user = await prisma.user.create({ data: { email, name } });
  const { token, expiresAt } = await issueMobileToken(user.id, {
    userAgent: req.headers.get("user-agent") ?? "mobile-google",
  });
  return Response.json({ token, expiresAt, user: { id: user.id, email: user.email, name: user.name } });
}
