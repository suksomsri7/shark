// ป้ายไทยของ Approval Engine (WO-0049) — ใช้ร่วม UI + outbox consumer

export const ENTITY_TYPES = [
  { value: "PurchaseOrder", label: "ใบสั่งซื้อ" },
  { value: "HrLeave", label: "ใบลา" },
  // ระบบสมาชิก v2 (M1.4/M1.7/M1.9): danger op ที่พิมพ์เขียว §6.2 กำหนดให้ MANAGER ต้องขออนุมัติ
  //   ไม่มีนโยบาย = autoApproved (ทำทันที) ⇒ เจ้าของต้องตั้งนโยบายจากหน้า /app/settings/approval ถึงจะบังคับได้
  { value: "member.merge", label: "รวมสมาชิกซ้ำ" },
  { value: "member.tier.manual", label: "ตั้งระดับสมาชิกด้วยมือ" },
  { value: "member.erase", label: "ลบข้อมูลสมาชิก (PDPA)" },
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
