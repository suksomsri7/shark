// crm-bridges/chat.ts — แชทขาเข้า → ตัวตนกลาง (Party) → ผู้ติดต่อ CRM / lead (ใบ C1.8 → ใบ C2.4 ต่อยอด · พิมพ์เขียว §7.2 · §9 แถว CHAT)
//
// `chat.message.received` { conversationId, channel } (ไม่มี messageId/ข้อความ — id ล้วน) → ห้อง (ร้านเดียวกัน) → ChatContact → Party:
//   มี `ChatContact.partyId` ⇒ ใช้เลย · ไม่มี ⇒ Party ชนิดคนจากเบอร์/อีเมล (`crm.contacts.personPartyFor`) แล้วผูกผ่าน `chat.linkChatContactParty`
//   → ระบบ CRM ของร้าน (ตัวแรก · ใบ C2.4 เปลี่ยนเป็น `targets.crmSystemId` ของระบบแชท) — ประตู uiVersion 2 + bridgesEnabled
//   → มีผู้ติดต่อของ Party นี้แล้ว ⇒ ไม่มีอะไรใหม่ · ไม่มี และ `settings.crm.chatToLead` เปิด ⇒ lead ใหม่ 1 ราย (source CHAT · partyId)
//   ❌ ไม่สร้างกิจกรรมต่อข้อความ (กิจกรรมแชท 1 รายการ/ห้อง = ใบ C2.4 ตอนห้องปิด)

import { prisma } from "@/lib/core/db";
import * as crm from "@/lib/modules/crm";
import * as chat from "@/lib/modules/chat";
import { notifyNewLeadInApp } from "@/lib/platform/crm-outbound";
import { bridgeOpen, crmGates, payloadOf, str, type BridgeEvent } from "./core";

/**
 * AUDIT-CLASS X1: ห้องค้นด้วย id + tenantId ของ event (ห้องของร้านอื่น = ไม่ทำอะไร) · ผู้ติดต่อแชทค้นด้วยร้านเดียวกัน
 * AUDIT-CLASS X3: หลายข้อความของคนใหม่คนเดียวยิงพร้อมกัน ⇒ บริการผู้ติดต่อล็อกต่อ (ระบบ, Party canonical) ⇒ lead 1 ราย ·
 *   Party ของห้องเขียนแบบมีเงื่อนไข (ยังว่าง) แล้วอ่านกลับ ⇒ ทุกทางใช้ Party เดียวกัน
 * AUDIT-CLASS X4: ส่งซ้ำ = ผู้ติดต่อของ Party มีแล้ว ⇒ ไม่เขียนอะไร (ธง = ผู้ติดต่อเอง ตรวจใต้ล็อกในบริการผู้ติดต่อ)
 * AUDIT-CLASS X8: ไม่ log ชื่อที่แชทแสดง/เบอร์/อีเมล · event ที่เกิดต่อเป็น id ล้วน
 */
export async function onChatMessage(evt: BridgeEvent): Promise<void> {
  const conversationId = str(payloadOf(evt.payload).conversationId);
  if (!conversationId) return;
  // ประตูก่อนอ่านอะไรของแชท: ระบบ CRM ปลายทาง (ตัวแรกของร้าน) ต้องเปิดสะพาน v2
  const target = (await crmGates(evt.tenantId))[0] ?? null;
  if (!bridgeOpen(target)) return;
  const conv = await prisma.chatConversation.findFirst({ where: { id: conversationId, tenantId: evt.tenantId }, select: { contactId: true } });
  if (!conv?.contactId) return;
  const cc = await prisma.chatContact.findFirst({
    where: { id: conv.contactId, tenantId: evt.tenantId },
    select: { id: true, partyId: true, displayName: true, phone: true, email: true },
  });
  if (!cc) return;

  let partyId = cc.partyId;
  if (!partyId) {
    const phone = str(cc.phone);
    const email = str(cc.email);
    if (!phone && !email) return; // ไม่มีอะไรบอกว่าเป็นใคร = ระบบไม่เดา
    // Party ชนิด "คน" เท่านั้น (ตรรกะเดียวกับการสร้างผู้ติดต่อ — ไม่มีวันผูกห้องแชทกับ Party บริษัท) · ล็อก Party ระดับร้านในบริการผู้ติดต่อ
    const found = await crm.contacts.personPartyFor(evt.tenantId, { name: str(cc.displayName), phone, email });
    if (!found) return;
    // เขียน ChatContact.partyId ผ่าน facade แชท (ครั้งเดียว · มี audit) แล้วใช้ค่าที่อยู่ในแถวจริง (คนก่อนหน้าผูกไว้แล้ว = ค่านั้นชนะ)
    partyId = await chat.linkChatContactParty({ tenantId: evt.tenantId, actorUserId: null }, { chatContactId: cc.id, partyId: found });
    if (!partyId) return;
  }
  if (!target.chatToLead) return; // ร้านไม่ได้เปิด "แชท → lead" = ผูก Party อย่างเดียว

  const res = await crm.contacts.leadFromBridge(
    { tenantId: evt.tenantId, systemId: target.systemId, actorUserId: null },
    { kind: "CHAT", name: str(cc.displayName), phone: str(cc.phone), email: str(cc.email), partyId, sourceDetail: { chatContactId: cc.id } },
  );
  if (res.created) await notifyNewLeadInApp({ tenantId: evt.tenantId, systemId: target.systemId, contactId: res.contactId, via: "CHAT" });
}
