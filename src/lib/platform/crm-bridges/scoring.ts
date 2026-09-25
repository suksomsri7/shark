// crm-bridges/scoring.ts — "เหตุการณ์ของลูกค้า → คะแนนผู้ติดต่อ" (ใบ C2.8 · RESOLUTIONS R-D เจ้าของไฟล์นี้ไฟล์เดียว)
//
// ตัวรับเดียว `onScoringEvent(evt)` ถูกเสียบเป็น **ของแถมใต้ `compose`** ในตัวบริโภคของทุก event ที่กฎคะแนนอ้างได้และมีบ้านในคิว
// (`forms.submission.received` · `chat.message.received` · `crm.activity.completed` · `crm.email.opened/clicked/received` ·
//  `crm.web.identified` · `crm.deal.quotation.issued`) ⇒ ล้ม = WARN ของ compose ไม่ทำให้ event ล้ม · งานหลักล้ม = ของแถมยังวิ่ง
//
// 🔴 **ประตูมาก่อนเสมอ** (กติกาข้อ 1 ของ `core.ts` · R-E.14 · กฎถาวร C1.11-S6.10 "ประตูอยู่ในตัว `on*` เอง"):
//    `uiVersion = 1` หรือ `bridgesEnabled = false` ⇒ ไม่อ่านกฎ ไม่เขียนแถวแต้ม ไม่ยิง event เลย
//    เหตุผลที่ต้องมี: ร้านที่ปิดสวิตช์สะพานไว้ต้องปิดจริง — แต้มที่งอกขึ้นเองระหว่างนั้นจะไปโป๊ะที่ "ลูกค้าร้อน" ของรายงาน
// 🔴 AUDIT-CLASS X1: id ใน payload ถูกค้นด้วย `tenantId` ของ event เสมอ · ผู้ติดต่อของระบบอื่น = ไม่ให้คะแนน
// 🔴 AUDIT-CLASS X4: กุญแจกันซ้ำ = `idempotencyKey` ของแถว event (ไม่มีแถว = `evt.id`) ⇒ ส่งซ้ำ/พร้อมกันกี่รอบ = แต้มใบเดียว
//    (ด่านจริงคือ partial UNIQUE (ruleId, eventKey) ในบริการคะแนน — ที่นี่แค่ส่งกุญแจที่คงที่ต่อ event ไปให้)
// 🔴 AUDIT-CLASS X8: ไม่ log ชื่อ/เบอร์/อีเมล · ไม่ส่งข้อมูลลูกค้าเข้าไปในแถวแต้ม (เหตุผลคือ "ชื่อกฎ")
// 🔴 การเขียนทั้งหมดผ่าน facade `crm.scoring` เท่านั้น (ไฟล์นี้ไม่แตะตารางของ CRM ด้วย prisma ดิบ — อ่านเพื่อหา "ใคร" ได้เท่านั้น)

import { prisma } from "@/lib/core/db";
import * as crm from "@/lib/modules/crm";
import { bridgeOpen, crmGate, crmGates, payloadOf, str, type BridgeEvent } from "./core";
import { resolveFormCrmSystem } from "./forms";

/** กุญแจกันซ้ำที่คงที่ต่อ event หนึ่งใบ — `idempotencyKey` ของแถวในคิว (event สังเคราะห์/ถูกลบแล้ว = id ของ event) */
async function eventKeyOf(evt: BridgeEvent): Promise<string> {
  const row = await prisma.outboxEvent.findUnique({ where: { id: evt.id }, select: { idempotencyKey: true } }).catch(() => null);
  return str(row?.idempotencyKey) ?? evt.id;
}

/**
 * ผู้ติดต่อที่ event นี้พูดถึง "ในระบบ CRM ใบนี้" — คืน id เดียว (ไม่พบ = null ⇒ ไม่มีอะไรให้คะแนน ไม่ใช่ความผิดพลาด)
 * payload ของแต่ละ event บอกคนละอย่าง: id ของผู้ติดต่อ/ดีล/กิจกรรมตรง ๆ · คำตอบฟอร์ม (`FormSubmission.crmContactId`) ·
 * ห้องแชท (ห้อง → ChatContact → Party → ผู้ติดต่อของ Party นั้นในระบบนี้)
 */
