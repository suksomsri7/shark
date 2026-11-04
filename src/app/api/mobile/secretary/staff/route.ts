// GET /api/mobile/secretary/staff — พนักงานของกิจการ + แถว "รอรับคำเชิญ" (S1.25 · `listStaffAccess(…, {includeInvites})`) · คีย์ `settings.staff.read` (ประตูเว็บเดียวกัน)
//   ไม่มีอีเมล/เบอร์เต็ม (คำเชิญมีแค่ `phoneMasked`) · ระดับต่อโมดูลจาก `staffViewOf` (แชทแยกช่อง `chat`)
import { listStaffAccess, STAFF_READ_ACTION } from "@/lib/staff/service";
import { staffViewOf } from "@/lib/staff/levels";
import { gate, ok } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req, { module: "settings", action: STAFF_READ_ACTION });
  if (!a.ok) return a.res;
  const rows = await listStaffAccess(a.c.tenantId, { includeInvites: true });
  const items = rows.map((r) =>
    "pending" in r
      ? { pending: true as const, inviteId: r.inviteId, name: r.name, phoneMasked: r.phoneMasked, role: r.role, expiresAt: r.expiresAt, expired: r.expired }
      : { pending: false as const, membershipId: r.membershipId, userId: r.userId, name: r.name, active: r.active, joinedAt: r.joinedAt, me: r.userId === a.c.userId, ...staffViewOf(r) },
  );
  return ok({ items });
}
