// offline-pin.ts — ตัวตรวจ PIN ออฟไลน์ของจอล็อก (POS P3.4U · มติผู้คุม 7 = มติ 8 ของบรีฟ P3.4)
// POS P3.4U ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   PBKDF2-SHA256 (WebCrypto) ≥ 310,000 รอบ · เกลือ 16 ไบต์ต่อเครื่อง (offline-store deviceSalt) · ผล 32 ไบต์ base64
//   เขียนเฉพาะตอนปลดล็อก "ออนไลน์" สำเร็จของคนที่ได้โทเคน (แทนของเดิม · ผิดนับใหม่) · ปลดออฟไลน์ได้เฉพาะคนนั้น ขณะโทเคนยังไม่หมดอายุ ·
//   ผิด 5 ครั้ง = ล็อกจนกลับมาออนไลน์ (ปลดออนไลน์ = เขียนใหม่) · ล้างพร้อมโทเคน (ออกจากระบบ/STAFF_TOKEN_INVALID)
// 🔴 ไม่เก็บ/ไม่ log ตัว PIN — มีแค่ hash · เทียบแบบเวลาคงที่ · ไม่มี WebCrypto = ไม่มีตัวตรวจ (ปลดออฟไลน์ไม่ได้ — ปลอดภัยกว่า)
import { OFFLINE_UNLOCK_ITERATIONS, OFFLINE_UNLOCK_MAX_FAILS, offlineUnlockLocked, type OfflineUnlockRecord } from "@/lib/modules/pos/offline-client-shared";
import { deviceSalt, readUnlock, wipeUnlock, writeUnlock, type OfflineDb } from "./offline-store";

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
async function derive(secret: string, salt: Uint8Array, iterations: number): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const key = await subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
    const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
    return b64(new Uint8Array(bits));
  } catch {
    return null;
  }
}
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/** ปลดล็อกออนไลน์สำเร็จ ⇒ เขียนตัวตรวจของคนนี้ (แทนของเดิมทั้งหมด · fails 0) — ล้มเงียบ (ไม่มีตัวตรวจ = ปลดออฟไลน์ไม่ได้) */
export async function rememberOfflineUnlock(db: OfflineDb, userId: string, secret: string): Promise<void> {
  try {
    const salt = await deviceSalt(db);
    const hash = await derive(secret, salt, OFFLINE_UNLOCK_ITERATIONS);
    if (!hash) return;
    await writeUnlock(db, { userId, hash, iterations: OFFLINE_UNLOCK_ITERATIONS, fails: 0 });
  } catch {
    /* เขียนไม่ได้ = ไม่มีตัวตรวจ */
  }
}
export type OfflineUnlockResult = { ok: true } | { ok: false; code: "OFFLINE_PIN_INVALID" | "OFFLINE_PIN_LOCKED" | "OFFLINE_UNLOCK_UNAVAILABLE"; left?: number };
/** ปลดล็อกออฟไลน์: เฉพาะ userId ของตัวตรวจ · ล็อกแล้ว/ไม่มีตัวตรวจ = ปฏิเสธ · ผิด = นับเพิ่ม (ครบ 5 = ล็อกจนออนไลน์) */
export async function tryOfflineUnlock(db: OfflineDb, userId: string, secret: string): Promise<OfflineUnlockResult> {
  try {
    const rec: OfflineUnlockRecord | null = await readUnlock(db);
    if (!rec || rec.userId !== userId || rec.iterations < OFFLINE_UNLOCK_ITERATIONS) return { ok: false, code: "OFFLINE_UNLOCK_UNAVAILABLE" };
    if (offlineUnlockLocked(rec)) return { ok: false, code: "OFFLINE_PIN_LOCKED" };
    const hash = await derive(secret, await deviceSalt(db), rec.iterations);
    if (hash && sameText(hash, rec.hash)) {
      if (rec.fails) await writeUnlock(db, { ...rec, fails: 0 });
      return { ok: true };
    }
    const fails = rec.fails + 1;
    await writeUnlock(db, { ...rec, fails });
    return fails >= OFFLINE_UNLOCK_MAX_FAILS ? { ok: false, code: "OFFLINE_PIN_LOCKED" } : { ok: false, code: "OFFLINE_PIN_INVALID", left: OFFLINE_UNLOCK_MAX_FAILS - fails };
  } catch {
    return { ok: false, code: "OFFLINE_UNLOCK_UNAVAILABLE" };
  }
}
/** ผู้ที่ปลดออฟไลน์ได้ตอนนี้ (มีตัวตรวจ · ยังไม่ล็อก) — null = ไม่มี */
export async function offlineUnlockHolder(db: OfflineDb): Promise<{ userId: string; locked: boolean } | null> {
  try {
    const rec = await readUnlock(db);
    return rec ? { userId: rec.userId, locked: offlineUnlockLocked(rec) } : null;
  } catch {
    return null;
  }
}
export const forgetOfflineUnlock = (db: OfflineDb) => wipeUnlock(db).catch(() => undefined);
