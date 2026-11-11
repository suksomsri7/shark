// SVC B.7 — token ลิงก์จัดการนัด (pure · ไม่แตะฐาน) · ใบสั่ง svc-brief-b.7 §3.1 · DESIGN-BOOKING-QUEUE §7
//   token = base64url(HMAC-SHA256(key = "booking-manage:v1:" + SESSION_SECRET, appointmentId)) = 43 ตัว (256 บิต)
//   กำหนดแน่นอนจาก id (ส่งซ้ำ key เดิมได้ลิงก์เดิม · B.9 ออกลิงก์ได้โดยไม่เก็บ token ดิบ) · ฐานเก็บแค่ sha256(token) ไว้หาแถว
// 🔴 อ่าน SESSION_SECRET ตอนเรียก (fitness รันแบบไม่มี env) · ไม่มี/สั้นกว่า 32 ⇒ null (ไม่มีกุญแจสำรอง)
// 🔴 ห้าม log token/hash
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MANAGE_TOKEN_LABEL = "booking-manage:v1:";

/** รูปของ token ที่ออกได้ (base64url 43 ตัว) — ตรวจก่อนแตะฐาน */
export const MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function manageKey(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length < 32) return null;
  return `${MANAGE_TOKEN_LABEL}${secret}`;
}

/** token ของนัด · ไม่มีกุญแจ/ id ว่าง ⇒ null */
export function manageToken(appointmentId: string): string | null {
  const key = manageKey();
  if (!key || typeof appointmentId !== "string" || !appointmentId) return null;
  return createHmac("sha256", key).update(appointmentId).digest("base64url");
}

/** sha256 hex (ตัวเล็ก 64 ตัว) ของ token — ค่าที่เก็บใน Appointment.manageTokenHash */
export function manageTokenHash(token: string): string {
  return createHash("sha256").update(String(token)).digest("hex");
}

/** token นี้เป็นของนัด id นี้จริงไหม (คำนวณใหม่แล้วเทียบแบบ timing-safe) · ไม่มีกุญแจ ⇒ false */
export function manageTokenMatches(token: string, appointmentId: string): boolean {
  const want = manageToken(appointmentId);
  if (!want || typeof token !== "string") return false;
  const a = Buffer.from(want);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
