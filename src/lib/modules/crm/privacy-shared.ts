// privacy-shared.ts — ค่าคงที่ · ชนิด · error ของ PDPA ฝั่ง CRM (ใบ C3.9) — ไฟล์บริสุทธิ์ (ไม่มี prisma) ใช้ได้ทั้งหน้า 'use client'

/** ชื่อที่แทนตัวตนของผู้ติดต่อที่ถูกลบ (และ Party ที่ไม่มีผู้ถืออื่น) — ตัวบอก "ลบแล้ว" ของแถว */
export const CRM_ERASED_NAME = "ลบตามคำขอ PDPA";
/** ชื่อเรคคอร์ดกำหนดเองของผู้ติดต่อที่ถูกลบ (R-E.10 — ชื่อเดิมมักเป็นสำเนาค่าฟิลด์ของคนนั้น) */
export const CRM_ERASED_RECORD_TITLE = "(ข้อมูลถูกลบตามคำขอ PDPA)";
/** ข้อความที่แทนคำที่ระบุตัวคนในข้อความที่คงแถวไว้ (แจ้งเตือน · หัวข้อกิจกรรม · ไทม์ไลน์) */
export const CRM_ERASED_MASK = "[ข้อมูลถูกลบ]";
/** เหตุผลของการลบ (X9) — อย่างน้อย 5 ตัวอักษร · ยาวไม่เกิน 500 */
export const PRIVACY_REASON_MIN = 5;
export const PRIVACY_REASON_MAX = 500;
/** ชนิดงานบนเลนส่งออกของ C3.1 (`CrmImportJob.kind`) */
export const CRM_EXPORT_KIND = "CRM_EXPORT";
export const CRM_EXPORT_FORMATS = ["CSV", "JSON"] as const;
export type CrmExportFormat = (typeof CRM_EXPORT_FORMATS)[number];
/** lease ของงานส่งออก (AUDIT-CLASS X5 · ≤ 15 นาที) */
export const CRM_EXPORT_LEASE_MS = 15 * 60_000;
/** ช่วงที่ lead ได้คำเตือนก่อนถูกลบตามอายุเก็บ (มติ C21) */
export const LEAD_RETENTION_WARN_DAYS = 30;
/** คำที่ต้องพิมพ์เมื่อลดอายุเก็บ lead (รีวิว C3.9 S4 ก · X9) */
export const LEAD_RETENTION_CONFIRM_WORD = "ลดอายุเก็บ";

export const ERASE_SOURCES = ["REQUEST", "MEMBER", "RETENTION"] as const;
export type EraseSource = (typeof ERASE_SOURCES)[number];

export type EraseCounts = {
  emails: number;
  activities: number;
  recordings: number;
  files: number;
  webSessions: number;
  clicks: number;
  portal: number;
  proposals: number;
  notifications: number;
  customValues: number;
  records: number;
  consents: number;
  fileLinks: number;
  mergedContacts: number;
  partyAnonymised: boolean;
  memberErased: boolean;
  // CRM C3.9-fix ▸ ขอบเขตที่เพิ่มจากการล่าความปลอดภัย (H1–H4 · H8 · H9) ◂
  formSubmissions: number;
  aiMessages: number;
  kanban: number;
  auditScrubbed: number;
  exportsWithdrawn: number;
};

/** `followUp` (รีวิว C3.9 B3): ขั้นหลัง commit (ไฟล์บนที่เก็บ · คำขออนุมัติของพอร์ทัล · สมาชิกที่ผูก) — DONE = เสร็จในคำขอนี้ ·
 *  PENDING = ข้อมูลในฐานถูกลบแล้ว ส่วนที่เหลือทำต่อโดยตัวรับ `crm.contact.erased` (ส่งใหม่จนสำเร็จ) · null = ไม่ได้ลบรอบนี้ */
/** CRM C3.9-fix ▸ H5 (มติผู้คุมงาน): สมาชิกที่ผูกไว้ถูกลบตามกติกาของระบบสมาชิกเท่านั้น — `memberSkipped` = ผู้ลบไม่มีคีย์
 *  `member.customer.delete` (ผู้ติดต่อถูกลบ · สมาชิกไม่ถูกแตะ · OpsEvent WARN) · `memberPending` = ร้านตั้งสายอนุมัติ `member.erase`
 *  (ยื่นคำขอลบของระบบสมาชิกแล้ว รออนุมัติ) ◂ */
export type EraseResult = {
  contactId: string;
  partyId: string | null;
  erased: boolean;
  counts: EraseCounts | null;
  followUp: "DONE" | "PENDING" | null;
  memberSkipped: boolean;
  memberPending: boolean;
};
/** action ของหน้าจอบอกผลนี้เมื่อ followUp = PENDING (มติผู้คุมงาน C3.9 B3) */
export const ERASE_PENDING_MESSAGE = "ลบแล้ว · กำลังล้างข้อมูลที่เชื่อมโยง";
/** ชื่อ action ของแถว AuditLog ที่เป็นธง "ลบแล้ว" (รีวิว C3.9 S2 — ชื่อผู้ติดต่อเป็นแค่ป้ายแสดงผล) */
export const CRM_ERASE_AUDIT_ACTION = "crm.contact.erase";

