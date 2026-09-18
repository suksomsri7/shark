// companies-shared.ts — ค่าคงที่/ชนิด/ข้อผิดพลาด/ตัวตรวจค่าแบบบริสุทธิ์ ของบริการบริษัท (CRM v2 · ใบ C1.3 · พิมพ์เขียว §5.3 §3.4 §11.1)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์** (ไม่แตะ prisma/next/server-only) — หน้า 'use client' (ฟอร์มเพิ่มบริษัท · กล่องนำเข้า)
//    import ได้ตรง ๆ (บทเรียน reference_next_client_component_imports_server_module: client import โมดูลที่ถึง prisma = build พัง)
// 🔴 เพดานทุกตัวเป็นค่าคงที่มีชื่อ เพื่อให้หน้าจอบอกผู้ใช้ได้ก่อนกด (ไม่ใช่รู้ตอนโดนปฏิเสธ)

/** นำเข้า CSV ได้ไม่เกินกี่แถวต่อครั้ง (เกิน = ปฏิเสธทั้งไฟล์ ไม่สร้างสักแถว) */
export const COMPANY_IMPORT_MAX_ROWS = 5_000;
/** ขนาดไฟล์ CSV สูงสุด (วัดเป็นไบต์ UTF-8 — อักษรไทย 3 ไบต์/ตัว) */
export const COMPANY_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** นำเข้าจากบัญชีได้ไม่เกินกี่รายต่อครั้ง */
export const COMPANY_IMPORT_ACCOUNT_MAX = 500;
/** เหตุผลของการกระทำอันตราย (รวม · เก็บถาวร) ยาวอย่างน้อยกี่ตัวอักษร */
export const COMPANY_REASON_MIN = 5;
/** ความยาวสูงสุดของช่องข้อความ */
export const COMPANY_NAME_MAX = 200;
export const COMPANY_TEXT_MAX = 200;
export const COMPANY_URL_MAX = 500;
export const COMPANY_NOTE_MAX = 4_000;
/** หน้ารายการ: ต่อหน้าได้สูงสุด */
export const COMPANY_PAGE_MAX = 200;
/** ส่งออก CSV ได้ครั้งละไม่เกินกี่บริษัท (เกิน = ปฏิเสธ ให้กรองให้แคบลงก่อน) */
export const COMPANY_EXPORT_MAX_ROWS = 50_000;

/** PARTIAL = งานหลายขั้นหยุดกลางทางหลังบันทึกไปแล้วบางส่วน (ข้อความบอกว่าทำไปแล้วเท่าไร) */
export type CompanyErrorCode = "NOT_FOUND" | "VALIDATION" | "DUPLICATE" | "CONFIRM_REQUIRED" | "FORBIDDEN" | "PARTIAL";

/** ข้อผิดพลาดของบริการบริษัท — `.code` ให้ผู้เรียกตัดสิน · ข้อความไทยที่ไม่โทษผู้ใช้ · ไม่มีข้อมูลของร้าน/ระบบอื่น */
export class CompaniesError extends Error {
  readonly code: CompanyErrorCode;
  /** DUPLICATE: บริษัทเดิมที่ชน */
  readonly duplicateOf?: string;
  readonly companyId?: string;
  constructor(code: CompanyErrorCode, message: string, extra: { duplicateOf?: string } = {}) {
    super(message);
    this.name = "CompaniesError";
    this.code = code;
    if (extra.duplicateOf) {
      this.duplicateOf = extra.duplicateOf;
      this.companyId = extra.duplicateOf;
    }
  }
}

export type CompanySize = "MICRO" | "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE";
export const COMPANY_SIZES: readonly CompanySize[] = ["MICRO", "SMALL", "MEDIUM", "LARGE", "ENTERPRISE"];
export const COMPANY_SIZE_LABEL: Record<CompanySize, string> = {
  MICRO: "รายย่อย",
  SMALL: "เล็ก",
  MEDIUM: "กลาง",
  LARGE: "ใหญ่",
  ENTERPRISE: "องค์กรใหญ่",
};

