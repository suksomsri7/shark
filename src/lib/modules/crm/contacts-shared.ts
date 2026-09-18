// contacts-shared.ts — ค่าคงที่ · ชนิด · ตัวตรวจของ "ผู้ติดต่อ" CRM v2 ที่หน้า 'use client' import ได้ (ใบ C1.4)
//
// 🔴 ไฟล์นี้บริสุทธิ์: ห้าม import prisma / core db / server-only / `./contacts` (ข้อสอบ C1.4-S0.4 · COMMON "use client")
//    ตัวตรวจชุดเดียวกันใช้ทั้งฝั่งฟอร์ม (ตรวจก่อนส่ง) และฝั่งบริการ (ตัดสินจริง) — ข้อความไทยตรงกันสองฝั่ง
// 🔴 เพดาน (CONTRACT BLOCK ของข้อสอบ): นำเข้า 50,000 แถว / 10 MB · bulk ≤ 500 · เหตุผล ≥ 5 · แท็ก ≤ 50 (ตัวละ ≤ 64) · ชื่อ ≤ 200

import { emailProblem, phoneProblem } from "./companies-shared";

export { emailProblem, phoneProblem };

// ───────────────────────── เพดาน ─────────────────────────

export const CONTACT_IMPORT_MAX_ROWS = 50_000;
/** ขนาดไบต์ (UTF-8) ของ `JSON.stringify(rows)` */
export const CONTACT_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
/**
 * เพดานชั่วคราวของการนำเข้าแบบ "ตอบผลทันที" (รีวิว C1.4 S4) — งานเบื้องหลังจริง (ตาราง job) มากับ C2.0 ·
 * 50,000 แถว / 10 MB ข้างบนคือเพดานของ job · ระหว่างนี้เกิน 5,000 แถว = ให้แบ่งไฟล์
 */
export const CONTACT_IMPORT_INLINE_MAX_ROWS = 5_000;
/** นำเข้าทีละชุด (มติผู้คุมงาน C1.4 ข้อ 4) */
export const CONTACT_IMPORT_BATCH = 200;
/** แถวผิดที่รายงานกลับได้สูงสุด (ที่เหลือนับใน failed) */
export const CONTACT_IMPORT_ERRORS_MAX = 500;
export const CONTACT_BULK_MAX = 500;
export const CONTACT_REASON_MIN = 5;
export const CONTACT_TAGS_MAX = 50;
export const CONTACT_TAG_MAX = 64;
export const CONTACT_NAME_MAX = 200;
/** ตำแหน่ง · แผนก · คำนำหน้า ฯลฯ */
export const CONTACT_TEXT_MAX = 200;
export const CONTACT_PAGE_MAX = 200;
export const CONTACT_EXPORT_MAX_ROWS = 20_000;
/** ความยาวสูงสุดของค่าแต่ละช่องใน sourceDetail (utm / url) */
export const CONTACT_SOURCE_TEXT_MAX = 500;

// ───────────────────────── ป้าย ─────────────────────────

export const LIFECYCLE_STAGES = ["LEAD", "PROSPECT", "CUSTOMER", "LOST", "CHURNED"] as const;
export type ContactLifecycle = (typeof LIFECYCLE_STAGES)[number];
export const LIFECYCLE_LABEL: Record<ContactLifecycle, string> = {
  LEAD: "ผู้สนใจ (lead)",
  PROSPECT: "มีโอกาส (prospect)",
  CUSTOMER: "ลูกค้า",
  LOST: "ไม่ไปต่อ",
  CHURNED: "เลิกเป็นลูกค้า",
};

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "NURTURE"] as const;
export type ContactLeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABEL: Record<ContactLeadStatus, string> = {
  NEW: "ใหม่",
  CONTACTED: "ติดต่อแล้ว",
  QUALIFIED: "มีโอกาส",
  UNQUALIFIED: "ไม่ตรงกลุ่ม",
  NURTURE: "รอบ่มเพาะ",
};

export const SCORE_BANDS = ["HOT", "WARM", "COLD"] as const;
export type ContactScoreBand = (typeof SCORE_BANDS)[number];
export const SCORE_BAND_LABEL: Record<ContactScoreBand, string> = { HOT: "ร้อน", WARM: "อุ่น", COLD: "เย็น" };

