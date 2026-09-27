// erased.ts — ธง "ผู้ติดต่อถูกลบข้อมูลส่วนบุคคลตาม PDPA แล้ว" สำหรับตัวเขียนของ CRM (ใบ C3.9-fix · H7 — ล่าความปลอดภัย M2)
//
// ธงจริง = แถว AuditLog `crm.contact.erase` (มติผู้คุมงาน C3.9 S2 — ชื่อ "ลบตามคำขอ PDPA" เป็นแค่ป้าย) · ไฟล์นี้อ่านอย่างเดียว
// ผู้เรียก: กิจกรรม/โน้ต (`activities.ts#resolveTargets` ของ logActivity — ทุกชนิดรวมโน้ต) · ไฟล์แนบ (`files.ts#attachFile`)
//   ⇒ ไม่มีข้อมูลใหม่ไปงอกบนผู้ติดต่อที่ถูกลบ (ระบุผู้ติดต่อตรง = VALIDATION ภาษาไทย · มากับดีล = ไม่ผูกผู้ติดต่อ)
//   (เรคคอร์ดกำหนดเอง/ดีล ปฏิเสธอยู่แล้วเพราะผู้ติดต่อที่ถูกลบถูกเก็บถาวร · แก้ผู้ติดต่อ = ARCHIVED)
//   มติข้อ 4: ตัวเขียนของระบบ (`activities.ts` recordBusinessActivityOnce · createChatActivityOnce · createSequenceTaskOnce = ข้าม + WARN id ล้วน ·
//   touchContactsFromChat = ข้ามเงียบ · recordSystemActivityInTx = ไม่ผูกผู้ติดต่อ) · `contacts.ts#markCustomerFromBridge` ข้าม · กฎอัตโนมัติไม่เลือกเป็นเป้า
// แยกไฟล์จาก privacy.ts เพราะ privacy.ts import บริการผู้ติดต่อ/อีเมล/สาย ⇒ ถ้าตัวเขียนพวกนั้น import privacy.ts จะเป็นวง
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { CRM_ERASE_AUDIT_ACTION } from "./privacy-shared";

type Db = Pick<Prisma.TransactionClient, "auditLog">;

export const ERASED_CONTACT_WRITE_MSG =
  "ผู้ติดต่อนี้ถูกลบข้อมูลส่วนบุคคลตาม PDPA แล้ว จึงบันทึกข้อมูลใหม่ลงไปไม่ได้ — ถ้าลูกค้ากลับมาติดต่ออีกครั้ง ให้เพิ่มเป็นผู้ติดต่อใหม่";

/** ผู้ติดต่อในชุดนี้ที่ถูกลบตาม PDPA แล้ว (ขอบเขตร้าน) */
export async function erasedContactIds(tenantId: string, ids: readonly (string | null | undefined)[], db: Db = prisma): Promise<Set<string>> {
  const want = [...new Set(ids.filter((x): x is string => typeof x === "string" && !!x))];
  if (!tenantId || want.length === 0) return new Set();
  const rows = await db.auditLog.findMany({ where: { tenantId, action: CRM_ERASE_AUDIT_ACTION, targetId: { in: want } }, select: { targetId: true } });
  return new Set(rows.map((r) => r.targetId).filter((x): x is string => !!x));
}

export async function isErasedContact(tenantId: string, id: string | null | undefined, db: Db = prisma): Promise<boolean> {
  return !!id && (await erasedContactIds(tenantId, [id], db)).has(id);
}
