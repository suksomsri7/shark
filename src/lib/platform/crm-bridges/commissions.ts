// crm-bridges/commissions.ts — สะพานของ "คอมมิชชัน → เงินเดือน" (ใบ C3.3 · RESOLUTIONS R-D: ใบนี้เป็นเจ้าของไฟล์นี้ไฟล์เดียว)
//
// ตัวรับ 4 ตัว (ผูกใน `src/lib/outbox-consumers.ts` บล็อก `// CRM C3.3 ▸` เป็น "ขั้นแรกที่ retry ได้"):
//   • onPayrollPaid       ← `hr.payroll.paid {runId, periodKey}` (ยิงใน tx ของ `hr.markPaid`) → คอมมิชชันของรายการในรอบนั้น = PAID
//   • onCommissionCreated ← `crm.commission.created` → ยื่นอนุมัติ/ส่งเงินเดือนต่อ (สำรองกรณีโพรเซสตายหลัง commit ของ onPaid/onWon)
//   • onCommissionApproved← `crm.commission.approved` → ส่งเงินเดือน (สำรอง) + แจ้งพนักงานเจ้าของรายการ (`commission.status`)
//   • onCommissionReversed← `crm.commission.reversed` → หักคืนในเงินเดือน (สำรอง) + แจ้งพนักงานเจ้าของรายการ
//
// กติกาของโฟลเดอร์ (หัว `core.ts`) ที่ใช้ที่นี่:
//  1. **ร้านเดียวเท่านั้น** (AUDIT-CLASS X1) — ทุก id ใน payload ถูกค้นด้วย `tenantId` ของ event (บริการเป็นคนค้น) · ของร้านอื่น = ไม่ทำอะไร
//  2. **ส่งซ้ำ/พร้อมกันได้** (AUDIT-CLASS X4) — บริการ guard สถานะทุกการเปลี่ยน + ล็อกแถว + partial unique ของ HR ⇒ replay = ไม่มีอะไรเปลี่ยน
//  3. **id ล้วน** (AUDIT-CLASS X8) — payload/log มีแต่ id และจำนวนสตางค์
//  5. **ประตู** (R-E.14 · กติกาถาวรของ C1.11 — ตัวรับ on* ทุกตัวอ่านประตู): created/approved (ยื่นอนุมัติ · ส่งเงินเดือน = "นับเข้า")
//     ทำเฉพาะระบบที่ uiVersion 2 + bridgesEnabled (`bridgeOpen`) — ระบบที่ปิดไว้ แถวคงอยู่แล้วเดินต่อเมื่อเปิดใหม่ (งานรายนาทีเก็บให้) ·
//     reversed / hr.payroll.paid = "ถอนคืน/ปิดยอดของที่มีอยู่แล้ว" ⇒ อ่านประตูแต่ไม่ให้ประตูกลืน (มติ B2 ของ C2.7 แบบเดียวกัน)
//  4. ความล้ม: `CommissionsError` (ข้อมูลใช้ไม่ได้ถาวร) = WARN แล้วจบ · ความล้มอื่น (ฐานข้อมูลชั่วคราว) = โยนต่อให้คิว retry
//     (ผู้เรียกวางไว้เป็นขั้นแรก ⇒ retry ไม่ทำให้ automation/เว็บฮุคซ้ำ) · แจ้งเตือนเป็นของแถม: ล้ม = เงียบ (ไม่ขวางเงิน)

import { logOps } from "@/lib/core/ops";
import * as crm from "@/lib/modules/crm";
import { bridgeOpen, crmGate, crmGates, payloadOf, str, type BridgeEvent } from "./core";

async function guarded(evt: BridgeEvent, what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof crm.commissions.CommissionsError)) throw e;
    await logOps("WARN", "crm", `คอมมิชชัน: ${what} ไม่สำเร็จ (${e.code})`, { tenantId: evt.tenantId, detail: `event=${evt.id} type=${evt.type}` }).catch(() => undefined);
  }
}

/** แจ้งพนักงานเจ้าของรายการ (ของแถม — ล้มแล้วเงียบ · เนื้อความเป็นเทมเพลตกลาง ไม่มีข้อมูลลูกค้า) */
async function notifyOwner(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const systemId = str(p.systemId) ?? str(evt.systemId);
  const userId = str(p.userId);
  const dealId = str(p.dealId);
  if (!systemId || !userId || !dealId) return;
  await crm.notifications
    .notifyStaff({ tenantId: evt.tenantId, systemId, actorUserId: null }, { key: "commission.status", refType: "CrmDeal", refId: dealId, userIds: [userId] })
    .catch(() => undefined);
}

export async function onPayrollPaid(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  // อ่านประตูแต่ไม่กรองด้วย bridgeOpen (ปิดยอดของแถวที่มีอยู่แล้ว) — ร้านที่ไม่มีระบบ CRM เลย = ไม่มีคอมมิชชันให้ปิด
  if ((await crmGates(evt.tenantId)).length === 0) return;
  await guarded(evt, "ปิดรายการคอมมิชชันที่จ่ายกับเงินเดือนแล้ว", () =>
    crm.commissions.onPayrollPaid({ tenantId: evt.tenantId, hrSystemId: str(evt.systemId), runId: str(p.runId) }),
  );
}

export async function onCommissionCreated(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  if (!bridgeOpen(await crmGate(evt.tenantId, str(p.systemId) ?? evt.systemId))) return;
  await guarded(evt, "ยื่นอนุมัติคอมมิชชัน", () => crm.commissions.advanceById({ tenantId: evt.tenantId, commissionId: str(p.commissionId) }));
}

export async function onCommissionApproved(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  if (!bridgeOpen(await crmGate(evt.tenantId, str(p.systemId) ?? evt.systemId))) return;
  await guarded(evt, "ส่งคอมมิชชันเข้าเงินเดือน", () => crm.commissions.advanceById({ tenantId: evt.tenantId, commissionId: str(p.commissionId) }));
  await notifyOwner(evt);
}

export async function onCommissionReversed(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  // อ่านประตูแต่ไม่ให้ประตูกลืนการหักคืน (มติ B2) — ต้องเป็นระบบ CRM ของร้านนี้เท่านั้น (X1)
  if (!(await crmGate(evt.tenantId, str(p.systemId) ?? evt.systemId))) return;
  await guarded(evt, "หักคืนคอมมิชชันในเงินเดือน", () => crm.commissions.advanceById({ tenantId: evt.tenantId, commissionId: str(p.commissionId) }));
  await notifyOwner(evt);
}
