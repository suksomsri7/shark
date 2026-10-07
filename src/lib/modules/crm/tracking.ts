// tracking.ts — ลิงก์ติดตาม · สคริปต์เว็บ (shark.js) + คุกกี้ consent · การเก็บการเข้าชม · ระบุตัวตน · ล้างตามอายุ
//   (ใบ C2.6 · มติ C6 + C24 · พิมพ์เขียว §5.7 · §11.7 · ภาพ 11 + 16 · RESOLUTIONS R-A/R-C.7/R-E.14/R-E.16)
//
// 🔴 ลำดับด่านของทุกฟังก์ชันฝั่งพนักงาน: ระบบ CRM ของร้านนี้จริง (ไม่ใช่ = NOT_FOUND) → `assertCrmV2` (uiVersion 1 =
//    CrmV2DisabledError · ไม่เขียนอะไร) → คีย์ `crm.tracking.manage` (`access.ts`) → การมองเห็น (ไทม์ไลน์)
// 🔴 AUDIT-CLASS X8 (PDPA): ไม่มี IP ดิบอยู่ที่ไหนเลย — เก็บ `ipHash` (HMAC + เกลือรายเดือนไทย) · url เก็บเฉพาะ `utm_*`
//    · referrer ตัด query · สคริปต์ที่เสิร์ฟ **ไม่อ่านค่าในฟอร์มของลูกค้า** · payload ของ event เป็น id ล้วน
// 🔴 AUDIT-CLASS X7: ทางสาธารณะทุกเส้น (`/l` `/t/e` `/t/consent` `/t/s`) ตอบเหมือนกันทุกไบต์ไม่ว่าจะรู้จักหรือไม่รู้จัก
//    — ไม่มีเครื่องมือเดารหัสลิงก์/siteKey/token ของร้านอื่น
// 🔴 AUDIT-CLASS X6: ปลายทางของ `/l/<code>` มาจากแถวในฐานเท่านั้น (พารามิเตอร์ในคำขอไม่มีทางเปลี่ยนได้) และ url ที่รับ
//    ตอนสร้างต้องเป็น http/https จริง ๆ (javascript:/data:/`//host`/backslash ถูกปฏิเสธ)
//    + CRM C6.1-LINKPOLICY (มติเจ้าของ P11/Q15 ข้อ ข): host ปลายทางต้องอยู่ใน "โดเมนปลายทางที่อนุญาต" ของร้าน
//    (`settings.crm.tracking.linkHosts`) หรือเว็บของร้านในส่วนติดตามเว็บ หรือโดเมนของแพลตฟอร์มเอง — ตรวจตอนสร้าง/แก้ และตอนพาไปทุกครั้ง
// 🔴 AUDIT-CLASS X3: ตัวนับทุกตัว (clicks · uniqueClicks · pageViews) จบใน **คำสั่ง SQL เดียว** พร้อมแถวเหตุการณ์
//    (CTE) — ยิงพร้อมกันพันครั้งต้องได้พันพอดี
// 🔴 AUDIT-CLASS X4: ระบุตัวตนซ้ำ/ขนานกัน = ผูกครั้งเดียว · กิจกรรม WEB 1 รายการต่อ "วันไทย" · event 1 ใบ
//    (advisory lock ต่อผู้เข้าชม + ต่อ (ผู้ติดต่อ, วัน))
// 🔴 AUDIT-CLASS X5: `purgeWeb` วิ่งซ้อนกันได้ (DELETE/UPDATE แบบมีเงื่อนไข + RETURNING ⇒ รอบที่สองได้ 0)
// 🔴 AUDIT-CLASS X1: ทุกคิวรีผูก tenantId + systemId ที่ resolve แล้ว · ผู้เข้าชมรหัสเดียวกันบนคนละร้าน = คนละชุด session
// 🔴 AUDIT-CLASS X9: ลบลิงก์ต้องยืนยัน + เหตุผล ≥ 5 ตัวอักษร · ทุกการเปลี่ยนแปลงมีแถว AuditLog
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import type { MemberActor } from "@/lib/modules/member";
import { checkRateLimitDb, rateBucketCte } from "@/lib/core/rate-limit-db";
import { emitOutbox } from "@/lib/core/outbox";
import { wakeOutbox } from "./outbox-wake"; // CRM C5.5-fix13 ▸ P-it5-2 sweep ◂
import { writeAudit } from "@/lib/core/audit";
import { logOps } from "@/lib/core/ops";
import { prisma } from "./db";
import { assertCrmLimit } from "./limits"; // CRM C3.9 ▸ เพดานลิงก์ติดตาม ◂
import { assertCanCrm } from "./access";
import { assertCrmV2 } from "./ui-version";
import { parseCrmSettings } from "./settings";
import { contactWhere } from "./where";
import { recordSystemActivityInTx } from "./activities";
import {
  CONSENT_TEXT_MAX,
  IDENTIFY_LOOKBACK_DAYS,
  IDENTIFY_TICKET_MAX_AGE_MS,
  LINK_CODE_RE,
  LINK_MAX_PER_SYSTEM,
  LINK_UNIQUE_MAX_AGE_SEC,
  RETENTION_DEFAULT_DAYS,
  RETENTION_MAX_DAYS,
  RETENTION_MIN_DAYS,
  SITE_KEY_LENGTH,
  TRACKED_URL_MAX,
  TRACKING_MAX_DOMAINS,
  TRACKING_PAYLOAD_MAX_BYTES,
  TRACKING_RATE_LIMITS,
  WEB_SESSION_IDLE_MS,
  cleanReferrer,
  cleanTrackedUrl,
  isBotUserAgent,
  isIdentifyBy,
  APP_PUBLIC_HOST,
  isDestinationBlocklisted,
  isVisitorId,
  jsLiteral,
  LINK_HOSTS_MAX,
  linkDestinationVerdict,
  normalizeDomain,
  normalizeLinkHost,
  originAllowed,
  publicAppOrigin,
  thaiDayKey,
  thaiMonthKey,
  urlHostAllowed,
  utmOf,
  type IdentifyBy,
  type LinkDestinationVerdict,
} from "./tracking-shared";

// ค่าคงที่ที่ route สาธารณะต้องใช้ — route แตะโมดูลได้ทางเดียวคือ facade (`@/lib/modules/crm`) ตามด่าน F2.3
export { LINK_FALLBACK_URL, TRACKING_PAYLOAD_MAX_BYTES, VISITOR_COOKIE, CONSENT_COOKIE, cleanTrackedUrl, cleanReferrer, headerSafeLocation } from "./tracking-shared";

type Tx = Prisma.TransactionClient;
type Json = Prisma.InputJsonValue;
const TX_OPTS = { timeout: 20_000, maxWait: 15_000 } as const;
const DAY_MS = 86_400_000;

export type TrackingCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
export type TrackingErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFIRM_REQUIRED";

/** error ของบริการนี้ — `.code` + ข้อความไทยที่ไม่โทษผู้ใช้ (ผู้เรียก/หน้าจอแปลงเป็นข้อความ inline) */
export class TrackingError extends Error {
  readonly code: TrackingErrorCode;
  constructor(code: TrackingErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "TrackingError";
  }
}
const fail = (code: TrackingErrorCode, message: string) => new TrackingError(code, message);
/** ข้อความเดียวของ "ไม่พบลิงก์" — ลิงก์ของระบบอื่น/ร้านอื่นต้องได้ข้อความเดียวกับ id มั่ว (X1) */
const LINK_404 = "ไม่พบลิงก์ติดตามนี้ในระบบ — อาจถูกลบไปแล้ว ลองรีเฟรชหน้ารายการอีกครั้ง";
const CONTACT_404 = "ไม่พบผู้ติดต่อรายนี้ในระบบ — อาจถูกย้ายหรือลบไปแล้ว";
const FORM_404 = "ไม่พบฟอร์มนี้ในร้าน — ลองรีเฟรชหน้ารายการฟอร์มอีกครั้ง";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** ที่อยู่เว็บของแอป — อ่าน `process.env` ตรง ๆ (ห้ามลาก `@/lib/env` เข้ากราฟของ facade CRM) */
function appUrl(): string {
  const raw = str(process.env.APP_URL) || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
/**
 * ที่อยู่ที่ "สคริปต์บนเว็บของร้าน" ยิงกลับ
 * - production (`APP_ENV=production`): https เสมอ — `APP_URL` ที่ไม่ใช่ https ถูกแทนด้วยโดเมนสาธารณะ (พฤติกรรมเดิม)
 * - นอก production (dev · QC · preview): origin ของ `APP_URL` ของสภาพแวดล้อมนั้นเอง — CRM C5.4-F ▸ C4.4-I2: หน้า QC/dev
 *   ต้องไม่มีวันยิงเหตุการณ์ติดตามเข้า shark.in.th ตัวจริง (เดิม APP_URL=http://127.0.0.1:… ⇒ สคริปต์ยิงไป prod) ◂
 */
export const trackerOrigin = (): string => {
  if (str(process.env.APP_ENV) === "production") return publicAppOrigin(appUrl());
  try {
    const u = new URL(appUrl());
    // origin "null" (scheme แปลก) / ไม่ใช่ http(s) = ตั้งค่าผิด ⇒ ค่าปลอดภัยของเครื่อง dev (ไม่ใช่ shark.in.th) · hunt INFO
    if ((u.protocol === "http:" || u.protocol === "https:") && u.origin !== "null") return u.origin;
  } catch {
    /* ตกไปค่าปลอดภัย */
  }
  return "http://localhost:3000";
};

// ───────────────────────── กุญแจ/แฮช (แยกตามหน้าที่ — มติ C0.4) ─────────────────────────

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("ระบบยังไม่ได้ตั้งค่า SESSION_SECRET จึงเปิดการติดตามเว็บไม่ได้ — แจ้งผู้ดูแลระบบให้ตั้งค่าก่อน");
  return s;
}

/**
 * AUDIT-CLASS X8: ตัวแทนของ IP ที่เก็บได้ — HMAC-SHA256 ด้วยกุญแจ `crm-ip:v1:<SESSION_SECRET>` + **เกลือรายเดือน (เดือนไทย)**
 * 🔴 เกลือรายเดือน = ตารางสายรุ้งของ IPv4 ทั้งโลกที่ทำไว้เดือนก่อนใช้กับเดือนนี้ไม่ได้ · และค่าไม่เท่ากับ sha256(ip) เปล่า ๆ
 */
export function ipHashFor(ip: string, now: Date = new Date()): string {
  const key = `crm-ip:v1:${sessionSecret()}`;
  return createHmac("sha256", `${key}:${thaiMonthKey(now)}`).update(String(ip ?? "")).digest("hex");
}

/** กุญแจ AES ของตั๋วระบุตัวตน (32 ไบต์) — โดเมนแยกด้วยคำนำหน้า `crm-identify:v1:` */
function identifyKey(): Buffer {
  return createHmac("sha256", `crm-identify:v1:${sessionSecret()}`).update("aead").digest();
}

/** เทียบไบต์แบบเวลาคงที่ */
function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !a) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

type TicketPayload = { t: string; s: string; c: string; e: string; x: number; j: string };

/**
 * ตั๋ว "คนนี้คือผู้ติดต่อคนไหน" ที่ `/t/c` ต่อท้ายลิงก์ในอีเมล (AUDIT-CLASS X7)
 * 🔴 **ทึบแสง**: เนื้อในถูกเข้ารหัส AES-256-GCM ⇒ ถอด base64 แล้วก็ยังไม่เห็น contactId/emailId/อีเมล
 *    (ถ้าใส่ id ดิบลงไป ใครก็แก้ค่าแล้วผูก "ผู้เข้าชมของฉัน" เข้ากับลูกค้าคนอื่นของร้านได้)
 * 🔴 ป้ายกำกับ + tag ของ GCM ถูกตรวจแบบเวลาคงที่โดยตัวไลบรารี · หมดอายุใน 1 ชั่วโมง · ผูกกับระบบที่ออกให้
 */
export function emailClickTicket(input: { tenantId: string; systemId: string; emailId: string; contactId: string }, now: Date = new Date()): string {
  const payload: TicketPayload = {
    t: String(input?.tenantId ?? ""),
    s: String(input?.systemId ?? ""),
    c: String(input?.contactId ?? ""),
    e: String(input?.emailId ?? ""),
    x: now.getTime() + IDENTIFY_TICKET_MAX_AGE_MS,
    // AUDIT-CLASS X7 (รีวิวรอบ 2 · S2): เลขประจำตั๋ว — ถูก "เผา" ตอนใช้ ⇒ ตั๋วใบเดิมใช้ซ้ำไม่ได้แม้ยังไม่หมดอายุ
    j: randomBytes(12).toString("base64url"),
  };
  return sealTicket(identifyKey(), payload);
}

