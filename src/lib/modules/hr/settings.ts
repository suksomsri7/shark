// HR H1.2 ▸ การตั้งค่าเวลาและการลา: กะ (HrShift) · ประเภทการลา (HrLeavePolicy) · วันหยุด (HrHoliday)
//
// กติกา (brief H1.2 R5 · มติ Q2/Q3/Q10/Q12):
//   • ใครแก้ได้ = OWNER หรือผู้มีคีย์ hr.employee.create (ไม่มีคีย์ใหม่ใน H1.2 — Q2)
//   • สาขา (H1.1): อ่าน = แถวทั้งร้าน (unitId null) + แถวของสาขาในขอบเขต · เขียนแถวของสาขา = สาขานั้นต้องอยู่ใน hrScopeOf(ผู้กด) ·
//     เขียนแถวทั้งร้าน = ผู้ดูแลทุกสาขาเท่านั้น · นอกสาขา = ข้อความคงที่ (Q3)
//   • กะ/ประเภทการลา = ปิดใช้แทนการลบ (ตารางงาน/สมุดวันลาอ้างด้วย FK Restrict) · วันหยุด = ลบจริงได้ (ไม่มีใครอ้าง)
//   • กันชื่อซ้ำ/วันซ้ำด้วย unique index ใน DB (SQL ดิบของ migration 20261205000000) — ชน (P2002/23505) ⇒ ข้อความไทยคงที่
//   • ตรวจเวลากะด้วย shiftWindow ของ time-rules (กติกาเดียวกับทั้งระบบ) · ไม่มี event (Q10) · audit hr.settings.<entity>.<op> = id ล้วน
//   • ผลลัพธ์ = { ok: true, id } | { ok: false, reason } — reason เป็นข้อความไทยคงที่เสมอ (ไม่ส่ง e.message ของระบบ)
//   • รายการคืนเฉพาะคอลัมน์ของตารางตั้งค่า — ไม่มีข้อมูลพนักงาน ◂
import { Prisma, type HrHolidayKind, type HrLeaveType } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { HR_UNIT_NOT_FOUND_TEXT, hrScopeOf, type HrScope } from "./scope";
import { addDays, shiftWindow, TimeRuleError } from "./time-rules";

type Ctx = { tenantId: string; systemId: string };
/** ผู้กด — รูปเดียวกับ HrViewer ของ hr/privacy (role · unitAccess · permissions · userId) */
export type SettingsViewer = Pick<MembershipCtx, "role" | "permissions"> & { unitAccess: unknown; userId?: string | null };
export type SettingsResult = { ok: true; id: string } | { ok: false; reason: string };

// ── ข้อความคงที่ (ห้ามต่อชื่อ/id) ──
export const SETTINGS_TEXT = {
  shiftDup: "มีกะชื่อนี้อยู่แล้วในสาขานี้",
  holidayDup: "มีวันหยุดวันนี้อยู่แล้ว",
  policyDup: "มีประเภทการลาชื่อนี้อยู่แล้ว",
  shiftUsed: "กะนี้ถูกใช้ในตารางงานแล้ว — ปิดใช้แทนการลบ",
  otherUnit: "รายการนี้เป็นของสาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ",
  shopWide: "รายการที่ใช้ทั้งร้านจัดการได้เฉพาะผู้ดูแลทุกสาขา — เลือกสาขาของคุณ",
  noPermission: "คุณไม่มีสิทธิ์ตั้งค่าระบบพนักงาน",
  notFound: "ไม่พบรายการนี้",
  name: "กรุณาใส่ชื่อ (ไม่เกิน 60 ตัวอักษร)",
  code: "รหัสกะยาวเกินไป (ไม่เกิน 20 ตัวอักษร)",
  breakMin: "เวลาพักต้องเป็นนาที 0 ถึง 720",
  graceMin: "เวลาผ่อนผันต้องเป็นนาที 0 ถึง 240",
  colour: "สีของกะไม่ถูกต้อง",
  sortOrder: "ลำดับไม่ถูกต้อง",
  category: "หมวดการลาไม่ถูกต้อง",
  quotaDays: "โควตาวันลาต้องอยู่ระหว่าง 0 ถึง 365 วัน ทีละครึ่งวัน",
  carryMaxDays: "วันลาสะสมต้องเป็น 0 ถึง 365 วัน ทีละครึ่งวัน และไม่เกินโควตา",
  carryExpires: "วันหมดอายุวันลาสะสมต้องเป็นรูปแบบ เดือน-วัน (เช่น 03-31)",
  minServiceDays: "อายุงานขั้นต่ำต้องเป็นจำนวนวัน 0 ถึง 3650",
  attachmentAfterDays: "จำนวนวันที่ต้องแนบเอกสารต้องเป็น 1 ถึง 365 วัน",
  yearStartMonth: "เดือนเริ่มปีการลาต้องเป็น 1 ถึง 12",
  date: "วันที่ไม่ถูกต้อง",
  holidayKind: "ชนิดวันหยุดไม่ถูกต้อง",
  presetYear: "ปีของชุดวันหยุดไม่ถูกต้อง",
  note: "หมายเหตุยาวเกินไป (ไม่เกิน 200 ตัวอักษร)",
  failed: "บันทึกไม่สำเร็จ — กรุณาลองใหม่",
} as const;

