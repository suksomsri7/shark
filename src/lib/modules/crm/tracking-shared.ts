// tracking-shared.ts — ค่าคงที่/ตัวช่วยบริสุทธิ์ของการติดตามเว็บ (ใบ C2.6 · มติ C6/C24 · พิมพ์เขียว §5.7 · §11.7)
//
// 🔴 ไฟล์บริสุทธิ์ (client-safe): ห้าม import prisma / `@/lib/core/db` / `./db` / `./tracking` / `next/*` / server-only
//    — หน้าจอ 'use client' และสคริปต์ที่เสิร์ฟให้เว็บของร้านใช้ค่าชุดเดียวกับฝั่งเซิร์ฟเวอร์
// 🔴 ตัวกรอง "นี่คือเครื่อง ไม่ใช่คน" มี **เครื่องเดียว** ในระบบ (`isTrackingBot` ของใบ C2.5) — ที่นี่แค่ re-export
//    (สองตัวกรองที่วันหนึ่งไม่ตรงกัน = ตัวเลขในรายงานของร้านสองหน้าไม่เท่ากันโดยไม่มีใครรู้)
import { isTrackingBot } from "./emails-shared";

/** เพดานขนาด body ของ `/t/e` · `/t/consent` (ไบต์) — เกินนี้ = ไม่อ่าน ไม่เขียน */
export const TRACKING_PAYLOAD_MAX_BYTES = 8192;
/** คุกกี้ผู้เข้าชม (first-party · สคริปต์ต้องอ่านได้ ⇒ ไม่มี HttpOnly) */
export const VISITOR_COOKIE = "sd_vid";
/** คุกกี้คำตอบเรื่องคุกกี้ (ยอมรับ/ปฏิเสธ/ถอน + เวอร์ชัน) */
export const CONSENT_COOKIE = "sd_consent";
/** อายุคุกกี้ 180 วัน (วินาที) */
export const VISITOR_COOKIE_MAX_AGE_SEC = 15_552_000;
/** เงียบเกินเท่านี้ = การเข้าชมรอบใหม่ (30 นาที) */
export const WEB_SESSION_IDLE_MS = 1_800_000;
/** ระบุตัวตนย้อนหลังได้ไกลสุด (วัน) */
export const IDENTIFY_LOOKBACK_DAYS = 180;
/**
 * เพดานอายุของตั๋วระบุตัวตนตามสัญญาของใบนี้ (1 ชั่วโมง) — ตั๋วที่เก่ากว่านี้ใช้ไม่ได้แน่นอน
 * 🔴 ค่าที่ **ใช้จริง** คือ `IDENTIFY_TICKET_MAX_AGE_MS` (15 นาที · รีวิวรอบ 2 ข้อ S2) ซึ่งเข้มกว่าเพดานนี้
 */
export const IDENTIFY_TICKET_TTL_MS = 3_600_000;
/**
 * อายุจริงของตั๋วระบุตัวตน (15 นาที) + ใช้ได้ **ครั้งเดียว** (รีวิวรอบ 2 · S2)
 * 🔴 ตั๋วอยู่ใน url ของหน้าที่ลูกค้าเปิดจากอีเมล ⇒ มันรั่วได้ง่ายมาก (ประวัติเบราว์เซอร์ · ลิงก์ที่ส่งต่อ · referrer)
 *    ใครถือตั๋วก็ผูก "ผู้เข้าชมของฉัน" เข้ากับลูกค้าคนนั้นได้ ⇒ อายุสั้น + ใช้ครั้งเดียว (มี jti ที่ถูกเผาเมื่อใช้)
 */