// CRM C4.4-fix3 ▸ ตัวผนึก/ตัวเปิดตั๋ว AES-256-GCM ชุดเดียวของทั้งไฟล์ (รูปแบบ iv 12 ไบต์ | tag 16 ไบต์ | เนื้อ · base64url)
//   ตั๋วอีเมล (`crm-identify:v1:`) และตั๋วผู้เข้าชม (`crm-visitor-ticket:v1:`) ใช้ตัวเดียวกันแต่ **คนละกุญแจ** ⇒ ตั๋วชนิดหนึ่ง
//   เปิดด้วยกุญแจของอีกชนิดไม่ได้ (GCM ปฏิเสธ) — ใช้ข้ามทางกันไม่ได้แม้เนื้อในจะหน้าตาคล้ายกัน ◂
function sealTicket(key: Buffer, payload: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

/** เปิดตั๋ว — ปลอม/แก้/ผิดกุญแจ/รูปแบบเพี้ยน = null (ไม่บอกว่าเพราะอะไร) */
function openTicket(key: Buffer, ticket: unknown): Record<string, unknown> | null {
  const s = str(ticket);
  if (!s || s.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const raw = Buffer.from(s, "base64url");
    if (raw.length < 12 + 16 + 2) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const p = JSON.parse(json) as unknown;
    return isObj(p) ? p : null;
  } catch {
    return null;
  }
}

/** อ่านตั๋ว — ปลอม/แก้/หมดอายุ/ของระบบอื่น = null (ไม่บอกว่าเพราะอะไร) */
export function readIdentifyTicket(ticket: unknown, expect: { tenantId: string; systemId: string }, now: Date = new Date()): TicketPayload | null {
  try {
    const p = openTicket(identifyKey(), ticket) as TicketPayload | null;
    if (!p) return null;
    if (!isObj(p) || typeof p.x !== "number" || p.x < now.getTime()) return null;
    if (typeof p.j !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(p.j)) return null; // ตั๋วรุ่นเก่า (ไม่มี jti) ใช้ไม่ได้
    if (!safeEqualHex(String(p.t ?? ""), String(expect.tenantId ?? "")) || !safeEqualHex(String(p.s ?? ""), String(expect.systemId ?? ""))) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * "เผา" ตั๋วหนึ่งใบ — `true` = ยังไม่เคยถูกใช้ (ผูกได้) · `false` = เคยใช้ไปแล้ว (เงียบ ไม่ผูกอะไร)
 * 🔴 ตัวนับบนฐานคำสั่งเดียว (limit 1 · หน้าต่างเท่าอายุตั๋ว) ⇒ ยิงพร้อมกันสิบครั้งด้วยตั๋วใบเดียว ผ่านได้ใบเดียว
 * 🔴 เก็บแค่ค่าแฮชของ jti (ไม่มีชิ้นส่วนของตั๋วจริงอยู่ในฐาน) · กุญแจขึ้นต้น `crm:` ตามกติกาของใบนี้
 */
export async function consumeIdentifyTicket(jti: string, limiter?: (key: string, spec: { limit: number; windowMs: number }) => Promise<{ ok: boolean }>): Promise<boolean> {
  const key = `crm:tkt:${createHash("sha256").update(String(jti ?? "")).digest("hex").slice(0, 40)}`;
  const run = limiter ?? ((k: string, spec: { limit: number; windowMs: number }) => checkRateLimitDb(k, spec));
  // CRM C4.4-fix3 r2 ▸ (review N2) หน้าต่างการเผา = อายุตั๋ว + 2 นาที — ตัวอ่านรับตั๋วได้ถึง "ตอนนี้ + อายุ + 60 วิ" และเครื่องแต่ละตัว
  //   นาฬิกาเหลื่อมกันได้ ⇒ ถ้าหน้าต่างเท่าอายุพอดี ตั๋วที่ถูกเผาช่วงต้นอาจถูกใช้ซ้ำได้ในวินาทีท้าย ๆ ◂
  const r = await run(key, { limit: 1, windowMs: IDENTIFY_TICKET_MAX_AGE_MS + 120_000 });
  return r.ok;
}

/**
 * ต่อ `sd_ct=<ตั๋ว>` ท้าย url **เฉพาะเมื่อปลายทางเป็นโดเมนที่ร้านอนุญาต** — ปลายทางอื่น = url เดิมทุกไบต์
 * 🔴 ตั๋วที่หลุดไปเว็บของคนอื่น (เว็บพันธมิตร · ไฟล์ใน Google Drive) = คนนั้นผูกผู้เข้าชมของตัวเองเป็นลูกค้าของร้านได้
 */
export function appendIdentifyTicket(url: string, ticket: string, domains: readonly string[]): string {
  const u = str(url);
  const t = str(ticket);
  if (!u || !t || !urlHostAllowed(u, domains ?? [])) return url;
  try {
    const parsed = new URL(u);
    parsed.searchParams.set("sd_ct", t);
    return parsed.toString();
  } catch {
    return url;
  }
}

// ───────────────────────── ตั๋วผู้เข้าชม (ฟอร์มที่ฝังด้วย iframe) ─────────────────────────
// CRM C4.4-fix3 ▸ ปัญหา (journey US9-3): ร้านฝังฟอร์มของเราด้วย `<iframe src="<APP_URL>/f/<token>">` บนเว็บของตัวเอง ·
//   คุกกี้ `sd_vid` อยู่บนโดเมนของร้าน (host-only) ⇒ คำขอของฟอร์มบน APP_URL ไม่เคยมีคุกกี้นั้น ⇒ ผูกประวัติการเข้าชมไม่ได้เลย
//   ทางแก้ (มติผู้คุมงาน option A): สคริปต์ติดตามบนหน้าของร้านขอ "ตั๋วผู้เข้าชม" จาก `POST /t/v` แล้วส่งให้ iframe ของฟอร์ม
//   ทาง postMessage (ไม่ผ่าน url/คุกกี้/storage) · ฟอร์มแนบตั๋วมากับการส่ง · เซิร์ฟเวอร์ตรวจผนึก/อายุ/ร้าน/ระบบ แล้วเผาทิ้ง
//   🔴 ตั๋ว **ทึบแสง** (AES-256-GCM · กุญแจแยก `crm-visitor-ticket:v1:`) · อายุ ≤ 15 นาที · ใช้ได้ครั้งเดียว (jti ใน store เดียวกับตั๋วอีเมล)
//   🔴 ออกตั๋วเฉพาะผู้เข้าชมที่ "การเข้าชมล่าสุดถือความยินยอมเวอร์ชันปัจจุบัน" · ห้าม log ตั๋ว · ตั๋วอยู่ในเนื้อคำตอบของ `/t/v` เท่านั้น ◂

/** กุญแจ AES ของตั๋วผู้เข้าชม (32 ไบต์) — โดเมนแยกจากตั๋วอีเมลด้วยคำนำหน้า `crm-visitor-ticket:v1:` */
function visitorTicketKey(): Buffer {
  return createHmac("sha256", `crm-visitor-ticket:v1:${sessionSecret()}`).update("aead").digest();
}

export type VisitorTicketPayload = { k: "vt"; t: string; s: string; sk: string; v: string; cv: number; x: number; j: string };

/** ผนึกตั๋วผู้เข้าชม (ผู้เรียกจริงคือ `mintVisitorTicket` — export ไว้ให้ข้อสอบผนึกตั๋วหมดอายุ/ผิดระบบได้) */
export function visitorTicket(
  input: { tenantId: string; systemId: string; siteKey: string; visitorId: string; consentVersion: number },
  now: Date = new Date(),
): string {
  const payload: VisitorTicketPayload = {
    k: "vt",
    t: String(input?.tenantId ?? ""),
    s: String(input?.systemId ?? ""),
    sk: String(input?.siteKey ?? ""),
    v: String(input?.visitorId ?? ""),
    cv: Number(input?.consentVersion ?? 0),
    x: now.getTime() + IDENTIFY_TICKET_MAX_AGE_MS,
    j: randomBytes(12).toString("base64url"),
  };
  return sealTicket(visitorTicketKey(), payload);
}

/** อ่านตั๋วผู้เข้าชม — ปลอม/แก้/หมดอายุ/ไม่ใช่ชนิด `vt`/เนื้อในเพี้ยน = null (ไม่บอกว่าเพราะอะไร) */
export function readVisitorTicket(ticket: unknown, now: Date = new Date()): VisitorTicketPayload | null {
  try {
    const p = openTicket(visitorTicketKey(), ticket);
    if (!p || p.k !== "vt") return null;
    if (typeof p.x !== "number" || p.x < now.getTime() || p.x > now.getTime() + IDENTIFY_TICKET_MAX_AGE_MS + 60_000) return null;
    if (typeof p.j !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(p.j)) return null;
    if (!str(p.t) || !str(p.s) || !str(p.sk) || !isVisitorId(p.v) || !Number.isInteger(p.cv) || Number(p.cv) < 1) return null;
    return p as unknown as VisitorTicketPayload;
  } catch {
    return null;
  }
}

// ───────────────────────── ระบบ + ตั้งค่า ─────────────────────────

export type WebSettingsDto = {
  enabled: boolean;
  domains: string[];
  consentText: string;
  consentVersion: number;
  retentionDays: number;
  siteKey: string | null;
  scriptUrl: string;
  embedCode: string;
};

const DEFAULT_CONSENT_TEXT = "เว็บไซต์นี้ใช้คุกกี้เพื่อจดจำการเข้าชมและช่วยให้เราดูแลคุณได้ดีขึ้น — เลือกได้ว่าจะให้เก็บหรือไม่";

type WebStored = { enabled: boolean; domains: string[]; consentText: string; consentVersion: number; retentionDays: number; siteKey: string | null };

/** ตัวอ่านค่าตั้งของการติดตามเว็บ (ค่าเพี้ยน/ไม่ได้ตั้ง = ค่าเริ่มต้น · ไม่ throw) */
export function webSettingsOf(raw: unknown): WebStored {
  const crm = isObj(raw) && isObj((raw as Record<string, unknown>).crm) ? ((raw as Record<string, unknown>).crm as Record<string, unknown>) : {};
  const tr = isObj(crm.tracking) ? (crm.tracking as Record<string, unknown>) : {};
  const web = isObj(tr.web) ? (tr.web as Record<string, unknown>) : {};
  const domains = Array.isArray(web.domains) ? web.domains.map((d) => normalizeDomain(d)).filter((d): d is string => !!d).slice(0, TRACKING_MAX_DOMAINS) : [];
  const cv = Number(web.consentVersion);
  const rd = Number(web.retentionDays);
  const key = typeof web.siteKey === "string" && /^[A-Za-z0-9_-]{12,64}$/.test(web.siteKey) ? web.siteKey : null;
  return {
    enabled: web.enabled === true,
    domains,
    consentText: typeof web.consentText === "string" && web.consentText.trim() ? web.consentText.slice(0, CONSENT_TEXT_MAX) : DEFAULT_CONSENT_TEXT,
    consentVersion: Number.isInteger(cv) && cv >= 1 && cv <= 10_000 ? cv : 1,
    retentionDays: Number.isInteger(rd) && rd >= RETENTION_MIN_DAYS && rd <= RETENTION_MAX_DAYS ? rd : RETENTION_DEFAULT_DAYS,
    siteKey: key,
  };
}

type SystemRow = { id: string; tenantId: string; settings: unknown };

/** AUDIT-CLASS X1: ระบบ CRM ของร้านนี้จริงไหม (ไม่เชื่อ id ที่ผู้เรียกส่งมา) */
async function resolveSystem(ctx: TrackingCtx): Promise<SystemRow> {
  const sys =
    str(ctx?.tenantId) && str(ctx?.systemId)
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, tenantId: true, settings: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้าน — ลองเปิดจากเมนูของระบบอีกครั้ง");
  return sys;
}

/** ด่านของทุกฟังก์ชันฝั่งพนักงาน: ระบบ → uiVersion 2 → คีย์ */
async function enter(ctx: TrackingCtx, actor: MemberActor, key = "crm.tracking.manage"): Promise<SystemRow> {
  const sys = await resolveSystem(ctx);
  await assertCrmV2({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  if (key) assertCanCrm(actor, key);
  return sys;
}

const audit = (ctx: TrackingCtx, action: string, targetType: string, targetId: string, after?: unknown) =>
  writeAudit({
    tenantId: ctx.tenantId,
    actorId: str(ctx.actorUserId) || null,
    actorType: str(ctx.actorUserId) ? "USER" : "SYSTEM",
    action,
    targetType,
    targetId,
    after: after ?? undefined,
  });

// ───────────────────────── นโยบายปลายทางของลิงก์ติดตาม (CRM C6.1-LINKPOLICY · มติเจ้าของ P11/Q15 ข้อ ข) ─────────────────────────
//
// รายการอนุญาตของระบบ CRM หนึ่งระบบ = (1) `settings.crm.tracking.linkHosts` ที่ร้านประกาศเอง (สูงสุด 50 · `a.com` ตรงตัว · `*.a.com`
//   รวมโดเมนย่อย · ค่าเริ่มต้น = ว่าง) + (2) เว็บของร้านในส่วนติดตามเว็บ `settings.crm.tracking.web.domains` (รายการเดียวกับที่ใบ C2.6/J3
//   ใช้ — ไม่มีรายการที่สอง · รวมโดเมนย่อยแบบเดียวกับ `originAllowed`) + (3) host ของแพลตฟอร์มเอง (`APP_URL`) และโดเมนย่อย
// 🔴 ตัวตัดสินตัวเดียว (`linkDestinationVerdict` ใน tracking-shared) ใช้ทั้งตอนสร้าง/แก้ลิงก์ · ตอน `/l/<code>` พาไป · ตัวนับ "ลิงก์ที่จะใช้ไม่ได้"
//    ⇒ สามจุดนี้ไม่มีวันตัดสินไม่ตรงกัน · ลบโดเมนออกจากรายการภายหลัง = ลิงก์ที่ชี้ไปที่นั่นหยุดพาไปทันที (คำตอบเดียวกับรหัสที่ไม่รู้จัก)

/** ข้อความ "ไปเพิ่มที่ไหน" — หน้าตั้งค่าเดียวที่แก้รายการนี้ได้ */
const LINK_HOSTS_WHERE = "เพิ่มโดเมนปลายทางที่ ตั้งค่า › ลิงก์ติดตาม";

/** โดเมนปลายทางที่ร้านประกาศ (`settings.crm.tracking.linkHosts`) — ค่าเพี้ยน/ไม่ได้ตั้ง = ว่าง · รายการผิดรูปถูกทิ้ง (ไม่ throw) */
export function linkHostsOf(raw: unknown): string[] {
  const crm = isObj(raw) && isObj((raw as Record<string, unknown>).crm) ? ((raw as Record<string, unknown>).crm as Record<string, unknown>) : {};
  const tr = isObj(crm.tracking) ? (crm.tracking as Record<string, unknown>) : {};
  const list = Array.isArray(tr.linkHosts) ? tr.linkHosts : [];
  const out: string[] = [];
  for (const h of list) {
    const n = normalizeLinkHost(h);
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= LINK_HOSTS_MAX) break;
  }
  return out;
}

/** host ของแพลตฟอร์ม (จาก `APP_URL`) ในรูปรายการ `*.host` — APP_URL ที่เป็น IP/localhost (เครื่อง dev/QC) = ไม่มี */
function platformLinkEntries(): string[] {
  try {
    const host = new URL(appUrl()).hostname.toLowerCase();
    const n = normalizeLinkHost(`*.${host}`);
    return n ? [n] : [];
  } catch {
    return [];
  }
}

/**
 * host ของแพลตฟอร์มที่ทางเดิน `/t/` `/l/` เป็น "ตัวพาไปที่อื่น" (รอบ 2 · RV-2) — shark.in.th เสมอ + host ของ APP_URL (ถ้าเป็นชื่อเว็บ)
 * ปลายทางลิงก์ที่ชี้ไปที่ทางเดินเหล่านี้ = REDIRECTOR ไม่ว่ารายการไหนจะครอบคลุม (กันลิงก์ → `/t/c/<token>` ของอีเมลตัวเอง → เว็บไหนก็ได้)
 */
function platformRedirectorHosts(): string[] {
  const out = [APP_PUBLIC_HOST];
  for (const e of platformLinkEntries()) {
    const h = e.slice(2);
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

/** web domain ที่ถูกตัดสิทธิ์ "ใช้ได้เสมอ" แล้ว — บันทึกครั้งเดียวต่อโปรเซส (ไม่ให้ log ท่วมทางร้อน `/l`) */
const SKIPPED_WEB_DOMAINS = new Set<string>();

/**
 * รายการที่ร้าน "ไม่ต้องตั้งก็ใช้ได้" (เว็บของร้านในส่วนติดตามเว็บ + แพลตฟอร์ม) — รูป `*.host`
 * 🔴 รอบ 2 · RV-3: web domain ผ่านด่านเดียวกับรายการ `*.` ของร้าน (`normalizeLinkHost`) — ชื่อแบบโดเมนสาธารณะ (`co.th`, `in.th`, `co.uk` …)
 *    ไม่ได้สิทธิ์ใช้ได้เสมอสำหรับลิงก์ (ไม่งั้น `co.th` = ทุกเว็บ .co.th) · ไม่แตะพฤติกรรมการติดตามเว็บ (`originAllowed`) เลย
 */
function alwaysAllowedLinkEntries(settings: unknown): string[] {
  const out: string[] = [];
  for (const d of webSettingsOf(settings).domains) {
    const n = normalizeLinkHost(`*.${d}`);
    if (!n) {
      if (!SKIPPED_WEB_DOMAINS.has(d)) {
        SKIPPED_WEB_DOMAINS.add(d);
        console.warn(`[crm.tracking] โดเมนเว็บ "${d}" กว้างเท่าโดเมนสาธารณะ — ไม่นับเป็นปลายทางลิงก์ที่ใช้ได้เสมอ (การติดตามเว็บไม่เปลี่ยน)`);
      }
      continue;
    }
    if (!out.includes(n)) out.push(n);
  }
  for (const p of platformLinkEntries()) if (!out.includes(p)) out.push(p);
  return out;
}

/** รายการอนุญาตทั้งหมดของระบบนี้ (ที่ร้านประกาศ + ที่ใช้ได้เสมอ) */
export function linkPolicyEntries(settings: unknown, linkHosts: readonly string[] = linkHostsOf(settings)): string[] {
  return [...linkHosts, ...alwaysAllowedLinkEntries(settings)];
}

/** จุดเสียบ Safe Browsing (หนี้) — ตัวจริงอยู่ใน tracking-shared (รอบ 2: ใช้ร่วมกับ `/t/c` ของ emails.ts) · re-export ให้ผู้เรียกเดิม */
export { isDestinationBlocklisted };

/** ตัวตัดสินปลายทาง (บริสุทธิ์ · sync · ไม่แตะฐาน) — `settings` = `AppSystem.settings` ดิบของระบบ CRM เจ้าของลิงก์ */
export function linkDestinationCheck(url: unknown, settings: unknown, linkHosts?: readonly string[]): LinkDestinationVerdict {
  return linkDestinationVerdict(url, linkPolicyEntries(settings, linkHosts ?? linkHostsOf(settings)), isDestinationBlocklisted, platformRedirectorHosts());
}

/** ปลายทางนี้ใช้ได้ไหม (true/false) — ตัวเดียวกับที่ตอนสร้าง/แก้ลิงก์และ `/l/<code>` ใช้ */
export function linkDestinationAllowed(url: unknown, settings: unknown): boolean {
  return linkDestinationCheck(url, settings).ok;
}

/** ข้อความไทยของคำตัดสินที่ไม่ผ่าน — บอกชื่อเว็บและบอกว่าแก้ที่ไหน (ไม่โทษผู้ใช้) */
function linkDestinationMessage(v: Exclude<LinkDestinationVerdict, { ok: true }>): string {
  const host = v.host.length > 80 ? `${v.host.slice(0, 80)}…` : v.host;
  switch (v.reason) {
    case "HOST_NOT_ALLOWED":
      return `ปลายทาง ${host} ยังไม่อยู่ในรายการโดเมนปลายทางที่อนุญาตของร้าน — ${LINK_HOSTS_WHERE} แล้วลองอีกครั้ง`;
    case "IP":
      return `ลิงก์ติดตามพาไปที่เลข IP (${host}) ไม่ได้ — ใช้ลิงก์ที่เป็นชื่อเว็บไซต์ แล้ว${LINK_HOSTS_WHERE}`;
    case "LOCAL":
      return `ปลายทาง ${host} เป็นชื่อเครื่องในเครือข่ายภายในซึ่งลูกค้าเปิดไม่ได้ — ใช้ลิงก์ของเว็บไซต์ที่เปิดได้จากอินเทอร์เน็ต`;
    case "USERINFO":
      return "ลิงก์ปลายทางมีชื่อผู้ใช้หรือรหัสผ่านฝังอยู่หน้าชื่อเว็บ (ส่วนก่อนเครื่องหมาย @) ซึ่งลิงก์ติดตามใช้ไม่ได้ — คัดลอกลิงก์จากแถบที่อยู่ของเบราว์เซอร์อีกครั้ง";
    case "BLOCKLISTED":
      return `ปลายทาง ${host} อยู่ในรายการเว็บไซต์ที่ไม่ปลอดภัย ระบบจึงสร้างลิงก์ติดตามไปที่นี่ไม่ได้`;
    case "REDIRECTOR":
      return `ลิงก์ติดตามชี้ไปที่ลิงก์ติดตามหรือลิงก์นับคลิกอีกตัวของ ${host} ไม่ได้ (ลิงก์ซ้อนลิงก์) — ใช้ลิงก์ของหน้าปลายทางจริงแทน`;
    default:
      return "รับเฉพาะลิงก์ที่ขึ้นต้นด้วย https:// หรือ http:// และต้องมีชื่อเว็บไซต์";
  }
}

/** ด่านตอนสร้าง/แก้ลิงก์ — ไม่ผ่าน = VALIDATION พร้อมข้อความไทย (ไม่เขียนอะไร) */
function assertLinkDestination(url: string, settings: unknown): void {
  const v = linkDestinationCheck(url, settings);
  if (!v.ok) throw fail("VALIDATION", linkDestinationMessage(v));
}

export type LinkPolicyDto = {
  /** รายการที่ร้านประกาศ (รูปมาตรฐาน) */
  linkHosts: string[];
  /** ที่ใช้ได้เสมอโดยไม่ต้องตั้ง (เว็บของร้านในส่วนติดตามเว็บ + แพลตฟอร์ม) — รูป `*.host` */
  alwaysAllowed: string[];
  /** ลิงก์ที่เปิดอยู่ (active · ยังไม่หมดอายุ) ที่ปลายทางไม่ผ่านนโยบายภายใต้รายการนี้ */
  blockedActiveLinks: number;
  /** id ของลิงก์ข้างบน (สูงสุด 200 — หน้าตั้งค่าใช้ติดป้าย) */
  blockedLinkIds: string[];
  /** host ปลายทางของลิงก์ข้างบน (ไม่ซ้ำ · สูงสุด 10) */
  blockedHosts: string[];
  max: number;
};

/**
 * ลิงก์ที่เปิดอยู่ของระบบนี้ที่ "จะใช้ไม่ได้" ภายใต้รายการ `linkHosts` — อ่านฐาน **คำสั่งเดียว** (url ของลิงก์ที่เปิดอยู่) แล้วตัดสินด้วยตัวตัดสินตัวเดียวกับ `/l`
 * (ไม่เขียนกติกาชุดที่สองเป็น SQL — สองชุดที่วันหนึ่งไม่ตรงกัน = ตัวเลขบนหน้าจอโกหก)
 */
async function linkPolicyOf(ctx: TrackingCtx, settings: unknown, linkHosts: string[], now: Date = new Date()): Promise<LinkPolicyDto> {
  const rows = await prisma.$queryRaw<{ id: string; url: string }[]>`
    SELECT "id", "url" FROM "CrmTrackedLink"
     WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} AND "active" = true
       AND ("expiresAt" IS NULL OR "expiresAt" > ${now})`;
  const ids: string[] = [];
  const hosts: string[] = [];
  let n = 0;
  for (const r of rows) {
    const v = linkDestinationCheck(r.url, settings, linkHosts);
    if (v.ok) continue;
    n += 1;
    if (ids.length < 200) ids.push(r.id);
    if (v.host && hosts.length < 10 && !hosts.includes(v.host)) hosts.push(v.host);
  }
  return { linkHosts: [...linkHosts], alwaysAllowed: alwaysAllowedLinkEntries(settings), blockedActiveLinks: n, blockedLinkIds: ids, blockedHosts: hosts, max: LINK_HOSTS_MAX };
}

/**
 * ข้อความจากช่องกรอก (บรรทัด/จุลภาค/ช่องว่างคั่น) หรืออาร์เรย์ → รายการมาตรฐาน (ตัวพิมพ์เล็ก · ไม่ซ้ำ · ≤ 50)
 * 🔴 รายการผิดรูปแม้แต่รายการเดียว = ปฏิเสธทั้งชุดพร้อมบอกว่ารายการไหน (ไม่ทิ้งเงียบ ๆ — เจ้าของร้านจะคิดว่าบันทึกแล้ว)
 */
export function cleanLinkHostsInput(input: unknown): string[] {
  const raw: unknown[] = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\s,;]+/) : [];
  if (raw.length > 500) {
    throw fail("VALIDATION", `ใส่โดเมนปลายทางได้ไม่เกิน ${LINK_HOSTS_MAX} รายการ (ตอนนี้ ${raw.length}) — ลบรายการที่ไม่ใช้ออกก่อน`);
  }
  const out: string[] = [];
  for (const item of raw) {
    const t = typeof item === "string" ? item.trim() : "";
    if (!t) continue;
    // รอบ 2 · RV-5: ชื่อยาวเกิน = ข้อความเรื่องความยาว (ไม่ใช่ "เกิน 50 รายการ") · `*.` นำหน้าไม่นับ
    if ((t.startsWith("*.") ? t.length - 2 : t.length) > 253) {
      throw fail("VALIDATION", `"${t.slice(0, 60)}…" ยาวเกินไปสำหรับชื่อโดเมน (ไม่เกิน 253 ตัวอักษร) — ตรวจว่าวางมาเฉพาะชื่อเว็บ ไม่ได้วางทั้งลิงก์`);
    }
    const n = normalizeLinkHost(t);
    if (!n) {
      const shown = t.length > 60 ? `${t.slice(0, 60)}…` : t;
      throw fail(
        "VALIDATION",
        `"${shown}" ใช้เป็นโดเมนปลายทางไม่ได้ — ใส่ชื่อเว็บล้วน ๆ บรรทัดละหนึ่งชื่อ เช่น shop.example.com หรือ *.example.com (รวมโดเมนย่อย) · ไม่ต้องมี https:// พอร์ต หรือเส้นทาง · ไม่รับเลข IP ชื่อเครื่องภายใน หรือดอกจันครอบโดเมนสาธารณะ/บริการฝากเว็บทั้งหมด เช่น *.co.th *.github.io`,
      );
    }
    if (!out.includes(n)) out.push(n);
  }
  if (out.length > LINK_HOSTS_MAX) throw fail("VALIDATION", `ใส่โดเมนปลายทางได้ไม่เกิน ${LINK_HOSTS_MAX} รายการ (ตอนนี้ ${out.length}) — ลบรายการที่ไม่ใช้ออก หรือใช้ *.โดเมน แทนการใส่โดเมนย่อยทีละชื่อ`);
  return out;
}

/** นโยบายปลายทางปัจจุบัน + จำนวนลิงก์ที่เปิดอยู่แต่ใช้ไม่ได้ (คีย์ `crm.tracking.manage` — เดียวกับการตั้งค่าติดตามอื่น) */
export async function getLinkPolicy(ctx: TrackingCtx, actor: MemberActor): Promise<LinkPolicyDto> {
  const sys = await enter(ctx, actor);
  return linkPolicyOf(ctx, sys.settings, linkHostsOf(sys.settings));
}

/** "ถ้าบันทึกรายการนี้ จะมีลิงก์ที่เปิดอยู่ใช้ไม่ได้กี่ลิงก์" — ไม่เขียนอะไร (ตรวจรูปแบบเหมือนตอนบันทึกทุกข้อ) */
export async function previewLinkHosts(ctx: TrackingCtx, actor: MemberActor, input: { hosts: unknown }): Promise<LinkPolicyDto> {
  const sys = await enter(ctx, actor);
  return linkPolicyOf(ctx, sys.settings, cleanLinkHostsInput(input?.hosts));
}

/**
 * บันทึก `settings.crm.tracking.linkHosts` ด้วย **คำสั่งเดียว** (jsonb ซ้อนสองชั้น — คีย์อื่นของ `crm` และของ `tracking` เช่น `web` รอดเสมอ)
 * แล้วคืนนโยบายใหม่ + จำนวนลิงก์ที่เปิดอยู่ที่ใช้ไม่ได้ภายใต้รายการใหม่ · AuditLog `crm.tracking.link.hosts`
 */
export async function saveLinkHosts(ctx: TrackingCtx, actor: MemberActor, input: { hosts: unknown }): Promise<LinkPolicyDto> {
  await enter(ctx, actor);
  const hosts = cleanLinkHostsInput(input?.hosts);
  const json = JSON.stringify(hosts);
  const n = await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object('tracking',
             (CASE WHEN jsonb_typeof("settings"->'crm'->'tracking') = 'object' THEN "settings"->'crm'->'tracking' ELSE '{}'::jsonb END)
               || jsonb_build_object('linkHosts', ${json}::jsonb)),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM'`;
  if (n === 0) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้าน — ลองเปิดจากเมนูของระบบอีกครั้ง");
  const after = await resolveSystem(ctx);
  const policy = await linkPolicyOf(ctx, after.settings, linkHostsOf(after.settings));
  await audit(ctx, "crm.tracking.link.hosts", "AppSystem", ctx.systemId, { linkHosts: policy.linkHosts, blockedActiveLinks: policy.blockedActiveLinks });
  return policy;
}

// ───────────────────────── ลิงก์ติดตาม ─────────────────────────

export type LinkDto = {
  id: string;
  code: string;
  url: string;
  name: string | null;
  channel: string | null;
  active: boolean;
  clicks: number;
  uniqueClicks: number;
  shortUrl: string;
  createdAt: Date;
};

type LinkRow = { id: string; code: string; url: string; name: string | null; channel: string | null; active: boolean; clicks: number; uniqueClicks: number; createdAt: Date };

const linkDto = (row: LinkRow): LinkDto => ({
  id: row.id,
  code: row.code,
  url: row.url,
  name: row.name,
  channel: row.channel,
  active: row.active,
  clicks: row.clicks,
  uniqueClicks: row.uniqueClicks,
  shortUrl: `${appUrl()}/l/${row.code}`,
  createdAt: row.createdAt,
});

/**
 * AUDIT-CLASS X6: url ที่รับได้ = http/https จริง ๆ เท่านั้น — เก็บ **ตามที่พิมพ์มาทุกไบต์** (ไม่ normalize)
 * 🔴 ปฏิเสธ: scheme อื่น (javascript: · data: · vbscript: · mailto: · ftp:) รวมทั้งที่แทรกช่องว่าง/แท็บ ·
 *    `//host` (protocol-relative) · backslash (`http:/\evil.test` — ตัวแปลง URL มองเป็น `/`) · ไม่มี host · ยาวเกิน 2048
 */
function cleanLinkUrl(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) throw fail("VALIDATION", "กรุณาใส่ลิงก์ปลายทางที่ขึ้นต้นด้วย https:// หรือ http://");
  if (s.length > TRACKED_URL_MAX) throw fail("VALIDATION", `ลิงก์ปลายทางยาวเกินไป (ไม่เกิน ${TRACKED_URL_MAX} ตัวอักษร) — ลองใช้ลิงก์ที่สั้นลง`);
  if (/[\s\\"'<>]/.test(s) || /[\x00-\x1f\x7f]/.test(s)) throw fail("VALIDATION", "ลิงก์ปลายทางมีอักขระที่ใช้ไม่ได้ (ช่องว่าง เครื่องหมายคำพูด หรือ \\) — ลองคัดลอกลิงก์จากแถบที่อยู่ของเบราว์เซอร์อีกครั้ง");
  if (!/^https?:\/\//i.test(s)) throw fail("VALIDATION", "รับเฉพาะลิงก์ที่ขึ้นต้นด้วย https:// หรือ http:// เท่านั้น");
  // `https:///nohost` — ตัวแปลง URL ยุบสแลชเกินให้เอง แล้วหยิบคำถัดไปมาเป็นชื่อเว็บ (`nohost`) ⇒ ต้องปฏิเสธจากสตริงดิบ
  if (/^https?:\/\/\//i.test(s)) throw fail("VALIDATION", "ลิงก์ปลายทางไม่มีชื่อเว็บไซต์ — ตรวจว่าเป็น https://ชื่อเว็บ/เส้นทาง แล้วลองอีกครั้ง");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw fail("VALIDATION", "อ่านลิงก์ปลายทางไม่ได้ — ลองคัดลอกลิงก์จากแถบที่อยู่ของเบราว์เซอร์อีกครั้ง");
  }
  const scheme = u.protocol.toLowerCase();
  if ((scheme !== "http:" && scheme !== "https:") || !u.hostname) throw fail("VALIDATION", "รับเฉพาะลิงก์ที่ขึ้นต้นด้วย https:// หรือ http:// และต้องมีชื่อเว็บไซต์");
  return s;
}

const LINK_CODE_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";
function randomLinkCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length];
  return out;
}

function cleanCode(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  if (!LINK_CODE_RE.test(s)) throw fail("VALIDATION", "รหัสลิงก์ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข ขีดกลางและขีดล่าง ยาว 6–32 ตัว");
  return s;
}

export async function createLink(ctx: TrackingCtx, actor: MemberActor, input: { url: string; name?: string | null; channel?: string | null; code?: string | null }): Promise<LinkDto> {
  const sys = await enter(ctx, actor);
  const url = cleanLinkUrl(input?.url);
  assertLinkDestination(url, sys.settings); // CRM C6.1-LINKPOLICY ▸ ปลายทางต้องอยู่ในรายการอนุญาตของร้าน ◂
  const custom = cleanCode(input?.code);
  const name = str(input?.name).slice(0, 120) || null;
  const channel = str(input?.channel).slice(0, 40) || null;
  // CRM C3.9 ▸ เพดานลิงก์ติดตามย้ายไปที่ `limits.ts` (trackedLinks · ค่าเริ่มต้น 1,000 = LINK_MAX_PER_SYSTEM เดิม · ร้านขยายได้) —
  //   ตัดสินใต้ล็อกใน tx เดียวกับ insert ข้างล่าง (AUDIT-CLASS X3) ◂
  if (custom) {
    // AUDIT-CLASS X1: รหัสลิงก์เป็น unique ทั้งระบบ (ลิงก์สั้นไม่มีร้านกำกับ) ⇒ ชนกับร้านอื่นก็ต้องปฏิเสธ
    const taken = await prisma.crmTrackedLink.findFirst({ where: { code: custom }, select: { id: true } });
    if (taken) throw fail("VALIDATION", "รหัสลิงก์นี้มีคนใช้แล้ว — ลองตั้งรหัสอื่น");
  }
  let row: LinkRow | null = null;
  for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
    const code = custom ?? randomLinkCode();
    try {
      // CRM C3.9 ▸ tx ละครั้งต่อรหัสที่ลอง (P2002 ทำ tx ถอย ⇒ ลองใหม่ใน tx ใหม่) — เพดานตัดสินใต้ล็อกคู่กับ insert ◂
      row = await prisma.$transaction(async (tx) => {
        await assertCrmLimit(ctx, "trackedLinks", 1, tx);
        return tx.crmTrackedLink.create({
          data: { tenantId: ctx.tenantId, systemId: ctx.systemId, code, url, name, channel, createdById: str(ctx.actorUserId) || null },
          select: { id: true, code: true, url: true, name: true, channel: true, active: true, clicks: true, uniqueClicks: true, createdAt: true },
        });
      });
    } catch (e) {
      const code2 = (e as { code?: string })?.code;
      if (code2 !== "P2002") throw e;
      if (custom) throw fail("VALIDATION", "รหัสลิงก์นี้มีคนใช้แล้ว — ลองตั้งรหัสอื่น");
    }
  }
  if (!row) throw fail("VALIDATION", "สร้างรหัสลิงก์ไม่สำเร็จ — ลองกดสร้างอีกครั้ง");
  await audit(ctx, "crm.tracking.link.create", "CrmTrackedLink", row.id, { code: row.code, channel, systemId: ctx.systemId });
  return linkDto(row);
}

async function ownLink(ctx: TrackingCtx, id: string): Promise<LinkRow> {
  const row = str(id)
    ? await prisma.crmTrackedLink.findFirst({
        where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId },
        select: { id: true, code: true, url: true, name: true, channel: true, active: true, clicks: true, uniqueClicks: true, createdAt: true },
      })
    : null;
  if (!row) throw fail("NOT_FOUND", LINK_404);
  return row;
}

export async function updateLink(ctx: TrackingCtx, actor: MemberActor, id: string, patch: { name?: string | null; url?: string; active?: boolean; channel?: string | null }): Promise<LinkDto> {
  const sys = await enter(ctx, actor);
  const row = await ownLink(ctx, id);
  const data: Prisma.CrmTrackedLinkUpdateInput = {};
  if (patch?.url !== undefined) data.url = cleanLinkUrl(patch.url);
  // CRM C6.1-LINKPOLICY ▸ เปลี่ยนปลายทาง หรือ "เปิด" ลิงก์ = ปลายทาง (ใหม่หรือเดิม) ต้องผ่านนโยบาย · แก้ชื่อ/ช่องทาง/ปิดลิงก์ทำได้เสมอ
  //   (ลิงก์ที่โดเมนถูกถอดออกจากรายการยังเปลี่ยนชื่อหรือปิดได้ — แต่เปิดกลับต้องเพิ่มโดเมนก่อน ไม่งั้นเปิดแล้วก็พาไปไม่ได้อยู่ดี) ◂
  // รอบ 2 · RV-1: `active` ต้องเป็น true/false จริง ๆ (server action รับ JSON จากหน้าจอ — `1`/`"yes"` เคยเปิดลิงก์ที่ถูกกันได้โดยไม่ผ่านด่าน)
  //   ⇒ ค่า "เปิด" ตัดสินครั้งเดียว แล้วใช้ทั้งกับด่านและกับค่าที่เขียน
  if (patch?.active !== undefined && typeof patch.active !== "boolean") throw fail("VALIDATION", "สถานะของลิงก์ต้องเป็นเปิดหรือปิดเท่านั้น — ลองกดสวิตช์อีกครั้ง");
  const turnOn = patch?.active === true;
  if (patch?.url !== undefined || turnOn) assertLinkDestination(typeof data.url === "string" ? data.url : row.url, sys.settings);
  if (patch?.name !== undefined) data.name = str(patch.name).slice(0, 120) || null;
  if (patch?.channel !== undefined) data.channel = str(patch.channel).slice(0, 40) || null;
  if (patch?.active !== undefined) data.active = turnOn;
  const next = await prisma.crmTrackedLink.update({
    where: { id: row.id },
    data,
    select: { id: true, code: true, url: true, name: true, channel: true, active: true, clicks: true, uniqueClicks: true, createdAt: true },
  });
  await audit(ctx, "crm.tracking.link.update", "CrmTrackedLink", row.id, { code: next.code, active: next.active, changed: Object.keys(data) });
  return linkDto(next);
}

/** AUDIT-CLASS X9: ลบลิงก์ = งานอันตราย (ลิงก์ที่พิมพ์ไปแล้วจะตาย) ⇒ ต้องยืนยัน + เหตุผล */
export async function deleteLink(ctx: TrackingCtx, actor: MemberActor, id: string, opts: { confirm?: boolean; reason?: string }): Promise<{ ok: true }> {
  await enter(ctx, actor);
  const row = await ownLink(ctx, id);
  if (opts?.confirm !== true) throw fail("CONFIRM_REQUIRED", "ลิงก์ที่ลบแล้วจะกดไม่ได้อีก (รวมถึง QR ที่พิมพ์ไปแล้ว) — ยืนยันการลบและใส่เหตุผลก่อนนะ");
  const reason = str(opts?.reason);
  if (reason.length < 5) throw fail("VALIDATION", "ช่วยใส่เหตุผลของการลบอย่างน้อย 5 ตัวอักษร เพื่อให้ทีมย้อนดูได้ภายหลัง");
  await prisma.crmTrackedLink.deleteMany({ where: { id: row.id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  await audit(ctx, "crm.tracking.link.delete", "CrmTrackedLink", row.id, { code: row.code, reason: reason.slice(0, 200) });
  return { ok: true };
}

export async function listLinks(ctx: TrackingCtx, actor: MemberActor): Promise<LinkDto[]> {
  await enter(ctx, actor);
  const rows = await prisma.crmTrackedLink.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LINK_MAX_PER_SYSTEM,
    select: { id: true, code: true, url: true, name: true, channel: true, active: true, clicks: true, uniqueClicks: true, createdAt: true },
  });
  return rows.map(linkDto);
}

export async function linkStats(ctx: TrackingCtx, actor: MemberActor, id: string, opts: { days?: number } = {}): Promise<{ clicks: number; uniqueClicks: number; byDay: { date: string; clicks: number }[] }> {
  await enter(ctx, actor);
  const row = await ownLink(ctx, id);
  const days = Number.isFinite(opts?.days) ? Math.min(Math.max(Math.floor(Number(opts?.days)), 1), 365) : 30;
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await prisma.$queryRaw<{ date: string; clicks: bigint }[]>`
    SELECT to_char(("at" + interval '7 hours')::date, 'YYYY-MM-DD') AS date, count(*) AS clicks
      FROM "CrmTrackedClick" WHERE "linkId" = ${row.id} AND "at" >= ${since}
     GROUP BY 1 ORDER BY 1`;
  return { clicks: row.clicks, uniqueClicks: row.uniqueClicks, byDay: rows.map((r) => ({ date: r.date, clicks: Number(r.clicks) })) };
}

/**
 * QR ของลิงก์สั้น (SVG ฝังในหน้า/พิมพ์ได้) — ไม่มี <script> ไม่มี on*=
 * 🔴 (รีวิวรอบ 2 · N8) หน้าตั้งค่าแสดง SVG นี้ด้วย `dangerouslySetInnerHTML` ⇒ **สัญญา** ของฟังก์ชันนี้คือ
 *    "เป็น <svg> ที่ไม่มีสคริปต์และไม่มีตัวจัดการเหตุการณ์" · เนื้อในมาจาก `${appUrl()}/l/<code>` ซึ่งเป็นรหัส
 *    `[A-Za-z0-9_-]` ล้วน (ไม่มีข้อความที่ร้านพิมพ์เอง) แต่เราไม่เชื่อไลบรารีเงียบ ๆ — ตรวจแล้วโยนทิ้งถ้าผิดรูป
 *    (ถ้าวันหนึ่งไลบรารีเปลี่ยนรูปแบบผลลัพธ์ ต้องพังที่นี่ ไม่ใช่กลายเป็นช่องยิงสคริปต์บนหน้าเจ้าของร้าน)
 */
export const isBareSvg = (svg: unknown): boolean => {
  const s = typeof svg === "string" ? svg.trim() : "";
  if (!s || s.length > 200_000 || !s.startsWith("<svg") || !s.endsWith("</svg>")) return false;
  return !/<\s*(script|foreignObject|iframe|object|embed|use|image|a)\b/i.test(s) && !/\son[a-z]+\s*=/i.test(s) && !/javascript:|data:text\/html/i.test(s);
};

export async function linkQrSvg(ctx: TrackingCtx, actor: MemberActor, id: string): Promise<string> {
  await enter(ctx, actor);
  const row = await ownLink(ctx, id);
  const svg = await QRCode.toString(`${appUrl()}/l/${row.code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  if (!isBareSvg(svg)) throw fail("VALIDATION", "สร้างภาพ QR ไม่สำเร็จ ระบบจึงไม่แสดงผลลัพธ์นี้ — ลองอีกครั้ง หรือใช้ลิงก์สั้นแทน");
  return svg;
}

// ───────────────────────── ตั้งค่าเว็บ (settings.crm.tracking.web) ─────────────────────────

const scriptUrlOf = (siteKey: string | null): string => (siteKey ? `${trackerOrigin()}/t/s/${siteKey}.js` : "");
const embedCodeOf = (siteKey: string | null): string => (siteKey ? `<script async src="${scriptUrlOf(siteKey)}"></script>` : "");

const webDto = (stored: WebStored): WebSettingsDto => ({
  enabled: stored.enabled,
  domains: [...stored.domains],
  consentText: stored.consentText,
  consentVersion: stored.consentVersion,
  retentionDays: stored.retentionDays,
  siteKey: stored.siteKey,
  scriptUrl: scriptUrlOf(stored.siteKey),
  embedCode: embedCodeOf(stored.siteKey),
});

export async function getWebSettings(ctx: TrackingCtx, actor: MemberActor): Promise<WebSettingsDto> {
  const sys = await enter(ctx, actor);
  return webDto(webSettingsOf(sys.settings));
}

function newSiteKey(): string {
  return randomBytes(SITE_KEY_LENGTH).toString("base64url").slice(0, SITE_KEY_LENGTH + 6);
}

/**
 * เขียน `settings.crm.tracking.web` ด้วย **คำสั่งเดียว** (jsonb ซ้อนสามชั้น) — คีย์อื่นของ `crm` และของ `tracking` รอดเสมอ
 * 🔴 ห้ามอ่านทั้งก้อนมาแก้แล้วเขียนทับ (สองคนกดพร้อมกัน = ค่าของคนหนึ่งหาย)
 */
async function writeWebSettings(ctx: TrackingCtx, patch: Record<string, unknown>, opts: { bumpConsentVersion?: boolean } = {}): Promise<void> {
  const json = JSON.stringify(patch);
  // 🔴 (รีวิวรอบ 2 · N7) การบวกเวอร์ชัน consent ต้องคำนวณ **ในคำสั่งเดียวกัน** จากค่าในแถว ไม่ใช่จากค่าที่อ่านมาก่อนหน้า
  //    — สองคนกดปุ่ม "ออกเวอร์ชันใหม่" พร้อมกันด้วยค่าที่อ่านมาเท่ากัน จะได้เวอร์ชันเดียวกันทั้งคู่ (คนหนึ่งหาย)
  //    ⇒ ความยินยอมเก่ากลายเป็น "ยังใช้ได้" ทั้งที่ร้านตั้งใจล้างทิ้ง
  const bump = opts?.bumpConsentVersion === true;
  const n = await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object('tracking',
             (CASE WHEN jsonb_typeof("settings"->'crm'->'tracking') = 'object' THEN "settings"->'crm'->'tracking' ELSE '{}'::jsonb END)
               || jsonb_build_object('web',
                    (CASE WHEN jsonb_typeof("settings"->'crm'->'tracking'->'web') = 'object' THEN "settings"->'crm'->'tracking'->'web' ELSE '{}'::jsonb END)
                      || ${json}::jsonb
                      || (CASE WHEN ${bump}
                               THEN jsonb_build_object('consentVersion',
                                      COALESCE(NULLIF("settings"->'crm'->'tracking'->'web'->>'consentVersion', ''), '1')::int + 1)
                               ELSE '{}'::jsonb END))),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM'`;
  if (n === 0) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้าน — ลองเปิดจากเมนูของระบบอีกครั้ง");
}

export async function saveWebSettings(
  ctx: TrackingCtx,
  actor: MemberActor,
  input: { enabled?: boolean; domains?: string[]; consentText?: string; retentionDays?: number; bumpConsentVersion?: boolean },
): Promise<WebSettingsDto> {
  const sys = await enter(ctx, actor);
  const cur = webSettingsOf(sys.settings);
  const patch: Record<string, unknown> = {};

  if (input?.domains !== undefined) {
    const raw = Array.isArray(input.domains) ? input.domains : [];
    if (raw.length > TRACKING_MAX_DOMAINS) throw fail("VALIDATION", `ใส่โดเมนได้ไม่เกิน ${TRACKING_MAX_DOMAINS} โดเมน — ลบที่ไม่ใช้ออกก่อน`);
    const out: string[] = [];
    for (const d of raw) {
      const norm = normalizeDomain(d);
      if (!norm) throw fail("VALIDATION", "โดเมนต้องเป็นชื่อเว็บล้วน ๆ เช่น shop.example.com (ไม่ต้องใส่ https:// เครื่องหมาย * พอร์ต หรือเส้นทางต่อท้าย)");
      if (!out.includes(norm)) out.push(norm);
    }
    patch.domains = out;
  }
  if (input?.consentText !== undefined) {
    const t = String(input.consentText ?? "").trim();
    if (!t || t.length > CONSENT_TEXT_MAX) throw fail("VALIDATION", `ข้อความแจ้งเรื่องคุกกี้ต้องมีความยาว 1–${CONSENT_TEXT_MAX} ตัวอักษร`);
    patch.consentText = t;
  }
  if (input?.retentionDays !== undefined) {
    const d = Number(input.retentionDays);
    if (!Number.isInteger(d) || d < RETENTION_MIN_DAYS || d > RETENTION_MAX_DAYS) throw fail("VALIDATION", `อายุการเก็บข้อมูลการเข้าชมต้องอยู่ระหว่าง ${RETENTION_MIN_DAYS}–${RETENTION_MAX_DAYS} วัน`);
    patch.retentionDays = d;
  }
  const bump = input?.bumpConsentVersion === true; // (N7) ค่าใหม่คำนวณใน SQL — ที่นี่แค่ยกธง
  if (input?.enabled !== undefined) {
    patch.enabled = !!input.enabled;
    // เปิดใช้งานครั้งแรก = ออก siteKey (ตัวระบุสาธารณะ ไม่ใช่ความลับ — ฝังในสคริปต์บนเว็บของร้าน)
    if (input.enabled && !cur.siteKey) patch.siteKey = newSiteKey();
  }
  if (Object.keys(patch).length === 0 && !bump) return webDto(cur);
  await writeWebSettings(ctx, patch, { bumpConsentVersion: bump });
  const after = await resolveSystem(ctx);
  const next = webSettingsOf(after.settings);
  await audit(ctx, "crm.tracking.web.settings", "AppSystem", ctx.systemId, {
    enabled: next.enabled,
    domains: next.domains,
    consentVersion: next.consentVersion,
    retentionDays: next.retentionDays,
    changed: Object.keys(patch),
  });
  return webDto(next);
}

// ───────────────────────── ทางสาธารณะ: resolveSite / collect / consent ─────────────────────────

export type SiteInfo = { tenantId: string; systemId: string; domains: string[]; consentVersion: number; consentText: string; siteKey: string };

/**
 * siteKey → ร้าน/ระบบ (สาธารณะ · ไม่มี actor) — ไม่รู้จัก / ปิดการติดตาม / ระบบยัง uiVersion 1 = `null`
 * 🔴 คำตอบเดียวกันทุกกรณี (route ตอบสคริปต์เปล่าหรือ 204 เหมือนกันหมด) ⇒ ไม่มีเครื่องมือไล่เดา siteKey ของร้านอื่น
 */
export async function resolveSite(siteKey: unknown): Promise<SiteInfo | null> {
  const key = str(siteKey);
  if (!key || !/^[A-Za-z0-9_-]{6,64}$/.test(key)) return null;
  const rows = await prisma.$queryRaw<{ id: string; tenantId: string; settings: unknown }[]>`
    SELECT "id", "tenantId", "settings" FROM "AppSystem"
     WHERE "type" = 'CRM' AND "settings"->'crm'->'tracking'->'web'->>'siteKey' = ${key}
     LIMIT 2`;
  const row = rows.length === 1 ? rows[0] : null;
  if (!row) return null;
  const web = webSettingsOf(row.settings);
  if (!web.enabled || !web.siteKey) return null;
  if (parseCrmSettings(row.settings).uiVersion !== 2) return null; // R-E.14: ร้านที่ยังไม่เปิด v2 = ไม่เก็บอะไรเลย
  return { tenantId: row.tenantId, systemId: row.id, domains: web.domains, consentVersion: web.consentVersion, consentText: web.consentText, siteKey: web.siteKey };
}

/**
 * AUDIT-CLASS X7: Origin นี้ควรได้ header CORS ไหม — **ตอบจากโดเมนของร้านที่ payload อ้างถึงเท่านั้น**
 * 🔴 ห้ามตอบ `*` และห้ามตอบว่า "โดเมนนี้เป็นของร้านอื่นที่เปิดติดตามอยู่" (ร้าน A เอา siteKey ไปวางบนเว็บร้าน B ไม่ได้)
 */
export async function corsOriginForPayload(body: unknown, origin: unknown): Promise<string | null> {
  if (!str(origin) || !isObj(body)) return null;
  return corsOriginForSite(await resolveSite((body as CollectBody).k), body, origin);
}

/** C5.1-fix ▸ ตัวสินใจ CORS จาก site ที่ resolve แล้ว (route `/t/e` resolve ครั้งเดียวแล้วใช้ทั้ง CORS และ collect) — กติกาเดียวกับ corsOriginForPayload ◂ */
export function siteKeyOfPayload(body: unknown): unknown {
  return isObj(body) ? (body as CollectBody).k : undefined;
}

export function corsOriginForSite(site: SiteInfo | null, body: unknown, origin: unknown): string | null {
  const o = str(origin);
  if (!o || !isObj(body)) return null;
  const b = body as CollectBody;
  if (!site) return null;
  if (!originAllowed(o, site.domains)) return null;
  // หน้าที่อ้างว่าอยู่คนละโดเมนกับที่ร้านประกาศ = คำขอที่เราไม่รับรู้ ⇒ ไม่ให้ header CORS ด้วย (ไม่ยืนยันอะไรกลับไปเลย)
  if (b.u !== undefined && !urlHostAllowed(b.u, site.domains)) return null;
  return o;
}

/** preflight (OPTIONS) ไม่มี body ⇒ ถามว่า "มีร้านไหนประกาศโดเมนนี้ไว้ไหม" (ตัวคำตอบจริงยังตรวจ payload อีกชั้นเสมอ) */
export async function corsOriginForPreflight(origin: unknown): Promise<string | null> {
  const o = str(origin);
  if (!o) return null;
  let host = "";
  try {
    const u = new URL(o);
    if (u.protocol !== "https:") return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  const rows = await prisma.$queryRaw<{ settings: unknown }[]>`
    SELECT "settings" FROM "AppSystem"
     WHERE "type" = 'CRM'
       AND jsonb_typeof("settings"->'crm'->'tracking'->'web'->'domains') = 'array'
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements_text("settings"->'crm'->'tracking'->'web'->'domains') AS d
          WHERE d = ${host} OR right(${host}, length(d) + 1) = '.' || d)
     LIMIT 20`;
  for (const r of rows) {
    const web = webSettingsOf(r.settings);
    if (web.enabled && parseCrmSettings(r.settings).uiVersion === 2 && originAllowed(o, web.domains)) return o;
  }
  return null;
}

export type CollectMeta = { origin: string | null; ip: string; userAgent: string; bytes: number };
export type CollectDeps = {
  limiter?: (key: string, spec: { limit: number; windowMs: number }) => Promise<{ ok: boolean }>;
  now?: Date;
  /** C5.1-fix ▸ site ที่ route resolve แล้ว (ส่งมา = ไม่ resolve ซ้ำ · null = siteKey ใช้ไม่ได้) ◂ */
  site?: SiteInfo | null;
};

type SessionRow = { id: string; tenantId: string; systemId: string; visitorId: string; contactId: string | null; consentVersion: number | null; lastSeenAt: Date; identifiedBy: string | null };

const SESSION_COLS = { id: true, tenantId: true, systemId: true, visitorId: true, contactId: true, consentVersion: true, lastSeenAt: true, identifiedBy: true } as const;

async function latestSession(systemId: string, visitorId: string): Promise<SessionRow | null> {
  return prisma.crmWebSession.findFirst({ where: { systemId, visitorId }, orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }], select: SESSION_COLS });
}

/**
 * ผู้ติดต่อคนล่าสุดที่ผู้เข้าชมรายนี้ถูกระบุว่าเป็น (เก็บเป็นเหตุการณ์ IDENTIFY — ไม่มีคอลัมน์ให้เก็บ)
 * CRM C4.4-fix3 ▸ (finding c) ไม่นับ IDENTIFY ที่อยู่บนการเข้าชมที่ความยินยอมถูกถอน/ปฏิเสธแล้ว (consentVersion null) —
 *   ตัวตนที่รู้มาก่อนการถอนเป็นข้อมูลของช่วงที่ถูกถอน ⇒ การเข้าชมรอบใหม่หลังยอมรับอีกครั้งต้องไม่สืบทอดตัวตนนั้น ◂
 */
async function lastIdentifiedContact(systemId: string, visitorId: string): Promise<{ contactId: string; by: string } | null> {
  const rows = await prisma.$queryRaw<{ contactId: string | null; by: string | null }[]>`
    SELECT e."meta"->>'contactId' AS "contactId", e."meta"->>'by' AS "by"
      FROM "CrmWebEvent" e JOIN "CrmWebSession" s ON s."id" = e."sessionId"
     WHERE s."systemId" = ${systemId} AND s."visitorId" = ${visitorId} AND e."kind" = 'IDENTIFY' AND s."consentVersion" IS NOT NULL
     ORDER BY e."at" DESC, e."id" DESC LIMIT 1`;
  const r = rows[0];
  return r?.contactId ? { contactId: r.contactId, by: r.by ?? "FORM" } : null;
}

const lockKey = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

/** สร้างการเข้าชมรอบใหม่ (สืบทอด consent + ผู้ติดต่อล่าสุดของผู้เข้าชมรายนี้) — ล็อกต่อผู้เข้าชม กันสองแถวพร้อมกัน */
async function openSession(
  site: SiteInfo,
  visitorId: string,
  input: { consentVersion: number | null; url: string | null; referrer: string | null; userAgent: string; ipHash: string; now: Date },
): Promise<SessionRow | null> {
  const inherited = await lastIdentifiedContact(site.systemId, visitorId);
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `crm:web-visitor:${site.systemId}:${visitorId}`);
    const again = await tx.crmWebSession.findFirst({ where: { systemId: site.systemId, visitorId }, orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }], select: SESSION_COLS });
    // CRM C4.4-fix3 ▸ (finding c) แถวที่ถูกถอน/ปฏิเสธ (consentVersion null) ไม่ถูกหยิบกลับมาใช้แม้ยังไม่พ้นเวลาว่าง ⇒ เปิดรอบใหม่
    //   r2 (review N8): แถวที่ถือ **เวอร์ชันอื่น** (ก่อนร้านออกข้อความใหม่) ก็เช่นกัน — ต้องเป็นเวอร์ชันเดียวกับที่รอบนี้ยินยอม ◂
    if (again && again.consentVersion !== null && again.consentVersion === input.consentVersion && input.now.getTime() - new Date(again.lastSeenAt).getTime() <= WEB_SESSION_IDLE_MS) return again;
    const utm = utmOf(input.url);
    return tx.crmWebSession.create({
      data: {
        tenantId: site.tenantId,
        systemId: site.systemId,
        visitorId,
        contactId: inherited?.contactId ?? null,
        identifiedBy: inherited?.by ?? null,
        consentVersion: input.consentVersion,
        consentAt: input.consentVersion === null ? null : input.now,
        firstUrl: input.url,
        referrer: input.referrer,
        utm: (utm ?? undefined) as Json | undefined,
        userAgent: input.userAgent.slice(0, 200) || null,
        ipHash: input.ipHash,
        startedAt: input.now,
        lastSeenAt: input.now,
      },
      select: SESSION_COLS,
    });
  }, TX_OPTS);
}