const LEAVE_CATEGORIES = new Set<HrLeaveType>(["SICK", "PERSONAL", "VACATION", "OTHER"]);
const HOLIDAY_KINDS = new Set<HrHolidayKind>(["PUBLIC", "SHOP"]);
const COLOUR_RE = /^shift-([1-9]|1[0-2])$/; // คีย์สีของธีม (UI §C.12) ไม่ใช่ hex
/** วันอ้างอิงสำหรับตรวจรูปแบบเวลากะ (ไม่ใช่ "วันนี้" — กติกาไม่ขึ้นกับวัน) */
const CHECK_DAY = "2030-01-07";

class SettingsRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsRefusal";
  }
}
const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2002";
  const x = e as { code?: unknown; cause?: { code?: unknown; originalCode?: unknown }; message?: unknown } | null;
  if (!x) return false;
  return x.code === "P2002" || x.code === "23505" || x.cause?.code === "23505" || x.cause?.originalCode === "23505";
}
/** ข้อผิดพลาดใด ๆ → ข้อความไทยคงที่ (ไม่ส่ง e.message ของระบบ) */
function reasonOf(e: unknown, dupText: string): string {
  if (e instanceof SettingsRefusal || e instanceof TimeRuleError) return e.message;
  if (isUniqueViolation(e)) return dupText;
  return SETTINGS_TEXT.failed;
}

// ── สิทธิ์ + สาขา ──
/** ตั้งค่าได้ไหม (Q2: OWNER หรือ hr.employee.create — MANAGER ผ่านตาม evaluate) */
export function canManageHrSettings(v: SettingsViewer | null | undefined): boolean {
  if (!v) return false;
  if (v.role === "OWNER") return true;
  const m = { role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown> };
  return evaluate(m as MembershipCtx, { module: "hr", action: "hr.employee.create" });
}
const scopeOfViewer = (v: SettingsViewer): HrScope => hrScopeOf({ role: v.role, unitAccess: v.unitAccess });
const cleanUnit = (u: unknown): string | null => (typeof u === "string" && u.trim() ? u.trim() : null);

/** แถวของสาขา `unitId` (null = ทั้งร้าน) อยู่ในขอบเขตของผู้กดไหม — null = ผ่าน */
function scopeRefusal(scope: HrScope, unitId: string | null): string | null {
  if (scope.unitIds === "*") return null;
  if (unitId === null) return SETTINGS_TEXT.shopWide;
  return scope.unitIds.includes(unitId) ? null : SETTINGS_TEXT.otherUnit;
}
/** สาขาปลายทางของการเขียน: อยู่ในขอบเขต + เป็นสาขาของร้านนี้จริง */
// HR H1.2 R13 ▸ R13.2 (COMMON §C.8): เรียกระหว่าง $transaction ต้องส่ง tx เข้ามา — ห้ามเปิด client ที่สองตอน tx ค้างอยู่
//   (pool 1 ⇒ รอตัวเองจน timeout) · นอก tx ใช้ tenantDb ตามเดิม · ใส่ tenantId ในเงื่อนไขเองเสมอ ◂
async function targetUnitRefusal(ctx: Ctx, scope: HrScope, unitId: string | null, tx?: Prisma.TransactionClient): Promise<string | null> {
  const r = scopeRefusal(scope, unitId);
  if (r || unitId === null) return r;
  const where = { id: unitId, tenantId: ctx.tenantId };
  const u = tx
    ? await tx.businessUnit.findFirst({ where, select: { id: true } })
    : await tenantDb({ tenantId: ctx.tenantId }).businessUnit.findFirst({ where, select: { id: true } });
  return u ? null : HR_UNIT_NOT_FOUND_TEXT;
}
function gate(v: SettingsViewer): string | null {
  return canManageHrSettings(v) ? null : SETTINGS_TEXT.noPermission;
}
/** ตัวกรองรายการตามขอบเขต: ทั้งร้าน + สาขาในขอบเขต (ไม่มีขอบเขต = ทั้งร้านอย่างเดียว — fail closed) */
function unitListWhere(scope: HrScope | null | undefined): { OR?: ({ unitId: null } | { unitId: { in: string[] } })[] } {
  if (scope && scope.unitIds === "*") return {};
  const ids = scope && Array.isArray(scope.unitIds) ? scope.unitIds : [];
  return { OR: [{ unitId: null }, { unitId: { in: ids } }] };
}

