// portal-shared.ts — ค่าคงที่ · ชนิด · ตัวแปลงบริสุทธิ์ของพอร์ทัลลูกค้าองค์กร (ใบ C3.5 · มติ C7/C15 · พิมพ์เขียว §3.13 §5.9 · ภาพ 12)
//
// 🔴 ไฟล์บริสุทธิ์: ไม่ import prisma / next / server-only — หน้า 'use client' ของ `/b/[slug]` และคอมโพเนนต์ฝั่งพนักงานใช้ได้
// 🔴 `PORTAL_BASE_PATH` คือ **ค่าคงที่ตัวเดียว** ของที่อยู่พอร์ทัล (เจ้าของร้านอาจเปลี่ยนชื่อ `/b` ภายหลัง) —
//    ห้ามไฟล์อื่นใน src เขียน `/b/${…}` เอง ให้ใช้ `portalPath()` เสมอ (ข้อสอบ C3.5-S7.1)
//    `/p/[slug]` เป็นของโมดูล PAGES (มติ C15) — พอร์ทัลจึงอยู่ที่ `/b`
import { thaiDateLabel, thaiDayKey } from "./activities-shared";

/** ที่อยู่ฐานของพอร์ทัล (ตัวเดียวในระบบ) */
export const PORTAL_BASE_PATH = "/b";

/** ที่อยู่หน้าในพอร์ทัลของร้าน `slug` เช่น `portalPath("shop", "quotations", id)` → `/b/shop/quotations/<id>` */
export function portalPath(slug: string, ...segments: string[]): string {
  const parts = [encodeURIComponent(slug), ...segments.filter((s) => s !== "").map((s) => encodeURIComponent(s))];
  return `${PORTAL_BASE_PATH}/${parts.join("/")}`;
}

// ───────────────────────── ตั้งค่า `settings.crm.portal` (R-E ข้อ 13 · พิมพ์เขียว §8) ─────────────────────────

export const PORTAL_LOGIN_METHODS = ["EMAIL_OTP", "LINE"] as const;
export type PortalLoginMethod = (typeof PORTAL_LOGIN_METHODS)[number];

export type PortalStatusKey = "OPEN" | "IN_PROGRESS" | "DONE";

export type PortalSettings = {
  enabled: boolean;
  loginMethods: PortalLoginMethod[];
  /** ค่าเริ่มต้น false — ไม่มีข้อมูลดีลใด ๆ ใน DTO (X1.4) · true = ไทล์ "ดีลที่กำลังคุย" (จำนวนเท่านั้น) */
  showDeals: boolean;
  allowIssue: boolean;
  issueBoardId: string | null;
  /** ป้ายสถานะที่ร้านตั้งเอง (ทับค่าเริ่มต้น เปิด/กำลังทำ/เสร็จ) */
  statusMap: Partial<Record<PortalStatusKey, string>>;
};

