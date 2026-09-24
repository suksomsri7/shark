// emails.ts — ระบบอีเมลของ CRM (ใบ C2.5a · มติ C4 · C31 · พิมพ์เขียว §4.5 §5.6 §11.4 · มติผู้คุมงาน 24 ก.ย. 2569)
//
// ── หน้าที่ ─────────────────────────────────────────────────────────────────────────────────────
//   `resolveRouting`  ที่อยู่ผู้ส่ง/ผู้รับตอบกลับ/สำเนา (ร้าน × ทับรายคน × โดเมนที่ยืนยันแล้ว)
//   `sendEmail`/`sendAsSystem`  ส่งจดหมาย 1 ฉบับ (ความยินยอม **ตอนส่ง** · พิกเซล · ห่อลิงก์ · ลิงก์เลิกรับ ·
//       Message-ID/In-Reply-To/References · สำเนาออก · ตั้งเวลา)
//   `runScheduled`    งานรายนาที "crm.email.scheduled" — จองด้วย **lease** แล้วส่งของที่ถึงเวลา
//   `ingestInbound`   จดหมายขาเข้าที่ `crm+<key>@shark.in.th` (จับคู่ 6 ทาง · ต่อเธรด 3 ชั้น · เก็บสำเนา BCC ·
//       คนแปลกหน้า→lead · ข้ามจดหมายที่เครื่องตอบ · ไฟล์แนบเก็บแบบส่วนตัว)
//   `trackOpen`/`trackClick`/`unsubscribe`/`providerWebhook`  เส้นสาธารณะ (route บาง ตรรกะอยู่ที่นี่)
//   เทมเพลต · ตั้งค่าร้าน/รายคน · หมุนกุญแจกล่องขาเข้า · ยืนยันโดเมนผู้ส่ง · ส่งทดสอบ · ล้างเนื้อความตามอายุเก็บ
//
// ── กติกาที่ห้ามหัก ──────────────────────────────────────────────────────────────────────────────
// 1) ลำดับตายตัวทุกฟังก์ชันที่มี actor: ระบบ CRM ของร้านนี้ (NOT_FOUND) → `assertCrmV2` → การมองเห็น
//    (มองไม่เห็น = NOT_FOUND) → คีย์สิทธิ์ (เห็นแต่ไม่มีคีย์ = FORBIDDEN) — AUDIT-CLASS X1 · X2
// 2) ความยินยอมถูกถาม **ตอนส่งจริง** ผ่าน `consents.canContact` ตัวเดียวของระบบ (AUDIT-CLASS X8) —
//    ทั้งทางกด "ส่ง" และทางงานตามเวลา · ถูกบล็อก = ไม่มีแถว ไม่มีกิจกรรม ไม่มี event ไม่มีไฟล์ ไม่แตะตัวส่ง
// 3) AUDIT-CLASS X5: จดหมายตั้งเวลาถูกจอง **ด้วย lease** (`leaseUntil = now + 15 นาที` · สถานะคง `QUEUED`)
//    ไม่เคยจองด้วยการเขียนสถานะปลายทาง — เครื่องดับกลางส่ง = รอบที่ now ≥ หมด lease หยิบไปส่งใหม่ครั้งเดียว
// 4) AUDIT-CLASS X4: กันซ้ำด้วย **ฐานข้อมูล** ไม่ใช่การอ่านก่อนเขียน — `CrmEmailMessage.messageId` unique
//    ทั้งระบบ ⇒ ขาเข้าเก็บค่าที่ผูกระบบ (`<systemId>:<RFC Message-ID>`) ⇒ "หนึ่งแถวต่อ (ระบบ, Message-ID)"
//    และจดหมายฉบับเดียวที่ BCC ถึงสองร้านยังลงร้านละแถว · ขาออกที่มี `idempotencyKey` แปลงกุญแจนั้นเป็น
//    Message-ID ⇒ 10 คำขอพร้อมกันได้แถวเดียวและตัวส่งถูกเรียกครั้งเดียว
// 5) AUDIT-CLASS X7: token ของพิกเซล/ลิงก์/เลิกรับ = `<emailId>~<สุ่ม 192 บิต>` · **ฐานเก็บแต่ค่าย่อย (hash)**
//    ⇒ ใครอ่านฐานได้ก็ปลอมลิงก์ไม่ได้ · token ที่ไม่รู้จักได้คำตอบเดียวกับ token ที่รู้จักทุกไบต์ ·
//    เพดานความถี่ผ่าน `checkRateLimitDb` ตัวเดียวของระบบ (กุญแจถังไม่มี IP ดิบและไม่มี token ดิบ)
// 6) AUDIT-CLASS X8: payload ของ event มีแต่ id (`emailId` · `contactId?` · `dealId?` · `companyId?` ·
//    `threadKey` · `sequenceStepId?`) — ไม่มีที่อยู่ หัวเรื่อง เนื้อความ หรือ URL ที่ถูกคลิก (URL อยู่ใน
//    `CrmEmailEvent` เท่านั้น · มติผู้คุมงาน ข้อ 4) · log/OpsEvent/สมุดตรวจก็ห้ามมีของพวกนั้น
// 7) AUDIT-CLASS X10: ไฟล์แนบขาเข้า/ขาออกเก็บแบบ **ส่วนตัว** (`uploadFile visibility "private"`) และออกไป
//    ทาง `privateFileUrl` ที่ผูกผู้ดูและหมดอายุเท่านั้น — ไม่มี cdnUrl/path/ค่าหมายใน DTO ใด
// 8) AUDIT-CLASS X6: CR/LF ในหัวจดหมายทุกช่อง · เพดานเนื้อความ/ไฟล์แนบ/ชนิดไฟล์ · HTML ทั้งขาเข้าและ
//    ที่พนักงานพิมพ์ผ่านตัวตัดกลาง `core/sanitize` (ตัวตัดชุดที่สอง = วันหนึ่งไม่ตรงกัน)
// 9) R-E.14: ระบบ uiVersion 1 — ฟังก์ชันที่มี actor ปฏิเสธทั้งหมด · ขาเข้า "ไม่เก็บอะไรเลย" · งานตามเวลาไม่แตะ
//    **แต่** ลิงก์ที่ออกไปอยู่ในมือลูกค้าแล้ว (`/t/c` · `/u/<token>/one-click`) ยังทำงาน — การยกเลิกรับ
//    ตามกฎหมายห้ามขึ้นกับสวิตช์หน้าจอ (มติผู้คุมงาน ข้อ 7)
// 🔴 ห้าม `import { env } from "@/lib/env"` และห้าม import `@/lib/core/email` แบบ static: ไฟล์นี้ถูกดึงต่อ
//    จาก `crm/index.ts` ซึ่งทะเบียน op/tool ของ CRM อาศัยอยู่ ⇒ ด่าน `pnpm fitness` (รันแบบไม่มี env) จะล้มทั้งด่าน
//    (บทเรียนเดิม: reference_shark_precommit_fitness_no_env) — อ่าน `process.env` ตรง ๆ · ตัวส่งจริง import ตอนใช้

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma, type CrmContact, type CrmEmailMessage } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { htmlToText, sanitizeHtml } from "@/lib/core/sanitize";
import {
  ALLOWED_UPLOAD_TYPES,
  deleteFileAsset,
  normalizeUploadType,
  privateFileUrl,
  uploadFile,
  type DeleteDeps,
  type UploadDeps,
} from "@/lib/storage/service";
import type { MemberActor } from "@/lib/modules/member";
import type { RichEmail, RichEmailResult } from "@/lib/core/email";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage, CrmForbiddenError } from "./access";
import { assertCrmV2 } from "./ui-version";
import { canContact } from "./consents";
import * as consents from "./consents";
import { contactWhere, companyWhere, dealWhere } from "./where";
import { resolve as resolveVisibility } from "./visibility";
import * as contacts from "./contacts";
import * as activities from "./activities";
import { crmEmailSettingsOf, ensureCrmInboundKeySql, setCrmEmailKeys } from "./settings";
import {
  bareEmail,
  CRM_EMAIL_ATTACH_MAX_BYTES,
  CRM_EMAIL_ATTACH_MAX_COUNT,
  CRM_EMAIL_ATTACH_MIME_ALLOWLIST,
  CRM_EMAIL_BODY_MAX_BYTES,
  CRM_EMAIL_COPY_MODES,
  CRM_EMAIL_FROM_MODES,
  CRM_EMAIL_REPLY_MODES,
  CRM_EMAIL_RETENTION_MAX_DAYS,
  CRM_EMAIL_RETENTION_MIN_DAYS,
  CRM_EMAIL_SHARK_DOMAIN,
  CRM_EMAIL_SUBJECT_MAX,
  CRM_INBOUND_KEY_RE,
  CRM_INBOUND_PREFIX,
  CRM_THREAD_SHORT_LEN,
  CRM_TRACK_RATE_LIMITS,
  displayNameOf,
  emailDomainOf,
  emailSnippet,
  escapeHtmlText,
  hasLineBreak,
  isAutoSubmitted,
  isEmailAddr,
  isTrackingBot,
  normalizeSubject,
  parseCrmRecipient,
  renderEmailVars,
  type CrmEmailAttachmentRef,
  type CrmEmailCopyMode,
  type CrmEmailRoutingView,
  type CrmEmailSettings,
} from "./emails-shared";
import "./emails-job";

/**
 * ตัวจับที่อยู่กล่องขาเข้าอยู่ใน `emails-shared.ts` (ไฟล์บริสุทธิ์) แล้ว — ที่นี่ส่งต่อให้ facade เท่าเดิม
 * 🔴 ทำไมต้องบริสุทธิ์: route `api/email/inbound` ต้องตัดสิน "ที่อยู่นี้ของ CRM ไหม" **ก่อน** โหลดโมดูล CRM
 *    ไม่งั้นจดหมายเข้าบอร์ดงานทั้งสายขึ้นอยู่กับว่า import โมดูล CRM สำเร็จหรือไม่
 */
export { isCrmInboundAddress, parseCrmRecipient } from "./emails-shared";

// ───────────────────────── ชนิด · error ─────────────────────────

export type EmailsCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
export type EmailErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "CONFIRM_REQUIRED"
  | "EMAIL_BLOCKED"
  | "NOT_CONFIGURED";

export class EmailError extends Error {
  readonly code: EmailErrorCode;
  constructor(code: EmailErrorCode, message: string) {
    super(message);
    this.name = "EmailError";
    this.code = code;
  }
}
const fail = (code: EmailErrorCode, message: string) => new EmailError(code, message);

/** ตัวส่ง/ที่เก็บที่ฉีดแทนได้ (ข้อสอบ/เทส) — ส่งมา = ไม่มีทางที่คำขอจะถึง Resend/Bunny จริง (มติผู้คุมงาน ข้อ 9) */
export type EmailTransport = (msg: RichEmail) => Promise<RichEmailResult>;
export type EmailDeps = {
  transport?: EmailTransport;
  put?: UploadDeps["put"];
  del?: DeleteDeps["del"];
  /** ตัวดึงไฟล์แนบที่ผู้ให้บริการส่งมาเป็นลิงก์ (ข้อสอบ/เทสฉีดแทน ⇒ ไม่มีคำขอออกเครือข่ายจริง) */
  fetch?: typeof fetch;
};

export type SendAttachmentInput = { filename: string; contentType: string; data: Uint8Array };
export type SendInput = {
  contactId: string;
  dealId?: string | null;
  companyId?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string | null;
  bodyHtml?: string | null;
  templateId?: string | null;
  vars?: Record<string, string>;
  attachments?: SendAttachmentInput[];
  scheduledAt?: Date | string | null;
  replyToEmailId?: string | null;
  idempotencyKey?: string | null;
};
export type SendResult = { emailId: string; messageId: string; threadKey: string; status: "SENT" | "QUEUED" | "FAILED"; reused?: boolean };

export type EmailDomainRecord = { type: "TXT" | "MX" | "CNAME"; name: string; value: string; priority?: number; status?: string };
export type EmailDomainDto = { id: string; domain: string; status: "PENDING" | "VERIFIED" | "FAILED"; records: EmailDomainRecord[]; verifiedAt: string | null };

export type EmailUserSettingDto = {
  userId: string;
  userName: string | null;
  fromName: string | null;
  fromAddr: string | null;
  replyToMode: string;
  replyToAddr: string | null;
  copyToAddr: string | null;
  copyMode: string;
  signatureHtml: string | null;
};

export type EmailTemplateDto = { id: string; name: string; subject: string; bodyHtml: string; category: string | null; active: boolean };

export type ThreadListItem = {
  threadKey: string;
  subject: string;
  lastAt: string;
  count: number;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  matchedBy: string | null;
  direction: "IN" | "OUT";
  snippet: string | null;
  unread: boolean;
};

export type ThreadMessageDto = {
  id: string;
  /** id ล้วน (AUDIT-CLASS X10: ไม่มี cdnUrl / path / ค่าหมายของที่เก็บใน DTO นี้เลย) */
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  direction: "IN" | "OUT";
  fromAddr: string;
  fromName: string | null;
  toAddrs: string[];
  ccAddrs: string[];
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  attachments: CrmEmailAttachmentRef[];
  status: string;
  sentAt: string | null;
  receivedAt: string | null;
  openCount: number;
  clickCount: number;
  repliedAt: string | null;
  matchedBy: string | null;
  purged: boolean;
};

export type CrmInboundAttachment = {
  filename?: string | null;
  contentType?: string | null;
  content_type?: string | null;
  content?: string | null;
  /** ผู้ให้บริการบางรายส่งไฟล์ใหญ่มาเป็น "ลิงก์ดาวน์โหลด" แทนเนื้อไฟล์ (Cloudflare Email Worker ของเราเองก็ทำ) */
  url?: string | null;
  size?: number | null;
};
export type CrmInboundPayload = {
  messageId: string;
  to: string[];
  cc?: string[];
  from: string;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
  attachments?: CrmInboundAttachment[];
};
export type IngestInboundResult = {
  ok: boolean;
  handled: boolean;
  emailId?: string;
  reason?: string;
  /**
   * จำนวนไฟล์แนบที่ระบบรับไว้ไม่ได้ (ชนิด/ขนาด/จำนวนเกิน · ลิงก์ที่ด่านกัน SSRF ปฏิเสธ · ดึงไม่สำเร็จ)
   * ค่าเดียวกันนี้ถูกบันทึกไว้ที่ `CrmEmailMessage.routing.attachmentsDropped` — ของที่ตกด่านห้ามหายเงียบ ๆ
   */
  attachmentsDropped: number;
};

export type RunScheduledOptions = { tenantIds?: string[]; deps?: EmailDeps; deadline?: number; signal?: AbortSignal };
export type RunScheduledSummary = { claimed: number; sent: number; blocked: number; failed: number; skipped: number; cutOff: boolean };

type Tx = Prisma.TransactionClient;
type Json = Prisma.JsonValue;

type RoutingJson = {
  via: "SHARK" | "DOMAIN";
  fromName: string | null;
  fromAddr: string;
  replyTo: string;
  copyTo: string[];
  /** AUDIT-CLASS X7: ค่าย่อยของ token ลิงก์ (ไม่ใช่ token) + URL ที่ token นั้นอนุญาตให้ไป */
  links?: { h: string; url: string }[];
  /** AUDIT-CLASS X7: ค่าย่อยของ token เลิกรับของจดหมายฉบับนี้ */
  unsub?: string;
};

// ───────────────────────── ข้อความ · คีย์ · ค่าคงที่ ─────────────────────────

const SYSTEM_NOT_FOUND = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const CONTACT_NOT_FOUND = "ไม่พบผู้ติดต่อนี้ในระบบ CRM นี้ หรือบัญชีนี้ยังมองไม่เห็นผู้ติดต่อนี้ — รีเฟรชหน้าแล้วลองใหม่";
const THREAD_NOT_FOUND = "ไม่พบจดหมายชุดนี้ในระบบ CRM นี้ หรือบัญชีนี้ยังมองไม่เห็นผู้ติดต่อของจดหมายชุดนี้ — รีเฟรชหน้าแล้วลองใหม่";
const EMAIL_NOT_FOUND = "ไม่พบจดหมายฉบับนี้ในระบบ CRM นี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่";
const TEMPLATE_NOT_FOUND = "ไม่พบแม่แบบจดหมายนี้ในระบบ CRM นี้ — เลือกแม่แบบใหม่แล้วลองอีกครั้ง";
const DOMAIN_NOT_FOUND = "ไม่พบโดเมนผู้ส่งนี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const BLOCKED_MSG =
  "ยังส่งอีเมลถึงผู้ติดต่อรายนี้ไม่ได้ เพราะยังไม่มีความยินยอมรับข่าวสารทางอีเมล หรือผู้ติดต่อขอไม่รับ หรืออีเมลเดิมตีกลับ — ตรวจหน้าความยินยอมของผู้ติดต่อก่อนส่งอีกครั้ง";
const ATTACH_MIME_MSG =
  "ชนิดไฟล์นี้แนบไปกับอีเมลไม่ได้ — รองรับ PDF · รูปภาพ (JPG/PNG/WEBP/GIF/HEIC) · Word · Excel · ข้อความ (.txt)";
const FILE_UNAVAILABLE = "ยังเปิดไฟล์แนบนี้ไม่ได้ (ไฟล์อาจถูกลบตามอายุการเก็บ) — ขอไฟล์จากผู้ส่งอีกครั้ง";

const KEY_READ = "crm.email.read";
const KEY_SEND = "crm.email.send";
const KEY_SETTINGS = "crm.email.settings";

const EVT = {
  sent: "crm.email.sent",
  received: "crm.email.received",
  opened: "crm.email.opened",
  clicked: "crm.email.clicked",
  replied: "crm.email.replied",
  bounced: "crm.email.bounced",
} as const;

/** AUDIT-CLASS X5: อายุการจองจดหมายตั้งเวลา = 15 นาที (ค่าเดียวกับ lease ของงานรายนาที) */
export const CRM_EMAIL_LEASE_MS = 15 * 60_000;
/** ไม่นับ "เปิดอ่าน" ที่เกิดเร็วกว่านี้หลังส่ง — เป็นตัวสแกนของผู้ให้บริการ ไม่ใช่คน */
const OPEN_MIN_AGE_MS = 2_000;
/** หน้าต่างจับคู่เธรดด้วยหัวข้อ (ชั้นที่ 3) */
const SUBJECT_THREAD_WINDOW_MS = 30 * 86_400_000;
/** เพดาน body ของ webhook ผู้ให้บริการ */
const WEBHOOK_MAX_BYTES = 256 * 1024;
/** อายุลายเซ็น Svix ที่ยอมรับ (±5 นาที) */
const WEBHOOK_SKEW_SEC = 300;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strOrNull = (v: unknown): string | null => (str(v) ? str(v) : null);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uniq = (list: string[]) => [...new Set(list.filter(Boolean))];

