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
import { ciEquals } from "@/lib/core/ci-equals"; // CRM C5.5-fix2 ◂
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { checkRateLimitDb, checkRateLimitDbMany } from "@/lib/core/rate-limit-db";
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
import { assertCrmLimit } from "./limits"; // CRM C3.9 ▸ เพดานอีเมลต่อวัน + แม่แบบ ◂
import { CRM_HARD_CAPS, CrmLimitError } from "./limits-shared"; // CRM C3.9 ◂
import { crmCan, crmForbiddenMessage, CrmForbiddenError, isApiActor } from "./access";
import { assertCrmV2 } from "./ui-version";
import { canContact } from "./consents";
import * as consents from "./consents";
import { contactWhere, dealWhere, visibleEmailRowSql } from "./where";
import { crmScope } from "./request-scope";
import { companyByEmailDomain, countVisibleCompany, visibleCompanyIds } from "./companies";
import { FREE_MAIL_DOMAINS } from "./companies-shared"; // CRM C5.4-E ▸ L6-m8 ◂
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
  CRM_INBOUND_RATE_LIMITS, // CRM C5.5-fix2 ▸ 2a-7 ◂
  CRM_LOOP_HEADER, // CRM C5.5-fix2 ▸ 2a-1 ◂
  CRM_COPY_IN_SUBJECT_PREFIX, // CRM C5.5-fix2 ▸ 2a-1 ◂
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
  crmPlainTextToEmailHtml, // CRM C4.4-fix2 ▸ J1 ◂
  CRM_EMAIL_BODY_TOO_LONG_MSG, // CRM C4.4-fix2 r2 ▸ SF-1 ◂
  crmEmailBodyTooLong,
  type CrmTextPlaceholders,
} from "./emails-shared";
import { renderKbTokens } from "./kb-tokens"; // CRM C3.4 ◂
import "./emails-job";
import { crmSystemRow } from "./visibility"; // CRM C5.1-fix ▸ ระบบ CRM ผ่านด่านรวมคำสั่งเดียว (memo ต่อคำขอ) ◂

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
  /**
   * CRM C4.4-fix2 ▸ J1: เนื้อความแบบ "ข้อความล้วน" (ช่องเขียนจดหมาย · SEND_EMAIL ของกฎ · ขั้นอีเมลของลำดับติดตาม) — ระบบแปลงเป็น HTML
   * ด้วยตัวแปลงตัวเดียว `crmPlainTextToEmailHtml` (escape ทุกอย่าง · URL http(s) เป็นลิงก์ ⇒ นับคลิกได้) · ใช้เมื่อไม่มี `templateId`/`bodyHtml` ◂
   */
  bodyText?: string | null;
  /**
   * CRM C4.4-fix2 r2 ▸ รีวิว BL-1: ค่าตัวแปรที่ต้องแทนลง `bodyText` (กฎ `{ชื่อ}` · ลำดับติดตาม `{{contact.*}}`) — ระบบแทน **หลัง** ทำลิงก์
   * ของผู้เขียน และ escape เป็นข้อความเสมอ (ค่าจากลูกค้าไม่มีทางกลายเป็นลิงก์นับคลิก/redirect) ◂
   */
  bodyVars?: CrmTextPlaceholders | null;
  templateId?: string | null;
  vars?: Record<string, string>;
  attachments?: SendAttachmentInput[];
  scheduledAt?: Date | string | null;
  replyToEmailId?: string | null;
  idempotencyKey?: string | null;
};
/** `failCode` (C4.3-fix) = รหัสใน providerError เมื่อ status เป็น FAILED — ให้หน้าจอบอกเหตุจริง (แปลไทยด้วย `crmEmailFailText`) */
// CRM C5.4-D r3 ▸ `inFlightUntil` (R2-N3): แถวเดิมของกุญแจนี้ยัง QUEUED — lease หมดเมื่อไร ◂
// CRM C5.4-D2 ▸ F1: `unconfirmed` (SENT จาก 409 ของการส่งซ้ำ) ถูกถอดออก — การส่งซ้ำเหมือนครั้งแรกทุกไบต์ ผู้ให้บริการคืนคำตอบเดิมพร้อม id ◂
export type SendResult = { emailId: string; messageId: string; threadKey: string; status: "SENT" | "QUEUED" | "FAILED"; reused?: boolean; failCode?: string | null; inFlightUntil?: Date | null };

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
  /** CRM C5.5-fix2 ▸ รีวิว RV2-4: เธรดนี้มีจดหมายที่ผู้ส่งยังไม่ได้พิสูจน์ (From ปลอมได้) — กล่องจดหมาย/REST/เครื่องมือ AI ขึ้นป้ายเดียวกับหน้าเธรด ◂ */
  unverifiedFrom: boolean;
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
  /** CRM C5.5-fix2 ▸ hunter 2a-2: ผู้ส่งยังไม่ได้พิสูจน์ (ไม่มี A-R ของ MTA เรา) — หน้าจอขึ้นป้าย "ไม่ยืนยันผู้ส่ง" ◂ */
  unverifiedFrom: boolean;
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
  /**
   * CRM C5.4-D2 ▸ F1: ค่าติดตาม (เปิดอ่าน `o` · คลิก `c`) ที่ใช้ประกอบจดหมายครั้งแรก — การส่งซ้ำของแถวเดียวกันประกอบด้วยค่าเดิม
   *   ⇒ คำขอถึงผู้ให้บริการเหมือนเดิมทุกไบต์ (ลูกค้าที่ปิดการติดตามระหว่างนั้น: ตัวนับเปิดอ่าน/คลิกตรวจธงของผู้ติดต่อตอนบันทึกอยู่แล้ว) ◂
   */
  trk?: { o: boolean; c: boolean };
  /**
   * CRM C5.4-D2 r2 ▸ S1(b) (รีวิว D2-S1): ค่าที่จดหมายครั้งแรก "ส่งออกไปจริง" ซึ่งไม่ได้มาจากแถวโดยตรง — `rt` หัว Reply-To ที่ส่ง (กุญแจกล่องเข้า
   *   อาจถูกหมุนภายหลัง) · `base` ที่อยู่เว็บที่ใช้ประกอบลิงก์ติดตาม/ยกเลิกรับ (APP_URL อาจเปลี่ยน) · `fp` ลายนิ้วมือ sha256 ของคำขอทั้งฉบับที่ส่ง
   *   ถึงผู้ให้บริการ (ผู้ส่ง · ผู้รับ · หัวเรื่อง · html · text · หัวจดหมาย · กุญแจกันซ้ำ) — การส่งซ้ำใช้ `rt`/`base` เดิม และเทียบ `fp` ก่อนเรียก ◂
   */
  rt?: string;
  base?: string;
  fp?: string;
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

/**
 * AUDIT-CLASS X7: token = `<emailId>~<ลายเซ็น 192 บิต>` (≥ 128 บิตตามสัญญา) — ฐานเก็บแต่ `tokenHash`
 * CRM C5.4-D2 ▸ F1 (รีวิว C5.4-D รอบ 3 · มติผู้คุมงาน): ลายเซ็น = HMAC-SHA256 ด้วยกุญแจที่ติดป้าย `crm-email-token:v1:` + `SESSION_SECRET`
 *   (แบบเดียวกับ `private-file:v1:` / `member-card:`) ของข้อความ `<emailId>|<หน้าที่ o/c/u>|<ลำดับลิงก์>` — เดิมสุ่มใหม่ทุกครั้งที่ประกอบ
 *   ⇒ การส่งซ้ำของจดหมายฉบับเดียวกัน (กุญแจกันซ้ำของผู้ให้บริการเดิม) มีเนื้อความไม่เหมือนเดิม ผู้ให้บริการตอบ 409 และลิงก์ในฉบับที่
 *   ลูกค้าได้จริงอาจใช้ไม่ได้ · ตอนนี้ทุกครั้งที่ประกอบจดหมายแถวเดียวกันได้ token ชุดเดิมทุกไบต์ (ไม่ต้องเก็บ token ดิบ ไม่ต้องสลับค่าแฮช)
 *   🔴 เดาไม่ได้: ไม่มีกุญแจ = คำนวณไม่ได้ · `emailId` อยู่ในข้อความที่เซ็น ⇒ ย้ายลายเซ็นไปใช้กับจดหมายฉบับอื่น/ร้านอื่นไม่ได้ ·
 *      ชุดอักขระของสามช่องไม่มี `|` (emailId = hex · หน้าที่ = อักษรเดียว · ลำดับ = ตัวเลข) ⇒ ข้อความไม่กำกวม
 *   🔴 ไม่มีกุญแจสำรอง: ไม่ได้ตั้ง `SESSION_SECRET` (≥ 32 ตัว) = ส่งไม่ได้ (ไม่ใช่ส่งลิงก์ที่ปลอมได้) · อ่านตอนเรียก (ด่าน fitness ไร้ env)
 *   token ที่ออกด้วยสูตรเดิม (สุ่ม) ยังใช้ได้ตามเดิม — ด่านตรวจเทียบค่าแฮชที่เก็บไว้ ไม่ได้คำนวณสูตรซ้ำ ◂
 */
const TOKEN_KEY_LABEL = "crm-email-token:v1:";
function tokenKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length < 32) throw new Error("ไม่ได้ตั้งค่า SESSION_SECRET — ระบบสร้างลิงก์ติดตาม/ยกเลิกรับอีเมลไม่ได้ จึงยังส่งอีเมลไม่ได้ (แจ้งผู้ดูแลระบบ)");
  return `${TOKEN_KEY_LABEL}${secret}`;
}
function newToken(emailId: string, purpose: "o" | "c" | "u", index: number): string {
  return `${emailId}~${createHmac("sha256", tokenKey()).update(`${emailId}|${purpose}|${index}`).digest("base64url").slice(0, 32)}`;
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
      ? await crmSystemRow(ctx, prisma)
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

// CRM C3.9-fix ▸ รีวิว B1 (มติผู้คุมงาน): ที่อยู่ของ "ร้าน" ห้ามถูกถือเป็นตัวตนของลูกค้าที่ถูกลบตาม PDPA — ผู้เรียก = `privacy.ts`
//   ที่อยู่ผู้ส่ง/ตอบกลับ/สำเนาของร้าน (ตั้งค่าระบบทุกระบบ CRM ของร้าน + ตั้งค่ารายคน `CrmEmailUserSetting`) · อ่านใน tx ของผู้เรียก
export async function shopMailAddressesInTx(db: Pick<Prisma.TransactionClient, "appSystem" | "crmEmailUserSetting">, tenantId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    const b = bareEmail(v);
    if (b.includes("@")) out.add(b);
  };
  for (const sys of await db.appSystem.findMany({ where: { tenantId, type: "CRM" }, select: { settings: true }, take: 50 })) {
    const st = crmEmailSettingsOf(sys.settings);
    add(st.fromAddr);
    add(st.replyToAddr);
    add(st.copyToAddr);
  }
  for (const r of await db.crmEmailUserSetting.findMany({ where: { tenantId }, select: { fromAddr: true, replyToAddr: true, copyToAddr: true }, take: 2_000 })) {
    add(r.fromAddr);
    add(r.replyToAddr);
    add(r.copyToAddr);
  }
  return out;
}

/** ที่อยู่ของระบบ SHARK (`<slug>@` · `crm+<key>@` ของโดเมนระบบ) — ไม่ใช่ของลูกค้าคนใดเสมอ */
export function isSystemMailAddress(addr: unknown): boolean {
  return bareEmail(addr).endsWith(`@${CRM_EMAIL_SHARK_DOMAIN}`.toLowerCase());
}
// ◂ CRM C3.9-fix

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

function cleanAddrPatch(value: unknown, label: string, opts: { outsideShark?: boolean } = {}): string | null {
  if (value === null || value === undefined || str(value) === "") return null;
  if (hasLineBreak(value) || !isEmailAddr(value)) throw fail("VALIDATION", `${label}ยังไม่ใช่ที่อยู่อีเมลที่ใช้ได้ — พิมพ์ในรูป name@example.com แล้วบันทึกอีกครั้ง`);
  // CRM C5.5-fix2 ▸ hunter 2a-1: ปลายทางที่ระบบส่งจดหมายไปให้เอง (สำเนา) / ที่ลูกค้าตอบกลับ ห้ามเป็นที่อยู่ของ SHARK เอง
  //   (`crm+<key>@` ของระบบนี้หรือร้านอื่น · `งาน+`/`tasks+` ของบอร์ด · `<slug>@`) — ที่อยู่เหล่านี้วิ่งเข้ากล่องขาเข้าของเรา
  //   ⇒ สำเนาขาเข้าวนกลับเป็นจดหมายใหม่ไม่รู้จบ (แถว/กิจกรรม/การส่งบนบัญชีผู้ให้บริการกลางของทุกร้าน) หรือแปะคำตอบของลูกค้าลงร้านอื่น ◂
  if (opts.outsideShark && isSystemMailAddress(value)) {
    throw fail("VALIDATION", `${label}ต้องเป็นกล่องจดหมายนอก SHARK — ที่อยู่ @${CRM_EMAIL_SHARK_DOMAIN} (กล่อง CRM · บอร์ดงาน · ที่อยู่ร้าน) จะส่งจดหมายวนกลับเข้าระบบ ใช้อีเมลของร้านหรือของพนักงานแทน`);
  }
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
  if ("replyToAddr" in p) out.replyToAddr = cleanAddrPatch(p.replyToAddr, "ที่อยู่รับคำตอบ", { outsideShark: true }); // CRM C5.5-fix2 ◂
  if ("copyToAddr" in p) out.copyToAddr = cleanAddrPatch(p.copyToAddr, "ที่อยู่รับสำเนา", { outsideShark: true }); // CRM C5.5-fix2 ◂
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
  // CRM C5.4-B ▸ L1-m3: ที่อยู่ผู้ส่งส่วนตัว = "ตัวตนของพนักงาน" ที่เส้นขาเข้าใช้ตัดสินว่าจดหมายเป็นขาออกของร้าน ⇒ ต้องอยู่บนโดเมนผู้ส่ง
  //   ที่ร้านยืนยันแล้ว (ที่อื่นส่งจริงไม่ได้อยู่แล้ว — routingFor ใช้เฉพาะโดเมนยืนยัน) และต้องไม่ใช่อีเมลของผู้ติดต่อในระบบนี้
  //   (ไม่งั้นคำตอบจริงของลูกค้าคนนั้นถูกเก็บเป็น "พนักงานส่ง") ◂
  if (typeof data.fromAddr === "string" && data.fromAddr) {
    const addr = data.fromAddr;
    if (!(await verifiedDomains(ctx.tenantId)).has(emailDomainOf(addr))) {
      throw fail("VALIDATION", "ที่อยู่ผู้ส่งต้องเป็นอีเมลบนโดเมนที่ร้านยืนยันแล้ว (ตั้งค่า › อีเมล › โดเมนผู้ส่ง) — ถ้ายังไม่มีโดเมน ให้เว้นว่างไว้ ระบบจะส่งในนามร้านให้");
    }
    const isContact = await prisma.crmContact.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, OR: [{ email: ciEquals(addr) }, { previousEmails: { has: addr } }] } /* CRM C5.5-fix2 ▸ 2a-5: ไม่มี wildcard ◂ */, select: { id: true } });
    if (isContact) throw fail("VALIDATION", "ที่อยู่นี้เป็นอีเมลของผู้ติดต่อในระบบ CRM จึงใช้เป็นที่อยู่ผู้ส่งของพนักงานไม่ได้ — ใช้อีเมลของร้านบนโดเมนที่ยืนยันแล้ว");
  }
  if ("replyToAddr" in patch) data.replyToAddr = cleanAddrPatch(patch.replyToAddr, "ที่อยู่รับคำตอบ", { outsideShark: true }); // CRM C5.5-fix2 ◂
  if ("copyToAddr" in patch) data.copyToAddr = cleanAddrPatch(patch.copyToAddr, "ที่อยู่รับสำเนา", { outsideShark: true }); // CRM C5.5-fix2 ◂
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
    if (!a || isSystemMailAddress(a)) return; // CRM C5.5-fix2 ▸ 2a-1: ค่าที่บันทึกไว้ก่อนมีด่าน — ไม่ส่งสำเนาเข้ากล่องของ SHARK เอง ◂
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
    // CRM C3.9 ▸ AUDIT-CLASS X3: เพดานแม่แบบจดหมายของระบบ (§11.9 · 100) — ล็อก + นับ + insert ใน tx เดียว ◂
    const row = await prisma.$transaction(async (tx) => {
      await assertCrmLimit(ctx, "emailTemplates", 1, tx);
      return tx.crmEmailTemplate.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...data } });
    });
    await writeAudit({ tenantId: ctx.tenantId, actorId: str(ctx.actorUserId) || null, action: "crm.email.template.create", targetType: "CrmEmailTemplate", targetId: row.id, after: { name, category: data.category } });
    return { id: row.id, name: row.name, subject: row.subject, bodyHtml: row.bodyHtml, category: row.category, active: row.active };
  } catch (e) {
    if (e instanceof EmailError) throw e;
    if (isUniqueViolation(e)) throw fail("CONFLICT", "มีแม่แบบชื่อนี้อยู่แล้วในระบบนี้ — ตั้งชื่ออื่นหรือแก้แม่แบบเดิม");
    throw e;
  }
}

/**
 * ลบแม่แบบจดหมาย
 *
 * 🔴 รอบแก้ 25 ก.ย. 2569 (ผู้ตรวจอิสระ MINOR 8): "แม่แบบที่ยังถูกใช้" อยู่ในรายการคำสั่งอันตรายของใบงาน แต่ของเดิมลบเงียบ ๆ
 *    โดยไม่บอกว่ามีอะไรพังตามไปด้วย ⇒ นับให้เห็นก่อนลบ แล้วคืน/บันทึกเป็น `inUse` (ขั้นของลำดับการติดตาม + จดหมายที่ตั้งเวลา
 *    ไว้แต่ยังไม่ส่ง) · ยังเป็น danger + ต้องยืนยันเหมือนเดิม — ตัวเลขนี้คือสิ่งที่คนกดต้องได้เห็นในบันทึกภายหลังว่า
 *    "ตอนลบมีของที่อ้างถึงกี่ชิ้น" (แถว audit เก็บทั้ง before และ after)
 */
export async function deleteTemplate(ctx: EmailsCtx, actor: MemberActor, id: string): Promise<{ ok: true; inUse: { sequences: number; scheduled: number } }> {
  await enter(ctx, actor, KEY_SETTINGS);
  const prior = await prisma.crmEmailTemplate.findFirst({ where: { id: str(id), tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!prior) throw fail("NOT_FOUND", TEMPLATE_NOT_FOUND);
  const [sequences, scheduled] = await Promise.all([
    prisma.crmSequenceStep.count({ where: { tenantId: ctx.tenantId, templateId: prior.id, sequence: { systemId: ctx.systemId } } }),
    prisma.crmEmailMessage.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, templateId: prior.id, status: "QUEUED", sentAt: null } }),
  ]);
  const inUse = { sequences, scheduled };
  await prisma.crmEmailTemplate.delete({ where: { id: prior.id } });
  await writeAudit({
    tenantId: ctx.tenantId, actorId: str(ctx.actorUserId) || null, action: "crm.email.template.delete",
    targetType: "CrmEmailTemplate", targetId: prior.id, before: { name: prior.name, inUse }, after: { deleted: true, inUse },
  });
  return { ok: true, inUse };
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
// CRM C5.4-D2 r2 ▸ S1(b): `base` = ที่อยู่เว็บของครั้งแรก (เก็บไว้ที่ `routing.base`) เมื่อเป็นการส่งซ้ำ — ไม่ระบุ = APP_URL ปัจจุบัน (เดิม) ◂
function composeOutgoing(args: { emailId: string; storedHtml: string; trackOpens: boolean; trackClicks: boolean; base?: string }): ComposeOut {
  const base = args.base ?? appUrl();
  const links: { h: string; url: string }[] = [];
  let html = args.storedHtml;
  if (args.trackClicks) {
    html = html.replace(/href="(https?:\/\/[^"]*)"/gi, (_m, raw: string) => {
      const token = newToken(args.emailId, "c", links.length);
      links.push({ h: tokenHash("c", token), url: decodeAttr(raw) });
      return `href="${base}/t/c/${token}"`;
    });
  }
  const unsubToken = newToken(args.emailId, "u", 0);
  html += `<hr><p style="font-size:12px;color:#6b7280">ไม่ต้องการรับอีเมลจากเราแล้ว — <a href="${base}/u/${unsubToken}">กดที่นี่เพื่อยกเลิกรับอีเมล</a></p>`;
  const openToken = newToken(args.emailId, "o", 0);
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

