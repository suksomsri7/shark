// ─────────────────────────────────────────────────────────────
// booking/privacy-shared.ts — ซ่อนเบอร์ลูกค้าตามสิทธิ์ (pure) · SVC B.11 ใบสั่ง §8.2
//   เห็นเบอร์เต็ม = booking.customer.phoneFull (OWNER/MANAGER สาขาที่คุมผ่านเสมอตาม evaluate)
// 🔴 pure: import ได้เฉพาะ core/rbac
// ─────────────────────────────────────────────────────────────
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";

/** "081-234-5678" ⇒ "•••-•••-5678" · ว่าง ⇒ "" · สั้นกว่า 4 หลัก ⇒ "•••" (ไม่มีเลขหน้าเหลือ) */
export function maskPhone(p: string | null | undefined): string {
  const d = String(p ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length < 4) return "•••";
  return `•••-•••-${d.slice(-4)}`;
}

export function canSeeFullPhone(m: MembershipCtx | null, unitId: string): boolean {
  return evaluate(m, { module: "booking", action: "booking.customer.phoneFull", unitId });
}

/** เบอร์ที่ผู้ดูคนนี้เห็นได้ (เต็ม หรือซ่อนเลขกลาง) */
export function phoneForViewer(m: MembershipCtx | null, unitId: string, phone: string | null | undefined): string {
  return canSeeFullPhone(m, unitId) ? String(phone ?? "") : maskPhone(phone);
}

// SVC B.16 ▸ ด่านแรกของความชอบ/ข้อห้ามบนการ์ดงาน (คีย์จองของสาขานี้) — ฟิลด์อ่อนไหวยังต้องผ่านนโยบายสมาชิก
//   (evaluateSensitiveAccess) อีกชั้นในตัวโหลด · คีย์ booking.* ไม่ใช่ใบผ่านข้อมูลอ่อนไหว ◂
export function canSeeCustomerNotes(m: MembershipCtx | null, unitId: string): boolean {
  return evaluate(m, { module: "booking", action: "booking.customer.notes", unitId });
}