/** ที่อยู่เว็บของแอป — อ่าน `process.env` ตรง ๆ (ห้ามลาก `@/lib/env` เข้ากราฟของ facade CRM) */
function appUrl(): string {
  const raw = str(process.env.APP_URL) || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

const SYSTEM_ACTOR: MemberActor = { userId: "system", role: "OWNER", unitAccess: ["*"], permissions: {} };

/** AUDIT-CLASS X7: token = `<emailId>~<สุ่ม 192 บิต>` (≥ 128 บิตตามสัญญา) — ฐานเก็บแต่ `tokenHash` */
function newToken(emailId: string): string {
  return `${emailId}~${randomBytes(24).toString("base64url")}`;
}
/** ค่าย่อยของ token แยกตาม "หน้าที่" — ลายเซ็นของงานหนึ่งใช้กับอีกงานหนึ่งไม่ได้ */
function tokenHash(purpose: "o" | "c" | "u", token: string): string {
  return sha256(`crm.email.${purpose}:${token}`);
}
const emailIdOfToken = (token: unknown): string => str(token).split("~")[0] ?? "";

// ───────────────────────── ทางเข้า (ระบบ → uiVersion → สิทธิ์) ─────────────────────────

// AUDIT-CLASS X1: `ctx.systemId` ต้องเป็นระบบ CRM ของร้านนี้จริง — ไม่เชื่อ id ที่ผู้เรียกส่งมา
async function resolveSystem(ctx: EmailsCtx): Promise<{ id: string; settings: Json }> {
  const sys =
    str(ctx?.tenantId) && str(ctx?.systemId)
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, settings: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
  return sys;
}

/** ลำดับตายตัว: ระบบ (NOT_FOUND) → uiVersion 2 (CrmV2DisabledError) → คีย์ (FORBIDDEN) */
async function enter(ctx: EmailsCtx, actor: MemberActor | null | undefined, key: string): Promise<{ actor: MemberActor; settings: CrmEmailSettings & { inboundKey: string | null } }> {
  const sys = await resolveSystem(ctx);
  await assertCrmV2(ctx);
  if (!actor || actor.role === "CUSTOMER") throw new CrmForbiddenError(key);
  if (!crmCan(actor, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
  return { actor, settings: crmEmailSettingsOf(sys.settings) };
}

/** เหมือน `enter` แต่ตรวจการมองเห็นของผู้ติดต่อก่อนคีย์ (มองไม่เห็น = NOT_FOUND · เห็นแต่ไม่มีคีย์ = FORBIDDEN) */
async function enterWithContact(
  ctx: EmailsCtx,
  actor: MemberActor | null | undefined,
  key: string,
  contactId: unknown,
): Promise<{ actor: MemberActor; contact: CrmContact; settings: CrmEmailSettings & { inboundKey: string | null } }> {
  const sys = await resolveSystem(ctx);
  await assertCrmV2(ctx);
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
  const id = str(contactId);
  const contact = id ? await prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, actor), { id }] } }) : null;
  if (!contact) throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
  if (!crmCan(actor, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
  return { actor, contact, settings: crmEmailSettingsOf(sys.settings) };
}

/** ค่าตั้งค่าอีเมลของระบบ (ไม่ผ่าน actor — ใช้ในงานเบื้องหลัง/เส้นสาธารณะ) */
async function settingsOfSystem(systemId: string): Promise<(CrmEmailSettings & { inboundKey: string | null; uiVersion: number }) | null> {
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, type: "CRM" }, select: { settings: true } });
  if (!sys) return null;
  const crm = isObj(sys.settings) && isObj(sys.settings.crm) ? sys.settings.crm : {};
  return { ...crmEmailSettingsOf(sys.settings), uiVersion: crm.uiVersion === 2 ? 2 : 1 };
}

async function auditEmail(ctx: EmailsCtx, action: string, targetId: string | undefined, data: { before?: unknown; after?: unknown } = {}): Promise<void> {
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: str(ctx.actorUserId) || null,
    actorType: str(ctx.actorUserId) ? "USER" : "SYSTEM",
    action,
    targetType: "CrmEmailMessage",
    ...(targetId ? { targetId } : {}),
    ...data,
  });
}

// ───────────────────────── ตั้งค่าร้าน · รายคน · กุญแจกล่องขาเข้า ─────────────────────────

const inboundAddressOf = (key: string | null) => (key ? `${CRM_INBOUND_PREFIX}+${key}@${CRM_EMAIL_SHARK_DOMAIN}` : "");

/** กุญแจกล่องขาเข้าของระบบ — ยังไม่มี = สร้างด้วยคำสั่งเดียว (คำสั่งเดียวกันเขียนเฉพาะเมื่อยังว่าง) */
async function inboundKeyOf(ctx: EmailsCtx, current: string | null): Promise<string> {
  if (current && CRM_INBOUND_KEY_RE.test(current)) return current;
  const fresh = newInboundKey();
  await ensureCrmInboundKeySql(ctx, fresh);
  const again = await settingsOfSystem(ctx.systemId);
  return again?.inboundKey ?? fresh;
}

function newInboundKey(): string {
  const B32 = "abcdefghijklmnopqrstuvwxyz234567";
  return Array.from(randomBytes(8))
    .map((b) => B32[b % 32])
    .join("");
}

export type EmailSettingsView = CrmEmailSettings & { inboundAddress: string; inboundKey: string };

export async function getEmailSettings(ctx: EmailsCtx, actor: MemberActor): Promise<EmailSettingsView> {
  const { settings } = await enter(ctx, actor, KEY_SETTINGS);
  const key = await inboundKeyOf(ctx, settings.inboundKey);
  return {
    inboundEnabled: settings.inboundEnabled,
    fromMode: settings.fromMode,
    fromName: settings.fromName,
    fromAddr: settings.fromAddr,
    replyToMode: settings.replyToMode,
    replyToAddr: settings.replyToAddr,
    copyToAddr: settings.copyToAddr,
    copyMode: settings.copyMode,
    bccCaptureEnabled: settings.bccCaptureEnabled,
    strangerToLead: settings.strangerToLead,
    trackOpens: settings.trackOpens,
    trackClicks: settings.trackClicks,
    retentionDays: settings.retentionDays,
    allowUserOverride: settings.allowUserOverride,
    inboundKey: key,
    inboundAddress: inboundAddressOf(key),
  };
}

function cleanAddrPatch(value: unknown, label: string): string | null {
  if (value === null || value === undefined || str(value) === "") return null;
  if (hasLineBreak(value) || !isEmailAddr(value)) throw fail("VALIDATION", `${label}ยังไม่ใช่ที่อยู่อีเมลที่ใช้ได้ — พิมพ์ในรูป name@example.com แล้วบันทึกอีกครั้ง`);
  return bareEmail(value);
}

function cleanTextPatch(value: unknown, label: string, max = 120): string | null {
  if (value === null || value === undefined || str(value) === "") return null;
  if (hasLineBreak(value)) throw fail("VALIDATION", `${label}มีการขึ้นบรรทัดใหม่อยู่ข้างใน ซึ่งใช้ในหัวจดหมายไม่ได้ — พิมพ์เป็นบรรทัดเดียวแล้วบันทึกอีกครั้ง`);
  return str(value).slice(0, max);
}

export type EmailSettingsPatch = Partial<Record<keyof CrmEmailSettings, unknown>>;

export async function setEmailSettings(ctx: EmailsCtx, actor: MemberActor, patch: EmailSettingsPatch): Promise<EmailSettingsView> {
  const { settings } = await enter(ctx, actor, KEY_SETTINGS);
  const p = isObj(patch) ? patch : {};
  const out: Record<string, unknown> = {};
  const bool = (k: keyof CrmEmailSettings) => {
    if (!(k in p)) return;
    if (typeof p[k] !== "boolean") throw fail("VALIDATION", "สวิตช์ในหน้าตั้งค่าอีเมลต้องเป็นเปิดหรือปิด — ลองกดอีกครั้ง");
    out[k] = p[k];
  };
  for (const k of ["inboundEnabled", "bccCaptureEnabled", "strangerToLead", "trackOpens", "trackClicks", "allowUserOverride"] as const) bool(k);
  if ("fromMode" in p) {
    if (!CRM_EMAIL_FROM_MODES.includes(String(p.fromMode) as never)) throw fail("VALIDATION", "โหมดที่อยู่ผู้ส่งต้องเป็น SHARK หรือ DOMAIN — เลือกจากรายการแล้วบันทึกอีกครั้ง");
    out.fromMode = String(p.fromMode);
  }
  if ("replyToMode" in p) {
    if (!CRM_EMAIL_REPLY_MODES.includes(String(p.replyToMode) as never)) throw fail("VALIDATION", "โหมดที่อยู่รับคำตอบต้องเป็น SHARK · STAFF · SELF หรือ CUSTOM — เลือกจากรายการแล้วบันทึกอีกครั้ง");
    out.replyToMode = String(p.replyToMode);
  }
  if ("copyMode" in p) {
    if (!CRM_EMAIL_COPY_MODES.includes(String(p.copyMode) as never)) throw fail("VALIDATION", "โหมดสำเนาต้องเป็น NONE · IN · OUT หรือ BOTH — เลือกจากรายการแล้วบันทึกอีกครั้ง");
    out.copyMode = String(p.copyMode);
  }
  if ("fromAddr" in p) out.fromAddr = cleanAddrPatch(p.fromAddr, "ที่อยู่ผู้ส่ง");
  if ("replyToAddr" in p) out.replyToAddr = cleanAddrPatch(p.replyToAddr, "ที่อยู่รับคำตอบ");
  if ("copyToAddr" in p) out.copyToAddr = cleanAddrPatch(p.copyToAddr, "ที่อยู่รับสำเนา");
  if ("fromName" in p) out.fromName = cleanTextPatch(p.fromName, "ชื่อผู้ส่ง");
  if ("retentionDays" in p) {
    const n = Number(p.retentionDays);
    if (!Number.isInteger(n) || n < CRM_EMAIL_RETENTION_MIN_DAYS || n > CRM_EMAIL_RETENTION_MAX_DAYS) {
      throw fail("VALIDATION", `อายุการเก็บเนื้อความอีเมลต้องอยู่ระหว่าง ${CRM_EMAIL_RETENTION_MIN_DAYS} ถึง ${CRM_EMAIL_RETENTION_MAX_DAYS} วัน — ใส่ตัวเลขในช่วงนี้แล้วบันทึกอีกครั้ง`);
    }
    out.retentionDays = n;
  }
  if (Object.keys(out).length > 0) await setCrmEmailKeys(ctx, out);
  await auditEmail(ctx, "crm.email.settings", undefined, {
    before: Object.fromEntries(Object.keys(out).map((k) => [k, (settings as unknown as Record<string, unknown>)[k]])),
    after: out,
  });
  return getEmailSettings(ctx, actor);
}

export async function rotateInboundKey(ctx: EmailsCtx, actor: MemberActor, opts: { confirm?: boolean; reason?: string }): Promise<{ key: string; address: string }> {
  await enter(ctx, actor, KEY_SETTINGS);
  const reason = str(opts?.reason);
  // AUDIT-CLASS X9: ของอันตราย — ที่อยู่เดิมหยุดรับทันที (จดหมายที่ลูกค้าตอบมาที่อยู่เก่าจะไม่เข้าระบบอีก)
  if (opts?.confirm !== true || reason.length < 5) {
    throw fail("CONFIRM_REQUIRED", "การเปลี่ยนกุญแจกล่องอีเมลทำให้ที่อยู่เดิมหยุดรับจดหมายทันที — ยืนยันและพิมพ์เหตุผลอย่างน้อย 5 ตัวอักษรก่อนทำรายการ");
  }
  const before = (await settingsOfSystem(ctx.systemId))?.inboundKey ?? null;
  const key = newInboundKey();
  await setCrmEmailKeys(ctx, { inboundKey: key });
  await auditEmail(ctx, "crm.email.rotate_key", undefined, { before: { hadKey: !!before }, after: { reason: reason.slice(0, 200) } });
  return { key, address: inboundAddressOf(key) };
}

// ── ตั้งค่ารายคน ──

function userSettingDto(row: { userId: string; fromName: string | null; fromAddr: string | null; replyToMode: string; replyToAddr: string | null; copyToAddr: string | null; copyMode: string; signatureHtml: string | null }, name: string | null): EmailUserSettingDto {
  return {
    userId: row.userId,
    userName: name,
    fromName: row.fromName,
    fromAddr: row.fromAddr,
    replyToMode: row.replyToMode,
    replyToAddr: row.replyToAddr,
    copyToAddr: row.copyToAddr,
    copyMode: row.copyMode,
    signatureHtml: row.signatureHtml,
  };
}

export async function getUserSetting(ctx: EmailsCtx, actor: MemberActor, userId?: string | null): Promise<EmailUserSettingDto | null> {
  const target = str(userId) || str(actor?.userId);
  const key = target === str(actor?.userId) ? KEY_SEND : KEY_SETTINGS;
  await enter(ctx, actor, key);
  const row = await prisma.crmEmailUserSetting.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, userId: target } });
  if (!row) return null;
  const user = await prisma.user.findFirst({ where: { id: target }, select: { name: true } });
  return userSettingDto(row, user?.name ?? null);
}

export type UserSettingPatch = {
  userId?: string | null;
  fromName?: string | null;
  fromAddr?: string | null;
  replyToMode?: string | null;
  replyToAddr?: string | null;
  copyToAddr?: string | null;
  copyMode?: string | null;
  signatureHtml?: string | null;
};

export async function setUserSetting(ctx: EmailsCtx, actor: MemberActor, patch: UserSettingPatch): Promise<EmailUserSettingDto> {
  const target = str(patch?.userId) || str(actor?.userId);
  const own = target === str(actor?.userId);
  await enter(ctx, actor, own ? KEY_SEND : KEY_SETTINGS);
  const member = await prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: target }, select: { userId: true } });
  if (!member) throw fail("NOT_FOUND", "ไม่พบพนักงานคนนี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  const data: Record<string, unknown> = {};
  if ("fromName" in patch) data.fromName = cleanTextPatch(patch.fromName, "ชื่อผู้ส่ง");
  if ("signatureHtml" in patch) data.signatureHtml = patch.signatureHtml === null ? null : sanitizeHtml(str(patch.signatureHtml)).slice(0, 4000) || null;
  if ("fromAddr" in patch) data.fromAddr = cleanAddrPatch(patch.fromAddr, "ที่อยู่ผู้ส่ง");
  if ("replyToAddr" in patch) data.replyToAddr = cleanAddrPatch(patch.replyToAddr, "ที่อยู่รับคำตอบ");
  if ("copyToAddr" in patch) data.copyToAddr = cleanAddrPatch(patch.copyToAddr, "ที่อยู่รับสำเนา");
  if ("replyToMode" in patch && patch.replyToMode !== null) {
    if (!CRM_EMAIL_REPLY_MODES.includes(String(patch.replyToMode) as never)) throw fail("VALIDATION", "โหมดที่อยู่รับคำตอบต้องเป็น SHARK · STAFF · SELF หรือ CUSTOM — เลือกจากรายการแล้วบันทึกอีกครั้ง");
    data.replyToMode = String(patch.replyToMode);
  }
  if ("copyMode" in patch && patch.copyMode !== null) {
    if (!CRM_EMAIL_COPY_MODES.includes(String(patch.copyMode) as never)) throw fail("VALIDATION", "โหมดสำเนาต้องเป็น NONE · IN · OUT หรือ BOTH — เลือกจากรายการแล้วบันทึกอีกครั้ง");
    data.copyMode = String(patch.copyMode);
  }
  const row = await prisma.crmEmailUserSetting.upsert({
    where: { systemId_userId: { systemId: ctx.systemId, userId: target } },
    create: { tenantId: ctx.tenantId, systemId: ctx.systemId, userId: target, ...data },
    update: data,
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: str(ctx.actorUserId) || null,
    action: "crm.email.user_setting",
    targetType: "CrmEmailUserSetting",
    targetId: row.id,
    after: { userId: target, changedKeys: Object.keys(data) },
  });
  const user = await prisma.user.findFirst({ where: { id: target }, select: { name: true } });
  return userSettingDto(row, user?.name ?? null);
}

export async function listUserSettings(ctx: EmailsCtx, actor: MemberActor): Promise<EmailUserSettingDto[]> {
  await enter(ctx, actor, KEY_SETTINGS);
  const rows = await prisma.crmEmailUserSetting.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: { createdAt: "asc" }, take: 500 });
  const users = rows.length
    ? await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => userSettingDto(r, byId.get(r.userId) ?? null));
}

// ───────────────────────── resolveRouting ─────────────────────────

async function verifiedDomains(tenantId: string): Promise<Set<string>> {
  const rows = await prisma.emailDomain.findMany({ where: { tenantId, status: "VERIFIED" }, select: { domain: true } });
  return new Set(rows.map((r) => r.domain.toLowerCase()));
}

async function routingFor(
  ctx: EmailsCtx,
  actorUserId: string | null,
  settings: CrmEmailSettings & { inboundKey: string | null },
): Promise<CrmEmailRoutingView> {
  const [tenant, user, userRow, verified] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: ctx.tenantId }, select: { slug: true } }),
    actorUserId ? prisma.user.findFirst({ where: { id: actorUserId }, select: { name: true, email: true } }) : Promise.resolve(null),
    actorUserId
      ? prisma.crmEmailUserSetting.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, userId: actorUserId } })
      : Promise.resolve(null),
    verifiedDomains(ctx.tenantId),
  ]);
  const key = await inboundKeyOf(ctx, settings.inboundKey);
  const overridable = settings.allowUserOverride === true ? userRow : null;
  const sharkFrom = `${tenant?.slug ?? "shop"}@${CRM_EMAIL_SHARK_DOMAIN}`.toLowerCase();

  let fromAddr = sharkFrom;
  let via: "SHARK" | "DOMAIN" = "SHARK";
  const userFrom = bareEmail(overridable?.fromAddr);
  const shopFrom = bareEmail(settings.fromAddr);
  if (userFrom && verified.has(emailDomainOf(userFrom))) {
    fromAddr = userFrom;
    via = "DOMAIN";
  } else if (settings.fromMode === "DOMAIN" && shopFrom && verified.has(emailDomainOf(shopFrom))) {
    fromAddr = shopFrom;
    via = "DOMAIN";
  }
  const fromName = strOrNull(overridable?.fromName) ?? (via === "SHARK" ? strOrNull(user?.name) : null) ?? strOrNull(settings.fromName) ?? strOrNull(user?.name);

  const modeRow = overridable && str(overridable.replyToMode) ? overridable : null;
  const mode = (modeRow ? str(modeRow.replyToMode) : settings.replyToMode) as CrmEmailRoutingView["via"] | string;
  let replyTo = inboundAddressOf(key);
  if (mode === "STAFF" || mode === "SELF") replyTo = bareEmail(user?.email) || inboundAddressOf(key);
  else if (mode === "CUSTOM") replyTo = bareEmail(modeRow ? modeRow.replyToAddr : settings.replyToAddr) || inboundAddressOf(key);

  const copyTo: string[] = [];
  const copyIn: string[] = [];
  const add = (addr: unknown, copyMode: unknown) => {
    const a = bareEmail(addr);
    const m = String(copyMode ?? "NONE") as CrmEmailCopyMode;
    if (!a) return;
    if (m === "OUT" || m === "BOTH") copyTo.push(a);
    if (m === "IN" || m === "BOTH") copyIn.push(a);
  };
  add(settings.copyToAddr, settings.copyMode);
  if (overridable) add(overridable.copyToAddr, overridable.copyMode);
  return { fromName, fromAddr, replyTo, copyTo: uniq(copyTo), copyIn: uniq(copyIn), via };
}

