// GET /api/mobile/secretary/invites/pending — คำเชิญที่รอผู้ใช้คนนี้กดรับ (S1.14b · `pendingInvitesForUser` · R-S1.25b · การ์ด S2.12)
//   Bearer อย่างเดียว (ยังไม่เป็นสมาชิกร้านนั้น · ไม่ต้องมี x-tenant-id) · เฉพาะเบอร์ที่ยืนยันแล้วของผู้ใช้ (ไม่ verified ⇒ []) · 30/นาที
//   ไม่มีรหัสเชิญ/codeHash/เบอร์ในผล — รับด้วย `POST invites/accept { inviteId }`
import { pendingInvitesForUser } from "@/lib/staff/invite";
import { ok, thrown, userGate, withRateLimit } from "../../_shared";

export async function GET(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.userId, "invites-pending", 30);
  if (rl) return rl;
  try {
    const rows = await pendingInvitesForUser(a.userId);
    return ok({ items: rows.map((r) => ({ inviteId: r.inviteId, tenantName: r.tenantName, role: r.role, expiresAt: r.expiresAt.toISOString() })) });
  } catch (e) {
    return thrown(e, "invites.pending");
  }
}
