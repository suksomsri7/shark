// key-caps.ts — เพดานตัวเลข `crm._max*` ของผู้กระทำ (ใบ C3.8 · รีวิว S2 · มติผู้คุมงาน (ก))
//
// คนจริง: ค่าใน Membership.permissions ของเขา (OWNER = ไม่จำกัด · ไม่กรอก = ไม่จำกัด) — เหมือนเดิมทุกประการ
// คีย์ API: scope ของคีย์ไม่มีค่าตัวเลข (isApiScope ตัด `crm._*` ทิ้ง) ⇒ เดิมคีย์ "ไม่มีเพดาน" ทั้งที่หน้าจอบังคับเพดานของคนกด
//   ⇒ คีย์ใช้เพดาน **ปัจจุบัน** ของผู้สร้างคีย์ (อ่าน Membership ทุกครั้งที่เรียก — เจ้าของร้านลดเพดานมีผลคำขอถัดไป)
//   ผู้สร้างไม่มี/ออกจากร้าน/ยังไม่ตอบรับ ⇒ เพดาน 0 (ทุกยอดต้องผ่านทางอนุมัติ — ปิดไว้ก่อน)
// AUDIT-CLASS X1: อ่าน Membership ของร้านใน ctx เท่านั้น
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmParam, isApiActor } from "./access";

export async function crmCapFor(tenantId: string, actor: MemberActor, key: string): Promise<number | undefined> {
  if (!isApiActor(actor)) return actor.role === "OWNER" ? undefined : crmParam(actor, key);
  const uid = typeof actor.userId === "string" ? actor.userId : "";
  if (!uid) return 0;
  const m = await prisma.membership.findFirst({ where: { tenantId, userId: uid, acceptedAt: { not: null } }, select: { role: true, permissions: true } });
  if (!m) return 0;
  if (m.role === "OWNER") return undefined;
  const p = m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? (m.permissions as Record<string, unknown>) : {};
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