/**
 * การเข้าชมล่าสุดของผู้เข้าชมรายนี้ **ที่ยังถือความยินยอมอยู่** ในระบบ CRM ที่ระบุ — ไม่มี = null
 * ผู้เรียก: โมดูลฟอร์ม (ผูกคำตอบฟอร์มเข้ากับการเข้าชม · ผ่าน facade เท่านั้น)
 * CRM C4.4-fix3 ▸ (รีวิว finding c · PDPA) "ถือความยินยอม" = **เวอร์ชันปัจจุบันของร้าน** ไม่ใช่แค่ "ไม่ว่าง": ร้านออกข้อความ
 *   คุกกี้เวอร์ชันใหม่แล้ว ผู้เข้าชมที่ยอมรับแค่เวอร์ชันเก่าต้องยังไม่ถูกผูก · และต้องเป็น **การเข้าชมล่าสุด** ของผู้เข้าชมรายนั้น
 *   (ปฏิเสธ/ถอนล้างทุกแถวของผู้เข้าชมอยู่แล้ว ⇒ แถวล่าสุดคือสถานะความยินยอมตอนนี้) ◂
 */
export async function latestConsentedSessionId(tenantId: string, systemId: string, visitorId: string): Promise<string | null> {
  if (!str(tenantId) || !str(systemId) || !isVisitorId(visitorId)) return null;
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { settings: true } });
  if (!sys) return null;
  const current = webSettingsOf(sys.settings).consentVersion;
  const row = await prisma.crmWebSession.findFirst({
    where: { tenantId, systemId, visitorId },
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
    select: { id: true, consentVersion: true },
  });
  return row && row.consentVersion === current ? row.id : null;
}