export async function resolveRouting(ctx: EmailsCtx, actor: MemberActor, opts: { contactId?: string | null } = {}): Promise<CrmEmailRoutingView> {
  const { settings } = await enter(ctx, actor, KEY_SEND);
  void opts;
  return routingFor(ctx, str(actor.userId) || null, settings);
}

// ───────────────────────── เทมเพลต ─────────────────────────

export async function listTemplates(ctx: EmailsCtx, actor: MemberActor): Promise<EmailTemplateDto[]> {
  await enter(ctx, actor, KEY_READ);
  const rows = await prisma.crmEmailTemplate.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 500 });
  return rows.map((r) => ({ id: r.id, name: r.name, subject: r.subject, bodyHtml: r.bodyHtml, category: r.category, active: r.active }));
}

export async function saveTemplate(
  ctx: EmailsCtx,
  actor: MemberActor,
  input: { id?: string | null; name: string; subject: string; bodyHtml: string; category?: string | null; active?: boolean },
): Promise<EmailTemplateDto> {
  await enter(ctx, actor, KEY_SETTINGS);
  const name = str(input?.name).slice(0, 120);
  const subject = str(input?.subject).slice(0, CRM_EMAIL_SUBJECT_MAX);
  if (!name) throw fail("VALIDATION", "ตั้งชื่อแม่แบบจดหมายก่อนบันทึก");
  if (!subject || hasLineBreak(subject)) throw fail("VALIDATION", "หัวข้อของแม่แบบต้องมีข้อความและเป็นบรรทัดเดียว — แก้แล้วบันทึกอีกครั้ง");
  // AUDIT-CLASS X6: เนื้อความของแม่แบบผ่านตัวตัดกลางก่อนเก็บ (ที่นี่คือที่ที่ HTML ถูก "เก็บไว้ใช้ซ้ำ")
  const bodyHtml = sanitizeHtml(str(input?.bodyHtml), { allowLinkSchemes: ["http", "https", "mailto", "tel"] });
  if (!bodyHtml) throw fail("VALIDATION", "เนื้อความของแม่แบบยังว่างอยู่ (หรือเหลือแต่ส่วนที่ระบบตัดออกเพื่อความปลอดภัย) — พิมพ์เนื้อความแล้วบันทึกอีกครั้ง");
  if (Buffer.byteLength(bodyHtml, "utf8") > CRM_EMAIL_BODY_MAX_BYTES) throw fail("VALIDATION", "เนื้อความของแม่แบบยาวเกินกำหนด — ย่อให้สั้นลงแล้วบันทึกอีกครั้ง");
  const id = str(input?.id);
  const data = { name, subject, bodyHtml, category: strOrNull(input?.category), active: input?.active === undefined ? true : input.active === true };
  try {
    if (id) {
      const prior = await prisma.crmEmailTemplate.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
      if (!prior) throw fail("NOT_FOUND", TEMPLATE_NOT_FOUND);
      const row = await prisma.crmEmailTemplate.update({ where: { id: prior.id }, data });
      await writeAudit({ tenantId: ctx.tenantId, actorId: str(ctx.actorUserId) || null, action: "crm.email.template.update", targetType: "CrmEmailTemplate", targetId: row.id, after: { name, category: data.category } });
      return { id: row.id, name: row.name, subject: row.subject, bodyHtml: row.bodyHtml, category: row.category, active: row.active };
    }
    const row = await prisma.crmEmailTemplate.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...data } });
    await writeAudit({ tenantId: ctx.tenantId, actorId: str(ctx.actorUserId) || null, action: "crm.email.template.create", targetType: "CrmEmailTemplate", targetId: row.id, after: { name, category: data.category } });
    return { id: row.id, name: row.name, subject: row.subject, bodyHtml: row.bodyHtml, category: row.category, active: row.active };
  } catch (e) {
    if (e instanceof EmailError) throw e;
    if (isUniqueViolation(e)) throw fail("CONFLICT", "มีแม่แบบชื่อนี้อยู่แล้วในระบบนี้ — ตั้งชื่ออื่นหรือแก้แม่แบบเดิม");
    throw e;
  }
}

export async function deleteTemplate(ctx: EmailsCtx, actor: MemberActor, id: string): Promise<{ ok: true }> {
  await enter(ctx, actor, KEY_SETTINGS);
  const prior = await prisma.crmEmailTemplate.findFirst({ where: { id: str(id), tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!prior) throw fail("NOT_FOUND", TEMPLATE_NOT_FOUND);
  await prisma.crmEmailTemplate.delete({ where: { id: prior.id } });
  await writeAudit({ tenantId: ctx.tenantId, actorId: str(ctx.actorUserId) || null, action: "crm.email.template.delete", targetType: "CrmEmailTemplate", targetId: prior.id, before: { name: prior.name } });
  return { ok: true };
}

function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const x = e as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; code?: unknown } } }; message?: unknown };
  if (x.code === "P2002") return true;
  const c = x.meta?.driverAdapterError?.cause;
  if (c && (c.originalCode === "23505" || c.code === "23505")) return true;
  return typeof x.message === "string" && /23505|Unique constraint failed/i.test(x.message);
}

// ───────────────────────── โดเมนผู้ส่ง (Resend) ─────────────────────────

const RESEND_DOMAINS_URL = "https://api.resend.com/domains";

function domainDto(row: { id: string; domain: string; status: string; records: Json; verifiedAt: Date | null }): EmailDomainDto {
  const raw = Array.isArray(row.records) ? row.records : [];
  const records: EmailDomainRecord[] = [];
  for (const r of raw) {
    if (!isObj(r)) continue;
    const type = String(r.type ?? "").toUpperCase();
    if (type !== "TXT" && type !== "MX" && type !== "CNAME") continue;
    records.push({
      type,
      name: String(r.name ?? ""),
      value: String(r.value ?? ""),
      ...(typeof r.priority === "number" ? { priority: r.priority } : {}),
      ...(r.status ? { status: String(r.status) } : {}),
    });
  }
  const status = row.status === "VERIFIED" ? "VERIFIED" : row.status === "FAILED" ? "FAILED" : "PENDING";
  return { id: row.id, domain: row.domain, status, records, verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null };
}

function cleanDomain(raw: unknown): string {
  const d = str(raw).toLowerCase();
  if (!d || /[\s/:@\\?#]/.test(d) || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) || d.length > 253) {
    throw fail("VALIDATION", "ชื่อโดเมนยังไม่ถูกต้อง — พิมพ์เฉพาะชื่อโดเมน เช่น example.com (ไม่ต้องมี https:// หรือเส้นทางต่อท้าย)");
  }
  if (d === CRM_EMAIL_SHARK_DOMAIN || d.endsWith(`.${CRM_EMAIL_SHARK_DOMAIN}`)) {
    throw fail("VALIDATION", `โดเมน ${CRM_EMAIL_SHARK_DOMAIN} เป็นของระบบอยู่แล้ว — ใช้ที่อยู่ผู้ส่งของ SHARK ได้เลยโดยไม่ต้องเพิ่มโดเมน`);
  }
  return d;
}

function providerRecords(payload: unknown): unknown[] {
  if (!isObj(payload) || !Array.isArray(payload.records)) return [];
  return payload.records
    .filter(isObj)
    .map((r) => ({
      type: String(r.type ?? "").toUpperCase(),
      name: String(r.name ?? ""),
      value: String(r.value ?? ""),
      ...(typeof r.priority === "number" ? { priority: r.priority } : {}),
      ...(r.status ? { status: String(r.status) } : {}),
      ...(r.record ? { record: String(r.record) } : {}),
    }));
}

export async function addDomain(ctx: EmailsCtx, actor: MemberActor, input: { domain: string }, deps?: { fetch?: typeof fetch }): Promise<EmailDomainDto> {
  await enter(ctx, actor, KEY_SETTINGS);
  const domain = cleanDomain(input?.domain);
  const prior = await prisma.emailDomain.findFirst({ where: { tenantId: ctx.tenantId, domain } });
  if (prior) return domainDto(prior);
  const doFetch = deps?.fetch ?? fetch;
  let providerId: string | null = null;
  let records: unknown[] = [];
  try {
    const res = await doFetch(RESEND_DOMAINS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${str(process.env.RESEND_API_KEY)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: domain }),
    });
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      providerId = typeof json.id === "string" ? json.id : null;
      records = providerRecords(json);
    }
  } catch {
    providerId = null;
  }
  if (!providerId) throw fail("NOT_CONFIGURED", "ยังตั้งโดเมนผู้ส่งกับผู้ให้บริการอีเมลไม่สำเร็จ — ลองอีกครั้งในอีกสักครู่ หรือแจ้งผู้ดูแลระบบ");
  const row = await prisma.emailDomain.create({
    data: { tenantId: ctx.tenantId, domain, status: "PENDING", providerId, records: records as Prisma.InputJsonValue },
  });
  await writeAudit({ tenantId: ctx.tenantId, actorId: str(ctx.actorUserId) || null, action: "crm.email.domain.add", targetType: "EmailDomain", targetId: row.id, after: { domain } });
  return domainDto(row);
}

export async function refreshDomain(ctx: EmailsCtx, actor: MemberActor, domainId: string, deps?: { fetch?: typeof fetch }): Promise<EmailDomainDto> {
  await enter(ctx, actor, KEY_SETTINGS);
  // AUDIT-CLASS X1: id ของร้านอื่น = ไม่พบ (ไม่บอกว่ามีอยู่จริง)
  const row = await prisma.emailDomain.findFirst({ where: { id: str(domainId), tenantId: ctx.tenantId } });
  if (!row) throw fail("NOT_FOUND", DOMAIN_NOT_FOUND);
  if (!row.providerId) return domainDto(row);
  const doFetch = deps?.fetch ?? fetch;
  let status = row.status;
  let records: unknown[] = Array.isArray(row.records) ? row.records : [];
  try {
    const res = await doFetch(`${RESEND_DOMAINS_URL}/${encodeURIComponent(row.providerId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${str(process.env.RESEND_API_KEY)}` },
    });
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const s = String(json.status ?? "").toLowerCase();
      status = s === "verified" ? "VERIFIED" : s === "failed" || s === "temporary_failure" ? "FAILED" : "PENDING";
      const rec = providerRecords(json);
      if (rec.length) records = rec;
    }
  } catch {
    /* ผู้ให้บริการล่ม = คงสถานะเดิม (ไม่เดาว่า verify แล้ว) */
  }
  const updated = await prisma.emailDomain.update({
    where: { id: row.id },
    data: { status, records: records as Prisma.InputJsonValue, verifiedAt: status === "VERIFIED" ? (row.verifiedAt ?? new Date()) : null },
  });
  await writeAudit({ tenantId: ctx.tenantId, actorId: str(ctx.actorUserId) || null, action: "crm.email.domain.refresh", targetType: "EmailDomain", targetId: row.id, after: { domain: row.domain, status } });
  return domainDto(updated);
}

export async function listDomains(ctx: EmailsCtx, actor: MemberActor): Promise<EmailDomainDto[]> {
  await enter(ctx, actor, KEY_SETTINGS);
  const rows = await prisma.emailDomain.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" }, take: 200 });
  return rows.map(domainDto);
}

// ───────────────────────── ตัวส่งจริง (import ตอนใช้ — ห้ามลาก `@/lib/env` เข้ากราฟ) ─────────────────────────

async function transportOf(deps?: EmailDeps): Promise<EmailTransport> {
  if (deps?.transport) return deps.transport;
  const core = await import("@/lib/core/email");
  return (msg: RichEmail) => core.sendEmailRich(msg);
}

// ───────────────────────── ประกอบจดหมายขาออก ─────────────────────────

type ComposeOut = {
  html: string;
  text: string;
  openToken: string;
  openHash: string;
  unsubToken: string;
  unsubHash: string;
  links: { h: string; url: string }[];
};

function decodeAttr(v: string): string {
  return v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/**
 * ประกอบเนื้อความที่จะ "ส่งออกไป" จากเนื้อความที่ "เก็บไว้"
 * 🔴 AUDIT-CLASS X7: พิกเซล · ลิงก์ที่ห่อ · ลิงก์เลิกรับ อยู่ในฉบับที่ส่งออกเท่านั้น — ฐานเก็บเนื้อความ
 *    เปล่าที่ไม่มี token อยู่เลย (ใครอ่านฐานได้ก็นับ "เปิดอ่าน" ปลอมหรือกดเลิกรับแทนลูกค้าไม่ได้)
 * 🔴 ลิงก์เลิกรับ **ไม่เคยถูกห่อ**ด้วยการนับคลิก และไม่เคยหายไปเพราะลูกค้าปิดการติดตาม
 */
function composeOutgoing(args: { emailId: string; storedHtml: string; trackOpens: boolean; trackClicks: boolean }): ComposeOut {
  const base = appUrl();
  const links: { h: string; url: string }[] = [];
  let html = args.storedHtml;
  if (args.trackClicks) {
    html = html.replace(/href="(https?:\/\/[^"]*)"/gi, (_m, raw: string) => {
      const token = newToken(args.emailId);
      links.push({ h: tokenHash("c", token), url: decodeAttr(raw) });
      return `href="${base}/t/c/${token}"`;
    });
  }
  const unsubToken = newToken(args.emailId);
  html += `<hr><p style="font-size:12px;color:#6b7280">ไม่ต้องการรับอีเมลจากเราแล้ว — <a href="${base}/u/${unsubToken}">กดที่นี่เพื่อยกเลิกรับอีเมล</a></p>`;
  const openToken = newToken(args.emailId);
  if (args.trackOpens) {
    html += `<img src="${base}/t/o/${openToken}.gif" width="1" height="1" alt="">`;
  }
  return {
    html,
    text: htmlToText(args.storedHtml),
    openToken,
    openHash: tokenHash("o", openToken),
    unsubToken,
    unsubHash: tokenHash("u", unsubToken),
    links,
  };
}

/**
 * รหัสย่อของเธรด = `CRM_THREAD_SHORT_LEN` ตัวแรกของ `threadKey` (ค่าเดียวกันทั้งตอนส่งออกและตอนรับเข้า)
 * 🔴 ตอนรับเข้าจะเทียบแบบ **เท่ากัน** กับค่าที่คำนวณจากแถวในฐาน (`left("threadKey", n) = $short`) ไม่ใช่
 *    `startsWith` ของค่าที่คนนอกส่งมา — ดูเหตุผลที่ `CRM_THREAD_SHORT_LEN`
 */
const threadShortOf = (threadKey: string) => threadKey.slice(0, CRM_THREAD_SHORT_LEN);
const newThreadKey = () => randomBytes(16).toString("hex");
const newRfcId = () => `${randomBytes(12).toString("hex")}.${Date.now().toString(36)}@${CRM_EMAIL_SHARK_DOMAIN}`;
const scopedMessageId = (systemId: string, rfcId: string) => `${systemId}:${rfcId}`;
const rfcIdOf = (stored: string | null | undefined) => {
  const s = str(stored);
  const at = s.indexOf(":");
  return at > 0 ? s.slice(at + 1) : s;
};

/** ที่อยู่ Reply-To ที่ส่งออกจริง — โหมด SHARK เติม `+t<short>` ให้จับเธรดได้แม้ไคลเอนต์ไม่ส่ง In-Reply-To */
function replyToHeader(routing: CrmEmailRoutingView, inboundKey: string, threadKey: string): string {
  const plain = inboundAddressOf(inboundKey);
  if (routing.replyTo.toLowerCase() !== plain.toLowerCase()) return routing.replyTo;
  return `${CRM_INBOUND_PREFIX}+${inboundKey}+t${threadShortOf(threadKey)}@${CRM_EMAIL_SHARK_DOMAIN}`;
}

// ───────────────────────── ไฟล์แนบ ─────────────────────────

function checkOutgoingAttachments(list: SendAttachmentInput[] | undefined): SendAttachmentInput[] {
  const items = Array.isArray(list) ? list : [];
  if (items.length > CRM_EMAIL_ATTACH_MAX_COUNT) {
    throw fail("VALIDATION", `แนบไฟล์ได้ไม่เกิน ${CRM_EMAIL_ATTACH_MAX_COUNT} ไฟล์ต่อจดหมาย 1 ฉบับ — ลบบางไฟล์ออกหรือส่งแยกฉบับ`);
  }
  for (const a of items) {
    if (hasLineBreak(a?.filename)) throw fail("VALIDATION", "ชื่อไฟล์แนบมีการขึ้นบรรทัดใหม่อยู่ข้างใน — เปลี่ยนชื่อไฟล์แล้วลองอีกครั้ง");
    if (!(a?.data instanceof Uint8Array) || a.data.length === 0) throw fail("VALIDATION", "ไฟล์แนบว่างหรืออ่านไม่ได้ — เลือกไฟล์ใหม่อีกครั้ง");
    if (a.data.length > CRM_EMAIL_ATTACH_MAX_BYTES) {
      throw fail("VALIDATION", `ไฟล์แนบใหญ่เกิน ${Math.round(CRM_EMAIL_ATTACH_MAX_BYTES / (1024 * 1024))} MB — ย่อขนาดหรือส่งลิงก์แทน`);
    }
    const mime = normalizeUploadType(a.contentType);
    if (!CRM_EMAIL_ATTACH_MIME_ALLOWLIST.includes(mime) || !ALLOWED_UPLOAD_TYPES[mime as keyof typeof ALLOWED_UPLOAD_TYPES]) {
      throw fail("VALIDATION", ATTACH_MIME_MSG);
    }
  }
  return items;
}

