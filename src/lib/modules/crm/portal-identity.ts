// portal-identity.ts — ตัวตัดสิทธิ์พอร์ทัลเมื่อ "ตัวตนที่ใช้เข้า" ของผู้ติดต่อเปลี่ยน (ใบ C3.5 · มติผู้คุมงาน S4) — ไฟล์เล็ก ไม่ import อะไรของ CRM
//
// ทำไม: session พอร์ทัล/OTP/LINE ตัดสินตัวตนจากช่องของผู้ติดต่อ (อีเมล · เบอร์ · lineUserId) และ `CrmPortalAccess` ไม่มีคอลัมน์เก็บ
//   "ตัวตน ณ ตอนเชิญ" (ใบนี้ไม่มี migration) ⇒ พนักงานแก้อีเมลของผู้ติดต่อ = คนที่ถืออีเมลใหม่ขอ OTP เข้าพอร์ทัลของบริษัทได้ทันที
//   ⇒ ทุกครั้งที่ช่องพวกนี้เปลี่ยน หรือผู้ติดต่อถูกรวม: เพิกถอน session ทุกใบของผู้ติดต่อ + ล้าง acceptedAt/คำเชิญ (ต้องเชิญใหม่)
// ผู้เรียก: `contacts.ts` (updateContactCore · mergeContacts) ใน tx ของการแก้ — ห้ามเรียกนอก tx
// AUDIT-CLASS X1: ขอบเขตร้าน (tenantId) ทุกคำสั่ง · AUDIT-CLASS X3: updateMany คำสั่งเดียวต่อตาราง (ซ้ำ = ไม่มีผลเพิ่ม)
import type { Prisma } from "@prisma/client";

export async function portalIdentityChangedInTx(tx: Prisma.TransactionClient, tenantId: string, contactIds: string[]): Promise<{ sessions: number; accesses: number }> {
  const ids = [...new Set(contactIds.filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return { sessions: 0, accesses: 0 };
  const now = new Date();
  const s = await tx.portalSession.updateMany({ where: { tenantId, crmContactId: { in: ids }, revokedAt: null }, data: { revokedAt: now } });
  const a = await tx.crmPortalAccess.updateMany({
    where: { tenantId, contactId: { in: ids }, OR: [{ acceptedAt: { not: null } }, { inviteTokenHash: { not: null } }, { inviteExpiresAt: { not: null } }] },
    data: { acceptedAt: null, inviteTokenHash: null, inviteExpiresAt: null },
  });
  if (s.count > 0 || a.count > 0) {
    await tx.auditLog.create({ data: { tenantId, actorType: "SYSTEM", actorId: null, action: "crm.portal.identity.reset", targetType: "CrmContact", targetId: ids[0]!, after: { contactIds: ids, sessionsRevoked: s.count, accessesReset: a.count } } });
  }
  return { sessions: s.count, accesses: a.count };
}
