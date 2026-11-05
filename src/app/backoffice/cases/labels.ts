// ป้ายไทยของหน้าเคส backoffice (S2.16 · จอ H3/H4) — ไฟล์บริสุทธิ์ (ไม่แตะฐาน)

export const STATUS_LABEL: Record<string, string> = {
  OPEN: "รอตอบ",
  PENDING: "ตอบแล้ว รอร้าน",
  RESOLVED: "ปิดแล้ว",
};

/** ช่องทางที่เปิดเรื่อง (`SupportCase.source`) */
export const SOURCE_LABEL: Record<string, string> = {
  APP: "จากแอป",
  WEB: "จากเว็บ",
  AI: "ผู้ช่วย AI เปิดให้",
};

/** หมวด (`SupportCase.category` · ชุดเดียวกับ CASE_CATEGORIES ของ support/service.ts) */
export const CATEGORY_LABEL: Record<string, string> = {
  secretary_wrong: "เลขาทำผิด",
  bug: "ใช้งานไม่ได้",
  question: "คำถาม",
  billing: "บัญชี/การเงิน",
  feature: "ข้อเสนอแนะ",
  other: "อื่น ๆ",
};

/** เลขเคสแบบที่ร้านเห็น (SHARK-000123) */
export function caseNoLabel(caseNo: number): string {
  return `SHARK-${String(Math.max(0, caseNo | 0)).padStart(6, "0")}`;
}

/** ตัวย่อ 2 ตัวของชื่อร้าน (กล่องรูปแทนในแถว) */
export function initialsOf(name: string): string {
  const s = Array.from((name ?? "").trim());
  return s.slice(0, 2).join("") || "—";
}
