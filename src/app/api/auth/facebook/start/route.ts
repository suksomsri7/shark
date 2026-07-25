// GET /api/auth/facebook/start[?mobile=1] — พาไป Facebook Login (web + mobile ผ่าน browser)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken } from "@/lib/core/hash";
import { secureCookies } from "@/lib/env";

export async function GET(req: Request): Promise<Response> {
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) redirect("/login?err=facebook");
  const mobile = new URL(req.url).searchParams.get("mobile") === "1";
  const state = (mobile ? "m:" : "w:") + randomToken();
  (await cookies()).set("fb_oauth_state", state, {
    httpOnly: true, secure: secureCookies, sameSite: "lax", path: "/", maxAge: 600,
  });
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", "https://shark.in.th/api/auth/facebook/callback");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "email,public_profile");
  redirect(url.toString());
}