async function contactIdFor(evt: BridgeEvent, systemId: string): Promise<string | null> {
  const p = payloadOf(evt.payload);
  const direct = str(p.contactId);
  if (direct) return direct;
  const submissionId = str(p.submissionId);
  if (submissionId) {
    const sub = await prisma.formSubmission.findFirst({ where: { id: submissionId, tenantId: evt.tenantId }, select: { crmContactId: true } });
    if (sub?.crmContactId) return sub.crmContactId;
  }
  const conversationId = str(p.conversationId);
  if (conversationId) {
    const conv = await prisma.chatConversation.findFirst({ where: { id: conversationId, tenantId: evt.tenantId }, select: { contactId: true } });
    const cc = conv?.contactId
      ? await prisma.chatContact.findFirst({ where: { id: conv.contactId, tenantId: evt.tenantId }, select: { partyId: true } })
      : null;
    if (cc?.partyId) {
      const c = await prisma.crmContact.findFirst({
        where: { tenantId: evt.tenantId, systemId, partyId: cc.partyId, archivedAt: null, mergedIntoId: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (c) return c.id;
    }
  }
  // ดีล/กิจกรรมปล่อยให้บริการคะแนนไล่เอง (`scoring.onEvent` โหลดใหม่ในร้าน+ระบบของ ctx อยู่แล้ว — AUDIT-CLASS X1)
  return null;
}

/**
 * ตัวรับของสะพานคะแนน — ระบบปลายทาง: `evt.systemId` ถ้ามันเป็นระบบ CRM ของร้านนี้ · ฟอร์มใช้ระบบที่ฟอร์มชี้ไว้ ·
 * ที่เหลือ (แชท/อีเมล/เว็บ ที่ไม่ได้บอกระบบ) = ระบบ CRM ทุกใบของร้านที่ **เปิดสะพาน** (ผู้ติดต่อที่ไม่ได้อยู่ระบบนั้นจะไม่ได้แต้มเอง)
 */
export async function onScoringEvent(evt: BridgeEvent): Promise<void> {
  if (!evt?.tenantId || !evt?.type) return;
  const targets: string[] = [];
  const own = await crmGate(evt.tenantId, evt.systemId);
  if (own) {
    // ประตูของระบบที่ event เกิด — ปิดอยู่ = จบ (ไม่ไปลองระบบใบอื่นแทน)
    if (!bridgeOpen(own)) return;
    targets.push(own.systemId);
  } else if (evt.type === "forms.submission.received") {
    const formId = str(payloadOf(evt.payload).formId);
    const sysId = formId ? await resolveFormCrmSystem({ id: formId, tenantId: evt.tenantId }) : null;
    const gate = await crmGate(evt.tenantId, sysId);
    if (!gate || !bridgeOpen(gate)) return;
    targets.push(gate.systemId);
  } else {
    for (const g of (await crmGates(evt.tenantId)).filter(bridgeOpen)) targets.push(g.systemId);
  }
  if (targets.length === 0) return;
  const payload = payloadOf(evt.payload);
  // C2.8 รอบแก้ 25 ก.ย. ▸ "ออกใบเสนอราคาจากดีล": ผู้ติดต่อของ event นี้ = `payload.contactId` (ผู้ติดต่อหลักของดีล) เท่านั้น ·
  //   ดีลที่ยังไม่มีผู้ติดต่อหลัก = ไม่มีคนให้คะแนน ⇒ **ข้ามเงียบ ๆ** (ไม่ใช่ความผิดพลาด · ไม่ไปเดาจากดีลต่อ) ◂
  if (evt.type === "crm.deal.quotation.issued" && !str(payload.contactId)) return;
  const eventKey = await eventKeyOf(evt);
  for (const systemId of targets) {
    const contactId = await contactIdFor(evt, systemId);
    await crm.scoring.onEvent(
      { tenantId: evt.tenantId, systemId, actorUserId: null },
      evt.type,
      contactId ? { ...payload, contactId } : payload,
      { eventKey },
    );
  }
}
