// ป้ายไทยของ Approval Engine (WO-0049) — ใช้ร่วม UI + outbox consumer

export const ENTITY_TYPES = [
  { value: "PurchaseOrder", label: "ใบสั่งซื้อ" },
  { value: "HrLeave", label: "ใบลา" },
] as const;

export const APPROVER_ROLES = [
  { value: "MANAGER", label: "ผู้จัดการ" },
  { value: "OWNER", label: "เจ้าของร้าน" },
] as const;

export const entityLabel = (v: string): string =>
  ENTITY_TYPES.find((e) => e.value === v)?.label ?? v;

export const roleLabel = (v: string): string =>
  APPROVER_ROLES.find((r) => r.value === v)?.label ?? v;

export const statusLabel = (v: string): string =>
  ({ PENDING: "รออนุมัติ", APPROVED: "อนุมัติแล้ว", REJECTED: "ไม่อนุมัติ", CANCELLED: "ยกเลิก" })[v] ?? v;
