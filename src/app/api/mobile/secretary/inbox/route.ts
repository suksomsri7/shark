// GET /api/mobile/secretary/inbox?tenantId&kind&take — กล่องรออนุมัติรวมทุกกิจการของผู้ใช้ (S1.11 · A6) · Bearer อย่างเดียว ไม่ต้องมี x-tenant-id
//   `tenantId` (query) = กรองร้านเดียว — lib ยึด Membership ที่รับแล้วของผู้ใช้เอง (ร้านที่ไม่ได้เป็นสมาชิก = [])
//   การอนุมัติจริงยิง approve พร้อม x-tenant-id ของร้านนั้น (ตรวจซ้ำทั้งหมด)
import { inboxForUser } from "@/lib/ai/secretary/inbox";
import { inboxItemDto } from "@/lib/ai/secretary/dto";
import { fail, ok, optId, takeOf, userGate, withRateLimit } from "../_shared";

export async function GET(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.userId, "inbox", 60); // GET หนัก (ทุกร้าน · R-S1.14b)
  if (rl) return rl;
  const q = new URL(req.url).searchParams;
  const tenantId = optId(q.get("tenantId"));
  const kind = q.get("kind");
  if (tenantId === null || (kind && kind !== "proposal" && kind !== "plan")) return fail(400, "invalid", "ตัวกรองไม่ถูกต้อง");
  const rows = await inboxForUser(a.userId, { ...(tenantId ? { tenantId } : {}), ...(kind ? { kind: kind as "proposal" | "plan" } : {}), take: takeOf(q.get("take"), 50, 100) });
  return ok({ items: rows.map(inboxItemDto) });
}
