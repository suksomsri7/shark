// crm-bridges/portal.ts — event ของพอร์ทัลลูกค้าองค์กร → CRM (ใบ C3.5 · RESOLUTIONS R-D: ใบ C3.5 เป็นเจ้าของไฟล์นี้ไฟล์เดียว)
//
// ตัวรับเดียว `onPortalEvent` ของ 3 event (`crm.portal.viewed` · `.quote.responded` · `.request.created` — payload id ล้วน)
//   🔴 ประตูมาก่อนเสมอ (กติกาข้อ 1 ของ core.ts · R-E.14): ระบบ CRM ที่ uiVersion 1 หรือปิด bridgesEnabled = ไม่ทำอะไร
//   🔴 การย้ายขั้นดีลเมื่อลูกค้าตอบใบเสนอราคา **ไม่อยู่ที่นี่** — เป็นของตัวรับเดิม `account.quotation.responded` (ไม่มีตัวย้ายตัวที่สอง)
//   AUDIT-CLASS X1: ผู้ติดต่อค้นด้วย tenantId ของ event · AUDIT-CLASS X4: กิจกรรม PORTAL ใบเดียวต่อ event (ใต้ advisory lock ในบริการ)
//   การเขียนทั้งหมดผ่าน facade `crm.portal` เท่านั้น
import * as crm from "@/lib/modules/crm";
import { bridgeOpen, crmGate, type BridgeEvent } from "./core";

export async function onPortalEvent(evt: BridgeEvent): Promise<void> {
  const gate = await crmGate(evt.tenantId, evt.systemId ?? null);
  if (!bridgeOpen(gate)) return;
  await crm.portal.onPortalEvent({ id: evt.id, tenantId: evt.tenantId, type: evt.type, payload: evt.payload, systemId: gate.systemId });
}