/** AUDIT-CLASS X10: เก็บไฟล์แนบแบบส่วนตัวเสมอ (path `t/<tenant>/private/…` · cdnUrl เป็นค่าหมาย) */
async function storeAttachments(
  tenantId: string,
  items: { filename: string; contentType: string; data: Uint8Array }[],
  deps?: EmailDeps,
): Promise<CrmEmailAttachmentRef[]> {
  const out: CrmEmailAttachmentRef[] = [];
  for (const a of items) {
    const mime = normalizeUploadType(a.contentType);
    const up = await uploadFile(
      { tenantId },
      { kind: "ATTACHMENT", filename: a.filename, contentType: mime, data: a.data, maxBytes: CRM_EMAIL_ATTACH_MAX_BYTES, visibility: "private" },
      deps?.put ? { put: deps.put } : undefined,
    );
    if (!up.ok) continue;
    out.push({ fileId: up.assetId, name: a.filename.slice(0, 200), size: a.data.length, mime });
  }
  return out;
}

// ───────────────────────── sendEmail / sendAsSystem ─────────────────────────

type SendCore = SendInput & { senderUserId?: string | null; sequenceStepId?: string | null };

function cleanSubject(raw: unknown): string {
  const s = str(raw);
  if (!s || s.length > CRM_EMAIL_SUBJECT_MAX || hasLineBreak(s)) {
    throw fail("VALIDATION", `หัวข้อจดหมายต้องมีข้อความ ยาวไม่เกิน ${CRM_EMAIL_SUBJECT_MAX} ตัวอักษร และเป็นบรรทัดเดียว — แก้หัวข้อแล้วส่งอีกครั้ง`);
  }
  return s;
}

function cleanAddrList(raw: unknown, label: string): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: string[] = [];
  for (const one of list) {
    if (hasLineBreak(one) || !isEmailAddr(one)) {
      throw fail("VALIDATION", `${label}มีที่อยู่ที่ยังใช้ไม่ได้อยู่ในรายการ — ตรวจรูปแบบที่อยู่ (name@example.com) แล้วส่งอีกครั้ง`);
    }
    out.push(bareEmail(one));
  }
  return uniq(out);
}

/** R-E.11: "ตอบในเธรดที่ลูกค้าเริ่ม" = จดหมายอ้างอิงอยู่ในเธรดที่มีข้อความขาเข้าอยู่แล้ว */
async function isTransactionalReply(systemId: string, replyToEmailId: string | null): Promise<{ transactional: boolean; parent: CrmEmailMessage | null }> {
  if (!replyToEmailId) return { transactional: false, parent: null };
  const parent = await prisma.crmEmailMessage.findFirst({ where: { id: replyToEmailId, systemId } });
  if (!parent) return { transactional: false, parent: null };
  const inbound = await prisma.crmEmailMessage.count({ where: { systemId, threadKey: parent.threadKey, direction: "IN" } });
  return { transactional: inbound > 0, parent };
}

