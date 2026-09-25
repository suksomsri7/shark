// crm-bridges/index.ts — ทางเข้าเดียวของสะพาน CRM (ใบ C1.8 · RESOLUTIONS R-D: โฟลเดอร์ · เจ้าของรายไฟล์)
//   core.ts (C1.8) · forms.ts (C1.8 → C2.6) · chat.ts (C1.8 → C2.4) · money.ts (C2.7) · business.ts (C2.9) · scoring.ts (C2.8) ·
//   sequences.ts (C2.2) · portal.ts (C3.5) · commissions.ts (C3.3)
// 🔴 ผู้เรียก (`src/lib/outbox-consumers.ts`) โหลดไฟล์นี้แบบ dynamic import เสมอ — crm/member/account → … → `scheduleDrain`
//    ที่ outbox-consumers = วงโหลดไฟล์ถ้า import ที่หัวไฟล์ (เหตุผลเดียวกับ `kanbanBridge` / `memberBridge`)
// AUDIT-CLASS X1 · X3 · X4 · X8 — รายละเอียดอยู่ที่หัวของแต่ละตัวรับในไฟล์ย่อย

export type { BridgeEvent, CrmGate } from "./core";
export {
  bridgeOpen,
  crmGate,
  crmGates,
  openCrmSystems,
  onCrmTimelineEvent,
  onCustomRecordCreated,
  onMemberCreated,
  onMemberMerged,
  onQuotationResponded,
  onDocumentIssued,
  onAccountContactMerged,
} from "./core";
export { resolveFormCrmSystem, onFormLead, onFormTimeline } from "./forms";
export { onChatMessage } from "./chat";
// CRM C2.4 ▸ ห้องแชทถูกปิด (RESOLVED) → กิจกรรมชนิด CHAT ใบเดียวต่อห้อง (+ สรุป AI ถ้าร้านเปิด `settings.crm.ai.chatSummary`) ◂
export { onChatConversationStatus } from "./chat";
// CRM C2.2 ▸ หยุดลำดับการติดตามอัตโนมัติ (ชนะ/แพ้/ขอไม่รับข่าวสาร) — เรียก `crm.sequences.stopFor` (R-A · R-D)
export { onDealWonStopSequences, onDealLostStopSequences, onContactOptOutStopSequences } from "./sequences";
// ◂ CRM C2.2
// CRM C2.7 ▸ ทางเดินเงิน (`money.ts` · R-D: ใบ C2.7 เป็นเจ้าของไฟล์นั้นไฟล์เดียว) — บัญชี/หน้าร้าน → CrmDealPayment · paidSatang ·
//   wonValueSatang · lifecycle · แคชบริษัท · ธง "เอกสารถูกยกเลิก" · ออกใบแจ้งหนี้อัตโนมัติเมื่อชนะ
export {
  onPaymentRecorded,
  onInvoicePaid,
  onPaymentVoided,
  onDocumentVoided,
  onPosSalePaid,
  onPosSaleVoided,
  onDealWonAutoInvoice,
} from "./money";
// ◂ CRM C2.7
// CRM C2.8 ▸ คะแนนผู้ติดต่อ (`scoring.ts` · R-D: ใบ C2.8 เป็นเจ้าของไฟล์นั้นไฟล์เดียว) — ตัวรับเดียวที่ถูกเสียบเป็น
//   "ของแถม" ใต้ `compose` ในตัวบริโภคของทุก event ที่กฎคะแนนอ้างได้ (ประตู uiVersion 2 + bridgesEnabled อยู่ในตัวมันเอง)
export { onScoringEvent } from "./scoring";
// ◂ CRM C2.8
// CRM C2.9 ▸ เหตุการณ์ธุรกิจของ 8 โมดูล (`business.ts` · R-D: ใบ C2.9 เป็นเจ้าของไฟล์นั้นไฟล์เดียว) — ตั๋ว · เช่า · เรียน ·
//   ที่พัก · คลินิก · คิว · นัด · ร้านค้าออนไลน์ → กิจกรรม VISIT ใบเดียวต่อแถวต้นทาง + ขั้นลูกค้าเป็น CUSTOMER ผ่าน Party
//   ตัวรับ **ตัวเดียว** ใช้กับทั้ง 8 ชนิด (มติผู้คุมงาน C2.9 ข้อ 7)
export { onBusinessEvent } from "./business";
// ◂ CRM C2.9
