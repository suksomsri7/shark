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
// CRM C2.2 ▸ หยุดลำดับการติดตามอัตโนมัติ (ชนะ/แพ้/ขอไม่รับข่าวสาร) — เรียก `crm.sequences.stopFor` (R-A · R-D)
export { onDealWonStopSequences, onDealLostStopSequences, onContactOptOutStopSequences } from "./sequences";
// ◂ CRM C2.2
