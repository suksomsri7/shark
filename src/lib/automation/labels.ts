// Automation v1 (WO-0026) — ป้ายไทยกลางของ trigger/action (ใช้ทั้ง engine body + UI)
// event ที่รองรับ v1 = outbox event ของ POS (ขายสด/ยกเลิกบิล)

export type AutomationEventDef = { value: string; label: string };

// ตัวเลือก trigger ในฟอร์มสร้างกติกา (dropdown) — ป้ายไทยล้วน ไม่โชว์ event code ให้ user
export const AUTOMATION_EVENTS: AutomationEventDef[] = [
  { value: "pos.sale.paid", label: "เมื่อขายสำเร็จ (POS)" },
  { value: "pos.sale.voided", label: "เมื่อยกเลิกบิล" },
];

// event code → ป้ายไทย (สำหรับ body แจ้งเตือน + รายการกติกา) — ไม่รู้จัก → คืน code เดิม
export const eventLabel = (event: string): string =>
  AUTOMATION_EVENTS.find((e) => e.value === event)?.label ?? event;

// action type → ป้ายไทย
export const ACTION_LABEL: Record<string, string> = {
  NOTIFY: "แจ้งเตือนในแอป",
  WEBHOOK: "ส่งเว็บฮุค",
};

export const actionLabel = (t: string): string => ACTION_LABEL[t] ?? t;
