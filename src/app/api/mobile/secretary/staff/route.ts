// GET /api/mobile/secretary/staff — พนักงานของกิจการ + แถว "รอรับคำเชิญ" (S1.25 · `listStaffAccess(…, {includeInvites})`) · คีย์ `settings.staff.read` (ประตูเว็บเดียวกัน)
//   B27 ▸ chatOnly = STAFF ที่ไม่มีคีย์สิทธิ์ true (บทบาท "คุยอย่างเดียว" ของแชททีม) ◂
//   ไม่มีอีเมล/เบอร์เต็ม (คำเชิญมีแค่ `phoneMasked`) · ระดับต่อโมดูลจาก `staffViewOf` (แชทแยกช่อง `chat`)
import { listStaffAccess, listTenantUnits, STAFF_READ_ACTION } from "@/lib/staff/service";
import { staffViewOf } from "@/lib/staff/levels";
import { isChatOnly } from "@/lib/team-chat/service";
import { gate, ok, withErrors } from "../_shared";

async function GET_(req: Request) {
  const a = await gate(req, { module: "settings", action: STAFF_READ_ACTION });
  if (!a.ok) return a.res;
  const [rows, allUnits] = await Promise.all([listStaffAccess(a.c.tenantId, { includeInvites: true }), listTenantUnits(a.c.tenantId)]);
  // R-S1.14j: สาขาเป็นชื่อ ("*" = ทุกสาขา) — แอปไม่ต้องแปลงรหัสเอง
  const unitsOf = (ua: string[]) => (ua.includes("*") ? allUnits : allUnits.filter((u) => ua.includes(u.id))).map((u) => ({ id: u.id, name: u.name }));
  const items = rows.map((r) =>
    "pending" in r
      ? { pending: true as const, inviteId: r.inviteId, name: r.name, phoneMasked: r.phoneMasked, role: r.role, units: unitsOf(r.unitAccess), expiresAt: r.expiresAt, expired: r.expired }
      : { pending: false as const, membershipId: r.membershipId, userId: r.userId, name: r.name, active: r.active, joinedAt: r.joinedAt, me: r.userId === a.c.userId, ...staffViewOf(r), chatOnly: isChatOnly(r.role, r.permissions), units: unitsOf(r.unitAccess), allUnits: r.unitAccess.includes("*") || r.role === "OWNER" },
  );
  return ok({ items });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/staff GET", GET_);