/** ผู้ติดต่อที่ผูกกับการเข้าชมนี้ขอ "ไม่ให้ติดตาม" ไหม */
async function sessionOptedOut(session: SessionRow): Promise<boolean> {
  if (!session.contactId) return false;
  const c = await prisma.crmContact.findFirst({ where: { id: session.contactId, tenantId: session.tenantId }, select: { trackingOptOut: true } });
  return c?.trackingOptOut === true;
}

type CollectBody = { k?: unknown; v?: unknown; cv?: unknown; t?: unknown; u?: unknown; ti?: unknown; r?: unknown; d?: unknown; n?: unknown; ct?: unknown };

type Gated = { site: SiteInfo; visitorId: string; url: string | null; body: CollectBody; now: Date; ipHash: string };

/** ด่านร่วมของ `/t/e` และ `/t/consent` ส่วนที่ไม่อ่าน/เขียนฐาน (นอกจาก resolve site) — ผ่านแล้วได้ site + visitorId + url ที่สะอาด */
async function preGate(body: unknown, meta: CollectMeta, deps: CollectDeps, kind: GateKind): Promise<Gated | null> {
  if (!isObj(body)) return null;
  const b = body as CollectBody;
  if (Number(meta?.bytes ?? 0) > TRACKING_PAYLOAD_MAX_BYTES) return null;
  const site = deps?.site !== undefined ? deps.site : await resolveSite(b.k);
  if (!site) return null;
  // AUDIT-CLASS X7: ต้องมาจากหน้าเว็บบนโดเมนที่ร้านประกาศไว้เท่านั้น (https) และ url ของหน้าก็ต้องอยู่โดเมนเดียวกัน
  if (!originAllowed(meta?.origin ?? null, site.domains)) return null;
  const visitorId = isVisitorId(b.v) ? b.v : null;
  if (!visitorId) return null;
  const url = cleanTrackedUrl(b.u);
  if (kind === "collect" && !url) return null;
  if (b.u !== undefined && !urlHostAllowed(b.u, site.domains)) return null;
  const now = deps?.now ?? new Date();
  const ipHash = ipHashFor(String(meta?.ip ?? ""), now);
  return { site, visitorId, url, body: b, now, ipHash };
}

