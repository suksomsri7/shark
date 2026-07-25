// POST /api/mobile/auth/exchange {code} — แลก one-time login code (จาก social callback ฝั่งเว็บ) เป็น Bearer
import { consumeLoginCode, issueMobileToken } from "@/lib/mobile/auth";
import { prisma } from "@/lib/core/db";

export async function POST(req: Request): Promise<Response> {
  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  if (!code) return Response.json({ error: "bad_request" }, { status: 400 });
  const userId = await consumeLoginCode(code);
  if (!userId) return Response.json({ error: "invalid_code" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: "invalid_code" }, { status: 401 });
  const { token, expiresAt } = await issueMobileToken(user.id, {
    userAgent: req.headers.get("user-agent") ?? "mobile-social",
  });
  return Response.json({ token, expiresAt, user: { id: user.id, email: user.email, name: user.name } });
}
