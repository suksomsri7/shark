// email-flags.ts — ธง "ไม่ยืนยันผู้ส่ง" ของแถวกิจกรรม EMAIL ขาเข้า (CRM C5.5 ▸ fix3b · รีวิว R2b-3 / RV-1)
//
// ตัวช่วยใบไม้ (import แค่ ./db + ./emails-shared) ⇒ activities.ts · contacts.ts · companies.ts เรียกได้โดยไม่มีวงโหลด
//   (activities → companies อยู่แล้ว · companies → activities จะเป็นวง)
// กติกา: กิจกรรม EMAIL ขาเข้าที่ระบบเขียน (`source = EMAIL` · `direction = IN` · `sourceRef = CrmEmailMessage.id`) อ่านธงจาก `routing`
//   ของจดหมายฉบับนั้นผ่านตัวอ่านเดียว `emailRoutingUnverified` (fix2 เป็นผู้เขียน — ไม่มีคอลัมน์ใหม่) · คิวรีเดียวต่อหน้า (ไม่ N+1)
//   · จำกัดร้าน + ระบบ CRM เดียวกับผู้เรียก · คืนแค่ชุด sourceRef ที่ต้องขึ้นป้าย (ผู้เรียกใส่ธงให้แถวที่ผู้ดูเห็นอยู่แล้วเท่านั้น)

import { prisma } from "./db";
import { emailRoutingUnverified } from "./emails-shared";

type EmailActivityLike = { id: string; type: string; source: string; direction: string | null; sourceRef: string | null };

/** แถวนี้คือกิจกรรม EMAIL ขาเข้าที่ระบบเขียนจากจดหมาย (sourceRef = id ของ CrmEmailMessage) — แถวอื่นที่บังเอิญมี sourceRef เดียวกันไม่นับ */
export function isInboundEmailActivity(r: Omit<EmailActivityLike, "id">): boolean {
  return r.type === "EMAIL" && r.source === "EMAIL" && r.direction === "IN" && !!r.sourceRef;
}

/** id ของ **แถวกิจกรรม** ในชุดนี้ที่เป็น EMAIL ขาเข้าซึ่งระบบยืนยันผู้ส่งไม่ได้ (คิวรีเดียว · ร้าน+ระบบของผู้เรียก) */
export async function unverifiedEmailRefs(ctx: { tenantId: string; systemId: string }, rows: readonly EmailActivityLike[]): Promise<Set<string>> {
  const inbound = rows.filter(isInboundEmailActivity);
  const emailIds = [...new Set(inbound.map((r) => r.sourceRef!))];
  if (emailIds.length === 0) return new Set();
  const mails = await prisma.crmEmailMessage.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: emailIds } }, select: { id: true, routing: true } });
  const flagged = new Set(mails.filter((m) => emailRoutingUnverified(m.routing)).map((m) => m.id));
  return new Set(inbound.filter((r) => flagged.has(r.sourceRef!)).map((r) => r.id));
}