export type CompanyContactRole = "DECISION_MAKER" | "INFLUENCER" | "COORDINATOR" | "BILLING" | "TECHNICAL" | "END_USER" | "OTHER";
export const COMPANY_CONTACT_ROLES: readonly CompanyContactRole[] = ["DECISION_MAKER", "INFLUENCER", "COORDINATOR", "BILLING", "TECHNICAL", "END_USER", "OTHER"];
/** ป้ายบทบาท (ภาพ 04: ผู้ตัดสินใจ · ผู้มีอิทธิพล · ผู้ประสาน · การเงิน …) */
export const COMPANY_CONTACT_ROLE_LABEL: Record<CompanyContactRole, string> = {
  DECISION_MAKER: "ผู้ตัดสินใจ",
  INFLUENCER: "ผู้มีอิทธิพล",
  COORDINATOR: "ผู้ประสาน",
  BILLING: "การเงิน",
  TECHNICAL: "ฝ่ายเทคนิค",
  END_USER: "ผู้ใช้งาน",
  OTHER: "อื่น ๆ",
};

export type CompanyLifecycle = "LEAD" | "PROSPECT" | "CUSTOMER" | "LOST" | "CHURNED";
export const COMPANY_LIFECYCLE_LABEL: Record<CompanyLifecycle, string> = {
  LEAD: "ผู้สนใจ",
  PROSPECT: "มีโอกาส",
  CUSTOMER: "ลูกค้า",
  LOST: "ไม่ไปต่อ",
  CHURNED: "เลิกใช้แล้ว",
};

export type DuplicateReason = "TAX_ID" | "DOMAIN" | "NAME";
export const DUPLICATE_REASON_LABEL: Record<DuplicateReason, string> = {
  TAX_ID: "เลขภาษีเดียวกัน",
  DOMAIN: "โดเมนอีเมลเดียวกัน",
  NAME: "ชื่อคล้ายกัน",
};

/** ฟิลด์ที่เลือกได้ตอนรวมบริษัท ("keep" = ใช้ค่าของบริษัทที่เก็บไว้ · "merge" = ใช้ค่าของบริษัทที่ถูกรวม) */
export const MERGE_CHOICE_FIELDS = ["legalName", "industry", "size", "website", "phone", "email", "emailDomain", "note"] as const;
export type MergeChoiceField = (typeof MERGE_CHOICE_FIELDS)[number];

// ───────────────────────── DTO ─────────────────────────

