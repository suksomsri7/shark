// emails-shared.ts — ค่าคงที่ · เพดาน · ตัวช่วยบริสุทธิ์ ของ "ระบบอีเมล CRM" (ใบ C2.5 · พิมพ์เขียว §4.5 §5.6 §11.4)
//
// 🔴 ไฟล์บริสุทธิ์ (client-safe): ห้าม import prisma / `@/lib/core/db` / `@/lib/env` / `next/*` / server-only /
//    ไฟล์บริการ (`./db` · `./emails`) — หน้าเขียนจดหมาย · หน้าตั้งค่าอีเมล · หน้าเธรด ('use client') ดึงเพดาน
//    ป้าย และตัวตรวจจากที่นี่ที่เดียว (ข้อสอบ `C2.5-S0.2` ตรวจความบริสุทธิ์แบบกลไก)
// 🔴 `renderInboundHtml` อยู่ที่นี่เพราะทั้งฝั่งเซิร์ฟเวอร์ (ตอน "เก็บ") และฝั่งไคลเอนต์ (ตอน "แสดงใน
//    <iframe sandbox>") ต้องใช้กติกาเดียวกัน — สองที่ = วันหนึ่งไม่ตรงกัน แล้วสคริปต์ในจดหมายของคนนอกก็ทำงาน
// AUDIT-CLASS X6: เพดานเนื้อความ/ไฟล์แนบ + บัญชีขาวชนิดไฟล์ (ชุดย่อยของ storage ลบ SVG/HTML/JS) ประกาศที่นี่ที่เดียว

import { sanitizeHtml } from "@/lib/core/sanitize";
import { bareEmail, trailingAngleAddr } from "@/lib/core/inbound-address";
import { stripTags, trimEndBlanks } from "@/lib/core/linear-text"; // CRM C5.5-fix5 ▸ ตัวตัดแท็ก/ช่องว่างแบบเชิงเส้น (รีวิว RV-1/RV-2) ◂
import { CRM_FILE_MIME_ALLOWLIST } from "./activities-shared";

// ───────────────────────── เพดาน (AUDIT-CLASS X6) ─────────────────────────

/** เนื้อความ HTML ของจดหมาย 1 ฉบับ — 500 KiB (จดหมายขายที่ยาวกว่านี้คือไฟล์แนบ ไม่ใช่จดหมาย) */
export const CRM_EMAIL_BODY_MAX_BYTES = 500 * 1024;
/** ไฟล์แนบ 1 ชิ้น — 10 MiB (เท่าเพดานไฟล์แนบของ CRM และของ route อีเมลขาเข้า) */
export const CRM_EMAIL_ATTACH_MAX_BYTES = 10 * 1024 * 1024;
/** ไฟล์แนบต่อจดหมาย — 20 ชิ้น (เท่าของบอร์ดงาน `kanban-email-in`) */
export const CRM_EMAIL_ATTACH_MAX_COUNT = 20;
/**
 * เพดานไฟล์แนบของ **ช่องเขียนจดหมายบนหน้าจอ** — 8 MiB ต่อไฟล์ และ 8 MiB รวมทุกไฟล์ต่อ 1 ฉบับ
 * 🔴 ต่ำกว่าเพดานของบริการ (10 MiB) โดยเจตนา: หน้าจอส่งไฟล์เป็น base64 ไปกับ server action ⇒ ขนาดที่วิ่งจริง
 *    โตขึ้น 4/3 เท่า และ `serverActions.bodySizeLimit` ของ next.config = 12 MB ⇒ ไฟล์ 10 MiB (base64 ≈ 13.3 MB)
 *    ถูกตัดที่ชั้นเฟรมเวิร์ก ก่อนที่โค้ดของเราจะได้เห็น = ผู้ใช้เห็นหน้าพัง ไม่เห็นข้อความบอกเหตุ
 *    8 MiB → base64 ≈ 10.7 MB + เนื้อความ/หัวข้อ ยังอยู่ใต้ 12 MB · ไฟล์ใหญ่กว่านี้ให้ส่งเป็นลิงก์
 *    (ทางเลือกที่ไม่ได้เลือกในใบนี้: เปลี่ยนเป็น FormData/อัปแยกเส้น — ของ C2.5 ต่อไปถ้าเจ้าของสั่ง)
 */
export const CRM_EMAIL_COMPOSER_ATTACH_MAX_BYTES = 8 * 1024 * 1024;
/** หัวข้อจดหมาย */
export const CRM_EMAIL_SUBJECT_MAX = 300;
/**
 * ลายเซ็นของพนักงาน — เพดานของ **ค่าที่เก็บ** (HTML หลัง sanitize) · CRM C5.5-fix5 r2 (รีวิว RV5-1)
 * 🔴 นับหลัง sanitize ไม่ใช่ที่ข้อความเข้า: sanitize ทำให้ยาวขึ้นได้ (`&` → `&amp;` · ลิงก์ได้ rel/target เพิ่ม ≈ +50%) แต่ sanitize ซ้ำ
 *    กับค่าที่เก็บแล้วได้ค่าเดิม (idempotent) ⇒ ค่าใดที่ระบบเคยเก็บ ส่งกลับมาบันทึกซ้ำ (การ์ด "การส่งของฉัน" ส่งกลับทุกครั้ง · REST อ่านแล้วเขียน)
 *    ผ่านเสมอ · เดิม (รอบแรก) นับที่ข้อความเข้า 4,000 ⇒ ลายเซ็นที่เก็บ 5,975 ตัวถูกปฏิเสธตอนบันทึกการ์ดครั้งถัดไป ช่องอื่นหายไปด้วย
 */