/** ที่มา (enum MemberSource — ชุดเดียวกับสมาชิก D10) */
export const CONTACT_SOURCES = [
  "WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT", "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER",
] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];
export const CONTACT_SOURCE_LABEL: Record<ContactSource, string> = {
  WALK_IN: "เดินเข้าร้าน",
  POS: "ขายหน้าร้าน",
  BOOKING: "ระบบจอง",
  LINE_OA: "LINE OA",
  LIFF: "LINE (LIFF)",
  WEB_FORM: "ฟอร์มบนเว็บ",
  CHAT: "แชท",
  REFERRAL: "เพื่อนแนะนำ",
  IMPORT: "นำเข้าไฟล์",
  CRM: "เพิ่มใน CRM",
  CAMPAIGN: "แคมเปญ",
  API: "ระบบภายนอก (API)",
  MARKETPLACE: "มาร์เก็ตเพลส",
  APP: "แอป",
  OTHER: "อื่น ๆ",
};

/** ที่มาของความยินยอมที่บันทึกฝั่ง CRM (ค่าที่ตรงกับ enum ของสมาชิกส่งต่อได้ตรง ๆ · ที่เหลือแปลงตอนเขียนฝั่งสมาชิก) */
export const CONSENT_SOURCES = ["STAFF", "IMPORT", "API", "SIGNUP_FORM", "LIFF", "CUSTOMER_SELF", "WEB_FORM", "CHAT", "PORTAL", "UNSUBSCRIBE"] as const;
export type ContactConsentSource = (typeof CONSENT_SOURCES)[number];
export const CONSENT_SOURCE_LABEL: Record<ContactConsentSource, string> = {
  STAFF: "พนักงานบันทึก",
  IMPORT: "นำเข้าไฟล์",
  API: "ระบบภายนอก (API)",
  SIGNUP_FORM: "ฟอร์มสมัคร",
  LIFF: "LINE (LIFF)",
  CUSTOMER_SELF: "ลูกค้าตั้งเอง",
  WEB_FORM: "ฟอร์มบนเว็บ",
  CHAT: "แชท",
  PORTAL: "พอร์ทัลลูกค้า",
  UNSUBSCRIBE: "กดเลิกรับข่าวสาร",
};
/**
 * แถวประวัติ "ไม่รับข่าวสารการตลาด" (setOptOut) ใช้ช่องทางเทียมนี้ — ไม่ใช่ความยินยอมรายช่องทาง
 * (granted=false = ขอไม่รับ · true = ยกเลิกการขอไม่รับ) · ไม่ปรากฏใน current() และไม่ถูกคัดลอกไปฝั่งสมาชิก
 */
export const OPT_OUT_CHANNEL = "MARKETING";

/** เป้าหมายของคอลัมน์ตอนนำเข้า ("" = ข้ามคอลัมน์นี้ · `f.<key>` = ฟิลด์กำหนดเอง) */
export const IMPORT_TARGETS = ["firstName", "lastName", "phone", "email", "jobTitle", "tags", "company"] as const;
export type ImportTarget = (typeof IMPORT_TARGETS)[number] | `f.${string}` | "";
export const IMPORT_TARGET_LABEL: Record<(typeof IMPORT_TARGETS)[number], string> = {
  firstName: "ชื่อจริง",
  lastName: "นามสกุล",
  phone: "เบอร์โทร",
  email: "อีเมล",
  jobTitle: "ตำแหน่ง",
  tags: "แท็ก (คั่นด้วย ; หรือ ,)",
  company: "บริษัท (สร้าง/ผูกให้)",
};
export const IMPORT_DUPLICATE_MODES = ["update", "skip", "candidate"] as const;
export type ImportDuplicateMode = (typeof IMPORT_DUPLICATE_MODES)[number];
export const IMPORT_DUPLICATE_LABEL: Record<ImportDuplicateMode, string> = {
  update: "อัปเดตคนเดิม",
  skip: "ข้ามแถวนั้น",
  candidate: "สร้างใหม่แล้วตั้งเป็นคู่สงสัยซ้ำ",
};

export const CONTACT_SORTS = ["-createdAt", "createdAt", "name", "-lastActivityAt", "-score"] as const;
export type ContactSort = (typeof CONTACT_SORTS)[number];

// ───────────────────────── error ─────────────────────────

export type ContactsErrorCode = "NOT_FOUND" | "VALIDATION" | "DUPLICATE" | "CONFIRM_REQUIRED" | "CONFLICT" | "FORBIDDEN";
export type DuplicateHit = { contactId: string; name: string; reason: "PHONE" | "EMAIL" };

/** error ของบริการผู้ติดต่อ — ข้อความไทยที่ไม่โทษผู้ใช้ · `.code` ตาม CONTRACT BLOCK · ไม่มีข้อมูลของร้าน/ระบบอื่นในข้อความ */
export class ContactsError extends Error {
  readonly code: ContactsErrorCode;
  readonly duplicates?: DuplicateHit[];
  constructor(code: ContactsErrorCode, message: string, extra: { duplicates?: DuplicateHit[] } = {}) {
    super(message);
    this.name = "ContactsError";
    this.code = code;
    if (extra.duplicates) this.duplicates = extra.duplicates;
  }
}

