// spam-guard.ts — ด่านกันสแปมของฟอร์มสาธารณะ `/f/<token>` (ใบ C2.6 · มติ C24)
//
// 🔴 ของเดิม (`checkRateLimit("form-submit:ip", 10/นาที)`) เป็นตัวนับ **ในหน่วยความจำของ instance** ⇒ บน Vercel ที่มีหลาย
//    instance บอตยิงผ่านได้สบาย ๆ · ที่นี่เปลี่ยนเป็นตัวนับบนฐาน (`checkRateLimitDb` ตัวเดียวของระบบ) — กุญแจขึ้นต้น `form:`
//    และ **ไม่มี IP ดิบ** ในกุญแจ (AUDIT-CLASS X8)
// 🔴 honeypot: บอตเห็น input แล้วกรอกทุกช่อง — คนไม่เห็น (ซ่อนจริงด้วย CSS + นอกลำดับ tab + autocomplete off)
//    กรอกมา = **ตอบว่าสำเร็จ** แต่ไม่เขียนอะไรเลย (บอกบอตว่าโดนจับ = บอตแก้แล้วยิงใหม่)
// 🔴 เวลากรอกขั้นต่ำ: หน้าฟอร์มฝัง "ตั๋วเริ่มกรอก" (HMAC ของ formId + เวลา) เป็น hidden input — ส่งภายใน 3 วินาที
//    หรือไม่มีตั๋ว/ตั๋วปลอม/ตั๋วของฟอร์มอื่น = ปฏิเสธ (ข้อความไทยที่ไม่โทษผู้ใช้)
// 🔴 ไฟล์นี้ไม่แตะ prisma (ด่าน F5.1 ของสถาปัตยกรรม) — ใช้ `checkRateLimitDb` ของ core เท่านั้น
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";

/**
 * 🔴 ชื่อช่องของด่านกันสแปม **ต้องชนกับช่องที่ร้านตั้งเองไม่ได้เด็ดขาด** (รีวิวรอบ 2 · B1)
 *    เดิมใช้ `website` / `st` ซึ่งเป็นชื่อที่ร้านตั้งได้จริง: ร้านที่มีช่อง "เว็บไซต์" (key `website`) ⇒ คำตอบจริงทุกใบ
 *    ถูกมองว่าเป็นบอต (ตอบว่าสำเร็จแต่ไม่เขียนอะไร ไม่มีแจ้งเตือน ไม่มี log) · ร้านที่มีช่อง key `st` ⇒ ส่งฟอร์มไม่ได้เลย
 *    ⇒ ใช้คำนำหน้า `_sd_` ที่ **ห้ามใช้ตั้งชื่อช่อง** (ตัวตรวจของโมดูลฟอร์มปฏิเสธตั้งแต่ตอนสร้าง/แก้ฟอร์ม)
 */
export const FORM_RESERVED_PREFIX = "_sd_";
/** ชื่อช่องหลอกบอต (ซ่อนจริงในหน้า · คนมองไม่เห็นและกด Tab ไม่เจอ) */
export const FORM_HONEYPOT_FIELD = "_sd_hp";
/** ชื่อ hidden input ของตั๋วเริ่มกรอก */
export const FORM_START_FIELD = "_sd_st";
/** ชื่อช่องที่ระบบสงวนไว้ (ตัวตรวจของฟอร์มปฏิเสธ · หน้า `/crm/settings/forms` เตือนถ้าฟอร์มเก่ามีอยู่) */
export const FORM_RESERVED_FIELD_KEYS: readonly string[] = Object.freeze([FORM_HONEYPOT_FIELD, FORM_START_FIELD]);
/** ข้อความไทยเวลาร้านตั้งชื่อช่องชนกับของระบบ (ไม่โทษผู้ใช้ · บอกทางออก) */
export const FORM_RESERVED_KEY_MSG = `ชื่อช่องที่ขึ้นต้นด้วย "${FORM_RESERVED_PREFIX}" ระบบกันสแปมสงวนไว้ — ตั้งชื่อช่องอื่นแทน เช่น website_url หรือ start_date`;
/** ชื่อช่องนี้ชนกับของระบบไหม (เทียบแบบไม่สนตัวพิมพ์ · ครอบทั้งคำนำหน้า เผื่อด่านในอนาคต) */
export const isReservedFormFieldKey = (key: unknown): boolean => {
  const k = String(key ?? "").trim().toLowerCase();
  return !!k && (k.startsWith(FORM_RESERVED_PREFIX) || FORM_RESERVED_FIELD_KEYS.includes(k));
};

