// ปลายทางหลังสมัครด้วยเบอร์ครั้งแรก (ใบ S2.12) — จอ OTP ตั้งธงก่อน signIn · ยามหน้าประตู (app/_layout.tsx) อ่านธงแล้วพาไป:
//   ไม่มีกิจการ ⇒ /business/new (G1 · แทน /dna เฉพาะคนเพิ่งสมัคร) · มีกิจการ ⇒ /secretary/onboarding/name (C1) แล้วล้างธง
// ธงอยู่ในหน่วยความจำเท่านั้น — ปิดแอปแล้วเปิดใหม่ = พฤติกรรมเดิม (/dna เมื่อไม่มีกิจการ)
let pending = false;

export function markSignedUp(): void {
  pending = true;
}

export function isFreshSignup(): boolean {
  return pending;
}

export function clearSignedUp(): void {
  pending = false;
}