// CRM C5.4-D r2 ▸ N1b: `redeliverFailed` (ทางระบบ — ลำดับการติดตามเท่านั้น) = ส่งซ้ำด้วยกุญแจเดิมแล้วแถวเดิมเป็น FAILED ⇒ ส่งแถวเดิมใหม่
//   (Message-ID เดิม = Resend Idempotency-Key เดิม) แทนการคืน "ฉบับเดิมที่ล้ม" — หน้าจอ/REST ไม่ส่งธงนี้ พฤติกรรมเดิมทุกประการ ◂
type SendCore = SendInput & { senderUserId?: string | null; sequenceStepId?: string | null; redeliverFailed?: boolean };

/**
 * CRM C5.4-D r2 ▸ N1a · r3 ▸ R2-S3 (มติผู้คุมงานฉบับแก้): รหัสความล้มเหลวที่ "ผิดที่จดหมายฉบับนี้" = ถาวร (ไม่ลองซ้ำ · บันทึก FAILED แล้วไปขั้นถัดไป)
 *   เฉพาะ `PROVIDER_400/404/405/422` + `INVALID_HEADER` + `NO_RECIPIENT` · ที่เหลือทั้งหมด = ชั่วคราว (ลองขั้นเดิมใหม่ตามรอบพัก) ◂
 */
export function isPermanentSendFailure(code: string | null | undefined): boolean {
  const c = String(code ?? "").trim().toUpperCase();
  return c === "INVALID_HEADER" || c === "NO_RECIPIENT" || c === "PROVIDER_400" || c === "PROVIDER_404" || c === "PROVIDER_405" || c === "PROVIDER_422";
}
/**
 * CRM C5.4-D r3 ▸ R2-S3: ระบบส่งอีเมล "ของร้าน/ผู้ให้บริการ" ล่มทั้งก้อน (ไม่ใช่ความผิดของจดหมายฉบับนี้) — กุญแจหลุด/ถูกเพิกถอน (401) ·
 *   โดเมนผู้ส่งยังไม่ยืนยัน/DNS หลุด (403) · โควตา/ความถี่เต็ม (429) ⇒ ลองต่อไม่นับรวมเพดาน 5 ครั้ง จนครบ 72 ชม. นับจากที่ขั้นล้มครั้งแรก ◂
 */
export function isOutageSendFailure(code: string | null | undefined): boolean {
  const c = String(code ?? "").trim().toUpperCase();
  return c === "PROVIDER_401" || c === "PROVIDER_403" || c === "PROVIDER_429";
}
/**
 * CRM C5.4-D r3 ▸ R2-S2: เครื่องหมายบนแถวที่ถือว่าส่งแล้วจาก 409 ของการส่งซ้ำ (ผู้ให้บริการรับฉบับก่อนไปแล้ว — ไม่รู้รหัสอ้างอิง) ◂
 * CRM C5.4-D2 ▸ F1: ไม่มีตัวเขียนค่านี้แล้ว (เหลือเฉพาะแถวที่บิลด์ก่อนหน้าเขียนไว้ — webhook หาแถวเหล่านี้เจอด้วย Message-ID · F2) ◂
 */
export const CRM_EMAIL_DELIVERY_UNCONFIRMED = "DELIVERY_UNCONFIRMED";
/** CRM C5.4-D2 ▸ F6 (R2-N1a): การส่งซ้ำถูกข้ามเพราะผู้รับของแถวเดิมไม่ใช่ผู้รับปัจจุบัน (อีเมลของผู้ติดต่อเปลี่ยน) — ไม่มีการเรียกผู้ให้บริการ ◂ */
export const CRM_EMAIL_RECIPIENT_CHANGED = "RECIPIENT_CHANGED";
/**
 * CRM C5.4-D2 r2 ▸ การส่งซ้ำที่ "ไม่ทำ" (ไม่เรียกผู้ให้บริการ · แถวคง FAILED พร้อมรหัสนี้ · สมุดตรวจหนึ่งบรรทัด) — จดหมายครั้งแรกอาจถึงลูกค้าแล้ว
 *   จึงไม่ส่งซ้ำแบบเสี่ยงซ้ำสองฉบับ และลำดับการติดตาม "ข้ามขั้นพร้อมเหตุผล" (ไม่นับเป็นครั้งที่ล้ม · ไม่หยุดการลงทะเบียนเป็น FAILED):
 *   · `NOT_REPRODUCIBLE` (S1c) — token/คำขอที่ประกอบซ้ำไม่ตรงของครั้งแรก (SESSION_SECRET/APP_URL ต่างกันระหว่างเครื่อง · หมุนกุญแจ · deploy เปลี่ยนเนื้อ)
 *   · `REDELIVERY_EXPIRED` (N1) — ครั้งแรกเกิน 24 ชม. แล้ว (ผู้ให้บริการจำกุญแจกันซ้ำไว้ 24 ชม. — เกินนั้นส่งซ้ำ = ลูกค้าได้สองฉบับ)
 *   · `FROM_DOMAIN_UNVERIFIED` (N3) — โดเมนผู้ส่งของครั้งแรกไม่ผ่านการยืนยันแล้ว (ไม่ใช่ "ระบบส่งของร้านล่ม" — ไม่แจ้งเตือนทั้งร้าน) ◂
 */
export const CRM_EMAIL_NOT_REPRODUCIBLE = "NOT_REPRODUCIBLE";
export const CRM_EMAIL_REDELIVERY_EXPIRED = "REDELIVERY_EXPIRED";
export const CRM_EMAIL_FROM_DOMAIN_UNVERIFIED = "FROM_DOMAIN_UNVERIFIED";
const REDELIVERY_REFUSALS = new Set<string>([CRM_EMAIL_NOT_REPRODUCIBLE, CRM_EMAIL_REDELIVERY_EXPIRED, CRM_EMAIL_FROM_DOMAIN_UNVERIFIED]);
/** รหัสที่ทำให้ลำดับการติดตาม "ข้ามขั้น" แทนการลองซ้ำ (รวม RECIPIENT_CHANGED ของ F6) */
export function isRedeliveryRefusal(code: string | null | undefined): boolean {
  const c = str(code);
  return c === CRM_EMAIL_RECIPIENT_CHANGED || REDELIVERY_REFUSALS.has(c);
}
/** CRM C5.4-D2 r2 ▸ N1: Resend เก็บกุญแจกันซ้ำไว้ 24 ชม. — ส่งซ้ำด้วยกุญแจเดิมได้ภายในช่วงนี้เท่านั้น (นับจากแถวถูกสร้าง = ครั้งแรก) ◂ */
const CRM_EMAIL_REDELIVERY_WINDOW_MS = 24 * 60 * 60_000;
/**
 * CRM C5.4-D2 r2 ▸ N1: ผู้ให้บริการ "ปฏิเสธแน่นอน" (ตอบก่อนรับจดหมาย — สิทธิ์/โดเมน/ถี่เกิน/รูปแบบผิด) ⇒ ครั้งนั้นไม่มีทางถูกรับ ·
 *   รหัสอื่น (เน็ตหลุด · 5xx · 409 · ค้างกลางทาง) = "อาจถูกรับแล้ว" ⇒ แถวถูกติดธง `routing.amb` (ไม่ล้างอีก) — เพดาน 24 ชม. ของการส่งซ้ำ
 *   ใช้กับแถวที่มีธงนี้ (หรือรหัสล่าสุดไม่ใช่การปฏิเสธแน่นอน) เท่านั้น: ร้านที่ระบบส่งล่มทั้งร้าน (401/403/429) ยังลองต่อได้จนเพดาน 72 ชม. เดิม ◂
 */
const DEFINITE_REJECTION = /^PROVIDER_(400|401|403|404|405|422|429)$/;
function isDefiniteRejection(code: string | null | undefined): boolean {
  return DEFINITE_REJECTION.test(str(code).toUpperCase());
}

/**
 * CRM C5.4-D2 r2 ▸ S1(b): คำขอที่ส่งถึงผู้ให้บริการ — ประกอบที่เดียว ทั้งตอนส่งจริง (`deliver`) และตอนคำนวณลายนิ้วมือ (สร้างแถว · ก่อนส่งซ้ำ)
 *   ลำดับช่อง/หัวจดหมายคงเดิมทุกไบต์ (เท่ากับที่ `deliver` ประกอบก่อนใบนี้) ◂
 */
