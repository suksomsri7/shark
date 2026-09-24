// assignment-shared.ts — ทะเบียนของ "มอบหมายอัตโนมัติ" (ใบ C2.3 · พิมพ์เขียว §5.7 §11.5 · ภาพ 07 ขวา)
//
// 🔴 ไฟล์บริสุทธิ์: ไม่แตะ prisma / next / server-only — หน้า (server) และหน้าจอฝั่ง client ใช้ชุดเดียวกับเอนจิน `assignment.ts`
// 🔴 เงื่อนไข 6 ชนิด (CRM-RUN S1): ช่องทางที่มา · ช่องทางย่อย · จังหวัด (ที่อยู่ของ Party) · ขนาดบริษัท · ภาษา · ฟิลด์กำหนดเอง `f.<key>`
//    ("สินค้าที่สนใจ" = ฟิลด์กำหนดเองของผู้ติดต่อ ไม่มีชนิดแยก — มติ R6)

export const ASSIGN_MODES = ["FIXED", "ROUND_ROBIN", "TEAM_LEAD", "LEAST_OPEN"] as const;
export type AssignMode = (typeof ASSIGN_MODES)[number];

export const ASSIGN_MODE_LABELS: Record<AssignMode, string> = {
  FIXED: "คนแรกที่ว่าง (ตามลำดับรายชื่อ)",
  ROUND_ROBIN: "วนตามคิว (Round-robin)",
  TEAM_LEAD: "หัวหน้าทีม",
  LEAST_OPEN: "คนที่งานค้างน้อยสุด",
};

/** คำอธิบายสั้นใต้ตัวเลือกโหมด */
export const ASSIGN_MODE_HINTS: Record<AssignMode, string> = {
  FIXED: "ให้คนแรกในรายชื่อที่รับงานได้ — คนแรกลา/ปิดรับ/เต็มเพดาน ระบบข้ามไปคนถัดไป",
  ROUND_ROBIN: "แจกวนทีละคนตามลำดับ ข้ามคนที่ลา ปิดรับ หรือเต็มเพดาน",
  TEAM_LEAD: "ให้หัวหน้าของทีมที่เลือก (หัวหน้าลา/ปิดรับ = ใช้ผู้รับสำรอง)",
  LEAST_OPEN: "ให้คนที่มี lead เปิดอยู่ + ดีลที่ยังเปิดน้อยที่สุด (เท่ากัน = ตามลำดับรายชื่อ)",
};

export const ASSIGN_CONDITION_FIELDS = ["sourceKind", "sourceChannel", "province", "companySize", "language"] as const;
export type AssignConditionField = (typeof ASSIGN_CONDITION_FIELDS)[number];
/** คำนำหน้าของฟิลด์กำหนดเองของผู้ติดต่อ (`f.product` = ฟิลด์ key `product`) */
export const ASSIGN_CUSTOM_FIELD_PREFIX = "f.";
export const ASSIGN_CUSTOM_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export const ASSIGN_CONDITION_FIELD_LABELS: Record<AssignConditionField, string> = {
  sourceKind: "ช่องทางที่มา",
  sourceChannel: "ช่องทางย่อย (เช่น facebook · line)",
  province: "จังหวัด (จากที่อยู่)",
  companySize: "ขนาดบริษัท",
  language: "ภาษาของลูกค้า",
};

export const ASSIGN_OPS = ["eq", "neq", "in", "contains"] as const;
export type AssignOp = (typeof ASSIGN_OPS)[number];
export const ASSIGN_OP_LABELS: Record<AssignOp, string> = { eq: "เท่ากับ", neq: "ไม่เท่ากับ", in: "เป็นหนึ่งใน", contains: "มีคำว่า" };

export const ASSIGN_LANGUAGES: readonly { value: string; label: string }[] = [
  { value: "th", label: "ไทย" },
  { value: "en", label: "อังกฤษ" },
  { value: "zh", label: "จีน" },
  { value: "ja", label: "ญี่ปุ่น" },
  { value: "ko", label: "เกาหลี" },
  { value: "ru", label: "รัสเซีย" },
  { value: "de", label: "เยอรมัน" },
  { value: "fr", label: "ฝรั่งเศส" },
];

export const ASSIGN_RULE_NAME_MAX = 120;
export const ASSIGN_MAX_OPEN_MIN = 1;
export const ASSIGN_MAX_OPEN_MAX = 10_000;
export const ASSIGN_MAX_CONDITIONS = 20;
export const ASSIGN_MAX_USERS = 100;
export const ASSIGN_SIMULATE_MAX_ROWS = 200;
export const ASSIGN_DELETE_REASON_MIN = 5;

export type AssignCondition = { field: string; op: AssignOp; value: string | string[] };
export type AssignConditions = { mode: "AND" | "OR"; items: AssignCondition[] };

/** เหตุผลของผลการมอบหมาย (ผลของ `pick` / `simulate`) */
export type AssignReason = "FIXED" | "CREATOR" | "RULE" | "FALLBACK" | "NOBODY" | "DISABLED";

export const ASSIGN_REASON_LABELS: Record<AssignReason, string> = {
  FIXED: "ผู้ดูแลที่เลือกเอง",
  CREATOR: "คนที่สร้างรายการ",
  RULE: "ตามกฎ",
  FALLBACK: "ไม่มีใครในกฎรับได้ — ใช้ผู้รับสำรอง",
  NOBODY: "ยังไม่มีผู้ดูแล — ระบบแจ้งเจ้าของร้าน/ผู้จัดการให้มอบหมายเอง",
  DISABLED: "ระบบนี้ยังใช้ CRM เดิม — ไม่มอบหมายอัตโนมัติ",
};

/** ข้อความสรุปเงื่อนไขภาษาไทย (ตารางกฎ / ผลทดลอง) */
export function describeAssignConditions(c: AssignConditions | null | undefined, labelOf: (field: string) => string = defaultFieldLabel): string {
  const items = c?.items ?? [];
  if (items.length === 0) return "ทุก lead ใหม่";
  const parts = items.map((i) => `${labelOf(i.field)} ${ASSIGN_OP_LABELS[i.op] ?? i.op} ${Array.isArray(i.value) ? i.value.join(", ") : i.value}`);
  return parts.join(c?.mode === "OR" ? " หรือ " : " และ ");
}

function defaultFieldLabel(field: string): string {
  if (field.startsWith(ASSIGN_CUSTOM_FIELD_PREFIX)) return `ฟิลด์ ${field.slice(ASSIGN_CUSTOM_FIELD_PREFIX.length)}`;
  return (ASSIGN_CONDITION_FIELD_LABELS as Record<string, string>)[field] ?? field;
}
