// crm-bridges/sequences.ts — ตัวรับ event ที่ "หยุดลำดับการติดตามอัตโนมัติ" (ใบ C2.2 · RESOLUTIONS R-A/R-D · พิมพ์เขียว §5.7)
//   crm.deal.won     ⇒ หยุดแถวที่ผูกดีลนั้น ในลำดับที่เปิด stopOnWon (ปิดไว้ = เดินต่อ) · เหตุ "WON"
//   crm.deal.lost    ⇒ เหมือนกัน ด้วย stopOnLost · เหตุ "LOST"
//   crm.contact.updated ⇒ ผู้ติดต่อ "ตอนนี้" ขอไม่รับข่าวสาร (marketingOptOut) ⇒ หยุดทุกแถวของคนนั้น · เหตุ "OPT_OUT"
//   ทุกตัวเรียก `sequences.stopFor` ของโมดูล CRM (ทางเข้าเดียวของการหยุดอัตโนมัติ) — ไฟล์นี้ไม่เขียนตารางเอง
// 🔴 เป็น "ของแถม" ใต้ `compose` ใน outbox-consumers.ts: ล้ม = WARN ไม่ทำให้ event ล้ม (งานหลักของ event เดิมไม่ถูกแตะ)
// 🔴 **ประตูมาก่อนเสมอ** (กติกาข้อ 1 ของ `core.ts` · มติผู้คุมงานรีวิว C2.2 ข้อ 1 — ไม่มีข้อยกเว้นใบที่สาม):
//    อ่าน `settings.crm` ของระบบที่แถวนั้นอยู่ก่อนทำอะไร — `uiVersion = 1` หรือ `bridgesEnabled = false` ⇒ ไม่ทำอะไรเลย
//    เหตุผลที่ต้องมี (ของจริงที่พังถ้าไม่มี): ร้านที่สลับกลับเป็นรุ่น 1 ขณะมีคนกำลังเดินอยู่ R-E.14 สัญญาว่า "แถวคงอยู่และเดินต่อ
//    เมื่อกลับเป็น 2" · ถ้าไม่มีประตู ดีลที่ถูกปิดเป็นแพ้ระหว่างนั้นจะทำให้แถวกลายเป็น STOPPED ถาวร (STOPPED ไม่เคยเดินต่อ)
//    และยิง `crm.sequence.finished` ออก webhook ของร้านทั้งที่ v2 ปิดอยู่
// AUDIT-CLASS X1: ดีล/ผู้ติดต่อถูกโหลดใหม่ด้วย id **ในร้านของ event** — id ข้ามร้าน = ไม่ทำอะไร · stopFor ผูกร้าน+ระบบของแถวที่โหลดได้
// AUDIT-CLASS X4: ส่งซ้ำ/พร้อมกันกี่ครั้ง = หยุดครั้งเดียว · finished ครั้งเดียว (updateMany มีเงื่อนไขใน stopFor)
import { prisma } from "@/lib/core/db";
import * as crm from "@/lib/modules/crm";
import { bridgeOpen, crmGate, payloadOf, str, type BridgeEvent } from "./core";

// 🔴 กฎถาวร C1.11-S6.10: **ตัวรับ event ทุกตัวอ่านประตูในตัวมันเอง** (`crmGate` + `bridgeOpen` อยู่ในตัว `on*` ไม่ซ่อนในตัวช่วย)
//    เหตุผล: คนอ่าน/ข้อสอบต้องเห็นประตูที่เดียวกับการหยุด — ประตูที่ถูกซ่อนในฟังก์ชันช่วยเคยถูกลบทิ้งพร้อมการรีแฟกเตอร์เงียบ ๆ

/** ดีลของ event ในร้านของ event (AUDIT-CLASS X1 — id ข้ามร้าน = ไม่พบ) */
async function dealOf(evt: BridgeEvent): Promise<{ id: string; systemId: string; contactId: string | null } | null> {
  const dealId = str(payloadOf(evt.payload).dealId);
  if (!dealId) return null;
  return prisma.crmDeal.findFirst({ where: { id: dealId, tenantId: evt.tenantId }, select: { id: true, systemId: true, contactId: true } });
}

/** ผู้ติดต่อของ event ในร้านของ event — ค่า marketingOptOut อ่านสดจากฐาน (ไม่เชื่อ payload) */
async function contactOf(evt: BridgeEvent): Promise<{ id: string; systemId: string; marketingOptOut: boolean } | null> {
  const contactId = str(payloadOf(evt.payload).contactId);
  if (!contactId) return null;
  return prisma.crmContact.findFirst({ where: { id: contactId, tenantId: evt.tenantId }, select: { id: true, systemId: true, marketingOptOut: true } });
}

/** ขั้นตอนหยุด (ผู้เรียกอ่านประตูของระบบแถวนั้นมาก่อนแล้ว) — ทางเข้าเดียวคือ `sequences.stopFor` */
async function stopByDeal(evt: BridgeEvent, deal: { id: string; systemId: string; contactId: string | null }, reason: "WON" | "LOST"): Promise<void> {
  await crm.sequences.stopFor({ tenantId: evt.tenantId, systemId: deal.systemId }, deal.contactId ?? "", reason, { dealId: deal.id });
}

/** crm.deal.won → หยุดลำดับของดีลนี้ (ลำดับที่ตั้ง stopOnWon) */
export async function onDealWonStopSequences(evt: BridgeEvent): Promise<void> {
  const deal = await dealOf(evt);
  if (!deal) return;
  // ประตูของ "ระบบที่ดีลนั้นอยู่" อ่านสดก่อนแตะแถวใด ๆ (uiVersion 2 + bridgesEnabled)
  if (!bridgeOpen(await crmGate(evt.tenantId, deal.systemId))) return;
  await stopByDeal(evt, deal, "WON");
}

/** crm.deal.lost → หยุดลำดับของดีลนี้ (ลำดับที่ตั้ง stopOnLost) */
export async function onDealLostStopSequences(evt: BridgeEvent): Promise<void> {
  const deal = await dealOf(evt);
  if (!deal) return;
  // ประตูของ "ระบบที่ดีลนั้นอยู่" อ่านสดก่อนแตะแถวใด ๆ — ร้านที่สลับกลับเป็น v1 ต้องเก็บแถวไว้เดินต่อ (R-E.14)
  if (!bridgeOpen(await crmGate(evt.tenantId, deal.systemId))) return;
  await stopByDeal(evt, deal, "LOST");
}

/** crm.contact.updated → ผู้ติดต่อขอไม่รับข่าวสาร (อ่านค่าปัจจุบันจากฐาน ไม่เชื่อ payload) ⇒ หยุดทุกลำดับของคนนั้น */
export async function onContactOptOutStopSequences(evt: BridgeEvent): Promise<void> {
  const c = await contactOf(evt);
  if (!c?.marketingOptOut) return;
  // ประตูของ "ระบบที่ผู้ติดต่อนั้นอยู่" อ่านสดก่อนแตะแถวใด ๆ
  if (!bridgeOpen(await crmGate(evt.tenantId, c.systemId))) return;
  await crm.sequences.stopFor({ tenantId: evt.tenantId, systemId: c.systemId }, c.id, "OPT_OUT");
}
