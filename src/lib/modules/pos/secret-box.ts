// secret-box.ts — กล่องความลับของ POS (P3-SKEL K1 · มติ §10-8 · CD-S2) — ปิด/เปิดค่าที่เจ้าของวางจากแพลตฟอร์ม/ผู้ให้บริการ
//
// รูปแบบ (ตรงตัว — ข้อสอบเปิดกล่องเอง): "b64(iv 12 ไบต์).b64(GCM tag 16 ไบต์).b64(cipher)" · AES-256-GCM · iv สุ่มทุกครั้ง
// กุญแจ = SHA-256("pos-credentials:" + POS_CREDENTIALS_KEY) — ป้ายแยกโดเมน: กล่องของ POS เปิดด้วยกุญแจแชทไม่ได้ แม้ค่าดิบจะเท่ากัน
//   (รูปแบบเดียวกับ chat/crypto.ts แต่ **ไม่ใช่** กุญแจเดียวกัน · POS ห้าม import แชท)
// 🔴 ไม่มีกุญแจสำรองเลย (ทั้ง dev และ production): ไม่มี env = ผู้เขียน (integration-creds.ts) ปฏิเสธ NOT_CONFIGURED "ยังไม่ตั้งกุญแจ"
// 🔴 openPosSecret ไม่โยนทุกกรณี — กุญแจผิด/กล่องถูกแก้/ขยะ = null (ไม่มีค่าลับหลุด)
// 🔴 ไฟล์นี้ import ค่าได้เฉพาะ node:crypto (ข้อสอบตรวจก่อนโหลด) · ฝั่งเซิร์ฟเวอร์เท่านั้น
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** ชื่อ env ของกุญแจ — ตั้งบน prod ก่อนเจ้าของวาง credentials (W4) */
export const POS_CREDENTIALS_ENV = "POS_CREDENTIALS_KEY";
const LABEL = "pos-credentials:";
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type SecretBoxDeps = { key?: string | null };

/** กุญแจดิบของรอบนี้ — deps.key (ฉีด · null = จงใจไม่มี) ก่อน env · ว่าง = null */
export function posSecretKey(deps?: SecretBoxDeps): string | null {
  const raw = deps && Object.prototype.hasOwnProperty.call(deps, "key") ? deps.key : process.env.POS_CREDENTIALS_KEY;
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

/** ตั้งกุญแจแล้วหรือยัง (ตัวอ่าน/การ์ดตั้งค่าแสดง "ยังไม่ตั้งกุญแจ") */
export function posSecretKeyConfigured(deps?: SecretBoxDeps): boolean {
  return posSecretKey(deps) !== null;
}

const derive = (key: string): Buffer => createHash("sha256").update(`${LABEL}${key}`).digest();

/** ปิดกล่อง — ไม่มีกุญแจ = โยน (ผู้เขียนตรวจ posSecretKeyConfigured ก่อนเสมอ · ไม่มีทางเก็บค่าดิบ) */
export function sealPosSecret(obj: Record<string, unknown>, deps?: SecretBoxDeps): string {
  const key = posSecretKey(deps);
  if (!key) throw new Error("NOT_CONFIGURED: ยังไม่ตั้งกุญแจเข้ารหัส (POS_CREDENTIALS_KEY)");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", derive(key), iv);
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj ?? {}), "utf8")), c.final()]);
  return `${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

/** เปิดกล่อง — สำเร็จ = อ็อบเจกต์ · อย่างอื่นทั้งหมด (ไม่มีกุญแจ · กุญแจผิด · ถูกแก้ · ขยะ) = null · ไม่โยน */
export function openPosSecret(box: unknown, deps?: SecretBoxDeps): Record<string, unknown> | null {
  try {
    const key = posSecretKey(deps);
    if (!key || typeof box !== "string") return null;
    const parts = box.split(".");
    if (parts.length !== 3 || parts.some((p) => !B64.test(p))) return null;
    const iv = Buffer.from(parts[0]!, "base64");
    const tag = Buffer.from(parts[1]!, "base64");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv("aes-256-gcm", derive(key), iv);
    d.setAuthTag(tag);
    const plain = Buffer.concat([d.update(Buffer.from(parts[2]!, "base64")), d.final()]).toString("utf8");
    const obj: unknown = JSON.parse(plain);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
