// GET /api/mobile/inbox/staff?systemId&unitId — คนที่ตอบลูกค้าได้ในหน่วยนั้น (มอบหมาย/เรียกช่วย/ส่งต่อ · `eligibleResponders` · S1.24)
import { canAccessConvUnit } from "@/lib/modules/chat/service";
import { eligibleResponders } from "@/lib/modules/chat/routing";
import { gate, notFound, READ, systemOf, withErrors } from "../_shared";

async function GET_(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const q = new URL(req.url).searchParams;
  const sid = await systemOf(a.c.tenantId, q.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  const unitId = q.get("unitId") || null;
  if (!canAccessConvUnit(a.c.ua, unitId)) return notFound("ไม่พบหน่วยนี้");
  const staff = await eligibleResponders(a.c.tenantId, sid, unitId);
  const items = staff.map((s) => ({ userId: s.userId, name: s.name, role: s.role, onDuty: s.onDuty }));
  return Response.json({ items }); // R-S1.21i
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("inbox/staff GET", GET_);