// CRM C4.4-fix3 ▸ ชนิดที่สาม `ticket` (= `POST /t/v`) ใช้ด่านร่วมชุดเดียวกัน (siteKey · Origin https ในโดเมนของร้าน · url ในโดเมน ·
//   รหัสผู้เข้าชม uuid) แต่มีถังต่อ IP ของตัวเอง `crm:tv:` · กุญแจของ `collect`/`consent` เดิมไม่เปลี่ยนแม้แต่ไบต์เดียว ◂
type GateKind = "collect" | "consent" | "ticket";
const ipBucketKey = (kind: GateKind, ipHash: string) => `crm:t${kind === "collect" ? "e" : kind === "consent" ? "c" : "v"}:${ipHash.slice(0, 32)}`;

/** ด่านร่วมของ `/t/e` และ `/t/consent` — ผ่านแล้วได้ site + visitorId + url ที่สะอาด */
async function gate(body: unknown, meta: CollectMeta, deps: CollectDeps, kind: "collect" | "consent"): Promise<Gated | null> {
  const g = await preGate(body, meta, deps, kind);
  if (!g) return null;
  const limiter = deps?.limiter ?? ((key: string, spec: { limit: number; windowMs: number }) => checkRateLimitDb(key, spec));
  const perIp = await limiter(ipBucketKey(kind, g.ipHash), kind === "collect" ? TRACKING_RATE_LIMITS.collectPerIp : TRACKING_RATE_LIMITS.consentPerIp);
  if (!perIp.ok) return null;
  const perSite = await limiter(`crm:ts:${g.site.siteKey}`, TRACKING_RATE_LIMITS.collectPerSite);
  if (!perSite.ok) return null;
  return g;
}

/**
 * CRM C5.1-fix ▸ F5 ทางร้อนของ `/t/e` (พิมพ์เขียว §12 "เขียนอย่างเดียว"): ถังความถี่สองถัง (IP ก่อน · ถังของเว็บนับเมื่อ IP ผ่านเท่านั้น —
 *   ลำดับเดิมของ gate) + การเข้าชมล่าสุด + ผู้ติดต่อปิดการติดตาม + ตัวนับ/แถว PAGEVIEW — **คำสั่งเดียว**
 *   เขียนเฉพาะเมื่อเงื่อนไขเดิมครบทุกข้อ: ผ่านเพดาน · เป็น page · เวอร์ชัน consent ตรงของร้าน · การเข้าชมล่าสุดถือ consent เวอร์ชันนี้ ·
 *   ยังไม่เกินเวลาว่าง · ผู้ติดต่อไม่ได้ปิดการติดตาม · ทางอื่น (เปิดรอบใหม่ · event · identify · ไม่ผ่านเงื่อนไข) = "slow" ให้ตรรกะเดิมตัดสิน
 *   (ไม่นับถังซ้ำ) ◂
 */
async function collectHot(g: Gated, meta: CollectMeta): Promise<"done" | "blocked" | "slow"> {
  const { site, visitorId, url, now } = g;
  const b = g.body;
  const type = str(b.t);
  const isPage = type === "page" && Number(b.cv) === site.consentVersion;
  const ipLim = TRACKING_RATE_LIMITS.collectPerIp;
  const siteLim = TRACKING_RATE_LIMITS.collectPerSite;
  const utm = isPage ? utmOf(url) : null;
  const title = str(b.ti).slice(0, 300) || null;
  const durationSec = Number.isFinite(Number(b.d)) ? Math.min(Math.max(Math.floor(Number(b.d)), 0), 86_400) : null;
  const idleCut = new Date(now.getTime() - WEB_SESSION_IDLE_MS);
  const rows = await prisma.$queryRaw<{ ipCount: number | null; siteCount: number | null; written: number }[]>`
    WITH ${rateBucketCte("rip", ipBucketKey("collect", g.ipHash), ipLim.windowMs, now.getTime())},
    ${rateBucketCte("rsite", `crm:ts:${site.siteKey}`, siteLim.windowMs, now.getTime(), { after: "rip", limit: ipLim.limit })},
    s AS (
      SELECT ws."id", ws."tenantId", ws."contactId", ws."consentVersion", ws."lastSeenAt"
        FROM "CrmWebSession" ws
       WHERE ws."systemId" = ${site.systemId} AND ws."visitorId" = ${visitorId}
       ORDER BY ws."lastSeenAt" DESC, ws."id" DESC
       LIMIT 1
    ), go AS (
      SELECT s."id" FROM s
       WHERE ${isPage}::boolean
         AND EXISTS (SELECT 1 FROM rsite WHERE rsite."count" <= ${siteLim.limit})
         AND s."consentVersion" = ${site.consentVersion}
         AND s."lastSeenAt" >= ${idleCut}
         AND NOT EXISTS (SELECT 1 FROM "CrmContact" c WHERE c."id" = s."contactId" AND c."tenantId" = s."tenantId" AND c."trackingOptOut" = TRUE)
    ), upd AS (
      UPDATE "CrmWebSession" w
         SET "pageViews" = w."pageViews" + 1,
             "lastSeenAt" = ${now},
             "firstUrl" = COALESCE(w."firstUrl", ${url}),
             "utm" = COALESCE(w."utm", ${(utm ? JSON.stringify(utm) : null) as string | null}::jsonb)
        FROM go WHERE w."id" = go."id"
      RETURNING w."id", w."tenantId"
    ), ins AS (
      INSERT INTO "CrmWebEvent" ("id", "tenantId", "sessionId", "kind", "url", "title", "durationSec", "at")
      SELECT gen_random_uuid()::text, upd."tenantId", upd."id", 'PAGEVIEW'::"CrmWebEventKind", ${url}, ${title}, ${durationSec}, ${now} FROM upd
      RETURNING "id"
    )
    SELECT (SELECT "count" FROM rip) AS "ipCount", (SELECT "count" FROM rsite) AS "siteCount", (SELECT count(*) FROM ins)::int AS "written"`;
  void meta;
  const r = rows[0];
  const ipOk = r?.ipCount !== null && r?.ipCount !== undefined && Number(r.ipCount) <= ipLim.limit;
  const siteOk = r?.siteCount !== null && r?.siteCount !== undefined && Number(r.siteCount) <= siteLim.limit;
  if (!ipOk || !siteOk) return "blocked";
  return Number(r?.written ?? 0) > 0 ? "done" : "slow";
}

/**
 * `POST /t/e` — เก็บการเข้าชม 1 เหตุการณ์ (ไม่มีคำตอบใด ๆ กลับไป · ล้มเหลวเงียบเสมอ)
 * 🔴 เขียนได้ก็ต่อเมื่อ: siteKey ใช้ได้ · Origin อยู่ในโดเมนของร้าน · url อยู่ในโดเมนของร้าน · รหัสผู้เข้าชมเป็น uuid ·
 *    ผ่านเพดานความถี่ · **เวอร์ชัน consent ตรงกับของร้านตอนนี้** และการเข้าชมนั้นยังถือ consent อยู่ (ไม่ถูกถอน)
 */
export async function collect(body: unknown, meta: CollectMeta, deps: CollectDeps = {}): Promise<void> {
  try {
    // CRM C5.1-fix ▸ F5: ไม่มีตัวจำกัดที่ผู้เรียกฉีดมา (= route จริง) ⇒ ทางร้อนคำสั่งเดียว (collectHot) · ข้อสอบที่ฉีด limiter = ทางเดิม ◂
    let g: Gated | null;
    if (!deps?.limiter) {
      g = await preGate(body, meta, deps, "collect");
      if (!g) return;
      const hot = await collectHot(g, meta);
      if (hot !== "slow") return;
    } else {
      g = await gate(body, meta, deps, "collect");
    }
    if (!g) return;
    const { site, visitorId, url, now, ipHash } = g;
    const b = g.body;
    if (Number(b.cv) !== site.consentVersion) return; // เวอร์ชันเก่า = ต้องขอความยินยอมใหม่ก่อน
    const type = str(b.t);
    if (type !== "page" && type !== "event" && type !== "identify") return;

    let session = await latestSession(site.systemId, visitorId);
    if (!session || session.consentVersion !== site.consentVersion) return; // ไม่เคยยอมรับ / ถอนแล้ว / เวอร์ชันเก่า = ศูนย์แถว
    if (now.getTime() - new Date(session.lastSeenAt).getTime() > WEB_SESSION_IDLE_MS) {
      const fresh = await openSession(site, visitorId, { consentVersion: site.consentVersion, url, referrer: cleanReferrer(b.r), userAgent: str(meta?.userAgent), ipHash, now });
      if (!fresh) return;
      session = fresh;
    }
    if (await sessionOptedOut(session)) return; // AUDIT-CLASS X8: ลูกค้าขอไม่ให้ติดตาม = หยุดเก็บทันที

    if (type === "identify") {
      const ticket = readIdentifyTicket(b.ct, { tenantId: site.tenantId, systemId: site.systemId }, now);
      if (!ticket) return; // AUDIT-CLASS X8: อีเมล/เบอร์/contactId ที่หน้าเว็บส่งมาดิบ ๆ ไม่มีความหมายเลย
      // 🔴 (รีวิวรอบ 2 · S2) ตั๋วใช้ได้ครั้งเดียว — เผาหลังตรวจว่าเป็นตั๋วของร้าน/ระบบนี้จริงแล้วเท่านั้น
      //    (ถ้าเผาก่อนตรวจ ใครก็ยิงตั๋วที่ดักมาไปที่เว็บของร้านอื่นเพื่อ "เผาทิ้ง" ก่อนเจ้าของตัวจริงจะได้ใช้)
      if (!(await consumeIdentifyTicket(ticket.j, deps?.limiter))) return;
      await identify({ tenantId: site.tenantId, systemId: site.systemId }, { visitorId, contactId: ticket.c, by: "EMAIL_CLICK" }, { now });
      wakeOutbox(); // CRM C5.5-fix13 ▸ P-it5-2 sweep: event ผูกผู้เข้าชม (identify commit แล้ว) — เฉพาะชนิด identify (ไม่ใช่ทุกการเข้าชม) ◂
      return;
    }

    const title = str(b.ti).slice(0, 300) || null;
    if (type === "page") {
      const utm = utmOf(url);
      const durationSec = Number.isFinite(Number(b.d)) ? Math.min(Math.max(Math.floor(Number(b.d)), 0), 86_400) : null;
      // AUDIT-CLASS X3: ตัวนับ + แถวเหตุการณ์ในคำสั่งเดียว (พันคำขอพร้อมกัน = พันแถว · pageViews พอดี)
      await prisma.$executeRaw`
        WITH s AS (
          UPDATE "CrmWebSession"
             SET "pageViews" = "pageViews" + 1,
                 "lastSeenAt" = ${now},
                 "firstUrl" = COALESCE("firstUrl", ${url}),
                 "utm" = COALESCE("utm", ${(utm ? JSON.stringify(utm) : null) as string | null}::jsonb)
           WHERE "id" = ${session.id}
          RETURNING "id", "tenantId"
        )
        INSERT INTO "CrmWebEvent" ("id", "tenantId", "sessionId", "kind", "url", "title", "durationSec", "at")
        SELECT gen_random_uuid()::text, s."tenantId", s."id", 'PAGEVIEW'::"CrmWebEventKind", ${url}, ${title}, ${durationSec}, ${now} FROM s`;
      return;
    }
    const name = str(b.n).slice(0, 80) || null;
    await prisma.$executeRaw`
      WITH s AS (UPDATE "CrmWebSession" SET "lastSeenAt" = ${now} WHERE "id" = ${session.id} RETURNING "id", "tenantId")
      INSERT INTO "CrmWebEvent" ("id", "tenantId", "sessionId", "kind", "url", "title", "meta", "at")
      SELECT gen_random_uuid()::text, s."tenantId", s."id", 'CLICK'::"CrmWebEventKind", ${url}, ${title},
             ${JSON.stringify({ name })}::jsonb, ${now} FROM s`;
  } catch (e) {
    await logOps("WARN", "crm", `เก็บการเข้าชมเว็บไม่สำเร็จ — ${e instanceof Error ? e.name : "unknown"}`, {}).catch(() => {});
  }
}

/**
 * `POST /t/consent` — ยอมรับ / ปฏิเสธ / ถอนความยินยอม
 * 🔴 ปฏิเสธ = **ศูนย์แถว** (ไม่มีแม้ session) · ถอน = เคลียร์ consentVersion ของทุกการเข้าชมของผู้เข้าชมรายนี้
 *    ⇒ "ความจริง" เรื่องความยินยอมอยู่ฝั่งเซิร์ฟเวอร์ ไม่ใช่คุกกี้บนเครื่องลูกค้า
 */
export async function recordConsent(body: unknown, meta: CollectMeta, deps: CollectDeps = {}): Promise<void> {
  try {
    const g = await gate(body, meta, deps, "consent");
    if (!g) return;
    const { site, visitorId, url, now, ipHash } = g;
    const decision = str(g.body.d);
    if (decision !== "accept" && decision !== "decline" && decision !== "revoke") return;

    if (decision !== "accept") {
      // AUDIT-CLASS X8: ปฏิเสธ/ถอน = หยุดเก็บทันที · ไม่สร้างแถวใหม่แม้แต่แถวเดียว
      await prisma.crmWebSession.updateMany({ where: { systemId: site.systemId, visitorId }, data: { consentVersion: null } });
      return;
    }
    if (Number(g.body.cv) !== site.consentVersion) return;

    const existing = await latestSession(site.systemId, visitorId);
    // CRM C4.4-fix3 ▸ (finding c) ยอมรับใหม่หลังถอน/ปฏิเสธ = การเข้าชมรอบใหม่เสมอ — แถวที่ถูกถอนเก็บหน้าที่ดูก่อนการถอนไว้
    //   ถ้า "ต่ออายุ" แถวนั้นกลับมา หน้าเหล่านั้นจะกลายเป็นข้อมูลที่ยินยอมอีกครั้งทั้งที่เจ้าของถอนไปแล้ว (และถูกผูกเข้าลูกค้าได้) ◂
    //   r2 (review N8) ▸ เช่นเดียวกัน: แถวที่ยินยอมไว้กับข้อความ **เวอร์ชันเก่า** ไม่ถูก "อัปเกรด" (หน้าที่ดูก่อนร้านออกเวอร์ชันใหม่ต้องไม่กลายเป็น
    //   ข้อมูลที่ยินยอมตามข้อความใหม่ — มติ "ประวัติแบบไม่ระบุตัวก่อนเปลี่ยนเวอร์ชันไม่ถูกผูก") ⇒ ยอมรับเวอร์ชันใหม่ = รอบใหม่เสมอ ◂
    const fresh = existing && existing.consentVersion === site.consentVersion && now.getTime() - new Date(existing.lastSeenAt).getTime() <= WEB_SESSION_IDLE_MS ? existing : null;
    const utm = utmOf(url);
    const session =
      fresh ??
      (await openSession(site, visitorId, { consentVersion: site.consentVersion, url, referrer: cleanReferrer(g.body.r), userAgent: str(meta?.userAgent), ipHash, now }));
    if (!session) return;
    if (fresh) {
      await prisma.crmWebSession.updateMany({
        where: { id: session.id },
        data: {
          consentVersion: site.consentVersion,
          consentAt: now,
          lastSeenAt: now,
          ipHash,
          userAgent: str(meta?.userAgent).slice(0, 200) || null,
          ...(url ? { firstUrl: url } : {}),
          ...(utm ? { utm: utm as Json } : {}),
        },
      });
    }
    await prisma.crmWebEvent.create({
      data: { tenantId: site.tenantId, sessionId: session.id, kind: "CONSENT", url, meta: { v: site.consentVersion } as Json, at: now },
    });
  } catch (e) {
    await logOps("WARN", "crm", `บันทึกความยินยอมคุกกี้ไม่สำเร็จ — ${e instanceof Error ? e.name : "unknown"}`, {}).catch(() => {});
  }
}

// CRM C4.4-fix3 ▸ ตั๋วผู้เข้าชม: ออก (`/t/v`) · แลก (ฟอร์ม) · สวิตช์ของหน้า `/f` ─────────────────────────

export type VisitorTicketMint = { ticket: string; origin: string };