export const CRM_EMAIL_SIGNATURE_MAX = 8000;
/** เพดานข้อความเข้า (ก่อน sanitize — กันงานเกินจำเป็น) = 2 เท่าของเพดานที่เก็บ · หน้าจอ (maxLength) และ REST (`optText`) ใช้ค่านี้ตัวเดียว */
export const CRM_EMAIL_SIGNATURE_INPUT_MAX = 2 * CRM_EMAIL_SIGNATURE_MAX;
/** ข้อความเดียวทุกทาง (บริการ · REST · การ์ด) */
export const CRM_EMAIL_SIGNATURE_TOO_LONG_MSG = `ลายเซ็นยาวเกิน ${CRM_EMAIL_SIGNATURE_MAX.toLocaleString("en-US")} ตัวอักษร (นับรวมรูปแบบ/ลิงก์ที่ระบบจัดให้) — ย่อให้สั้นลงแล้วบันทึกอีกครั้ง`;

/**
 * ชนิดไฟล์แนบของอีเมล = ชุดเดียวกับไฟล์แนบ CRM (ชุดย่อยของ `ALLOWED_UPLOAD_TYPES` ลบ SVG)
 * 🔴 ประกาศ **ต่อ** จากรายการเดิม ไม่ลอกค่าใหม่: รายการสองชุดที่ต้อง "ตรงกัน" คือรายการที่วันหนึ่งไม่ตรงกัน
 *    SVG/HTML/JS อยู่นอกบัญชีขาวโดยเจตนา — เปิดผ่านลิงก์ส่วนตัวของร้าน = stored XSS
 */
export const CRM_EMAIL_ATTACH_MIME_ALLOWLIST: readonly string[] = CRM_FILE_MIME_ALLOWLIST;

// ───────────────────────── ค่าตั้งต้นของร้าน (พิมพ์เขียว §4.5 + มติผู้คุมงาน 24 ก.ย. ข้อ 3) ─────────────────────────

export type CrmEmailFromMode = "SHARK" | "DOMAIN";
/** SHARK = ตอบกลับเข้ากล่อง CRM · STAFF/SELF = อีเมลของพนักงานที่ส่ง · CUSTOM = ที่อยู่ที่ร้านกรอก (มติ C31) */
export type CrmEmailReplyToMode = "SHARK" | "STAFF" | "SELF" | "CUSTOM";
export type CrmEmailCopyMode = "NONE" | "IN" | "OUT" | "BOTH";

export type CrmEmailSettings = {
  inboundEnabled: boolean;
  fromMode: CrmEmailFromMode;
  fromName: string | null;
  /** ที่อยู่ผู้ส่งเมื่อ fromMode = DOMAIN (มติผู้คุมงาน ข้อ 3 — พิมพ์เขียวลืมช่องนี้) */
  fromAddr: string | null;
  replyToMode: CrmEmailReplyToMode;
  replyToAddr: string | null;
  copyToAddr: string | null;
  copyMode: CrmEmailCopyMode;
  bccCaptureEnabled: boolean;
  strangerToLead: boolean;
  trackOpens: boolean;
  trackClicks: boolean;
  retentionDays: number;
  allowUserOverride: boolean;
};

export const CRM_EMAIL_DEFAULTS: Readonly<CrmEmailSettings> = Object.freeze({
  inboundEnabled: true,
  fromMode: "SHARK",
  fromName: null,
  fromAddr: null,
  replyToMode: "SHARK",
  replyToAddr: null,
  copyToAddr: null,
  copyMode: "NONE",
  bccCaptureEnabled: true,
  strangerToLead: true,
  trackOpens: true,
  trackClicks: true,
  retentionDays: 730,
  allowUserOverride: true,
});

export const CRM_EMAIL_RETENTION_MIN_DAYS = 30;
export const CRM_EMAIL_RETENTION_MAX_DAYS = 3650;

export const CRM_EMAIL_FROM_MODES: readonly CrmEmailFromMode[] = Object.freeze(["SHARK", "DOMAIN"]);
export const CRM_EMAIL_REPLY_MODES: readonly CrmEmailReplyToMode[] = Object.freeze(["SHARK", "STAFF", "SELF", "CUSTOM"]);
export const CRM_EMAIL_COPY_MODES: readonly CrmEmailCopyMode[] = Object.freeze(["NONE", "IN", "OUT", "BOTH"]);

/**
 * ที่อยู่กล่องขาเข้าของ CRM — ตัวจริงอยู่ที่ `@/lib/core/inbound-address` (มติผู้คุมงาน F12)
 * เพราะ route `api/email/inbound` (เส้นของบอร์ดงาน) ต้องตอบคำถาม "ที่อยู่นี้ของ CRM ไหม"
 * ได้ก่อน import โมดูล CRM เลย (โมดูล CRM พังตอนโหลด = จดหมายงานของทุกร้านหายทั้งสาย)
 * ที่นี่ re-export ต่อเท่านั้น — ไม่มีสำเนาของตัวจับอยู่ในโมดูล
 */
export {
  CRM_EMAIL_SHARK_DOMAIN,
  CRM_INBOUND_KEY_RE,
  CRM_INBOUND_PREFIX,
  CRM_RECIPIENT_RE,
  CRM_THREAD_SHORT_LEN,
  CRM_THREAD_TAG_RE,
  bareEmail,
  isCrmInboundAddress,
  parseCrmRecipient,
} from "@/lib/core/inbound-address";

/**
 * AUDIT-CLASS X7: เพดานความถี่ของเส้นสาธารณะ (พิกเซล · ลิงก์ · เลิกรับ · webhook)
 * ต่อ token: กันคนกดรีเฟรชรูปในจดหมายรัว ๆ แล้วตัวเลข "เปิดอ่าน" พุ่งเป็นพัน · ต่อ IP: กันการยิงสุ่ม token
 */
export const CRM_TRACK_RATE_LIMITS: Readonly<{
  perIp: { limit: number; windowMs: number };
  perToken: { limit: number; windowMs: number };
}> = Object.freeze({
  perIp: { limit: 60, windowMs: 60_000 },
  perToken: { limit: 12, windowMs: 60 * 60_000 },
});