export const PORTAL_SETTINGS_DEFAULTS: Readonly<PortalSettings> = Object.freeze({
  enabled: false,
  loginMethods: ["EMAIL_OTP", "LINE"] as PortalLoginMethod[],
  showDeals: false,
  allowIssue: true,
  issueBoardId: null,
  statusMap: {},
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** `AppSystem.settings` → ค่าตั้งของพอร์ทัล (ค่าเพี้ยน = ค่าเริ่มต้น · เปิดต้องเป็น `true` ตรง ๆ) */
export function parsePortalSettings(raw: unknown): PortalSettings {
  const crm = isObj(raw) && isObj(raw.crm) ? raw.crm : {};
  const p = isObj(crm.portal) ? crm.portal : {};
  const methods = Array.isArray(p.loginMethods)
    ? (p.loginMethods.filter((m): m is PortalLoginMethod => (PORTAL_LOGIN_METHODS as readonly unknown[]).includes(m)) as PortalLoginMethod[])
    : [...PORTAL_SETTINGS_DEFAULTS.loginMethods];
  const sm = isObj(p.statusMap) ? p.statusMap : {};
  const statusMap: Partial<Record<PortalStatusKey, string>> = {};
  for (const k of ["OPEN", "IN_PROGRESS", "DONE"] as const) {
    const v = sm[k];
    if (typeof v === "string" && v.trim()) statusMap[k] = v.trim().slice(0, 40);
  }
  return {
    enabled: p.enabled === true,
    loginMethods: [...new Set(methods)],
    showDeals: p.showDeals === true,
    allowIssue: p.allowIssue !== false,
    issueBoardId: typeof p.issueBoardId === "string" && p.issueBoardId.trim() ? p.issueBoardId.trim() : null,
    statusMap,
  };
}

/** ร้านนี้เปิดพอร์ทัลใช้งานจริงไหม (uiVersion 2 + enabled) */
export function portalLive(raw: unknown): boolean {
  const crm = isObj(raw) && isObj(raw.crm) ? raw.crm : {};
  return crm.uiVersion === 2 && parsePortalSettings(raw).enabled;
}

// ───────────────────────── สิทธิ์ในพอร์ทัล (CrmPortalRole) ─────────────────────────

export const PORTAL_ROLES = ["VIEW", "PAY", "APPROVE", "ADMIN"] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];
// ตารางสิทธิ์ (มติผู้คุมงาน C3.5 รอบ 4 · บังคับที่ชั้นบริการ):
//   VIEW    = อ่าน + แจ้งเรื่อง/ขอเอกสาร
//   PAY     = VIEW + ลิงก์ชำระ + แนบสลิป
//   APPROVE = PAY + ตอบรับ/ปฏิเสธใบเสนอราคา + ขอแก้ข้อมูลในเอกสาร + ขอเพิ่ม/เปลี่ยนผู้ติดต่อ
//   ADMIN   = APPROVE (การเชิญ/จัดการผู้ติดต่ออื่นของบริษัทเป็นงานของพนักงานร้านเท่านั้น — ยังไม่อยู่ในขอบเขต ⇒ ADMIN เท่ากับ APPROVE)
export const PORTAL_ROLE_LABEL: Record<PortalRole, string> = {
  VIEW: "ดู · แจ้งเรื่อง",
  PAY: "ดู · แจ้งเรื่อง · ชำระเงิน",
  APPROVE: "ดู · ชำระเงิน · ตอบรับใบเสนอราคา · ขอแก้ข้อมูล",
  ADMIN: "ผู้ดูแลของบริษัท (สิทธิ์เท่ากับตอบรับใบเสนอราคา)",
};
export function isPortalRole(v: unknown): v is PortalRole {
  return typeof v === "string" && (PORTAL_ROLES as readonly string[]).includes(v);
}
/** ตอบรับ/ปฏิเสธใบเสนอราคาได้ไหม */
export const portalCanRespond = (role: string) => role === "APPROVE" || role === "ADMIN";
/** ขอลิงก์ชำระ/แนบสลิปได้ไหม */
export const portalCanPay = (role: string) => role === "PAY" || role === "APPROVE" || role === "ADMIN";
/** ขอแก้ข้อมูลในเอกสาร (PROFILE_CHANGE) / ขอเพิ่ม-เปลี่ยนผู้ติดต่อ (CONTACT_CHANGE) ได้ไหม */
export const portalCanChangeData = (role: string) => role === "APPROVE" || role === "ADMIN";

// ───────────────────────── คำขอจากพอร์ทัล ─────────────────────────

export const PORTAL_REQUEST_KINDS = ["ISSUE", "DOCUMENT_REQUEST", "CONTACT_CHANGE", "PROFILE_CHANGE"] as const;
export type PortalRequestKind = (typeof PORTAL_REQUEST_KINDS)[number];
export const PORTAL_REQUEST_KIND_LABEL: Record<PortalRequestKind, string> = {
  ISSUE: "แจ้งเรื่อง",
  DOCUMENT_REQUEST: "ขอเอกสาร",
  CONTACT_CHANGE: "ขอเพิ่ม/เปลี่ยนผู้ติดต่อ",
  PROFILE_CHANGE: "ขอแก้ข้อมูล",
};
/** คำขอชนิดนี้ไปทางไหน: การ์ดบอร์ดงาน (ถ้าตั้งบอร์ด) หรือสายอนุมัติ `crm.portal_request` */
export function portalRequestRoute(kind: PortalRequestKind): "CARD" | "APPROVAL" {
  return kind === "ISSUE" || kind === "DOCUMENT_REQUEST" ? "CARD" : "APPROVAL";
}
/** entityType ของสายอนุมัติกลางสำหรับคำขอพอร์ทัล (RESOLUTIONS R-C.10) */
export const PORTAL_APPROVAL_ENTITY = "crm.portal_request";
/** sourceKey ของการ์ดบอร์ดงานที่เปิดจากคำขอ (กันเปิดซ้ำ) */
export const portalCardSourceKey = (requestId: string) => `crm:portal-request:${requestId}`;

export const PORTAL_STATUS_DEFAULT_LABEL: Record<PortalStatusKey, string> = { OPEN: "เปิด", IN_PROGRESS: "กำลังทำ", DONE: "เสร็จ" };
export const PORTAL_REQUEST_STATUS_LABEL: Record<string, string> = { PENDING: "รอร้านพิจารณา", APPROVED: "อนุมัติแล้ว", REJECTED: "ไม่อนุมัติ" };

/**
 * ความคืบหน้าของคำขอที่ผูกการ์ด (R-E.13): คอลัมน์แรก = เปิด · คอลัมน์ "เสร็จ" หรือคอลัมน์สุดท้าย = เสร็จ · อื่น ๆ = กำลังทำ
 * `columns` เรียงตามลำดับบนบอร์ดแล้ว · ไม่มีการ์ด/หาคอลัมน์ไม่เจอ = เปิด
 */
export function portalProgressOf(
  columnId: string | null,
  columns: { id: string; isDoneColumn: boolean }[],
  statusMap: Partial<Record<PortalStatusKey, string>> = {},
): { progress: PortalStatusKey; progressLabel: string } {
  const at = columnId ? columns.findIndex((c) => c.id === columnId) : -1;
  let progress: PortalStatusKey = "OPEN";
  if (at > 0) progress = columns[at]?.isDoneColumn || at === columns.length - 1 ? "DONE" : "IN_PROGRESS";
  else if (at === 0 && columns[0]?.isDoneColumn) progress = "DONE";
  return { progress, progressLabel: statusMap[progress] ?? PORTAL_STATUS_DEFAULT_LABEL[progress] };
}

/** ความคืบหน้าของคำขอที่ไม่มีการ์ด (สายอนุมัติ / คำขอเปล่า) — จากสถานะของคำขอเอง */
export function portalProgressOfStatus(status: string, statusMap: Partial<Record<PortalStatusKey, string>> = {}): { progress: PortalStatusKey; progressLabel: string } {
  const progress: PortalStatusKey = status === "APPROVED" || status === "REJECTED" ? "DONE" : "OPEN";
  const label = status === "PENDING" ? statusMap.OPEN ?? PORTAL_STATUS_DEFAULT_LABEL.OPEN : PORTAL_REQUEST_STATUS_LABEL[status] ?? PORTAL_STATUS_DEFAULT_LABEL[progress];
  return { progress, progressLabel: label };
}

// ───────────────────────── เอกสาร ─────────────────────────

export const PORTAL_DOC_STATUS_LABEL: Record<string, string> = {
  AWAITING_ACCEPT: "รอตอบรับ",
  ACCEPTED: "ตอบรับแล้ว",
  REJECTED: "ปฏิเสธแล้ว",
  AWAITING_PAYMENT: "ค้างชำระ",
  PARTIAL: "ชำระบางส่วน",
  PAID: "ชำระแล้ว",
  ISSUED: "ออกแล้ว",
  VOIDED: "ยกเลิกแล้ว",
  CANCELLED: "ยกเลิกแล้ว",
};
export const PORTAL_DOC_TYPE_LABEL: Record<string, string> = {
  QUOTATION: "ใบเสนอราคา",
  INVOICE: "ใบแจ้งหนี้",
  RECEIPT: "ใบเสร็จรับเงิน",
  TAX_INVOICE: "ใบกำกับภาษี",
};

/** "฿24,500" จากสตางค์ */
export function portalBaht(satang: number): string {
  const v = Math.round(Number(satang) || 0) / 100;
  return `฿${v.toLocaleString("th-TH", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "20 ก.ย." / "20 ก.ย. 2569" ตามเวลาไทย (ไม่ใช้ getDate() ของเครื่อง) */
export function portalDate(d: Date | string | number | null | undefined, withYear = false): string {
  if (d === null || d === undefined || d === "") return "";
  const ms = d instanceof Date ? d.getTime() : typeof d === "number" ? d : Date.parse(d);
  return Number.isFinite(ms) ? thaiDateLabel(ms, withYear) : "";
}

/** ใบเสนอราคาหมดอายุหรือยัง — ยังตอบได้ตลอด "วันที่ validUntil" ตามปฏิทินไทย */
export function quotationExpired(validUntil: Date | null | undefined, now: Date = new Date()): boolean {
  if (!validUntil) return false;
  return thaiDayKey(validUntil.getTime()) < thaiDayKey(now.getTime());
}

/** กุญแจ "วันไทย" ของ event `crm.portal.viewed` (ครั้งแรกต่อวัน) */
export const portalViewDay = (now: Date = new Date()) => thaiDayKey(now.getTime());

// ───────────────────────── DTO (สัญญากับหน้า/REST — ห้ามมีข้อมูลดีล/พนักงาน/ไฟล์ดิบ) ─────────────────────────

export type PortalCompanyRef = { id: string; name: string };
export type PortalQuotationDto = { id: string; docNo: string | null; status: string; statusLabel: string; issueDate: Date; validUntil: Date | null; grandTotalSatang: number; canRespond: boolean };
export type PortalInvoiceDto = { id: string; docNo: string | null; status: string; statusLabel: string; issueDate: Date; dueDate: Date | null; grandTotalSatang: number; paidSatang: number; outstandingSatang: number; canPay: boolean };
export type PortalReceiptDto = { id: string; docNo: string | null; docType: string; docLabel: string; status: string; statusLabel: string; issueDate: Date; grandTotalSatang: number };
export type PortalFileDto = { id: string; name: string; url: string; mime?: string | null; size?: number | null };
export type PortalRecordField = { key: string; label: string; value: string; editable: boolean };
export type PortalRecordDto = { id: string; objectKey: string; objectLabel: string; title: string; fields: PortalRecordField[]; files: PortalFileDto[]; updatedAt: Date };
export type PortalDocumentItem = { id: string; objectKey: string; objectLabel: string; title: string; updatedAt: Date; files: PortalFileDto[] };
export type PortalRequestDto = { id: string; kind: string; kindLabel: string; title: string; status: string; progress: PortalStatusKey; progressLabel: string; createdAt: Date };
export type PortalContactDto = { id: string; name: string; jobTitle: string | null; email: string | null; phone: string | null; isPrimary: boolean; isMe: boolean };
export type PortalActivityItem = { kind: "QUOTATION" | "INVOICE" | "RECEIPT" | "REQUEST"; label: string; at: Date };
export type PortalHomeDto = {
  company: PortalCompanyRef;
  companies: PortalCompanyRef[];
  me: { contactId: string; name: string; role: string };
  shopName: string;
  outstandingSatang: number;
  nextDueDate: Date | null;
  quotesAwaiting: number;
  openInvoices: number;
  awaiting: PortalQuotationDto[];
  recent: PortalActivityItem[];
  /** มีเฉพาะเมื่อร้านตั้ง `showDeals = true` — จำนวนเท่านั้น (ไม่มีชื่อ/มูลค่า/ขั้น) */
  openDealCount?: number;
};

/** error ของพอร์ทัล — `code` ตามสัญญา (NOT_FOUND · VALIDATION · FORBIDDEN · UNAUTHORIZED · CONFLICT · RATE_LIMITED) ข้อความไทยไม่โทษผู้ใช้ */
export type PortalErrorCode = "NOT_FOUND" | "VALIDATION" | "FORBIDDEN" | "UNAUTHORIZED" | "CONFLICT" | "RATE_LIMITED";
export class PortalError extends Error {
  readonly code: PortalErrorCode;
  readonly status: number;
  constructor(code: PortalErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : code === "UNAUTHORIZED" ? 401 : code === "RATE_LIMITED" ? 429 : code === "CONFLICT" ? 409 : 422;
    this.name = "PortalError";
  }
}

/** ข้อความกลางของ "ไม่พบ" — ไม่สะท้อนชื่อบริษัท/เลขเอกสารของใคร (X1) */
export const PORTAL_NOT_FOUND_MSG = "ไม่พบรายการนี้ในพอร์ทัลของบริษัทที่เลือกอยู่ — กลับไปหน้ารายการแล้วลองใหม่";
/** ข้อความเดียวของคำเชิญที่ใช้ไม่ได้ (หมดอายุ · ใช้ไปแล้ว · ไม่มีจริง — X7.3) */
export const PORTAL_INVITE_FAIL_MSG = "ลิงก์เชิญนี้ใช้ไม่ได้แล้ว (อาจหมดอายุหรือถูกใช้ไปแล้ว) — ติดต่อร้านเพื่อขอลิงก์ใหม่";

/** อายุ nonce ของการเข้าด้วย LINE (วินาที) — คุกกี้ `__Host-shark_portal_ln` / `shark_portal_ln` ตั้งโดย server action · ตรวจ/ลบที่ route */
export const PORTAL_LINE_NONCE_TTL_SEC = 600;