/**
 * `POST /t/v` — ออกตั๋วผู้เข้าชม 1 ใบให้สคริปต์ติดตามบนหน้าของร้าน (ส่งต่อให้ iframe ฟอร์มของเราทาง postMessage)
 * 🔴 AUDIT-CLASS X7: ด่านเดียวกับ `/t/e` ทุกข้อ (body ≤ เพดาน · siteKey ใช้ได้ (ไม่รู้จัก/ปิด/uiVersion 1 = null) · Origin https
 *    ในโดเมนของร้าน · url ของหน้าในโดเมนของร้าน · รหัสผู้เข้าชม uuid · เวอร์ชัน consent ตรงของร้าน) + ถังต่อ IP ของตัวเอง + ถังต่อเว็บไซต์
 *    ร่วมกับ `/t/e` · ไม่ผ่านข้อใด = `null` ⇒ route ตอบ 204 เปล่าแบบเดียวกันทุกไบต์ (ไม่มีทางรู้ว่า "ผู้เข้าชมนี้มีอยู่ไหม/ยินยอมไหม")
 * 🔴 AUDIT-CLASS X8: ออกตั๋วเฉพาะเมื่อ **การเข้าชมล่าสุด** ของผู้เข้าชมรายนี้ถือ consent เวอร์ชันปัจจุบัน และผู้ติดต่อที่ผูกอยู่ (ถ้ามี)
 *    ไม่ได้ขอหยุดติดตาม · ไม่เขียนแถวใด ๆ (นอกจากถังความถี่) · ไม่ log ตั๋ว
 */
export async function mintVisitorTicket(body: unknown, meta: CollectMeta, deps: CollectDeps = {}): Promise<VisitorTicketMint | null> {
  try {
    const g = await preGate(body, meta, deps, "ticket");
    if (!g) return null;
    const { site, visitorId, now } = g;
    if (Number(g.body.cv) !== site.consentVersion) return null;
    const limiter = deps?.limiter ?? ((key: string, spec: { limit: number; windowMs: number }) => checkRateLimitDb(key, spec));
    if (!(await limiter(ipBucketKey("ticket", g.ipHash), TRACKING_RATE_LIMITS.visitorTicketPerIp)).ok) return null;
    if (!(await limiter(`crm:ts:${site.siteKey}`, TRACKING_RATE_LIMITS.collectPerSite)).ok) return null;
    const session = await latestSession(site.systemId, visitorId);
    if (!session || session.consentVersion !== site.consentVersion) return null; // ไม่เคยยอมรับ · ปฏิเสธ · ถอน · เวอร์ชันเก่า
    if (await sessionOptedOut(session)) return null;
    const ticket = visitorTicket({ tenantId: site.tenantId, systemId: site.systemId, siteKey: site.siteKey, visitorId, consentVersion: site.consentVersion }, now);
    return { ticket, origin: str(meta?.origin) };
  } catch (e) {
    await logOps("WARN", "crm", `ออกตั๋วผู้เข้าชมไม่สำเร็จ — ${e instanceof Error ? e.name : "unknown"}`, {}).catch(() => {});
    return null;
  }
}

/**
 * แลกตั๋วผู้เข้าชมที่ฟอร์ม `/f/<token>` แนบมา → การเข้าชมที่จะผูกกับคำตอบ (ผู้เรียก: `forms/crm-source.ts` ผ่าน facade)
 *   ลำดับ: เปิดผนึก/อายุ/ชนิด → ร้าน + ระบบ CRM ในตั๋ว **ต้องตรง** ระบบปลายทางของฟอร์ม (`ctx`) → siteKey ในตั๋วยังชี้ระบบเดิม และร้านยังไม่ได้
 *   ออกข้อความคุกกี้เวอร์ชันใหม่ → **เผา** jti (store เดียวกับตั๋วอีเมล) → การเข้าชมล่าสุดที่ถือ consent เวอร์ชันปัจจุบัน
 * 🔴 เผาหลังตรวจว่าเป็นตั๋วของระบบนี้จริงเท่านั้น (ตั๋วของร้าน B ที่ถูกยื่นบนฟอร์มร้าน A ต้องไม่ถูกเผาทิ้งแทนเจ้าของ) — แบบเดียวกับตั๋วอีเมล
 * 🔴 ไม่ผ่าน = `null` + WARN หนึ่งแถว (เหตุผลเป็นรหัสสั้น ไม่มีตั๋ว/รหัสผู้เข้าชม) — ฟอร์มยังบันทึกได้ตามปกติ ผู้กรอกไม่เห็นอะไรเลย
 */
export async function redeemVisitorTicket(
  ctx: { tenantId: string; systemId: string },
  ticket: unknown,
  opts: { now?: Date; limiter?: (key: string, spec: { limit: number; windowMs: number }) => Promise<{ ok: boolean }> } = {},
): Promise<string | null> {
  const now = opts?.now ?? new Date();
  const warn = (why: string) =>
    logOps("WARN", "crm", `ตั๋วผู้เข้าชมที่แนบมากับฟอร์มใช้ผูกประวัติการเข้าชมไม่ได้ (${why}) — คำตอบฟอร์มบันทึกตามปกติ แต่ไม่ผูกการเข้าชม · ระบบ ${str(ctx?.systemId)}`, {
      ...(str(ctx?.tenantId) ? { tenantId: str(ctx?.tenantId) } : {}),
    }).catch(() => {});
  const refuse = async (why: string): Promise<null> => {
    await warn(why);
    return null;
  };
  try {
    const p = readVisitorTicket(ticket, now);
    if (!p) return refuse("INVALID");
    if (!safeEqualHex(p.t, str(ctx?.tenantId)) || !safeEqualHex(p.s, str(ctx?.systemId))) return refuse("MISMATCH");
    const site = await resolveSite(p.sk);
    if (!site || site.tenantId !== p.t || site.systemId !== p.s || site.consentVersion !== p.cv) return refuse("STALE");
    if (!(await consumeIdentifyTicket(p.j, opts?.limiter))) return refuse("REPLAY");
    const sessionId = await latestConsentedSessionId(p.t, p.s, p.v);
    if (!sessionId) return refuse("NO_CONSENT");
    // CRM C4.4-fix3 r2 ▸ (review N8/N12) ผู้ติดต่อที่ผูกกับการเข้าชมนี้ขอหยุดติดตามหลังออกตั๋ว ⇒ ไม่ผูก (ตรวจซ้ำตอนแลก ไม่ใช่แค่ตอนออก) ◂
    const row = await prisma.crmWebSession.findFirst({ where: { id: sessionId, tenantId: p.t, systemId: p.s }, select: SESSION_COLS });
    if (!row || (await sessionOptedOut(row))) return refuse("OPT_OUT");
    return sessionId;
  } catch (e) {
    await warn(e instanceof Error ? e.name : "unknown");
    return null;
  }
}

/**
 * หน้า `/f/<token>` ควรเปิด "รับตั๋วจากหน้าเว็บที่ฝัง" ไหม และรับจากหน้าเว็บโดเมนไหนได้ — ระบบ CRM ปลายทางของฟอร์มต้องเป็น uiVersion 2 +
 *   เปิดติดตามเว็บ + มี siteKey และโดเมน ⇒ คืน **โดเมนติดตามของระบบนั้น** · ไม่เข้าเงื่อนไข = `[]` (ร้าน uiVersion 1 ทุกร้านบน prod /
 *   ปิดการติดตาม = หน้าฟอร์มไม่ติดตั้งตัวฟังและไม่ส่งข้อความใด ๆ — พฤติกรรมเดิมทุกอย่าง)
 * CRM C4.4-fix3 r2 ▸ (review N6) หน้าฟอร์มรับตั๋วเฉพาะเมื่อ origin ของหน้าที่ฝังอยู่ในโดเมนชุดนี้ (กติกาเดียวกับ `originAllowed`) ⇒ เว็บอื่น
 *   ที่ฝังฟอร์มของร้านไว้ "ยัดตั๋ว" ของผู้เข้าชมที่ตัวเองสร้างให้ผู้กรอกไม่ได้ · โดเมนชุดนี้คือเว็บของร้านเอง (ที่ฝังฟอร์มอยู่แล้ว) ◂
 */
export async function visitorHandoverHosts(tenantId: string, systemId: string): Promise<string[]> {
  if (!str(tenantId) || !str(systemId)) return [];
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { settings: true } });
  if (!sys) return [];
  const web = webSettingsOf(sys.settings);
  return web.enabled && !!web.siteKey && web.domains.length > 0 && parseCrmSettings(sys.settings).uiVersion === 2 ? [...web.domains] : [];
}
// ◂ CRM C4.4-fix3

// ───────────────────────── ระบุตัวตน ─────────────────────────

export type IdentifyResult = { bound: number; activityId: string | null; skipped?: "V1" | "OPT_OUT" | "NOT_FOUND" | "NO_SESSIONS" };

/**
 * ผูกการเข้าชมย้อนหลังของผู้เข้าชมรายนี้เข้ากับผู้ติดต่อ (ฟอร์ม · คลิกลิงก์ในอีเมล · พอร์ทัล)
 * 🔴 ไม่แตะการเข้าชมที่ผูกกับ "คนอื่น" ไว้แล้ว (เครื่องที่ใช้ร่วมกันในบ้าน) · รอบใหม่ของผู้เข้าชมรายนี้จึงสืบทอดคนล่าสุด
 * 🔴 AUDIT-CLASS X4: ล็อกต่อผู้เข้าชม **และ** ต่อ (ผู้ติดต่อ, วันไทย) ⇒ ยิงพร้อมกันกี่ครั้งก็ได้กิจกรรม 1 รายการ/วัน และ event 1 ใบ
 */
export async function identify(
  ctx: { tenantId: string; systemId: string },
  input: { visitorId: string; contactId: string; by: IdentifyBy },
  opts: { now?: Date } = {},
): Promise<IdentifyResult> {
  const now = opts?.now ?? new Date();
  const visitorId = str(input?.visitorId);
  const contactId = str(input?.contactId);
  const by: IdentifyBy = isIdentifyBy(input?.by) ? input.by : "FORM";
  if (!visitorId || !contactId) return { bound: 0, activityId: null, skipped: "NOT_FOUND" };
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, settings: true } });
  if (!sys) return { bound: 0, activityId: null, skipped: "NOT_FOUND" };
  if (parseCrmSettings(sys.settings).uiVersion !== 2) return { bound: 0, activityId: null, skipped: "V1" };
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, companyId: true, trackingOptOut: true },
  });
  if (!contact) return { bound: 0, activityId: null, skipped: "NOT_FOUND" };
  if (contact.trackingOptOut) return { bound: 0, activityId: null, skipped: "OPT_OUT" };

  const day = thaiDayKey(now);
  const sourceRef = `web#${contactId}#${day}`;
  const cutoff = new Date(now.getTime() - IDENTIFY_LOOKBACK_DAYS * DAY_MS);
  // CRM C4.4-fix3 ▸ (รีวิว finding c · PDPA · AUDIT-CLASS X8) ผูกได้เฉพาะการเข้าชมที่ **ความยินยอมยังใช้ได้ตอนนี้** = ถือ consent
  //   เวอร์ชันปัจจุบันของร้าน · แถวที่ถูกถอน/ปฏิเสธ (null) หรือยอมรับแค่ข้อความเวอร์ชันเก่า ไม่ถูกผูก ไม่ถูกเขียน IDENTIFY ทับ ·
  //   ผู้เข้าชมที่ไม่มีการเข้าชมที่ยินยอมอยู่เลย = NO_SESSIONS (ไม่เขียนอะไร) — ทางไหนเรียกมาก็ตาม (ฟอร์ม · อีเมล · ตั๋ว) ◂
  const consentNow = webSettingsOf(sys.settings).consentVersion;

  const out = await prisma.$transaction(async (tx) => {
    for (const k of [`crm:web-visitor:${ctx.systemId}:${visitorId}`, `crm:web-day:${ctx.systemId}:${contactId}:${day}`].sort()) await lockKey(tx, k);
    const all = await tx.crmWebSession.findMany({ where: { systemId: ctx.systemId, visitorId, consentVersion: consentNow }, orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }], select: SESSION_COLS });
    if (all.length === 0) return { bound: 0, activityId: null, skipped: "NO_SESSIONS" as const, sessionCount: 0, pageViews: 0, firstUrl: null as string | null };
    const bound = await tx.crmWebSession.updateMany({
      // AUDIT-CLASS X1 (รีวิวรอบ 2 · N10): ผูก tenantId ด้วยเสมอ — `systemId` เป็นของร้านนี้อยู่แล้ว แต่เงื่อนไขที่
      //   ครบทั้งคู่คือกติกาของทั้งโมดูล (วันที่ id ชนกันหรือคิวรีถูกคัดลอกไปใช้ที่อื่น ยังปลอดภัย)
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, visitorId, contactId: null, startedAt: { gte: cutoff }, consentVersion: consentNow },
      data: { contactId, identifiedBy: by },
    });
    // เจตนา "ผู้เข้าชมรายนี้คือผู้ติดต่อคนนี้" — รอบใหม่ของผู้เข้าชมสืบทอดจากที่นี่ (ไม่มีคอลัมน์เก็บ · เก็บเป็นเหตุการณ์)
    const rows = await tx.$queryRaw<{ contactId: string | null }[]>`
      SELECT e."meta"->>'contactId' AS "contactId" FROM "CrmWebEvent" e JOIN "CrmWebSession" s ON s."id" = e."sessionId"
       WHERE s."systemId" = ${ctx.systemId} AND s."visitorId" = ${visitorId} AND e."kind" = 'IDENTIFY' AND s."consentVersion" IS NOT NULL
       ORDER BY e."at" DESC, e."id" DESC LIMIT 1`;
    // CRM C4.4-fix3 r2 ▸ (review S1) กติกาเดียวกับ `lastIdentifiedContact`: IDENTIFY บนแถวที่ถูกถอนไม่นับ — ไม่งั้นระบุเป็นคนเดิมหลัง
    //   ถอน→ยอมรับใหม่ จะ "เห็นว่ามีแล้ว" แต่ตัวสืบทอดมองไม่เห็น ⇒ รอบถัดไปไม่สืบทอดตัวตน ◂
    if (rows[0]?.contactId !== contactId) {
      await tx.crmWebEvent.create({ data: { tenantId: ctx.tenantId, sessionId: all[0].id, kind: "IDENTIFY", meta: { contactId, by } as Json, at: now } });
    }
    if (bound.count === 0) return { bound: 0, activityId: null, sessionCount: 0, pageViews: 0, firstUrl: null as string | null };

    const boundRows = await tx.crmWebSession.findMany({ where: { systemId: ctx.systemId, visitorId, contactId }, select: { id: true, pageViews: true, firstUrl: true, startedAt: true } });
    const pageViews = boundRows.reduce((n, s) => n + Number(s.pageViews ?? 0), 0);
    const firstUrl = [...boundRows].sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt))[0]?.firstUrl ?? null;

    // กิจกรรม WEB **1 รายการต่อวันไทย** ต่อผู้ติดต่อ (วันของร้าน ไม่ใช่วัน UTC — ร้านเปิด 00:00–07:00 จะเพี้ยนไป 1 วัน)
    const dayStart = new Date(Date.parse(`${day}T00:00:00+07:00`));
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const already = await tx.crmActivity.findFirst({
      where: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        contactId,
        type: "WEB",
        OR: [{ sourceRef }, { startAt: { gte: dayStart, lt: dayEnd } }],
      },
      select: { id: true },
    });
    const activity =
      already ??
      (await recordSystemActivityInTx(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId }, {
        type: "WEB",
        source: "WEB",
        sourceRef,
        title: "ลูกค้าเข้าชมเว็บไซต์ของร้าน",
        contactId,
        companyId: contact.companyId ?? null,
        dealId: null,
        at: now,
      }));
    // AUDIT-CLASS X8: payload เป็น id/ตัวเลขล้วน (ไม่มีชื่อ เบอร์ อีเมล) · CRM C5.4-B L5-m6: ไม่มี firstUrl (url เป็นพฤติกรรมของคน —
    //   ไปถึง webhook/automation แล้วค้างใน WebhookDelivery หลังลบข้อมูล) · ผู้บริโภคที่ต้องการอ่านจาก CrmWebSession ตามสิทธิ์ ◂
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: "crm.web.identified",
      idempotencyKey: `crm.web.identified#${contactId}#${day}`,
      payload: { contactId, systemId: ctx.systemId, visitorId, sessionCount: bound.count, pageViews, by },
    });
    return { bound: bound.count, activityId: activity.id, sessionCount: bound.count, pageViews, firstUrl };
  }, TX_OPTS);

  return { bound: out.bound, activityId: out.activityId, ...("skipped" in out && out.skipped ? { skipped: out.skipped } : {}) };
}

// ───────────────────────── ล้างตามอายุ (retention) ─────────────────────────

export type PurgeResult = { sessionsDeleted: number; sessionsSummarised: number; eventsDeleted: number; /** C5.4-B L5-m5 */ clicksDeleted: number };

/**
 * ล้างข้อมูลการเข้าชมที่เกินอายุเก็บของแต่ละระบบ (ค่าเริ่มต้น 180 วัน · นับจาก `lastSeenAt`)
 *   ไม่รู้ว่าเป็นใคร ⇒ ลบทั้งการเข้าชม (เหตุการณ์ตามไปด้วย) · รู้ว่าเป็นใคร ⇒ ลบเหตุการณ์ เหลือสรุป (จำนวนหน้า/หน้าแรก)
 *   และล้าง `ipHash`/`userAgent` ทิ้ง · กิจกรรม WEB ในไทม์ไลน์ของลูกค้าไม่ถูกแตะ
 * 🔴 ครอบระบบที่ยัง uiVersion 1 ด้วย (มติผู้คุมงาน C2.6 ข้อ 7 + ข้อสอบ `C2.6-U.5`: การเก็บข้อมูลเกินอายุเป็นเรื่อง
 *    กฎหมาย ไม่ใช่ฟีเจอร์ของหน้าจอ) — **ยกเว้น** ผู้เรียกที่ขอ `v2Only` มาเอง
 * CRM C2.10 ▸ `v2Only` + `deadline`/`signal` (มติผู้คุมงานรอบแก้ 25 ก.ย. 2569 ข้อ 6 — B4)
 *   งานรายวัน `crm.purge.web` ที่ใบ C2.10 ลงทะเบียน ต้องไม่แตะระบบ uiVersion 1 (R-E.14 — ประตูของทุกงานในใบนี้)
 *   ⇒ ตัวงานส่ง `v2Only: true` และตัวกรองอยู่ **ใน SQL** แบบเดียวกับรอบกวาดใหม่ทั้งสามของใบนี้
 *   🔴 ค่าปริยายยังเป็น "ครอบทุกระบบ" โดยตั้งใจ: กลับค่าปริยายคือกลับมติ C2.6 ข้อ 7 และทำให้ `C2.6-U.5` แดง
 *      (ผู้เรียกตรง ๆ = หน้าที่ตามกฎหมาย · ผู้เรียกที่เป็นงานของ CRM v2 = ขอบเขต v2) — ดูรายงานรอบแก้ของใบ C2.10
 *   🔴 งบเวลา: หยุด **ระหว่างระบบ** (ทุกคำสั่งของระบบหนึ่งเป็น SQL ก้อนเดียวที่ตัดครึ่งไม่ได้) ⇒ ไม่มีสถานะค้าง
 * 🔴 AUDIT-CLASS X5: ทุกคำสั่งมีเงื่อนไข + RETURNING ⇒ รันซ้อนกันสองรอบ ผลรวมยังเท่าของจริง (รอบหลังได้ 0)
 */