type OutRequestArgs = {
  row: Pick<CrmEmailMessage, "toAddrs" | "ccAddrs" | "bccAddrs" | "subject" | "messageId">;
  fromAddr: string;
  fromName: string | null;
  replyTo: string;
  base: string;
  composed: ComposeOut;
  rfcId: string;
  references: string[];
  parentRfc: string | null;
  attachments: SendAttachmentInput[];
};
function outgoingRequest(a: OutRequestArgs): RichEmail {
  const headers: Record<string, string> = {
    "Message-ID": `<${a.rfcId}>`,
    "List-Unsubscribe": `<${a.base}/u/${a.composed.unsubToken}/one-click>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  if (a.parentRfc) headers["In-Reply-To"] = `<${a.parentRfc}>`;
  if (a.references.length) headers.References = a.references.map((r) => `<${r}>`).join(" ");
  return {
    from: a.fromAddr,
    ...(a.fromName ? { fromName: a.fromName } : {}),
    replyTo: a.replyTo,
    to: a.row.toAddrs,
    ...(a.row.ccAddrs.length ? { cc: a.row.ccAddrs } : {}),
    ...(a.row.bccAddrs.length ? { bcc: a.row.bccAddrs } : {}),
    subject: a.row.subject,
    html: a.composed.html,
    text: a.composed.text,
    headers,
    // AUDIT-CLASS X4/X5: กุญแจกันซ้ำ **ที่ฝั่งผู้ให้บริการ** (Resend `Idempotency-Key`) = `messageId` ของแถวนี้
    //   ⇒ เครื่องดับหลังผู้ให้บริการรับจดหมายไว้แล้วแต่ก่อนที่เราจะเขียน SENT · รอบ lease ถัดไปยิงซ้ำด้วยกุญแจเดิม
    //   ผู้ให้บริการคืนใบเดิม ไม่ส่งซ้ำถึงลูกค้า (ไม่มีกุญแจ = ลูกค้าได้จดหมายฉบับเดียวกันสองครั้ง)
    idempotencyKey: a.row.messageId,
    ...(a.attachments.length
      ? { attachments: a.attachments.map((x) => ({ filename: x.filename, content: x.data, contentType: x.contentType })) }
      : {}),
  };
}
/** ลายนิ้วมือของคำขอ (ไฟล์แนบ = ชื่อ · ชนิด · sha256 ของไบต์) — ไม่มีค่าลับในผล (token อยู่ใน html แต่ออกมาเป็นแฮช) */
function requestFingerprint(msg: RichEmail): string {
  const atts = (msg.attachments ?? []).map((x) => ({
    filename: x.filename,
    contentType: (x as { contentType?: string }).contentType ?? null,
    sha: createHash("sha256").update(typeof x.content === "string" ? x.content : Buffer.from(x.content)).digest("hex"),
  }));
  return sha256(JSON.stringify({ ...msg, attachments: atts }));
}

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

const REPLY_PARENT_NOT_FOUND =
  "ไม่พบจดหมายที่จะตอบกลับในเธรดของผู้ติดต่อรายนี้ (อาจเป็นจดหมายของลูกค้าคนอื่น อยู่คนละระบบ หรือบัญชีนี้ยังมองไม่เห็น) — เปิดเธรดของผู้ติดต่อรายนี้แล้วกดตอบจากในเธรดนั้น";

/**
 * R-E.11: "ตอบในเธรดที่ลูกค้าเริ่ม" = จดหมายอ้างอิงอยู่ในเธรดที่มีข้อความขาเข้าอยู่แล้ว
 *
 * 🔴 AUDIT-CLASS X1/X8 (รอบแก้ 25 ก.ย. 2569 · ผู้ตรวจอิสระ A1 = BLOCKER): ของเดิมรับ `replyToEmailId` **ตัวไหนก็ได้ในระบบ**
 *    แล้วดูแค่ว่า "เธรดนั้นมีข้อความขาเข้าไหม" ⇒ ใครก็หยิบ id ข้อความขาเข้าของลูกค้า **คนอื่น** มาแปะได้ ผลคือ
 *      (1) `transactional = true` ⇒ ข้ามด่านความยินยอมของลูกค้าที่กำลังจะถูกส่งถึง (คนที่กด "ขอไม่รับอีเมล" ได้จดหมายอยู่ดี)
 *      (2) `threadKey` ของจดหมายใหม่กลายเป็นเธรดของลูกค้าคนอื่น ⇒ จดหมายของลูกค้า A ไปโผล่ในเธรดของลูกค้า B
 *          (คนที่เห็นเธรด B อ่านเนื้อความที่เขียนถึง A ได้ทั้งฉบับ) และคำตอบของ B ก็ไหลกลับมาผิดคน
 *    ⇒ กติกาใหม่ (ทั้ง `emails.send` และ `emails.schedule` เดินทางนี้เส้นเดียวกัน):
 *      (ก) เธรดของจดหมายที่อ้างต้องเป็นเธรดของ **ผู้ติดต่อรายเดียวกันกับที่กำลังส่งถึง**
 *      (ข) บัญชี/คีย์ที่สั่งส่งต้อง **มองเห็นจดหมายฉบับนั้นจริง** (ด่านเดียวกับ `getThread` — `rowVisibleFilter`)
 *      ไม่ผ่านข้อใดข้อหนึ่ง = NOT_FOUND (404) **ไม่ใช่การเงียบ ๆ แล้วเปิดเธรดใหม่**: การกลืนเงียบทำให้ผู้เรียกเข้าใจว่า
 *      "ตอบในเธรดแล้ว" ทั้งที่ระบบเพิ่งเริ่มเธรดใหม่ (และความยินยอมถูกตัดสินคนละแบบกับที่เขาคิด)
 *      id ของ **อีกระบบ CRM** ก็ 404 ด้วยข้อความเดียวกัน (ไม่บอกว่ามีอยู่จริงที่อื่น)
 */
async function isTransactionalReply(
  ctx: EmailsCtx,
  actor: MemberActor | null,
  contact: CrmContact,
  replyToEmailId: string | null,
): Promise<{ transactional: boolean; parent: CrmEmailMessage | null }> {
  if (!replyToEmailId) return { transactional: false, parent: null };
  const parent = await prisma.crmEmailMessage.findFirst({ where: { id: replyToEmailId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!parent) throw fail("NOT_FOUND", REPLY_PARENT_NOT_FOUND);
  const thread = await prisma.crmEmailMessage.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, threadKey: parent.threadKey },
    select: { contactId: true, companyId: true, direction: true },
    take: 500,
  });
  // (ก) เธรดต้องเป็นของผู้ติดต่อรายนี้ (ฉบับที่อ้างเอง หรืออย่างน้อยฉบับใดฉบับหนึ่งในเธรดเดียวกัน)
  if (parent.contactId !== contact.id && !thread.some((r) => r.contactId === contact.id)) throw fail("NOT_FOUND", REPLY_PARENT_NOT_FOUND);
  // (ข) ต้องมองเห็นจดหมายฉบับนั้นจริง (คีย์ที่ถูกกรองด้วยเจ้าของ/ทีม · พนักงานที่เห็นแค่ของตัวเอง)
  if (actor) {
    const visible = await rowVisibleFilter(ctx, actor, [parent]);
    if (!visible(parent)) throw fail("NOT_FOUND", REPLY_PARENT_NOT_FOUND);
  }
  return { transactional: thread.some((r) => r.direction === "IN"), parent };
}

/** ค่าตัวแปร `{{contact.*}}` ของผู้ติดต่อ — ชุดเดียวกันทั้งแม่แบบ (templateId) และข้อความที่ส่งจากช่องเขียนจดหมาย (C5.4-E ▸ E2) */
function contactMergeVars(contact: CrmContact): Record<string, string> {
  return {
    "contact.firstName": contact.firstName?.trim() || contact.name?.trim() || "ลูกค้า",
    "contact.lastName": contact.lastName?.trim() ?? "",
    "contact.name": contact.name?.trim() || "ลูกค้า",
    "contact.companyName": contact.company?.trim() ?? "",
  };
}
const HAS_MUSTACHE = /\{\{\s*[\w.]+\s*\}\}/;

async function renderTemplate(
  ctx: EmailsCtx,
  templateId: string,
  contact: CrmContact,
  vars: Record<string, string> | undefined,
): Promise<{ subject: string; bodyHtml: string }> {
  const tpl = await prisma.crmEmailTemplate.findFirst({ where: { id: templateId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!tpl) throw fail("NOT_FOUND", TEMPLATE_NOT_FOUND);
  // AUDIT-CLASS X6: ค่าที่หยอดเข้าไปถูก escape ครั้งเดียว ⇒ `<img onerror=…>` ในค่าตัวแปรกลายเป็นข้อความ
  const merged: Record<string, string> = contactMergeVars(contact);
  for (const [k, v] of Object.entries(vars ?? {})) merged[k] = String(v ?? "");
  const escaped: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) escaped[k] = escapeHtmlText(v);
  // CRM C3.4 ▸ `{{kb:<articleId>}}` → บทความที่เปิดใช้ของร้านนี้ (escape แล้ว · ไม่พบ/ร้านอื่น = "") — แทน **ก่อน** ตัวแปร
  //   (รีวิว C3.4 N2: ถ้าแทนทีหลัง ผู้ติดต่อที่ตั้งชื่อว่า `{{kb:<id>}}` จะดึงบทความเข้าจดหมายได้ · แทนก่อน = token มาจากแม่แบบของร้านเท่านั้น
  //   ค่าตัวแปรที่หยอดทีหลังไม่ถูกสแกนหา token อีก) ◂
  const bodyWithKb = await renderKbTokens({ tenantId: ctx.tenantId }, tpl.bodyHtml);
  return { subject: renderEmailVars(tpl.subject, merged), bodyHtml: renderEmailVars(bodyWithKb, escaped) };
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
    const found = await countVisibleCompany(ctx, actor, companyId as string);
    if (found === 0) throw fail("NOT_FOUND", "ไม่พบบริษัทนี้ในระบบ CRM นี้ หรือบัญชีนี้ยังมองไม่เห็นบริษัทนี้ — เลือกบริษัทใหม่แล้วลองอีกครั้ง");
  }

  // ── ตรวจก่อนแตะอะไรทั้งนั้น (AUDIT-CLASS X6) ──
  const templateId = strOrNull(input?.templateId);
  const rendered = templateId ? await renderTemplate(ctx, templateId, contact, input?.vars) : null;
  // CRM C5.4-E ▸ E2: ช่องเขียนจดหมายส่ง "ข้อความ" ของแม่แบบที่เลือก (ไม่ส่ง templateId) ⇒ เดิม `{{contact.firstName}}` ออกไปถึงลูกค้าตรงตัว ·
  //   ตอนนี้ข้อความล้วนที่ไม่มีค่าตัวแปรมาด้วย (`bodyVars`) ใช้ค่าชุดเดียวกับแม่แบบ — เนื้อความแทน **หลัง** ทำลิงก์ (escape · ไม่มีทางเป็นลิงก์
  //   กติกาเดียวกับลำดับการติดตาม) · หัวข้อแทนเป็นข้อความ · ไม่มี `{{…}}` = ผลเดิมทุกไบต์ ◂
  const composerVars = !rendered && !str(input?.bodyHtml) && typeof input?.bodyText === "string" && !input?.bodyVars ? contactMergeVars(contact) : null;
  const subjectIn = composerVars && typeof input?.subject === "string" && HAS_MUSTACHE.test(input.subject) ? renderEmailVars(input.subject, composerVars) : input?.subject;
  const subject = cleanSubject(rendered ? rendered.subject : subjectIn);
  // CRM C4.4-fix2 ▸ J1: ข้อความล้วน (ไม่มีแม่แบบ/ไม่มี HTML) → HTML ด้วยตัวแปลงกลางตัวเดียว — ผลเป็น "ข้อความที่ escape แล้ว + ลิงก์ http(s)
  //   ของผู้เขียน" โดยโครงสร้าง ⇒ **ไม่** ส่งเข้า `sanitizeHtml` ซ้ำ: ตัวตัดกลาง escape `&` ใน href อีกชั้น (`&amp;` → `&amp;amp;` = ลิงก์เสีย)
  //   รอบแก้ 2 (รีวิว SF-1): ตรวจเพดานขนาด **ก่อน** แปลง (ข้อความเดียวกันทุกทาง) · (รีวิว BL-1): ค่าตัวแปรของกฎ/ลำดับติดตาม
  //   (`bodyVars`) แทน **หลัง** ทำลิงก์ — escape เป็นข้อความ ไม่มีทางเป็นลิงก์นับคลิก ◂
  const plainText = !rendered && !str(input?.bodyHtml) && typeof input?.bodyText === "string" ? input.bodyText : null;
  if (plainText !== null && crmEmailBodyTooLong(plainText)) throw fail("VALIDATION", CRM_EMAIL_BODY_TOO_LONG_MSG);
  const textVars: CrmTextPlaceholders | null = input?.bodyVars ?? (composerVars && plainText !== null && HAS_MUSTACHE.test(plainText) ? { syntax: "mustache", values: composerVars } : null);
  const rawBody = rendered ? rendered.bodyHtml : plainText !== null ? crmPlainTextToEmailHtml(plainText, textVars) : str(input?.bodyHtml);
  if (Buffer.byteLength(rawBody, "utf8") > CRM_EMAIL_BODY_MAX_BYTES) {
    throw fail("VALIDATION", CRM_EMAIL_BODY_TOO_LONG_MSG);
  }
  const storedHtml = plainText !== null ? rawBody : sanitizeHtml(rawBody, { allowLinkSchemes: ["http", "https", "mailto", "tel"] });
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
  const { transactional, parent } = await isTransactionalReply(ctx, actor, contact, replyToEmailId);
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
  // CRM C5.4-D r3 ▸ R2-N2 (มติผู้คุมงาน): กุญแจของ "ระบบ" (ส่งแทนระบบ · actor ว่าง — ลำดับการติดตาม) กับของผู้เรียก REST/หน้าจอ อยู่คนละ
  //   namespace — คำนำหน้าของ Message-ID ต่างกัน (`sk-` / `ik-`) ⇒ สตริงกุญแจใด ๆ ที่ผู้ถือคีย์ส่งมา (เช่น "seq:<enrollment>:v1:0")
  //   ไม่มีทางได้ Message-ID ของขั้นในลำดับ และกลับกัน · กุญแจของผู้เรียก REST/หน้าจอคงค่าแฮชเดิมทุกไบต์ (ไม่กระทบคำขอที่ลองซ้ำข้าม deploy) ◂
  const rfcId = idem ? `${actor ? "ik" : "sk"}-${sha256(`${ctx.systemId}:${idem}`).slice(0, 40)}@${CRM_EMAIL_SHARK_DOMAIN}` : newRfcId();
  const emailId = randomUUID().replace(/-/g, "");
  const messageId = scopedMessageId(ctx.systemId, rfcId);
  const references = parent ? uniq([...(parent.references ?? []), rfcIdOf(parent.messageId)]) : [];

  const stored = await storeAttachments(ctx.tenantId, atts.map((a) => ({ filename: a.filename, contentType: a.contentType, data: a.data })), deps);

  const trackOpens = settings.trackOpens === true && !contact.trackingOptOut && !contact.emailOptOut;
  const trackClicks = settings.trackClicks === true && !contact.trackingOptOut && !contact.emailOptOut;
  const sendBase = appUrl(); // CRM C5.4-D2 r2 ▸ S1(b) ◂
  const composed = queued ? null : composeOutgoing({ emailId, storedHtml, trackOpens, trackClicks, base: sendBase });
  // CRM C5.4-D2 r2 ▸ S1(b): ค่าที่ส่งจริงของครั้งแรก (หัว Reply-To · ที่อยู่เว็บ · ลายนิ้วมือของคำขอทั้งฉบับ) เก็บพร้อมแถว ⇒ การส่งซ้ำใช้ของเดิม
  //   และรู้ได้ก่อนเรียกผู้ให้บริการว่าประกอบซ้ำได้เหมือนเดิมหรือไม่ (จดหมายตั้งเวลา = ยังไม่มี — ประกอบตอนส่ง และไม่เข้าเส้นส่งซ้ำ) ◂
  const firstReplyTo = replyToHeader(routing, inboundKey, threadKey);
  const firstFp = composed
    ? requestFingerprint(outgoingRequest({
        row: { toAddrs: toList, ccAddrs: ccList, bccAddrs: uniq([...bccList, ...routing.copyTo]), subject, messageId },
        fromAddr: routing.fromAddr,
        fromName: routing.fromName,
        replyTo: firstReplyTo,
        base: sendBase,
        composed,
        rfcId,
        references,
        parentRfc: parent ? rfcIdOf(parent.messageId) : null,
        attachments: atts,
      }))
    : null;

  const routingJson: RoutingJson = {
    via: routing.via,
    fromName: routing.fromName,
    fromAddr: routing.fromAddr,
    replyTo: routing.replyTo,
    copyTo: routing.copyTo,
    ...(composed ? { links: composed.links, unsub: composed.unsubHash } : {}),
    trk: { o: trackOpens, c: trackClicks }, // CRM C5.4-D2 ▸ F1 ◂
    ...(composed && firstFp ? { rt: firstReplyTo, base: sendBase, fp: firstFp } : {}), // CRM C5.4-D2 r2 ▸ S1(b) ◂
  };

  let row: CrmEmailMessage;
  try {
    // CRM C3.9 ▸ AUDIT-CLASS X3: เพดานอีเมลต่อวันของระบบ (§11.9 · 2,000/วันไทย) — ล็อก + นับ + insert ใน tx เดียว ◂
    row = await prisma.$transaction(async (tx) => {
      await assertCrmLimit(ctx, "emailsPerDay", 1, tx);
      return tx.crmEmailMessage.create({
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
    });
  } catch (e) {
    // 🔴 แถวนี้แพ้การแข่ง (หรือเขียนไม่สำเร็จ) ⇒ ไฟล์ที่เพิ่งอัปขึ้นที่เก็บเมื่อครู่ไม่มีใครอ้างถึงอีกเลย
    //    ปล่อยไว้ = ไฟล์กำพร้าที่ยังเปิดได้ด้วยลิงก์ส่วนตัว และไม่มีวันถูกล้างโดยงานตามอายุการเก็บ
    //    (ล้างของตัวเองก่อนเสมอ ไม่ว่าจะจบด้วย "ใช้ใบเดิม" หรือโยน error ต่อ)
    for (const a of stored) {
      await deleteFileAsset({ tenantId: ctx.tenantId }, a.fileId, deps?.del ? { del: deps.del } : undefined).catch(() => null);
    }
    // CRM C3.9 ▸ ส่งซ้ำด้วยกุญแจเดิมตอนเต็มเพดาน = ได้ฉบับเดิมคืน (ไม่ใช่ LIMIT) ◂
    if (idem && (isUniqueViolation(e) || e instanceof CrmLimitError)) {
      const prior = await prisma.crmEmailMessage.findFirst({ where: { messageId } });
      // CRM C5.4-D r3 ▸ R2-N1b (มติผู้คุมงาน): ทางระบบ (`redeliverFailed`) กับเพดานต่อวันที่เต็ม = "รอ" เสมอ — ไม่เข้าเส้นส่งซ้ำ/ส่ง ·
      //   ฉบับเดิมที่ส่งไปแล้ว (SENT…) คืนได้ตามเดิม (ไม่ใช่การส่ง) · นอกนั้นโยน CrmLimitError ให้ผู้เรียกเลื่อนไปวันไทยถัดไป ◂
      if (input?.redeliverFailed === true && e instanceof CrmLimitError && (!prior || prior.status === "FAILED" || prior.status === "QUEUED")) throw e;
      // CRM C5.4-D r3 ▸ R2-N3: ทางระบบ + แถวเดิมยัง QUEUED (การส่งก่อนหน้าตายกลางทาง/ยังวิ่งอยู่) = "กำลังส่ง" ไม่ใช่ "ส่งแล้ว" — คืนเวลา lease
      //   ให้ผู้เรียกรอ (ตัวเก็บซากของ runScheduled ปิดเป็น FAILED เมื่อหมด lease แล้วรอบถัดไปค่อยส่งซ้ำแถวเดิม) ◂
      if (prior && input?.redeliverFailed === true && prior.status === "QUEUED" && !prior.scheduledAt) {
        return { emailId: prior.id, messageId: prior.messageId, threadKey: prior.threadKey, status: "QUEUED", reused: true, inFlightUntil: prior.leaseUntil ?? null };
      }
      // CRM C5.4-D r2 ▸ N1b: ทางระบบที่ขอ `redeliverFailed` + แถวเดิมของกุญแจนี้ "ล้ม" + ผู้ติดต่อเดียวกัน + ไม่มีไฟล์แนบ + ไม่ใช่จดหมายตั้งเวลา
      //   ⇒ จองแถวเดิมกลับเป็น QUEUED แบบมีเงื่อนไข (FAILED → QUEUED + lease · สองตัวลองพร้อมกันได้คนเดียว) แล้วส่งแถวเดิมอีกครั้ง
      //   Message-ID เดิม = Resend Idempotency-Key เดิม ⇒ ถ้าครั้งก่อนผู้ให้บริการรับไปแล้วจริง (เน็ตหลุดหลังรับ) ลูกค้าไม่ได้ฉบับที่สอง
      //   ความยินยอม/ผู้รับถูกตรวจใหม่แล้วด้านบน (ตอนส่งซ้ำ) · เนื้อความ/ผู้รับ/หัวเรื่องใช้ของแถวเดิม (ฉบับเดียวกัน) ◂
      // CRM C5.4-D2 ▸ F1/F3 (รีวิว C5.4-D รอบ 3 · แทนทาง R2-S2 เดิม): token ของแถวคำนวณซ้ำได้ (HMAC — ดู `newToken`) และการส่งซ้ำประกอบจดหมาย
      //   ด้วยค่าของครั้งแรก (ผู้ส่ง · ที่อยู่รับคำตอบ · ค่าติดตาม `routing.trk`) ⇒ คำขอถึงผู้ให้บริการเหมือนครั้งแรกทุกไบต์ ⇒ Resend คืนคำตอบเดิม
      //   ของกุญแจนี้ (ครั้งก่อนถูกรับ = 200 พร้อม id เดิม · ครั้งก่อนล้มแล้วผู้ให้บริการเก็บคำตอบผิดไว้ = ได้คำตอบผิดนั้น) · ไม่มีการตีความ 409
      //   ว่า "ส่งแล้ว" อีกต่อไป (409 = ล้มชั่วคราวธรรมดา) และไม่มีการสลับค่าแฮชของครั้งก่อน — ทุกครั้งเขียนค่าเดียวกัน ◂
      // CRM C5.4-D2 ▸ F6 (R2-N1a): ผู้รับของแถวเดิมไม่ใช่ผู้รับของคำขอนี้ (พนักงานแก้อีเมลของผู้ติดต่อระหว่างรอ) ⇒ ไม่ส่งซ้ำไปที่อยู่เดิม ·
      //   คืน FAILED รหัส `RECIPIENT_CHANGED` โดยไม่เรียกผู้ให้บริการ (แถวเดิมคง FAILED) — ลำดับการติดตามข้ามขั้นนี้พร้อมเหตุผล ◂
      if (prior && input?.redeliverFailed === true && isUniqueViolation(e) && !queued && prior.status === "FAILED" && prior.direction === "OUT" && prior.contactId === contact.id && !prior.attachments && !!prior.bodyHtml) {
        const priorTo = uniq(prior.toAddrs.map((a) => bareEmail(a)));
        if (priorTo.length !== toList.length || priorTo.some((a) => !toList.includes(a))) {
          await auditEmail(ctx, "crm.email.send", prior.id, { after: { contactId: contact.id, redelivery: true, status: "FAILED", skipped: CRM_EMAIL_RECIPIENT_CHANGED } });
          return { emailId: prior.id, messageId: prior.messageId, threadKey: prior.threadKey, status: "FAILED", reused: true, failCode: CRM_EMAIL_RECIPIENT_CHANGED };
        }
        // CRM C5.4-D2 r2 ▸ การส่งซ้ำที่ "ไม่ทำ" — ไม่เรียกผู้ให้บริการ · แถวคง FAILED พร้อมรหัส (ครั้งต่อไปของกุญแจนี้ได้รหัสเดิมทันที) · สมุดตรวจหนึ่งบรรทัด ◂
        const refuse = async (code: string, detail: Record<string, unknown> = {}): Promise<SendResult> => {
          const n = await prisma.crmEmailMessage.updateMany({ where: { id: prior.id, status: "FAILED" }, data: { providerError: code } });
          if (n.count === 1) await auditEmail(ctx, "crm.email.send", prior.id, { after: { contactId: contact.id, redelivery: true, status: "FAILED", refused: code, ...detail } });
          return { emailId: prior.id, messageId: prior.messageId, threadKey: prior.threadKey, status: "FAILED", reused: true, failCode: code };
        };
        if (REDELIVERY_REFUSALS.has(str(prior.providerError))) {
          return { emailId: prior.id, messageId: prior.messageId, threadKey: prior.threadKey, status: "FAILED", reused: true, failCode: str(prior.providerError) };
        }
        // CRM C5.4-D2 r2 ▸ N1 (รีวิว D2 N1): ผู้ให้บริการยืนยันครั้งก่อนแล้ว (webhook `email.sent`/`delivered` เติม providerId ให้แถวที่ล้มผ่าน Message-ID ·
        //   F2) ⇒ ครั้งก่อนถึงผู้ให้บริการจริง — ปิดแถวเป็น SENT ด้วยรหัสนั้น **ไม่เรียกผู้ให้บริการอีก** · ค่าแฮช token ของแถวไม่ถูกแตะ ◂
        if (prior.providerId) {
          const claimedSent = await prisma.crmEmailMessage.updateMany({
            where: { id: prior.id, status: "FAILED", providerId: prior.providerId },
            data: { status: "QUEUED", leaseUntil: new Date(now.getTime() + CRM_EMAIL_LEASE_MS) },
          });
          if (claimedSent.count === 1) {
            const ok = await finalizeSent(ctx, { ...prior, status: "QUEUED" }, prior.providerId, now, null);
            await auditEmail(ctx, "crm.email.send", prior.id, { after: { contactId: contact.id, redelivery: true, status: ok ? "SENT" : "FAILED", confirmedBy: "provider_webhook" } });
            return { emailId: prior.id, messageId: prior.messageId, threadKey: prior.threadKey, status: ok ? "SENT" : "FAILED", reused: true };
          }
        }
        // CRM C5.4-D2 r2 ▸ N1: ผู้ให้บริการจำกุญแจกันซ้ำไว้ 24 ชม. — เกินนั้นการส่งซ้ำของจดหมายที่อาจถูกรับไปแล้ว = ลูกค้าได้สองฉบับ ⇒ ไม่ส่ง (ปลายทาง) ◂
        const prevRouting = isObj(prior.routing) ? (prior.routing as RoutingJson & Record<string, unknown>) : null;
        const maybeAccepted = prevRouting?.amb === true || !isDefiniteRejection(prior.providerError);
        if (maybeAccepted && now.getTime() - prior.createdAt.getTime() >= CRM_EMAIL_REDELIVERY_WINDOW_MS) {
          return refuse(CRM_EMAIL_REDELIVERY_EXPIRED, { firstAttemptAt: prior.createdAt.toISOString() });
        }
        // CRM C5.4-D2 r2 ▸ N3 (รีวิว D2 N3): ผู้ส่งของครั้งแรกเป็นโดเมนของร้านที่ไม่ผ่านการยืนยันแล้ว ⇒ ผู้ให้บริการจะตอบ 403 (= ถูกจัดเป็น "ระบบส่งของร้าน
        //   ล่ม" แจ้งเตือนทั้งร้าน + ลองซ้ำ 72 ชม.) — ตัดสินที่นี่แทน: แถวนี้ล้มด้วยเหตุของมันเอง ไม่เรียกผู้ให้บริการ ◂
        const firstFrom = bareEmail(prevRouting?.fromAddr ?? prior.fromAddr);
        const firstDomain = emailDomainOf(firstFrom);
        if (firstDomain && firstDomain !== CRM_EMAIL_SHARK_DOMAIN.toLowerCase() && !(await verifiedDomains(ctx.tenantId)).has(firstDomain)) {
          return refuse(CRM_EMAIL_FROM_DOMAIN_UNVERIFIED, { fromDomain: firstDomain });
        }
        const trk = prevRouting && isObj(prevRouting.trk) ? { o: prevRouting.trk.o === true, c: prevRouting.trk.c === true } : { o: trackOpens, c: trackClicks };
        const firstRouting: CrmEmailRoutingView = prevRouting && str(prevRouting.fromAddr) && str(prevRouting.replyTo)
          ? { ...routing, fromAddr: str(prevRouting.fromAddr), fromName: strOrNull(prevRouting.fromName), replyTo: str(prevRouting.replyTo) }
          : routing;
        // CRM C5.4-D2 r2 ▸ S1(b): ที่อยู่เว็บ + หัว Reply-To ของครั้งแรก (ไม่ใช่ค่าปัจจุบัน — APP_URL/กุญแจกล่องเข้าอาจเปลี่ยน) ◂
        const firstBase = str(prevRouting?.base) || appUrl();
        const firstReplyTo = str(prevRouting?.rt) || replyToHeader(firstRouting, inboundKey, prior.threadKey);
        const again = composeOutgoing({ emailId: prior.id, storedHtml: prior.bodyHtml ?? "", trackOpens: trk.o, trackClicks: trk.c, base: firstBase });
        const priorRfc = rfcIdOf(prior.messageId);
        const reqArgs: OutRequestArgs = {
          row: prior,
          fromAddr: firstRouting.fromAddr,
          fromName: firstRouting.fromName,
          replyTo: firstReplyTo,
          base: firstBase,
          composed: again,
          rfcId: priorRfc,
          references: prior.references ?? [],
          parentRfc: prior.inReplyTo ?? null,
          attachments: [],
        };
        // CRM C5.4-D2 r2 ▸ S1(c) (รีวิว D2-S1): ประกอบซ้ำได้ไม่ตรงของครั้งแรก (token ⇒ SESSION_SECRET/APP_URL ต่างกันระหว่างเครื่องหรือถูกหมุน ·
        //   ลายนิ้วมือคำขอ ⇒ deploy เปลี่ยนเนื้อ/หัวจดหมาย) ⇒ ส่งซ้ำใต้กุญแจเดิมไม่ได้ (ผู้ให้บริการตอบ 409 · หรือรับไปเป็นฉบับที่สองหลัง 24 ชม.)
        //   และห้ามแตะค่าแฮชของจดหมายที่ลูกค้าอาจถืออยู่ ⇒ ไม่ส่ง · รหัส NOT_REPRODUCIBLE · เตือนฝั่งปฏิบัติการ (ค่าตั้งของเครื่องไม่ตรงกัน) ◂
        const storedLinks = prevRouting && Array.isArray(prevRouting.links) ? prevRouting.links : null;
        const sameTokens = again.openHash === prior.trackTokenHash
          && (!prevRouting || typeof prevRouting.unsub !== "string" || prevRouting.unsub === again.unsubHash)
          && (!storedLinks || JSON.stringify(storedLinks) === JSON.stringify(again.links));
        const storedFp = str(prevRouting?.fp);
        const sameRequest = !storedFp || storedFp === requestFingerprint(outgoingRequest(reqArgs));
        if (!sameTokens || !sameRequest) {
          await logOps("WARN", "crm.email.send", "ส่งอีเมลซ้ำไม่ได้ — ประกอบจดหมายเดิมซ้ำไม่ตรงของครั้งแรก (ตรวจ SESSION_SECRET / APP_URL ให้ตรงกันทุกเครื่องที่รันงาน CRM)", {
            tenantId: ctx.tenantId,
            detail: `email=${prior.id} tokens=${sameTokens ? "same" : "differ"} request=${sameRequest ? "same" : "differ"}`,
          }).catch(() => {});
          return refuse(CRM_EMAIL_NOT_REPRODUCIBLE, { tokens: sameTokens ? "same" : "differ", request: sameRequest ? "same" : "differ" });
        }
        // CRM C5.4-D2 r2 ▸ S1(a): การจองเขียนแค่สถานะ + lease — ค่าแฮช token เขียนเฉพาะในธุรกรรม SENT (`deliver`) ⇒ การส่งซ้ำที่ล้มไม่แตะลิงก์ของ
        //   จดหมายที่ลูกค้าถืออยู่ (ยกเลิกรับคลิกเดียวรวมอยู่ด้วย) ◂
        const claimed = await prisma.crmEmailMessage.updateMany({
          where: { id: prior.id, status: "FAILED", providerId: null },
          data: { status: "QUEUED", providerError: null, leaseUntil: new Date(now.getTime() + CRM_EMAIL_LEASE_MS) },
        });
        if (claimed.count === 1) {
          const result = await deliver(ctx, { ...prior, status: "QUEUED" }, {
            composed: again,
            routing: firstRouting,
            inboundKey,
            replyTo: firstReplyTo,
            base: firstBase,
            rfcId: priorRfc, // = rfcId: same key ⇒ same deterministic id
            references: prior.references ?? [],
            parentRfc: prior.inReplyTo ?? null,
            attachments: [],
            deps,
            now,
          });
          await auditEmail(ctx, "crm.email.send", prior.id, { after: { contactId: contact.id, redelivery: true, status: result } });
          const f = result === "FAILED" ? await prisma.crmEmailMessage.findUnique({ where: { id: prior.id }, select: { providerError: true } }) : null;
          return { emailId: prior.id, messageId: prior.messageId, threadKey: prior.threadKey, status: result, reused: true, ...(f ? { failCode: f.providerError } : {}) };
        }
      }
      if (prior) {
        return { emailId: prior.id, messageId: prior.messageId, threadKey: prior.threadKey, status: statusOf(prior.status), reused: true, ...(statusOf(prior.status) === "FAILED" ? { failCode: prior.providerError } : {}) };
      }
      if (e instanceof CrmLimitError) throw e;
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
    replyTo: firstReplyTo,
    base: sendBase,
    rfcId,
    references,
    parentRfc: parent ? rfcIdOf(parent.messageId) : null,
    attachments: atts,
    deps,
    now,
  });
  if (result === "FAILED") {
    // C4.3-fix: หน้าจอเคยขึ้น "ส่งจดหมายแล้ว" ทั้งที่ส่งไม่สำเร็จ ⇒ คืนรหัสเหตุ (อ่านจากแถวที่ deliver เพิ่งเขียน)
    const f = await prisma.crmEmailMessage.findUnique({ where: { id: row.id }, select: { providerError: true } });
    return { emailId: row.id, messageId: row.messageId, threadKey: row.threadKey, status: result, failCode: f?.providerError ?? null };
  }
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
    /** CRM C5.4-D2 r2 ▸ S1(b): หัว Reply-To / ที่อยู่เว็บที่ใช้ (ครั้งแรก = ค่าที่เพิ่งเก็บลงแถว · ส่งซ้ำ = ของครั้งแรก) — ไม่ระบุ = คำนวณจากค่าปัจจุบัน (เดิม) ◂ */
    replyTo?: string;
    base?: string;
    rfcId: string;
    references: string[];
    parentRfc: string | null;
    attachments: SendAttachmentInput[];
    deps?: EmailDeps;
    now: Date;
  },
): Promise<"SENT" | "FAILED"> {
  const transport = await transportOf(args.deps);
  let res: RichEmailResult;
  try {
    res = await transport(outgoingRequest({
      row,
      fromAddr: args.routing.fromAddr,
      fromName: args.routing.fromName,
      replyTo: args.replyTo ?? replyToHeader(args.routing, args.inboundKey, row.threadKey),
      base: args.base ?? appUrl(),
      composed: args.composed,
      rfcId: args.rfcId,
      references: args.references,
      parentRfc: args.parentRfc,
      attachments: args.attachments,
    }));
  } catch {
    res = { ok: false, error: "TRANSPORT_ERROR" };
  }

  // CRM C5.4-D2 ▸ F1/F3: ไม่มีการตีความ 409 ว่า "ส่งแล้ว" (ทาง R2-S2 เดิมถูกถอด) — การส่งซ้ำของแถวเดียวกันเป็นคำขอเดิมทุกไบต์ ผู้ให้บริการ
  //   คืนคำตอบของกุญแจนี้เอง (200 + id เดิม เมื่อครั้งก่อนถูกรับ) · 409 (ส่งพร้อมกัน/เนื้อความเพี้ยน) = ล้มชั่วคราวธรรมดา ลองใหม่ตามรอบพัก ◂
  if (!res.ok) {
    // AUDIT-CLASS X8: เก็บเฉพาะรหัสความล้มเหลว — ไม่มีที่อยู่ผู้รับในคอลัมน์ที่ใครก็อ่านได้
    // CRM C5.4-D2 r2 ▸ S1(a): เส้นล้มไม่แตะค่าแฮช token (ของจดหมายที่ลูกค้าอาจถืออยู่) ◂
    // CRM C5.4-D2 r2 ▸ N1: ความล้มที่ "อาจถูกรับแล้ว" ติดธง `routing.amb` ในคำสั่งเดียวกัน (ค่าแฮช/ลิงก์ในก้อน routing คงค่าเดิมของแถว) ◂
    const failCode = str(res.error).slice(0, 200) || "SEND_FAILED";
    const ambRouting = isDefiniteRejection(failCode) ? {} : { routing: { ...(isObj(row.routing) ? row.routing : {}), amb: true } as unknown as Prisma.InputJsonValue };
    await prisma.crmEmailMessage.updateMany({ where: { id: row.id, status: "QUEUED" }, data: { status: "FAILED", providerError: failCode, leaseUntil: null, ...ambRouting } });
    // CRM C5.4-E ▸ E3: ล้มแบบทั้งร้าน (401/403/429) ⇒ บอกเจ้าของร้าน/ผู้จัดการในแอป วันละครั้งต่อร้าน · ล้ม = ไม่กระทบผลของการส่ง ◂
    if (isOutageSendFailure(res.error)) await (await import("./notify-senders")).noticeEmailOutage({ tenantId: ctx.tenantId, systemId: ctx.systemId }, str(res.error), args.now).catch(() => false);
    return "FAILED";
  }
  await finalizeSent(ctx, row, strOrNull(res.providerId), args.now, {
    trackTokenHash: args.composed.openHash,
    routing: {
      ...(isObj(row.routing) ? row.routing : {}),
      links: args.composed.links,
      unsub: args.composed.unsubHash,
    } as unknown as Prisma.InputJsonValue,
  });
  return "SENT";
}

/**
 * ปิดแถวเป็น SENT + กิจกรรม + event ในธุรกรรมเดียว (เงื่อนไข QUEUED — แพ้การแข่ง = ไม่เขียนอะไร)
 * CRM C5.4-D2 r2 ▸ แยกออกจาก `deliver` — `hashes` = ค่าแฮช token ของจดหมายที่ผู้ให้บริการเพิ่งรับ (S1a: เขียนที่นี่ที่เดียว) ·
 *   `null` = ไม่แตะ (N1: ผู้ให้บริการยืนยันครั้งก่อนผ่าน webhook — ค่าที่เก็บไว้คือของจดหมายฉบับนั้นอยู่แล้ว) ◂
 */
async function finalizeSent(
  ctx: EmailsCtx,
  row: CrmEmailMessage,
  providerId: string | null,
  now: Date,
  hashes: { trackTokenHash: string; routing: Prisma.InputJsonValue } | null,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const n = await tx.crmEmailMessage.updateMany({
      where: { id: row.id, status: "QUEUED" },
      data: {
        status: "SENT",
        providerId,
        providerError: null,
        sentAt: now,
        leaseUntil: null,
        ...(hashes ?? {}),
      },
    });
    if (n.count !== 1) return false;
    await activities.recordSystemActivityInTx(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId }, {
      type: "EMAIL",
      source: "EMAIL",
      direction: "OUT",
      sourceRef: row.id,
      title: row.subject.slice(0, 200),
      contactId: row.contactId,
      companyId: row.companyId,
      dealId: row.dealId,
      at: now,
    });
    await emitEmailEvent(tx, ctx, EVT.sent, row, `${row.id}`);
    return true;
  });
}

/** AUDIT-CLASS X8: payload id ล้วน · key `crm.email.<type>#<emailId>#<seq>` (R-C.8) */
async function emitEmailEvent(
  tx: Tx,
  ctx: { tenantId: string; systemId: string },
  type: string,
  row: Pick<CrmEmailMessage, "id" | "contactId" | "dealId" | "companyId" | "threadKey" | "sequenceStepId">,
  seq: string,
  opts: { unverifiedFrom?: boolean } = {},
): Promise<void> {
  // CRM C5.5-fix2 ▸ hunter 2a-2: จดหมายที่ From ยังไม่ได้พิสูจน์ (ไม่มี A-R ของ MTA เรา) ⇒ event บอกแค่ "มีจดหมายเข้า" —
  //   ไม่ระบุผู้ติดต่อ/บริษัท/ดีล (คะแนน · กฎ · webhook จึงไม่นับเป็น "ลูกค้าคนนี้ตอบ") + ธง `unverifiedFrom` ◂
  const anon = opts.unverifiedFrom === true;
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    type,
    idempotencyKey: `${type}#${row.id}#${seq}`,
    payload: {
      emailId: row.id,
      ...(row.contactId && !anon ? { contactId: row.contactId } : {}),
      ...(row.dealId && !anon ? { dealId: row.dealId } : {}),
      ...(row.companyId && !anon ? { companyId: row.companyId } : {}),
      threadKey: row.threadKey,
      ...(row.sequenceStepId ? { sequenceStepId: row.sequenceStepId } : {}),
      ...(anon ? { unverifiedFrom: true } : {}),
    },
  });
}

