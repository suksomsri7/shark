// GET /api/auth/google/callback?code=&state= — แลก code → ตรวจ id_token → login (cookie session เดิม)
// ตรวจ state กับ cookie (CSRF) · id_token ตรวจกับ Google JWKS เสมอ ห้ามเชื่อ payload เปล่า
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/core/db";
import { createSession } from "@/lib/core/session";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const jar = await cookies();
  const saved = jar.get("google_oauth_state")?.value ?? "";
  jar.delete("google_oauth_state");
  const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WEB_CLIENT_SECRET;
  if (!code || !state || !saved || state !== saved || !clientId || !clientSecret) redirect("/login?err=google");

  // แลก code เป็น token (server-to-server — ใช้ secret ฝั่งเราเท่านั้น)
  let idToken = "";
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "https://shark.in.th/api/auth/google/callback",
        grant_type: "authorization_code",
      }),
    });
    const data = (await res.json()) as { id_token?: string };
    idToken = data.id_token ?? "";
  } catch {
    redirect("/login?err=google");
  }
  if (!idToken) redirect("/login?err=google");

  let email = "";
  let name: string | undefined;
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    if (payload.email_verified !== true) redirect("/login?err=google");
    email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : undefined;
  } catch {
    redirect("/login?err=google");
  }
  if (!email) redirect("/login?err=google");

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) user = await prisma.user.create({ data: { email, name } });
  await createSession(user.id, { userAgent: req.headers.get("user-agent") ?? "google-web" });
  redirect("/app"); // ไม่มีกิจการ → requireTenant พาไป /onboarding เอง
}
