// POST /api/mobile/auth/apple {identityToken, name?} → ตรวจ token กับ Apple JWKS → ออก Bearer
// Sign in with Apple: แอปได้ identityToken (JWT RS256) จากเครื่อง → server ต้อง verify กับกุญแจ Apple เสมอ
// (aud = bundle th.in.shark.ai · iss = appleid.apple.com) — ห้ามเชื่อ payload โดยไม่ verify เด็ดขาด
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/core/db";
import { issueMobileToken } from "@/lib/mobile/auth";

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const BUNDLE_ID = "th.in.shark.ai";

export async function POST(req: Request): Promise<Response> {
  let body: { identityToken?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const idToken = typeof body.identityToken === "string" ? body.identityToken : "";
  if (!idToken) return Response.json({ error: "bad_request" }, { status: 400 });

  let email = "";
  try {
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: BUNDLE_ID,
    });
    email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  } catch {
    return Response.json({ error: "invalid_token" }, { status: 401 });
  }
  // Apple ให้ email ใน token เสมอเมื่อขอ scope email (รวม private relay) — ไม่มี = ปฏิเสธ
  if (!email) return Response.json({ error: "no_email" }, { status: 401 });

  // find-or-create แบบเดียวกับ OTP flow (บัญชีผูกด้วยอีเมล — Apple relay ก็เป็นอีเมลจริงที่ forward ได้)
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) user = await prisma.user.create({ data: { email, name } });
  const { token, expiresAt } = await issueMobileToken(user.id, {
    userAgent: req.headers.get("user-agent") ?? "mobile-apple",
  });
  return Response.json({ token, expiresAt, user: { id: user.id, email: user.email, name: user.name } });
}
