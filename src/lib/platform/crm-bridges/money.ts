// crm-bridges/money.ts — สะพาน "บัญชี / หน้าร้าน → ทางเดินเงินของ CRM v2" (ใบ C2.7 · RESOLUTIONS R-D: ใบนี้เป็นเจ้าของไฟล์นี้ไฟล์เดียว)
//
// กติกาทั้งหมดของโฟลเดอร์อยู่ที่หัว `core.ts` — ที่นี่ย้ำ 4 ข้อที่เป็นหัวใจของ "ทางเดินเงิน":
//  1. **ประตูมาก่อน** (R-E.14) — `openCrmSystems` คืนเฉพาะระบบ CRM ที่ uiVersion 2 + bridgesEnabled · ร้าน v1 = ไม่ทำอะไร
//     และ **ไม่ไล่เก็บย้อนหลังตอนเปิด v2** (มติผู้คุมงาน C2.7 ข้อ 6 · บันทึกเป็นคำถามเจ้าของ Q8)
//     🔴 มติรอบ 2 (B2) — **ประตูหยุดการ "นับเข้า" ได้ แต่ห้ามหยุดการ "ถอนคืน"**: ทางยกเลิก
//     (`account.payment.voided` · `account.document.voided` · `pos.sale.voided`) **อ่านประตูเหมือนกันทุกตัว** (`crmGates`)
//     แต่ไม่ใช้ค่านั้นตัดทางถอนคืน — วนระบบ CRM ทุกใบของร้าน เพราะร้านที่ปิดสะพาน/สลับกลับ v1 **หลัง** นับเงินไปแล้ว
//     ถ้าถอนไม่ได้ = ยอดเงินของดีลค้างเกินจริงถาวร (ยกเลิกบิล/ใบเสร็จแล้วเงินไม่หาย) · `bridgeOpen` จึงมีผลกับ
//     "การนับเข้า" ที่ `crm.payments` เท่านั้น · ฝั่งบริการถอน "เฉพาะแถวที่มีอยู่จริง" ⇒ ระบบที่ไม่เคยนับ = ไม่มีอะไรเกิดขึ้น
//     (ยังผูกร้าน + ต้องเป็นระบบชนิด CRM ของร้านนี้เสมอ · X1)
//  2. **ของแถมใต้ `compose`** — ทุกตัวถูกต่อท้าย consumer เดิมของ event นั้น: ที่นี่โยน error ได้ตามจริง
//     ผู้เรียกจะบันทึก WARN ให้เอง และ **บิล/การลงบัญชี/แต้ม/ตรา ไม่ล้มตาม** (AUDIT M10)
//  3. **AUDIT-CLASS X1 ร้านเดียว** — ทุก id ใน payload ถูกค้นด้วย `tenantId` ของ event เสมอ (เอกสารของร้านอื่น = ไม่ทำอะไร)
//     เอกสารอ่านผ่าน facade บัญชี (`docLinkInfo`) เท่านั้น — event บัญชีไม่มี partyId/sourceDocId (COMMON)
//  4. **AUDIT-CLASS X8 id ล้วน** — ที่นี่ส่งต่อแต่ id กับจำนวนสตางค์ · ข้อความ log ไม่มีชื่อ/เบอร์/อีเมล/เลขที่เอกสาร
//
// AUDIT-CLASS X4: การกันซ้ำ "ปักธงก่อนแล้วค่อยบวก" อยู่ที่ `crm.payments` (unique `(dealId, refType, refId)`) —
//   ส่งซ้ำ/ยิงพร้อมกันกี่โพรเซส เงินก็เข้าครั้งเดียว · AUDIT-CLASS X3: การเรียงคิวใช้ advisory lock ต่อดีลที่นั่นเช่นกัน
// AUDIT-CLASS X9: แถว audit ของการเปลี่ยนเงินทุกครั้งเขียนที่บริการ (actorType SYSTEM)

