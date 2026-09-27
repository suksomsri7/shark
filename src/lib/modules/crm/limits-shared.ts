// limits-shared.ts — ทะเบียนเพดานของ CRM v2 (ใบ C3.9 · พิมพ์เขียว §11.9) — ไฟล์บริสุทธิ์ (ไม่มี prisma) ใช้ได้ทั้งหน้า 'use client'
//
// 🔴 ค่าที่นี่คือ "ค่าเริ่มต้น" — ร้านที่ได้เพดานพิเศษเก็บใน `Tenant.limits.crm.<key>` (ตัวอ่าน = `limits.ts#crmLimits`)
// 🔴 ทุกเพดานของ CRM ผ่านไฟล์นี้: เพดานที่ร้านปรับได้ (`CRM_LIMITS` 19 ตัว) · เพดานตายตัวของโค้ด (`CRM_HARD_CAPS`) ·
//    ค่าตัวเลขของสิทธิ์ (`CRM_PARAM_CAPS` — `crm._max*` → ตัวบังคับ) — ห้ามมีตัวเลขเพดานลอย ๆ ที่อื่นอีก
// AUDIT-CLASS X9: เกินเพดาน = ปฏิเสธด้วยรหัส LIMIT + ข้อความไทยที่บอกทางออก (ไม่โทษผู้ใช้) · ใกล้เพดาน (80 %) = เตือนก่อน

/** พิมพ์เขียว §11.9 — คีย์ → ค่าเริ่มต้น */
export const CRM_LIMITS = Object.freeze({
  contacts: 200_000,
  companies: 50_000,
  openDeals: 20_000,
  pipelines: 10,
  stagesPerPipeline: 12,
  linesPerDeal: 100,
  emailsPerDay: 2_000,
  sequences: 50,
  stepsPerSequence: 20,
  activeEnrollments: 5_000,
  assignmentRules: 30,
  scoreRules: 50,
  emailTemplates: 100,
  objectsWarn: 30,
  fieldsPerObject: 60,
  trackedLinks: 1_000,
  webEventsPerMonth: 5_000_000,
  webhookEndpoints: 20,
  automationRunsPerMonth: 5_000,
} as const);

export type CrmLimitKey = keyof typeof CRM_LIMITS;
export const CRM_LIMIT_KEYS = Object.freeze(Object.keys(CRM_LIMITS) as CrmLimitKey[]);
export type CrmLimitValues = Record<CrmLimitKey, number>;

/** ใช้ไปถึงสัดส่วนนี้ = แจ้งเตือนเจ้าของร้านก่อนถึงเพดาน (ครั้งเดียวต่อ ระบบ · คีย์ · เดือนไทย · ค่าเพดาน) */
export const CRM_LIMIT_WARN_RATIO = 0.8;

/** ป้ายไทยของแต่ละเพดาน (หน้า /crm/settings · ข้อความแจ้งเตือน · ข้อความปฏิเสธ) */
export const CRM_LIMIT_LABEL: Readonly<Record<CrmLimitKey, string>> = Object.freeze({
  contacts: "ผู้ติดต่อ",
  companies: "บริษัท",
  openDeals: "ดีลที่เปิดอยู่",
  pipelines: "pipeline",
  stagesPerPipeline: "ขั้นต่อ pipeline",
  linesPerDeal: "รายการสินค้าต่อดีล",
  emailsPerDay: "อีเมลที่ส่งต่อวัน",
  sequences: "ลำดับการติดตาม",
  stepsPerSequence: "ขั้นต่อลำดับการติดตาม",
  activeEnrollments: "ผู้ติดต่อที่อยู่ในลำดับการติดตาม",
  assignmentRules: "กฎมอบหมาย lead",
  scoreRules: "กฎให้คะแนน",
  emailTemplates: "เทมเพลตอีเมล",
  objectsWarn: "ข้อมูลกำหนดเอง (วัตถุ)",
  fieldsPerObject: "ฟิลด์ต่อวัตถุ",
  trackedLinks: "ลิงก์ติดตาม",
  webEventsPerMonth: "เหตุการณ์การเข้าชมเว็บต่อเดือน",
  webhookEndpoints: "ปลายทางเว็บฮุค",
  automationRunsPerMonth: "รอบการทำงานของกฎอัตโนมัติต่อเดือน",
});

