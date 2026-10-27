// secret-box.ts — กล่องความลับของศูนย์เชื่อมต่อ (SVC R0.5 · CC §2.1) — ฝั่งเซิร์ฟเวอร์เท่านั้น
//
// รูปแบบ (ตรงตัว — ข้อสอบเปิดกล่องเอง): "b64(iv 12 ไบต์).b64(GCM tag 16 ไบต์).b64(cipher)" · AES-256-GCM · iv สุ่มทุกครั้ง
// กุญแจ = SHA-256("integrations:" + INTEGRATIONS_CREDENTIALS_KEY) — ป้ายแยกโดเมนจากกล่องของ POS/แชท
//   (ลอกรูปแบบจาก modules/pos/secret-box.ts — ไม่ import · ไม่ใช้กุญแจของระบบอื่นเป็นสำรอง)
// 🔴 อ่าน env ทุกครั้งที่เรียก (ไม่แคชตอนโหลดโมดูล) · ว่าง/สั้นกว่า 32 ตัว (หลัง trim) = ไม่มีกุญแจ · ไม่มีกุญแจสำรองทั้ง dev/prod
// 🔴 seal ไม่มีกุญแจ = โยน (ผู้เขียนตรวจก่อนเสมอ) · open ไม่โยนทุกกรณี — ไม่สำเร็จ = null
// 🔴 AAD (ไม่บังคับ): service ผูกกล่องกับแถวด้วย `${tenantId}:${integrationId}` — ย้ายกล่องไปแถว/ร้านอื่น = เปิดไม่ได้ (มติผู้ตรวจ R0.5 ข้อ 8)
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const INTEGRATIONS_CREDENTIALS_ENV = "INTEGRATIONS_CREDENTIALS_KEY";
export const INTEGRATIONS_CREDENTIALS_KEY_MIN = 32;
const LABEL = "integrations:";
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

function rawKey(): string | null {
  const raw = process.env[INTEGRATIONS_CREDENTIALS_ENV];
  return typeof raw === "string" && raw.trim().length >= INTEGRATIONS_CREDENTIALS_KEY_MIN ? raw : null;
}

const derive = (key: string): Buffer => createHash("sha256").update(`${LABEL}${key}`).digest();

/** ตั้งกุญแจแล้วหรือยัง (หน้าศูนย์ฯ แสดง "ยังไม่ตั้งกุญแจ" เมื่อ false) */
export function integrationSecretKeyConfigured(): boolean {
  return rawKey() !== null;
}

/** ปิดกล่อง — ไม่มีกุญแจ = โยน */
export function sealIntegrationSecret(obj: Record<string, unknown>, aad?: string): string {
  const key = rawKey();
  if (!key) throw new Error("NOT_CONFIGURED: ยังไม่ตั้งกุญแจเข้ารหัสของศูนย์เชื่อมต่อ");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", derive(key), iv);
  if (aad) c.setAAD(Buffer.from(aad, "utf8"));
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj ?? {}), "utf8")), c.final()]);
  return `${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

/** เปิดกล่อง — สำเร็จ = อ็อบเจกต์ · อย่างอื่นทั้งหมด (ไม่มีกุญแจ · กุญแจผิด · ถูกแก้ · ขยะ · ไม่ใช่ string) = null · ไม่โยน */
export function openIntegrationSecret(box: unknown, aad?: string): Record<string, unknown> | null {
  try {
    const key = rawKey();
    if (!key || typeof box !== "string") return null;
    const parts = box.split(".");
    if (parts.length !== 3 || parts.some((p) => !B64.test(p))) return null;
    const iv = Buffer.from(parts[0]!, "base64");
    const tag = Buffer.from(parts[1]!, "base64");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv("aes-256-gcm", derive(key), iv);
    if (aad) d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(tag);
    const plain = Buffer.concat([d.update(Buffer.from(parts[2]!, "base64")), d.final()]).toString("utf8");
    const obj: unknown = JSON.parse(plain);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
