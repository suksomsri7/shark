// Mobile auth core (ledger/MOBILE_PLAN.md M-02) — Fable เขียนเอง (security-critical)
// หลัก: reuse ตาราง Session เดิม (hash token + TTL เดียวกับเว็บ) แต่ส่งเป็น Bearer แทน cookie
// ทุก request ฝั่งแอปเป็น stateless: Authorization: Bearer <token> + X-Tenant-Id → ตรวจ membership สดทุกครั้ง
import type { Membership, Tenant, User } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { sha256, randomToken } from "@/lib/core/hash";

// TTL ต้องตรงกับ src/lib/core/session.ts (จำ login แบบแอปมือถือ — คำสั่งเจ้าของ 2026-07-17)
const IDLE_MS = 1000 * 60 * 60 * 24 * 30; // 30 วัน sliding
const ABS_MS = 1000 * 60 * 60 * 24 * 90; // 90 วัน absolute
const WEBVIEW_CODE_MS = 1000 * 60; // one-time code 60 วิ

export type MobileAuth = {
  user: User;
  membership: Membership & { tenant: Tenant };
  ctx: { tenantId: string };
};
export type MobileGate =
  | ({ ok: true } & MobileAuth)
  | { ok: false; status: 401 | 403; error: string };

// ออก Bearer token หลัง verify OTP/social สำเร็จ — คืน raw token ครั้งเดียว (DB เก็บ hash)
export async function issueMobileToken(
  userId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const now = Date.now();
  const expiresAt = new Date(now + ABS_MS);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      idleExpiresAt: new Date(now + IDLE_MS),
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent ?? "mobile",
    },
  });
  return { token, expiresAt };
}

// logout: revoke session + ลบ push device ของเครื่องนี้ (ถ้าส่ง expoToken มา)
export async function revokeMobileToken(rawToken: string, expoToken?: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: sha256(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (expoToken) await prisma.pushDevice.deleteMany({ where: { expoToken } });
}

// อ่าน user จาก Bearer (กติกาเดียวกับ getSessionUser: revoked/absolute/idle + ต่อ idle เมื่อเหลือ < ครึ่ง)
export async function mobileUser(req: Request): Promise<User | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  const now = new Date();
  if (!s || s.revokedAt || s.expiresAt < now || s.idleExpiresAt < now) return null;
  if (s.idleExpiresAt.getTime() - now.getTime() < IDLE_MS / 2) {
    await prisma.session.update({
      where: { id: s.id },
      data: { idleExpiresAt: new Date(now.getTime() + IDLE_MS) },
    });
  }
  return s.user;
}

// ยามหน้าประตูทุก endpoint หลัง login: Bearer + X-Tenant-Id → membership (acceptedAt แล้ว) + ร้านไม่ถูกระงับ
// route ใช้: const g = await requireMobile(req); if (!g.ok) return mobileError(g);
export async function requireMobile(req: Request): Promise<MobileGate> {
  const user = await mobileUser(req);
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return { ok: false, status: 403, error: "missing_tenant" };
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, tenantId, acceptedAt: { not: null } },
    include: { tenant: true },
  });
  if (!membership) return { ok: false, status: 403, error: "forbidden" };
  if (membership.tenant.status === "SUSPENDED" || membership.tenant.status === "CLOSED")
    return { ok: false, status: 403, error: "suspended" };
  return { ok: true, user, membership, ctx: { tenantId } };
}

export function mobileError(g: Extract<MobileGate, { ok: false }>): Response {
  return Response.json({ error: g.error }, { status: g.status });
}

// ── WebView handshake: code ใช้ครั้งเดียว อายุ 60 วิ (ห้ามส่ง Bearer token ใน URL เด็ดขาด) ──
// เก็บใน AuthToken purpose=WEBVIEW · ช่อง email เก็บ "userId|tenantId" (ดู comment ใน core.prisma)
export async function issueWebviewCode(userId: string, tenantId: string): Promise<string> {
  const code = randomToken();
  await prisma.authToken.create({
    data: {
      email: `${userId}|${tenantId}`,
      purpose: "WEBVIEW",
      tokenHash: sha256(code),
      expiresAt: new Date(Date.now() + WEBVIEW_CODE_MS),
    },
  });
  return code;
}

// แลก code → { userId, tenantId } (atomic: updateMany consumedAt กัน replay — ใช้ซ้ำ/หมดอายุ = null)
export async function consumeWebviewCode(
  code: string,
): Promise<{ userId: string; tenantId: string } | null> {
  const consumed = await prisma.authToken.updateMany({
    where: {
      tokenHash: sha256(code),
      purpose: "WEBVIEW",
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return null;
  const row = await prisma.authToken.findFirst({
    where: { tokenHash: sha256(code), purpose: "WEBVIEW" },
  });
  const [userId, tenantId] = (row?.email ?? "").split("|");
  if (!userId || !tenantId) return null;
  return { userId, tenantId };
}