export const IDENTIFY_TICKET_MAX_AGE_MS = 900_000;
/** คุกกี้ "คลิกนี้เคยนับเป็นคนใหม่แล้ว" ของ `/l/<code>` (ไม่ระบุตัวตน — ค่าเป็น 1 เสมอ) */
export const LINK_UNIQUE_COOKIE = "sd_u";
/** อายุคุกกี้ sd_u (1 ปี) */
export const LINK_UNIQUE_MAX_AGE_SEC = 31_536_000;
/** รหัสลิงก์ย่อ: ตัวอักษร/ตัวเลข/ขีด 6–32 ตัว (ลิงก์ที่พิมพ์ลงกระดาษต้องพิมพ์ตามได้) */
export const LINK_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{5,31}$/;
/** ปลายทางของ `/l/<code>` ที่ไม่รู้จัก/ปิด/หมดอายุ — **คำตอบเดียวกันทุกกรณี** (ไม่มีเครื่องเดารหัส) */
export const LINK_FALLBACK_URL = "https://shark.in.th/";
/** ที่อยู่สาธารณะของแอป เมื่อ `APP_URL` เป็น localhost (สคริปต์ที่ฝังบนเว็บร้านต้องยิงกลับด้วย https เสมอ) */
export const APP_PUBLIC_ORIGIN = "https://shark.in.th";
/** ความยาว siteKey ที่สร้างใหม่ (ตัวระบุสาธารณะ ไม่ใช่ความลับ) */
export const SITE_KEY_LENGTH = 16;
/** โดเมนที่อนุญาตต่อระบบ (สูงสุด) */
export const TRACKING_MAX_DOMAINS = 20;
/** อายุการเก็บข้อมูลการเข้าชม (วัน) */
export const RETENTION_MIN_DAYS = 30;
export const RETENTION_MAX_DAYS = 730;
export const RETENTION_DEFAULT_DAYS = 180;
/** ลิงก์ติดตามต่อระบบ (สูงสุด) */
export const LINK_MAX_PER_SYSTEM = 1000;
/** ความยาวข้อความ cookie consent */
export const CONSENT_TEXT_MAX = 2000;
/** ความยาว url ที่เก็บได้ */
export const TRACKED_URL_MAX = 2048;

/**
 * เพดานความถี่ของทางสาธารณะ (ผ่าน `checkRateLimitDb` ตัวเดียวของระบบ · กุญแจขึ้นต้น `crm:` และไม่มี IP ดิบ)
 * 🔴 ต่อ IP ต้องพอให้คนอ่านเว็บจริง ๆ (เปิดหลายหน้าติดกัน) แต่ไม่พอให้ยิงถล่ม · ต่อเว็บไซต์ตั้งสูงกว่ามาก
 *    (ร้านที่คนเข้าเยอะต้องไม่ถูกตัดข้อมูลทิ้งเพราะเพดานของตัวเอง)
 */
export const TRACKING_RATE_LIMITS: Readonly<Record<"collectPerIp" | "collectPerSite" | "consentPerIp" | "linkPerIp", { limit: number; windowMs: number }>> = Object.freeze({
  collectPerIp: Object.freeze({ limit: 60, windowMs: 60_000 }),
  collectPerSite: Object.freeze({ limit: 5000, windowMs: 60_000 }),
  consentPerIp: Object.freeze({ limit: 30, windowMs: 60_000 }),
  linkPerIp: Object.freeze({ limit: 30, windowMs: 60_000 }),
});

/** ชนิดของการระบุตัวตน (คอลัมน์ `CrmWebSession.identifiedBy`) */
export const IDENTIFY_BY = ["FORM", "EMAIL_CLICK", "PORTAL", "LINK"] as const;
export type IdentifyBy = (typeof IDENTIFY_BY)[number];
export const isIdentifyBy = (v: unknown): v is IdentifyBy => typeof v === "string" && (IDENTIFY_BY as readonly string[]).includes(v);

/**
 * AUDIT-CLASS X7: UA นี้เป็นเครื่อง (ตัวสแกนลิงก์ · ตัวดึงพรีวิว · เครื่องมือบรรทัดคำสั่ง) ไหม
 * 🔴 ตัวกรองเดียวกับที่ใบ C2.5 ใช้นับ "เปิดอ่าน/คลิก" — ห้ามเขียนชุดที่สอง
 */
export const isBotUserAgent = (ua: unknown): boolean => isTrackingBot(ua);

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

/**
 * AUDIT-CLASS X8: url ที่เก็บได้ — http/https เท่านั้น · เก็บ **เฉพาะ** พารามิเตอร์ `utm_*` · ตัด `#fragment` · ยาวไม่เกิน 2048
 * 🔴 หน้าเว็บของร้านมักพ่วง token/อีเมลลูกค้ามาใน query (`?email=…&token=…`) — เก็บทั้งดุ้น = เก็บข้อมูลส่วนตัวโดยไม่ตั้งใจ
 */
export function cleanTrackedUrl(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s.length > TRACKED_URL_MAX * 2) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const scheme = u.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") return null;
  if (!u.hostname) return null;
  const keep = new URLSearchParams();
  for (const k of UTM_PARAMS) {
    const v = u.searchParams.get(k);
    if (v !== null && v !== "") keep.set(k, v.slice(0, 200));
  }
  u.search = keep.toString() ? `?${keep.toString()}` : "";
  u.hash = "";
  const out = u.toString();
  return out.length > TRACKED_URL_MAX ? out.slice(0, TRACKED_URL_MAX) : out;
}

