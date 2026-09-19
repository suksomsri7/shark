// visibility-shared.ts — ชนิด/ค่าคงที่/ป้ายไทยของ "การมองเห็น" CRM (ใบ C1.7) — ใช้ได้ทั้งเซิร์ฟเวอร์และหน้า 'use client'
// 🔴 ไฟล์นี้ห้าม import อะไรที่ลากถึง prisma (หน้า 'use client' ของ /settings/visibility import ไฟล์นี้)

export const CRM_VIS_ENTITIES = ["CONTACT", "COMPANY", "DEAL", "ACTIVITY", "REPORT"] as const;
export type CrmVisEntity = (typeof CRM_VIS_ENTITIES)[number];

export const CRM_VIS_LEVELS = ["OWN", "TEAM", "ALL"] as const;
export type CrmVisLevel = (typeof CRM_VIS_LEVELS)[number];

export const CRM_VIS_ROLES = ["STAFF", "MANAGER"] as const;
export type CrmVisRole = (typeof CRM_VIS_ROLES)[number];

export const CRM_VIS_ENTITY_LABEL: Readonly<Record<CrmVisEntity, string>> = {
  CONTACT: "ผู้ติดต่อ",
  COMPANY: "บริษัท",
  DEAL: "ดีล",
  ACTIVITY: "กิจกรรม",
  REPORT: "รายงาน",
};

export const CRM_VIS_LEVEL_LABEL: Readonly<Record<CrmVisLevel, string>> = {
  OWN: "ของตัวเอง",
  TEAM: "ทั้งทีม",
  ALL: "ทั้งร้าน (ตามสาขาที่ดูแล)",
};

export const CRM_VIS_ROLE_LABEL: Readonly<Record<CrmVisRole, string>> = { STAFF: "พนักงาน", MANAGER: "ผู้จัดการ" };

/** ค่าเริ่มต้นมติ C9 (เมื่อไม่มี policy และไม่ได้ตั้งใน settings) — หัวหน้าทีม (LEAD) = TEAM ทุกเอนทิตี · OWNER = ALL เสมอ */
export const CRM_VIS_DEFAULT: Readonly<Record<CrmVisRole, Readonly<Record<CrmVisEntity, CrmVisLevel>>>> = {
  STAFF: { CONTACT: "TEAM", COMPANY: "TEAM", DEAL: "TEAM", ACTIVITY: "OWN", REPORT: "OWN" },
  MANAGER: { CONTACT: "ALL", COMPANY: "ALL", DEAL: "ALL", ACTIVITY: "ALL", REPORT: "ALL" },
};

export const CRM_VIS_RANK: Readonly<Record<CrmVisLevel, number>> = { OWN: 0, TEAM: 1, ALL: 2 };

export type VisibilityPolicyDto = {
  id: string;
  role: "OWNER" | "MANAGER" | "STAFF" | null;
  teamId: string | null;
  pipelineId: string | null;
  entity: CrmVisEntity;
  visibility: CrmVisLevel;
  updatedAt: string;
};

export type SetPolicyInput = {
  role?: string | null;
  teamId?: string | null;
  pipelineId?: string | null;
  entity: string;
  visibility: string;
};

export class VisibilityError extends Error {
  readonly status: number;
  constructor(
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "VisibilityError";
    this.status = code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : code === "CONFLICT" ? 409 : 400;
  }
}

export const isVisEntity = (v: unknown): v is CrmVisEntity => typeof v === "string" && (CRM_VIS_ENTITIES as readonly string[]).includes(v);
export const isVisLevel = (v: unknown): v is CrmVisLevel => typeof v === "string" && (CRM_VIS_LEVELS as readonly string[]).includes(v);