export type FormSpamGuard = {
  honeypot: boolean;
  minSeconds: number;
  perIpPerMin: number;
  perFormPerMin: number;
  turnstile: boolean;
};

export const FORM_SPAM_GUARD_DEFAULTS: Readonly<FormSpamGuard> = Object.freeze({
  honeypot: true,
  minSeconds: 3,
  perIpPerMin: 10,
  perFormPerMin: 120,
  turnstile: false,
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numOr = (v: unknown, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : d;
};

/** `FormDef.spamGuard` (json ที่ร้านตั้ง) → ค่าที่ใช้จริง — ค่าเพี้ยน/ไม่ได้ตั้ง = ค่าเริ่มต้น (ไม่ throw) */
export function parseSpamGuard(raw: unknown): FormSpamGuard {
  const o = isObj(raw) ? raw : {};
  const d = FORM_SPAM_GUARD_DEFAULTS;
  return {
    honeypot: typeof o.honeypot === "boolean" ? o.honeypot : d.honeypot,
    minSeconds: numOr(o.minSeconds, d.minSeconds, 0, 120),
    perIpPerMin: numOr(o.perIpPerMin, d.perIpPerMin, 1, 1000),
    perFormPerMin: numOr(o.perFormPerMin, d.perFormPerMin, 1, 10_000),
    turnstile: o.turnstile === true,
  };
}

/** กุญแจของกุญแจ HMAC — แยกตามหน้าที่ (`form-start:v1:`) ⇒ ลายเซ็นของงานอื่นใช้ที่นี่ไม่ได้ (มติ C0.4) */
function startKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("ระบบยังไม่ได้ตั้งค่า SESSION_SECRET จึงเปิดฟอร์มสาธารณะไม่ได้ — แจ้งผู้ดูแลระบบให้ตั้งค่าก่อน");
  return `form-start:v1:${secret}`;
}

const mac = (payload: string): string => createHmac("sha256", startKey()).update(payload).digest("hex");

/** เทียบลายเซ็นแบบเวลาคงที่ (ยาวไม่เท่ากัน = ไม่ตรง — ไม่หลุดความยาวออกไปทางเวลา) */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/**
 * อายุมากสุดของตั๋วเริ่มกรอก (รีวิวรอบ 2 · S4) — เดิม 24 ชม. ทำให้ตั๋วใบเดียวยิงซ้ำได้ทั้งวัน
 * 🔴 2 ชั่วโมงพอสำหรับคนที่เปิดฟอร์มค้างไว้แล้วกลับมากรอก · นานกว่านั้นให้เปิดหน้าใหม่ (ได้ตั๋วใหม่)
 */
export const FORM_START_MAX_AGE_MS = 2 * 3_600_000;

/**
 * ตั๋ว "เริ่มกรอกฟอร์มนี้เมื่อไหร่" — `<เวลา ms>.<nonce>.<hmac>` (ไม่มีข้อมูลผู้กรอกอยู่ในตั๋ว)
 * 🔴 `nonce` = เลขสุ่มของตั๋วใบนั้น ⇒ ใช้ได้ **ครั้งเดียว** (`consumeFormStartToken`) — บอตที่ขโมยตั๋วจากหน้าเว็บ
 *    ไปยิงซ้ำ ๆ จะผ่านได้ใบแรกใบเดียว (เดิมตั๋วใบเดียวยิงได้ไม่จำกัดตลอด 24 ชม.)
 */
export function issueFormStartToken(formId: string, now: Date = new Date()): string {
  const at = String(now.getTime());
  const nonce = randomBytes(9).toString("base64url");
  return `${at}.${nonce}.${mac(`${String(formId ?? "")}.${at}.${nonce}`)}`;
}

/** ตรวจตั๋ว — คืนอายุ (วินาที) + nonce ของตั๋วใบนั้น · ตั๋วปลอม/ของฟอร์มอื่น/เก่าเกิน/ไม่มี = null */
export function readFormStartToken(token: unknown, formId: string, now: Date = new Date()): { ageSec: number; nonce: string } | null {
  const s = typeof token === "string" ? token.trim() : "";
  if (!s || s.length > 200) return null;
  const parts = s.split(".");
  if (parts.length !== 3) return null;
  const [at, nonce, sig] = parts as [string, string, string];
  if (!/^\d{10,16}$/.test(at) || !/^[A-Za-z0-9_-]{8,40}$/.test(nonce)) return null;
  if (!safeEqualHex(sig, mac(`${String(formId ?? "")}.${at}.${nonce}`))) return null;
  const ageMs = now.getTime() - Number(at);
  if (ageMs > FORM_START_MAX_AGE_MS) return null; // ตั๋วเก่าเกิน = หน้าที่เปิดค้างไว้ (ให้เปิดใหม่)
  return { ageSec: ageMs < 0 ? 0 : Math.floor(ageMs / 1000), nonce };
}

/** กุญแจ "ตั๋วใบนี้ถูกใช้ไปแล้ว" — เก็บแค่ค่าแฮชของ nonce (ไม่มีตัวตั๋วจริงอยู่ในฐาน) */
export const formStartNonceKey = (nonce: string): string => `form:st:${createHash("sha256").update(String(nonce ?? "")).digest("hex").slice(0, 40)}`;

/** กุญแจถังของฟอร์ม — ขึ้นต้น `form:` เสมอ และ **ไม่มี IP ดิบ** (รับมาเป็น hash แล้ว) */
export const formIpLimitKey = (ipHash: string): string => `form:ip:${String(ipHash ?? "").slice(0, 40)}`;
export const formLimitKey = (formId: string): string => `form:f:${String(formId ?? "")}`;

export type FormLimiter = (key: string, spec: { limit: number; windowMs: number }) => Promise<{ ok: boolean }>;

/** ตัวนับบนฐาน (ค่าปริยาย) — ผู้เรียกฉีดตัวอื่นได้เฉพาะในข้อสอบ */
export const dbFormLimiter: FormLimiter = (key, spec) => checkRateLimitDb(key, spec);

/**
 * ใช้ตั๋วหนึ่งใบ — `true` = ยังไม่เคยถูกใช้ (ใช้ได้) · `false` = เคยใช้ไปแล้ว
 * 🔴 ตัวนับบนฐานคำสั่งเดียว (limit 1) ⇒ ยิงพร้อมกันสิบครั้งด้วยตั๋วใบเดียว ผ่านได้ใบเดียวเสมอ
 * 🔴 ผู้เรียกต้องเรียก **หลัง** ด่านอื่นผ่านหมดและก่อนเขียนคำตอบ — ไม่งั้นคำตอบที่กรอกไม่ครบจะเผาตั๋วทิ้งฟรี
 */
export async function consumeFormStartToken(nonce: string, limiter: FormLimiter = dbFormLimiter): Promise<boolean> {
  const r = await limiter(formStartNonceKey(nonce), { limit: 1, windowMs: FORM_START_MAX_AGE_MS });
  return r.ok;
}


/**
 * เพดานความถี่ของการส่งฟอร์ม: ต่อ IP (hash) และต่อฟอร์ม — เต็มอันใดอันหนึ่ง = ปฏิเสธ (ไม่เขียนอะไร)
 * AUDIT-CLASS X3: `checkRateLimitDb` จบในคำสั่ง SQL เดียว ⇒ ยิงพร้อมกันได้ตัวเลขที่ถูกต้อง
 */
export async function checkFormRate(
  formId: string,
  ipHash: string,
  guard: FormSpamGuard,
  limiter: FormLimiter = dbFormLimiter,
): Promise<boolean> {
  const ip = await limiter(formIpLimitKey(ipHash), { limit: guard.perIpPerMin, windowMs: 60_000 });
  if (!ip.ok) return false;
  const form = await limiter(formLimitKey(formId), { limit: guard.perFormPerMin, windowMs: 60_000 });
  return form.ok;
}

/**
 * ตรวจ Turnstile กับ Cloudflare — เรียกเฉพาะเมื่อร้านเปิด **และ** มีกุญแจใน env (อ่านตอนเรียก ไม่ใช่ตอน import)
 * 🔴 ไม่มีกุญแจ = ไม่บังคับ (ร้านที่เผลอเปิดสวิตช์ไว้ต้องไม่ส่งฟอร์มไม่ได้ทั้งร้าน)
 */
export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: String(token ?? ""), remoteip: String(ip ?? "") }).toString(),
    });
    const json = (await res.json()) as { success?: boolean };
    return json?.success === true;
  } catch {
    return false;
  }
}