export async function purgeWeb(
  now: Date = new Date(),
  opts: { tenantIds?: string[]; systemIds?: string[]; v2Only?: boolean; deadline?: number; signal?: AbortSignal } = {},
): Promise<PurgeResult> {
  const tenantIds = Array.isArray(opts?.tenantIds) ? opts.tenantIds.filter((t) => typeof t === "string" && t) : null;
  const systemIds = Array.isArray(opts?.systemIds) ? opts.systemIds.filter((x) => typeof x === "string" && x) : null;
  const out: PurgeResult = { sessionsDeleted: 0, sessionsSummarised: 0, eventsDeleted: 0, clicksDeleted: 0 };
  if ((tenantIds && tenantIds.length === 0) || (systemIds && systemIds.length === 0)) return out;
  const stop = () => !!opts.signal?.aborted || (typeof opts.deadline === "number" && Date.now() > opts.deadline - 500);
  const systems = await prisma.appSystem.findMany({
    where: {
      type: "CRM",
      ...(opts.v2Only === true ? { settings: { path: ["crm", "uiVersion"], equals: 2 } } : {}),
      ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
      ...(systemIds ? { id: { in: systemIds } } : {}),
    },
    select: { id: true, tenantId: true, settings: true },
  });
  for (const sys of systems) {
    if (stop()) return out;
    const days = webSettingsOf(sys.settings).retentionDays;
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const events = await prisma.$executeRaw`
      DELETE FROM "CrmWebEvent" e USING "CrmWebSession" s
       WHERE e."sessionId" = s."id" AND s."systemId" = ${sys.id} AND s."lastSeenAt" < ${cutoff}`;
    out.eventsDeleted += Number(events);
    const deleted = await prisma.$queryRaw<{ id: string }[]>`
      DELETE FROM "CrmWebSession" WHERE "systemId" = ${sys.id} AND "lastSeenAt" < ${cutoff} AND "contactId" IS NULL RETURNING "id"`;
    out.sessionsDeleted += deleted.length;
    const summarised = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE "CrmWebSession" SET "ipHash" = NULL, "userAgent" = NULL, "purgedAt" = ${now}
       WHERE "systemId" = ${sys.id} AND "lastSeenAt" < ${cutoff} AND "contactId" IS NOT NULL AND "purgedAt" IS NULL RETURNING "id"`;
    out.sessionsSummarised += summarised.length;
    // CRM C5.4-B ▸ L5-m5: คลิกของลิงก์ติดตาม (ผู้ติดต่อ · user agent · เวลา) อายุเก็บเดียวกับการเข้าเว็บ — ตัวนับของลิงก์ (clicks/uniqueClicks) คงอยู่ ◂
    const clicks = await prisma.$executeRaw`
      DELETE FROM "CrmTrackedClick" c USING "CrmTrackedLink" l
       WHERE c."linkId" = l."id" AND l."systemId" = ${sys.id} AND l."tenantId" = ${sys.tenantId} AND c."at" < ${cutoff}`;
    out.clicksDeleted += Number(clicks);
  }
  return out;
}

// ───────────────────────── สถิติ / ไทม์ไลน์ ─────────────────────────

export async function webStats(ctx: TrackingCtx, actor: MemberActor, opts: { days?: number } = {}): Promise<{ sessions: number; consented: number; identified: number; webLeads: number }> {
  await enter(ctx, actor);
  const days = Number.isFinite(opts?.days) ? Math.min(Math.max(Math.floor(Number(opts?.days)), 1), 365) : 30;
  const since = new Date(Date.now() - days * DAY_MS);
  const where = { systemId: ctx.systemId, tenantId: ctx.tenantId, startedAt: { gte: since } };
  const [sessions, consented, identified, leads] = await Promise.all([
    prisma.crmWebSession.count({ where }),
    prisma.crmWebSession.count({ where: { ...where, consentVersion: { not: null } } }),
    prisma.crmWebSession.count({ where: { ...where, contactId: { not: null } } }),
    prisma.crmContact.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, sourceKind: "WEB_FORM", createdAt: { gte: since } } }),
  ]);
  return { sessions, consented, identified, webLeads: leads };
}

export type WebTimelineDto = {
  sessions: {
    id: string;
    startedAt: Date;
    lastSeenAt: Date;
    pageViews: number;
    firstUrl: string | null;
    utm: Record<string, string> | null;
    identifiedBy: string | null;
    events: { kind: string; url: string | null; title: string | null; at: Date; durationSec: number | null }[];
  }[];
};

/**
 * ไทม์ไลน์เว็บของผู้ติดต่อ 1 คน (บล็อกบนหน้า 360) — ตามการมองเห็นของผู้ดู (มองไม่เห็นผู้ติดต่อ = NOT_FOUND)
 * 🔴 DTO ไม่มี `ipHash`/`userAgent` (หน้าจอไม่ต้องรู้ และไม่ควรรู้)
 */
export async function webTimeline(ctx: TrackingCtx, actor: MemberActor, contactId: string): Promise<WebTimelineDto> {
  await enter(ctx, actor, ""); // ไม่ต้องมีคีย์ตั้งค่า — ใครเห็นผู้ติดต่อคนนี้ก็เห็นไทม์ไลน์ของเขา
  const scope = await contactWhere({ tenantId: ctx.tenantId, systemId: ctx.systemId }, actor);
  const contact = str(contactId) ? await prisma.crmContact.findFirst({ where: { AND: [scope, { id: contactId }] }, select: { id: true } }) : null;
  if (!contact) throw fail("NOT_FOUND", CONTACT_404);
  const sessions = await prisma.crmWebSession.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, contactId: contact.id },
    orderBy: [{ startedAt: "desc" }],
    take: 50,
    select: { id: true, startedAt: true, lastSeenAt: true, pageViews: true, firstUrl: true, utm: true, identifiedBy: true },
  });
  const events = sessions.length
    ? await prisma.crmWebEvent.findMany({
        where: { sessionId: { in: sessions.map((s) => s.id) } },
        orderBy: [{ at: "asc" }],
        take: 500,
        select: { sessionId: true, kind: true, url: true, title: true, at: true, durationSec: true },
      })
    : [];
  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      lastSeenAt: s.lastSeenAt,
      pageViews: s.pageViews,
      firstUrl: s.firstUrl,
      utm: isObj(s.utm) ? (s.utm as Record<string, string>) : null,
      identifiedBy: s.identifiedBy,
      events: events.filter((e) => e.sessionId === s.id).map((e) => ({ kind: String(e.kind), url: e.url, title: e.title, at: e.at, durationSec: e.durationSec })),
    })),
  };
}

// ───────────────────────── ฟอร์ม → CRM (หน้า /crm/settings/forms) ─────────────────────────

export type FormTargetDto = {
  formId: string;
  name: string;
  active: boolean;
  crmEnabled: boolean;
  crmSystemId: string | null;
  assignRuleId: string | null;
  scoreOnSubmit: number | null;
  utmCapture: boolean;
  createCompanyFromField: string | null;
  spamGuard: Record<string, unknown> | null;
  fieldKeys: string[];
  /** ชื่อช่องที่ชนกับด่านกันสแปม (ฟอร์มเก่า) — หน้าตั้งค่าเตือนให้เปลี่ยนชื่อ (รีวิวรอบ 2 · B1) */
  reservedKeys: string[];
  embedCode: string;
  publicUrl: string;
};

async function formsFacade() {
  return import("@/lib/modules/forms");
}

export async function listFormTargets(ctx: TrackingCtx, actor: MemberActor): Promise<FormTargetDto[]> {
  await enter(ctx, actor);
  const forms = await formsFacade();
  return forms.listCrmFormTargets(ctx.tenantId, appUrl());
}

export async function saveFormTarget(
  ctx: TrackingCtx,
  actor: MemberActor,
  formId: string,
  patch: { crmSystemId?: string | null; assignRuleId?: string | null; scoreOnSubmit?: number | null; utmCapture?: boolean; createCompanyFromField?: string | null; spamGuard?: Record<string, unknown> | null; crmEnabled?: boolean },
): Promise<FormTargetDto> {
  await enter(ctx, actor);
  const forms = await formsFacade();
  const current = await forms.getCrmFormTarget(ctx.tenantId, str(formId), appUrl());
  if (!current) throw fail("NOT_FOUND", FORM_404);
  // AUDIT-CLASS X1: ทุก id ที่ผู้ใช้เลือกต้องเป็นของร้านนี้จริง — ตรวจให้ครบ **ก่อน** เขียน (ฟอร์มต้องไม่เปลี่ยนบางส่วน)
  const nextSystemId = patch?.crmSystemId !== undefined ? str(patch.crmSystemId) || null : current.crmSystemId;
  if (patch?.crmSystemId !== undefined && nextSystemId) {
    const sys = await prisma.appSystem.findFirst({ where: { id: nextSystemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } });
    if (!sys) throw fail("VALIDATION", "ระบบ CRM ที่เลือกไม่ใช่ระบบของร้านนี้ — เลือกจากรายการอีกครั้ง");
  }
  if (patch?.assignRuleId !== undefined && str(patch.assignRuleId)) {
    const ruleSystem = nextSystemId ?? current.crmSystemId;
    const rule = await prisma.crmAssignmentRule.findFirst({
      where: { id: str(patch.assignRuleId), tenantId: ctx.tenantId, ...(ruleSystem ? { systemId: ruleSystem } : {}) },
      select: { id: true },
    });
    if (!rule) throw fail("VALIDATION", "กฎมอบหมายที่เลือกไม่ได้อยู่ในระบบ CRM ปลายทางของฟอร์มนี้ — เลือกกฎของระบบเดียวกัน");
  }
  if (patch?.scoreOnSubmit !== undefined && patch.scoreOnSubmit !== null) {
    const n = Number(patch.scoreOnSubmit);
    if (!Number.isInteger(n) || n < 0 || n > 1000) throw fail("VALIDATION", "คะแนนที่ให้เมื่อกรอกฟอร์มต้องเป็นจำนวนเต็ม 0–1000");
  }
  // 🔴 (รีวิวรอบ 2 · B1) ช่องที่ชี้ต้องไม่ใช่ชื่อที่ด่านกันสแปมสงวนไว้ — และต้องปฏิเสธ **ด้วย code ของ tracking**
  //    (CONTRACT A: error ทุกใบของ namespace นี้มี code ⇒ หน้าตั้งค่าชี้กลับไปที่ช่องที่ผิดได้)
  if (patch?.createCompanyFromField !== undefined && str(patch.createCompanyFromField) && forms.isReservedFormFieldKey(patch.createCompanyFromField)) {
    throw fail("VALIDATION", forms.FORM_RESERVED_KEY_MSG);
  }
  let saved: Awaited<ReturnType<typeof forms.updateCrmFormTarget>>;
  try {
    saved = await forms.updateCrmFormTarget(ctx.tenantId, current.formId, patch, appUrl());
  } catch (e) {
    // โมดูลฟอร์มโยน Error ธรรมดา (ไม่มี code) — ห่อเป็น VALIDATION ของ tracking เพื่อไม่ให้มี error ไร้ code หลุดออกไป
    if (e instanceof TrackingError) throw e;
    throw fail("VALIDATION", e instanceof Error && e.message ? e.message : "บันทึกการตั้งค่าฟอร์มไม่สำเร็จ — ตรวจค่าที่เลือกอีกครั้งนะ");
  }
  if (!saved) throw fail("NOT_FOUND", FORM_404);
  await audit(ctx, "crm.tracking.form.target", "FormDef", current.formId, {
    crmSystemId: saved.crmSystemId,
    assignRuleId: saved.assignRuleId,
    scoreOnSubmit: saved.scoreOnSubmit,
    utmCapture: saved.utmCapture,
  });
  return saved;
}

// ───────────────────────── ทางเข้าของ route สาธารณะ ─────────────────────────

/**
 * AUDIT-CLASS X7 (รีวิวรอบ 2 · S3) — อ่าน body ของ route สาธารณะแบบ **มีเพดานจริง**
 * 🔴 ของเดิม `await req.text()` **อ่านให้จบก่อน** แล้วค่อยวัดขนาด ⇒ คนแปลกหน้าที่ไม่ต้องมี siteKey ส่ง body 500 MB
 *    มาที่ `/t/e` ก็ทำให้เครื่องดูดทั้งก้อนเข้าหน่วยความจำก่อนจะปฏิเสธ (ยิงพร้อมกันไม่กี่สาย = เครื่องล้ม)
 * 🔴 สองชั้น: (1) `content-length` ที่ประกาศมาเกินเพดาน = ปฏิเสธ **ก่อนอ่านไบต์แรก** · (2) ไม่ประกาศ/โกหก
 *    (chunked) = อ่านทีละก้อนแล้วเลิกทันทีที่เกิน (`reader.cancel()` — ไม่รอให้ครบ)
 * 🔴 ตัวถอดรหัสทำตอนท้ายจากไบต์ที่ต่อกันแล้ว ⇒ ตัวอักษรไทยที่ถูกตัดคร่อมก้อนไม่เพี้ยน
 */
export type CappedBody = { over: boolean; text: string; bytes: number };
export async function readCappedBody(req: Request, cap: number = TRACKING_PAYLOAD_MAX_BYTES): Promise<CappedBody> {
  const max = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : TRACKING_PAYLOAD_MAX_BYTES;
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return { over: true, text: "", bytes: declared };
  const stream = (req as { body?: ReadableStream<Uint8Array> | null }).body ?? null;
  if (!stream) {
    // ไม่มี stream ให้อ่าน (runtime บางตัว / คำขอไม่มี body) — `content-length` ผ่านด่านแรกมาแล้ว แต่ยังวัดของจริงอีกครั้ง
    const text = await req.text();
    const bytes = Buffer.byteLength(text, "utf8");
    return bytes > max ? { over: true, text: "", bytes } : { over: false, text, bytes };
  }
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel().catch(() => undefined); // เลิกรับตรงนี้ — ไม่อ่านส่วนที่เหลือเลย
      return { over: true, text: "", bytes };
    }
    chunks.push(Buffer.from(value));
  }
  return { over: false, text: Buffer.concat(chunks).toString("utf8"), bytes };
}

export type LinkHit = { url: string; code: string } | null;

/**
 * `/l/<code>` — หา "ปลายทางที่เก็บไว้" แล้วนับคลิก (ทั้งหมดอยู่ที่นี่ · route เป็นแค่เปลือก)
 * 🔴 ไม่รู้จัก / ปิด / หมดอายุ = `null` ⇒ route ตอบเหมือนกันทุกไบต์ (X7)
 * 🔴 uiVersion 1 = ยัง redirect (QR ที่พิมพ์ไปแล้วต้องไม่ตาย) แต่ไม่นับอะไรเลย (R-E.14 · มติผู้คุมงาน ข้อ 6)
 */
/**
 * CRM C5.4-F ▸ L4-M3 — สถานะร้านที่ยังให้ `/l/<code>` redirect ได้: **รายการอนุญาต** (ACTIVE · PENDING) — สถานะอื่นทั้งหมด
 * (SUSPENDED "login ไม่ได้ + storefront 410" · CLOSED · PENDING_DELETE · สถานะที่เพิ่มในอนาคต · ไม่พบร้าน) = ไม่ redirect
 */
const LINK_TENANT_OK: ReadonlySet<string> = new Set(["ACTIVE", "PENDING"]);
function linkTenantMayRedirect(status: string | null): boolean {
  return !!status && LINK_TENANT_OK.has(status);
}

export async function resolveLinkHit(code: unknown, meta: { ip: string; userAgent: string; hasUniqueCookie: boolean }, now: Date = new Date()): Promise<LinkHit> {
  const c = str(code);
  if (!c || c.length > 64) return null;
  // CRM C5.1-fix ▸ F5: ลิงก์ + ระบบในคำสั่งเดียว (เดิม 2) · ถังความถี่ + ตัวนับ + แถวคลิกในคำสั่งเดียว (เดิม 2) ⇒ ทางร้อน 2 รอบไปกลับ ◂
  // CRM C5.4-F ▸ L4-M3 (ส่วนที่เป็นข้อเท็จจริง): สถานะร้านมากับคำสั่งเดียวกัน (ไม่เพิ่มรอบไปกลับ) ◂
  const found = await prisma.$queryRaw<{ id: string; code: string; url: string; tenantId: string; systemId: string; active: boolean; expiresAt: Date | null; settings: unknown; sys: boolean; tenantStatus: string | null }[]>`
    SELECT l."id", l."code", l."url", l."tenantId", l."systemId", l."active", l."expiresAt", s."settings", (s."id" IS NOT NULL) AS "sys", t."status"::text AS "tenantStatus"
      FROM "CrmTrackedLink" l
      LEFT JOIN "AppSystem" s ON s."id" = l."systemId" AND s."tenantId" = l."tenantId" AND s."type" = 'CRM'
      LEFT JOIN "Tenant" t ON t."id" = l."tenantId"
     WHERE l."code" = ${c}
     LIMIT 1`;
  const link = found[0];
  if (!link || !link.active) return null;
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) return null;
  // CRM C5.4-F ▸ L4-M3: สวิตช์ปิดของแพลตฟอร์ม — ร้านที่ไม่ได้ ACTIVE/PENDING (ระงับ/ปิด/รอลบ) ใช้ `shark.in.th/l/<code>` พาคนไปที่ไหนไม่ได้อีก
  //   (คำตอบเดียวกับรหัสที่ไม่รู้จัก · ไม่นับคลิก) ◂
  if (!linkTenantMayRedirect(link.tenantStatus)) return null;
  // CRM C6.1-LINKPOLICY ▸ มติเจ้าของ P11/Q15 ข้อ (ข): ปลายทางต้องผ่านนโยบายของระบบเจ้าของลิงก์ **ตอนนี้** (settings มากับคำสั่งเดียวกันแล้ว
  //   ไม่เพิ่มรอบไปกลับ) — โดเมนที่ถูกถอดออกจากรายการภายหลัง / ลิงก์เก่าก่อนมีนโยบาย = คำตอบเดียวกับรหัสที่ไม่รู้จัก ไม่นับคลิก ·
  //   Safe Browsing = จุดเสียบ `isDestinationBlocklisted` (ยังไม่มีรายการ — หนี้) ◂
  if (!linkDestinationAllowed(link.url, link.settings)) return null;
  try {
    const v2 = link.sys && parseCrmSettings(link.settings as Prisma.JsonValue).uiVersion === 2;
    if (v2 && !isBotUserAgent(meta?.userAgent)) {
      const uniqueInc = meta?.hasUniqueCookie ? 0 : 1;
      const lim = TRACKING_RATE_LIMITS.linkPerIp;
      // AUDIT-CLASS X3: ถังความถี่ (คำสั่งเดียวแบบ checkRateLimitDb) + ตัวนับสองตัว + แถวคลิก จบในคำสั่งเดียว — เกินเพดาน = ไม่นับ
      await prisma.$queryRaw`
        WITH ${rateBucketCte("rl", `crm:l:${ipHashFor(String(meta?.ip ?? ""), now).slice(0, 32)}`, lim.windowMs, now.getTime())},
        l AS (
          UPDATE "CrmTrackedLink" SET "clicks" = "clicks" + 1, "uniqueClicks" = "uniqueClicks" + ${uniqueInc}
           WHERE "id" = ${link.id} AND (SELECT rl."count" FROM rl) <= ${lim.limit} RETURNING "id", "tenantId"
        ), ins AS (
          INSERT INTO "CrmTrackedClick" ("id", "tenantId", "linkId", "userAgent", "at")
          SELECT gen_random_uuid()::text, l."tenantId", l."id", ${str(meta?.userAgent).slice(0, 200) || null}, ${now} FROM l
          RETURNING "id"
        )
        SELECT (SELECT count(*) FROM ins)::int AS "n"`;
    }
  } catch (e) {
    // นับไม่ได้ = ตัวเลขในรายงานขาดไป 1 — ห้ามทำให้ลูกค้าที่กดลิงก์ไปต่อไม่ได้
    await logOps("WARN", "crm", `นับคลิกลิงก์ติดตามไม่สำเร็จ — ${e instanceof Error ? e.name : "unknown"}`, { tenantId: link.tenantId }).catch(() => {});
  }
  return { url: link.url, code: link.code };
}

/** ค่า `Set-Cookie` ของ `/l/<code>` — ธง "ผู้เข้าชมรายนี้เคยถูกนับเป็นคนใหม่แล้ว" (ไม่มีตัวระบุตัวตนอยู่ในค่า) */
export const linkUniqueCookie = (code: string): string =>
  `sd_u=1; Path=/l/${encodeURIComponent(code)}; Max-Age=${LINK_UNIQUE_MAX_AGE_SEC}; HttpOnly; Secure; SameSite=Lax`;

/**
 * `/t/c/<token>` (route ของใบ C2.5) — ต่อท้ายตั๋วระบุตัวตนให้ลิงก์ที่ลูกค้ากดจากอีเมล
 * 🔴 ต่อให้เฉพาะ "คลิกที่นับจริง" ของจดหมายที่รู้ว่าเป็นของผู้ติดต่อคนไหน และปลายทางอยู่ในโดเมนของร้านเท่านั้น
 */
export async function ticketedClickUrl(
  emailId: unknown,
  url: string,
  opts: {
    counted: boolean;
    userAgent?: string | null;
    /** C5.1-fix ▸ F5: แถวที่ `emails.trackClick` อ่านมาแล้วในคำสั่งนับ (อีเมล · ผู้ติดต่อ · ระบบ) — ส่งมา = ไม่อ่านฐานซ้ำ (ความหมายเดิมทุกข้อ) ◂ */
    pre?: { emailId: string; tenantId: string; systemId: string; contactId: string | null; contactTenantId: string | null; trackingOptOut: boolean; settings: unknown } | null;
  },
  now: Date = new Date(),
): Promise<string> {
  try {
    if (!opts?.counted || isBotUserAgent(opts?.userAgent ?? "")) return url;
    const id = str(emailId);
    if (!id) return url;
    const pre = opts.pre && opts.pre.emailId === id ? opts.pre : null;
    const msg = pre
      ? { id: pre.emailId, tenantId: pre.tenantId, systemId: pre.systemId, contactId: pre.contactId }
      : await prisma.crmEmailMessage.findFirst({ where: { id }, select: { id: true, tenantId: true, systemId: true, contactId: true } });
    if (!msg?.contactId) return url;
    const contact = pre
      ? pre.contactTenantId === msg.tenantId
        ? { trackingOptOut: pre.trackingOptOut }
        : null
      : await prisma.crmContact.findFirst({ where: { id: msg.contactId, tenantId: msg.tenantId }, select: { trackingOptOut: true } });
    if (contact?.trackingOptOut) return url;
    const sys = pre
      ? pre.settings === null || pre.settings === undefined
        ? null
        : { settings: pre.settings as Prisma.JsonValue }
      : await prisma.appSystem.findFirst({ where: { id: msg.systemId, tenantId: msg.tenantId, type: "CRM" }, select: { settings: true } });
    if (!sys) return url;
    const web = webSettingsOf(sys.settings);
    if (!web.enabled || web.domains.length === 0) return url;
    if (parseCrmSettings(sys.settings).uiVersion !== 2) return url;
    const ticket = emailClickTicket({ tenantId: msg.tenantId, systemId: msg.systemId, emailId: msg.id, contactId: msg.contactId }, now);
    return appendIdentifyTicket(url, ticket, web.domains);
  } catch {
    return url;
  }
}

// ───────────────────────── สคริปต์ที่เสิร์ฟ (shark.js) ─────────────────────────

/** สคริปต์เปล่า — siteKey ที่ไม่รู้จัก / ปิดการติดตาม / ร้านยัง uiVersion 1 ได้ไฟล์นี้ **เหมือนกันทุกไบต์** (X7) */
export const NOOP_TRACKER = `(function(){window.sd=window.sd||function(){};})();\n`;

/**
 * ตัวสคริปต์ที่เว็บของร้านโหลด — เล็ก ไม่มีไลบรารี ไม่มี eval/innerHTML และ **ไม่แตะค่าในฟอร์มของลูกค้า**
 * 🔴 แบนเนอร์สร้างด้วย textContent ล้วน ๆ (ข้อความของร้านเป็นข้อความ ไม่ใช่ HTML — ร้านที่พิมพ์ `<img onerror>` ต้องไม่ยิงสคริปต์)
 * 🔴 ปลายทางเป็น url เต็ม (https) ของแอป — ถ้าใช้ `/t/e` เฉย ๆ มันจะยิงเข้าเว็บของร้านเองแล้วหาย
 * 🔴 คุกกี้ทั้งสองใบ **ไม่ใช่ HttpOnly** (สคริปต์ต้องอ่านเอง) แต่เป็น Secure + SameSite=Lax เสมอ
 */
export function trackerScript(site: { siteKey: string; consentVersion: number; consentText: string }, origin: string): string {
  const K = jsLiteral(site.siteKey);
  const CV = jsLiteral(site.consentVersion);
  const TXT = jsLiteral(site.consentText);
  // 🔴 ปลายทางถูกฝังเป็น **url เต็ม ๆ ทีละเส้น** (ไม่ใช่ origin + path ต่อกันตอนรัน): ผู้ตรวจ (คนหรือข้อสอบ) ต้องอ่าน
  //    ไฟล์ที่เสิร์ฟแล้วเห็นทันทีว่าสคริปต์ยิงไปที่ไหน — `EP+"/t/e"` ทำให้ "ไปที่ไหน" ซ่อนอยู่ในการต่อสตริงตอนรัน
  const EE = jsLiteral(`${origin}/t/e`);
  const EC = jsLiteral(`${origin}/t/consent`);
  // CRM C4.4-fix3 ▸ ตั๋วผู้เข้าชมให้ฟอร์มของเราที่ร้านฝังด้วย iframe: ปลายทาง `/t/v` + origin ของแอป (ตัวเดียวกับที่เสิร์ฟสคริปต์นี้)
  //   ฝังเป็นค่าคงที่ทั้งคู่ ⇒ ผู้ตรวจอ่านไฟล์ที่เสิร์ฟแล้วเห็นทันทีว่าตั๋วไปที่ไหนและตอบกลับไปหาใคร ◂
  const EV = jsLiteral(`${origin}/t/v`);
  const AO = jsLiteral(origin);
  return `/* shark.js — SHARK CRM web tracking (consent first) */
(function(){
  "use strict";
  var KEY=${K},CV=${CV},TXT=${TXT},EE=${EE},EC=${EC},EV=${EV},AO=${AO};
  var VC="sd_vid",CC="sd_consent",MAXAGE=15552000,D=document,W=window;
  /* 🔴 (รีวิวรอบ 2 · N12) รายชื่อ utm ต้องเป็น "ห้าตัวตามมาตรฐาน" ชุดเดียวกับฝั่งเซิร์ฟเวอร์ (cleanTrackedUrl) —
     เดิมกรองด้วยคำนำหน้า "utm_" เฉย ๆ ⇒ "utm_userid=<อีเมล>" ที่เครื่องมือการตลาดบางตัวแปะมาก็หลุดออกจากเครื่องลูกค้า
     (ห้ามใช้เครื่องหมาย backtick ในคอมเมนต์นี้ — ทั้งบล็อกอยู่ใน template literal ของสคริปต์ที่เสิร์ฟ) */
  var UTM=["utm_source","utm_medium","utm_campaign","utm_term","utm_content"];
  function ck(n){
    var parts=(" "+D.cookie).split("; ");
    for(var i=0;i<parts.length;i++){var p=parts[i].replace(/^ /,"");if(p.indexOf(n+"=")===0)return decodeURIComponent(p.slice(n.length+1));}
    return null;
  }
  function put(n,v){D.cookie=n+"="+encodeURIComponent(v)+"; Path=/; Max-Age="+MAXAGE+"; SameSite=Lax; Secure";}
  function uuid(){
    if(W.crypto&&W.crypto.randomUUID)return W.crypto.randomUUID();
    var b=new Uint8Array(16);(W.crypto||{getRandomValues:function(a){for(var i=0;i<a.length;i++)a[i]=Math.floor(Math.random()*256);return a;}}).getRandomValues(b);
    b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var s="";
    for(var i=0;i<16;i++){s+=("0"+b[i].toString(16)).slice(-2);if(i===3||i===5||i===7||i===9)s+="-";}
    return s;
  }
  function post(url,data){
    /* keepalive = คำขอไปต่อได้แม้ผู้ใช้กดไปหน้าอื่นทันที · text/plain = คำขอธรรมดา (ไม่ต้อง preflight) */
    try{return fetch(url,{method:"POST",body:JSON.stringify(data),headers:{"content-type":"text/plain;charset=UTF-8"},keepalive:true,mode:"cors",credentials:"omit"}).catch(function(){});}catch(e){return null;}
  }
  function decision(){var c=ck(CC);if(!c)return null;var m=/^([adr])(\\d+)$/.exec(c);if(!m||Number(m[2])!==CV)return null;return m[1];}
  function vid(){var v=ck(VC);if(!v){v=uuid();put(VC,v);}return v;}
  function accepted(){return decision()==="a";}
  /* 🔴 ล้าง url ฝั่งเบราว์เซอร์ก่อนส่ง: เก็บเฉพาะ utm_* ตัด #fragment — token/อีเมลที่หน้าเว็บของร้านพ่วงมาใน query
     (?email=… &token=…) จะ **ไม่ออกจากเครื่องลูกค้า** เลย (เซิร์ฟเวอร์ล้างอีกชั้นด้วย cleanTrackedUrl) */
  function clean(raw){
    var h=String(raw||""),i=h.indexOf("#");
    if(i>=0)h=h.slice(0,i);
    var q=h.indexOf("?");
    if(q<0)return h.slice(0,2000);
    var base=h.slice(0,q),parts=h.slice(q+1).split("&"),keep=[];
    for(var n=0;n<parts.length;n++){var nm=parts[n].split("=")[0];if(UTM.indexOf(nm)>=0)keep.push(parts[n]);}
    return (keep.length?base+"?"+keep.join("&"):base).slice(0,2000);
  }
  function send(kind,extra){
    if(!accepted())return;
    var d={k:KEY,v:vid(),cv:CV,t:kind,u:clean(location.href)};
    if(D.referrer)d.r=clean(D.referrer).split("?")[0];
    if(D.title)d.ti=String(D.title).slice(0,300);
    if(extra)for(var x in extra)if(Object.prototype.hasOwnProperty.call(extra,x))d[x]=extra[x];
    post(EE,d);
  }
  function consent(what){
    var v=what==="accept"?vid():(ck(VC)||uuid());
    return post(EC,{k:KEY,v:v,cv:CV,d:what,u:clean(location.href)});
  }
  var banner=null;
  function closeBanner(){if(banner&&banner.parentNode)banner.parentNode.removeChild(banner);banner=null;}
  function button(label,role,bg,fg){
    var b=D.createElement("button");
    b.type="button";b.textContent=label;b.setAttribute("data-sd",role);
    b.style.cssText="margin-left:8px;padding:8px 16px;border:0;border-radius:8px;cursor:pointer;font:inherit;background:"+bg+";color:"+fg;
    return b;
  }
  function showBanner(){
    if(banner||!D.body)return;
    banner=D.createElement("div");
    banner.setAttribute("data-sd","banner");
    banner.setAttribute("role","dialog");
    banner.setAttribute("aria-label","การใช้คุกกี้");
    banner.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:14px 16px;background:#111827;color:#f9fafb;font:14px/1.5 system-ui,-apple-system,sans-serif";
    var text=D.createElement("span");
    text.textContent=TXT;
    text.style.cssText="flex:1 1 240px;min-width:0";
    var box=D.createElement("div");
    box.style.cssText="flex:0 0 auto;white-space:nowrap";
    var no=button("ปฏิเสธ","decline","transparent","#f9fafb");
    no.style.border="1px solid #6b7280";
    var yes=button("ยอมรับ","accept","#22c55e","#062a13");
    no.onclick=function(){put(CC,"d"+CV);closeBanner();consent("decline");};
    yes.onclick=function(){put(CC,"a"+CV);vid();closeBanner();afterAccept(consent("accept"));};
    box.appendChild(no);box.appendChild(yes);
    banner.appendChild(text);banner.appendChild(box);
    D.body.appendChild(banner);
  }
  function ticket(){
    var m=/[?&]sd_ct=([^&#]+)/.exec(String(location.search||""));
    return m?decodeURIComponent(m[1]):null;
  }
  W.sd=function(cmd,arg){
    if(cmd==="page")return send("page");
    if(cmd==="event")return send("event",{n:String(arg==null?"":arg).slice(0,80)});
    if(cmd==="identify"){var t=ticket();if(t)return send("identify",{ct:t});return;}
    if(cmd==="revoke"){put(CC,"r"+CV);consent("revoke");return;}
  };
  /* CRM C4.4-fix3: ฟอร์มของ SHARK ที่ร้านฝังด้วย iframe (โหลดจาก origin ของแอป) ส่ง {type:"sd:form-ready"} มาขอตั๋วผู้เข้าชม
     ตอบเฉพาะเมื่อ (1) ข้อความมาจาก origin ของแอปพอดี (2) ผู้ส่งเป็น iframe ของหน้านี้จริง (3) ผู้เข้าชมยอมรับคุกกี้แล้ว
     ตั๋วถูกส่งกลับไปที่ iframe ตัวนั้นตัวเดียว ด้วย targetOrigin = origin ของแอป (ไม่ใช่ดาว) · ไม่มีตั๋วใน url/คุกกี้/storage
     เซิร์ฟเวอร์ตรวจความยินยอมอีกชั้น (ปฏิเสธ/ถอน/เวอร์ชันเก่า = ไม่มีตั๋ว) · ห้ามใช้เครื่องหมาย backtick ในคอมเมนต์นี้
     r2 (review S2): ฟอร์มที่ขอมาก่อนผู้เข้าชมกดยอมรับ ถูกจดไว้ (waiting) แล้วได้ตั๋วทันทีหลังคำขอยอมรับไปถึงเซิร์ฟเวอร์ (afterAccept)
     กรณีกดยอมรับหลังฟอร์มโหลดแล้ว หรือกดยอมรับบนหน้าเดียวกับฟอร์ม จึงยังผูกได้ */
  var waiting=[];
  function ownFrame(src){
    var fr=D.getElementsByTagName("iframe");
    for(var i=0;i<fr.length;i++){if(fr[i].contentWindow===src)return true;}
    return false;
  }
  function serve(src){
    var v=ck(VC);
    if(!v||!accepted())return;
    fetch(EV,{credentials:"omit",mode:"cors",cache:"no-store",method:"POST",headers:{"content-type":"text/plain;charset=UTF-8"},body:JSON.stringify({k:KEY,v:v,cv:CV,u:clean(location.href)})})
      .then(function(r){return r&&r.status===200?r.json():null;})
      .then(function(j){if(j&&typeof j.t==="string"&&j.t)src.postMessage({type:"sd:visitor-ticket",ticket:j.t},AO);})
      .catch(function(){});
  }
  function afterAccept(p){
    var list=waiting;waiting=[];
    var go=function(){for(var i=0;i<list.length;i++){try{if(ownFrame(list[i]))serve(list[i]);}catch(x){}}};
    if(p&&typeof p.then==="function")p.then(go,go);else go();
  }
  function onMessage(e){
    try{
      if(!e||e.origin!==AO)return;
      var m=e.data;
      if(!m||typeof m!=="object"||m.type!=="sd:form-ready")return;
      var src=e.source;
      if(!src||!ownFrame(src))return;
      if(!accepted()){if(waiting.indexOf(src)<0&&waiting.length<10)waiting.push(src);return;}
      serve(src);
    }catch(x){}
  }
  if(W.addEventListener)W.addEventListener("message",onMessage);
  function start(){
    if(accepted()){
      send("page");
      var t=ticket();
      if(t)send("identify",{ct:t});
    }else if(!decision()){showBanner();}
  }
  if(D.readyState==="loading")D.addEventListener("DOMContentLoaded",start);else start();
})();
`;
}
