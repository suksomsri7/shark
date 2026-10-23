// device-cookie.ts — POS P5.2 fix device (CD-P52-O2-3 · §10.4 D1c · D1/D2/D3): คุกกี้เครื่องขายที่ลงนาม
//
// จับคู่ = registerDeviceAction เดิม (ผู้ถือ pos.device.manage ที่สาขานั้น — แคชเชียร์จับคู่ไม่ได้) ตั้งคุกกี้นี้บนเบราว์เซอร์ที่ลงทะเบียน ·
//   เปิดกะ/รายงาน X/ข้อมูลหน้ากะ อ่าน "เครื่องที่ยืนอยู่" จากคุกกี้นี้เท่านั้น (deviceId จาก client ไม่ถูกเชื่อ — D2/D3)
// รูปแบบ (ตรงตัว): "v1.<b64url(JSON claim)>.<b64url(HMAC-SHA256)>" · claim = { v:1, t: tenantId, u: unitId, d: PosDevice.id, c: deviceCode, iat: วินาที }
// กุญแจ = env POS_DEVICE_KEY (แยกจากกุญแจอื่นทั้งหมดตามมติ — ไม่ใช้กุญแจของแชท/credentials/session) ·
//   กุญแจ HMAC จริง = SHA-256("pos-device-cookie:v1:" + ค่า env) (ป้ายแยกโดเมน)
// 🔴 ไม่มีกุญแจสำรอง (ทั้ง dev และ production): env ว่าง/สั้นกว่า 32 ตัว = ยังไม่ตั้ง ⇒ จับคู่ไม่ได้ (การ์ด "ยังไม่ตั้งกุญแจ") · คุกกี้ทุกใบใช้ไม่ได้
// 🔴 verify ไม่โยนทุกกรณี — ผิดรูป/ลายเซ็นผิด/กุญแจเปลี่ยน = null · เทียบลายเซ็นแบบ timing-safe
// 🔴 ไฟล์นี้ไม่แตะ DB/next — ตรวจแถว PosDevice (ACTIVE · ร้าน · สาขา · รหัส) อยู่ที่ device.ts pairedDeviceCode · อ่าน/ตั้งคุกกี้อยู่ใน action
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** ชื่อ env ของกุญแจคุกกี้เครื่อง — ตั้งบน prod ก่อนจับคู่เครื่อง (OP · W-device) */
export const POS_DEVICE_KEY_ENV = "POS_DEVICE_KEY";
/** ความยาวขั้นต่ำของกุญแจ — เช่น `openssl rand -hex 32` = 64 ตัว */
export const POS_DEVICE_KEY_MIN = 32;
/** ชื่อคุกกี้ (httpOnly · path / · sameSite strict) */
export const POS_DEVICE_COOKIE = "shark_pos_device";
/** อายุคุกกี้ = 400 วัน (เพดานของเบราว์เซอร์) — เครื่องที่ถูกเพิกถอนใช้คุกกี้ไม่ได้ทันที (แถวต้อง ACTIVE) */
export const POS_DEVICE_COOKIE_MAX_AGE_S = 400 * 86_400;
const LABEL = "pos-device-cookie:v1:";
const B64URL = /^[A-Za-z0-9_-]+$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const CODE = /^[A-Za-z0-9_-]{8,64}$/;

export type PosDeviceClaim = { tenantId: string; unitId: string; deviceId: string; deviceCode: string; iat: number };
export type PosDeviceKeyDeps = { key?: string | null };

/** กุญแจดิบ — deps.key (ฉีด · null = จงใจไม่มี) ก่อน env · ว่าง/สั้น = null */
export function posDeviceKey(deps?: PosDeviceKeyDeps): string | null {
  const raw = !!deps && Object.prototype.hasOwnProperty.call(deps, "key") ? deps?.key : process.env[POS_DEVICE_KEY_ENV];
  return typeof raw === "string" && raw.trim().length >= POS_DEVICE_KEY_MIN ? raw : null;
}
/** ตั้งกุญแจแล้วหรือยัง (การ์ด "ยังไม่ตั้งกุญแจ" ของหน้าเครื่องขาย · registerDeviceAction ปฏิเสธเมื่อ false) */
export function posDeviceKeyConfigured(deps?: PosDeviceKeyDeps): boolean {
  return posDeviceKey(deps) !== null;
}

const macOf = (key: string, body: string): Buffer => createHmac("sha256", createHash("sha256").update(`${LABEL}${key}`).digest()).update(body).digest();

/** ลงนาม — ไม่มีกุญแจ = โยน (ผู้เรียกตรวจ posDeviceKeyConfigured ก่อนเสมอ) */
export function signPosDeviceCookie(claim: PosDeviceClaim, deps?: PosDeviceKeyDeps): string {
  const key = posDeviceKey(deps);
  if (!key) throw new Error("DEVICE_KEY_UNSET: ยังไม่ตั้งกุญแจคุกกี้เครื่อง (POS_DEVICE_KEY)");
  const payload = Buffer.from(JSON.stringify({ v: 1, t: claim.tenantId, u: claim.unitId, d: claim.deviceId, c: claim.deviceCode, iat: claim.iat }), "utf8").toString("base64url");
  return `v1.${payload}.${macOf(key, `v1.${payload}`).toString("base64url")}`;
}

/** ตรวจ — สำเร็จ = claim · อย่างอื่นทั้งหมด (ไม่มีกุญแจ · ผิดรูป · ถูกแก้ · กุญแจเปลี่ยน) = null · ไม่โยน */
export function verifyPosDeviceCookie(value: unknown, deps?: PosDeviceKeyDeps): PosDeviceClaim | null {
  try {
    const key = posDeviceKey(deps);
    if (!key || typeof value !== "string" || value.length > 1024) return null;
    const parts = value.split(".");
    if (parts.length !== 3 || parts[0] !== "v1" || !B64URL.test(parts[1]!) || !B64URL.test(parts[2]!)) return null;
    const want = macOf(key, `v1.${parts[1]}`);
    const got = Buffer.from(parts[2]!, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const o: unknown = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const r = o as Record<string, unknown>;
    if (r.v !== 1 || typeof r.t !== "string" || !ID.test(r.t) || typeof r.u !== "string" || !ID.test(r.u) || typeof r.d !== "string" || !ID.test(r.d)) return null;
    if (typeof r.c !== "string" || !CODE.test(r.c) || typeof r.iat !== "number" || !Number.isInteger(r.iat)) return null;
    return { tenantId: r.t, unitId: r.u, deviceId: r.d, deviceCode: r.c, iat: r.iat };
  } catch {
    return null;
  }
}