export async function sendEmail(ctx: EmailsCtx, actor: MemberActor, input: SendInput, deps?: EmailDeps): Promise<SendResult> {
  return sendCore(ctx, actor, input, deps);
}

// CRM C2.11 ▸ ส่งถึงหลายคนในคำสั่งเดียว = "ประตูของตัวเอง" (มติผู้คุมงาน ORACLE-EDIT 24 ก.ย. 2569)
//   🔴 ทำไมไม่เป็นธงบน `sendEmail`: op เดียวที่ "บางครั้งต้องยืนยัน" ทำให้ผู้เชื่อมต่อเดาไม่ถูกว่าเมื่อไหร่ต้องส่ง confirm
//      ⇒ `sendEmail` รับผู้รับ **คนเดียว** ตลอดกาล · การยิงเป็นกลุ่มมาทางนี้ซึ่งเป็นการกระทำอันตราย (ยืนยัน + เหตุผล)
//   🔴 ไม่มีเอนจินที่สอง: วนเรียก `sendCore` ทีละคน ⇒ กติกาความยินยอม (`canContact`) · การมองเห็นผู้ติดต่อ ·
//      ผู้รับต้องเป็นอีเมลของผู้ติดต่อรายนั้น · ตัวกันซ้ำระดับจดหมาย (Message-ID) เหมือนการส่งทีละฉบับเป๊ะ ๆ
//   🔴 กุญแจกันซ้ำต่อคน = `<กุญแจของคำขอ>:<contactId>` ⇒ ยิงคำสั่งเดิมซ้ำ (เน็ตหลุด) ไม่ทำให้ลูกค้าได้จดหมายสองฉบับ
export const CRM_EMAIL_BULK_MAX = CRM_HARD_CAPS.emailBulk; // CRM C3.9 ▸ เพดานตายตัวย้ายไป limits-shared (ค่าเดิม 500) ◂

export type BulkSendInput = {
  contactIds: string[];
  subject?: string | null;
  bodyHtml?: string | null;
  templateId?: string | null;
  vars?: Record<string, string>;
  scheduledAt?: Date | string | null;
  confirm?: boolean | null;
  reason?: string | null;
  /** กุญแจกันซ้ำของคำขอ (REST ส่ง `Idempotency-Key` ต่อลงมา) */
  idempotencyKey?: string | null;
};
export type BulkSendResult = {
  requested: number;
  sent: number;
  queued: number;
  /**
   * คนที่ "ส่งไม่สำเร็จ" — ตัวส่งล้ม หรือเกิดข้อผิดพลาดที่ไม่คาดคิดกับผู้รับรายนั้น
   * 🔴 AUDIT-CLASS X8: `reason` เป็นข้อความคงที่ + `code` เป็นรหัสล้วน ๆ (ไม่เอาข้อความของ error ดิบมาใส่ —
   *    error ของฐาน/ผู้ให้บริการอาจมีที่อยู่อีเมลหรือค่าที่ลูกค้ากรอกติดมา)
   */
  failed: { contactId: string; reason: string; code: string }[];
  /** คนที่ระบบไม่ส่งให้ + เหตุผลไทย (ขอไม่รับ · ไม่มีอีเมล · มองไม่เห็น) — ของที่ตกด่านห้ามหายเงียบ ๆ */
  skipped: { contactId: string; reason: string }[];
};

/** รหัสของ error ที่ไม่ใช่ EmailError — เอาแต่ "รหัส/ชื่อชนิด" ไม่เอาข้อความ (X8) */
function bulkFailCode(e: unknown): string {
  const c = (e as { code?: unknown } | null)?.code;
  if (typeof c === "string" && c) return c.slice(0, 40);
  return (e instanceof Error ? e.name : typeof e).slice(0, 40) || "UNKNOWN";
}
const BULK_FAILED_TH = "ส่งจดหมายให้ผู้ติดต่อรายนี้ไม่สำเร็จรอบนี้ — สั่งส่งอีกครั้งเฉพาะคนนี้ได้เลย (คนอื่นในชุดนี้ส่งไปแล้ว)";

export async function sendBulk(ctx: EmailsCtx, actor: MemberActor, input: BulkSendInput, deps?: EmailDeps): Promise<BulkSendResult> {
  await enter(ctx, actor, KEY_SEND);
  const reason = str(input?.reason);
  // AUDIT-CLASS X9: ตรวจก่อนแตะอะไรทั้งหมด — ไม่ผ่าน = ไม่มีจดหมายฉบับไหนถูกสร้าง
  if (input?.confirm !== true || reason.length < 5) {
    throw fail("CONFIRM_REQUIRED", "การส่งจดหมายถึงหลายคนพร้อมกันย้อนกลับไม่ได้ — ยืนยันและพิมพ์เหตุผลอย่างน้อย 5 ตัวอักษรก่อนส่ง");
  }
  const raw = Array.isArray(input?.contactIds) ? input.contactIds : [];
  const ids = [...new Set(raw.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))];
  if (ids.length === 0) throw fail("VALIDATION", "ยังไม่ได้เลือกผู้รับ — เลือกผู้ติดต่ออย่างน้อย 1 รายแล้วส่งอีกครั้ง");
  if (raw.length > CRM_EMAIL_BULK_MAX || ids.length > CRM_EMAIL_BULK_MAX) {
    throw fail("VALIDATION", `ส่งเป็นกลุ่มได้ครั้งละไม่เกิน ${CRM_EMAIL_BULK_MAX.toLocaleString("th-TH")} คน — แบ่งเป็นหลายรอบแล้วลองอีกครั้ง`);
  }
  const key = str(input?.idempotencyKey) || null;
  const out: BulkSendResult = { requested: ids.length, sent: 0, queued: 0, failed: [], skipped: [] };
  await auditEmail(ctx, "crm.email.send_bulk", undefined, { after: { stage: "started", contacts: ids.length, reason: reason.slice(0, 200) } });
  for (const contactId of ids) {
    try {
      const r = await sendCore(
        ctx,
        actor,
        {
          contactId,
          subject: input?.subject ?? null,
          bodyHtml: input?.bodyHtml ?? null,
          templateId: input?.templateId ?? null,
          ...(input?.vars ? { vars: input.vars } : {}),
          scheduledAt: input?.scheduledAt ?? null,
          idempotencyKey: key ? `${key}:${contactId}` : null,
        },
        deps,
      );
      if (r.status === "QUEUED") out.queued += 1;
      else if (r.status === "FAILED") out.failed.push({ contactId, reason: BULK_FAILED_TH, code: "SEND_FAILED" });
      else out.sent += 1;
    } catch (e) {
      // ผู้ติดต่อรายหนึ่งส่งไม่ได้ (ขอไม่รับ · ไม่มีอีเมล · มองไม่เห็น) ต้องไม่ล้มทั้งชุด — บอกเป็นรายคน
      if (e instanceof EmailError) out.skipped.push({ contactId, reason: e.message });
      // 🔴 รอบแก้ 25 ก.ย. 2569 (ผู้ตรวจอิสระ B2): ของเดิม `throw e` ⇒ error ที่ไม่ใช่ EmailError ของผู้รับ **คนเดียว**
      //    (ฐานสะดุด · ผู้ให้บริการที่เก็บไฟล์ล้ม · บั๊กที่ไม่คาดคิด) ทำให้ทั้งคำสั่งล้มกลางทาง: คนที่ 1–k ได้จดหมายไปแล้ว
      //    แต่ผู้เรียกได้ 500 ⇒ เขา retry ด้วยกุญแจใหม่แล้วลูกค้ากลุ่มแรกได้จดหมายซ้ำ (กุญแจกันซ้ำรายคนช่วยได้แค่เมื่อ
      //    กุญแจของคำขอเดิม) ⇒ จับทุก error ต่อคน · ตอบ 200 พร้อม summary เสมอ · คนที่ล้มอยู่ใน `failed[]` ให้สั่งซ้ำเฉพาะคน
      else out.failed.push({ contactId, reason: BULK_FAILED_TH, code: bulkFailCode(e) });
    }
  }
  await auditEmail(ctx, "crm.email.send_bulk", undefined, {
    after: {
      stage: "done", requested: out.requested, sent: out.sent, queued: out.queued, failed: out.failed.length, skipped: out.skipped.length,
      // รหัสความล้มเหลว (ไม่ใช่ข้อความ) — เจ้าของร้าน/ผู้ดูแลระบบตามเรื่องต่อได้โดยไม่มี PII ในแถวประวัติ
      ...(out.failed.length ? { failedCodes: [...new Set(out.failed.map((f) => f.code))].slice(0, 10) } : {}),
      reason: reason.slice(0, 200),
    },
  });
  return out;
}

/**
 * ทางเข้าของ "ระบบ" (ไม่มีคนกด): ขั้นอีเมลของลำดับการติดตาม (C2.2) และการกระทำ SEND_EMAIL ของกฎ (C2.1 · R-E.5)
 * กติกาความยินยอมเดียวกับการส่งแบบ marketing ทุกประการ
 */