async function audit(ctx: Ctx, v: SettingsViewer, entity: "shift" | "leave-policy" | "holiday", op: "create" | "update" | "archive" | "delete", targetType: string, id: string, unitId: string | null) {
  // id ล้วน — ไม่มีชื่อกะ/ชื่อวันหยุด/ชื่อคน (§C.1)
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: v.userId ? "USER" : "SYSTEM",
    actorId: v.userId ?? null,
    action: `hr.settings.${entity}.${op}`,
    targetType,
    targetId: id,
    after: { id, systemId: ctx.systemId, unitId },
  });
}

// ── ตัวช่วยตรวจค่า ──
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k) && (o as Record<string, unknown>)[k] !== undefined;
function int(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
}
function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function name(v: unknown): string {
  const s = text(v);
  if (!s || s.length > 60) throw new SettingsRefusal(SETTINGS_TEXT.name);
  return s;
}
function bool(v: unknown, dflt: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "on" || v === "1") return true;
  if (v === "false" || v === "off" || v === "0") return false;
  return dflt;
}
/** วันละครึ่ง 0..365 → สตริงทศนิยม 1 ตำแหน่ง (Decimal(4,1)) */
function halfDays(v: unknown, err: string): string {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 365 || !Number.isInteger(n * 2)) throw new SettingsRefusal(err);
  return n.toFixed(1);
}
function dayKey(v: unknown): string {
  const s = v instanceof Date && Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : typeof v === "string" ? v.trim().slice(0, 10) : "";
  try {
    return addDays(s, 0); // ตรวจรูปแบบ + วันจริง (รวม 29 ก.พ.)
  } catch {
    throw new SettingsRefusal(SETTINGS_TEXT.date);
  }
}
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`); // รูปเดียวกับคอลัมน์ @db.Date
function monthDay(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const m = typeof v === "string" ? /^(\d{2})-(\d{2})$/.exec(v.trim()) : null;
  if (!m) throw new SettingsRefusal(SETTINGS_TEXT.carryExpires);
  const mo = Number(m[1]);
  const d = Number(m[2]);
  const t = new Date(Date.UTC(2028, mo - 1, d)); // ปีอธิกสุรทิน ⇒ 02-29 ใช้ได้
  if (mo < 1 || mo > 12 || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) throw new SettingsRefusal(SETTINGS_TEXT.carryExpires);
  return `${m[1]}-${m[2]}`;
}
function optNote(v: unknown): string | null {
  const s = text(v);
  if (s && s.length > 200) throw new SettingsRefusal(SETTINGS_TEXT.note);
  return s;
}

// ═══════════════════════════ กะ (HrShift) ═══════════════════════════
const SHIFT_SELECT = {
  id: true,
  tenantId: true,
  systemId: true,
  unitId: true,
  name: true,
  code: true,
  startMin: true,
  endMin: true,
  breakMin: true,
  graceMin: true,
  crossesMidnight: true,
  colour: true,
  active: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.HrShiftSelect;
export type ShiftRow = Prisma.HrShiftGetPayload<{ select: typeof SHIFT_SELECT }>;
export type ShiftInput = {
  unitId?: string | null;
  name?: string;
  code?: string | null;
  startMin?: number;
  endMin?: number;
  breakMin?: number;
  graceMin?: number;
  /** ไม่ส่ง = คิดจาก endMin < startMin */
  crossesMidnight?: boolean;
  colour?: string | null;
  sortOrder?: number;
};
type ShiftData = { name: string; code: string | null; startMin: number; endMin: number; breakMin: number; graceMin: number; crossesMidnight: boolean; colour: string | null; sortOrder: number };

/** ตรวจ + ทำค่าให้เป็นรูปเดียว (base = แถวเดิมตอนแก้ไข) */
function shiftData(input: ShiftInput, base?: ShiftData): ShiftData {
  const pick = <K extends keyof ShiftData>(k: K, f: (v: unknown) => ShiftData[K], dflt: ShiftData[K]): ShiftData[K] => (has(input, k) ? f((input as Record<string, unknown>)[k]) : base ? base[k] : dflt);
  const startMin = pick("startMin", (v) => int(v) ?? -1, -1);
  const endMin = pick("endMin", (v) => int(v) ?? -1, -1);
  const timesChanged = has(input, "startMin") || has(input, "endMin");
  const crossesMidnight = has(input, "crossesMidnight")
    ? bool(input.crossesMidnight, false)
    : base && !timesChanged
      ? base.crossesMidnight
      : endMin < startMin;
  const out: ShiftData = {
    name: pick("name", name, ""),
    code: pick("code", (v) => {
      const s = text(v);
      if (s && s.length > 20) throw new SettingsRefusal(SETTINGS_TEXT.code);
      return s;
    }, null),
    startMin,
    endMin,
    breakMin: pick("breakMin", (v) => {
      const n = v === null || v === "" ? 0 : int(v);
      if (n === null || n < 0 || n > 720) throw new SettingsRefusal(SETTINGS_TEXT.breakMin);
      return n;
    }, 0),
    graceMin: pick("graceMin", (v) => {
      const n = v === null || v === "" ? 15 : int(v);
      if (n === null || n < 0 || n > 240) throw new SettingsRefusal(SETTINGS_TEXT.graceMin);
      return n;
    }, 15),
    crossesMidnight,
    colour: pick("colour", (v) => {
      const s = text(v);
      if (s && !COLOUR_RE.test(s)) throw new SettingsRefusal(SETTINGS_TEXT.colour);
      return s;
    }, null),
    sortOrder: pick("sortOrder", (v) => {
      const n = v === null || v === "" ? 0 : int(v);
      if (n === null || n < -9999 || n > 9999) throw new SettingsRefusal(SETTINGS_TEXT.sortOrder);
      return n;
    }, 0),
  };
  if (!out.name) throw new SettingsRefusal(SETTINGS_TEXT.name);
  // กติกาเวลากะชุดเดียวของทั้งระบบ (เริ่ม ≠ เลิก · 0..1439/1440 · ธงข้ามเที่ยงคืนตรงกับเวลา) — ผิด = TimeRuleError ข้อความไทย
  shiftWindow(CHECK_DAY, { startMin: out.startMin, endMin: out.endMin, crossesMidnight: out.crossesMidnight });
  return out;
}

export async function listShifts(ctx: Ctx, opts: { scope: HrScope; includeArchived?: boolean }): Promise<ShiftRow[]> {
  return tenantDb(ctx).hrShift.findMany({
    where: { ...unitListWhere(opts?.scope), ...(opts?.includeArchived ? {} : { active: true }) },
    select: SHIFT_SELECT,
    orderBy: [{ sortOrder: "asc" }, { startMin: "asc" }, { name: "asc" }, { id: "asc" }],
    take: 500,
  });
}

export async function createShift(ctx: Ctx, v: SettingsViewer, input: ShiftInput): Promise<SettingsResult> {
  const g = gate(v);
  if (g) return refuse(g);
  try {
    const unitId = cleanUnit(input?.unitId);
    const ur = await targetUnitRefusal(ctx, scopeOfViewer(v), unitId);
    if (ur) return refuse(ur);
    const data = shiftData(input ?? {});
    const row = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      return tx.hrShift.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, ...data }, select: { id: true } });
    });
    await audit(ctx, v, "shift", "create", "HrShift", row.id, unitId);
    return { ok: true, id: row.id };
  } catch (e) {
    return refuse(reasonOf(e, SETTINGS_TEXT.shiftDup));
  }
}

export async function updateShift(ctx: Ctx, v: SettingsViewer, id: string, patch: ShiftInput): Promise<SettingsResult> {
  const g = gate(v);
  if (g) return refuse(g);
  try {
    const scope = scopeOfViewer(v);
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const row = typeof id === "string" && id ? await tx.hrShift.findFirst({ where: { id }, select: SHIFT_SELECT }) : null;
      if (!row) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      const own = scopeRefusal(scope, row.unitId);
      if (own) throw new SettingsRefusal(own);
      const unitId = patch && has(patch, "unitId") ? cleanUnit(patch.unitId) : row.unitId;
      if (unitId !== row.unitId) {
        const ur = await targetUnitRefusal(ctx, scope, unitId, tx); // HR H1.2 R13 ▸ tx client ◂
        if (ur) throw new SettingsRefusal(ur);
      }
      const data = shiftData(patch ?? {}, row);
      const res = await tx.hrShift.updateMany({ where: { id: row.id }, data: { unitId, ...data } });
      if (res.count !== 1) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      return { id: row.id, unitId };
    });
    await audit(ctx, v, "shift", "update", "HrShift", out.id, out.unitId);
    return { ok: true, id: out.id };
  } catch (e) {
    return refuse(reasonOf(e, SETTINGS_TEXT.shiftDup));
  }
}

/** ปิดใช้กะ (ไม่ลบ — ตารางงานที่อ้างกะนี้คงอยู่ · FK Restrict กันการลบจริง) */
export async function archiveShift(ctx: Ctx, v: SettingsViewer, id: string): Promise<SettingsResult> {
  const g = gate(v);
  if (g) return refuse(g);
  try {
    const scope = scopeOfViewer(v);
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const row = typeof id === "string" && id ? await tx.hrShift.findFirst({ where: { id }, select: { id: true, unitId: true, active: true } }) : null;
      if (!row) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      const own = scopeRefusal(scope, row.unitId);
      if (own) throw new SettingsRefusal(own);
      const res = await tx.hrShift.updateMany({ where: { id: row.id, active: true }, data: { active: false } });
      return { id: row.id, unitId: row.unitId, changed: res.count === 1 };
    });
    if (out.changed) await audit(ctx, v, "shift", "archive", "HrShift", out.id, out.unitId);
    return { ok: true, id: out.id };
  } catch (e) {
    return refuse(reasonOf(e, SETTINGS_TEXT.shiftDup));
  }
}

// ═══════════════════════════ ประเภทการลา (HrLeavePolicy) ═══════════════════════════
const POLICY_SELECT = {
  id: true,
  tenantId: true,
  systemId: true,
  unitId: true,
  category: true,
  name: true,
  paid: true,
  quotaDays: true,
  minServiceDays: true,
  firstYearProrata: true,
  carryMaxDays: true,
  carryExpiresMonthDay: true,
  allowHalfDay: true,
  allowHours: true,
  attachmentAfterDays: true,
  yearStartMonth: true,
  active: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.HrLeavePolicySelect;
export type LeavePolicyRow = Prisma.HrLeavePolicyGetPayload<{ select: typeof POLICY_SELECT }>;
export type LeavePolicyInput = {
  unitId?: string | null;
  category?: string;
  name?: string;
  paid?: boolean;
  /** null = ไม่จำกัดโควตา */
  quotaDays?: number | string | null;
  minServiceDays?: number;
  firstYearProrata?: boolean;
  carryMaxDays?: number | string;
  carryExpiresMonthDay?: string | null;
  allowHalfDay?: boolean;
  allowHours?: boolean;
  attachmentAfterDays?: number | null;
  yearStartMonth?: number;
  sortOrder?: number;
};
type PolicyData = {
  category: HrLeaveType;
  name: string;
  paid: boolean;
  quotaDays: string | null;
  minServiceDays: number;
  firstYearProrata: boolean;
  carryMaxDays: string;
  carryExpiresMonthDay: string | null;
  allowHalfDay: boolean;
  allowHours: boolean;
  attachmentAfterDays: number | null;
  yearStartMonth: number;
  sortOrder: number;
};
const decStr = (d: Prisma.Decimal | null): string | null => (d === null ? null : Number(d.toString()).toFixed(1));

function policyData(input: LeavePolicyInput, base?: PolicyData): PolicyData {
  const pick = <K extends keyof PolicyData>(k: K, f: (v: unknown) => PolicyData[K], dflt: PolicyData[K]): PolicyData[K] => (has(input, k) ? f((input as Record<string, unknown>)[k]) : base ? base[k] : dflt);
  const out: PolicyData = {
    category: pick("category", (v) => {
      if (typeof v !== "string" || !LEAVE_CATEGORIES.has(v as HrLeaveType)) throw new SettingsRefusal(SETTINGS_TEXT.category);
      return v as HrLeaveType;
    }, "" as HrLeaveType),
    name: pick("name", name, ""),
    paid: pick("paid", (v) => bool(v, true), true),
    quotaDays: pick("quotaDays", (v) => (v === null || v === "" ? null : halfDays(v, SETTINGS_TEXT.quotaDays)), null),
    minServiceDays: pick("minServiceDays", (v) => {
      const n = v === null || v === "" ? 0 : int(v);
      if (n === null || n < 0 || n > 3650) throw new SettingsRefusal(SETTINGS_TEXT.minServiceDays);
      return n;
    }, 0),
    firstYearProrata: pick("firstYearProrata", (v) => bool(v, false), false),
    carryMaxDays: pick("carryMaxDays", (v) => (v === null || v === "" ? "0.0" : halfDays(v, SETTINGS_TEXT.carryMaxDays)), "0.0"),
    carryExpiresMonthDay: pick("carryExpiresMonthDay", monthDay, null),
    allowHalfDay: pick("allowHalfDay", (v) => bool(v, true), true),
    allowHours: pick("allowHours", (v) => bool(v, false), false),
    attachmentAfterDays: pick("attachmentAfterDays", (v) => {
      if (v === null || v === "") return null;
      const n = int(v);
      if (n === null || n < 1 || n > 365) throw new SettingsRefusal(SETTINGS_TEXT.attachmentAfterDays);
      return n;
    }, null),
    yearStartMonth: pick("yearStartMonth", (v) => {
      const n = v === null || v === "" ? 1 : int(v);
      if (n === null || n < 1 || n > 12) throw new SettingsRefusal(SETTINGS_TEXT.yearStartMonth);
      return n;
    }, 1),
    sortOrder: pick("sortOrder", (v) => {
      const n = v === null || v === "" ? 0 : int(v);
      if (n === null || n < -9999 || n > 9999) throw new SettingsRefusal(SETTINGS_TEXT.sortOrder);
      return n;
    }, 0),
  };
  if (!LEAVE_CATEGORIES.has(out.category)) throw new SettingsRefusal(SETTINGS_TEXT.category);
  if (!out.name) throw new SettingsRefusal(SETTINGS_TEXT.name);
  if (out.quotaDays !== null && Number(out.carryMaxDays) > Number(out.quotaDays)) throw new SettingsRefusal(SETTINGS_TEXT.carryMaxDays);
  return out;
}
const policyBase = (r: LeavePolicyRow): PolicyData => ({
  category: r.category,
  name: r.name,
  paid: r.paid,
  quotaDays: decStr(r.quotaDays),
  minServiceDays: r.minServiceDays,
  firstYearProrata: r.firstYearProrata,
  carryMaxDays: decStr(r.carryMaxDays) ?? "0.0",
  carryExpiresMonthDay: r.carryExpiresMonthDay,
  allowHalfDay: r.allowHalfDay,
  allowHours: r.allowHours,
  attachmentAfterDays: r.attachmentAfterDays,
  yearStartMonth: r.yearStartMonth,
  sortOrder: r.sortOrder,
});

export async function listLeavePolicies(ctx: Ctx, opts: { scope: HrScope; includeArchived?: boolean }): Promise<LeavePolicyRow[]> {
  return tenantDb(ctx).hrLeavePolicy.findMany({
    where: { ...unitListWhere(opts?.scope), ...(opts?.includeArchived ? {} : { active: true }) },
    select: POLICY_SELECT,
    orderBy: [{ sortOrder: "asc" }, { category: "asc" }, { name: "asc" }, { id: "asc" }],
    take: 500,
  });
}

export async function createLeavePolicy(ctx: Ctx, v: SettingsViewer, input: LeavePolicyInput): Promise<SettingsResult> {
  const g = gate(v);
  if (g) return refuse(g);
  try {
    const unitId = cleanUnit(input?.unitId);
    const ur = await targetUnitRefusal(ctx, scopeOfViewer(v), unitId);
    if (ur) return refuse(ur);
    const data = policyData(input ?? {});
    const row = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      return tx.hrLeavePolicy.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, ...data }, select: { id: true } });
    });
    await audit(ctx, v, "leave-policy", "create", "HrLeavePolicy", row.id, unitId);
    return { ok: true, id: row.id };
  } catch (e) {
    return refuse(reasonOf(e, SETTINGS_TEXT.policyDup));
  }
}

export async function updateLeavePolicy(ctx: Ctx, v: SettingsViewer, id: string, patch: LeavePolicyInput): Promise<SettingsResult> {
  const g = gate(v);
  if (g) return refuse(g);
  try {
    const scope = scopeOfViewer(v);
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const row = typeof id === "string" && id ? await tx.hrLeavePolicy.findFirst({ where: { id }, select: POLICY_SELECT }) : null;
      if (!row) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      const own = scopeRefusal(scope, row.unitId);
      if (own) throw new SettingsRefusal(own);
      const unitId = patch && has(patch, "unitId") ? cleanUnit(patch.unitId) : row.unitId;
      if (unitId !== row.unitId) {
        const ur = await targetUnitRefusal(ctx, scope, unitId, tx); // HR H1.2 R13 ▸ tx client ◂
        if (ur) throw new SettingsRefusal(ur);
      }
      const data = policyData(patch ?? {}, policyBase(row));
      const res = await tx.hrLeavePolicy.updateMany({ where: { id: row.id }, data: { unitId, ...data } });
      if (res.count !== 1) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      return { id: row.id, unitId };
    });
    await audit(ctx, v, "leave-policy", "update", "HrLeavePolicy", out.id, out.unitId);
    return { ok: true, id: out.id };
  } catch (e) {
    return refuse(reasonOf(e, SETTINGS_TEXT.policyDup));
  }
}

/** ปิดใช้ประเภทการลา (ไม่ลบ — สมุดวันลาอ้างด้วย FK Restrict · ใบลาเดิมยังชี้ได้) */
export async function archiveLeavePolicy(ctx: Ctx, v: SettingsViewer, id: string): Promise<SettingsResult> {
  const g = gate(v);
  if (g) return refuse(g);
  try {
    const scope = scopeOfViewer(v);
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const row = typeof id === "string" && id ? await tx.hrLeavePolicy.findFirst({ where: { id }, select: { id: true, unitId: true } }) : null;
      if (!row) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      const own = scopeRefusal(scope, row.unitId);
      if (own) throw new SettingsRefusal(own);
      const res = await tx.hrLeavePolicy.updateMany({ where: { id: row.id, active: true }, data: { active: false } });
      return { id: row.id, unitId: row.unitId, changed: res.count === 1 };
    });
    if (out.changed) await audit(ctx, v, "leave-policy", "archive", "HrLeavePolicy", out.id, out.unitId);
    return { ok: true, id: out.id };
  } catch (e) {
    return refuse(reasonOf(e, SETTINGS_TEXT.policyDup));
  }
}

// ═══════════════════════════ วันหยุด (HrHoliday) ═══════════════════════════
const HOLIDAY_SELECT = {
  id: true,
  tenantId: true,
  systemId: true,
  unitId: true,
  date: true,
  name: true,
  kind: true,
  presetYear: true,
  shopOpen: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.HrHolidaySelect;
export type HolidayRow = Prisma.HrHolidayGetPayload<{ select: typeof HOLIDAY_SELECT }>;
export type HolidayInput = {
  /** ไม่ส่ง = เพิ่มใหม่ · ส่ง = แก้แถวนั้น */
  id?: string | null;
  unitId?: string | null;
  date?: string | Date;
  name?: string;
  kind?: string;
  presetYear?: number | null;
  shopOpen?: boolean;
  note?: string | null;
};
type HolidayData = { date: Date; name: string; kind: HrHolidayKind; presetYear: number | null; shopOpen: boolean; note: string | null };

function holidayData(input: HolidayInput, base?: HolidayData): HolidayData {
  const pick = <K extends keyof HolidayData>(k: K, f: (v: unknown) => HolidayData[K], dflt: HolidayData[K]): HolidayData[K] => (has(input, k) ? f((input as Record<string, unknown>)[k]) : base ? base[k] : dflt);
  const out: HolidayData = {
    date: pick("date", (v) => dbDate(dayKey(v)), null as unknown as Date),
    name: pick("name", name, ""),
    kind: pick("kind", (v) => {
      if (typeof v !== "string" || !HOLIDAY_KINDS.has(v as HrHolidayKind)) throw new SettingsRefusal(SETTINGS_TEXT.holidayKind);
      return v as HrHolidayKind;
    }, "SHOP"),
    presetYear: pick("presetYear", (v) => {
      if (v === null || v === "") return null;
      const n = int(v);
      if (n === null || n < 2000 || n > 2999) throw new SettingsRefusal(SETTINGS_TEXT.presetYear);
      return n;
    }, null),
    shopOpen: pick("shopOpen", (v) => bool(v, false), false),
    note: pick("note", optNote, null),
  };
  if (!(out.date instanceof Date)) throw new SettingsRefusal(SETTINGS_TEXT.date);
  if (!out.name) throw new SettingsRefusal(SETTINGS_TEXT.name);
  return out;
}

/** วันหยุดของปี (ปฏิทินไทย 1 ม.ค.–31 ธ.ค. — คอลัมน์เป็นวันที่ล้วน) ตามขอบเขต */
export async function listHolidays(ctx: Ctx, opts: { year: number; scope: HrScope }): Promise<HolidayRow[]> {
  const year = int(opts?.year);
  if (year === null || year < 2000 || year > 2999) return [];
  return tenantDb(ctx).hrHoliday.findMany({
    where: { ...unitListWhere(opts.scope), date: { gte: dbDate(`${year}-01-01`), lt: dbDate(`${year + 1}-01-01`) } },
    select: HOLIDAY_SELECT,
    orderBy: [{ date: "asc" }, { unitId: "asc" }, { id: "asc" }],
    take: 1000,
  });
}

/** เพิ่ม (ไม่มี id) หรือแก้ (มี id) วันหยุด */
export async function upsertHoliday(ctx: Ctx, v: SettingsViewer, input: HolidayInput): Promise<SettingsResult> {
  const g = gate(v);
  if (g) return refuse(g);
  try {
    const scope = scopeOfViewer(v);
    const id = typeof input?.id === "string" && input.id.trim() ? input.id.trim() : null;
    if (!id) {
      const unitId = cleanUnit(input?.unitId);
      const ur = await targetUnitRefusal(ctx, scope, unitId);
      if (ur) return refuse(ur);
      const data = holidayData(input ?? {});
      const row = await tenantDb(ctx).$transaction(async (t) => {
        const tx = t as unknown as Prisma.TransactionClient;
        return tx.hrHoliday.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, ...data }, select: { id: true } });
      });
      await audit(ctx, v, "holiday", "create", "HrHoliday", row.id, unitId);
      return { ok: true, id: row.id };
    }
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const row = await tx.hrHoliday.findFirst({ where: { id }, select: HOLIDAY_SELECT });
      if (!row) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      const own = scopeRefusal(scope, row.unitId);
      if (own) throw new SettingsRefusal(own);
      const unitId = has(input, "unitId") ? cleanUnit(input.unitId) : row.unitId;
      if (unitId !== row.unitId) {
        const ur = await targetUnitRefusal(ctx, scope, unitId, tx); // HR H1.2 R13 ▸ tx client ◂
        if (ur) throw new SettingsRefusal(ur);
      }
      const data = holidayData(input, { date: row.date, name: row.name, kind: row.kind, presetYear: row.presetYear, shopOpen: row.shopOpen, note: row.note });
      const res = await tx.hrHoliday.updateMany({ where: { id: row.id }, data: { unitId, ...data } });
      if (res.count !== 1) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      return { id: row.id, unitId };
    });
    await audit(ctx, v, "holiday", "update", "HrHoliday", out.id, out.unitId);
    return { ok: true, id: out.id };
  } catch (e) {
    return refuse(reasonOf(e, SETTINGS_TEXT.holidayDup));
  }
}

/** ลบวันหยุดจริง (ไม่มีตารางไหนอ้าง) */
export async function deleteHoliday(ctx: Ctx, v: SettingsViewer, id: string): Promise<SettingsResult> {
  const g = gate(v);
  if (g) return refuse(g);
  try {
    const scope = scopeOfViewer(v);
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      const row = typeof id === "string" && id ? await tx.hrHoliday.findFirst({ where: { id }, select: { id: true, unitId: true } }) : null;
      if (!row) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      const own = scopeRefusal(scope, row.unitId);
      if (own) throw new SettingsRefusal(own);
      const res = await tx.hrHoliday.deleteMany({ where: { id: row.id } });
      if (res.count !== 1) throw new SettingsRefusal(SETTINGS_TEXT.notFound);
      return { id: row.id, unitId: row.unitId };
    });
    await audit(ctx, v, "holiday", "delete", "HrHoliday", out.id, out.unitId);
    return { ok: true, id: out.id };
  } catch (e) {
    return refuse(reasonOf(e, SETTINGS_TEXT.holidayDup));
  }
}

/** สาขาของแถวตั้งค่า (จาก DB — action ใช้ส่งเข้า assertCan · ไม่เชื่อฟอร์ม) · null = ไม่พบในระบบนี้ */
export async function settingsRowUnit(ctx: Ctx, entity: "shift" | "leave-policy" | "holiday", id: string): Promise<{ unitId: string | null } | null> {
  if (typeof id !== "string" || !id) return null;
  const db = tenantDb(ctx);
  const sel = { unitId: true } as const;
  const row =
    entity === "shift"
      ? await db.hrShift.findFirst({ where: { id }, select: sel })
      : entity === "leave-policy"
        ? await db.hrLeavePolicy.findFirst({ where: { id }, select: sel })
        : await db.hrHoliday.findFirst({ where: { id }, select: sel });
  return row ? { unitId: row.unitId } : null;
}
