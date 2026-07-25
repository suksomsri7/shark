// GET /api/auth/facebook/callback?code=&state= — แลก code → ดึง email จาก Graph API → login
// FB ไม่ใช้ id_token (JWT) → ต้อง exchange code เป็น access token แล้วเรียก /me · ยืนยัน token ด้วย appsecret_proof (กัน token ปลอม)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/core/db";
import { createSession } from "@/lib/core/session";
import { issueLoginCode } from "@/lib/mobile/auth";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const jar = await cookies();
  const saved = jar.get("fb_oauth_state")?.value ?? "";
  jar.delete("fb_oauth_state");
  const appId = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!code || !state || state !== saved || !appId || !secret) redirect("/login?err=facebook");
  const mobile = state.startsWith("m:");

  let accessToken = "";
  try {
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", secret);
    tokenUrl.searchParams.set("redirect_uri", "https://shark.in.th/api/auth/facebook/callback");
    tokenUrl.searchParams.set("code", code);
    const res = await fetch(tokenUrl.toString());
    accessToken = ((await res.json()) as { access_token?: string }).access_token ?? "";
  } catch {
    redirect("/login?err=facebook");
  }
  if (!accessToken) redirect("/login?err=facebook");

  // appsecret_proof = HMAC-SHA256(access_token, app_secret) — FB ตรวจว่า request มาจาก server เราจริง
  let email = "";
  let name: string | undefined;
  try {
    const proof = createHmac("sha256", secret).update(accessToken).digest("hex");
    const me = new URL("https://graph.facebook.com/v21.0/me");
    me.searchParams.set("fields", "id,name,email");
    me.searchParams.set("access_token", accessToken);
    me.searchParams.set("appsecret_proof", proof);
    const res = await fetch(me.toString());
    const data = (await res.json()) as { email?: string; name?: string };
    email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : undefined;
  } catch {
    redirect("/login?err=facebook");
  }
  // บาง FB account ไม่มี/ไม่แชร์อีเมล → บัญชีเราผูกด้วยอีเมล จึงปฏิเสธสุภาพ
  if (!email) redirect("/login?err=fb_email");

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) user = await prisma.user.create({ data: { email, name } });

  if (mobile) {
    const oneTime = await issueLoginCode(user.id);
    redirect(`sharkai://auth?code=${oneTime}`);
  }
  await createSession(user.id, { userAgent: req.headers.get("user-agent") ?? "facebook-web" });
  redirect("/app");
}
