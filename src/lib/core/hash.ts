import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// token สุ่มยาว (magic link / session) — base64url
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// hash เก็บใน DB (ไม่เก็บ plaintext token) — SECURITY §1
export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

// OTP 6 หลัก
export function otpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * รหัสสุ่มจากชุดตัวอักษรที่กำหนด — ใช้ crypto เสมอ
 * ⚠️ ห้ามใช้ Math.random() กับรหัสที่ "ใช้ยืนยันสิทธิ์" (ตั๋วเข้างาน · โค้ดแลกรางวัล ฯลฯ)
 * เพราะ V8 ใช้ xorshift128+ — ดูผลลัพธ์ไม่กี่ค่าก็คำนวณค่าถัดไปได้ → เดารหัสคนอื่นได้
 */
export function randomCode(length: number, alphabet: string): string {
  let s = "";
  for (let i = 0; i < length; i++) s += alphabet[randomInt(0, alphabet.length)];
  return s;
}

// เทียบ hash แบบ timing-safe (กัน timing attack)
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