// CRM C5.5-fix2 ▸ hunter 2a-7: เพดานจดหมายขาเข้าต่อระบบ + ต่อผู้ส่ง (ต่อชั่วโมง · ถังเดียวของระบบ `checkRateLimitDb`)
//   เกินเพดาน = รับแล้วทิ้ง (route ตอบ 200 เหมือนเดิม · ไม่เด้งกลับ) + audit 1 บรรทัดต่อหน้าต่าง ◂
// CRM C5.5-fix8 r3 ▸ (รีวิว RV-2 → RV-6 · มติผู้คุมงาน) ถังแยกตาม "ความแข็งของหลักฐาน" — จดหมายแต่ละฉบับอยู่ในชั้นเดียวและถูกทิ้งได้
//   เฉพาะโดยถังของชั้นตัวเอง ⇒ การถล่มในชั้นที่หลักฐานอ่อนกว่า (D/T/U) ไม่มีทางทิ้งคำตอบที่ยืนยันได้ทั้งสองทาง (V)
//   V = DMARC (A-R ของ MTA เรา) **และ** หลักฐานของเธรด · D = DMARC อย่างเดียว · T = หลักฐานของเธรดอย่างเดียว (ปลอมได้ถ้าเห็นผู้รับ) ·
//   U = ไม่มีหลักฐาน (กุญแจ/เพดานเดิมของ fix2) · กุญแจผู้ส่งทุกชั้น = กล่องจดหมายตัวพิมพ์เล็กที่ตัด `+tag` ออก (เฉพาะกุญแจถัง)
//   ตัวเลขและเหตุผล: ledger/wo-notes/crm-C5.5-fix8.md รอบ 3 ◂
const INBOUND_HOUR_MS = 60 * 60_000;
export const CRM_INBOUND_RATE_LIMITS: Readonly<{
  perSender: { limit: number; windowMs: number };
  perSystem: { limit: number; windowMs: number };
  verified: { perSender: { limit: number; windowMs: number }; perSystem: { limit: number; windowMs: number } };
  dmarc: { perSender: { limit: number; windowMs: number }; perDomain: { limit: number; windowMs: number }; perSystem: { limit: number; windowMs: number } };
  thread: { perSender: { limit: number; windowMs: number }; perMessage: { limit: number; windowMs: number }; perSystem: { limit: number; windowMs: number } };
}> = Object.freeze({
  // U — ไม่มีหลักฐาน (fix2 · ไม่เปลี่ยน)
  perSender: { limit: 100, windowMs: INBOUND_HOUR_MS },
  perSystem: { limit: 1_000, windowMs: INBOUND_HOUR_MS },
  verified: { perSender: { limit: 100, windowMs: INBOUND_HOUR_MS }, perSystem: { limit: 2_000, windowMs: INBOUND_HOUR_MS } },
  dmarc: { perSender: { limit: 100, windowMs: INBOUND_HOUR_MS }, perDomain: { limit: 300, windowMs: INBOUND_HOUR_MS }, perSystem: { limit: 1_000, windowMs: INBOUND_HOUR_MS } },
  thread: { perSender: { limit: 100, windowMs: INBOUND_HOUR_MS }, perMessage: { limit: 100, windowMs: INBOUND_HOUR_MS }, perSystem: { limit: 1_000, windowMs: INBOUND_HOUR_MS } },
});