/** หน่วยนับ (ข้อความไทย) */
export const CRM_LIMIT_UNIT: Readonly<Record<CrmLimitKey, string>> = Object.freeze({
  contacts: "คน",
  companies: "บริษัท",
  openDeals: "ดีล",
  pipelines: "pipeline",
  stagesPerPipeline: "ขั้น",
  linesPerDeal: "รายการ",
  emailsPerDay: "ฉบับ",
  sequences: "ลำดับ",
  stepsPerSequence: "ขั้น",
  activeEnrollments: "คน",
  assignmentRules: "กฎ",
  scoreRules: "กฎ",
  emailTemplates: "เทมเพลต",
  objectsWarn: "วัตถุ",
  fieldsPerObject: "ฟิลด์",
  trackedLinks: "ลิงก์",
  webEventsPerMonth: "เหตุการณ์",
  webhookEndpoints: "ปลายทาง",
  automationRunsPerMonth: "รอบ",
});

/** เพดาน "ต่อแม่" (นับในแม่ตัวเดียว · ไม่ส่งแม่ = ตัวที่ใช้มากที่สุดในระบบ) */
export const CRM_LIMIT_PER_PARENT: ReadonlySet<CrmLimitKey> = new Set<CrmLimitKey>(["stagesPerPipeline", "linesPerDeal", "stepsPerSequence", "fieldsPerObject"]);
/** เพดานที่ "เตือนอย่างเดียว" บนทางใช้งานจริง (พิมพ์เขียว: วัตถุไม่จำกัด เตือนที่ 30 · web event แจ้งก่อนถึง) — `assertCrmLimit` ตรง ๆ ยังตัดสินได้ */
export const CRM_LIMIT_WARN_ONLY: ReadonlySet<CrmLimitKey> = new Set<CrmLimitKey>(["objectsWarn", "webEventsPerMonth"]);
/** นับต่อร้าน (ทุกระบบ CRM รวมกัน) — ที่เหลือนับต่อระบบ */
export const CRM_LIMIT_TENANT_WIDE: ReadonlySet<CrmLimitKey> = new Set<CrmLimitKey>(["webhookEndpoints", "automationRunsPerMonth"]);

export function isCrmLimitKey(v: unknown): v is CrmLimitKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CRM_LIMITS, v);
}

/**
 * เพดานตายตัวของโค้ด (ไม่ขึ้นกับร้าน) — ทุกค่าที่เคยเป็นตัวเลขลอยในบริการ CRM มาอยู่ที่นี่ (ใบ C3.9 "every cap goes through limits")
 * ผู้ใช้: emails (ส่งกลุ่ม) · views (มุมมองต่อคน) · quotas (กระดาน) · portal (เขียนต่อนาที) · sequences (ลงทะเบียนกลุ่ม) ·
 *   assignment (งานค้างต่อคน) · deals (ทำเป็นกลุ่ม) · contacts (นำเข้า/ส่งออก/ทำเป็นกลุ่ม) · privacy (ส่งออกทั้งระบบ)
 */
export const CRM_HARD_CAPS = Object.freeze({
  /** ส่งอีเมลเป็นกลุ่มได้ครั้งละ */
  emailBulk: 500,
  /** มุมมองที่บันทึกต่อคนต่อรายการ */
  savedViewsPerUser: 50,
  /** แถวของกระดานโควตา/รายการโควตา */
  quotaBoardRows: 500,
  /** การเขียนของลูกค้าในพอร์ทัลต่อนาที (ต่อ session) */
  portalWritesPerMinute: 30,
  /** ลงทะเบียนลำดับเป็นกลุ่มได้ครั้งละ */
  sequenceBulk: 500,
  /** งานค้างต่อคนสูงสุดที่ตั้งในกฎมอบหมายได้ */
  assignMaxOpenPerUser: 10_000,
  /** ทำกับดีลเป็นกลุ่มได้ครั้งละ */
  dealBulk: 200,
  /** ทำกับผู้ติดต่อเป็นกลุ่มได้ครั้งละ */
  contactBulk: 500,
  /** นำเข้าผู้ติดต่อได้ต่อไฟล์ (แถว) */
  importRows: 50_000,
  /** แถวต่อตารางในไฟล์ส่งออกทั้งระบบ (PDPA/สำรอง) */
  tenantExportRowsPerTable: 50_000,
  /** ขนาดไฟล์ส่งออกทั้งระบบ */
  tenantExportMaxBytes: 25 * 1024 * 1024,
} as const);
export type CrmHardCapKey = keyof typeof CRM_HARD_CAPS;

