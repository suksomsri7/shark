// ─────────────────────────────────────────────────────────────
// types.ts — ชนิดของเครื่องยนต์ค่าตั้งแบบชั้น (Settings core) · SVC R0.3
// สัญญา: ledger/SVC-CORE-CONTRACT.md §1 · ใบสั่ง ledger/svc-briefs/svc-brief-r0.3.md §2
//
// 🔴 pure ล้วน: ห้าม import ค่า (value) จาก prisma/db/next/โมดูล — `import type` เท่านั้น (ข้อสอบ S-2 ไล่ import graph)
// ─────────────────────────────────────────────────────────────
import type { ZodType } from "zod";
import type { MembershipCtx } from "@/lib/core/rbac";
import type { LegalRuleId, LegalVerdict } from "./legal/th-rental-2568";

// LegalVerdict/LegalRuleId ประกาศที่ legal/th-rental-2568.ts ที่เดียว (ห้ามประกาศซ้ำ)
export type { LegalRuleId, LegalVerdict };

/** ชั้นที่ตั้งค่าได้ — ข้อความ (เพิ่มชั้นใหม่ไม่ต้อง migrate · CC §1.2) */
export const SCOPE_KINDS = [
  "TENANT",
  "UNIT",
  "BUILDING",
  "ROOM_TYPE",
  "ROOM",
  "LEASE",
  "RATE_PLAN",
  "STAFF",
  "SERVICE",
  "RESOURCE",
  "DEVICE",
  "COURSE",
] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];

/** "qcfx" = ฟิกซ์เจอร์ QC เท่านั้น (defs/_fixture.ts) */
export type SettingDomain = "booking" | "rooms" | "payments" | "messaging" | "qcfx";

export type SettingValueType =
  | "int"
  | "money"
  | "percent"
  | "bool"
  | "enum"
  | "text"
  | "template"
  | "table"
  | "minutes"
  | "days"
  | "time";

export type SettingSensitivity = "MONEY" | "LEGAL" | "PRIVACY";

/** ตัวแปลงค่าตั้ง → อินพุตของตัวตรวจกฎหมาย · คืน `null` ให้ rule ใด = "ตรวจตอนบันทึกค่าตั้งไม่ได้" ⇒ ข้าม (ตรวจซ้ำที่จุดต้นทุน · CC §1.7) */
export type LegalInputFn = (value: unknown, get: (key: string) => unknown) => Partial<Record<LegalRuleId, unknown | null>>;

export type SettingDef = {
  /** "<domain>.<group>.<name>" */
  key: string;
  domain: SettingDomain;
  group: string;
  type: SettingValueType;
  /** zod v4 — ช่วงค่าที่ยอมรับ */
  schema: ZodType;
  /** ค่าเริ่มต่อแม่แบบ + `_fallback` (ไม่มี SettingProfile / แม่แบบไม่ระบุคีย์นี้) */
  defaults: Record<string, unknown> & { _fallback: unknown };
  /** ชั้นที่ยอมให้ตั้ง เรียงทั่วไป→เจาะจง (ตัวท้ายชนะ) */
  chain: readonly ScopeKind[];
  /** คีย์สิทธิ์ใน core/permissions.ts */
  editPermission: string;
  ownerOnly?: boolean;
  /** LEGAL = เจ้าของเท่านั้นเสมอ (แม้ไม่ใส่ ownerOnly) · MONEY = ใช้ editPermission ของ def */
  sensitivity?: SettingSensitivity;
  /** ruleId ของตัวตรวจกฎหมาย (ruleId ล้วน — D.1 oracle ผูกรูปนี้) */
  legal?: readonly LegalRuleId[];
  legalInput?: LegalInputFn;
  requires?: { integration?: string };
  /** ค่าที่ต้องมี "วันที่มีผล" */
  effectiveDated?: boolean;
  /** type=template: ตัวแปรที่อนุญาต */
  templateVars?: readonly string[];
  hiddenUntil?: "PHASE_H";
  labelTh: string;
  helpTh?: string;
};

export type TemplateDef = { key: string; version: number; labelTh: string };
export type GroupIssue = { key: string; code: string; messageTh: string };
export type GroupRule = { group: string; check: (values: Record<string, unknown>) => GroupIssue[] };
export type DefineSettingsOptions = {
  templates?: readonly TemplateDef[];
  snapshots?: Record<string, readonly string[]>;
  groupRules?: readonly GroupRule[];
};

/** ผู้กระทำ = สมาชิกภาพของร้าน + userId */
export type SettingsActor = MembershipCtx & { userId: string };
export type SettingsCtx = { tenantId: string };

/** CC §1.4 — unitId บังคับ */
export type ScopeRefs = {
  unitId: string;
  buildingId?: string;
  roomTypeId?: string;
  roomId?: string;
  leaseId?: string;
  ratePlanId?: string;
  staffId?: string;
  serviceId?: string;
  resourceId?: string;
  deviceId?: string;
  courseId?: string;
};

export type ResolvedSource = ScopeKind | "TEMPLATE" | "FALLBACK";
export type Resolved = {
  value: unknown;
  source: ResolvedSource;
  scopeId?: string;
  templateKey: string | null;
  differsFromTemplate: boolean;
};

export type SettingIssue = { key?: string; code: string; messageTh: string };
export type SetFailCode =
  | "PERMISSION"
  | "VALIDATION"
  | "LEGAL_BLOCK"
  | "NEEDS_APPROVAL"
  | "CONFLICT"
  | "REQUIRES_INTEGRATION"
  | "NOT_FOUND";
export type SetFail = { ok: false; code: SetFailCode; issues: SettingIssue[]; approvalId?: string | null };
export type SetResult = { ok: true; saved: number } | SetFail;
export type RemoveResult = { ok: true; removed: number } | SetFail;

export type SettingChangeInput = {
  key: string;
  scope: string;
  scopeId: string;
  value: unknown;
  effectiveFrom?: Date;
  reason?: string;
};
export type SetOptions = { ackLegalWarn?: boolean };
export type ResetTarget = { key: string; scope: string; scopeId: string };
export type ApplyTemplateInput = {
  unitId: string;
  domain: string;
  templateKey: string;
  overwrite: "KEEP_CUSTOM" | "RESET_ALL";
};

export type SettingsDiffRow = {
  key: string;
  scope: string;
  scopeId: string;
  value: unknown;
  templateValue: unknown;
  effectiveFrom: Date;
};

export type SettingChangeRow = {
  id: string;
  tenantId: string;
  unitId: string | null;
  key: string;
  scope: string;
  scopeId: string;
  before: unknown;
  after: unknown;
  effectiveFrom: Date;
  legalLevel: string;
  legalCode: string | null;
  reason: string | null;
  approvalId: string | null;
  actorId: string;
  at: Date;
};

/** CC §1.6 — JSON ล้วน (เก็บลงคอลัมน์ Json ได้ตรง ๆ) */
export type PolicySnapshot = {
  v: 1;
  domain: string;
  at: string;
  template: { key: string; version: number };
  values: Record<string, unknown>;
  sources: Record<string, string>;
};