export async function sendAsSystem(
  ctx: { tenantId: string; systemId: string },
  input: SendInput & { senderUserId?: string | null; sequenceStepId?: string | null; redeliverFailed?: boolean },
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
    // CRM C5.4-D2 r2 ▸ N1: จดหมายที่ค้างกลางทาง "อาจถูกรับแล้ว" — ติดธง `routing.amb` ก่อนปิดเป็น FAILED (เงื่อนไขชุดเดียวกัน · `at` เดียวกัน) ◂
    await prisma.$executeRaw`
      UPDATE "CrmEmailMessage" SET "routing" = "routing" || '{"amb":true}'::jsonb
       WHERE "systemId" = ANY(${systems}::text[]) AND "direction" = 'OUT' AND "status" = 'QUEUED' AND "scheduledAt" IS NULL AND "leaseUntil" < ${at}
         AND jsonb_typeof("routing") = 'object'`;
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
  // CRM C5.1-fix ▸ F7: เดิม `email equals … mode insensitive` = `ILIKE $1` (seq scan ทั้งระบบ · และ `_`/`%` ในอีเมลกลายเป็นตัวแทน —
  //   `a_b@x.com` เคยจับคู่ `aXb@x.com` ได้) → `lower("email") = lower($1)` ใช้ดัชนีนิพจน์ ("systemId", lower("email")) ของ migration
  //   crm_perf_indexes · ทางสำรอง `previousEmails` (R-A: ผู้ติดต่อเปลี่ยนอีเมล — จดหมายจากที่อยู่เดิมยังเข้าเธรดของคนเดิม) ใช้ดัชนี GIN ·
  //   สองทางในคำสั่งเดียว (ทางตรงก่อน · คนที่สร้างก่อนสุดของแต่ละทาง เหมือนเดิม) แล้วอ่านแถวเต็มด้วย id ◂
  const variants = uniq([addr, addr.toLowerCase()]);
  //   🔴 MATERIALIZED: ไม่งั้น planner เดา `&&` ไว้ 990 แถว แล้วเลือกเดินดัชนี (systemId, createdAt) ทั้งระบบหาแถวแรก (วัดได้ 320 ms · C5.1-fix)
  const hit = await prisma.$queryRaw<{ id: string }[]>`
    WITH d AS MATERIALIZED (
      SELECT c."id", c."createdAt" FROM "CrmContact" c
       WHERE c."systemId" = ${systemId} AND c."mergedIntoId" IS NULL AND c."archivedAt" IS NULL AND lower(c."email") = lower(${addr})
    ), pv AS MATERIALIZED (
      SELECT c."id", c."createdAt" FROM "CrmContact" c
       WHERE c."systemId" = ${systemId} AND c."mergedIntoId" IS NULL AND c."archivedAt" IS NULL AND c."previousEmails" && ${variants}::text[]
    )
    SELECT x."id" FROM (
      (SELECT d."id", 0 AS "p" FROM d ORDER BY d."createdAt" ASC, d."id" ASC LIMIT 1)
      UNION ALL
      (SELECT pv."id", 1 AS "p" FROM pv ORDER BY pv."createdAt" ASC, pv."id" ASC LIMIT 1)
    ) x ORDER BY x."p" LIMIT 1`;
  const id = hit[0]?.id;
  return id ? prisma.crmContact.findFirst({ where: { id, systemId } }) : null;
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
    // C5.4 (L4-M2): ตัวส่งตัวเดียวของแพลตฟอร์ม — ตรวจปลายทาง · ตรึง IP ตอนต่อ (ปิด DNS rebinding/DNS ช้า) · ไม่ตาม 3xx ·
    //   เพดานขนาดอ่านที่ชั้นเชื่อมต่อ (ไม่ต้องเชื่อ content-length) · ฉีด `deps.fetch` ได้เหมือนเดิม (ข้อสอบ)
    const { outboundFetch } = await import("@/lib/webhooks/service");
    const res = await outboundFetch(
      item.url,
      { method: "GET", timeoutMs: ATTACH_FETCH_TIMEOUT_MS, maxBytes: CRM_EMAIL_ATTACH_MAX_BYTES },
      deps?.fetch ? { fetch: deps.fetch } : undefined,
    );
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
  // CRM C5.4-F ▸ hunt: คีย์ที่ชนกันหลังทำเป็นตัวพิมพ์เล็ก (`Authentication-Results` + `authentication-results`) ถูก **ต่อกันด้วย `\n`
  //   ตามลำดับที่มา** แทนการเขียนทับ (ตัวหลังเคยชนะ ⇒ ผู้ส่งเลือกได้ว่าหัวไหนถูกอ่าน) ◂
  for (const [k, v] of Object.entries(h)) {
    const key = String(k).trim().toLowerCase();
    const val = String(v ?? "");
    out[key] = key in out ? `${out[key]}\n${val}` : val;
  }
  return out;
}

const bareId = (v: unknown) => str(v).replace(/^<|>$/g, "");

/**
 * หัว `Authentication-Results` (RFC 8601) ของ MTA ขาเข้าของเรา บอกว่าจดหมายฉบับนี้ **ผ่าน DMARC ในนามโดเมนของ From** ไหม
 * CRM C5.4-F ▸ L4-M1 + hunt (รอบ 3) — หัวนี้ **ผู้ส่งเขียนเองได้** และ MTA บางตัวสะท้อนค่าที่ผู้ส่งควบคุม (HELO · MAIL FROM) ลงใน
 *   หัวของตัวเองโดยไม่ quote/escape ⇒ เชื่อได้เฉพาะเมื่อผ่านทุกข้อ (ไม่ผ่านข้อใด = ไม่มีหลักฐาน = IN · fail-closed):
 *   1) ตั้ง `CRM_INBOUND_AUTHSERV_ID` แล้ว (ว่าง = ไม่เชื่อหัวใดเลย) · `X-Authentication-Results` / `ARC-…` ไม่ถูกอ่าน
 *   2) authserv-id ของเรานำหน้า instance **เดียวพอดี** (สองหัวขึ้นไป = มีหัวที่ติดมากับจดหมาย ⇒ ไม่เชื่อทั้งหมด)
 *   3) แยก instance/ข้อได้สะอาด: comment `( … )` และ quoted-string ปิดครบ และไม่มีรอยต่อระหว่างหัว (`,` / ขึ้นบรรทัด)
 *      อยู่ข้างใน (ไม่งั้นคือหัวสองหัวที่ถูกเย็บต่อกัน หรือค่าของผู้ส่งที่หลุดออกมาจาก comment)
 *   4) ใน instance นั้นมี resinfo `dmarc` ได้ 1 ข้อ และ `spf` ไม่เกิน 1 ข้อ (ข้อที่ถูกฉีดเพิ่มทำให้เกินเสมอ ถ้า MTA ออก dmarc เอง)
 *   5) หลักฐานเดียวที่รับ: `dmarc=pass header.from=<โดเมนของ From ตรงตัว>` — dkim/spf ลำพังไม่นับ (header.i / smtp.mailfrom
 *      ไม่ align กับ From · DMARC คือผลที่ align แล้ว)
 */
