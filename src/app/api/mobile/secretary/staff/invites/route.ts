// GET /api/mobile/secretary/staff/invites — คำเชิญที่ยังไม่รับ (S1.25 `listInvites` · ผู้เชิญ OWNER/MANAGER · ไม่มี codeHash/เบอร์เต็ม)
import { listInvites } from "@/lib/staff/invite";
import { gate, ok } from "../../_shared";

export async function GET(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rows = await listInvites({ tenantId: a.c.tenantId, actorUserId: a.c.userId, membership: a.c.m });
  return ok({ items: rows.map((r) => ({ id: r.id, name: r.name, phoneMasked: r.phoneMasked, role: r.role, unitAccess: r.unitAccess, permissions: r.permissions, invitedById: r.invitedById, createdAt: r.createdAt, expiresAt: r.expiresAt, expired: r.expired })) });
}
