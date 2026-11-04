// สถานะชั่วคราวของการสมัครด้วยเบอร์ (ใบ S2.12 · RESOLUTIONS §R) — อยู่ในหน่วยความจำเท่านั้น (ปิดแอป = หาย = พฤติกรรมเดิม)
// 1) ธง "เพิ่งสมัคร" ผูกกับ user.id: auth-context ตั้งหลังโหลด /me ใน signIn(token, {freshSignup}) · ล้างตอนเริ่ม signIn และใน signOut
//    ยามหน้าประตูอ่าน: มีกิจการ ⇒ /secretary/onboarding/name ครั้งเดียว (ไม่มีกิจการ ⇒ /dna ตามเดิม จนกว่า S2.21 ส่ง G1 จริง)
// 2) รหัส OTP ที่ยังใช้ได้ของเบอร์ที่ยังไม่มีบัญชี (needSignup) — ส่งต่อจากจอ OTP → /signup → /otp โดยไม่ขอรหัสใหม่ · ใช้ได้ครั้งเดียว
let freshUserId: string | null = null;
let held: { phone: string; code: string } | null = null;

export function markSignedUp(userId: string): void {
  freshUserId = userId;
}

export function isFreshSignup(userId: string | null | undefined): boolean {
  return !!userId && freshUserId === userId;
}

export function clearSignedUp(): void {
  freshUserId = null;
}

export function holdCode(phone: string, code: string): void {
  held = { phone, code };
}

export function hasHeldCode(phone: string): boolean {
  return !!held && held.phone === phone;
}

/** คืนรหัสที่ถือไว้ของเบอร์นี้แล้วลบทิ้ง (ใช้ครั้งเดียว) */
export function takeHeldCode(phone: string): string | null {
  if (!held || held.phone !== phone) return null;
  const c = held.code;
  held = null;
  return c;
}

export function dropHeldCode(): void {
  held = null;
}
