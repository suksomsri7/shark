// GET /api/auth/line/start[?mobile=1] — พาไป LINE Login (web flow · GET ตาม pattern)
// mobile=1 = มาจากแอป native (เปิดผ่าน browser) → callback จะเด้งกลับแอปด้วย one-time code
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken } from "@/lib/core/hash";
import { secureCookies } from "@/lib/env";

export async function GET(req: Request): Promise<Response> {
  const clientId = process.env.LINE_CHANNEL_ID;
  if (!clientId) redirect("/login?err=line");
  const mobile = new URL(req.url).searchParams.get("mobile") === "1";
  const state = (mobile ? "m:" : "w:") + randomToken();
  (await cookies()).set("line_oauth_state", state, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", "https://shark.in.th/api/auth/line/callback");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid email");
  redirect(url.toString());
}