async function renderTemplate(
  ctx: EmailsCtx,
  templateId: string,
  contact: CrmContact,
  vars: Record<string, string> | undefined,
): Promise<{ subject: string; bodyHtml: string }> {
  const tpl = await prisma.crmEmailTemplate.findFirst({ where: { id: templateId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!tpl) throw fail("NOT_FOUND", TEMPLATE_NOT_FOUND);
  // AUDIT-CLASS X6: ค่าที่หยอดเข้าไปถูก escape ครั้งเดียว ⇒ `<img onerror=…>` ในค่าตัวแปรกลายเป็นข้อความ
  const merged: Record<string, string> = {
    "contact.firstName": contact.firstName?.trim() || contact.name?.trim() || "ลูกค้า",
    "contact.lastName": contact.lastName?.trim() ?? "",
    "contact.name": contact.name?.trim() || "ลูกค้า",
    "contact.companyName": contact.company?.trim() ?? "",
  };
  for (const [k, v] of Object.entries(vars ?? {})) merged[k] = String(v ?? "");
  const escaped: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) escaped[k] = escapeHtmlText(v);
  return { subject: renderEmailVars(tpl.subject, merged), bodyHtml: renderEmailVars(tpl.bodyHtml, escaped) };
}

async function sendCore(ctx: EmailsCtx, actor: MemberActor | null, input: SendCore, deps?: EmailDeps): Promise<SendResult> {
  const systemRow = await resolveSystem(ctx);
  await assertCrmV2(ctx);
  const settings = crmEmailSettingsOf(systemRow.settings);
  let contact: CrmContact | null = null;
  if (actor) {
    if (actor.role === "CUSTOMER") throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
    const id = str(input?.contactId);
    contact = id ? await prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, actor), { id }] } }) : null;
    if (!contact) throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
    if (!crmCan(actor, KEY_SEND)) throw fail("FORBIDDEN", crmForbiddenMessage(KEY_SEND));
  } else {
    contact = await prisma.crmContact.findFirst({ where: { id: str(input?.contactId), tenantId: ctx.tenantId, systemId: ctx.systemId } });
    if (!contact) throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
  }

  // AUDIT-CLASS X1: ดีล/บริษัทที่อ้างต้องเป็นของระบบนี้และมองเห็นได้
  const dealId = strOrNull(input?.dealId);
  if (dealId) {
    const found = actor
      ? await prisma.crmDeal.count({ where: { AND: [await dealWhere(ctx, actor), { id: dealId }] } })
      : await prisma.crmDeal.count({ where: { id: dealId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
    if (found === 0) throw fail("NOT_FOUND", "ไม่พบดีลนี้ในระบบ CRM นี้ หรือบัญชีนี้ยังมองไม่เห็นดีลนี้ — เลือกดีลใหม่แล้วลองอีกครั้ง");
  }
  const companyId = strOrNull(input?.companyId) ?? contact.companyId ?? null;
  if (strOrNull(input?.companyId)) {
    const found = actor
      ? await prisma.crmCompany.count({ where: { AND: [await companyWhere(ctx, actor), { id: companyId as string }] } })
      : await prisma.crmCompany.count({ where: { id: companyId as string, tenantId: ctx.tenantId, systemId: ctx.systemId } });
    if (found === 0) throw fail("NOT_FOUND", "ไม่พบบริษัทนี้ในระบบ CRM นี้ หรือบัญชีนี้ยังมองไม่เห็นบริษัทนี้ — เลือกบริษัทใหม่แล้วลองอีกครั้ง");
  }

  // ── ตรวจก่อนแตะอะไรทั้งนั้น (AUDIT-CLASS X6) ──
  const templateId = strOrNull(input?.templateId);
  const rendered = templateId ? await renderTemplate(ctx, templateId, contact, input?.vars) : null;
  const subject = cleanSubject(rendered ? rendered.subject : input?.subject);
  const rawBody = rendered ? rendered.bodyHtml : str(input?.bodyHtml);
  if (Buffer.byteLength(rawBody, "utf8") > CRM_EMAIL_BODY_MAX_BYTES) {
    throw fail("VALIDATION", `เนื้อความจดหมายยาวเกิน ${Math.round(CRM_EMAIL_BODY_MAX_BYTES / 1024)} KB — ย่อเนื้อความหรือส่งเป็นไฟล์แนบแทน`);
  }
  const storedHtml = sanitizeHtml(rawBody, { allowLinkSchemes: ["http", "https", "mailto", "tel"] });
  if (!storedHtml) throw fail("VALIDATION", "เนื้อความจดหมายยังว่างอยู่ (หรือเหลือแต่ส่วนที่ระบบตัดออกเพื่อความปลอดภัย) — พิมพ์เนื้อความแล้วส่งอีกครั้ง");
  const toList = cleanAddrList(input?.to ?? (contact.email ? [contact.email] : []), "รายชื่อผู้รับ");
  if (toList.length === 0) throw fail("VALIDATION", "ผู้ติดต่อรายนี้ยังไม่มีอีเมล — เพิ่มอีเมลในหน้าผู้ติดต่อก่อนส่งจดหมาย");
  const ccList = cleanAddrList(input?.cc, "รายชื่อสำเนา (Cc)");
  const bccList = cleanAddrList(input?.bcc, "รายชื่อสำเนาลับ (Bcc)");

  // ── ผู้รับหลักต้องเป็น "อีเมลของผู้ติดต่อรายนี้" เท่านั้น (AUDIT-CLASS X8) ──────────────────────────────
  // 🔴 ช่อง "ถึง" บนหน้าจอเป็นข้อความอิสระ: ใครก็พิมพ์ที่อยู่ของคนอื่นแล้วส่งจดหมายที่ระบบบันทึกว่า "ส่งถึง
  //    ลูกค้า A" ได้ ⇒ (1) ใช้ CRM ของร้านเป็นเครื่องส่งเมลถึงใครก็ได้ในนามร้าน (2) การตรวจความยินยอมทำกับ
  //    ลูกค้า A แต่จดหมายไปถึงคนอื่น (3) ลิงก์ "ยกเลิกรับอีเมล" ในจดหมายผูกกับลูกค้า A ⇒ คนที่ได้รับกดแล้ว
  //    ไปตัดสิทธิ์ของลูกค้า A แทนตัวเอง · ที่อยู่อื่นใส่ได้ในช่องสำเนา และเฉพาะคนที่ถือคีย์ตั้งค่าอีเมล
  const ownAddrs = new Set(uniq([bareEmail(contact.email), ...(contact.previousEmails ?? []).map((e) => bareEmail(e))]));
  const strayTo = toList.filter((a) => !ownAddrs.has(a));
  if (strayTo.length > 0) {
    throw fail(
      "VALIDATION",
      "ช่อง \"ถึง\" ต้องเป็นอีเมลของผู้ติดต่อรายนี้เท่านั้น — ถ้าต้องส่งให้คนอื่นด้วย ใส่ที่อยู่นั้นในช่องสำเนา (Cc) หรือแก้อีเมลในหน้าผู้ติดต่อก่อน",
    );
  }
  const strayCopies = [...ccList, ...bccList].filter((a) => !ownAddrs.has(a));
  if (strayCopies.length > 0 && actor && !crmCan(actor, KEY_SETTINGS)) {
    throw fail(
      "VALIDATION",
      "การส่งสำเนาไปที่อยู่นอกผู้ติดต่อรายนี้ทำได้เฉพาะบัญชีที่ได้รับสิทธิ์ตั้งค่าอีเมลของร้าน — เอาที่อยู่ในช่องสำเนาออก หรือขอให้เจ้าของร้านเปิดสิทธิ์ให้",
    );
  }
  const atts = checkOutgoingAttachments(input?.attachments);

  // ── ความยินยอม "ตอนส่ง" (AUDIT-CLASS X8) — ปฏิเสธแล้วไม่เขียน/ไม่อัป/ไม่ส่งอะไรเลย ──
  const replyToEmailId = strOrNull(input?.replyToEmailId);
  const { transactional, parent } = await isTransactionalReply(ctx.systemId, replyToEmailId);
  if (!(await canContact(contact, "EMAIL", { transactional }))) throw fail("EMAIL_BLOCKED", BLOCKED_MSG);

  const senderUserId = actor ? str(actor.userId) || null : strOrNull(input?.senderUserId);
  const routing = await routingFor({ ...ctx, actorUserId: senderUserId }, senderUserId, settings);
  const inboundKey = await inboundKeyOf(ctx, settings.inboundKey);
  const threadKey = parent?.threadKey ?? newThreadKey();
  const scheduledAt = parseWhen(input?.scheduledAt);
  const now = new Date();
  const queued = !!scheduledAt && scheduledAt.getTime() > now.getTime();

  // AUDIT-CLASS X4: กุญแจกันซ้ำของผู้เรียกกลายเป็น Message-ID (คอลัมน์ unique ทั้งระบบ) ⇒ ฐานเป็นคนตัดสิน
  const idem = strOrNull(input?.idempotencyKey);
  const rfcId = idem ? `ik-${sha256(`${ctx.systemId}:${idem}`).slice(0, 40)}@${CRM_EMAIL_SHARK_DOMAIN}` : newRfcId();
  const emailId = randomUUID().replace(/-/g, "");
  const messageId = scopedMessageId(ctx.systemId, rfcId);
  const references = parent ? uniq([...(parent.references ?? []), rfcIdOf(parent.messageId)]) : [];

  const stored = await storeAttachments(ctx.tenantId, atts.map((a) => ({ filename: a.filename, contentType: a.contentType, data: a.data })), deps);

  const trackOpens = settings.trackOpens === true && !contact.trackingOptOut && !contact.emailOptOut;
  const trackClicks = settings.trackClicks === true && !contact.trackingOptOut && !contact.emailOptOut;
  const composed = queued ? null : composeOutgoing({ emailId, storedHtml, trackOpens, trackClicks });

  const routingJson: RoutingJson = {
    via: routing.via,
    fromName: routing.fromName,
    fromAddr: routing.fromAddr,
    replyTo: routing.replyTo,
    copyTo: routing.copyTo,
    ...(composed ? { links: composed.links, unsub: composed.unsubHash } : {}),
  };

  let row: CrmEmailMessage;
  try {
    row = await prisma.crmEmailMessage.create({
      data: {
        id: emailId,
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        contactId: contact.id,
        companyId,
        dealId,
        direction: "OUT",
        messageId,
        inReplyTo: parent ? rfcIdOf(parent.messageId) : null,
        references,
        threadKey,
        fromAddr: routing.fromAddr,
        fromName: routing.fromName,
        toAddrs: toList,
        ccAddrs: ccList,
        bccAddrs: uniq([...bccList, ...routing.copyTo]),
        subject,
        bodyHtml: storedHtml,
        bodyText: htmlToText(storedHtml),
        snippet: emailSnippet(null, storedHtml),
        attachments: stored.length ? (stored as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        sentById: senderUserId,
        scheduledAt: scheduledAt ?? null,
        status: "QUEUED",
        // AUDIT-CLASS X7: ค่าย่อยที่ไม่มี token จริง (จดหมายตั้งเวลายังไม่มี token — สร้างตอนส่ง)
        trackTokenHash: composed ? composed.openHash : sha256(`crm.email.queued:${emailId}`),
        templateId,
        sequenceStepId: strOrNull(input?.sequenceStepId),
        routing: routingJson as unknown as Prisma.InputJsonValue,
        leaseUntil: queued ? null : new Date(now.getTime() + CRM_EMAIL_LEASE_MS),
      },
    });
  } catch (e) {
    // 🔴 แถวนี้แพ้การแข่ง (หรือเขียนไม่สำเร็จ) ⇒ ไฟล์ที่เพิ่งอัปขึ้นที่เก็บเมื่อครู่ไม่มีใครอ้างถึงอีกเลย
    //    ปล่อยไว้ = ไฟล์กำพร้าที่ยังเปิดได้ด้วยลิงก์ส่วนตัว และไม่มีวันถูกล้างโดยงานตามอายุการเก็บ
    //    (ล้างของตัวเองก่อนเสมอ ไม่ว่าจะจบด้วย "ใช้ใบเดิม" หรือโยน error ต่อ)
    for (const a of stored) {
      await deleteFileAsset({ tenantId: ctx.tenantId }, a.fileId, deps?.del ? { del: deps.del } : undefined).catch(() => null);
    }
    if (idem && isUniqueViolation(e)) {
      const prior = await prisma.crmEmailMessage.findFirst({ where: { messageId } });
      if (prior) {
        return { emailId: prior.id, messageId: prior.messageId, threadKey: prior.threadKey, status: statusOf(prior.status), reused: true };
      }
      throw fail("CONFLICT", "จดหมายฉบับนี้กำลังถูกส่งอยู่จากอีกหน้าจอ — รอสักครู่แล้วรีเฟรชหน้าเพื่อดูผล");
    }
    throw e;
  }

  await auditEmail(ctx, "crm.email.send", row.id, {
    after: { contactId: contact.id, dealId, companyId, templateId, scheduled: queued, attachments: stored.length, via: routing.via },
  });

  if (queued) {
    return { emailId: row.id, messageId: row.messageId, threadKey: row.threadKey, status: "QUEUED" };
  }

  const result = await deliver(ctx, row, {
    composed: composed as ComposeOut,
    routing,
    inboundKey,
    rfcId,
    references,
    parentRfc: parent ? rfcIdOf(parent.messageId) : null,
    attachments: atts,
    deps,
    now,
  });
  return { emailId: row.id, messageId: row.messageId, threadKey: row.threadKey, status: result };
}

const statusOf = (s: string): "SENT" | "QUEUED" | "FAILED" => (s === "QUEUED" ? "QUEUED" : s === "FAILED" ? "FAILED" : "SENT");

function parseWhen(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ยิงจดหมายออกจริง แล้วปิดงานในธุรกรรมเดียว (แถว SENT + กิจกรรม + event) */
async function deliver(
  ctx: EmailsCtx,
  row: CrmEmailMessage,
  args: {
    composed: ComposeOut;
    routing: CrmEmailRoutingView;
    inboundKey: string;
    rfcId: string;
    references: string[];
    parentRfc: string | null;
    attachments: SendAttachmentInput[];
    deps?: EmailDeps;
    now: Date;
  },
): Promise<"SENT" | "FAILED"> {
  const transport = await transportOf(args.deps);
  const headers: Record<string, string> = {
    "Message-ID": `<${args.rfcId}>`,
    "List-Unsubscribe": `<${appUrl()}/u/${args.composed.unsubToken}/one-click>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  if (args.parentRfc) headers["In-Reply-To"] = `<${args.parentRfc}>`;
  if (args.references.length) headers.References = args.references.map((r) => `<${r}>`).join(" ");

  let res: RichEmailResult;
  try {
    res = await transport({
      from: args.routing.fromAddr,
      ...(args.routing.fromName ? { fromName: args.routing.fromName } : {}),
      replyTo: replyToHeader(args.routing, args.inboundKey, row.threadKey),
      to: row.toAddrs,
      ...(row.ccAddrs.length ? { cc: row.ccAddrs } : {}),
      ...(row.bccAddrs.length ? { bcc: row.bccAddrs } : {}),
      subject: row.subject,
      html: args.composed.html,
      text: args.composed.text,
      headers,
      // AUDIT-CLASS X4/X5: กุญแจกันซ้ำ **ที่ฝั่งผู้ให้บริการ** (Resend `Idempotency-Key`) = `messageId` ของแถวนี้
      //   ⇒ เครื่องดับหลังผู้ให้บริการรับจดหมายไว้แล้วแต่ก่อนที่เราจะเขียน SENT · รอบ lease ถัดไปยิงซ้ำด้วยกุญแจเดิม
      //   ผู้ให้บริการคืนใบเดิม ไม่ส่งซ้ำถึงลูกค้า (ไม่มีกุญแจ = ลูกค้าได้จดหมายฉบับเดียวกันสองครั้ง)
      idempotencyKey: row.messageId,
      ...(args.attachments.length
        ? { attachments: args.attachments.map((a) => ({ filename: a.filename, content: a.data, contentType: a.contentType })) }
        : {}),
    });
  } catch {
    res = { ok: false, error: "TRANSPORT_ERROR" };
  }

  if (!res.ok) {
    // AUDIT-CLASS X8: เก็บเฉพาะรหัสความล้มเหลว — ไม่มีที่อยู่ผู้รับในคอลัมน์ที่ใครก็อ่านได้
    await prisma.crmEmailMessage.updateMany({ where: { id: row.id, status: "QUEUED" }, data: { status: "FAILED", providerError: str(res.error).slice(0, 200) || "SEND_FAILED", leaseUntil: null } });
    return "FAILED";
  }

  await prisma.$transaction(async (tx) => {
    const n = await tx.crmEmailMessage.updateMany({
      where: { id: row.id, status: "QUEUED" },
      data: {
        status: "SENT",
        providerId: strOrNull(res.providerId),
        sentAt: args.now,
        leaseUntil: null,
        trackTokenHash: args.composed.openHash,
        routing: {
          ...(isObj(row.routing) ? row.routing : {}),
          links: args.composed.links,
          unsub: args.composed.unsubHash,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    if (n.count !== 1) return;
    await activities.recordSystemActivityInTx(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId }, {
      type: "EMAIL",
      source: "EMAIL",
      direction: "OUT",
      sourceRef: row.id,
      title: row.subject.slice(0, 200),
      contactId: row.contactId,
      companyId: row.companyId,
      dealId: row.dealId,
      at: args.now,
    });
    await emitEmailEvent(tx, ctx, EVT.sent, row, `${row.id}`);
  });
  return "SENT";
}

/** AUDIT-CLASS X8: payload id ล้วน · key `crm.email.<type>#<emailId>#<seq>` (R-C.8) */
async function emitEmailEvent(
  tx: Tx,
  ctx: { tenantId: string; systemId: string },
  type: string,
  row: Pick<CrmEmailMessage, "id" | "contactId" | "dealId" | "companyId" | "threadKey" | "sequenceStepId">,
  seq: string,
): Promise<void> {
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    type,
    idempotencyKey: `${type}#${row.id}#${seq}`,
    payload: {
      emailId: row.id,
      ...(row.contactId ? { contactId: row.contactId } : {}),
      ...(row.dealId ? { dealId: row.dealId } : {}),
      ...(row.companyId ? { companyId: row.companyId } : {}),
      threadKey: row.threadKey,
      ...(row.sequenceStepId ? { sequenceStepId: row.sequenceStepId } : {}),
    },
  });
}

export async function sendEmail(ctx: EmailsCtx, actor: MemberActor, input: SendInput, deps?: EmailDeps): Promise<SendResult> {
  return sendCore(ctx, actor, input, deps);
}

/**
 * ทางเข้าของ "ระบบ" (ไม่มีคนกด): ขั้นอีเมลของลำดับการติดตาม (C2.2) และการกระทำ SEND_EMAIL ของกฎ (C2.1 · R-E.5)
 * กติกาความยินยอมเดียวกับการส่งแบบ marketing ทุกประการ
 */
export async function sendAsSystem(
  ctx: { tenantId: string; systemId: string },
  input: SendInput & { senderUserId?: string | null; sequenceStepId?: string | null },
  deps?: EmailDeps,
): Promise<SendResult> {
  return sendCore({ ...ctx, actorUserId: strOrNull(input?.senderUserId) }, null, input, deps);
}

export async function sendTest(ctx: EmailsCtx, actor: MemberActor, deps?: EmailDeps): Promise<{ ok: boolean }> {
  const { settings } = await enter(ctx, actor, KEY_SETTINGS);
  const user = await prisma.user.findFirst({ where: { id: str(actor.userId) }, select: { email: true, name: true } });
  const to = bareEmail(user?.email);
  if (!to) throw fail("VALIDATION", "บัญชีนี้ยังไม่มีอีเมลในระบบ จึงส่งจดหมายทดสอบไม่ได้ — เพิ่มอีเมลในหน้าโปรไฟล์ก่อน");
  const routing = await routingFor(ctx, str(actor.userId) || null, settings);
  const transport = await transportOf(deps);
  const res = await transport({
    from: routing.fromAddr,
    ...(routing.fromName ? { fromName: routing.fromName } : {}),
    replyTo: routing.replyTo,
    to: [to],
    subject: "ทดสอบการตั้งค่าอีเมลของ CRM",
    html: `<p>ถ้าคุณอ่านข้อความนี้ในกล่องจดหมาย แปลว่าการตั้งค่าผู้ส่งของร้านใช้งานได้แล้ว</p><p>ที่อยู่ผู้ส่ง: ${escapeHtmlText(routing.fromAddr)} · ที่อยู่รับคำตอบ: ${escapeHtmlText(routing.replyTo)}</p>`,
    text: "ถ้าคุณอ่านข้อความนี้ในกล่องจดหมาย แปลว่าการตั้งค่าผู้ส่งของร้านใช้งานได้แล้ว",
  });
  await auditEmail(ctx, "crm.email.test", undefined, { after: { via: routing.via, ok: res.ok } });
  return { ok: res.ok };
}

// ───────────────────────── runScheduled (AUDIT-CLASS X5) ─────────────────────────

/** ระบบ CRM ที่เปิด uiVersion 2 (R-E.14 — ระบบรุ่น 1 ไม่ถูกดึงเลย: ไม่จอง ไม่แตะ) */
async function v2SystemIds(tenantIds?: string[]): Promise<string[]> {
  const rows = await prisma.appSystem.findMany({
    where: { type: "CRM", ...(tenantIds ? { tenantId: { in: tenantIds } } : {}), settings: { path: ["crm", "uiVersion"], equals: 2 } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function runScheduled(now: Date, opts: RunScheduledOptions = {}): Promise<RunScheduledSummary> {
  const summary: RunScheduledSummary = { claimed: 0, sent: 0, blocked: 0, failed: 0, skipped: 0, cutOff: false };
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const tenantIds = Array.isArray(opts.tenantIds) ? opts.tenantIds.filter((t) => typeof t === "string" && t) : undefined;
  if (tenantIds && tenantIds.length === 0) return summary;
  const systems = await v2SystemIds(tenantIds);
  if (systems.length === 0) return summary;
  const stopNow = () => !!opts.signal?.aborted || (typeof opts.deadline === "number" && Date.now() > opts.deadline - 500);

  // ── AUDIT-CLASS X5: เก็บซากของ "ส่งทันที" ที่ตายกลางทาง ──────────────────────────────────────────────
  // จดหมายที่กดส่งทันทีถูกสร้างเป็น `QUEUED` + lease 15 นาที แต่ `scheduledAt` เป็น null ⇒ เงื่อนไข
  // `scheduledAt <= now` ของรอบตามเวลาไม่เคยหยิบมันขึ้นมาเลย · เครื่องดับ/โพรเซสถูกฆ่าระหว่าง `deliver`
  // = แถวนั้นค้าง QUEUED **ตลอดไป** (หน้าจอขึ้น "รอส่งตามเวลา" ทั้งที่ไม่มีใครจะส่ง และไม่มีใครรู้ว่าล้ม)
  // ⇒ หมด lease แล้วยังไม่มีสถานะปลายทาง = ปิดเป็น "ส่งไม่สำเร็จ" ให้คนเห็นและกดส่งใหม่ได้
  if (!stopNow()) {
    const stale = await prisma.crmEmailMessage.updateMany({
      where: { systemId: { in: systems }, direction: "OUT", status: "QUEUED", scheduledAt: null, leaseUntil: { lt: at } },
      data: { status: "FAILED", providerError: "ค้างกลางการส่ง (ตัวส่งหยุดทำงานก่อนได้คำตอบจากผู้ให้บริการ) — กดส่งจดหมายฉบับนี้ใหม่ได้เลย", leaseUntil: null },
    });
    summary.failed += stale.count;
  }

  for (let round = 0; round < 200; round += 1) {
    if (stopNow()) {
      summary.cutOff = true;
      break;
    }
    const due = await prisma.crmEmailMessage.findMany({
      where: {
        systemId: { in: systems },
        direction: "OUT",
        status: "QUEUED",
        scheduledAt: { lte: at },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: at } }],
      },
      orderBy: { scheduledAt: "asc" },
      take: 50,
      select: { id: true },
    });
    if (due.length === 0) break;
    let progressed = false;
    for (const d of due) {
      if (stopNow()) {
        summary.cutOff = true;
        break;
      }
      // AUDIT-CLASS X5: จองด้วย **คำสั่งเดียวแบบมีเงื่อนไข** · สถานะยังเป็น QUEUED (ไม่เคยจองด้วยสถานะปลายทาง)
      const claim = await prisma.crmEmailMessage.updateMany({
        where: { id: d.id, status: "QUEUED", OR: [{ leaseUntil: null }, { leaseUntil: { lte: at } }] },
        data: { leaseUntil: new Date(at.getTime() + CRM_EMAIL_LEASE_MS) },
      });
      if (claim.count !== 1) continue;
      progressed = true;
      summary.claimed += 1;
      const out = await sendClaimed(d.id, at, opts.deps);
      if (out === "SENT") summary.sent += 1;
      else if (out === "BLOCKED") summary.blocked += 1;
      else if (out === "SKIPPED") summary.skipped += 1;
      else summary.failed += 1;
    }
    if (!progressed) break;
  }
  return summary;
}

async function sendClaimed(emailId: string, at: Date, deps?: EmailDeps): Promise<"SENT" | "FAILED" | "BLOCKED" | "SKIPPED"> {
  const row = await prisma.crmEmailMessage.findFirst({ where: { id: emailId } });
  if (!row || row.status !== "QUEUED") return "SKIPPED";
  const ctx: EmailsCtx = { tenantId: row.tenantId, systemId: row.systemId, actorUserId: row.sentById };
  const contact = row.contactId ? await prisma.crmContact.findFirst({ where: { id: row.contactId, tenantId: row.tenantId } }) : null;
  if (!contact) {
    await prisma.crmEmailMessage.updateMany({ where: { id: row.id, status: "QUEUED" }, data: { status: "FAILED", providerError: "CONTACT_GONE", leaseUntil: null } });
    return "FAILED";
  }
  // AUDIT-CLASS X8: ความยินยอมถูกถามอีกครั้ง **ตอนส่ง** (ลูกค้าอาจกดเลิกรับหลังตั้งเวลาไว้)
  //   R-E.11: ยังถือเป็น "ตอบในเธรดที่ลูกค้าเริ่ม" ได้ถ้าจดหมายนี้ตอบในเธรดที่มีข้อความขาเข้าอยู่แล้ว
  const inboundInThread = row.inReplyTo
    ? await prisma.crmEmailMessage.count({ where: { systemId: row.systemId, threadKey: row.threadKey, direction: "IN" } })
    : 0;
  if (!(await canContact(contact, "EMAIL", { transactional: inboundInThread > 0 }))) {
    await prisma.crmEmailMessage.updateMany({ where: { id: row.id, status: "QUEUED" }, data: { status: "FAILED", providerError: "EMAIL_BLOCKED", leaseUntil: null } });
    return "BLOCKED";
  }
  const settings = await settingsOfSystem(row.systemId);
  if (!settings) return "SKIPPED";
  const routing = await routingFor(ctx, row.sentById, settings);
  const inboundKey = await inboundKeyOf(ctx, settings.inboundKey);
  const trackOpens = settings.trackOpens === true && !contact.trackingOptOut && !contact.emailOptOut;
  const trackClicks = settings.trackClicks === true && !contact.trackingOptOut && !contact.emailOptOut;
  const composed = composeOutgoing({ emailId: row.id, storedHtml: str(row.bodyHtml), trackOpens, trackClicks });
  const out = await deliver(ctx, row, {
    composed,
    routing,
    inboundKey,
    rfcId: rfcIdOf(row.messageId),
    references: row.references ?? [],
    parentRfc: strOrNull(row.inReplyTo),
    attachments: [],
    deps,
    now: at,
  });
  return out;
}

// ───────────────────────── จดหมายขาเข้า ─────────────────────────

async function contactByAddress(systemId: string, addr: string): Promise<CrmContact | null> {
  if (!addr) return null;
  const direct = await prisma.crmContact.findFirst({
    where: { systemId, mergedIntoId: null, archivedAt: null, email: { equals: addr, mode: "insensitive" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (direct) return direct;
  // R-A: `previousEmails` (ผู้ติดต่อเปลี่ยนอีเมล — จดหมายจากที่อยู่เดิมยังต้องเข้าเธรดของคนเดิม)
  return prisma.crmContact.findFirst({
    where: { systemId, mergedIntoId: null, archivedAt: null, previousEmails: { hasSome: uniq([addr, addr.toLowerCase()]) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

function decodeBase64(v: unknown): Uint8Array | null {
  const s = typeof v === "string" ? v.replace(/\s+/g, "") : "";
  if (!s) return null;
  try {
    const buf = Buffer.from(s, "base64");
    return buf.length > 0 ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

type InboundFile = { filename: string; contentType: string; data: Uint8Array };
type InboundPick = { inline: InboundFile[]; links: { filename: string; contentType: string; url: string }[]; dropped: number };

const mimeAllowed = (mime: string) =>
  CRM_EMAIL_ATTACH_MIME_ALLOWLIST.includes(mime) && !!ALLOWED_UPLOAD_TYPES[mime as keyof typeof ALLOWED_UPLOAD_TYPES];
const cleanAttachName = (v: unknown) => str(v).replace(/[\u0000-\u001f\u007f/\\]+/g, "").slice(0, 200) || "ไฟล์แนบ";

/**
 * ไฟล์แนบขาเข้าที่ผ่านด่านชั้นแรก (ชนิด/ขนาด/จำนวน) แยกเป็น "เนื้อไฟล์มาแล้ว" กับ "มาเป็นลิงก์"
 * 🔴 ของที่ตกด่านไม่หายเงียบ ๆ อีกต่อไป: นับไว้ใน `dropped` แล้วบันทึกเป็น `routing.attachmentsDropped` ของจดหมาย
 *    ⇒ พนักงานที่เปิดจดหมายรู้ว่า "มีไฟล์ที่ระบบไม่รับ" แล้วขอไฟล์จากลูกค้าใหม่ได้ (AUDIT-CLASS X8: เก็บแต่
 *    จำนวน — ไม่มีชื่อไฟล์ ไม่มี URL ไม่มีที่อยู่ใครอยู่ในค่านั้น)
 */
function pickInboundAttachments(list: CrmInboundAttachment[] | undefined): InboundPick {
  const out: InboundPick = { inline: [], links: [], dropped: 0 };
  for (const a of Array.isArray(list) ? list : []) {
    if (out.inline.length + out.links.length >= CRM_EMAIL_ATTACH_MAX_COUNT) {
      out.dropped += 1;
      continue;
    }
    const mime = normalizeUploadType(a?.contentType ?? a?.content_type);
    const name = cleanAttachName(a?.filename);
    const data = decodeBase64(a?.content);
    if (data) {
      if (!mimeAllowed(mime) || data.length > CRM_EMAIL_ATTACH_MAX_BYTES) out.dropped += 1;
      else out.inline.push({ filename: name, contentType: mime, data });
      continue;
    }
    const url = str(a?.url);
    if (!url) {
      out.dropped += 1;
      continue;
    }
    // ชนิดถูกตรวจอีกครั้งหลังดึงไฟล์เสร็จ (ผู้ให้บริการไม่จำเป็นต้องบอกชนิดมากับลิงก์)
    if (typeof a?.size === "number" && a.size > CRM_EMAIL_ATTACH_MAX_BYTES) out.dropped += 1;
    else out.links.push({ filename: name, contentType: mime, url });
  }
  return out;
}

/** เพดานเวลารอไฟล์แนบจากลิงก์ของผู้ให้บริการ */
const ATTACH_FETCH_TIMEOUT_MS = 10_000;

/**
 * ดึงไฟล์แนบที่ผู้ให้บริการส่งมาเป็น "ลิงก์" — ผ่าน **ด่านกัน SSRF ตัวเดียวของระบบ** (`webhookTargetProblem`)
 * 🔴 URL นี้มาจากคนนอกทั้งดุ้น: ถ้า fetch ตรง ๆ ใครก็ส่งจดหมายที่ไฟล์แนบชี้ไป `http://169.254.169.254/…`
 *    (metadata ของคลาวด์) หรือ `http://127.0.0.1:5432/` แล้วให้เซิร์ฟเวอร์ของเราไปดึงของในเครือข่ายภายใน
 *    มาเก็บเป็นไฟล์แนบให้เขาเปิดอ่านทีหลัง
 * 🔴 `redirect: "manual"` — ปลายทางที่ผ่านด่านแล้วตอบ 302 ไปที่อยู่ภายในได้ ถ้าตามต่อเองก็เท่ากับไม่มีด่าน
 * 🔴 ดึงไม่ได้/ผิดชนิด/ใหญ่เกิน = คืน null แล้วผู้เรียกนับเป็น `attachmentsDropped` — จดหมายทั้งฉบับยังต้องเข้าระบบ
 */
async function fetchLinkedAttachment(
  item: { filename: string; contentType: string; url: string },
  deps?: EmailDeps,
): Promise<InboundFile | null> {
  try {
    const { webhookTargetProblem } = await import("@/lib/webhooks/service");
    if (await webhookTargetProblem(item.url)) return null;
    const doFetch = deps?.fetch ?? fetch;
    const res = await doFetch(item.url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(ATTACH_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > CRM_EMAIL_ATTACH_MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > CRM_EMAIL_ATTACH_MAX_BYTES) return null;
    const mime = normalizeUploadType(item.contentType || res.headers.get("content-type") || "");
    if (!mimeAllowed(mime)) return null;
    return { filename: item.filename, contentType: mime, data: new Uint8Array(buf) };
  } catch {
    return null;
  }
}

function lowerHeaders(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(h)) return out;
  for (const [k, v] of Object.entries(h)) out[String(k).trim().toLowerCase()] = String(v ?? "");
  return out;
}

const bareId = (v: unknown) => str(v).replace(/^<|>$/g, "");

/**
 * หัว `Authentication-Results` (RFC 8601) ของ MTA บอกว่า **โดเมนนี้** ผ่าน DKIM หรือ SPF ไหม — แกะแบบระวัง
 * 🔴 ตีความแบบเข้มที่สุดเท่าที่ทำได้: ตัดเป็นข้อ ๆ ด้วย `;` แล้วนับเฉพาะข้อที่ประกาศ `dkim=pass` / `spf=pass`
 *    **และ** ในข้อเดียวกันมีโดเมนกำกับ (`header.d=` · `header.i=@` · `smtp.mailfrom=`) ที่ตรงกับโดเมนของ From
 *    (หรือเป็นโดเมนแม่ของมัน) · หัวที่บอกแค่ "pass" ลอย ๆ โดยไม่กำกับโดเมน = ไม่นับ (ปลอมง่ายและพิสูจน์ไม่ได้)
 * 🔴 ไม่รับ `ARC-Authentication-Results` (ผลของ MTA ต้นทางที่เราไม่ได้เชื่อ) และไม่รับแค่การมี `DKIM-Signature`
 *    (ลายเซ็นที่ยังไม่ได้ตรวจ ≠ ลายเซ็นที่ผ่าน)
 */
function authResultPass(headers: Record<string, string>, fromDomain: string): boolean {
  const domain = str(fromDomain).toLowerCase();
  if (!domain || !domain.includes(".")) return false;
  const raw = [headers["authentication-results"], headers["x-authentication-results"]].filter((v) => typeof v === "string" && v).join(";");
  if (!raw) return false;
  for (const part of raw.toLowerCase().split(";")) {
    const clause = part.trim();
    if (!/\b(?:dkim|spf)\s*=\s*pass\b/.test(clause)) continue;
    for (const m of clause.matchAll(/(?:header\.d|header\.i|smtp\.mailfrom)\s*=\s*"?@?([a-z0-9][a-z0-9.-]*)"?/g)) {
      const d = (m[1] ?? "").replace(/^.*@/, "").replace(/\.$/, "");
      if (!d.includes(".")) continue;
      if (d === domain || domain.endsWith(`.${d}`)) return true;
    }
  }
  return false;
}

function refIdsOf(headers: Record<string, string>): string[] {
  const raw = `${headers["in-reply-to"] ?? ""} ${headers.references ?? ""}`;
  return uniq([...raw.matchAll(/<([^>]+)>/g)].map((m) => (m[1] ?? "").trim()));
}

/**
 * จดหมายขาเข้า 1 ฉบับที่ `crm+<key>@shark.in.th` — **ไม่เคย throw** (route ตอบ 200 เสมอหลังผ่านด่าน)
 * AUDIT-CLASS X4: หนึ่งแถวต่อ (ระบบ, RFC Message-ID) · ฐานเป็นคนตัดสินด้วยคอลัมน์ unique ⇒ ส่งซ้ำ/
 *   ยิงพร้อมกัน 10 ครั้ง ได้แถวเดียว กิจกรรมเดียว event เดียว และไฟล์แนบขึ้นที่เก็บครั้งเดียว
 */
export async function ingestInbound(payload: CrmInboundPayload, deps?: EmailDeps): Promise<IngestInboundResult> {
  // นับไว้นอก try เพื่อให้คำตอบของฟังก์ชันถือค่านี้ได้เสมอ (มติผู้คุมงาน (a) · ข้อสอบ S10.9)
  let dropped = 0;
  try {
    const rfcId = bareId(payload?.messageId);
    const toAll = uniq([...(Array.isArray(payload?.to) ? payload.to : []), ...(Array.isArray(payload?.cc) ? payload.cc : [])].map((x) => bareEmail(x)));
    if (!rfcId || toAll.length === 0) return { ok: false, handled: false, reason: "invalid", attachmentsDropped: 0 };
    let hit: { key: string; threadShort: string | null } | null = null;
    for (const addr of toAll) {
      const parsed = parseCrmRecipient(addr);
      if (parsed) {
        hit = parsed;
        break;
      }
    }
    if (!hit) return { ok: true, handled: false, reason: "not_crm", attachmentsDropped: 0 };

    const system = await prisma.appSystem.findFirst({
      where: { type: "CRM", settings: { path: ["crm", "email", "inboundKey"], equals: hit.key } },
      select: { id: true, tenantId: true, settings: true },
    });
    if (!system) return { ok: true, handled: false, reason: "unknown_key", attachmentsDropped: 0 };
    const settings = crmEmailSettingsOf(system.settings);
    const crm = isObj(system.settings) && isObj(system.settings.crm) ? system.settings.crm : {};
    // R-E.14 + มติผู้คุมงาน ข้อ 6: ระบบ uiVersion 1 ⇒ ไม่เก็บอะไรเลย
    if (crm.uiVersion !== 2) return { ok: true, handled: false, reason: "v1", attachmentsDropped: 0 };
    if (settings.inboundEnabled !== true) return { ok: true, handled: false, reason: "disabled", attachmentsDropped: 0 };

    const ctx = { tenantId: system.tenantId, systemId: system.id };
    const storedMessageId = scopedMessageId(system.id, rfcId);
    const prior = await prisma.crmEmailMessage.findFirst({ where: { messageId: storedMessageId }, select: { id: true } });
    if (prior) return { ok: true, handled: true, emailId: prior.id, reason: "duplicate", attachmentsDropped: 0 };

    const headers = lowerHeaders(payload?.headers);
    const fromAddr = bareEmail(payload?.from);
    const replyToAddr = bareEmail(headers["reply-to"]);
    const auto = isAutoSubmitted(headers, str(payload?.from));
    const subject = str(payload?.subject).slice(0, CRM_EMAIL_SUBJECT_MAX) || "(ไม่มีหัวข้อ)";
    // AUDIT-CLASS X6: HTML ของคนนอกร้านผ่านตัวตัดกลางก่อน "เก็บ" (รูปเก็บไว้ให้กด "แสดงรูป" เองทีหลัง)
    const storedHtml = sanitizeHtml(str(payload?.html), { allowImages: true, allowLinkSchemes: ["http", "https", "mailto", "tel"] });
    const bodyText = str(payload?.text) || htmlToText(str(payload?.html));

    // ── ทิศทาง: From เป็นพนักงานของร้านนี้ ⇒ เก็บเป็นขาออก (สำเนา BCC ของจดหมายที่พนักงานส่งจากกล่องตัวเอง) ──
    const staff = fromAddr
      ? await prisma.membership.findFirst({
          where: { tenantId: system.tenantId, acceptedAt: { not: null }, user: { email: { equals: fromAddr, mode: "insensitive" } } },
          select: { userId: true },
        })
      : null;
    const staffByOverride = staff
      ? null
      : fromAddr
        ? await prisma.crmEmailUserSetting.findFirst({ where: { systemId: system.id, fromAddr: { equals: fromAddr, mode: "insensitive" } }, select: { userId: true } })
        : null;
    // 🔴 ก่อนจะ "เชื่อ" ว่าจดหมายฉบับนี้พนักงานส่งเอง ต้องมีหลักฐานว่า From ไม่ได้ถูกปลอม: ใครก็ยิง JSON เข้ามาที่
    //    เส้นขาเข้าโดยจ่า `From:` เป็นอีเมลพนักงานได้ ⇒ จดหมายจะถูกเก็บเป็น **ขาออกของร้าน** (direction OUT ·
    //    sentById = พนักงานคนนั้น) แล้วโผล่ในไทม์ไลน์ของลูกค้าเหมือนพนักงานเขียนเอง (ปล่อยข้อความปลอมในนามร้าน)
    //    หลักฐานที่รับ: `authentication-results` ของ MTA บอก dkim=pass / spf=pass ให้โดเมนของ From
    //    หรือโดเมนของ From เป็นโดเมนผู้ส่งที่ร้านนี้ยืนยันแล้ว (`EmailDomain.status = VERIFIED`)
    //    ไม่ผ่าน = ปฏิบัติกับมันเหมือนจดหมายขาเข้าธรรมดา (กติกาคนแปลกหน้า) — AUDIT-CLASS X1 · X6
    const staffClaim = staff?.userId ?? staffByOverride?.userId ?? null;
    let fromAuthenticated = false;
    if (staffClaim) {
      fromAuthenticated =
        authResultPass(headers, emailDomainOf(fromAddr)) || (await verifiedDomains(system.tenantId)).has(emailDomainOf(fromAddr));
    }
    const sentById = fromAuthenticated ? staffClaim : null;
    const direction: "IN" | "OUT" = sentById ? "OUT" : "IN";
    if (direction === "OUT" && settings.bccCaptureEnabled !== true) return { ok: true, handled: false, reason: "bcc_capture_off", attachmentsDropped: 0 };

    let contact: CrmContact | null = null;
    let companyId: string | null = null;
    let matchedBy: "EMAIL" | "DOMAIN" | "NONE" = "NONE";

    if (direction === "OUT") {
      for (const addr of toAll) {
        if (parseCrmRecipient(addr)) continue;
        const c = await contactByAddress(system.id, addr);
        if (c) {
          contact = c;
          matchedBy = "EMAIL";
          break;
        }
      }
    } else {
      contact = (await contactByAddress(system.id, fromAddr)) ?? (replyToAddr ? await contactByAddress(system.id, replyToAddr) : null);
      if (contact) matchedBy = "EMAIL";
      if (!contact) {
        const domain = emailDomainOf(fromAddr);
        const company = domain
          ? await prisma.crmCompany.findFirst({ where: { systemId: system.id, mergedIntoId: null, archivedAt: null, emailDomain: { equals: domain, mode: "insensitive" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
          : null;
        if (company) {
          companyId = company.id;
          matchedBy = "DOMAIN";
        } else if (settings.strangerToLead === true && !auto && isEmailAddr(fromAddr)) {
          // คนแปลกหน้า ⇒ lead ใหม่ 1 ราย (ทางเดียวกับสะพานฟอร์ม/แชท · กันซ้ำด้วย advisory lock ในนั้น)
          const lead = await contacts
            .leadFromBridge({ tenantId: system.tenantId, systemId: system.id, actorUserId: null }, {
              kind: "EMAIL",
              name: displayNameOf(payload?.from) || null,
              email: fromAddr,
              sourceDetail: { channel: "EMAIL" },
              locale: localeHintOf(headers),
            })
            .catch(() => null);
          if (lead?.contactId) {
            contact = await prisma.crmContact.findFirst({ where: { id: lead.contactId } });
            if (contact) matchedBy = "EMAIL";
          }
        }
      }
    }
    if (contact) companyId = companyId ?? contact.companyId ?? null;

    // ── ต่อเธรด 3 ชั้น (AUDIT-CLASS X1: เธรดของร้าน/ระบบอื่นไม่มีทางถูกต่อ) ──
    const refs = refIdsOf(headers);
    let parent: CrmEmailMessage | null = null;
    if (refs.length) {
      // ไคลเอนต์อีเมลส่งคืนค่าที่อยู่ในหัว `Message-ID` ของเรา ซึ่งอาจเป็นรูป RFC ล้วนหรือรูปที่ผูกระบบแล้ว
      // ⇒ รับทั้งสองรูป แต่ยังกรอง `systemId` เสมอ (AUDIT-CLASS X1: เธรดของระบบอื่นไม่มีทางถูกต่อ)
      const candidates = uniq([...refs, ...refs.map((r) => scopedMessageId(system.id, r))]);
      parent = await prisma.crmEmailMessage.findFirst({
        where: { systemId: system.id, messageId: { in: candidates } },
        orderBy: { createdAt: "desc" },
      });
    }
    let threadKey = parent?.threadKey ?? null;
    // ชั้นที่ 2: แท็ก `+t<short>` ของที่อยู่ที่ลูกค้าตอบมา — เทียบ **เท่ากัน** กับรหัสย่อที่คำนวณจาก threadKey
    //   ของแถวในระบบนี้ (ไม่ใช่ `startsWith` ของค่าที่คนนอกส่งมา: `+ta` เคยพาคนแปลกหน้าเข้าเธรดล่าสุดที่ขึ้นต้น
    //   ด้วย "a" ของลูกค้ารายอื่น — AUDIT-CLASS X1) · ความยาวถูกบังคับไว้แล้วที่ `parseCrmRecipient`
    if (!threadKey && hit.threadShort && hit.threadShort.length === CRM_THREAD_SHORT_LEN) {
      const byShort = await prisma.$queryRaw<{ threadKey: string }[]>`
        SELECT "threadKey" FROM "CrmEmailMessage"
         WHERE "systemId" = ${system.id}
           AND left("threadKey", ${CRM_THREAD_SHORT_LEN}::int) = ${hit.threadShort}
         ORDER BY "createdAt" DESC LIMIT 1`;
      threadKey = byShort[0]?.threadKey ?? null;
    }
    if (!threadKey && contact) {
      const norm = normalizeSubject(subject);
      if (norm) {
        const recent = await prisma.crmEmailMessage.findMany({
          where: { systemId: system.id, contactId: contact.id, createdAt: { gte: new Date(Date.now() - SUBJECT_THREAD_WINDOW_MS) } },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { threadKey: true, subject: true },
        });
        threadKey = recent.find((r) => normalizeSubject(r.subject) === norm)?.threadKey ?? null;
      }
    }
    if (!threadKey) threadKey = newThreadKey();

    const at = new Date();
    let created: { id: string } | null = null;
    try {
      created = await prisma.$transaction(async (tx) => {
        const row = await tx.crmEmailMessage.create({
          data: {
            tenantId: system.tenantId,
            systemId: system.id,
            contactId: contact?.id ?? null,
            companyId,
            direction,
            messageId: storedMessageId,
            inReplyTo: bareId(headers["in-reply-to"]) || null,
            references: refs,
            threadKey: threadKey as string,
            fromAddr,
            fromName: displayNameOf(payload?.from) || null,
            toAddrs: uniq((Array.isArray(payload?.to) ? payload.to : []).map((x) => bareEmail(x))),
            ccAddrs: uniq((Array.isArray(payload?.cc) ? payload.cc : []).map((x) => bareEmail(x))),
            subject,
            bodyHtml: storedHtml || null,
            bodyText: bodyText || null,
            snippet: emailSnippet(bodyText, storedHtml),
            sentById,
            ...(direction === "OUT" ? { sentAt: at, status: "SENT" as const } : { receivedAt: at, status: "RECEIVED" as const }),
            matchedBy,
            trackTokenHash: sha256(`crm.email.in:${storedMessageId}`),
          },
        });
        if (contact) {
          await activities.recordSystemActivityInTx(tx, ctx, {
            type: "EMAIL",
            source: "EMAIL",
            direction,
            sourceRef: row.id,
            title: subject.slice(0, 200),
            contactId: contact.id,
            companyId,
            dealId: null,
            at,
          });
        }
        await emitEmailEvent(tx, ctx, EVT.received, row, `${row.id}`);
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        const again = await prisma.crmEmailMessage.findFirst({ where: { messageId: storedMessageId }, select: { id: true } });
        return { ok: true, handled: true, emailId: again?.id, reason: "duplicate", attachmentsDropped: 0 };
      }
      throw e;
    }
    if (!created) return { ok: false, handled: false, reason: "not_stored", attachmentsDropped: 0 };

    // ── ไฟล์แนบ (หลังชนะการกันซ้ำ ⇒ ขึ้นที่เก็บครั้งเดียวต่อจดหมาย · AUDIT-CLASS X10) ──
    //   ของที่มาเป็น "ลิงก์" ถูกดึงผ่านด่านกัน SSRF แล้วเก็บแบบส่วนตัวเหมือนกัน · ของที่ตกด่านถูก **นับ** ไว้
    //   (`routing.attachmentsDropped`) แทนที่จะหายเงียบ ๆ
    const picked = pickInboundAttachments(payload?.attachments);
    dropped = picked.dropped;
    const files: InboundFile[] = [...picked.inline];
    for (const link of picked.links) {
      const got = await fetchLinkedAttachment(link, deps);
      if (got) files.push(got);
      else dropped += 1;
    }
    if (files.length || dropped > 0) {
      const stored = files.length ? await storeAttachments(system.tenantId, files, deps) : [];
      dropped += files.length - stored.length;
      const data: Prisma.CrmEmailMessageUpdateInput = {};
      if (stored.length) data.attachments = stored as unknown as Prisma.InputJsonValue;
      if (dropped > 0) data.routing = { attachmentsDropped: dropped } as unknown as Prisma.InputJsonValue;
      if (Object.keys(data).length) await prisma.crmEmailMessage.update({ where: { id: created.id }, data });
    }

    // ── การตอบกลับจริง (ไม่ใช่เครื่องตอบ) ⇒ repliedAt + event + หยุดลำดับการติดตาม ──
    if (direction === "IN" && parent && parent.direction === "OUT" && !auto) {
      // AUDIT-CLASS X4: ธง `repliedAt` กับ event อยู่ในธุรกรรมเดียว และ event ออกเฉพาะรอบที่ธงถูกพลิกจริง
      //   (สองฉบับตอบเธรดเดียวกันพร้อมกัน ⇒ ธงพลิกครั้งเดียว ⇒ `crm.email.replied` ใบเดียว)
      const parentRow = parent;
      const flipped = await prisma.$transaction(async (tx) => {
        const n = await tx.crmEmailMessage.updateMany({ where: { id: parentRow.id, repliedAt: null }, data: { repliedAt: at } });
        if (n.count !== 1) return false;
        await emitEmailEvent(tx, ctx, EVT.replied, parentRow, `reply-${created.id}`);
        return true;
      });
      if (flipped && contact) await stopSequencesFor(ctx, contact.id, "REPLY");
    }

    // ── สำเนาขาเข้า (copyMode IN/BOTH) ──
    const copyIn = settings.copyMode === "IN" || settings.copyMode === "BOTH" ? bareEmail(settings.copyToAddr) : "";
    if (copyIn) {
      const transport = await transportOf(deps);
      await transport({
        to: [copyIn],
        subject: `[สำเนาจดหมายเข้า] ${subject}`.slice(0, CRM_EMAIL_SUBJECT_MAX),
        html: storedHtml || `<p>${escapeHtmlText(bodyText)}</p>`,
        text: bodyText,
      }).catch(() => ({ ok: false }));
    }

    return { ok: true, handled: true, emailId: created.id, attachmentsDropped: dropped };
  } catch (e) {
    // ไม่เคย throw — จดหมายขยะฉบับเดียวห้ามทำให้สายอีเมลของทั้งระบบล่ม
    // AUDIT-CLASS X8: บันทึก **ชนิด** ของ error เท่านั้น — ข้อความ error ของ Prisma สะท้อนค่าที่ส่งเข้าไป
    //   (หัวเรื่อง/เนื้อความ/ที่อยู่) ได้ และ OpsEvent อ่านได้ข้ามร้าน
    await logOps("WARN", "crm.email.inbound", "เก็บจดหมายขาเข้าของ CRM ไม่สำเร็จ", {
      detail: (e instanceof Error ? e.name : "Error").slice(0, 80),
    }).catch(() => {});
    return { ok: false, handled: false, reason: "error", attachmentsDropped: 0 };
  }
}

function localeHintOf(headers: Record<string, string>): string | null {
  const raw = str(headers["content-language"]) || str(headers["accept-language"]);
  const first = raw.split(",")[0]?.trim().slice(0, 5) ?? "";
  return /^[a-z]{2}(-[A-Za-z]{2})?$/i.test(first) ? first.slice(0, 2).toLowerCase() : null;
}

/** R-A: C2.2 เป็นเจ้าของ `stopFor` — ที่นี่ **เรียก** อย่างเดียว (import ตอนใช้ กันวงจร import) */
async function stopSequencesFor(ctx: { tenantId: string; systemId: string }, contactId: string, reason: "REPLY" | "BOUNCE" | "OPT_OUT"): Promise<void> {
  try {
    const seq = await import("./sequences");
    await seq.stopFor(ctx, contactId, reason);
  } catch (e) {
    await logOps("WARN", "crm.email.sequence", "หยุดลำดับการติดตามหลังเหตุการณ์อีเมลไม่สำเร็จ", {
      tenantId: ctx.tenantId,
      detail: (e instanceof Error ? e.name : "Error").slice(0, 80),
    }).catch(() => {});
  }
}

// ───────────────────────── อ่านเธรด · ไฟล์แนบ · ผูกเข้าผู้ติดต่อ ─────────────────────────

/** สิทธิ์เปิดกล่อง "ยังไม่จับคู่" — ต้องมีคีย์อ่าน **และ** เห็นผู้ติดต่อทั้งระบบ (หรือเป็นผู้จัดการ/เจ้าของร้าน) */
async function assertUnmatchedGate(ctx: EmailsCtx, actor: MemberActor): Promise<void> {
  if (actor.role === "OWNER" || actor.role === "MANAGER") return;
  const level = await resolveVisibility(ctx, actor, "CONTACT");
  if (level !== "ALL") {
    throw fail("FORBIDDEN", "กล่อง \"ยังไม่จับคู่\" เปิดได้เฉพาะบัญชีที่เห็นผู้ติดต่อทั้งระบบหรือระดับผู้จัดการขึ้นไป — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ก่อน");
  }
}

/**
 * ขอบเขตของหน้ารายการ — กติกาเดียวกับ `rowVisibleFilter` ของ `getThread` (แถวที่ผูกผู้ติดต่อตัดสินด้วยผู้ติดต่อ ·
 * แถวที่ไม่ผูกผู้ติดต่อแต่ผูกบริษัทตัดสินด้วยบริษัท) ⇒ เธรดที่รายการไม่โชว์ ก็เปิดตรง ๆ ไม่ได้ และตัวนับจำนวน
 * ฉบับในรายการนับเฉพาะฉบับที่บัญชีนี้มองเห็น
 */
async function visibleThreadWhere(ctx: EmailsCtx, actor: MemberActor): Promise<Prisma.CrmEmailMessageWhereInput> {
  const cWhere = await contactWhere(ctx, actor);
  const coWhere = await companyWhere(ctx, actor);
  const [cIds, coIds] = await Promise.all([
    prisma.crmContact.findMany({ where: cWhere, select: { id: true }, take: 20_000 }),
    prisma.crmCompany.findMany({ where: coWhere, select: { id: true }, take: 20_000 }),
  ]);
  return {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    OR: [{ contactId: { in: cIds.map((c) => c.id) } }, { AND: [{ contactId: null }, { companyId: { in: coIds.map((c) => c.id) } }] }],
  };
}

export async function listThreads(
  ctx: EmailsCtx,
  actor: MemberActor,
  input: { contactId?: string | null; companyId?: string | null; dealId?: string | null; unmatched?: boolean; q?: string | null; page?: number } = {},
): Promise<{ items: ThreadListItem[]; total: number }> {
  await enter(ctx, actor, KEY_READ);
  const unmatched = input?.unmatched === true;
  if (unmatched) await assertUnmatchedGate(ctx, actor);
  const scope: Prisma.CrmEmailMessageWhereInput = unmatched
    ? { tenantId: ctx.tenantId, systemId: ctx.systemId, contactId: null, companyId: null }
    : await visibleThreadWhere(ctx, actor);
  const extra: Prisma.CrmEmailMessageWhereInput[] = [];
  if (str(input?.contactId)) extra.push({ contactId: str(input.contactId) });
  if (str(input?.companyId)) extra.push({ companyId: str(input.companyId) });
  if (str(input?.dealId)) extra.push({ dealId: str(input.dealId) });
  if (str(input?.q)) extra.push({ subject: { contains: str(input.q), mode: "insensitive" } });
  const rows = await prisma.crmEmailMessage.findMany({
    where: extra.length ? { AND: [scope, ...extra] } : scope,
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true, threadKey: true, subject: true, contactId: true, companyId: true, dealId: true, matchedBy: true,
      direction: true, snippet: true, sentAt: true, receivedAt: true, createdAt: true,
    },
  });
  const byThread = new Map<string, ThreadListItem & { _at: number }>();
  for (const r of rows) {
    const at = (r.sentAt ?? r.receivedAt ?? r.createdAt).getTime();
    const cur = byThread.get(r.threadKey);
    if (!cur) {
      byThread.set(r.threadKey, {
        threadKey: r.threadKey,
        subject: r.subject,
        lastAt: new Date(at).toISOString(),
        count: 1,
        contactId: r.contactId,
        companyId: r.companyId,
        dealId: r.dealId,
        matchedBy: r.matchedBy,
        direction: r.direction,
        snippet: r.snippet,
        unread: r.direction === "IN",
        _at: at,
      });
      continue;
    }
    cur.count += 1;
    if (at > cur._at) {
      cur._at = at;
      cur.lastAt = new Date(at).toISOString();
      cur.subject = r.subject;
      cur.direction = r.direction;
      cur.snippet = r.snippet;
      cur.unread = r.direction === "IN";
    }
    cur.contactId = cur.contactId ?? r.contactId;
    cur.companyId = cur.companyId ?? r.companyId;
  }
  const all = [...byThread.values()].sort((a, b) => b._at - a._at);
  const page = Math.max(1, Math.floor(Number(input?.page ?? 1)) || 1);
  const size = 50;
  const items = all.slice((page - 1) * size, page * size).map(({ _at, ...rest }) => {
    void _at;
    return rest;
  });
  return { items, total: all.length };
}

function attachmentsOf(row: { attachments: Json }): CrmEmailAttachmentRef[] {
  const raw = Array.isArray(row.attachments) ? row.attachments : [];
  const out: CrmEmailAttachmentRef[] = [];
  for (const a of raw) {
    if (!isObj(a) || typeof a.fileId !== "string") continue;
    out.push({ fileId: a.fileId, name: String(a.name ?? "ไฟล์แนบ"), size: Number(a.size ?? 0), mime: String(a.mime ?? "application/octet-stream") });
  }
  return out;
}

/**
 * AUDIT-CLASS X1: ตัวตัดสิน "จดหมายฉบับนี้มองเห็นได้ไหม" **ทีละแถว** — กติกาเดียวกับ `visibleThreadWhere`
 *   ของหน้ารายการเป๊ะ ๆ (สองที่ = วันหนึ่งไม่ตรงกัน แล้วเธรดที่รายการไม่โชว์ก็เปิดอ่านได้ตรง ๆ):
 *     • แถวที่ผูกผู้ติดต่อ  ⇒ ตัดสินด้วยการมองเห็น "ผู้ติดต่อคนนั้น" อย่างเดียว
 *     • แถวที่ไม่ผูกผู้ติดต่อแต่ผูกบริษัท ⇒ ด้วยการมองเห็นบริษัทนั้น
 *     • แถวที่ไม่ผูกใครเลย (กล่อง "ยังไม่จับคู่") ⇒ ด่าน `assertUnmatchedGate`
 * 🔴 เดิมเป็น "เห็นใครในเธรดก็ได้ 1 คน = เห็นทั้งเธรด" ⇒ พนักงานที่เห็นลูกค้า A เปิดจดหมายของลูกค้า B
 *    ที่บังเอิญอยู่เธรดเดียวกันได้ทั้งฉบับ (หัวข้อ · เนื้อความ · ที่อยู่ · ไฟล์แนบ)
 */
async function rowVisibleFilter(
  ctx: EmailsCtx,
  actor: MemberActor,
  rows: { contactId: string | null; companyId: string | null }[],
): Promise<(r: { contactId: string | null; companyId: string | null }) => boolean> {
  const contactIds = uniq(rows.map((r) => r.contactId ?? ""));
  const companyIds = uniq(rows.filter((r) => !r.contactId).map((r) => r.companyId ?? ""));
  const [cRows, coRows] = await Promise.all([
    contactIds.length ? prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, actor), { id: { in: contactIds } }] }, select: { id: true } }) : Promise.resolve([]),
    companyIds.length ? prisma.crmCompany.findMany({ where: { AND: [await companyWhere(ctx, actor), { id: { in: companyIds } }] }, select: { id: true } }) : Promise.resolve([]),
  ]);
  const okC = new Set(cRows.map((c) => c.id));
  const okCo = new Set(coRows.map((c) => c.id));
  let unmatchedOk = false;
  if (rows.some((r) => !r.contactId && !r.companyId)) {
    try {
      await assertUnmatchedGate(ctx, actor);
      unmatchedOk = true;
    } catch {
      unmatchedOk = false;
    }
  }
  return (r) => (r.contactId ? okC.has(r.contactId) : r.companyId ? okCo.has(r.companyId) : unmatchedOk);
}

export async function getThread(ctx: EmailsCtx, actor: MemberActor, threadKey: string): Promise<{ threadKey: string; messages: ThreadMessageDto[] }> {
  await enter(ctx, actor, KEY_READ);
  const key = str(threadKey);
  const all = key
    ? await prisma.crmEmailMessage.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, threadKey: key }, orderBy: { createdAt: "asc" }, take: 500 })
    : [];
  if (all.length === 0) throw fail("NOT_FOUND", THREAD_NOT_FOUND);
  const visible = await rowVisibleFilter(ctx, actor, all);
  const rows = all.filter(visible);
  // ไม่เหลือแถวที่มองเห็นได้เลย = "ไม่พบ" (ไม่ใช่ 403 — ไม่บอกว่าเธรดนี้มีอยู่จริง)
  if (rows.length === 0) throw fail("NOT_FOUND", THREAD_NOT_FOUND);
  // AUDIT-CLASS X10: DTO ไม่มี cdnUrl / ค่าหมาย private:// / path ของที่เก็บ — ลิงก์ออกทาง attachmentUrl เท่านั้น
  return {
    threadKey: key,
    messages: rows.map((r) => ({
      id: r.id,
      contactId: r.contactId,
      companyId: r.companyId,
      dealId: r.dealId,
      direction: r.direction,
      fromAddr: r.fromAddr,
      fromName: r.fromName,
      toAddrs: r.toAddrs,
      ccAddrs: r.ccAddrs,
      subject: r.subject,
      bodyHtml: r.bodyHtml,
      bodyText: r.bodyText,
      attachments: attachmentsOf(r),
      status: r.status,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      receivedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
      openCount: r.openCount,
      clickCount: r.clickCount,
      repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
      matchedBy: r.matchedBy,
      purged: !!r.purgedAt,
    })),
  };
}

/** AUDIT-CLASS X10: ลิงก์ไฟล์แนบ = `privateFileUrl` ที่ผูกผู้ดูและหมดอายุ — ออกให้หลังตรวจการมองเห็นแล้วเท่านั้น */
export async function attachmentUrl(ctx: EmailsCtx, actor: MemberActor, emailId: string, fileId: string): Promise<{ url: string; expiresAt: string }> {
  await enter(ctx, actor, KEY_READ);
  const row = await prisma.crmEmailMessage.findFirst({ where: { id: str(emailId), tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!row) throw fail("NOT_FOUND", EMAIL_NOT_FOUND);
  // AUDIT-CLASS X1/X10: ต้องเห็น **จดหมายฉบับนี้** ไม่ใช่แค่ "เห็นอะไรบางอย่างในเธรดนี้"
  const thread = await getThread(ctx, actor, row.threadKey);
  if (!thread.messages.some((m) => m.id === row.id)) throw fail("NOT_FOUND", EMAIL_NOT_FOUND);
  const att = attachmentsOf(row).find((a) => a.fileId === str(fileId));
  if (!att) throw fail("NOT_FOUND", FILE_UNAVAILABLE);
  const asset = await prisma.fileAsset.findFirst({ where: { id: att.fileId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!asset) throw fail("NOT_FOUND", FILE_UNAVAILABLE);
  const viewerId = str(actor.userId);
  if (!viewerId) throw fail("NOT_FOUND", FILE_UNAVAILABLE);
  const url = privateFileUrl(att.fileId, { kind: "STAFF", id: viewerId });
  const exp = Number(url.match(/[?&]exp=(\d+)/)?.[1] ?? 0);
  return { url, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function attachToContact(ctx: EmailsCtx, actor: MemberActor, emailId: string, contactId: string): Promise<{ emailId: string; contactId: string }> {
  await enter(ctx, actor, KEY_READ);
  const row = await prisma.crmEmailMessage.findFirst({ where: { id: str(emailId), tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!row) throw fail("NOT_FOUND", EMAIL_NOT_FOUND);
  if (row.contactId) throw fail("CONFLICT", "จดหมายฉบับนี้ผูกกับผู้ติดต่ออยู่แล้ว — เปิดเธรดของผู้ติดต่อนั้นได้เลย");
  await assertUnmatchedGate(ctx, actor);
  const target = await prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, actor), { id: str(contactId) }] } });
  if (!target) throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
  const at = new Date();
  await prisma.$transaction(async (tx) => {
    const n = await tx.crmEmailMessage.updateMany({ where: { id: row.id, contactId: null }, data: { contactId: target.id, companyId: row.companyId ?? target.companyId ?? null, matchedBy: "MANUAL" } });
    if (n.count !== 1) return;
    await activities.recordSystemActivityInTx(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId }, {
      type: "EMAIL",
      source: "EMAIL",
      direction: row.direction,
      sourceRef: row.id,
      title: row.subject.slice(0, 200),
      contactId: target.id,
      companyId: row.companyId ?? target.companyId ?? null,
      dealId: null,
      at,
    });
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: str(ctx.actorUserId) || null,
    action: "crm.email.attach",
    targetType: "CrmEmailMessage",
    targetId: row.id,
    after: { contactId: target.id, matchedBy: "MANUAL" },
  });
  return { emailId: row.id, contactId: target.id };
}

// ───────────────────────── เส้นสาธารณะ: เพดานความถี่ (AUDIT-CLASS X7) ─────────────────────────

export type TrackRoute = "o" | "c" | "u" | "wh";

/**
 * กุญแจถังเพดานความถี่ที่ route ใช้จริง — **สัญญา** (ข้อสอบลบเฉพาะแถวของตัวเองด้วยตัวนี้ · มติผู้คุมงาน ข้อ 9)
 * 🔴 กุญแจไม่มี IP ดิบและไม่มี token ดิบ: แถว `ChatRateBucket` อ่านได้จากหน้าผู้ดูแล ⇒ กุญแจที่มี IP ของ
 *    ลูกค้าอยู่ข้างในคือการเก็บข้อมูลส่วนบุคคลโดยไม่ตั้งใจ (และ token ในกุญแจ = ปลอมลิงก์ได้)
 */
export function trackRateKeys(route: TrackRoute, req: { ip: string; token?: string }): string[] {
  const keys = [`crm.email.t.${route}.ip.${sha256(`ip:${str(req?.ip)}`).slice(0, 32)}`];
  if (str(req?.token)) keys.push(`crm.email.t.${route}.tok.${sha256(`tok:${str(req.token)}`).slice(0, 32)}`);
  return keys;
}

/** ด่านความถี่ของ route สาธารณะ — เต็มเพดาน = ยังตอบเหมือนเดิมทุกไบต์ แต่ไม่นับ/ไม่เขียน */
export async function trackGate(route: TrackRoute, req: { ip: string; token?: string }): Promise<boolean> {
  const keys = trackRateKeys(route, req);
  const ipKey = keys[0] as string;
  const tokKey = keys[1];
  const ipOk = await checkRateLimitDb(ipKey, CRM_TRACK_RATE_LIMITS.perIp);
  const tokOk = tokKey ? await checkRateLimitDb(tokKey, CRM_TRACK_RATE_LIMITS.perToken) : { ok: true };
  return ipOk.ok && tokOk.ok;
}

async function messageOfToken(purpose: "o" | "u" | "c", token: string): Promise<CrmEmailMessage | null> {
  const id = emailIdOfToken(token);
  if (!id) return null;
  if (purpose === "o") {
    const row = await prisma.crmEmailMessage.findFirst({ where: { trackTokenHash: tokenHash("o", token) } });
    return row ?? null;
  }
  const row = await prisma.crmEmailMessage.findFirst({ where: { id } });
  if (!row) return null;
  const routing = isObj(row.routing) ? (row.routing as RoutingJson) : null;
  if (purpose === "u") return routing?.unsub && routing.unsub === tokenHash("u", token) ? row : null;
  const h = tokenHash("c", token);
  return Array.isArray(routing?.links) && routing.links.some((l) => isObj(l) && l.h === h) ? row : null;
}

/**
 * นับ "เปิดอ่าน" — route ตอบ gif เดิมทุกไบต์ไม่ว่าผลจะเป็นอย่างไร
 * 🔴 นับเฉพาะเมื่อ: token รู้จัก · UA ไม่ใช่เครื่อง · ผ่านไป ≥ 2 วินาทีหลังส่ง · ผู้ติดต่อไม่ได้ปิดการติดตาม
 */
export async function trackOpen(token: string, meta: { ip: string; ua?: string | null }, opts: { count?: boolean } = {}): Promise<{ url: string | null }> {
  try {
    if (opts.count === false) return { url: null };
    const row = await messageOfToken("o", str(token));
    if (!row || row.direction !== "OUT") return { url: null };
    if (isTrackingBot(meta?.ua)) return { url: null };
    const sentAt = row.sentAt ?? row.createdAt;
    if (Date.now() - sentAt.getTime() < OPEN_MIN_AGE_MS) return { url: null };
    if (row.contactId) {
      const contact = await prisma.crmContact.findFirst({ where: { id: row.contactId }, select: { trackingOptOut: true } });
      if (contact?.trackingOptOut) return { url: null };
    }
    // AUDIT-CLASS X3: ตัวนับจบในคำสั่ง SQL เดียว (สิบคำขอพร้อมกันต้องได้ 10 ไม่ใช่ 3)
    // AUDIT-CLASS X4: ตัวนับ · แถวเหตุการณ์ · event ขาออก อยู่ใน **ธุรกรรมเดียวกัน** — เดิมแยกสามก้อน
    //   ⇒ เครื่องดับคั่นกลางได้ "นับแล้วแต่ไม่มี event" (กฎอัตโนมัติ/รายงานของร้านไม่เคยรู้ว่าลูกค้าเปิดอ่าน)
    //   หรือ "มีแถวเหตุการณ์แต่ไม่มี event" — สองอย่างนี้ซ่อมย้อนหลังไม่ได้เพราะไม่มีใครรู้ว่าขาด
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "CrmEmailMessage"
           SET "openCount" = "openCount" + 1,
               "firstOpenedAt" = COALESCE("firstOpenedAt", NOW()),
               "lastOpenedAt" = NOW(),
               "status" = CASE WHEN "status" IN ('SENT','DELIVERED') THEN 'OPENED'::"CrmEmailStatus" ELSE "status" END
         WHERE "id" = ${row.id}`;
      const ev = await tx.crmEmailEvent.create({
        data: { tenantId: row.tenantId, emailId: row.id, kind: "OPEN", userAgent: str(meta?.ua).slice(0, 200) || null },
      });
      await emitEmailEvent(tx, { tenantId: row.tenantId, systemId: row.systemId }, EVT.opened, row, ev.id);
    });
    return { url: null };
  } catch {
    return { url: null };
  }
}

/**
 * นับคลิก แล้วคืน URL ที่ "เก็บไว้สำหรับ token นั้น" เท่านั้น
 * 🔴 AUDIT-CLASS X7: ไม่มีทางที่พารามิเตอร์ใน URL หรือ token ที่ถูกแก้จะเลือกปลายทางอื่นได้ — ปลายทาง
 *    มาจากแถวในฐานที่ผูกกับค่าย่อยของ token นั้นตัวเดียว (ไม่ใช่จากคำขอ)
 */
export async function trackClick(token: string, meta: { ip: string; ua?: string | null }, opts: { count?: boolean } = {}): Promise<{ url: string | null }> {
  try {
    const t = str(token);
    const row = await messageOfToken("c", t);
    if (!row) return { url: null };
    const routing = isObj(row.routing) ? (row.routing as RoutingJson) : null;
    const h = tokenHash("c", t);
    const link = (routing?.links ?? []).find((l) => isObj(l) && l.h === h);
    const url = link && /^https?:\/\//i.test(String(link.url)) ? String(link.url) : null;
    if (!url) return { url: null };
    if (opts.count === false || isTrackingBot(meta?.ua)) return { url };
    let skip = false;
    if (row.contactId) {
      const contact = await prisma.crmContact.findFirst({ where: { id: row.contactId }, select: { trackingOptOut: true } });
      skip = contact?.trackingOptOut === true;
    }
    if (!skip) {
      // AUDIT-CLASS X3/X4: ตัวนับ + แถวเหตุการณ์ (URL อยู่ที่นี่ที่เดียว) + event ขาออก = ธุรกรรมเดียว
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "CrmEmailMessage" SET "clickCount" = "clickCount" + 1 WHERE "id" = ${row.id}`;
        const ev = await tx.crmEmailEvent.create({
          data: { tenantId: row.tenantId, emailId: row.id, kind: "CLICK", url: url.slice(0, 2000), userAgent: str(meta?.ua).slice(0, 200) || null },
        });
        await emitEmailEvent(tx, { tenantId: row.tenantId, systemId: row.systemId }, EVT.clicked, row, ev.id);
      });
    }
    return { url };
  } catch {
    return { url: null };
  }
}

/**
 * ยกเลิกรับอีเมล — คืน `{ ok: true }` **เสมอ** ไม่ว่า token จะรู้จักหรือไม่ (ไม่มีเครื่องทำนาย token ที่ใช้ได้)
 * 🔴 ทำงานแม้ร้านกลับไป uiVersion 1 (มติผู้คุมงาน ข้อ 7): การยกเลิกรับตามกฎหมายห้ามขึ้นกับสวิตช์หน้าจอ
 */
export async function unsubscribe(token: string, meta?: { ip?: string; ua?: string | null }): Promise<{ ok: true }> {
  try {
    const row = await messageOfToken("u", str(token));
    if (!row || !row.contactId) return { ok: true };
    const ctx = { tenantId: row.tenantId, systemId: row.systemId };
    // กติกาถาวร (ข้อสอบ C1.4-S0.8): คอลัมน์ที่มีเจ้าของของ `CrmContact` เขียนได้จาก `contacts*.ts`/`consents.ts`
    //   เท่านั้น ⇒ ธง "ขอไม่รับ" พลิกผ่านตัวเขียนแคบ ๆ ของ `contacts.ts` (มีเงื่อนไข · คืน "พลิกจริงไหม")
    const contactId = row.contactId;
    const flipped = await prisma.$transaction((tx) => contacts.markEmailOptOutInTx(tx, ctx, contactId));
    if (flipped) {
      await consents
        .set({ ...ctx, actorUserId: null }, SYSTEM_ACTOR, row.contactId, { channel: "EMAIL", granted: false, source: "UNSUBSCRIBE", note: "ลูกค้ากดยกเลิกรับจากลิงก์ในอีเมล" })
        .catch(() => null);
      await stopSequencesFor(ctx, row.contactId, "OPT_OUT");
    }
    await prisma.crmEmailEvent
      .create({ data: { tenantId: row.tenantId, emailId: row.id, kind: "UNSUBSCRIBE", providerEventId: `unsub:${row.id}`, userAgent: str(meta?.ua).slice(0, 200) || null } })
      .catch(() => null);
    await writeAudit({
      tenantId: row.tenantId,
      actorId: null,
      actorType: "SYSTEM",
      action: "crm.email.unsubscribe",
      targetType: "CrmContact",
      targetId: row.contactId,
      after: { emailId: row.id, via: "one-click" },
    });
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

// ───────────────────────── webhook ของผู้ให้บริการ (Svix) ─────────────────────────

export type ProviderWebhookInput = {
  headers: Record<string, string>;
  rawBody: string;
  /** IP ของผู้ยิง (route ส่งมาเสมอ) — ด่านความถี่ทำงานเฉพาะเมื่อมีค่านี้ และทำ **หลัง** ด่านขนาด/ลายเซ็น */
  ip?: string | null;
};
export type ProviderWebhookResult = { status: number; handled: boolean; reason?: string };

/** ลายเซ็น Svix — `v1,<base64 ของ HMAC-SHA256(`${id}.${ts}.${body}`)>` ด้วยกุญแจหลัง `whsec_` */
function svixOk(headers: Record<string, string>, rawBody: string, nowSec: number): boolean {
  const secret = str(process.env.RESEND_WEBHOOK_SECRET);
  if (!secret) return false;
  const keyB64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const id = str(headers["svix-id"]);
  const ts = str(headers["svix-timestamp"]);
  const sigHeader = str(headers["svix-signature"]);
  if (!id || !ts || !sigHeader) return false;
  if (!/^\d{1,12}$/.test(ts) || Math.abs(nowSec - Number(ts)) > WEBHOOK_SKEW_SEC) return false;
  let key: Buffer;
  try {
    key = Buffer.from(keyB64, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest();
  for (const part of sigHeader.split(/\s+/)) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    let got: Buffer;
    try {
      got = Buffer.from(value, "base64");
    } catch {
      continue;
    }
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}

export async function providerWebhook(input: ProviderWebhookInput): Promise<ProviderWebhookResult> {
  const rawBody = typeof input?.rawBody === "string" ? input.rawBody : "";
  if (Buffer.byteLength(rawBody, "utf8") > WEBHOOK_MAX_BYTES) return { status: 413, handled: false, reason: "too_large" };
  const headers = lowerHeaders(input?.headers);
  // AUDIT-CLASS X7: ลายเซ็นไม่ผ่าน = 401 และ **ไม่เขียนอะไรเลย** (ใครก็ยิง "อีเมลคุณเด้ง" ใส่ร้านคนอื่นได้)
  if (!svixOk(headers, rawBody, Math.floor(Date.now() / 1000))) return { status: 401, handled: false, reason: "bad_signature" };
  // AUDIT-CLASS X7: ด่านความถี่อยู่ **หลัง** ด่านขนาดและลายเซ็น — ถ้ายิงด่านนี้ก่อน คำขอที่ลายเซ็นไม่ผ่านก็ยัง
  //   "เขียน" แถว `ChatRateBucket` ⇒ คำว่า "401 แล้วไม่เขียนอะไรเลย" ไม่จริง และคนนอกก็ถมถังของ IP ตัวเองได้ฟรี
  //   (ไม่มี ip ส่งมา = ผู้เรียกภายใน/ข้อสอบ ⇒ ไม่มีด่าน ไม่มีการเขียนถัง)
  const whIp = str(input?.ip);
  if (whIp && !(await trackGate("wh", { ip: whIp }))) return { status: 429, handled: false, reason: "rate_limited" };
  let body: unknown;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return { status: 200, handled: false, reason: "invalid_json" };
  }
  if (!isObj(body)) return { status: 200, handled: false, reason: "invalid_json" };
  const type = String(body.type ?? "");
  const data = isObj(body.data) ? body.data : {};
  const providerId = str(data.email_id) || str(data.emailId);
  if (!providerId) return { status: 200, handled: false, reason: "no_email_id" };
  const row = await prisma.crmEmailMessage.findFirst({ where: { providerId } });
  if (!row) return { status: 200, handled: false, reason: "unknown_email" };
  const eventId = str(headers["svix-id"]) || `${type}:${providerId}`;
  const ctx = { tenantId: row.tenantId, systemId: row.systemId };

  if (type === "email.delivered") {
    await prisma.crmEmailMessage.updateMany({ where: { id: row.id, status: { in: ["QUEUED", "SENT"] } }, data: { status: "DELIVERED" } });
    return { status: 200, handled: true };
  }

  const permanent = isObj(data.bounce) ? String(data.bounce.type ?? "").toLowerCase() === "permanent" : false;
  if (type === "email.bounced") {
    if (!permanent) return { status: 200, handled: false, reason: "soft_bounce" };
    // AUDIT-CLASS X4: `providerEventId` unique ⇒ ยิงซ้ำ/ยิงพร้อมกันได้ event เดียวและผลข้างเคียงเกิดครั้งเดียว
    //   ธุรกรรมเดียว: แถวเหตุการณ์ + สถานะจดหมาย + ธงของผู้ติดต่อ + event ขาออก — เดิมเป็นสี่คำสั่งแยกกัน
    //   ⇒ เครื่องดับคั่นกลางได้ "ผู้ติดต่อถูกตีธงเด้งแต่ไม่มี event" (ลำดับการติดตามยังส่งต่อ) หรือกลับกัน
    // 🔴 การชนกุญแจซ้ำ (ยิงซ้ำ) ต้องแยกออกจาก error ชั่วคราวของฐาน: ยิงซ้ำ = 200 (Svix เลิกยิง) ·
    //    ฐานสะดุด = 500 ให้ Svix ยิงใหม่ ไม่ใช่กลืนเป็น "จัดการแล้ว" แล้วเหตุการณ์หายไปตลอดกาล
    try {
      await prisma.$transaction(async (tx) => {
        await tx.crmEmailEvent.create({ data: { tenantId: row.tenantId, emailId: row.id, kind: "BOUNCE", providerEventId: eventId } });
        await tx.crmEmailMessage.updateMany({ where: { id: row.id }, data: { status: "BOUNCED", providerError: "PERMANENT_BOUNCE" } });
        // ธงของผู้ติดต่อเขียนผ่านตัวเขียนของ `contacts.ts` เท่านั้น (กติกาถาวร · ข้อสอบ C1.4-S0.8)
        if (row.contactId) await contacts.markEmailBouncedInTx(tx, ctx, row.contactId, new Date());
        await emitEmailEvent(tx, ctx, EVT.bounced, row, eventId);
      });
    } catch (e) {
      if (isUniqueViolation(e)) return { status: 200, handled: true, reason: "replay" };
      await logOps("WARN", "crm.email.webhook", "บันทึกเหตุการณ์อีเมลตีกลับไม่สำเร็จ", {
        tenantId: row.tenantId,
        detail: (e instanceof Error ? e.name : "Error").slice(0, 80),
      }).catch(() => {});
      return { status: 500, handled: false, reason: "db_error" };
    }
    if (row.contactId) await stopSequencesFor(ctx, row.contactId, "BOUNCE");
    await writeAudit({ tenantId: row.tenantId, actorId: null, actorType: "SYSTEM", action: "crm.email.bounced", targetType: "CrmEmailMessage", targetId: row.id, after: { kind: "BOUNCE" } });
    return { status: 200, handled: true };
  }

  if (type === "email.complained") {
    // มติผู้คุมงาน ข้อ 5: แจ้งสแปม = ขอไม่รับ (เข้ม) + หยุดลำดับการติดตาม
    let flipped = false;
    try {
      flipped = await prisma.$transaction(async (tx) => {
        await tx.crmEmailEvent.create({ data: { tenantId: row.tenantId, emailId: row.id, kind: "COMPLAINT", providerEventId: eventId } });
        if (!row.contactId) return false;
        // ธง "ขอไม่รับ" เขียนผ่านตัวเขียนของ `contacts.ts` เท่านั้น (กติกาถาวร · ข้อสอบ C1.4-S0.8)
        return contacts.markEmailOptOutInTx(tx, ctx, row.contactId);
      });
    } catch (e) {
      if (isUniqueViolation(e)) return { status: 200, handled: true, reason: "replay" };
      await logOps("WARN", "crm.email.webhook", "บันทึกเหตุการณ์แจ้งสแปมไม่สำเร็จ", {
        tenantId: row.tenantId,
        detail: (e instanceof Error ? e.name : "Error").slice(0, 80),
      }).catch(() => {});
      return { status: 500, handled: false, reason: "db_error" };
    }
    if (row.contactId) {
      // 🔴 การแจ้งสแปมคือ "ถอนความยินยอม" ที่หนักที่สุดที่ลูกค้าทำได้ — ต้องมีแถวประวัติความยินยอมเหมือน
      //    การกดลิงก์ยกเลิกรับ ไม่ใช่แค่ธงบูลีนบนผู้ติดต่อ (หน้าความยินยอม/รายงาน PDPA อ่านจากแถวนั้น
      //    และการรวมผู้ติดต่อ/ซิงก์ฝั่งสมาชิกก็เดินตามแถวนั้น) · ที่มาใช้ค่าเดียวกับการกดยกเลิกรับ
      //    (`UNSUBSCRIBE` — ทะเบียนที่มาเป็นของใบ C1.x ไม่มีค่า COMPLAINT และใบนี้ไม่ใช่เจ้าของทะเบียนนั้น)
      if (flipped) {
        await consents
          .set({ ...ctx, actorUserId: null }, SYSTEM_ACTOR, row.contactId, {
            channel: "EMAIL",
            granted: false,
            source: "UNSUBSCRIBE",
            note: "ผู้ให้บริการอีเมลแจ้งว่าลูกค้ากดรายงานว่าเป็นสแปม",
          })
          .catch(() => null);
      }
      await stopSequencesFor(ctx, row.contactId, "OPT_OUT");
    }
    await writeAudit({ tenantId: row.tenantId, actorId: null, actorType: "SYSTEM", action: "crm.email.complained", targetType: "CrmEmailMessage", targetId: row.id, after: { kind: "COMPLAINT" } });
    return { status: 200, handled: true };
  }

  return { status: 200, handled: false, reason: "ignored_type" };
}

// ───────────────────────── ล้างเนื้อความตามอายุเก็บ (ผู้ลงทะเบียนงานรายวัน = C2.10 · R-A) ─────────────────────────

export async function purgeBodies(now: Date, opts: { tenantIds?: string[]; deps?: { del?: DeleteDeps["del"] } } = {}): Promise<{ purged: number }> {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const tenantIds = Array.isArray(opts.tenantIds) ? opts.tenantIds.filter((t) => typeof t === "string" && t) : undefined;
  if (tenantIds && tenantIds.length === 0) return { purged: 0 };
  const systems = await prisma.appSystem.findMany({
    where: { type: "CRM", ...(tenantIds ? { tenantId: { in: tenantIds } } : {}) },
    select: { id: true, tenantId: true, settings: true },
  });
  let purged = 0;
  for (const sys of systems) {
    const days = crmEmailSettingsOf(sys.settings).retentionDays;
    const cutoff = new Date(at.getTime() - days * 86_400_000);
    for (let round = 0; round < 50; round += 1) {
      // 🔴 ห้ามล้างจดหมายที่ **ยังไม่ได้ส่ง**: แถว QUEUED ไม่มี sentAt/receivedAt ⇒ `createdAt` เป็นตัวตัดสิน ⇒
      //    จดหมายที่พนักงานตั้งเวลาไว้ไกลกว่าอายุการเก็บ (เช่น ตั้งล่วงหน้า 1 ปี ในร้านที่เก็บ 30 วัน) เคยถูกล้าง
      //    เนื้อความทิ้งก่อนถึงเวลาส่ง แล้วงานตามเวลาก็ส่งจดหมายเปล่าออกไปให้ลูกค้า
      const rows = (await prisma.$queryRaw<{ id: string; attachments: Json }[]>`
        SELECT "id", "attachments" FROM "CrmEmailMessage"
         WHERE "systemId" = ${sys.id} AND "purgedAt" IS NULL
           AND "status" <> 'QUEUED'
           AND ("scheduledAt" IS NULL OR "scheduledAt" <= ${at})
           AND COALESCE("sentAt", "receivedAt", "createdAt") <= ${cutoff}
         ORDER BY "createdAt" ASC LIMIT 200`) ?? [];
      if (rows.length === 0) break;
      for (const r of rows) {
        for (const a of attachmentsOf({ attachments: r.attachments })) {
          await deleteFileAsset({ tenantId: sys.tenantId }, a.fileId, opts.deps?.del ? { del: opts.deps.del } : undefined).catch(() => null);
        }
        await prisma.crmEmailMessage.update({
          where: { id: r.id },
          data: { bodyHtml: null, bodyText: null, snippet: null, attachments: Prisma.DbNull, purgedAt: at },
        });
        purged += 1;
      }
      if (rows.length < 200) break;
    }
  }
  return { purged };
}