/** โดเมนอีเมลสาธารณะ — ไม่มีถังต่อโดเมนของชั้น D (ผู้ใช้ร่วมโดเมนเป็นล้านคน ถังต่อกล่องจดหมายพอ) · รายการเดียวของเส้นขาเข้า */
export const CRM_INBOUND_FREE_MAIL_DOMAINS: readonly string[] = Object.freeze([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.co.th",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

/** กุญแจผู้ส่งของถังเพดาน: ตัวพิมพ์เล็ก · ตัด `+tag` ของ local part (`a+x@d` = `a@d`) — ไม่ใช้กับการจับคู่/ที่อยู่ที่เก็บ */
export function inboundSenderBucketAddr(addr: string): string {
  const a = String(addr ?? "").trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at <= 0) return a;
  const local = a.slice(0, at);
  const plus = local.indexOf("+");
  return `${plus > 0 ? local.slice(0, plus) : local}${a.slice(at)}`;
}

// CRM C5.5-fix2 ▸ hunter 2a-1: หัวกันวนของสำเนาที่ระบบส่งออกเอง — จดหมายขาเข้าที่มีหัวนี้ = ของเราเองวนกลับ ⇒ ทิ้ง ◂
export const CRM_LOOP_HEADER = "X-SHARK-Loop";
export const CRM_COPY_IN_SUBJECT_PREFIX = "[สำเนาจดหมายเข้า]";

// ───────────────────────── ตัวช่วยบริสุทธิ์ ─────────────────────────

/** ที่อยู่อีเมลรูปเดียว (ไม่รับชื่อนำหน้า ไม่รับ CR/LF) — ตัวตรวจตัวเดียวของทั้งใบ */
export const CRM_EMAIL_ADDR_RE = /^[^\s<>@,;"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** มีตัวแบ่งบรรทัด/NUL อยู่ในค่าที่จะกลายเป็นหัวจดหมายไหม (AUDIT-CLASS X6) */
export function hasLineBreak(v: unknown): boolean {
  return typeof v === "string" && /[\r\n\u0085\u2028\u2029\u0000]/.test(v);
}


const LINE_TERMINATOR_RE = /[\n\r\u2028\u2029]/;

/**
 * ชื่อที่แสดงจาก `"สมชาย ใจดี" <addr>` (ไม่มี = ว่าง)
 * CRM C5.5-fix5 ▸ รีวิว RV-2: เดิม `/^\s*(.*?)\s*<[^>]*>\s*$/` = n² (หัว From `<` ล้วน 40,000 ตัว ≈ 1.3 วินาที × 3 ครั้งต่อจดหมาย) ·
 *   ตอนนี้: ชื่อ = ข้อความก่อน `<` ตัวที่เปิดคู่วงเล็บมุมท้ายสตริง (ตัวเดียวกับ `bareEmail`) ตัดช่องว่างหน้า `<` ออก ·
 *   ชื่อที่มีตัวขึ้นบรรทัด = ไม่มีชื่อ (เหมือน `.` ของ regex เดิม) — ผลตรงกับ regex เดิมทุกไบต์ (probe-cf6-linear RV2.displayName) ◂
 */
export function displayNameOf(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  let name = "";
  const inner = trailingAngleAddr(s);
  if (inner !== null) {
    let k = s.length - inner.length - 2; // ตำแหน่ง `<` (s ถูก trim แล้ว ⇒ `>` คือตัวสุดท้าย)
    while (k > 0 && /\s/.test(s[k - 1] as string)) k--;
    const cand = s.slice(0, k);
    if (!LINE_TERMINATOR_RE.test(cand)) name = cand;
  }
  return name.replace(/^["']|["']$/g, "").trim();
}

export function isEmailAddr(raw: unknown): boolean {
  const a = bareEmail(raw);
  return !!a && !hasLineBreak(a) && CRM_EMAIL_ADDR_RE.test(a);
}

/** โดเมนของที่อยู่ (ตัวเล็ก · ไม่มี = ว่าง) */
export function emailDomainOf(raw: unknown): string {
  const a = bareEmail(raw);
  const at = a.lastIndexOf("@");
  return at > 0 ? a.slice(at + 1) : "";
}

/** ส่วนหน้า @ ของที่อยู่ (ตัวเล็ก) */
export function emailLocalOf(raw: unknown): string {
  const a = bareEmail(raw);
  const at = a.lastIndexOf("@");
  return at > 0 ? a.slice(0, at) : a;
}

const SUBJECT_PREFIX_RE = /^\s*(?:re|fw|fwd|ตอบกลับ|ตอบ|ส่งต่อ)\s*(?:\[\d+\])?\s*:\s*/i;

/**
 * หัวข้อ "เปลือย" สำหรับจับคู่เธรดชั้นที่ 3 — ปลด RE:/FW:/Fwd:/ตอบ:/ตอบกลับ:/ส่งต่อ: ที่ซ้อนกันทั้งชุด
 * แล้วรวบช่องว่างซ้ำ (ไคลเอนต์อีเมลแต่ละรายเติมคำนำหน้าคนละแบบ ซ้อนกันได้ไม่จำกัด)
 */
export function normalizeSubject(raw: unknown): string {
  let s = typeof raw === "string" ? raw : "";
  for (let i = 0; i < 20; i += 1) {
    const next = s.replace(SUBJECT_PREFIX_RE, "");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, " ").trim();
}

const AUTO_LOCAL_RE = /^(?:no[-_.]?reply|noreply|mailer[-_.]?daemon|postmaster|bounce|bounces)$/i;

/**
 * จดหมายฉบับนี้ "เครื่องตอบ" ไหม (RFC 3834 Auto-Submitted · Precedence bulk/junk/list · header ของ
 * ตัวตอบอัตโนมัติ · ที่อยู่ประเภทไม่รับตอบกลับ)
 * 🔴 สำคัญกว่าที่คิด: ตอบอัตโนมัติ "ไม่ใช่การตอบของลูกค้า" ⇒ ห้ามหยุดลำดับการติดตาม ห้ามเปิด lead ใหม่
 *    (ไม่งั้นข้อความ "ลาพักร้อน" ของบริษัทลูกค้าจะหยุดการติดตามทั้งชุด และ mailer-daemon จะกลายเป็นผู้สนใจ)
 */
export function isAutoSubmitted(headers: Record<string, string> | null | undefined, from: string): boolean {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) h[k.trim().toLowerCase()] = String(v ?? "").trim();
  const auto = h["auto-submitted"];
  if (auto !== undefined && auto.toLowerCase() !== "no" && auto !== "") return true;
  const prec = (h.precedence ?? "").toLowerCase();
  if (prec === "bulk" || prec === "junk" || prec === "list") return true;
  if (h["x-autoreply"] !== undefined || h["x-autorespond"] !== undefined || h["x-auto-response-suppress"] !== undefined) return true;
  return AUTO_LOCAL_RE.test(emailLocalOf(from));
}

const BOT_UA_RE = /(bot|spider|crawl|preview|curl\/|wget\/|python-requests|headless)/i;

/**
 * AUDIT-CLASS X7: UA นี้เป็นเครื่อง (ตัวสแกนลิงก์ของ Gmail/Outlook · ตัวดึงพรีวิวของ LINE/Slack · เครื่องมือบรรทัดคำสั่ง)
 * 🔴 นับ "เปิดอ่าน/คลิก" จาก UA เครื่อง = ตัวเลขในรายงานของร้านเป็นเรื่องแต่ง (ลูกค้าไม่เคยเปิดจดหมาย)
 */
export function isTrackingBot(ua: unknown): boolean {
  const s = typeof ua === "string" ? ua : "";
  if (!s.trim()) return true; // ไม่บอกตัวตนเลย = ไม่ใช่ไคลเอนต์อีเมล/เบราว์เซอร์จริง
  return BOT_UA_RE.test(s);
}

/**
 * HTML ของจดหมายขาเข้าที่พร้อมใส่ `srcDoc` ของ `<iframe sandbox>` (ไม่มี allow-scripts / allow-same-origin)
 *   `showImages: false` (ค่าที่หน้าเธรดเปิดมาครั้งแรก) ⇒ **ไม่มี element ใดโหลด URL ปลายทาง** — รูปติดตาม
 *   ของผู้ส่งจึงไม่ได้รู้ว่าพนักงานเปิดอ่านเมื่อไหร่ · พนักงานกด "แสดงรูป" เอง ⇒ เก็บ `<img>` ที่เป็น http(s)
 * 🔴 ทั้งสองโหมดผ่านตัวตัดกลาง (`core/sanitize`) เสมอ: ไม่มี `<script>` · ไม่มี `on*=` · ไม่มี `javascript:` ·
 *    ไม่มี `<iframe>` ซ้อน — ตัวตัดชุดที่สองของโมดูลคือทางที่วันหนึ่งจะไม่ตรงกับชุดแรก
 */
export function renderInboundHtml(html: string | null | undefined, opts: { showImages: boolean }): string {
  return sanitizeHtml(html, { allowImages: opts?.showImages === true });
}

/**
 * จดหมายนี้มีรูปจากภายนอก (`<img … src="http(s):…`) ไหม — หน้าเธรดใช้ตัดสินว่าจะโชว์ปุ่ม "แสดงรูป"
 * CRM C5.5-fix5 ▸ ≡ `/<img[^>]+src="https?:/i.test(html)` เดิมของหน้าเธรด (ผลตรงทุกกรณี) แต่เชิงเส้น: `<img` ที่อยู่ในช่วงของ
 *   `<img` ตัวก่อน (ยังไม่เจอ `>`) ไม่ต้องสแกนซ้ำ — ช่วงของมันเป็นส่วนหนึ่งของช่วงที่ตรวจแล้ว (เดิม `<img` ×n ไม่มี `>` = n²) ◂
 */
export function hasRemoteImages(html: string | null | undefined): boolean {
  const lower = String(html ?? "").replace(/[A-Z]+/g, (m) => m.toLowerCase()); // ASCII เท่านั้น = flag `i` ของ regex เดิม (ความยาวเท่าเดิม)
  let from = 0;
  for (;;) {
    const at = lower.indexOf("<img", from);
    if (at < 0) return false;
    const gt = lower.indexOf(">", at + 4);
    const end = gt < 0 ? lower.length : gt; // `[^>]+` วิ่งได้ถึงก่อน `>` ตัวแรกเท่านั้น
    if (at + 5 < end && /src="https?:/.test(lower.slice(at + 5, end))) return true;
    if (gt < 0) return false;
    from = gt + 1; // `<img` ที่อยู่ในช่วงนี้มีช่วงย่อยของช่วงที่เพิ่งตรวจ ⇒ ข้าม
  }
}

/** ข้อความย่อของจดหมาย (ใช้ในรายการเธรด) — ตัดแท็กทิ้ง เหลือข้อความล้วน */
export function emailSnippet(text: string | null | undefined, html: string | null | undefined, max = 200): string {
  const base = (text ?? "").trim() || stripTags(sanitizeHtml(html), " "); // CRM C5.5-fix5 ▸ ตัวตัดเชิงเส้น (ผลเท่าเดิม) ◂
  return base.replace(/\s+/g, " ").trim().slice(0, max);
}

/** แทนค่า `{{ตัวแปร}}` รอบเดียว (ค่าที่แทนเข้าไปไม่ถูกสแกนซ้ำ) · ค่าถูก escape เป็น HTML แล้วจากผู้เรียก */
export function renderEmailVars(template: string | null | undefined, vars: Record<string, string | undefined>): string {
  return String(template ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_w, key: string) => vars[key] ?? "");
}

/** escape ค่าที่ผู้ใช้/ลูกค้าเป็นคนพิมพ์ ก่อนหยอดลงในเนื้อความ HTML (ครั้งเดียว) */
export function escapeHtmlText(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ───────────────────────── เนื้อความข้อความล้วน → HTML ของจดหมาย (CRM C4.4-fix2 · J1 · รอบแก้ 2) ─────────────────────────

// CRM C4.4-fix2 ▸ J1: ตัวแปลง "ข้อความล้วนที่พนักงาน/กฎ/ลำดับติดตามพิมพ์" → HTML ของจดหมาย **ตัวเดียวของระบบ**
//   (เดิม 3 ที่ทำเอง: ช่องเขียนจดหมาย · SEND_EMAIL ของกฎ · ขั้นอีเมลของลำดับติดตาม — escape ทั้งก้อน ⇒ URL ที่พิมพ์
//   ไม่เคยเป็น `<a href>` ⇒ composeOutgoing ไม่มีอะไรให้ห่อ ⇒ การนับคลิกไม่เคยเกิดกับจดหมายที่คนพิมพ์เอง)
//   🔴 ทุกอักขระเป็น "ข้อความ" (escape รวม `"`) — ส่วนเดียวที่กลายเป็นแท็กคือ URL ที่ขึ้นต้น `http://`/`https://` ตรงตัว
//      (`javascript:`/`data:`/อื่น ๆ ไม่มีทางเป็นลิงก์) · regex เชิงเส้น · ตัดวรรคตอนท้ายแบบนับวงเล็บครั้งเดียว (เชิงเส้น — รีวิว SF-1)
//   🔴 วรรคตอนท้าย URL (`.,;:!?'` · วงเล็บปิดที่ไม่มีคู่) อยู่นอกลิงก์
//   🔴 รีวิว BL-1: ทำเป็นลิงก์ได้เฉพาะ "ข้อความของผู้เขียน" (กฎ/ขั้น/ช่องเขียนจดหมาย) — ค่าที่แทนลงตัวแปร ({ชื่อ} · {{contact.*}})
//      มาจากลูกค้า (ฟอร์มสาธารณะ/แชท) ⇒ แทนเป็น "ข้อความที่ escape แล้ว" **หลัง** ทำลิงก์เสร็จ ไม่มีทางเป็น href
//      (ไม่งั้นลูกค้าตั้งชื่อเป็น URL แล้วได้ลิงก์ /t/c/<token> ที่พาไปเว็บตัวเองแบบถาวร = open redirect ผ่านโดเมนเรา) ◂

/** URL ที่พิมพ์ในข้อความ — ต้องไม่ติดตัวอักษรละติน/ตัวเลขข้างหน้า (`xhttps://` ไม่ใช่ลิงก์) · จบที่ช่องว่าง/อักขระที่ใช้ใน URL ไม่ได้/ตัวคั่นค่าตัวแปร */
const CRM_TEXT_URL_RE = /(^|[^A-Za-z0-9_])(https?:\/\/[^\s<>"`\u0000-\u001f\u007f]+)/gi;
/** URL ยาวกว่านี้ = ข้อความธรรมดา (ลิงก์จริงไม่ยาวขนาดนี้) */
const CRM_TEXT_URL_MAX = 2048;
const TRAIL_PUNCT = ".,;:!?'";
const CLOSE_OF: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
/** ตัวคั่น "ช่องค่าตัวแปร" ภายใน (อักขระ Private Use — ถูกลบออกจากข้อความของผู้เขียนและจากค่าก่อนใช้เสมอ) */
const SLOT_OPEN = "";
const SLOT_CLOSE = "";
const SLOT_CHARS_RE = /[]/g;
const SLOT_RE = /(\d+)/g;

/**
 * ตัดวรรคตอนท้าย URL — วงเล็บปิดที่ "มีคู่" ในตัว URL เก็บไว้ (`…/Foo_(bar)`)
 * รีวิว SF-1: นับวงเล็บครั้งเดียวแล้วลดลงทีละตัว (เดิมนับใหม่ทุกตัวอักษรที่ตัด = O(L²))
 */
function trimUrlTail(raw: string): string {
  const opens: Record<string, number> = { "(": 0, "[": 0, "{": 0 };
  const closes: Record<string, number> = { ")": 0, "]": 0, "}": 0 };
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c in opens) opens[c]! += 1;
    else if (c in closes) closes[c]! += 1;
  }
  let end = raw.length;
  while (end > 0) {
    const last = raw[end - 1]!;
    if (TRAIL_PUNCT.includes(last)) {
      end -= 1;
      continue;
    }
    const open = CLOSE_OF[last];
    if (open && closes[last]! > opens[open]!) {
      closes[last]! -= 1;
      end -= 1;
      continue;
    }
    break;
  }
  return raw.slice(0, end);
}

/** ต้องมีโฮสต์จริงหลัง `://` (กติกาเดียวกับตัวตัด `core/sanitize` linkSchemeOk) */
const hasHost = (url: string) => /^https?:\/\/[^/\\?#.]/i.test(url);

/**
 * escape ข้อความสำหรับ HTML ของจดหมาย: `& < > "`
 * รีวิว SF-2: `"` ต้อง escape — ข้อความ `href="https://…"` ที่ตัวทำลิงก์ข้ามไป (โฮสต์ไม่ผ่าน/ยาวเกิน) จะไม่ถูกตัวห่อของ
 *   composeOutgoing (`href="(https?://…)"`) หยิบไปเป็นลิงก์นับคลิก · `htmlToText` ถอด `&quot;` คืน ⇒ ข้อความสำรองถูกต้อง
 * `'` ไม่แปลง: ตัวห่อจับเฉพาะ href ที่ครอบด้วย `"` และ `htmlToText` ไม่ถอด `&#39;` (ข้อความสำรองจะเป็น "It&#39;s")
 */
const escText = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** escape ข้อความ + ทำ URL http(s) เป็นลิงก์ — ใช้กับ "หนึ่งบรรทัด/ย่อหน้า" ของข้อความล้วน (ตัวคั่นช่องตัวแปรผ่านไปตามเดิม) */
export function crmLinkifyText(text: string): string {
  const src = String(text ?? "");
  let out = "";
  let at = 0;
  CRM_TEXT_URL_RE.lastIndex = 0;
  for (let m = CRM_TEXT_URL_RE.exec(src); m; m = CRM_TEXT_URL_RE.exec(src)) {
    const lead = m[1] ?? "";
    const raw = m[2] ?? "";
    if (raw.length > CRM_TEXT_URL_MAX) continue; // ยาวผิดปกติ = ข้อความธรรมดา
    // CRM C4.4-fix2 r3 ▸ (รีวิว R2-SF1) URL ที่วิ่งชนช่องค่าตัวแปรทันที (`https://shop.com/?ref={ชื่อ}&x=1` · `…/{{contact.firstName}}/x`)
    //   = ข้อความธรรมดาทั้งก้อน (เหมือนก่อน C4.4 — โปรแกรมอ่านเมลทำลิงก์ให้เอง) · ไม่ตัดเป็นลิงก์ครึ่งท่อนที่พาไปผิดหน้า และไม่มีค่าเข้า href ◂
    if (src[m.index + m[0].length] === SLOT_OPEN) continue;
    const url = trimUrlTail(raw);
    const start = m.index + lead.length;
    if (!hasHost(url)) continue; // ไม่ใช่ลิงก์ที่ใช้ได้ — ปล่อยเป็นข้อความ (ถูก escape รวมกับข้อความรอบข้าง)
    out += escText(src.slice(at, start));
    const safe = escText(url);
    out += `<a href="${safe}" rel="noopener" target="_blank">${safe}</a>`;
    at = start + url.length; // วรรคตอนที่ตัดออกอยู่ต่อจาก URL ในต้นฉบับ ⇒ ถูก escape เป็นข้อความในรอบถัดไป
  }
  out += escText(src.slice(at));
  return out;
}

/**
 * ตัวแปรที่จะแทนลงข้อความของผู้เขียน — รูปแบบของโลกที่เรียก
 *   `brace`    = `{ชื่อ}` ของกฎอัตโนมัติ (ตัวรันกลาง `renderTemplate`: ไม่รู้จัก = คงไว้ตามเดิม · ช่องว่างซ้อนถูกยุบ · ตัดหัวท้าย)
 *   `mustache` = `{{contact.firstName}}` ของลำดับการติดตาม (ไม่รู้จัก = ว่าง)
 */
export type CrmTextPlaceholders = { syntax: "brace" | "mustache"; values: Readonly<Record<string, string | undefined>> };

/**
 * ข้อความล้วน → HTML ของจดหมาย: บรรทัดว่าง = ขึ้นย่อหน้าใหม่ (`<p>`) · ขึ้นบรรทัดเดียว = `<br>` · URL http(s) ของผู้เขียน = ลิงก์
 * `placeholders` (ถ้ามี) = ค่าตัวแปรที่แทน **หลัง** ทำลิงก์ — escape เป็นข้อความเสมอ ไม่มีทางเป็นลิงก์ (รีวิว BL-1)
 * 🔴 ผลลัพธ์ **ไม่** ต้องผ่าน `sanitizeHtml` อีก (และไม่ควร: ตัวตัดกลาง escape `&` ใน href ซ้ำอีกชั้น ⇒ `&amp;amp;` = ลิงก์เสีย)
 *    โครงสร้างของผลมีแค่ `<p>` `<br>` และ `<a href="http(s)…" rel="noopener" target="_blank">` ที่ตัวนี้สร้างเอง
 * ผู้เรียกต้องจำกัดขนาด `text` ก่อนเรียก (`crmEmailBodyTooLong`) — ตัวนี้เชิงเส้นแต่ไม่ตัดความยาวเอง
 */
export function crmPlainTextToEmailHtml(text: string | null | undefined, placeholders?: CrmTextPlaceholders | null): string {
  let src = String(text ?? "").replace(/\r\n?/g, "\n").replace(SLOT_CHARS_RE, "");
  const vals: string[] = [];
  if (placeholders) {
    const brace = placeholders.syntax === "brace";
    const slot = (v: string) => {
      const clean = String(v ?? "").replace(SLOT_CHARS_RE, "");
      vals.push(brace ? clean.replace(/[ \t]{2,}/g, " ") : clean);
      return `${SLOT_OPEN}${vals.length - 1}${SLOT_CLOSE}`;
    };
    if (brace) {
      src = src
        .replace(/\{([^{}]+)\}/g, (whole, key: string) => {
          const v = placeholders.values[key.trim()];
          return v === undefined ? whole : slot(v);
        })
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    } else {
      src = src.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_w, key: string) => slot(placeholders.values[key] ?? ""));
    }
  }
  const html = src
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split("\n").map(crmLinkifyText).join("<br>")}</p>`)
    .join("");
  if (vals.length === 0) return html;
  return html.replace(SLOT_RE, (_m, i: string) => escText(vals[Number(i)] ?? "")).replace(/<p><\/p>/g, "");
}

/** ข้อความของรูปแบบ "เนื้อความยาวเกิน" — ตัวเดียวทุกทาง (ช่องเขียนจดหมาย · action · บริการ) — รีวิว SF-1 */
export const CRM_EMAIL_BODY_TOO_LONG_MSG = `เนื้อความจดหมายยาวเกิน ${Math.round(CRM_EMAIL_BODY_MAX_BYTES / 1024)} KB — ย่อเนื้อความหรือส่งเป็นไฟล์แนบแทน`;

/** เนื้อความ (ข้อความล้วนหรือ HTML) ยาวเกินเพดานของจดหมาย 1 ฉบับไหม — ตรวจ **ก่อน** แปลง (รีวิว SF-1) */
export function crmEmailBodyTooLong(body: string | null | undefined): boolean {
  const s = String(body ?? "");
  if (s.length > CRM_EMAIL_BODY_MAX_BYTES) return true; // ≥ 1 ไบต์ต่ออักขระ — ตัดสินได้ทันทีโดยไม่ต้องเข้ารหัส
  return new TextEncoder().encode(s).length > CRM_EMAIL_BODY_MAX_BYTES;
}

/** ลิงก์ในแม่แบบ → ข้อความที่พิมพ์ต่อได้ในช่องเขียนจดหมาย แล้วยังได้ลิงก์เดิมกลับเมื่อส่ง (รีวิว N-2) */
function composerUrlText(url: string): string {
  // อักขระที่ตัวทำลิงก์หยุดอ่าน → percent-encode (ลิงก์เดิม ความหมายเดิม)
  let u = url.replace(/[\s"<>`]/g, (c) => encodeURIComponent(c));
  // วรรคตอนท้ายที่ตัวทำลิงก์จะตัดออก → percent-encode ตัวที่ถูกตัด (`…/x)` ยังเป็น `…/x)` เมื่อถอดกลับ)
  const kept = trimUrlTail(u);
  if (kept.length < u.length) u = kept + [...u.slice(kept.length)].map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`).join("");
  return u;
}

const decodeEntities = (v: string) =>
  v.replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, "&");

/**
 * HTML ของแม่แบบ → ข้อความในช่องเขียนจดหมาย (ช่องนั้นเป็นข้อความล้วน)
 * 🔴 เดิมตัดแท็กทิ้งหมด ⇒ ลิงก์ในแม่แบบหายทั้ง URL · ตอนนี้ลิงก์ http(s) เหลือเป็น "ป้าย (URL)" (หรือ URL เดียวถ้าป้าย = URL)
 *    แล้ว `crmPlainTextToEmailHtml` ตอนส่งทำให้เป็นลิงก์ที่นับคลิกได้อีกครั้ง · mailto:/tel: = "ป้าย (ที่อยู่/เบอร์)" เป็นข้อความ (รีวิว N-2)
 * รีวิว N-2: ไล่แท็กครั้งเดียวแบบเชิงเส้น (`<[^<>]*>` หยุดที่ `<` ถัดไป) — ไม่มี regex ขี้เกียจที่ย้อนหา `</a>` ทุกจุด
 */
export function crmEmailHtmlToComposerText(html: string | null | undefined): string {
  const parts = String(html ?? "").split(/(<[^<>]*>)/);
  let out = "";
  let link: { href: string; label: string } | null = null;
  const emit = (t: string) => {
    if (link) link.label += t;
    else out += t;
  };
  const closeLink = () => {
    if (!link) return;
    let href = link.href.trim();
    for (let i = 0; i < 3 && /&(amp|quot|lt|gt|#39);/i.test(href); i++) href = decodeEntities(href); // href ที่ถูก escape ซ้ำ (&amp;amp;)
    const label = decodeEntities(link.label).replace(/\s+/g, " ").trim();
    link = null;
    const m = href.match(/^(mailto|tel):(.*)$/i);
    let target = "";
    if (/^https?:\/\//i.test(href)) target = composerUrlText(href);
    else if (m) {
      try {
        target = decodeURIComponent((m[2] ?? "").split("?")[0] ?? "").trim();
      } catch {
        target = (m[2] ?? "").split("?")[0]!.trim();
      }
    }
    const text = !target ? label : !label || label === target || label === href ? target : `${label} (${target})`;
    out += escText(text).replace(/&quot;/g, '"'); // ถอดรอบเดียวตอนท้าย (decodeEntities) — escape ไว้ให้เท่ากับข้อความรอบข้าง
  };
  for (const part of parts) {
    if (!part) continue;
    if (part[0] !== "<" || part[part.length - 1] !== ">") {
      emit(part);
      continue;
    }
    const tag = part.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/);
    const name = (tag?.[2] ?? "").toLowerCase();
    const closing = tag?.[1] === "/";
    if (name === "a" && !closing) {
      closeLink();
      const h = part.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
      link = { href: h ? (h[2] ?? h[3] ?? h[4] ?? "") : "", label: "" };
    } else if (name === "a" && closing) closeLink();
    else if (name === "br") emit("\n");
    else if (closing && ["p", "h1", "h2", "h3", "li", "blockquote", "pre", "div"].includes(name)) emit("\n\n");
  }
  closeLink();
  return out
    .split("\n")
    .map((l) => trimEndBlanks(decodeEntities(l))) // CRM C5.5-fix5 ▸ เดิม `/[ \t]+$/g` = n² บนบรรทัดช่องว่างยาว (ผลเท่าเดิม) ◂
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** DTO ของไฟล์แนบที่เก็บใน `CrmEmailMessage.attachments` (ไม่มี path/URL — AUDIT-CLASS X10) */
export type CrmEmailAttachmentRef = { fileId: string; name: string; size: number; mime: string };

export type CrmEmailRoutingView = {
  fromName: string | null;
  fromAddr: string;
  replyTo: string;
  copyTo: string[];
  copyIn: string[];
  via: "SHARK" | "DOMAIN";
};

// C4.3-fix ▸ เหตุที่ส่งไม่สำเร็จเป็นภาษาไทย — แปลงจากรหัสที่เก็บใน `CrmEmailMessage.providerError` (รหัสล้วน · AUDIT-CLASS X8
//   ไม่มีที่อยู่ผู้รับ) ⇒ หน้าเขียนจดหมายบอกเหตุจริงแทน "ส่งจดหมายแล้ว" · ข้อความไม่โทษผู้ใช้ และบอกว่าทำอะไรต่อได้
/** ข้อความไทยของเหตุส่งไม่สำเร็จ (รหัสที่ไม่รู้จัก = ข้อความกลาง · ข้อความที่เป็นไทยอยู่แล้ว = คืนตามเดิม) */
export function crmEmailFailText(code: string | null | undefined): string {
  const c = typeof code === "string" ? code.trim() : "";
  const retry = "จดหมายยังไม่ถึงผู้รับ และบันทึกไว้ในเธรดเป็น \"ส่งไม่สำเร็จ\"";
  if (/[฀-๿]/.test(c)) return c;
  if (c === "TRANSPORT_ERROR") return `ติดต่อผู้ให้บริการส่งอีเมลไม่ได้ในตอนนี้ — ${retry} ลองกดส่งอีกครั้งในอีกสักครู่`;
  if (c === "NO_RECIPIENT") return `ไม่มีที่อยู่ผู้รับที่ส่งได้ — ${retry} ใส่อีเมลผู้รับแล้วส่งอีกครั้ง`;
  if (c === "INVALID_HEADER") return `ที่อยู่อีเมล (ผู้รับ ผู้ส่ง หรือที่อยู่ตอบกลับ) มีรูปแบบที่ส่งไม่ได้ — ${retry} ตรวจที่อยู่แล้วส่งอีกครั้ง`;
  if (c === "CONTACT_GONE") return `ผู้ติดต่อนี้ถูกลบหรือรวมไปแล้ว — ${retry}`;
  if (c === "EMAIL_BLOCKED") return `ผู้ติดต่อนี้ขอไม่รับอีเมล หรืออีเมลเคยตีกลับ ระบบจึงไม่ส่ง — ${retry}`;
  if (c === "PERMANENT_BOUNCE") return "อีเมลปลายทางตีกลับถาวร — ตรวจที่อยู่อีเมลของผู้ติดต่อ แล้วแก้ให้ถูกก่อนส่งใหม่";
  const p = /^PROVIDER_(\d{3})$/.exec(c);
  if (p) {
    const n = Number(p[1]);
    if (n === 429) return `ผู้ให้บริการส่งอีเมลรับงานไม่ทัน (ส่งถี่เกินไป) — ${retry} รอสักครู่แล้วกดส่งอีกครั้ง`;
    if (n >= 500) return `ผู้ให้บริการส่งอีเมลขัดข้องชั่วคราว (รหัส ${n}) — ${retry} ลองกดส่งอีกครั้งในอีกสักครู่`;
    return `ผู้ให้บริการส่งอีเมลไม่รับจดหมายฉบับนี้ (รหัส ${n}) — ${retry} ตรวจที่อยู่ผู้รับและโดเมนผู้ส่งในหน้าตั้งค่าอีเมล แล้วลองอีกครั้ง`;
  }
  return `ส่งจดหมายไม่สำเร็จ — ${retry} ลองกดส่งอีกครั้ง`;
}

// CRM C5.5 ▸ (fix3b · รีวิว R2b-3) ธง "ไม่ยืนยันผู้ส่ง" ของจดหมาย 1 ฉบับ อ่านจาก `CrmEmailMessage.routing` (fix2 เป็นผู้เขียน:
//   `unverifiedFrom` = From ของลูกค้าไม่มีหลักฐาน · `unverifiedShopFrom` = อ้างที่อยู่พนักงาน/โดเมนร้านโดยไม่มีหลักฐาน) —
//   ตัวอ่านเดียวของหน้าเธรด (`getThread`) และแถวกิจกรรม EMAIL บนไทม์ไลน์ (`activities.enrich`) · รายการเธรดอ่านคีย์เดียวกันใน SQL ◂
export function emailRoutingUnverified(routing: unknown): boolean {
  if (!routing || typeof routing !== "object" || Array.isArray(routing)) return false;
  const r = routing as Record<string, unknown>;
  return r.unverifiedFrom === true || r.unverifiedShopFrom === true;
}
