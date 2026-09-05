// Automation v1 (WO-0026) — ป้ายไทยกลางของ trigger/action (ใช้ทั้ง engine body + UI)
// event ที่รองรับ v1 = outbox event ของ POS (ขายสด/ยกเลิกบิล)

export type AutomationEventDef = { value: string; label: string };

// ตัวเลือก trigger ในฟอร์มสร้างกติกา (dropdown) — ป้ายไทยล้วน ไม่โชว์ event code ให้ user
export const AUTOMATION_EVENTS: AutomationEventDef[] = [
  { value: "pos.sale.paid", label: "เมื่อขายสำเร็จ (POS)" },
  { value: "pos.sale.voided", label: "เมื่อยกเลิกบิล" },
  { value: "inventory.lot.expiring", label: "เมื่อสินค้าใกล้หมดอายุ" },
  // ── บอร์ดงาน (K1.4 · พิมพ์เขียว 13-kanban-v2 §7.2) ────────────────────────
  // 🔴 ทุกตัวต้องมี consumer ใน `outbox-consumers.ts` ด้วย (ไม่งั้นคิวตันทั้งระบบเงียบ ๆ)
  //    `kanban.card.assigned` มี consumer มาตั้งแต่ Wave4-C แต่ไม่เคยอยู่ในเมนูนี้ ⇒ ร้านตั้งกฎ/ต่อเว็บฮุคกับมันไม่ได้
  //    (รายการนี้ถูก spread ต่อเข้า `WEBHOOK_EVENTS` ⇒ เพิ่มที่เดียวได้ทั้งกฎอัตโนมัติและเว็บฮุคขาออก)
  //    ที่เหลือของ §7.2 (created/due_soon/overdue/checklist/comment) จะเพิ่มพร้อม WO ที่ยิง event นั้นจริง
  { value: "kanban.card.moved", label: "เมื่อการ์ดถูกย้ายคอลัมน์" },
  { value: "kanban.card.assigned", label: "เมื่อมอบหมายงาน" },
  { value: "kanban.card.completed", label: "เมื่องานเสร็จ" },
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