import * as crm from "@/lib/modules/crm";
import { crmGates, openCrmSystems, payloadOf, str, type BridgeEvent } from "./core";

const accountFacade = () => import("@/lib/modules/account");

/** จำนวนสตางค์จาก payload (ตัวตรวจจริงอยู่ที่บริการ — ที่นี่แค่แปลงชนิด) */
const satangOf = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);

/**
 * `account.payment.recorded {documentId, paymentId, amountSatang, docType}` → นับเงินเข้าดีลที่เอกสารใบนั้นสังกัด
 * เอกสารถูกอ่านด้วย tenantId ของ event ก่อนเสมอ (X1) — ไม่พบ = event ของร้านอื่น/ของปลอม = ไม่ทำอะไร
 */
export async function onPaymentRecorded(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const documentId = str(p.documentId);
  const paymentId = str(p.paymentId);
  if (!documentId || !paymentId) return;
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  const info = await (await accountFacade()).docLinkInfo(evt.tenantId, documentId);
  if (!info) return;
  for (const systemId of systems) {
    await crm.payments.recordDocPayment(
      { tenantId: evt.tenantId, systemId },
      { documentId: info.docId, paymentId, amountSatang: satangOf(p.amountSatang), docType: info.docType },
    );
  }
}

/**
 * `account.invoice.paid {documentId}` → ไม่เพิ่มยอดใด ๆ (เงินเข้าแล้วทาง `account.payment.recorded`)
 * มีหน้าที่เดียว: ตรวจ "จ่ายครบแล้วชนะอัตโนมัติไหม" ตามสวิตช์ของ pipeline — ส่งซ้ำกี่รอบก็ไม่มีผลข้างเคียง
 */
export async function onInvoicePaid(evt: BridgeEvent): Promise<void> {
  const documentId = str(payloadOf(evt.payload).documentId);
  if (!documentId) return;
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  const info = await (await accountFacade()).docLinkInfo(evt.tenantId, documentId);
  if (!info) return;
  for (const systemId of systems) await crm.payments.onInvoiceFullyPaid({ tenantId: evt.tenantId, systemId }, { documentId: info.docId });
}

/**
 * `account.payment.voided {paymentId, documentId, amountSatang}` → ถอนคืน **เฉพาะยอดที่เคยนับ** (M10)
 * 🔴 มติรอบ 2 (B2): อ่านประตูแต่ไม่ใช้กั้น — วนระบบ CRM ทุกใบของร้าน (ดูหัวไฟล์ข้อ 1)
 */
export async function onPaymentVoided(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const paymentId = str(p.paymentId);
  if (!paymentId) return;
  // มติรอบ 2 (B2 · ดูหัวไฟล์ข้อ 1): อ่านประตูจริงเหมือนทุกสะพาน แต่ **ไม่** กรองด้วย `bridgeOpen` —
  //   ประตูที่ปิดทีหลังห้ามกลืนเงินที่เคยนับไปแล้ว (ถอนคืนเสมอ · ระบบที่ไม่มีแถว = ไม่มีอะไรเกิดขึ้น)
  const systems = (await crmGates(evt.tenantId)).map((g) => g.systemId);
  if (systems.length === 0) return;
  for (const systemId of systems) {
    await crm.payments.reverseDocPayment({ tenantId: evt.tenantId, systemId }, { paymentId, documentId: str(p.documentId) ?? undefined, reason: str(p.reason) ?? undefined });
  }
}

/**
 * `account.document.voided {documentId}` → ธง "เอกสารถูกยกเลิก" ของดีลที่ผูกใบนั้น + ถอนคืนเงินของสายเอกสารนั้น
 * 🔴 มติรอบ 2 (B2): อ่านประตูแต่ไม่ใช้กั้น — วนระบบ CRM ทุกใบของร้าน (ดูหัวไฟล์ข้อ 1)
 */