function authResultPass(headers: Record<string, string>, fromDomain: string): boolean {
  const domain = str(fromDomain).toLowerCase();
  if (!domain || !domain.includes(".")) return false;
  const trusted = str(process.env.CRM_INBOUND_AUTHSERV_ID).toLowerCase();
  if (!trusted) return false;
  const insts = authResultsInstances(str(headers["authentication-results"]));
  if (!insts) return false;
  const ours = insts.filter((i) => i.authservId === trusted);
  if (ours.length !== 1) return false;
  let dmarc = 0;
  let spf = 0;
  let pass = false;
  for (const part of (ours[0] as { clauses: string[] }).clauses) {
    // ข้อหนึ่ง = คู่ `key=value` เรียงกัน (value ในเครื่องหมายคำพูดถูกกินทั้งก้อน ⇒ ข้อความใน `reason="…"` ไม่ถูกอ่านเป็น key)
    const pairs = [...part.trim().toLowerCase().matchAll(/([a-z0-9._-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^\s";]+)/g)].map((m) => ({
      k: m[1] ?? "",
      v: (m[2] ?? "").replace(/^"|"$/g, ""),
    }));
    const head = pairs[0];
    if (!head) continue;
    if (head.k === "spf") spf += 1;
    if (head.k !== "dmarc") continue;
    dmarc += 1;
    if (head.v !== "pass") continue;
    if (pairs.slice(1).some(({ k, v }) => k === "header.from" && v.replace(/^.*@/, "").replace(/\.$/, "") === domain)) pass = true;
  }
  return pass && dmarc === 1 && spf <= 1;
}

/**
 * CRM C5.4-F ▸ L4-M1 — แยกค่าของหัว `Authentication-Results` เป็นทีละ instance → `{ authservId, clauses }` · `null` = แยกไม่สะอาด (ไม่เชื่อ)
 * - หัวชื่อซ้ำถูกต่อด้วย `\n` (`lowerHeaders` · route ขาเข้า) หรือ `,` (ผู้ให้บริการบางราย) ⇒ ทั้งสองอย่างคือรอยต่อระหว่างหัว
 * - header folding: บรรทัดที่ขึ้นต้นด้วยช่องว่างต่อกับบรรทัดก่อน **เว้นแต่** มันขึ้นต้นเหมือนหัวใหม่ (`<authserv-id> [version];`
 *   ที่ไม่มี `=`) — หัวปลอมที่ถูกเย็บด้วย `\n\t` จึงไม่ถูกรวบเข้าหัวจริง
 * - comment `( … )` (ซ้อนได้ · `\` escape) ถูกตัดทิ้ง · quoted-string ถูกเก็บทั้งก้อน · รอยต่อ (`,`/ขึ้นบรรทัด) ที่อยู่ใน comment
 *   หรือในเครื่องหมายคำพูด หรือ comment/เครื่องหมายคำพูดที่ไม่ปิด ⇒ `null`
 */
function authResultsInstances(rawValue: string): { authservId: string; clauses: string[] }[] | null {
  const lines = rawValue.split(/\r?\n/);
  let raw = lines[0] ?? "";
  for (const line of lines.slice(1)) {
    const folded = /^[ \t]/.test(line) && !/^\s*[a-z0-9._-]+(?:\s+\d+)?\s*(?:\([^)]*\)\s*)?;/i.test(line);
    raw += folded ? ` ${line.trim()}` : `\n${line}`;
  }
  const out: { authservId: string; clauses: string[] }[] = [];
  let cur = "";
  let clauses: string[] = [];
  let depth = 0;
  let quoted = false;
  const flushInstance = () => {
    clauses.push(cur);
    cur = "";
    const [head, ...rest] = clauses;
    const id = str(head).split(/\s+/)[0]?.toLowerCase() ?? "";
    if (id) out.push({ authservId: id, clauses: rest });
    clauses = [];
  };
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] as string;
    const boundary = ch === "," || ch === "\n";
    if ((depth > 0 || quoted) && boundary) return null;
    if (ch === "\\" && (quoted || depth > 0)) {
      if (!depth) cur += ch + (raw[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (depth > 0) {
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      if (depth === 0) cur += " ";
      continue;
    }
    if (quoted) {
      cur += ch;
      if (ch === '"') quoted = false;
      continue;
    }
    if (ch === "(") depth = 1;
    else if (ch === ")") return null;
    else if (ch === '"') {
      quoted = true;
      cur += ch;
    } else if (ch === ";") {
      clauses.push(cur);
      cur = "";
    } else if (boundary || ch === "\r") {
      if (cur.trim() || clauses.length) flushInstance();
    } else cur += ch;
  }
  if (depth > 0 || quoted) return null;
  if (cur.trim() || clauses.length) flushInstance();
  return out;
}

/** โดเมนอีเมลสาธารณะที่พนักงานใช้ร่วมกับลูกค้าได้ — โดเมนเหล่านี้ไม่ถือเป็น "โดเมนของพนักงาน" (ไม่งั้นลูกค้า gmail ทั้งหมดไม่เป็น lead) */
const PUBLIC_MAIL_DOMAINS: ReadonlySet<string> = FREE_MAIL_DOMAINS; // CRM C5.4-E ▸ รายการเดียวกับบริษัท (companies-shared) ◂

/**
 * CRM C5.4-F ▸ hunt #5 — คนแปลกหน้าที่ **ดูเหมือนพนักงาน** ห้ามกลายเป็น lead อัตโนมัติ: ที่อยู่เป็นรูป +tag ของที่อยู่พนักงาน
 * (`sales+ceo@…`) · อยู่บนโดเมนส่วนตัวของพนักงาน (ไม่ใช่โดเมนอีเมลสาธารณะ) · หรือชื่อที่แสดงมีที่อยู่ของพนักงาน/ตรงกับชื่อพนักงาน
 * (จดหมายยังถูกเก็บเป็นขาเข้าที่ยังไม่จับคู่ตามปกติ — แค่ไม่สร้างผู้ติดต่อใหม่จากมัน)
 */
async function mimicsStaff(tenantId: string, fromAddr: string, displayName: string): Promise<boolean> {
  const rows = await prisma.membership.findMany({
    where: { tenantId, acceptedAt: { not: null } },
    select: { user: { select: { email: true, name: true } } },
    take: 2_000,
  });
  const addr = fromAddr.toLowerCase();
  const [local = "", dom = ""] = addr.split("@");
  const base = `${local.split("+")[0]}@${dom}`;
  const shown = str(displayName).toLowerCase();
  for (const r of rows) {
    const email = str(r.user?.email).toLowerCase();
    const name = str(r.user?.name).toLowerCase();
    if (email) {
      const sDom = email.split("@")[1] ?? "";
      if (base === email) return true;
      if (sDom && sDom === dom && !PUBLIC_MAIL_DOMAINS.has(dom)) return true;
      if (shown && shown.includes(email)) return true;
    }
    if (name.length >= 3 && shown === name) return true;
  }
  return false;
}

/**
 * CRM C5.5-fix2 ▸ hunter 2a-7 (+ รีวิว RV2-3) — เพดานจดหมายขาเข้าสองถัง (`checkRateLimitDb` ตัวเดียวของระบบ · fail-open เมื่อฐานล่ม):
 *   • ถังต่อผู้ส่ง (`inboundSenderLimited`) — นับทุกฉบับก่อนงานหนัก · กันวงสำเนา/ผู้ส่งรายเดียวที่ถล่ม
 *   • ถังของทั้งระบบ (`inboundSystemLimited`) — นับ **เฉพาะจดหมายที่พิสูจน์ผู้ส่งไม่ได้** (มติผู้คุมงาน RV2-3): จดหมายที่ผ่าน A-R
 *     หรือมีหลักฐานของเธรด (อ้าง Message-ID ของจดหมายขาออกของเรา + มาจากผู้รับของฉบับนั้น) ไม่ถูกนับและไม่ถูกทิ้ง ⇒ คนที่สุ่ม From
 *     ถล่มกล่องเต็มถังได้ แต่ลูกค้าที่ตอบเธรดจริงยังเข้ามาได้เสมอ
 * เกิน ⇒ `true` (ผู้เรียกตอบ "รับแล้ว" แต่ไม่เก็บ · ไม่เด้งกลับ) · ครั้งแรกที่เกินของหน้าต่าง (count = limit + 1 — คำสั่งเดียวแบบ atomic
 * ⇒ มีคำขอเดียวที่เห็นค่านี้): audit `crm.email.inbound.rate_limited` 1 บรรทัด · ถังของระบบแจ้งเจ้าของร้านด้วย (AppNotification รายคน
 * ทางเดิมของระบบ — ไม่มีช่องทางใหม่) · ไม่มีที่อยู่อีเมลดิบใน audit/กุญแจถัง (แฮช)
 */
async function inboundSenderLimited(tenantId: string, systemId: string, fromAddr: string): Promise<boolean> {
  const senderHash = sha256(`from:${fromAddr}`).slice(0, 32);
  const L = CRM_INBOUND_RATE_LIMITS.perSender;
  const v = await checkRateLimitDb(`crm.email.in.from.${systemId}.${senderHash}`, L);
  if (v.ok) return false;
  if (v.count === L.limit + 1) await auditInboundCap(tenantId, systemId, { bucket: "sender", limit: L.limit, windowMs: L.windowMs, senderHash: senderHash.slice(0, 12) });
  return true;
}

async function inboundSystemLimited(tenantId: string, systemId: string): Promise<boolean> {
  const L = CRM_INBOUND_RATE_LIMITS.perSystem;
  const v = await checkRateLimitDb(`crm.email.in.sys.${systemId}`, L);
  if (v.ok) return false;
  if (v.count === L.limit + 1) {
    await auditInboundCap(tenantId, systemId, { bucket: "system", limit: L.limit, windowMs: L.windowMs });
    // RV2-3: ร้านต้องรู้ว่ากล่องจดหมายถูกถล่ม (จดหมายที่พิสูจน์ผู้ส่งไม่ได้ถูกทิ้งไปจนจบชั่วโมง) — แจ้งเจ้าของร้านทุกคน ครั้งเดียวต่อหน้าต่าง
    try {
      const owners = await prisma.membership.findMany({ where: { tenantId, role: "OWNER", acceptedAt: { not: null } }, select: { userId: true }, take: 20 });
      if (owners.length) {
        await prisma.appNotification.createMany({
          data: owners.map((o) => ({
            tenantId,
            recipientUserId: o.userId,
            title: "กล่องอีเมล CRM รับจดหมายเกินเพดานชั่วโมงนี้",
            body: `มีจดหมายที่ยืนยันผู้ส่งไม่ได้เข้ามาเกิน ${L.limit} ฉบับในชั่วโมงเดียว (อาจถูกส่งถล่ม) — ฉบับที่เกินถูกพักทิ้งจนครบชั่วโมง ลูกค้าที่ตอบเธรดเดิมหรือยืนยันผู้ส่งได้ยังเข้ามาตามปกติ ดูที่ /app/sys/${systemId}/crm/emails`,
          })),
        });
      }
    } catch (e) {
      await logOps("WARN", "crm.email.inbound", "แจ้งเจ้าของร้านเรื่องกล่องอีเมลเกินเพดานไม่สำเร็จ", { tenantId, detail: (e instanceof Error ? e.name : "Error").slice(0, 80) }).catch(() => {});
    }
  }
  return true;
}

async function auditInboundCap(tenantId: string, systemId: string, after: Record<string, unknown>): Promise<void> {
  await writeAudit({ tenantId, actorId: null, actorType: "SYSTEM", action: "crm.email.inbound.rate_limited", targetType: "AppSystem", targetId: systemId, after }).catch(() => undefined);
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
    // CRM C5.5-fix2 ▸ hunter 2a-1: สำเนาที่ระบบเราส่งออกเองวนกลับเข้ามา (หัว `X-SHARK-Loop`) ⇒ ทิ้งก่อนแตะฐาน (กันวงจรสำเนา) ◂
    if (CRM_LOOP_HEADER.toLowerCase() in lowerHeaders(payload?.headers)) return { ok: true, handled: false, reason: "loop", attachmentsDropped: 0 };

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
    // CRM C5.5-fix2 ▸ hunter 2a-7: เพดานต่อผู้ส่งก่อนงานหนัก (ถังของทั้งระบบอยู่หลังรู้ผลพิสูจน์ผู้ส่ง — RV2-3) — เกิน = รับแล้วทิ้ง ◂
    if (await inboundSenderLimited(system.tenantId, system.id, fromAddr)) return { ok: true, handled: false, reason: "rate_limited", attachmentsDropped: 0 };
    const replyToAddr = bareEmail(headers["reply-to"]);
    const auto = isAutoSubmitted(headers, str(payload?.from));
    const subject = str(payload?.subject).slice(0, CRM_EMAIL_SUBJECT_MAX) || "(ไม่มีหัวข้อ)";

    // ── ทิศทาง: From เป็นพนักงานของร้านนี้ ⇒ เก็บเป็นขาออก (สำเนา BCC ของจดหมายที่พนักงานส่งจากกล่องตัวเอง) ──
    const staff = fromAddr
      ? await prisma.membership.findFirst({
          // CRM C5.5-fix2 ▸ hunter 2a-5: `equals … insensitive` = ILIKE — From `somchai_k@` (กล่องจริงของคนอื่นที่ผ่าน DMARC ของตัวเอง)
          //   เคยถูกนับเป็นพนักงาน `somchai.k@` ⇒ เก็บเป็น "ขาออกที่พนักงานส่ง" ได้ · ciEquals = เท่ากันทุกตัวอักษร ◂
          where: { tenantId: system.tenantId, acceptedAt: { not: null }, user: { email: ciEquals(fromAddr) } },
          select: { userId: true },
        })
      : null;
    const staffByOverride = staff
      ? null
      : fromAddr
        ? await prisma.crmEmailUserSetting.findFirst({ where: { systemId: system.id, fromAddr: ciEquals(fromAddr) }, select: { userId: true } }) /* CRM C5.5-fix2 ◂ */
        : null;
    // CRM C5.4-B ▸ L1-m3: ที่อยู่ override ที่ไม่ได้อยู่บนโดเมนยืนยันของร้าน (แถวเก่าก่อนมีด่านใน setUserSetting) ไม่นับเป็นตัวตนพนักงาน ◂
    const overrideTrusted = !!staffByOverride && (await verifiedDomains(system.tenantId)).has(emailDomainOf(fromAddr));
    // 🔴 ก่อนจะ "เชื่อ" ว่าจดหมายฉบับนี้พนักงานส่งเอง ต้องมีหลักฐานว่า From ไม่ได้ถูกปลอม: ใครก็ยิง JSON เข้ามาที่
    //    เส้นขาเข้าโดยจ่า `From:` เป็นอีเมลพนักงานได้ ⇒ จดหมายจะถูกเก็บเป็น **ขาออกของร้าน** (direction OUT ·
    //    sentById = พนักงานคนนั้น) แล้วโผล่ในไทม์ไลน์ของลูกค้าเหมือนพนักงานเขียนเอง (ปล่อยข้อความปลอมในนามร้าน)
    //    หลักฐานที่รับ: `authentication-results` **ของ MTA ขาเข้าของเราเอง** (authserv-id = `CRM_INBOUND_AUTHSERV_ID`)
    //    บอก dkim/spf/dmarc=pass ให้โดเมนของ From — ดู `authResultPass`
    //    ไม่ผ่าน = ปฏิบัติกับมันเหมือนจดหมายขาเข้าธรรมดา (กติกาคนแปลกหน้า) — AUDIT-CLASS X1 · X6
    // CRM C5.4-F ▸ L4-M1: โดเมนผู้ส่งที่ร้านยืนยันแล้ว (`EmailDomain.status = VERIFIED`) **ไม่ใช่หลักฐาน** อีกต่อไป — มันแปลว่า
    //   "Resend ส่งในนามโดเมนนี้ได้" ไม่ได้บอกว่าใครส่งจดหมายฉบับที่เข้ามา (`From: owner@<โดเมนร้าน>` เปล่า ๆ เคยพอ)
    //   จดหมายที่อ้างที่อยู่ของพนักงาน/โดเมนของร้านโดยไม่มีหลักฐาน ⇒ IN + ธง `routing.unverifiedShopFrom` (ให้หน้าจอเตือนได้)
    //   และไม่ถูกทำเป็น lead ใหม่ (ที่อยู่ของพนักงานเองไม่ใช่ลูกค้า) ◂
    const staffClaim = staff?.userId ?? (overrideTrusted ? staffByOverride?.userId : null) ?? null;
    // CRM C5.5-fix2 ▸ hunter 2a-2: หลักฐานของ From คิดกับ **ทุก** ผู้ส่ง (เดิมเฉพาะที่อ้างเป็นพนักงาน) — ลูกค้าที่ไม่มีหลักฐาน = ธง unverifiedFrom ◂
    const fromProof = !!fromAddr && authResultPass(headers, emailDomainOf(fromAddr));
    const fromAuthenticated = staffClaim ? fromProof : false;
    const sentById = fromAuthenticated ? staffClaim : null;
    const fromOnShopDomain = !!fromAddr && (await verifiedDomains(system.tenantId)).has(emailDomainOf(fromAddr));
    const unverifiedShopFrom = !fromAuthenticated && !!fromAddr && (!!staffClaim || fromOnShopDomain);
    const direction: "IN" | "OUT" = sentById ? "OUT" : "IN";
    if (direction === "OUT" && settings.bccCaptureEnabled !== true) return { ok: true, handled: false, reason: "bcc_capture_off", attachmentsDropped: 0 };

    // ── ต่อเธรดชั้นที่ 1 (In-Reply-To/References) — ย้ายขึ้นมาก่อน เพราะเป็น "หลักฐานของเธรด" ที่ถังของระบบ (RV2-3) และผลของการตอบกลับใช้ ──
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
    // CRM C5.5-fix2 ▸ hunter 2a-2: "หลักฐานของเธรด" = อ้าง Message-ID ของจดหมายขาออกของเรา **และ** From คือผู้รับของฉบับนั้น ◂
    const threadProof = !!parent && parent.direction === "OUT" && [...(parent.toAddrs ?? []), ...(parent.ccAddrs ?? [])].some((x) => bareEmail(x) === fromAddr);
    // CRM C5.5-fix2 ▸ รีวิว RV2-3 (มติผู้คุมงาน): ถังของทั้งระบบนับ/ทิ้งเฉพาะจดหมายที่พิสูจน์ผู้ส่งไม่ได้ ◂
    if (!fromProof && !threadProof && (await inboundSystemLimited(system.tenantId, system.id))) return { ok: true, handled: false, reason: "rate_limited", attachmentsDropped: 0 };
    // AUDIT-CLASS X6: HTML ของคนนอกร้านผ่านตัวตัดกลางก่อน "เก็บ" (รูปเก็บไว้ให้กด "แสดงรูป" เองทีหลัง) — หลังด่านเพดาน (จดหมายที่ถูกทิ้งไม่กินเครื่อง)
    const storedHtml = sanitizeHtml(str(payload?.html), { allowImages: true, allowLinkSchemes: ["http", "https", "mailto", "tel"] });
    const bodyText = str(payload?.text) || htmlToText(str(payload?.html));

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
      // CRM C5.4-F ▸ review SF2 + hunt #4: Reply-To ใช้หาผู้ติดต่อได้ **เฉพาะ** จดหมายฟอร์มของร้าน — From อยู่บนโดเมนที่ร้านยืนยัน
      //   แล้ว (`EmailDomain.status = VERIFIED`) และไม่ใช่ที่อยู่ของพนักงาน · คนนอกที่รู้ `crm+<key>@` (อยู่ใน Reply-To ของทุก
      //   จดหมาย CRM) เคยใส่ Reply-To เป็นอีเมลลูกค้าแล้วแปะจดหมายลงไทม์ไลน์ของลูกค้าคนนั้นได้ ◂
      const replyToUsable = replyToAddr && fromOnShopDomain && !staffClaim ? replyToAddr : "";
      contact = (await contactByAddress(system.id, fromAddr)) ?? (replyToUsable ? await contactByAddress(system.id, replyToUsable) : null);
      if (contact) matchedBy = "EMAIL";
      if (!contact) {
        const domain = emailDomainOf(fromAddr);
        const company = domain
          ? await companyByEmailDomain(system.id, domain)
          : null;
        if (company) {
          companyId = company.id;
          matchedBy = "DOMAIN";
        } else if (
          settings.strangerToLead === true &&
          !auto &&
          !staffClaim &&
          !unverifiedShopFrom &&
          isEmailAddr(fromAddr) &&
          !(await mimicsStaff(system.tenantId, fromAddr, displayNameOf(payload?.from)))
        ) {
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
    // CRM C5.5-fix2 ▸ hunter 2a-2: จดหมายขาเข้าที่ผูกผู้ติดต่อแต่ From ยังไม่ได้พิสูจน์ ⇒ เก็บไว้ในไทม์ไลน์ตามเดิม (พนักงานเห็น + ป้าย
    //   "ไม่ยืนยันผู้ส่ง") แต่ **ไม่** ให้คะแนน / ไม่ระบุตัวลูกค้าใน event / ผลของ "การตอบกลับ" ต้องมีหลักฐานของเธรด (ล่าง) ◂
    // รีวิว RV2-2: จดหมายที่ถูกแปะบริษัทด้วยโดเมน (ไม่มีผู้ติดต่อ) ก็ต้องติดธงเช่นกัน — `ceo@<โดเมนลูกค้า>` ปลอมได้ ◂
    const unverifiedFrom = direction === "IN" && !fromProof && (!!contact || !!companyId);
    const routingFlags: Record<string, boolean> = { ...(unverifiedShopFrom ? { unverifiedShopFrom: true } : {}), ...(unverifiedFrom ? { unverifiedFrom: true } : {}) };

    // ── ต่อเธรด 3 ชั้น (AUDIT-CLASS X1: เธรดของร้าน/ระบบอื่นไม่มีทางถูกต่อ) — ชั้นที่ 1 (`parent`) คิดไว้ข้างบนแล้ว ──
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
            ...(Object.keys(routingFlags).length ? { routing: routingFlags as unknown as Prisma.InputJsonValue } : {}), // CRM C5.5-fix2 ◂
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
        await emitEmailEvent(tx, ctx, EVT.received, row, `${row.id}`, { unverifiedFrom }); // CRM C5.5-fix2 ▸ 2a-2 ◂
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
      if (dropped > 0) data.routing = { ...routingFlags, attachmentsDropped: dropped } as unknown as Prisma.InputJsonValue; // CRM C5.5-fix2 ▸ คงธงไว้ ◂
      if (Object.keys(data).length) await prisma.crmEmailMessage.update({ where: { id: created.id }, data });
    }

    // ── การตอบกลับจริง (ไม่ใช่เครื่องตอบ) ⇒ repliedAt + event + หยุดลำดับการติดตาม ──
    // CRM C5.5-fix2 ▸ hunter 2a-2: From ที่ยังไม่ได้พิสูจน์ ⇒ ผลของการตอบกลับ (repliedAt · crm.email.replied · หยุดลำดับ) ต้องมี
    //   "หลักฐานของเธรด": อ้าง Message-ID ของจดหมายขาออกของเรา (ข้างบน) **และ** From คือผู้รับของจดหมายฉบับนั้น — คนที่ถือ Message-ID
    //   (ผู้ร่วม CC/สำเนาที่ถูกส่งต่อ) แล้วปลอม From เป็นลูกค้าคนอื่น ไม่หยุดลำดับของคนอื่นได้อีก · มี A-R ผ่าน = เหมือนเดิม ◂
    if (direction === "IN" && parent && parent.direction === "OUT" && !auto && (fromProof || threadProof)) {
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

    // CRM C5.4-E ▸ L6-M4: จดหมายจากลูกค้าที่จับคู่ผู้ติดต่อได้ (ไม่ใช่เครื่องตอบอัตโนมัติ) ⇒ แจ้งผู้ดูแล "ลูกค้าตอบกลับ" ·
    //   ล้ม = ไม่กระทบการเก็บจดหมาย (ตัวส่ง WARN เอง) ◂
    if (direction === "IN" && contact && !auto) await (await import("./notify-senders")).customerRepliedByEmail(ctx, contact.id).catch(() => undefined);

    // ── สำเนาขาเข้า (copyMode IN/BOTH) ──
    // CRM C5.5-fix2 ▸ hunter 2a-1: (1) ปลายทางในกล่องของ SHARK เอง = ไม่ส่ง (ค่าที่บันทึกไว้ก่อนมีด่านใน setEmailSettings)
    //   (2) จดหมายที่เป็นสำเนาของเราอยู่แล้ว (หัวเรื่องขึ้นต้นด้วยคำนำหน้าสำเนา) = ไม่สำเนาซ้ำ (3) สำเนาติด `Auto-Submitted:
    //   auto-forwarded` (RFC 3834 — เครื่องตอบอัตโนมัติไม่ตอบกลับ) + หัวกันวน `X-SHARK-Loop` ที่เส้นขาเข้าทิ้งทันทีถ้ามันวนกลับมา ◂
    const copyIn = settings.copyMode === "IN" || settings.copyMode === "BOTH" ? bareEmail(settings.copyToAddr) : "";
    // รีวิว RV2-1: ตัวส่งต่อนอก SHARK ที่เขียนจดหมายใหม่ ("FW: [สำเนา…]" · ไม่มีหัว X- · From = กล่องสำเนา) ⇒ ไม่สำเนาซ้ำเมื่อ
    //   From คือกล่องสำเนาเอง · หัวเรื่องมีคำนำหน้าสำเนาอยู่ "ที่ไหนก็ได้" · หรือเป็นจดหมายอัตโนมัติ (Auto-Submitted ≠ no ฯลฯ) ◂
    if (copyIn && !isSystemMailAddress(copyIn) && fromAddr !== copyIn && !subject.includes(CRM_COPY_IN_SUBJECT_PREFIX) && !auto) {
      const transport = await transportOf(deps);
      await transport({
        to: [copyIn],
        subject: `${CRM_COPY_IN_SUBJECT_PREFIX} ${subject}`.slice(0, CRM_EMAIL_SUBJECT_MAX),
        html: storedHtml || `<p>${escapeHtmlText(bodyText)}</p>`,
        text: bodyText,
        headers: { "Auto-Submitted": "auto-forwarded", [CRM_LOOP_HEADER]: "crm-copy" },
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
// CRM C5.4-B ▸ L1-m2: กล่องนี้คือจดหมายที่ "ไม่ผูกใคร" ของทั้งระบบ ⇒ เปิดได้เฉพาะผู้ที่เห็นทั้งระบบจริง ๆ —
//   คีย์ API ที่ถูกกรอง (`crm.filter.team:` / `crm.filter.owner:` · R-C.3 "แคบลงเท่านั้น") ไม่ผ่าน · ผู้จัดการ/พนักงานต้องไม่ถูกจำกัดสาขา
//   และเห็นผู้ติดต่อ ALL (เดิม MANAGER ทุกคน + คีย์ admin ที่แปลงเป็น MANAGER ผ่านหมด)
async function assertUnmatchedGate(ctx: EmailsCtx, actor: MemberActor): Promise<void> {
  if (actor.role === "OWNER" && !isApiActor(actor)) return;
  const deny = () => fail("FORBIDDEN", "กล่อง \"ยังไม่จับคู่\" เปิดได้เฉพาะบัญชีที่เห็นผู้ติดต่อทั้งระบบ — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ก่อน");
  if (isApiActor(actor)) {
    if (Object.entries(actor.permissions ?? {}).some(([k, v]) => v === true && k.startsWith("crm.filter."))) throw deny();
    return;
  }
  const wholeShop = actor.unitAccess.length === 0 || actor.unitAccess.includes("*");
  const level = await resolveVisibility(ctx, actor, "CONTACT");
  if (level !== "ALL" || !wholeShop) {
    throw fail("FORBIDDEN", "กล่อง \"ยังไม่จับคู่\" เปิดได้เฉพาะบัญชีที่เห็นผู้ติดต่อทั้งระบบหรือระดับผู้จัดการขึ้นไป — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ก่อน");
  }
}

/**
 * ขอบเขตของหน้ารายการ — กติกาเดียวกับ `rowVisibleFilter` ของ `getThread` (แถวที่ผูกผู้ติดต่อตัดสินด้วยผู้ติดต่อ ·
 * แถวที่ไม่ผูกผู้ติดต่อแต่ผูกบริษัทตัดสินด้วยบริษัท) ⇒ เธรดที่รายการไม่โชว์ ก็เปิดตรง ๆ ไม่ได้ และตัวนับจำนวน
 * ฉบับในรายการนับเฉพาะฉบับที่บัญชีนี้มองเห็น
 */
// CRM C5.1-fix ▸ F2: เดิมดึง id ผู้ติดต่อ ≤ 20,000 + id บริษัท ≤ 20,000 มาเป็น `IN (…)` ⇒ ร้านใหญ่ = P2029 ทุกครั้ง และเกิน 20,000 คน =
//   จดหมายของคนที่ 20,001+ หายจากกล่องเงียบ ๆ · ใหม่ = EXISTS ของแถวผู้ติดต่อ/บริษัทที่เห็น (contactSql/companySql) ในคำสั่งเดียว — กติกาเดิม:
//   แถวที่ผูกผู้ติดต่อตัดสินด้วยผู้ติดต่อ · แถวที่ไม่ผูกผู้ติดต่อแต่ผูกบริษัทตัดสินด้วยบริษัท · ไม่ผูกทั้งคู่ = ไม่เห็นในกล่องปกติ ◂

type ThreadRowSql = Pick<CrmEmailMessage, "id" | "threadKey" | "subject" | "contactId" | "companyId" | "dealId" | "matchedBy" | "direction" | "snippet" | "sentAt" | "receivedAt" | "createdAt"> & { unverified: boolean | null }; // CRM C5.5-fix2 ▸ RV2-4 ◂

export async function listThreads(
  ctx: EmailsCtx,
  actor: MemberActor,
  input: { contactId?: string | null; companyId?: string | null; dealId?: string | null; unmatched?: boolean; q?: string | null; page?: number; pageSize?: number } = {},
): Promise<{ items: ThreadListItem[]; total: number }> {
  return crmScope(() => listThreadsIn(ctx, actor, input));
}

async function listThreadsIn(
  ctx: EmailsCtx,
  actor: MemberActor,
  // CRM C2.11 ▸ `pageSize` (1–100 · ปริยาย 50 = ของเดิมทุกไบต์) — REST `GET /emails/threads` ต้องเคารพ `take` ของผู้เรียก
  //   ถ้าไม่มีช่องนี้ op จะต้องหั่นผลของหน้า 50 แถวทิ้ง ⇒ `nextCursor` โกหก (ข้ามเธรดที่ 6–50 ของหน้านั้น) ◂
  input: { contactId?: string | null; companyId?: string | null; dealId?: string | null; unmatched?: boolean; q?: string | null; page?: number; pageSize?: number } = {},
): Promise<{ items: ThreadListItem[]; total: number }> {
  await enter(ctx, actor, KEY_READ);
  const unmatched = input?.unmatched === true;
  if (unmatched) await assertUnmatchedGate(ctx, actor);
  const scope = unmatched
    ? Prisma.sql`m."tenantId" = ${ctx.tenantId} AND m."systemId" = ${ctx.systemId} AND m."contactId" IS NULL AND m."companyId" IS NULL`
    : await visibleEmailRowSql(ctx, actor, "m");
  const extra: Prisma.Sql[] = [];
  if (str(input?.contactId)) extra.push(Prisma.sql`m."contactId" = ${str(input.contactId)}`);
  if (str(input?.companyId)) extra.push(Prisma.sql`m."companyId" = ${str(input.companyId)}`);
  if (str(input?.dealId)) extra.push(Prisma.sql`m."dealId" = ${str(input.dealId)}`);
  if (str(input?.q)) extra.push(Prisma.sql`m."subject" ILIKE ('%' || ${str(input.q)} || '%')`);
  const rows = await prisma.$queryRaw<ThreadRowSql[]>`
    SELECT m."id", m."threadKey", m."subject", m."contactId", m."companyId", m."dealId", m."matchedBy"::text AS "matchedBy",
           m."direction"::text AS "direction", m."snippet", m."sentAt", m."receivedAt", m."createdAt",
           (jsonb_typeof(m."routing"::jsonb) = 'object' AND (m."routing"::jsonb->>'unverifiedFrom' = 'true' OR m."routing"::jsonb->>'unverifiedShopFrom' = 'true')) AS "unverified"
      FROM "CrmEmailMessage" m
     WHERE ${scope} ${extra.length ? Prisma.sql`AND ${Prisma.join(extra, " AND ")}` : Prisma.empty}
     ORDER BY m."createdAt" DESC, m."id" DESC
     LIMIT 2000`;
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
        unverifiedFrom: r.unverified === true,
        _at: at,
      });
      continue;
    }
    cur.count += 1;
    if (r.unverified === true) cur.unverifiedFrom = true; // RV2-4: ฉบับใดฉบับหนึ่งในเธรดไม่ยืนยันผู้ส่ง ⇒ ทั้งเธรดขึ้นป้าย
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
  // CRM C2.11 ▸ ขนาดหน้า 1–100 (ไม่ส่ง = 50 เหมือนเดิม) ◂
  const size = Math.min(Math.max(1, Math.floor(Number(input?.pageSize ?? 50)) || 50), 100);
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
    companyIds.length ? visibleCompanyIds(ctx, actor, companyIds) : Promise.resolve([] as string[]),
  ]);
  const okC = new Set(cRows.map((c) => c.id));
  const okCo = new Set(coRows);
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
      unverifiedFrom: isObj(r.routing) && (r.routing.unverifiedFrom === true || r.routing.unverifiedShopFrom === true), // CRM C5.5-fix2 ◂
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
  // CRM C5.1-fix ▸ F5: สองถัง (IP · token) นับในคำสั่งเดียว (ผ่านเมื่อผ่านทั้งคู่) ◂
  // CRM C5.4-F ▸ L4-m3: `chain` — ถัง token ถูกนับ/สร้าง **เฉพาะเมื่อถัง IP ยังผ่าน** · IP ที่เกินเพดานแล้วยิง token สุ่มใหม่
  //   ทุกครั้งเคยสร้างแถว `ChatRateBucket` ใหม่ทุกคำขอ (เพดานต่อ IP จำกัดการนับ แต่ไม่จำกัดการเขียนฐาน) ◂
  const verdicts = await checkRateLimitDbMany(
    [{ key: ipKey, ...CRM_TRACK_RATE_LIMITS.perIp }, ...(tokKey ? [{ key: tokKey, ...CRM_TRACK_RATE_LIMITS.perToken }] : [])],
    { chain: true },
  );
  return verdicts.every((v) => v.ok);
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
    const t = str(token);
    if (!emailIdOfToken(t)) return { url: null };
    if (isTrackingBot(meta?.ua)) return { url: null };
    // CRM C5.1-fix ▸ F5 (พิมพ์เขียว §12 "เขียนอย่างเดียว"): เดิม 7 รอบไปกลับ (หาอีเมล · หาผู้ติดต่อ · BEGIN/UPDATE/INSERT/ตรวจ outbox/INSERT/COMMIT)
    //   → **คำสั่งเดียว**: เงื่อนไขเดิมทุกข้อ (token รู้จัก · ขาออก · ส่งมาแล้ว ≥ 2 วินาที · ผู้ติดต่อไม่ได้ปิดการติดตาม) อยู่ใน WHERE ·
    //   ตัวนับ + แถวเหตุการณ์ + event ขาออก (idempotencyKey เดิม · ON CONFLICT = กันซ้ำแบบ emitOutbox) อยู่ในคำสั่งเดียว = atomic (X3/X4) ◂
    const cutoff = new Date(Date.now() - OPEN_MIN_AGE_MS);
    const ua = str(meta?.ua).slice(0, 200) || null;
    await prisma.$queryRaw`
      WITH m AS (
        SELECT e."id", e."tenantId", e."systemId", e."contactId", e."dealId", e."companyId", e."threadKey", e."sequenceStepId"
          FROM "CrmEmailMessage" e
         WHERE e."trackTokenHash" = ${tokenHash("o", t)} AND e."direction" = 'OUT'
           AND COALESCE(e."sentAt", e."createdAt") <= ${cutoff}
           AND NOT EXISTS (SELECT 1 FROM "CrmContact" c WHERE c."id" = e."contactId" AND c."trackingOptOut" = TRUE)
         LIMIT 1
      ), u AS (
        UPDATE "CrmEmailMessage" x
           SET "openCount" = x."openCount" + 1,
               "firstOpenedAt" = COALESCE(x."firstOpenedAt", NOW()),
               "lastOpenedAt" = NOW(),
               "status" = CASE WHEN x."status" IN ('SENT','DELIVERED') THEN 'OPENED'::"CrmEmailStatus" ELSE x."status" END
          FROM m WHERE x."id" = m."id"
        RETURNING x."id"
      ), ev AS (
        INSERT INTO "CrmEmailEvent" ("id", "tenantId", "emailId", "kind", "userAgent")
        SELECT gen_random_uuid()::text, m."tenantId", m."id", 'OPEN'::"CrmEmailEventKind", ${ua} FROM m JOIN u ON u."id" = m."id"
        RETURNING "id", "emailId"
      )
      ${emailEventOutboxSql(EVT.opened)}`;
    return { url: null };
  } catch {
    return { url: null };
  }
}

/**
 * CTE ท้ายคำสั่งนับเปิด/คลิก: event ขาออก 1 ใบต่อแถวเหตุการณ์ (ต้องมี CTE `m` = แถวอีเมล และ `ev` = แถวเหตุการณ์ที่เพิ่งเขียน)
 * payload/idempotencyKey เท่า `emitEmailEvent` ทุกช่อง (`${type}#${emailId}#${eventId}` · ช่องที่ว่างไม่ใส่) · กันซ้ำด้วย
 * @@unique(tenantId, idempotencyKey) แบบเดียวกับ emitOutbox (มีแล้ว = เงียบ)
 */
function emailEventOutboxSql(type: string): Prisma.Sql {
  return Prisma.sql`, ob AS (
    INSERT INTO "OutboxEvent" ("id", "tenantId", "systemId", "type", "payload", "idempotencyKey")
    SELECT gen_random_uuid()::text, m."tenantId", m."systemId", ${type},
           jsonb_strip_nulls(jsonb_build_object(
             'emailId', m."id", 'contactId', NULLIF(m."contactId", ''), 'dealId', NULLIF(m."dealId", ''), 'companyId', NULLIF(m."companyId", ''),
             'threadKey', m."threadKey", 'sequenceStepId', NULLIF(m."sequenceStepId", ''))),
           ${type} || '#' || m."id" || '#' || ev."id"
      FROM m JOIN ev ON ev."emailId" = m."id"
    ON CONFLICT ("tenantId", "idempotencyKey") DO NOTHING
    RETURNING "id"
  )
  SELECT (SELECT count(*) FROM ev)::int AS "n", (SELECT count(*) FROM ob)::int AS "o"`;
}

/** ข้อมูลที่ route `/t/c` ใช้ต่อท้ายตั๋วระบุตัวตน — อ่านมาในคำสั่งเดียวกับการนับ (ไม่ต้องอ่านซ้ำ · C5.1-fix) */
export type ClickTicketPre = { emailId: string; tenantId: string; systemId: string; contactId: string | null; contactTenantId: string | null; trackingOptOut: boolean; settings: unknown };

/**
 * นับคลิก แล้วคืน URL ที่ "เก็บไว้สำหรับ token นั้น" เท่านั้น
 * 🔴 AUDIT-CLASS X7: ไม่มีทางที่พารามิเตอร์ใน URL หรือ token ที่ถูกแก้จะเลือกปลายทางอื่นได้ — ปลายทาง
 *    มาจากแถวในฐานที่ผูกกับค่าย่อยของ token นั้นตัวเดียว (ไม่ใช่จากคำขอ)
 * CRM C5.1-fix ▸ F5: เดิม 10 รอบไปกลับ (อีเมล · ผู้ติดต่อ · ธุรกรรมนับ 5 · แล้ว route อ่านอีเมล/ผู้ติดต่อ/ระบบซ้ำเพื่อทำตั๋ว) →
 *   **คำสั่งเดียว**: หาอีเมลด้วย id ของ token + ลิงก์ที่ค่าย่อยตรง (ตัวแรกในลำดับเดิม · ต้องขึ้นต้น http(s)://) + ผู้ติดต่อ + ระบบ ·
 *   นับเฉพาะเมื่อ count ไม่ใช่ false · ไม่ใช่เครื่อง · ผู้ติดต่อไม่ได้ปิดการติดตาม — ผลอ่านคืนเป็น `ticket` ให้ route ทำตั๋วโดยไม่อ่านฐานอีก ◂
 */
export async function trackClick(
  token: string,
  meta: { ip: string; ua?: string | null },
  opts: { count?: boolean } = {},
): Promise<{ url: string | null; ticket?: ClickTicketPre }> {
  try {
    const t = str(token);
    const id = emailIdOfToken(t);
    if (!id) return { url: null };
    const doCount = opts.count !== false && !isTrackingBot(meta?.ua);
    const ua = str(meta?.ua).slice(0, 200) || null;
    const rows = await prisma.$queryRaw<{ url: string | null; tenantId: string; systemId: string; contactId: string | null; contactTenantId: string | null; optOut: boolean | null; settings: unknown }[]>`
      WITH m AS (
        SELECT e."id", e."tenantId", e."systemId", e."contactId", e."dealId", e."companyId", e."threadKey", e."sequenceStepId",
               (SELECT l.v->>'url'
                  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e."routing"::jsonb->'links') = 'array' THEN e."routing"::jsonb->'links' ELSE '[]'::jsonb END)
                       WITH ORDINALITY AS l(v, i)
                 WHERE jsonb_typeof(l.v) = 'object' AND jsonb_typeof(l.v->'h') = 'string' AND l.v->>'h' = ${tokenHash("c", t)}
                 ORDER BY l.i LIMIT 1) AS "url",
               c."tenantId" AS "contactTenantId", c."trackingOptOut" AS "optOut"
          FROM "CrmEmailMessage" e LEFT JOIN "CrmContact" c ON c."id" = e."contactId"
         WHERE e."id" = ${id}
         LIMIT 1
      ), go AS (
        SELECT m.* FROM m WHERE m."url" ~* '^https?://' AND ${doCount}::boolean AND COALESCE(m."optOut", FALSE) = FALSE
      ), u AS (
        UPDATE "CrmEmailMessage" x SET "clickCount" = x."clickCount" + 1 FROM go WHERE x."id" = go."id" RETURNING x."id"
      ), ev AS (
        INSERT INTO "CrmEmailEvent" ("id", "tenantId", "emailId", "kind", "url", "userAgent")
        SELECT gen_random_uuid()::text, go."tenantId", go."id", 'CLICK'::"CrmEmailEventKind", left(go."url", 2000), ${ua} FROM go JOIN u ON u."id" = go."id"
        RETURNING "id", "emailId"
      ), ob AS (
        INSERT INTO "OutboxEvent" ("id", "tenantId", "systemId", "type", "payload", "idempotencyKey")
        SELECT gen_random_uuid()::text, go."tenantId", go."systemId", ${EVT.clicked},
               jsonb_strip_nulls(jsonb_build_object(
                 'emailId', go."id", 'contactId', NULLIF(go."contactId", ''), 'dealId', NULLIF(go."dealId", ''), 'companyId', NULLIF(go."companyId", ''),
                 'threadKey', go."threadKey", 'sequenceStepId', NULLIF(go."sequenceStepId", ''))),
               ${EVT.clicked} || '#' || go."id" || '#' || ev."id"
          FROM go JOIN ev ON ev."emailId" = go."id"
        ON CONFLICT ("tenantId", "idempotencyKey") DO NOTHING
        RETURNING "id"
      )
      SELECT m."url", m."tenantId", m."systemId", m."contactId", m."contactTenantId", m."optOut",
             (SELECT s."settings" FROM "AppSystem" s WHERE s."id" = m."systemId" AND s."tenantId" = m."tenantId" AND s."type" = 'CRM' LIMIT 1) AS "settings",
             (SELECT count(*) FROM ob)::int AS "o"
        FROM m`;
    const r = rows[0];
    const url = r?.url && /^https?:\/\//i.test(String(r.url)) ? String(r.url) : null;
    if (!r || !url) return { url: null };
    return {
      url,
      ticket: { emailId: id, tenantId: r.tenantId, systemId: r.systemId, contactId: r.contactId, contactTenantId: r.contactTenantId, trackingOptOut: r.optOut === true, settings: r.settings },
    };
  } catch {
    return { url: null };
  }
}

/**
 * ยกเลิกรับอีเมล — คืน `{ ok: true }` **เสมอ** ไม่ว่า token จะรู้จักหรือไม่ (ไม่มีเครื่องทำนาย token ที่ใช้ได้)
 * 🔴 ทำงานแม้ร้านกลับไป uiVersion 1 (มติผู้คุมงาน ข้อ 7): การยกเลิกรับตามกฎหมายห้ามขึ้นกับสวิตช์หน้าจอ
 */
/**
 * CRM C5.4-F ▸ L4-m2 (มติผู้คุมงาน ข้อ 4 · 28 ก.ย.): token เลิกรับที่ **ถูกต้อง** ต้องได้ผลเสมอ ไม่ว่าถังความถี่จะเต็มแค่ไหน
 *   (Gmail/Yahoo ยิง one-click จากฝั่งเซิร์ฟเวอร์ผ่าน IP ชุดเล็กที่ใช้ร่วมกันทุกร้าน — การเลิกรับห้ามหายเงียบ)
 *   `rateLimited: true` = ผู้เรียกเต็มเพดานแล้ว ⇒ token ที่ไม่รู้จักจบที่การอ่าน 1 แถว (ไม่เขียนอะไร) · token จริงพลิกธงตามปกติ
 *   และเขียนแถวเหตุการณ์เฉพาะรอบที่ธงพลิกจริง (การยิงซ้ำตอนเต็มเพดาน = ไม่มีการเขียนเพิ่ม) · audit เขียนเฉพาะรอบที่พลิกจริงเสมอ ◂
 */
export async function unsubscribe(token: string, meta?: { ip?: string; ua?: string | null; rateLimited?: boolean }): Promise<{ ok: true }> {
  try {
    const row = await messageOfToken("u", str(token));
    if (!row || !row.contactId) return { ok: true };
    const ctx = { tenantId: row.tenantId, systemId: row.systemId };
    // กติกาถาวร (ข้อสอบ C1.4-S0.8): คอลัมน์ที่มีเจ้าของของ `CrmContact` เขียนได้จาก `contacts*.ts`/`consents.ts`
    //   เท่านั้น ⇒ ธง "ขอไม่รับ" พลิกผ่านตัวเขียนแคบ ๆ ของ `contacts.ts` (มีเงื่อนไข · คืน "พลิกจริงไหม")
    const contactId = row.contactId;
    // CRM C5.4-F ▸ hunt INFO: เต็มเพดาน + ขอไม่รับอยู่แล้ว ⇒ จบที่การอ่าน (ไม่เปิดธุรกรรมทุกคำขอ) ◂
    if (meta?.rateLimited === true) {
      const cur = await prisma.crmContact.findFirst({ where: { id: contactId, tenantId: row.tenantId }, select: { emailOptOut: true } });
      if (!cur || cur.emailOptOut) return { ok: true };
    }
    const flipped = await prisma.$transaction((tx) => contacts.markEmailOptOutInTx(tx, ctx, contactId));
    if (flipped) {
      await consents
        .set({ ...ctx, actorUserId: null }, SYSTEM_ACTOR, row.contactId, { channel: "EMAIL", granted: false, source: "UNSUBSCRIBE", note: "ลูกค้ากดยกเลิกรับจากลิงก์ในอีเมล" })
        .catch(() => null);
      await stopSequencesFor(ctx, row.contactId, "OPT_OUT");
    }
    if (!flipped && meta?.rateLimited === true) return { ok: true };
    await prisma.crmEmailEvent
      .create({ data: { tenantId: row.tenantId, emailId: row.id, kind: "UNSUBSCRIBE", providerEventId: `unsub:${row.id}`, userAgent: str(meta?.ua).slice(0, 200) || null } })
      .catch(() => null);
    if (!flipped) return { ok: true };
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

/**
 * CRM C5.4-B ▸ L5-M4: ลูกค้ากด "ไม่ต้องติดตามการเปิดอ่าน" จากหน้า /u/<token> (ยังรับอีเมลได้) — พลิก `trackingOptOut` ผ่านตัวเขียนแคบของ
 * contacts.ts (มีเงื่อนไข · ครั้งเดียว) + audit เฉพาะรอบที่พลิกจริง · token ไม่รู้จัก = ไม่ทำอะไร แต่ตอบเหมือนกัน (X7 ไม่มีเครื่องทำนาย token)
 * 🔴 ไม่ผ่านถังความถี่ (มติ F8 ใหม่ · C5.3: คำขอเลิกของลูกค้าห้ามถูกทิ้ง) — token ที่ใช้ได้เขียนฐานได้ครั้งเดียว (พลิกแล้วรอบหลังไม่เขียน)
 */
export async function stopTracking(token: string, meta?: { ip?: string; ua?: string | null }): Promise<{ ok: true }> {
  try {
    const row = await messageOfToken("u", str(token));
    if (!row || !row.contactId) return { ok: true };
    const ctx = { tenantId: row.tenantId, systemId: row.systemId };
    const contactId = row.contactId;
    const flipped = await prisma.$transaction((tx) => contacts.markTrackingOptOutInTx(tx, ctx, contactId));
    if (flipped) {
      await writeAudit({
        tenantId: row.tenantId,
        actorId: null,
        actorType: "SYSTEM",
        action: "crm.contact.tracking_opt_out",
        targetType: "CrmContact",
        targetId: contactId,
        after: { trackingOptOut: true, source: "UNSUBSCRIBE_PAGE", emailId: row.id, ua: str(meta?.ua).slice(0, 120) || null },
      });
    }
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

// CRM C5.4-D ▸ L3-m2: ขั้น "หลัง commit" ของเหตุการณ์ตีกลับ/แจ้งสแปม — idempotent และถูกเรียกซ้ำเมื่อ Svix ยิงซ้ำ
//   เดิม: tx บันทึกแถวเหตุการณ์ (providerEventId unique) + ธง แล้ว "หลัง commit" ค่อยเขียนแถวถอนความยินยอม (กลืน error) + หยุดลำดับ
//   ⇒ เครื่องดับ/ฐานสะดุดตรงนั้น = การยิงซ้ำทุกครั้งชนกุญแจ → ตอบ 200 "replay" → ขั้นเหล่านั้นไม่เคยเกิดอีกเลย
//   (สมุด PDPA ไม่มีแถวถอน · ลำดับที่ส่ง LINE/SMS ยังเดินต่อ) · และ error ชั่วคราวของ consents.set ทำแถวหายถาวรแม้ไม่มีเครื่องดับ
//   ตอนนี้: ขั้นเหล่านี้ล้มแบบชั่วคราว = โยน ⇒ ผู้เรียกตอบ 500 (Svix ยิงใหม่) · การยิงซ้ำ (ชนกุญแจ) เรียกขั้นเหล่านี้อีกครั้ง
//   🔴 การยิงซ้ำทำเฉพาะเมื่อผู้ติดต่อ "ยังอยู่ในสถานะที่เหตุการณ์นั้นตั้งไว้" (ยังขอไม่รับ/ยังเป็นอีเมลเด้ง) — ลูกค้าที่กลับมาให้ความยินยอม
//      ใหม่หลังเหตุการณ์ต้องไม่ถูกถอนซ้ำโดยการยิงซ้ำที่มาช้า (แถวถอนเขียนเมื่อความยินยอมอีเมลยังไม่ถูกถอน และไม่มีใครแก้หลังเหตุการณ์)
//   error ถาวร (ผู้ติดต่อถูกรวม/สมาชิกที่ผูกหายไป — VALIDATION/CONFLICT/NOT_FOUND/FORBIDDEN) = WARN แล้วเดินต่อ ไม่ให้ Svix ยิงวนไม่รู้จบ ◂
const PERMANENT_AFTER_STEP = new Set(["VALIDATION", "CONFLICT", "NOT_FOUND", "FORBIDDEN"]);

const isPermanentAfterStep = (e: unknown) => PERMANENT_AFTER_STEP.has(String((e as { code?: unknown })?.code ?? ""));
async function warnAfterStep(tenantId: string, what: string, e: unknown): Promise<void> {
  await logOps("WARN", "crm.email.webhook", what, { tenantId, detail: (e instanceof Error ? e.name : "Error").slice(0, 80) }).catch(() => {});
}

// CRM C5.4-D r2 ▸ (มติผู้คุมงาน) S4: แถวถอนความยินยอมเขียนด้วย `consents.set(..., { ifChanged: true })` — ตรวจ "มีอะไรต้องเปลี่ยนไหม" ซ้ำ
//   ภายใต้ล็อกแถวผู้ติดต่อ ⇒ ยิงซ้ำพร้อมกันกี่ทางก็ได้แถว/event/สมุดตรวจเดียว (เดิมอ่านก่อนแล้วค่อยเขียน = สองแถว)
//   N2: การยิงซ้ำหยุดเฉพาะแถวลงทะเบียนที่มีอยู่ก่อน/พร้อมเหตุการณ์ (`eventAt`) — แถวที่พนักงานลงทะเบียนใหม่หลังจากนั้นไม่ถูกหยุด
//   N3: การอ่านความยินยอมตอนยิงซ้ำอยู่ใต้กติกา error ถาวรเดียวกัน (NOT_FOUND ที่มีรหัส ≠ ให้ Svix ยิงวนหลายวัน) ◂
async function complaintAfterSteps(ctx: { tenantId: string; systemId: string }, contactId: string, flipped: boolean | null, eventAt: Date | null): Promise<{ consent: boolean; stopped: number }> {
  const c = await prisma.crmContact.findFirst({ where: { id: contactId, tenantId: ctx.tenantId }, select: { emailOptOut: true, mergedIntoId: true } });
  if (!c) return { consent: false, stopped: 0 };
  // ยิงซ้ำ (flipped = null): สถานะขอไม่รับถูกยกเลิกไปแล้ว = ผลของเหตุการณ์นี้ถูกแทนที่ ⇒ ไม่แตะอะไร
  if (flipped === null && !c.emailOptOut) return { consent: false, stopped: 0 };
  let write = flipped === true;
  if (flipped === null && !c.mergedIntoId) {
    try {
      const view = await consents.current({ ...ctx, actorUserId: null }, SYSTEM_ACTOR, contactId);
      const email = view.channels.find((ch) => ch.channel === "EMAIL");
      const changedAt = email?.at ? new Date(email.at).getTime() : 0;
      write = email?.granted !== false && (!eventAt || changedAt <= eventAt.getTime());
    } catch (e) {
      if (!isPermanentAfterStep(e)) throw e;
      write = false;
      await warnAfterStep(ctx.tenantId, "อ่านความยินยอมของผู้ติดต่อตอนประมวลผลแจ้งสแปมซ้ำไม่ได้ (ข้อมูลผู้ติดต่อไม่พร้อม)", e);
    }
  }
  let consent = false;
  if (write && !c.mergedIntoId) {
    try {
      // ที่มาใช้ค่าเดียวกับการกดยกเลิกรับ (`UNSUBSCRIBE` — ทะเบียนที่มาเป็นของใบ C1.x ไม่มีค่า COMPLAINT)
      const r = await consents.set(
        { ...ctx, actorUserId: null },
        SYSTEM_ACTOR,
        contactId,
        { channel: "EMAIL", granted: false, source: "UNSUBSCRIBE", note: "ผู้ให้บริการอีเมลแจ้งว่าลูกค้ากดรายงานว่าเป็นสแปม" },
        { ifChanged: true },
      );
      consent = r.unchanged !== true;
    } catch (e) {
      if (!isPermanentAfterStep(e)) throw e;
      await warnAfterStep(ctx.tenantId, "บันทึกการถอนความยินยอมหลังแจ้งสแปมไม่ได้ (ข้อมูลผู้ติดต่อไม่พร้อม)", e);
    }
  }
  const seq = await import("./sequences");
  const stopped = await seq.stopFor(ctx, contactId, "OPT_OUT", flipped === null ? { enrolledAtOrBefore: eventAt } : {});
  return { consent, stopped };
}

async function bounceAfterSteps(ctx: { tenantId: string; systemId: string }, contactId: string, replay: boolean, eventAt: Date | null = null): Promise<number> {
  if (replay) {
    const c = await prisma.crmContact.findFirst({ where: { id: contactId, tenantId: ctx.tenantId }, select: { emailBouncedAt: true } });
    if (!c?.emailBouncedAt) return 0; // ธงเด้งถูกล้างไปแล้ว (แก้อีเมล/ผู้ดูแลล้าง) = ไม่หยุดซ้ำ
  }
  const seq = await import("./sequences");
  // CRM C5.4-D r2 ▸ N2 (กติกาเดียวกับแจ้งสแปม): การยิงซ้ำหยุดเฉพาะแถวที่มีอยู่ก่อน/พร้อมเหตุการณ์ ◂
  return seq.stopFor(ctx, contactId, "BOUNCE", replay ? { enrolledAtOrBefore: eventAt } : {});
}

/** ขั้นหลัง commit ล้มแบบชั่วคราว ⇒ 500 ให้ Svix ยิงใหม่ (การยิงซ้ำเรียกขั้นเหล่านี้อีกครั้ง) */
async function afterStepsFailed(tenantId: string, what: string, e: unknown): Promise<ProviderWebhookResult> {
  await logOps("WARN", "crm.email.webhook", `ขั้นหลังบันทึก${what}ไม่สำเร็จ — ผู้ให้บริการจะส่งเหตุการณ์ซ้ำแล้วระบบทำขั้นนี้ใหม่`, {
    tenantId,
    detail: (e instanceof Error ? e.name : "Error").slice(0, 80),
  }).catch(() => {});
  return { status: 500, handled: false, reason: "after_steps_failed" };
}
// ◂ CRM C5.4-D

/**
 * CRM C5.4-D2 ▸ F2: แถวขาออกที่ยังไม่มี providerId จาก Message-ID ของ webhook (`<rfcId>` ที่เราตั้งเองตอนส่ง) — `null` เมื่อ:
 *   ไม่ใช่ id ของโดเมนเรา (จดหมายของระบบอื่นในบัญชีผู้ให้บริการเดียวกัน) · ไม่พบ · พบมากกว่าหนึ่ง (ไม่เดา)
 *   เทียบท้ายคอลัมน์ `messageId` (= `<systemId>:<rfcId>`) แบบไม่สนตัวพิมพ์ · ⚠️ ไม่มีดัชนีรองรับ (เช่นเดียวกับการหาด้วย providerId เดิม)
 *   แต่ทางนี้ทำงานเฉพาะเมื่อหาด้วย providerId ไม่เจอ และ id เป็นของโดเมนเรา ◂
 */
async function outRowWithoutProviderId(raw: unknown, fromRaw: unknown): Promise<CrmEmailMessage | null> {
  const rfc = bareId(raw).toLowerCase();
  if (!rfc || hasLineBreak(rfc) || rfc.length > 300 || !rfc.endsWith(`@${CRM_EMAIL_SHARK_DOMAIN}`)) return null;
  const tail = `:${rfc}`;
  // CRM C5.4-D2 r2 ▸ S3(b) (รีวิว D2-S3): เฉพาะแถวที่ทางส่งของเรา (`sendCore`) เขียน — มี `routing.fromAddr` · แถว "สำเนาเก็บ" (BCC-capture ของ
  //   ingestInbound: OUT · providerId NULL · routing NULL · messageId `<ระบบอื่น>:<rfc ของเรา>`) ไม่มีทางถูกจับคู่ ⇒ แจ้งสแปมของจดหมายร้าน A
  //   ไม่มีทางแตะแถว/ผู้ติดต่อของร้าน B (และไม่ทำให้เจอสองแถวจนทางนี้ใช้ไม่ได้) ◂
  const hits = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "CrmEmailMessage"
     WHERE "direction" = 'OUT' AND "providerId" IS NULL AND lower(right("messageId", ${tail.length}::int)) = ${tail}
       AND jsonb_typeof("routing") = 'object' AND jsonb_exists("routing", 'fromAddr')
     LIMIT 2`;
  if (hits.length !== 1) return null;
  const row = await prisma.crmEmailMessage.findUnique({ where: { id: hits[0]!.id } });
  if (!row) return null;
  // CRM C5.4-D2 r2 ▸ S3(b): ผู้ส่งในเหตุการณ์ (ถ้ามี) ต้องเป็นผู้ส่งของแถว — Message-ID ตรงแต่ผู้ส่งต่าง = ไม่ใช่จดหมายฉบับนี้ ◂
  const evFrom = bareEmail(fromRaw);
  if (evFrom && evFrom !== bareEmail(row.fromAddr)) return null;
  return row;
}

/** CRM C5.4-D2 r2 ▸ S3(a): ชนิดเหตุการณ์ที่ใช้ทางหาด้วย Message-ID (และเติม providerId) ได้ — ชนิดอื่น (เช่น `email.received`) ไม่แตะแถว ◂ */
const MESSAGE_ID_FALLBACK_TYPES = new Set(["email.sent", "email.delivered", "email.bounced", "email.complained"]);

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
  let row = await prisma.crmEmailMessage.findFirst({ where: { providerId } });
  // CRM C5.4-D2 ▸ F2 (รีวิว C5.4-D รอบ 3): แถวที่ยังไม่รู้รหัสของผู้ให้บริการ (คำตอบของการส่งหายระหว่างทาง ⇒ FAILED รอส่งซ้ำ · หรือ SENT
  //   "ยืนยันไม่ได้" ของบิลด์ก่อน) เดิมหา webhook ไม่เจอ ⇒ แจ้งสแปม/เด้งถาวรของจดหมายฉบับนั้นหายเงียบ (ลูกค้าไม่ถูกตัดสิทธิ์ ลำดับไม่หยุด)
  //   ⇒ หาด้วย Message-ID ของจดหมาย (`data.message_id` = หัว Message-ID ที่เราตั้งเอง) · ด่าน: ลายเซ็น Svix ผ่านแล้ว · id ต้องเป็นของ
  //   โดเมนเรา · แถวขาออกที่ **ยังไม่มี** providerId เท่านั้น (แถวที่มี id อื่นอยู่แล้ว = ไม่ใช่ฉบับนี้) · เติม providerId แบบมีเงื่อนไข
  //   (`providerId IS NULL`) ⇒ webhook ถัดไปหาเจอตรง ๆ · การยิงซ้ำกันด้วย svix-id (unique) ตามเดิม — ไม่เขียนซ้ำ ◂
  let byMessageId = false;
  if (!row && MESSAGE_ID_FALLBACK_TYPES.has(type)) {
    row = await outRowWithoutProviderId(data.message_id ?? data.messageId, data.from);
    if (row) {
      byMessageId = true;
      await prisma.crmEmailMessage.updateMany({ where: { id: row.id, providerId: null }, data: { providerId } }).catch(() => null);
    }
  }
  if (!row) return { status: 200, handled: false, reason: "unknown_email" };
  const eventId = str(headers["svix-id"]) || `${type}:${providerId}`;
  const ctx = { tenantId: row.tenantId, systemId: row.systemId };

  if (type === "email.delivered") {
    // CRM C5.4-D2 ▸ F2: แถวที่หาเจอด้วย Message-ID เปลี่ยนได้เฉพาะ SENT — แถว FAILED/QUEUED (รอ/กำลังส่งซ้ำ) ปล่อยให้การส่งซ้ำปิดงานเอง
    //   (ถ้าเปลี่ยนเป็น DELIVERED ระหว่างส่งซ้ำ เงื่อนไข QUEUED→SENT ของการส่งซ้ำจะไม่ผ่าน = ไม่มีกิจกรรม/event "ส่งแล้ว") ◂
    await prisma.crmEmailMessage.updateMany({ where: { id: row.id, status: { in: byMessageId ? ["SENT"] : ["QUEUED", "SENT"] } }, data: { status: "DELIVERED" } });
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
      if (isUniqueViolation(e)) {
        // CRM C5.4-D ▸ L3-m2: ยิงซ้ำ = ทำขั้นหลัง commit ซ้ำแบบ idempotent (ครั้งก่อนอาจดับก่อนถึง) ◂
        if (!row.contactId) return { status: 200, handled: true, reason: "replay" };
        try {
          const bev = await prisma.crmEmailEvent.findUnique({ where: { providerEventId: eventId }, select: { at: true } });
          const stopped = await bounceAfterSteps(ctx, row.contactId, true, bev?.at ?? null);
          if (stopped > 0) {
            await writeAudit({ tenantId: row.tenantId, actorId: null, actorType: "SYSTEM", action: "crm.email.bounced", targetType: "CrmEmailMessage", targetId: row.id, after: { kind: "BOUNCE", replay: true, stopped } });
          }
        } catch (e2) {
          return afterStepsFailed(row.tenantId, "อีเมลตีกลับ", e2);
        }
        return { status: 200, handled: true, reason: "replay" };
      }
      await logOps("WARN", "crm.email.webhook", "บันทึกเหตุการณ์อีเมลตีกลับไม่สำเร็จ", {
        tenantId: row.tenantId,
        detail: (e instanceof Error ? e.name : "Error").slice(0, 80),
      }).catch(() => {});
      return { status: 500, handled: false, reason: "db_error" };
    }
    // CRM C5.4-D ▸ L3-m2: ขั้นหลัง commit ล้ม = 500 (เดิมกลืนเงียบ) — Svix ยิงซ้ำแล้วเส้น "ยิงซ้ำ" ข้างบนทำให้ครบ ◂
    if (row.contactId) {
      try {
        await bounceAfterSteps(ctx, row.contactId, false);
      } catch (e2) {
        return afterStepsFailed(row.tenantId, "อีเมลตีกลับ", e2);
      }
    }
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
      if (isUniqueViolation(e)) {
        // CRM C5.4-D ▸ L3-m2: ยิงซ้ำ = ทำขั้นหลัง commit ซ้ำแบบ idempotent (แถวถอนความยินยอม + หยุดลำดับ) — ครั้งก่อนอาจดับก่อนถึง ◂
        if (!row.contactId) return { status: 200, handled: true, reason: "replay" };
        try {
          const ev = await prisma.crmEmailEvent.findUnique({ where: { providerEventId: eventId }, select: { at: true } });
          const r = await complaintAfterSteps(ctx, row.contactId, null, ev?.at ?? null);
          if (r.consent || r.stopped > 0) {
            await writeAudit({ tenantId: row.tenantId, actorId: null, actorType: "SYSTEM", action: "crm.email.complained", targetType: "CrmEmailMessage", targetId: row.id, after: { kind: "COMPLAINT", replay: true, consentWritten: r.consent, stopped: r.stopped } });
          }
        } catch (e2) {
          return afterStepsFailed(row.tenantId, "การแจ้งสแปม", e2);
        }
        return { status: 200, handled: true, reason: "replay" };
      }
      await logOps("WARN", "crm.email.webhook", "บันทึกเหตุการณ์แจ้งสแปมไม่สำเร็จ", {
        tenantId: row.tenantId,
        detail: (e instanceof Error ? e.name : "Error").slice(0, 80),
      }).catch(() => {});
      return { status: 500, handled: false, reason: "db_error" };
    }
    if (row.contactId) {
      // 🔴 การแจ้งสแปมคือ "ถอนความยินยอม" ที่หนักที่สุดที่ลูกค้าทำได้ — ต้องมีแถวประวัติความยินยอมเหมือน
      //    การกดลิงก์ยกเลิกรับ ไม่ใช่แค่ธงบูลีนบนผู้ติดต่อ (หน้าความยินยอม/รายงาน PDPA อ่านจากแถวนั้น
      //    และการรวมผู้ติดต่อ/ซิงก์ฝั่งสมาชิกก็เดินตามแถวนั้น) · ครั้งแรก: แถวถอนเขียนเมื่อรอบนี้เป็นคนพลิกธง (เหมือนเดิม)
      // CRM C5.4-D ▸ L3-m2: ขั้นเหล่านี้ล้มแบบชั่วคราว = 500 (เดิม `.catch(() => null)` กลืนแถวถอนหายถาวร) ◂
      try {
        await complaintAfterSteps(ctx, row.contactId, flipped, null);
      } catch (e2) {
        return afterStepsFailed(row.tenantId, "การแจ้งสแปม", e2);
      }
    }
    await writeAudit({ tenantId: row.tenantId, actorId: null, actorType: "SYSTEM", action: "crm.email.complained", targetType: "CrmEmailMessage", targetId: row.id, after: { kind: "COMPLAINT" } });
    return { status: 200, handled: true };
  }

  return { status: 200, handled: false, reason: "ignored_type" };
}

// ───────────────────────── ล้างเนื้อความตามอายุเก็บ (ผู้ลงทะเบียนงานรายวัน = C2.10 · R-A) ─────────────────────────

/**
 * CRM C2.10 ▸ ล้างเนื้อจดหมายที่เกินอายุเก็บของแต่ละระบบ (มติผู้คุมงานรอบแก้ 25 ก.ย. 2569 ข้อ 6 — B4)
 *   🔴 เฉพาะระบบ `settings.crm.uiVersion = 2` **กรองใน SQL** แบบเดียวกับรอบกวาดใหม่ทั้งสามของใบ C2.10
 *      (R-E.14 = ประตูของทุกงานในใบนี้ · งานรายวัน `crm.purge.email` เป็นผู้เรียกจริงตัวเดียว)
 *      ต่างจาก `tracking.purgeWeb` ที่ค่าปริยายยังครอบระบบ v1 เพราะมติ C2.6 ข้อ 7 + ข้อสอบ `C2.6-U.5` สั่งไว้ชัด
 *   🔴 งบเวลา: เคารพ `deadline`/`signal` — หยุด **ระหว่างรอบย่อย 200 ฉบับ** (ไม่มีสถานะค้างกลางฉบับ) ◂
 */
export async function purgeBodies(
  now: Date,
  opts: { tenantIds?: string[]; systemIds?: string[]; deps?: { del?: DeleteDeps["del"] }; deadline?: number; signal?: AbortSignal } = {},
): Promise<{ purged: number; eventsPurged: number }> {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const tenantIds = Array.isArray(opts.tenantIds) ? opts.tenantIds.filter((t) => typeof t === "string" && t) : undefined;
  const systemIds = Array.isArray(opts.systemIds) ? opts.systemIds.filter((x) => typeof x === "string" && x) : undefined;
  if ((tenantIds && tenantIds.length === 0) || (systemIds && systemIds.length === 0)) return { purged: 0, eventsPurged: 0 };
  const stop = () => !!opts.signal?.aborted || (typeof opts.deadline === "number" && Date.now() > opts.deadline - 500);
  const systems = await prisma.appSystem.findMany({
    where: {
      type: "CRM",
      // 🔴 มติผู้คุมงาน 25 ก.ย. (กลับมติ B4 ตาม C2.6 ข้อ 7): การล้างเนื้ออีเมลเป็น **หน้าที่ตามกฎหมาย (retention)** จึงครอบทุกระบบ CRM
      //    รวมร้านที่ยังเป็นรุ่น 1 (ร้านที่เคยเปิดรุ่น 2 แล้วปิดกลับ ต้องไม่เก็บเนื้อหาเกินกำหนด) — ไม่กรอง uiVersion ที่นี่
      ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
      ...(systemIds ? { id: { in: systemIds } } : {}),
    },
    select: { id: true, tenantId: true, settings: true },
  });
  let purged = 0;
  let eventsPurged = 0;
  for (const sys of systems) {
    if (stop()) return { purged, eventsPurged };
    const days = crmEmailSettingsOf(sys.settings).retentionDays;
    const cutoff = new Date(at.getTime() - days * 86_400_000);
    for (let round = 0; round < 50; round += 1) {
      if (stop()) return { purged, eventsPurged };
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
        // CRM C3.9 ▸ AUDIT-CLASS X5: จองแถวก่อนด้วยการล้างแบบมีเงื่อนไข (`purgedAt IS NULL`) — สองรอบที่วิ่งซ้อนกัน
        //   (route + crontab · รอบที่ 2 เหลื่อมเวลา) นับ/ลบไฟล์แนบของฉบับเดียวกันได้ **ครั้งเดียว** (เดิม: ลบไฟล์ก่อน แล้ว update
        //   ไม่มีเงื่อนไข ⇒ ซ้อนกัน = นับ 2 และยิงลบไฟล์ 2 ครั้ง) · ไฟล์แนบลบหลังจองได้ (ลบไม่สำเร็จ = OpsEvent จากตัวลบกลาง) ◂
        const claimed = await prisma.crmEmailMessage.updateMany({
          where: { id: r.id, purgedAt: null },
          data: { bodyHtml: null, bodyText: null, snippet: null, attachments: Prisma.DbNull, purgedAt: at },
        });
        if (claimed.count !== 1) continue;
        for (const a of attachmentsOf({ attachments: r.attachments })) {
          await deleteFileAsset({ tenantId: sys.tenantId }, a.fileId, opts.deps?.del ? { del: opts.deps.del } : undefined).catch(() => null);
        }
        purged += 1;
      }
      if (rows.length < 200) break;
    }
    // CRM C5.4-B ▸ L5-m5: เหตุการณ์เปิดอ่าน/คลิก (url · user agent · เวลา ต่อคน) มีอายุเก็บเดียวกับเนื้อจดหมาย — ลบที่เก่ากว่า cutoff
    //   (BOUNCE / COMPLAINT / REPLY / UNSUBSCRIBE คงไว้: เป็นหลักฐานความยินยอม/การส่งไม่ถึง ไม่ใช่ข้อมูลติดตามพฤติกรรม) · ทีละ 1,000 แถว เคารพงบเวลา ◂
    for (let round = 0; round < 50; round += 1) {
      if (stop()) return { purged, eventsPurged };
      const n = Number(
        await prisma.$executeRaw`
          DELETE FROM "CrmEmailEvent" WHERE "id" IN (
            SELECT e."id" FROM "CrmEmailEvent" e JOIN "CrmEmailMessage" m ON m."id" = e."emailId"
             WHERE m."systemId" = ${sys.id} AND m."tenantId" = ${sys.tenantId} AND e."kind"::text IN ('OPEN', 'CLICK') AND e."at" <= ${cutoff}
             LIMIT 1000)`,
      );
      eventsPurged += n;
      if (n < 1000) break;
    }
  }
  return { purged, eventsPurged };
}
