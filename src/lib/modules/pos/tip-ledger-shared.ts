// tip-ledger-shared.ts — POS P2.9U ▸ ชนิดข้อมูลของตัวเลือกบัญชีพักทิป (หน้าตั้งค่า "วิธีรับเงิน" · มติผู้คุม P2.9U ข้อ 6) ◂
// 🔴 ไม่แตะ prisma — จอ 'use client' import ได้ · action = tip-ledger-actions.ts
// 🔴 รายการ = บัญชีที่ยังไม่เก็บของสมุดที่เชื่อมกับ POS นี้ (ทุกหมวด) — จอกรองเหลือ LIABILITY เอง · updatePosPaymentSettings ตรวจซ้ำ (TIP_ACCOUNT_REQUIRED)

export type PosTipLedger = { id: string; code: string; name: string; type: string };
export type PosTipLedgersResult = { ok: true; linked: boolean; ledgers: PosTipLedger[] } | { ok: false; code: "NOT_FOUND" | "PERMISSION_DENIED" | "UNKNOWN"; message: string };
/** บัญชีที่เลือกเป็นบัญชีพักทิปได้ (มติ 7 ของ P2.9 · R9) */
export const isTipLedgerType = (type: string): boolean => type === "LIABILITY";
