// crm-outbound.ts — CRM → คนในร้าน (แจ้งเตือนพนักงาน · ใบ C1.8 = ตัวยึดที่ "ในแอปเท่านั้น")
//
// 🔴 ใบนี้ไม่มีช่องทางส่งออกจริง (อีเมล/LINE/push) — แม่แบบ 10 ตัว × ช่องทาง + quiet hours เป็นของใบ C2.10 (พิมพ์เขียว §7.4 · R-E.12)
//    ที่นี่เขียน `AppNotification` แถวเดียวต่อเรื่อง และ **ห้าม import ตัวส่งอีเมล/แชท/push** (ข้อสอบ C1.8-S0.4)
// AUDIT-CLASS X8: หัวเรื่อง/เนื้อความไม่มีชื่อ เบอร์ อีเมล หรือข้อความของลูกค้า — มีแต่ลิงก์ไปหน้าที่ตรวจสิทธิ์เอง
// AUDIT-CLASS X4: คิวส่งซ้ำได้ ⇒ ผูกรหัสอ้างอิงไว้ในเนื้อความแล้วตรวจก่อนสร้าง (แบบเดียวกับ approvalNotify — ตารางไม่มีคอลัมน์คีย์)

import { prisma } from "@/lib/core/db";

const VIA_TH: Record<"CHAT" | "FORM", string> = { CHAT: "แชท", FORM: "ฟอร์มเว็บ" };

/** แจ้งทั้งร้าน (ในแอป) ว่ามี lead ใหม่เข้า CRM จากสะพาน — ครั้งเดียวต่อผู้ติดต่อ */
export async function notifyNewLeadInApp(input: { tenantId: string; systemId: string; contactId: string; via: "CHAT" | "FORM" }): Promise<void> {
  const title = `มีผู้สนใจใหม่จาก${VIA_TH[input.via]}เข้า CRM`;
  const body = `เปิดดูได้ที่ /app/sys/${input.systemId}/crm/contacts/${input.contactId} (รหัสผู้ติดต่อ ${input.contactId})`;
  const dup = await prisma.appNotification.findFirst({ where: { tenantId: input.tenantId, title, body }, select: { id: true } });
  if (dup) return;
  await prisma.appNotification.create({ data: { tenantId: input.tenantId, title, body } });
}
