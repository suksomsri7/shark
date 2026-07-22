// POST /api/mobile/auth/verify {email,code} → 200 {token,expiresAt,user} | 401 {error}
// verify ผ่าน logic เดิม แล้วออก Bearer (reuse ตาราง Session) ผ่าน issueMobileToken ของ Fable
import { verifyOtp } from "@/lib/core/auth";
import { issueMobileToken } from "@/lib/mobile/auth";

export async function POST(req: Request): Promise<Response> {
  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!email || !code) return Response.json({ error: "bad_request" }, { status: 400 });

  const result = await verifyOtp(email, code);
  if (!result.ok) return Response.json({ error: result.reason }, { status: 401 });

  const { token, expiresAt } = await issueMobileToken(result.user.id, {
    userAgent: req.headers.get("user-agent") ?? "mobile",
  });
  return Response.json(
    { token, expiresAt, user: { id: result.user.id, email: result.user.email, name: result.user.name } },
    { status: 200 },
  );
}
