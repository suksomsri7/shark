// Webhooks ขาออก (WO-0062) — รายการเหตุการณ์ที่สมัครฮุคได้ + ป้ายไทย
// รวม event ของ Automation (POS/inventory) + Approval (ผ่าน/ปฏิเสธ) — ป้ายไทยล้วน ไม่โชว์ code
import { AUTOMATION_EVENTS, type AutomationEventDef } from "@/lib/automation/labels";

export const WEBHOOK_EVENTS: AutomationEventDef[] = [
  ...AUTOMATION_EVENTS,
  { value: "approval.request.submitted", label: "เมื่อมีคำขออนุมัติใหม่" },
  { value: "approval.request.approved", label: "เมื่อคำขออนุมัติผ่าน" },
  { value: "approval.request.rejected", label: "เมื่อคำขออนุมัติถูกปฏิเสธ" },
];

// event code → ป้ายไทย (สำหรับตารางการส่ง) — ไม่รู้จัก → คืน code เดิม
export const webhookEventLabel = (event: string): string =>
  WEBHOOK_EVENTS.find((e) => e.value === event)?.label ?? event;