export type CompanyDto = {
  id: string;
  systemId: string;
  partyId: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  branchCode: string | null;
  industry: string | null;
  size: CompanySize | null;
  website: string | null;
  emailDomain: string | null;
  phone: string | null;
  email: string | null;
  lifecycleStage: CompanyLifecycle;
  score: number;
  ownerUserId: string | null;
  teamId: string | null;
  parentCompanyId: string | null;
  accountContactId: string | null;
  note: string | null;
  tags: string[];
  lastActivityAt: Date | null;
  /** แคช (บวก/ลบใต้ล็อก) */
  openDealCount: number;
  wonValueSatang: number;
  outstandingSatang: number;
  mergedIntoId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyCandidate = { companyId: string; name: string; reason: DuplicateReason; score?: number };

export type CreateCompanyResult = {
  company: CompanyDto;
  created: boolean;
  duplicateOf: string | null;
  /** บริษัทเดิมที่ชนถูกเก็บถาวรอยู่ (หน้าจอเสนอ "กู้คืนบริษัทนี้") */
  duplicateArchived?: boolean;
  candidates: CompanyCandidate[];
};

export type CompanyKpis = {
  openDealCount: number;
  wonDealCount: number;
  wonValueSatang: number;
  outstandingSatang: number;
  lastActivityAt: Date | null;
};

export type CompanyContactRow = {
  contactId: string;
  name: string;
  role: CompanyContactRole;
  roleLabel: string;
  jobTitle: string | null;
  isPrimary: boolean;
  /** ช่องทางหลักที่ติดต่อได้ (ไม่ส่งค่าเบอร์/อีเมลออกมา — ชื่อช่องทางอย่างเดียว) */
  channel: "LINE" | "EMAIL" | "PHONE" | null;
  startedAt: Date | null;
};

export type CompanyDealRow = {
  id: string;
  title: string;
  stageName: string;
  kind: "OPEN" | "WON" | "LOST";
  valueSatang: number;
  wonValueSatang: number | null;
  expectedCloseAt: Date | null;
  closedAt: Date | null;
};

export type CompanyDocRow = {
  id: string;
  docNo: string | null;
  docType: string;
  docLabel: string;
  status: string;
  statusLabel: string;
  totalSatang: number;
  issuedAt: Date;
  href: string | null;
};

export type CompanyTimelineItem = {
  id: string;
  at: Date;
  type: string;
  title: string;
  source: string;
  contactId: string | null;
  contactName: string | null;
  dealId: string | null;
};

export type CompanyRef = { id: string; name: string };

export type CompanyObjectTab = { objectKey: string; label: string; labelPlural: string; count: number };

export type Company360 = {
  company: CompanyDto;
  owner: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  kpis: CompanyKpis;
  contacts: CompanyContactRow[];
  deals: CompanyDealRow[];
  documents: CompanyDocRow[];
  timeline: CompanyTimelineItem[];
  parent: CompanyRef | null;
  subsidiaries: CompanyRef[];
  objectTabs: CompanyObjectTab[];
  /** ระบบบัญชีที่เชื่อมกับระบบ CRM นี้ (null = ยังไม่เชื่อม — เอกสาร/ค้างชำระว่าง) */
  accountLinked: boolean;
};

export type CompanyListInput = {
  q?: string | null;
  owner?: string | null;
  team?: string | null;
  industry?: string | null;
  size?: string | null;
  hasOpenDeals?: boolean | null;
  /** ตัวกรองฟิลด์ `f.{key}` (รูปแบบของ engine: "คำ" · "=ตรงตัว" · "a..b" · "true") */
  f?: Record<string, string>;
  includeArchived?: boolean | null;
  sort?: CompanySort | null;
  page?: number | null;
  pageSize?: number | null;
};

export type CompanySort = "name" | "-name" | "createdAt" | "-createdAt" | "lastActivityAt" | "-lastActivityAt" | "openDealCount" | "-openDealCount" | "wonValueSatang" | "-wonValueSatang";
export const COMPANY_SORTS: readonly CompanySort[] = ["name", "-name", "createdAt", "-createdAt", "lastActivityAt", "-lastActivityAt", "openDealCount", "-openDealCount", "wonValueSatang", "-wonValueSatang"];

export type CompanyListResult = { items: CompanyDto[]; total: number; page: number; pageSize: number };

export type DuplicatePairDto = { aId: string; aName: string; bId: string; bName: string; reason: DuplicateReason; score?: number };

export type ImportCompaniesResult = { created: number; skipped: number; errors: { row: number; reason: string }[] };

// ───────────────────────── ตัวตรวจค่า (บริสุทธิ์ — ใช้ได้ทั้งฟอร์มและ service) ─────────────────────────

/** ตัดเฉพาะช่องว่าง/ขีด (ห้ามตัดตัวอักษร — "0105563ABC345" ต้องถูกปฏิเสธ ไม่ใช่กลายเป็นตัวเลข 10 หลักเงียบ ๆ) */
export function normalizeCompanyTaxId(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/[\s\-‐-―]/g, "");
}