export async function onDocumentVoided(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const documentId = str(p.documentId);
  if (!documentId) return;
  // มติรอบ 2 (B2 · ดูหัวไฟล์ข้อ 1): อ่านประตูจริงเหมือนทุกสะพาน แต่ **ไม่** กรองด้วย `bridgeOpen` —
  //   ประตูที่ปิดทีหลังห้ามกลืนเงินที่เคยนับไปแล้ว (ถอนคืนเสมอ · ระบบที่ไม่มีแถว = ไม่มีอะไรเกิดขึ้น)
  const systems = (await crmGates(evt.tenantId)).map((g) => g.systemId);
  if (systems.length === 0) return;
  const info = await (await accountFacade()).docLinkInfo(evt.tenantId, documentId);
  if (!info) return;
  for (const systemId of systems) await crm.payments.flagDocumentVoided({ tenantId: evt.tenantId, systemId }, { documentId: info.docId, reason: str(p.reason) ?? undefined });
}

/**
 * `pos.sale.paid {saleId}` → แถวที่แคชเชียร์ผูกไว้ (LINKED) กลายเป็นเงินที่นับแล้ว
 * 🔴 ตัวนี้มัก "มาก่อน" แถวลิงก์ (createSale ระบายคิวทันทีหลัง commit ส่วน action ผูกดีลยิงทีหลัง) ⇒ ไม่เจอแถว = ไม่ใช่ error:
 *    ทาง `linkSaleToDeal` จะนับเองใน tx ของมัน · ทั้งสองทางชนกันที่ unique เดียวกัน ใครถึงก่อนนับ อีกฝ่าย no-op
 */
export async function onPosSalePaid(evt: BridgeEvent): Promise<void> {
  const saleId = str(payloadOf(evt.payload).saleId);
  if (!saleId) return;
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  for (const systemId of systems) await crm.payments.countPosSale({ tenantId: evt.tenantId, systemId }, { saleId });
}

/**
 * `pos.sale.voided {saleId}` → ถอนคืนบิลใบนั้น (ยังไม่เคยนับ = แค่ทำเครื่องหมาย ไม่ลบยอด)
 * 🔴 มติรอบ 2 (B2): อ่านประตูแต่ไม่ใช้กั้น — วนระบบ CRM ทุกใบของร้าน (ดูหัวไฟล์ข้อ 1)
 */
export async function onPosSaleVoided(evt: BridgeEvent): Promise<void> {
  const saleId = str(payloadOf(evt.payload).saleId);
  if (!saleId) return;
  // มติรอบ 2 (B2 · ดูหัวไฟล์ข้อ 1): อ่านประตูจริงเหมือนทุกสะพาน แต่ **ไม่** กรองด้วย `bridgeOpen` —
  //   ประตูที่ปิดทีหลังห้ามกลืนเงินที่เคยนับไปแล้ว (ถอนคืนเสมอ · ระบบที่ไม่มีแถว = ไม่มีอะไรเกิดขึ้น)
  const systems = (await crmGates(evt.tenantId)).map((g) => g.systemId);
  if (systems.length === 0) return;
  for (const systemId of systems) await crm.payments.reversePosSale({ tenantId: evt.tenantId, systemId }, { saleId });
}

/**
 * `crm.deal.won {dealId}` → pipeline ที่ตั้ง "ออกใบแจ้งหนี้อัตโนมัติเมื่อชนะ" ได้ใบแจ้งหนี้ใบเดียว
 * ออกไม่ได้ (ยังไม่เชื่อมบัญชี · รายการต่างจากใบเสนอราคา) = โยนให้ `compose` บันทึก WARN — ดีลยังชนะตามปกติ
 */
export async function onDealWonAutoInvoice(evt: BridgeEvent): Promise<void> {
  const dealId = str(payloadOf(evt.payload).dealId);
  if (!dealId) return;
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  for (const systemId of systems) await crm.deals.autoInvoiceOnWonFromBridge({ tenantId: evt.tenantId, systemId }, { dealId });
}
