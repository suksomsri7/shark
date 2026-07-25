// GET /api/auth/google/start — พาไปหน้า login ของ Google (web flow · GET navigation ตาม pattern ที่รอดใน WebView)
// state สุ่มเก็บ cookie httpOnly 10 นาที — กัน CSRF ตอน callback
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken } from "@/lib/core/hash";
import { secureCookies } from "@/lib/env";

export async function GET(): Promise<Response> {
  const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
  if (!clientId) redirect("/login?err=google");
  const state = randomToken();
  (await cookies()).set("google_oauth_state", state, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", "https://shark.in.th/api/auth/google/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  redirect(url.toString());
}