// ───────────────────────── ชนิด DTO ─────────────────────────

export type ContactDto = {
  id: string;
  systemId: string;
  partyId: string | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  titleTh: string | null;
  phone: string | null;
  email: string | null;
  lineUserId: string | null;
  jobTitle: string | null;
  department: string | null;
  companyId: string | null;
  /** ข้อความบริษัทแบบเดิม (v1) — ใช้เมื่อยังไม่ผูก CrmCompany */
  companyText: string | null;
  lifecycleStage: ContactLifecycle;
  leadStatus: ContactLeadStatus;
  score: number;
  scoreBand: ContactScoreBand | null;
  ownerUserId: string | null;
  teamId: string | null;
  assignedAt: Date | null;
  tags: string[];
  sourceKind: ContactSource | null;
  sourceChannel: string | null;
  marketingOptOut: boolean;
  emailOptOut: boolean;
  emailBouncedAt: Date | null;
  memberCustomerId: string | null;
  convertedAt: Date | null;
  lastActivityAt: Date | null;
  mergedIntoId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ContactListItem = ContactDto & { companyName: string | null; ownerName: string | null };
export type ContactListResult = { items: ContactListItem[]; nextCursor: string | null };

export type ContactListInput = {
  q?: string | null;
  stage?: string | null;
  leadStatus?: string | null;
  owner?: string | null;
  team?: string | null;
  scoreBand?: string | null;
  source?: string | null;
  companyId?: string | null;
  f?: Record<string, string> | null;
  savedViewId?: string | null;
  includeArchived?: boolean | null;
  sort?: string | null;
  cursor?: string | null;
  pageSize?: number | null;
};

export type CreateContactResult = { contact: ContactDto; created: boolean; duplicates: DuplicateHit[] };

export type ConsentState = { channel: string; label: string; granted: boolean | null; source: string | null; at: Date | null };
export type ConsentHistoryRow = { id: string; channel: string; granted: boolean; source: string; note: string | null; createdAt: Date; createdById: string | null };
export type ConsentView = { memberLinked: boolean; optOut: boolean; emailBounced: boolean; channels: ConsentState[] };

export type Contact360Field = { key: string; label: string; type: string; value: unknown; display: string; hidden: boolean };
export type Contact360Section = { key: string; label: string; sensitive: boolean; isSystem: boolean; fields: Contact360Field[] };
export type Contact360Member = { customerId: string; systemId: string | null; memberCode: string | null; name: string | null; tierName: string | null; phoneMasked: string | null };
export type Contact360Company = { id: string; name: string; role: string; jobTitle: string | null; isPrimary: boolean; current: boolean };
export type Contact360Deal = { id: string; title: string; stageName: string; kind: "OPEN" | "WON" | "LOST"; valueSatang: number; expectedCloseAt: Date | null; pipelineName: string };
export type Contact360TimelineItem = { id: string; at: Date; type: string; title: string; source: string; done: boolean };

export type Contact360 = {
  contact: ContactDto;
  owner: { id: string; name: string } | null;
  member: Contact360Member | null;
  company: Contact360Company | null;
  companies: Contact360Company[];
  deals: Contact360Deal[];
  fields: { sections: Contact360Section[] };
  timeline: Contact360TimelineItem[];
  consent: ConsentView;
  objectTabs: { objectKey: string; label: string; labelPlural: string; count: number }[];
  previousEmails: string[];
  sourceDetail: Record<string, unknown> | null;
};

export type ConvertInput = {
  idempotencyKey: string;
  member?: { systemId: string } | null;
  company?: { id: string } | { new: { name: string } } | null;
  deal?: { pipelineId: string; stageId?: string | null; title: string; valueSatang?: number | null } | null;
};
export type ConvertResult = { contactId: string; customerId: string | null; companyId: string | null; dealId: string | null; replayed: boolean };
export type ConvertOptions = {
  memberSystems: { id: string; name: string }[];
  pipelines: { id: string; name: string; isDefault: boolean; stages: { id: string; name: string }[] }[];
};

export type ImportRow = Record<string, string>;
export type ImportMapping = Record<string, string>;
export type ImportContactsInput = {
  rows: ImportRow[];
  mapping: ImportMapping;
  options?: { onDuplicate?: ImportDuplicateMode | null; source?: string | null } | null;
};
export type ImportContactsResult = {
  created: number;
  updated: number;
  skipped: number;
  candidates: number;
  failed: number;
  errors: { row: number; message: string }[];
};
export type ImportJobStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";
export type ImportJob = { jobId: string; status: ImportJobStatus; result: ImportContactsResult };

export type DuplicatePairItem = { a: string; b: string; aName: string; bName: string; reason: "PHONE" | "EMAIL" | "NAME" };
export const MERGE_CHOICE_FIELDS = ["firstName", "lastName", "titleTh", "phone", "email", "lineUserId", "jobTitle", "department"] as const;
export type MergeChoiceField = (typeof MERGE_CHOICE_FIELDS)[number];

// ───────────────────────── ตัวช่วยบริสุทธิ์ ─────────────────────────

/** แยกชื่อเต็มแบบ v1 ที่ช่องว่างแรก ("สมชาย ธนพร ใจดี" → สมชาย / ธนพร ใจดี) */
export function splitFullName(full: string | null | undefined): { firstName: string; lastName: string | null } {
  const s = String(full ?? "").trim().replace(/\s+/g, " ");
  const at = s.indexOf(" ");
  if (at < 0) return { firstName: s, lastName: null };
  return { firstName: s.slice(0, at), lastName: s.slice(at + 1) || null };
}

/** ชื่อแสดง (legacy `name`) = "ชื่อ นามสกุล" */
export function joinName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
}