/** utm ของ url (เฉพาะคีย์ที่มีค่า) — ไม่มีเลย = null */
export function utmOf(raw: unknown): Record<string, string> | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const out: Record<string, string> = {};
  for (const k of UTM_PARAMS) {
    const v = u.searchParams.get(k);
    if (v) out[k.slice(4)] = v.slice(0, 200);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** ที่มา (referrer) ที่เก็บได้ — ตัด query/fragment ทิ้งทั้งหมด (คำค้นของลูกค้าไม่ใช่ข้อมูลของร้าน) */
export function cleanReferrer(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.origin}${u.pathname}`.slice(0, TRACKED_URL_MAX);
  } catch {
    return null;
  }
}

/**
 * ชื่อโดเมนล้วน ๆ ตัวพิมพ์เล็ก (ไม่มี scheme/path/port/ดอกจัน/IP) — ผิดแบบ = null
 * 🔴 ปล่อย `*` หรือ `*.x.com` ผ่าน = ใครก็เอา siteKey ของร้านไปวางบนเว็บตัวเองแล้วยิงข้อมูลเข้ามาได้
 */
export function normalizeDomain(input: unknown): string | null {
  const s = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!s || s.length > 253) return null;
  if (/[\s/\\:*?#@]/.test(s)) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return null;
  if (/^\d+(\.\d+)*$/.test(s)) return null; // IPv4 ล้วน
  const tld = s.split(".").pop() ?? "";
  if (!/^[a-z]{2,}$/.test(tld)) return null;
  return s;
}

/**
 * AUDIT-CLASS X7: Origin นี้อยู่ในโดเมนที่ร้านอนุญาตไหม — **https เท่านั้น** · host ตรงตัว หรือเป็นโดเมนย่อยจริง ๆ
 * 🔴 `evil-shop.example.com.attacker.test` และ `xshop.example.com` ต้องไม่ผ่าน (เทียบท้ายสตริงเฉย ๆ = รั่ว)
 */
export function originAllowed(origin: unknown, domains: readonly string[]): boolean {
  const s = typeof origin === "string" ? origin.trim() : "";
  if (!s || !Array.isArray(domains) || domains.length === 0) return false;
  let host: string;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((d) => {
    const dom = typeof d === "string" ? d.trim().toLowerCase() : "";
    return !!dom && (host === dom || host.endsWith(`.${dom}`));
  });
}

/** host ของ url อยู่ในโดเมนที่อนุญาตไหม (ใช้กับ `u` ที่สคริปต์ส่งมา — https/http ก็ได้ ตัว scheme ถูกตรวจที่ Origin แล้ว) */
export function urlHostAllowed(url: unknown, domains: readonly string[]): boolean {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return domains.some((d) => {
      const dom = typeof d === "string" ? d.trim().toLowerCase() : "";
      return !!dom && (host === dom || host.endsWith(`.${dom}`));
    });
  } catch {
    return false;
  }
}

/** ที่อยู่สาธารณะของแอปที่สคริปต์บนเว็บร้านจะยิงกลับ — ต้องเป็น https เสมอ (http://127.0.0.1 ของเครื่องทดสอบ = ใช้ค่าสาธารณะ) */
export function publicAppOrigin(appUrl: unknown): string {
  const s = typeof appUrl === "string" ? appUrl.trim().replace(/\/+$/, "") : "";
  if (/^https:\/\//i.test(s)) {
    try {
      return new URL(s).origin;
    } catch {
      return APP_PUBLIC_ORIGIN;
    }
  }
  return APP_PUBLIC_ORIGIN;
}

/** uuid v4 ที่สคริปต์ส่งมาเป็นรหัสผู้เข้าชม — รูปไม่ตรง = ทิ้ง (ไม่สร้างแถวจากค่าที่ควบคุมไม่ได้) */
export const isVisitorId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

/** วันไทย (YYYY-MM-DD) ของเวลานี้ — กิจกรรม "1 รายการต่อวัน" นับตามวันของร้าน ไม่ใช่วัน UTC */
export function thaiDayKey(at: Date): string {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** เดือนไทย (YYYY-MM) — เกลือของ ipHash เปลี่ยนทุกเดือน */
export function thaiMonthKey(at: Date): string {
  return thaiDayKey(at).slice(0, 7);
}

/** ข้อความ/ค่าที่ฝังลงตัวสคริปต์ได้อย่างปลอดภัย (ปิด `</script`, U+2028/2029, และอักขระควบคุม) */
export function jsLiteral(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
    .replace(/&/g, "\\u0026");
}
