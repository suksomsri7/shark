// emails-shared.ts — ค่าคงที่ · เพดาน · ตัวช่วยบริสุทธิ์ ของ "ระบบอีเมล CRM" (ใบ C2.5 · พิมพ์เขียว §4.5 §5.6 §11.4)
//
// 🔴 ไฟล์บริสุทธิ์ (client-safe): ห้าม import prisma / `@/lib/core/db` / `@/lib/env` / `next/*` / server-only /
//    ไฟล์บริการ (`./db` · `./emails`) — หน้าเขียนจดหมาย · หน้าตั้งค่าอีเมล · หน้าเธรด ('use client') ดึงเพดาน
//    ป้าย และตัวตรวจจากที่นี่ที่เดียว (ข้อสอบ `C2.5-S0.2` ตรวจความบริสุทธิ์แบบกลไก)
// 🔴 `renderInboundHtml` อยู่ที่นี่เพราะทั้งฝั่งเซิร์ฟเวอร์ (ตอน "เก็บ") และฝั่งไคลเอนต์ (ตอน "แสดงใน
//    <iframe sandbox>") ต้องใช้กติกาเดียวกัน — สองที่ = วันหนึ่งไม่ตรงกัน แล้วสคริปต์ในจดหมายของคนนอกก็ทำงาน
// AUDIT-CLASS X6: เพดานเนื้อความ/ไฟล์แนบ + บัญชีขาวชนิดไฟล์ (ชุดย่อยของ storage ลบ SVG/HTML/JS) ประกาศที่นี่ที่เดียว

import { sanitizeHtml } from "@/lib/core/sanitize";
import { bareEmail } from "@/lib/core/inbound-address";
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

// ───────────────────────── ตัวช่วยบริสุทธิ์ ─────────────────────────

/** ที่อยู่อีเมลรูปเดียว (ไม่รับชื่อนำหน้า ไม่รับ CR/LF) — ตัวตรวจตัวเดียวของทั้งใบ */
export const CRM_EMAIL_ADDR_RE = /^[^\s<>@,;"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** มีตัวแบ่งบรรทัด/NUL อยู่ในค่าที่จะกลายเป็นหัวจดหมายไหม (AUDIT-CLASS X6) */
export function hasLineBreak(v: unknown): boolean {
  return typeof v === "string" && /[\r\n\u0085\u2028\u2029\u0000]/.test(v);
}


/** ชื่อที่แสดงจาก `"สมชาย ใจดี" <addr>` (ไม่มี = ว่าง) */
export function displayNameOf(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = s.match(/^\s*(.*?)\s*<[^>]*>\s*$/);
  const name = m ? (m[1] ?? "") : "";
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

/** ข้อความย่อของจดหมาย (ใช้ในรายการเธรด) — ตัดแท็กทิ้ง เหลือข้อความล้วน */
export function emailSnippet(text: string | null | undefined, html: string | null | undefined, max = 200): string {
  const base = (text ?? "").trim() || sanitizeHtml(html).replace(/<[^>]*>/g, " ");
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