/**
 * ค่าตัวเลขของสิทธิ์ `crm._max*` (ตั้งรายคนที่หน้าสิทธิ์) → ตัวบังคับ · เกินค่า = ส่งเข้าสายอนุมัติ (ไม่ใช่ปฏิเสธเงียบ)
 * 🔴 ข้อสอบ C3.9-S6.5 กวาดทุก `"crm._max…"` ใน src — เพิ่มค่าใหม่ที่ไหนต้องเพิ่มแถวที่นี่ด้วย
 */
export const CRM_PARAM_CAPS: Readonly<Record<string, { label: string; enforcer: string; overflow: "APPROVAL" | "REFUSE"; approvalEntity: string | null }>> = Object.freeze({
  "crm._maxDealDiscountBp": { label: "เพดานส่วนลดในดีลที่ให้ได้เอง", enforcer: "deals.setLines", overflow: "APPROVAL", approvalEntity: "crm.discount" },
  "crm._maxCommissionApproveSatang": { label: "วงเงินอนุมัติค่าคอมมิชชันสูงสุด", enforcer: "commissions.approve", overflow: "APPROVAL", approvalEntity: "crm.commission" },
  "crm._maxReassignPerDay": { label: "จำนวนดีลที่โอนข้ามทีมได้ต่อวัน", enforcer: "deals.reassignDeal", overflow: "APPROVAL", approvalEntity: "crm.reassign" },
});

/** error เดียวของ "เกินเพดาน" — code `LIMIT` (REST = 409 state_conflict · action = ข้อความไทย) */
export class CrmLimitError extends Error {
  readonly code = "LIMIT" as const;
  readonly key: CrmLimitKey | CrmHardCapKey;
  readonly limit: number;
  constructor(key: CrmLimitKey | CrmHardCapKey, limit: number, message: string) {
    super(message);
    this.name = "CrmLimitError";
    this.key = key;
    this.limit = limit;
  }
}

/** นับหนักเกินจะนับทุกครั้งที่เปิดหน้า — ประเมินรายวันโดยงานเบื้องหลัง (`used` = null บนหน้า) */
export const CRM_LIMIT_DAILY_ONLY: ReadonlySet<CrmLimitKey> = new Set<CrmLimitKey>(["webEventsPerMonth"]);
export type CrmLimitRow = { key: CrmLimitKey; label: string; unit: string; limit: number; used: number | null; ratio: number; warn: boolean; over: boolean; warnOnly: boolean; perParent: boolean };
export type CrmLimitStatus = { rows: CrmLimitRow[]; warnRatio: number };

/** ข้อความปฏิเสธ (ไทย · บอกทางออก) */
export function crmLimitMessage(key: CrmLimitKey, limit: number): string {
  return `ถึงเพดาน${CRM_LIMIT_LABEL[key]} ของระบบนี้แล้ว (${limit.toLocaleString("th-TH")} ${CRM_LIMIT_UNIT[key]}) — เก็บถาวร/ลบรายการที่ไม่ใช้ก่อน หรือติดต่อทีม SHARK เพื่อขยายเพดาน`;
}

/** ร้อยละสำหรับแถบการใช้งาน (0–100 · ปัดลง) */
export function crmLimitPercent(used: number, limit: number): number {
  if (!(limit > 0)) return used > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.floor((used / limit) * 100)));
}
