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
export type SettingDomain = "booking" | "rooms" | "payments" | "messaging" | "integrations" | "qcfx"; // SVC C.3 ▸ + integrations ◂

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

/** SVC H.1 ▸ ประเภทหน่วยที่ค่าตั้งผูกได้ (SettingDef.unitTypes) ◂ */
export type SettingUnitType = "HOTEL" | "DORM" | "BOOKING" | "POS";

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
  /** ซ่อนจากหน้าค่าตั้ง: "PHASE_H" = รอเฟสโรงแรม · "RETIRED" = เลิกใช้แล้ว (คง def ไว้ให้ค่าเริ่ม/ข้อสอบ) */
  hiddenUntil?: "PHASE_H" | "RETIRED";
  /** SVC H.1 ▸ แสดงในหน้าตั้งค่าเฉพาะหน่วยประเภทเหล่านี้ (ไม่ประกาศ = ทุกประเภท · ประกาศแล้วแต่ฟอร์มไม่ระบุ unitType = ไม่แสดง) ◂ */
  unitTypes?: readonly SettingUnitType[];
  labelTh: string;
  helpTh?: string;
  /** type=enum: ป้ายไทยของทุกตัวเลือก (หน้าตั้งค่าไม่แสดงค่าดิบ) — R0.4 */
  enumLabelsTh?: Record<string, string>;
  /** B.11 ▸ type=percent: หน่วยที่เก็บ — 100 = % เต็ม (0–100) · 10000 หรือไม่ตั้ง = basis point (พฤติกรรมเดิม) · ตั้งได้เฉพาะ percent ◂ */
  percentScale?: 100 | 10000;
  /** G1UI ▸ type=table: ป้ายไทย + ชนิดของช่องย่อย (หน้าตั้งค่าแสดง/แก้เป็นช่องย่อย ไม่ใช่ข้อความดิบ) — JSON ล้วน (ส่งเข้าโมเดลฟอร์มได้) ◂ */
  tableTh?: TableSpecTh;
  /** D.13 ▸ writeVia = ป้ายไทยของหน้าเฉพาะที่ต้องไปเปลี่ยนค่านี้ — action ทั่วไป (saveSettingsAction/resetSettingAction) ปฏิเสธคีย์ที่มี writeVia ◂ */
  writeVia?: string;
};

/**
 * G1UI ▸ ชนิดช่องย่อยของค่าชนิดตาราง
 *  int = จำนวนเต็ม (+unitTh) · bp = basis point แสดงเป็น % · minutes = นาที · duration = นาที แสดงแบบ "1 วัน · 2 ชม." · days = วัน
 *  clock = นาทีจากเที่ยงคืน แสดง/กรอก HH:MM · clockText = ข้อความ HH:MM · bool · enum (options ป้ายไทย) · text · object (fields ซ้อน)
 */
export type TableCellKind = "int" | "bp" | "minutes" | "duration" | "days" | "clock" | "clockText" | "bool" | "enum" | "text" | "object";
export type TableCellSpecTh = {
  kind: TableCellKind;
  /** ป้ายเต็ม (ตัวแก้) */
  labelTh: string;
  /** ป้ายนำหน้าในข้อความสรุป ("" = แสดงค่าอย่างเดียว · ไม่ตั้ง = ใช้ labelTh) */
  shortTh?: string;
  /** หน่วยท้ายค่า (int) */
  unitTh?: string;
  /** enum: ป้ายไทยทุกตัวเลือก (ลำดับ = ลำดับในตัวเลือก) */
  options?: Record<string, string>;
  /** enum: ป้ายในข้อความสรุป ("" = ไม่แสดงช่องนี้ในสรุป) */
  summaryOptions?: Record<string, string>;
  /** ค่า null แสดงว่าอะไร (และช่องว่าง = null ได้) */
  nullTh?: string;
  /** ป้ายนำในสรุปเมื่อค่าเป็น null ("" = แสดง nullTh อย่างเดียว · ไม่ตั้ง = ใช้ shortTh) */
  nullShortTh?: string;
  /** bool: ป้ายเมื่อเปิด/ปิดในสรุป */
  onTh?: string;
  offTh?: string;
  /** ช่องที่อาจไม่มีในค่า (ไม่มี = ข้ามในสรุป) */
  optional?: boolean;
  /** kind=object */
  fields?: Record<string, TableCellSpecTh>;
};
export type TableSpecTh = {
  /** ค่าเป็นออบเจกต์: ช่องย่อยตามลำดับที่ต้องแสดง */
  fields?: Record<string, TableCellSpecTh>;
  /** ค่าเป็นรายการ: ชนิดของแต่ละรายการ */
  item?: TableCellSpecTh;
  /** รายการ: ลำดับมีความหมาย (แสดงลูกศร · ปุ่มเลื่อนขึ้น) */
  ordered?: boolean;
  /** รายการว่างแสดงว่าอะไร */
  emptyTh?: string;
  /** ค่าทั้งก้อนเป็น null แสดงว่าอะไร */
  nullTh?: string;
  /** ออบเจกต์แบบมีตัวแยกชนิด: ช่องตัวแยก + ช่องที่เหลือของแต่ละชนิด (ค่าตั้งต้นเมื่อเปลี่ยนชนิด) */
  discriminator?: { key: string; variants: Record<string, { [k: string]: TableJson }> };
  /** ค่าตั้งต้นเมื่อเปลี่ยนจาก null เป็น "ตั้งค่า" (ไม่ตั้ง ⇒ ค่าแม่แบบ) */
  starter?: TableJson;
};
export type TableJson = null | string | number | boolean | TableJson[] | { [k: string]: TableJson };

export type TemplateDef = {
  key: string;
  version: number;
  labelTh: string;
  /** SVC B.0 ▸ ซ่อนแม่แบบจากหน้าตั้งค่าจนถึงเฟสนี้ (เช่น "PHASE_CLINIC") — UI ซ่อน · applyTemplate ยังไม่ปฏิเสธ (B.11) ◂ */
  hiddenUntil?: string;
};
export type GroupIssue = { key: string; code: string; messageTh: string };
export type GroupRule = { group: string; check: (values: Record<string, unknown>) => GroupIssue[] };
export type DefineSettingsOptions = {
  templates?: readonly TemplateDef[];
  snapshots?: Record<string, readonly string[]>;
  groupRules?: readonly GroupRule[];
  /** ป้ายไทยของกลุ่ม (group → ข้อความ) ใช้เป็นหัวการ์ดในหน้าค่าตั้ง — R0.4 */
  groupLabelsTh?: Record<string, string>;
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
  /** R0.4 ▸ true = def PRIVACY และผู้ดูไม่ใช่เจ้าของ ⇒ before/after ถูกปิดเป็น null ◂ */
  masked?: boolean;
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