/** เลขประจำตัวผู้เสียภาษีไทย 13 หลัก + หลักตรวจสอบ mod-11 (มติผู้คุมงานข้อ 8) */
export function isValidThaiTaxId(taxId: string): boolean {
  if (!/^\d{13}$/.test(taxId)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(taxId[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(taxId[12]);
}

/** ข้อความปัญหาของเลขภาษี (null = ใช้ได้ · ค่าว่าง = ไม่มีเลขภาษี ไม่ใช่ปัญหา) */
export function taxIdProblem(raw: string | null | undefined): string | null {
  const t = normalizeCompanyTaxId(raw);
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลขเท่านั้น (เว้นวรรคหรือขีดคั่นได้)";
  if (t.length !== 13) return `เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก (ที่กรอกมามี ${t.length} หลัก)`;
  if (!isValidThaiTaxId(t)) return "เลขประจำตัวผู้เสียภาษีนี้หลักสุดท้ายไม่ตรงกับเลขตรวจสอบ — ลองเทียบกับเอกสารของบริษัทอีกครั้ง";
  return null;
}

/**
 * AUDIT-CLASS X6: เว็บไซต์รับเฉพาะ http:// หรือ https:// เท่านั้น — javascript:/data:/vbscript:/ftp:/"//โดเมน" ถูกปฏิเสธ
 * ตัดสินจากสตริงดิบก่อน parse (อักขระควบคุม/แท็บกลางคำ เช่น "java\tscript:" ถูกปฏิเสธทันที ไม่ปล่อยให้ URL parser ตัดทิ้งให้)
 */
export function websiteProblem(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.length > COMPANY_URL_MAX) return `ที่อยู่เว็บไซต์ยาวเกิน ${COMPANY_URL_MAX} ตัวอักษร`;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f\s]/.test(s)) return "ที่อยู่เว็บไซต์ต้องไม่มีช่องว่างหรืออักขระพิเศษ — ขึ้นต้นด้วย https:// หรือ http://";
  if (!/^https?:\/\/[^/?#]+/i.test(s)) return "ที่อยู่เว็บไซต์ต้องขึ้นต้นด้วย https:// หรือ http:// เช่น https://example.com";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "ที่อยู่เว็บไซต์ต้องขึ้นต้นด้วย https:// หรือ http://";
    if (!u.hostname) return "ที่อยู่เว็บไซต์ยังไม่มีชื่อโดเมน เช่น https://example.com";
  } catch {
    return "อ่านที่อยู่เว็บไซต์นี้ไม่ออก — ลองคัดลอกจากแถบที่อยู่ของเบราว์เซอร์มาวางอีกครั้ง";
  }
  return null;
}

/** โดเมนอีเมล: ตัวพิมพ์เล็ก · ตัด @ นำหน้า · ต้องมีจุดและตัวอักษรที่ใช้ได้ในโดเมน */
export function normalizeEmailDomain(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase().replace(/^@+/, "");
}
export function emailDomainProblem(raw: string | null | undefined): string | null {
  const d = normalizeEmailDomain(raw);
  if (!d) return null;
  if (d.length > 190 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
    return "โดเมนอีเมลควรอยู่ในรูป example.co.th (ไม่ต้องใส่ชื่อหน้า @)";
  }
  return null;
}

export function emailProblem(raw: string | null | undefined): string | null {
  const e = String(raw ?? "").trim();
  if (!e) return null;
  if (e.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "อีเมลควรอยู่ในรูป name@example.com";
  return null;
}

export function phoneProblem(raw: string | null | undefined): string | null {
  const p = String(raw ?? "").trim();
  if (!p) return null;
  if (p.length > 40 || !/^[0-9+()\-\s.#,/]+$/.test(p)) return "เบอร์โทรใช้ได้เฉพาะตัวเลขและเครื่องหมาย + - ( ) เท่านั้น";
  return null;
}

export function branchCodeProblem(raw: string | null | undefined): string | null {
  const b = String(raw ?? "").trim();
  if (!b) return null;
  if (!/^\d{5}$/.test(b)) return "รหัสสาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)";
  return null;
}

/** เลขภาษีแบบอ่านง่าย 0-1055-63012-34-5 */
export function formatTaxId(taxId: string | null | undefined): string {
  const t = String(taxId ?? "");
  if (!/^\d{13}$/.test(t)) return t;
  return `${t[0]}-${t.slice(1, 5)}-${t.slice(5, 10)}-${t.slice(10, 12)}-${t[12]}`;
}

/** สตางค์ → "฿1,840,000" (ปัดเป็นบาท) */
export function formatSatangBaht(satang: number): string {
  return `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
}

/** "2 วันก่อน" · "3 ชั่วโมงก่อน" · "เมื่อสักครู่" (ช่วงเวลาไม่ขึ้นกับโซน — ลบกันเป็นมิลลิวินาที) */
export function relativeThai(at: Date | string | null | undefined, now: Date = new Date()): string {
  if (!at) return "—";
  const ms = now.getTime() - new Date(at).getTime();
  if (!Number.isFinite(ms)) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีก่อน`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงก่อน`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} วันก่อน`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} เดือนก่อน`;
  return `${Math.floor(mon / 12)} ปีก่อน`;
}
