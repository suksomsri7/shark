// types.ts — ชนิดของหน้าติดตามเว็บ/ลิงก์ + ฟอร์ม → CRM (ใบ C2.6)
// 🔴 อยู่ที่นี่เพราะไฟล์ "use server" ส่งออกชนิดไม่ได้ และคอมโพเนนต์ (`src/components/**`) แตะไฟล์ในโมดูล CRM ไม่ได้ (F2.3)

export type CrmTrackingResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export type CrmTrackWebSettings = {
  enabled: boolean;
  domains: string[];
  consentText: string;
  consentVersion: number;
  retentionDays: number;
  siteKey: string | null;
  scriptUrl: string;
  embedCode: string;
};

export type CrmTrackLinkRow = {
  id: string;
  code: string;
  url: string;
  name: string | null;
  channel: string | null;
  active: boolean;
  clicks: number;
  uniqueClicks: number;
  shortUrl: string;
  createdAtLabel: string;
};

export type CrmTrackStats = { sessions: number; consented: number; identified: number; webLeads: number };

export type CrmTrackFormTargetRow = {
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
  /** ชื่อช่องของฟอร์มนี้ที่ชนกับช่องของด่านกันสแปม (รีวิวรอบ 2 · B1) — หน้าตั้งค่าขึ้นคำเตือนให้เปลี่ยนชื่อ */
  reservedKeys: string[];
  embedCode: string;
  publicUrl: string;
};

export type CrmTrackOption = { value: string; label: string };

export type CrmTrackingPageData = {
  systemId: string;
  settings: CrmTrackWebSettings;
  stats: CrmTrackStats;
  links: CrmTrackLinkRow[];
  limits: { retentionMin: number; retentionMax: number; maxDomains: number; consentTextMax: number };
};

export type CrmFormsPageData = {
  systemId: string;
  forms: CrmTrackFormTargetRow[];
  crmSystems: CrmTrackOption[];
  rules: CrmTrackOption[];
};

/** ไทม์ไลน์เว็บของผู้ติดต่อ (บล็อกบนหน้า 360) — ไม่มี ipHash/userAgent ใน DTO โดยเจตนา */
export type CrmWebTimelineSession = {
  id: string;
  startedAtLabel: string;
  lastSeenAtLabel: string;
  pageViews: number;
  firstUrl: string | null;
  utm: Record<string, string> | null;
  identifiedBy: string | null;
  events: { kind: string; url: string | null; title: string | null; atLabel: string; durationSec: number | null }[];
};