export type ContactExportBundle = {
  exportedAt: string;
  /** CRM C5.5-fix9 (hunt-3 H3-2 · r2 M1): true = ทุกแถวของทุกตารางของคนนี้ (รวมสายที่ถูกรวม) อยู่ในไฟล์ · false = มีตารางถูกตัดที่เพดานขนาดไฟล์
   *  (`truncated`) หรือมีแถว/ค่าที่ผู้ขอมองไม่เห็น (`scope.limitedByRequesterVisibility`) หรือสายที่ถูกรวมยาวเกินเพดาน */
  complete: boolean;
  /** เฉพาะเมื่อไม่ครบ: ตารางที่ถูกตัด → จำนวนที่อยู่ในไฟล์ (แถวใหม่สุด) และยอดจริงของเขาในระบบ */
  truncated?: Record<string, { exported: number; total: number }>;
  /**
   * C5.5-fix9 r2 (review M1) — มีเมื่อขอบเขตของไฟล์ไม่ใช่ "ผู้ติดต่อคนนี้คนเดียว ทุกแถว":
   *   `mergedContactIds` = ผู้ติดต่อที่ถูกรวมเข้ามาในคนนี้ (ไฟล์รวมข้อมูลของพวกเขาแล้ว — ขอบเขตเดียวกับการลบ) · `mergedChainIncomplete` = สายยาวเกินเพดาน ·
   *   `limitedByRequesterVisibility` + `withheldTables` = ผู้ขอมองไม่เห็นบางแถว/บางค่า (ไม่อยู่ในไฟล์ · จำนวนอยู่ในแถว audit เท่านั้น)
   */
  scope?: { mergedContactIds?: string[]; mergedChainIncomplete?: true; limitedByRequesterVisibility?: true; withheldTables?: string[] };
  contact: Record<string, unknown>;
  /** แต่ละตารางเรียงคงที่ (ส่วนใหญ่ id ใหม่→เก่า · ความยินยอมเรียงตามเวลา) — ส่งออกซ้ำได้ไฟล์เดียวกัน */
  tables: Record<string, Record<string, unknown>[]>;
};

export type CrmExportStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "EXPIRED";
export type CrmExportDto = {
  jobId: string;
  status: CrmExportStatus;
  format: CrmExportFormat | null;
  filename: string | null;
  rowCount: number;
  /** ลิงก์ชั่วคราว (≤ 15 นาที) ของ `/api/files/<id>` ที่ผูกกับผู้ขอ — ไม่มีที่อยู่ไฟล์จริง/โดเมน CDN (X10) */
  url: string | null;
  error: string | null;
  createdAt: string;
};

export type PurgeSummary = { emails: number; recordings: number; webSessions: number; exports: number; leadsErased: number; leadsWarned: number };

/** TOO_LARGE (C5.5-fix9 r2): การลบไม่เสร็จภายในเวลาของธุรกรรมเดียว — ยกเลิกทั้งหมด (ไม่มีอะไรถูกลบ) · OpsEvent ERROR + audit แถวล้มเหลวแล้ว */
export type PrivacyErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFIRM_REQUIRED" | "TOO_LARGE";
/**
 * C5.5-fix11 (review fix9-r2 R2-3): ธุรกรรม interactive ของ Prisma **หมดเวลา** เท่านั้น — P2028 ที่ข้อความเป็น "… cannot be executed on an expired
 * transaction" (คำสั่งหรือ commit หลังหมดเวลา · ข้อความของ transaction manager ใน @prisma/client runtime) · P2028 แบบอื่น (Transaction not found ·
 * rolled back · committed · ภายใน · "Unable to start a transaction" = รอ pool) ไม่ใช่ "ข้อมูลใหญ่เกิน" ⇒ false (ผู้เรียกโยนต่อเป็นความขัดข้องทั่วไป)
 * ตรวจแบบ duck-type (ไฟล์นี้บริสุทธิ์ — ไม่ import Prisma)
 */
export function isExpiredTransactionError(e: unknown): boolean {
  const code = e && typeof e === "object" && "code" in e ? (e as { code?: unknown }).code : null;
  const msg = e instanceof Error ? e.message : "";
  return code === "P2028" && /cannot be executed on an expired transaction/i.test(msg);
}

export class PrivacyError extends Error {
  readonly code: PrivacyErrorCode;
  constructor(code: PrivacyErrorCode, message: string) {
    super(message);
    this.name = "PrivacyError";
    this.code = code;
  }
}

/** ป้ายไทยของตารางในชุดส่งออก (หน้าจอ + หัวตารางใน CSV) */
export const EXPORT_TABLE_LABEL: Readonly<Record<string, string>> = Object.freeze({
  CrmContact: "ผู้ติดต่อ",
  CrmCompany: "บริษัท",
  CrmCompanyContact: "บริษัทของผู้ติดต่อ",
  CrmContactConsent: "ความยินยอม",
  CrmDeal: "ดีล",
  CrmActivity: "กิจกรรม",
  CrmEmailMessage: "อีเมล (หัวจดหมาย)",
  CrmWebSession: "การเข้าชมเว็บ",
  CrmWebEvent: "เหตุการณ์การเข้าชมเว็บ",
  CrmTrackedClick: "การกดลิงก์ติดตาม",
  CrmPortalAccess: "สิทธิ์พอร์ทัล",
  CrmPortalRequest: "คำขอผ่านพอร์ทัล",
  CrmScoreLog: "ประวัติคะแนน",
  CrmSequenceEnrollment: "ลำดับการติดตาม",
  CustomRecord: "ข้อมูลกำหนดเอง",
  CustomRecordValue: "ค่าฟิลด์กำหนดเอง",
  CrmFileLink: "ไฟล์แนบ",
  FormSubmission: "คำตอบฟอร์มบนเว็บ", // CRM C3.9-fix ▸ H1 ◂
});
