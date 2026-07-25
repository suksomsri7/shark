// GET /api/auth/line/callback?code=&state= — แลก code → ตรวจ id_token (HS256 ด้วย channel secret) → login
// state "w:" = เว็บ → cookie session + /app · "m:" = แอป native → one-time code เด้งกลับ sharkai://auth
// ⚠️ email ต้องเปิด permission "OpenID Connect email" ใน LINE console — ไม่มี email = ปฏิเสธสุภาพ (บัญชีเราผูกด้วยอีเมล)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/core/db";
import { createSession } from "@/lib/core/session";
import { issueLoginCode } from "@/lib/mobile/auth";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const jar = await cookies();
  const saved = jar.get("line_oauth_state")?.value ?? "";
  jar.delete("line_oauth_state");
  const clientId = process.env.LINE_CHANNEL_ID;
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!code || !state || state !== saved || !clientId || !secret) redirect("/login?err=line");
  const mobile = state.startsWith("m:");

  let idToken = "";
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://shark.in.th/api/auth/line/callback",
        client_id: clientId,
        client_secret: secret,
      }),
    });
    const data = (await res.json()) as { id_token?: string };
    idToken = data.id_token ?? "";
  } catch {
    redirect("/login?err=line");
  }
  if (!idToken) redirect("/login?err=line");

  let email = "";
  let name: string | undefined;
  try {
    // LINE id_token เซ็นด้วย channel secret (HS256) · aud = channel id · iss access.line.me
    const { payload } = await jwtVerify(idToken, new TextEncoder().encode(secret), {
      issuer: "https://access.line.me",
      audience: clientId,
    });
    email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : undefined;
  } catch {
    redirect("/login?err=line");
  }
  // ไม่ได้ email (permission ยังไม่เปิด/ผู้ใช้ไม่ยินยอม) → บอกชัดที่หน้า login
  if (!email) redirect("/login?err=line_email");

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) user = await prisma.user.create({ data: { email, name } });

  if (mobile) {
    // แอป native: ห้ามออก cookie — ออก one-time code แล้วเด้งกลับแอป (แอปแลกเป็น Bearer เอง)
    const oneTime = await issueLoginCode(user.id);
    redirect(`sharkai://auth?code=${oneTime}`);
  }
  await createSession(user.id, { userAgent: req.headers.get("user-agent") ?? "line-web" });
  redirect("/app");
}