/** แท็ก: ตัดช่องว่าง · ทิ้งค่าว่าง · ไม่ซ้ำ (ไม่สนตัวพิมพ์) — คืนปัญหาถ้าเกินเพดาน (ผู้เรียกตัดสินว่าจะปฏิเสธ) */
export function cleanTags(input: readonly unknown[] | null | undefined): { tags: string[]; problem: string | null } {
  const out: string[] = [];
  const seen = new Set<string>();
  let problem: string | null = null;
  for (const raw of input ?? []) {
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const t = String(raw).trim().replace(/\s+/g, " ");
    if (!t) continue;
    if (t.length > CONTACT_TAG_MAX) {
      problem = `แท็กแต่ละอันยาวได้ไม่เกิน ${CONTACT_TAG_MAX} ตัวอักษร — ย่อแท็ก "${t.slice(0, 20)}…" ให้สั้นลง`;
      continue;
    }
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  if (out.length > CONTACT_TAGS_MAX) problem = `ผู้ติดต่อหนึ่งคนมีแท็กได้ไม่เกิน ${CONTACT_TAGS_MAX} แท็ก — ลบแท็กที่ไม่ใช้แล้วออกก่อน`;
  return { tags: out, problem };
}

/** ปัญหาของชื่อ (ว่าง/ยาวเกิน) · null = ใช้ได้ */
export function nameProblem(raw: unknown, label: string, required: boolean): string | null {
  const s = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
  if (!s) return required ? `ใส่${label}ก่อนบันทึก` : null;
  if (s.length > CONTACT_NAME_MAX) return `${label}ยาวได้ไม่เกิน ${CONTACT_NAME_MAX} ตัวอักษร — ย่อให้สั้นลง`;
  return null;
}

/** เบอร์โทร: รูปแบบตัวอักษร (ตัวตรวจเดียวกับบริษัท) + จำนวนหลัก 9–15 */
export function contactPhoneProblem(raw: string | null | undefined): string | null {
  const p = String(raw ?? "").trim();
  if (!p) return null;
  const shape = phoneProblem(p);
  if (shape) return shape;
  const digits = p.replace(/\D/g, "");
  if (digits.length < 9) return `เบอร์โทร "${p}" ยังไม่ครบจำนวนหลัก — กรอกเบอร์ 10 หลัก เช่น 0812345678`;
  if (digits.length > 15) return "เบอร์โทรยาวเกิน 15 หลัก — ตรวจตัวเลขอีกครั้ง";
  return null;
}

export function contactLabel(c: { name?: string | null; firstName?: string | null; lastName?: string | null }): string {
  return joinName(c.firstName, c.lastName) || String(c.name ?? "").trim() || "ไม่ระบุชื่อ";
}

/**
 * ปิดบังข้อมูลติดต่อในข้อความ (audit · ข้อความผิดพลาดของการนำเข้า — X8): อีเมล → x…@โดเมน · เลขยาว ≥ 5 หลัก → เหลือ 2 หลักท้าย
 */
export function maskPii(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/[^\s@"'<>]+@([^\s@"'<>]+)/g, (_m, d: string) => `x…@${d}`)
    .replace(/\+?\d[\d\s-]{3,}\d/g, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 5 ? `${"x".repeat(Math.max(0, digits.length - 2))}${digits.slice(-2)}` : m;
    });
}
