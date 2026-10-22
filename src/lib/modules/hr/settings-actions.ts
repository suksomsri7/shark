"use server";
// HR H1.2 ▸ server actions ของหน้าตั้งค่า (กะ · ประเภทการลา · วันหยุด) — 8 ตัว รับ FormData ตัวเดียว
//   สิทธิ์ (Q2) = OWNER หรือ hr.employee.create ผ่าน assertCan · สาขาของแถวที่แก้อ่านจาก DB (settingsRowUnit — ไม่เชื่อฟอร์ม) ·
//   สาขาปลายทางของแถวใหม่มาจากฟอร์มแล้ว service ตรวจซ้ำกับขอบเขต (hrScopeOf) และ BusinessUnit ของร้าน ·
//   ผู้ดูแลทุกสาขาไม่ส่ง unitId เข้า assertCan (เหมือน H1.1 R12.1) · ผลลัพธ์ = { ok, id } | { ok:false, reason ไทยคงที่ } (ไม่ throw ข้อความระบบ) ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { tenantDb } from "@/lib/core/db";
import { hrViewerOf } from "./privacy";
import { hrScopeOf, isAllBranches } from "./scope";
import {
  archiveLeavePolicy,
  archiveShift,
  createLeavePolicy,
  createShift,
  deleteHoliday,
  SETTINGS_TEXT,
  settingsRowUnit,
  updateLeavePolicy,
  updateShift,
  upsertHoliday,
  type HolidayInput,
  type LeavePolicyInput,
  type SettingsResult,
  type ShiftInput,
} from "./settings";

type Auth = Awaited<ReturnType<typeof requireTenant>>;
type Ctx = { tenantId: string; systemId: string };
const SETTINGS_KEY = "hr.employee.create"; // Q2: ไม่มีคีย์ใหม่ใน H1.2
const NO_SYSTEM_TEXT = "ไม่พบระบบพนักงานนี้";

const memberOf = (auth: Auth) => ({
  role: auth.active.role,
  unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[],
  permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
});

/** ระบบ HR ของร้านนี้จากฟอร์ม (ไม่ใช่ระบบ HR / ข้ามร้าน = ไม่พบ) */
async function ctxOf(auth: Auth, formData: FormData): Promise<Ctx | null> {
  const systemId = String(formData.get("systemId") ?? "").trim();
  if (!systemId) return null;
  const sys = await tenantDb({ tenantId: auth.active.tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys ? { tenantId: auth.active.tenantId, systemId: sys.id } : null;
}

/**
 * ด่านคีย์ (+ สาขาเป้าหมายเมื่อผู้กดจำกัดสาขาเป็นรายการ) — null = ผ่าน
 * unitId null = แถวทั้งร้าน ⇒ ทุกสาขา: ด่านคีย์ระดับร้าน (service บังคับผู้ดูแลทุกสาขาซ้ำอีกชั้น)
 */
function gate(auth: Auth, unitId: string | null): string | null {
  const m = memberOf(auth);
  try {
    // ทุกสาขา: ด่านคีย์ระดับร้านก่อน (ไม่มีคีย์ = ข้อความไม่มีสิทธิ์)
    assertCan(m, { module: "hr", action: SETTINGS_KEY });
  } catch {
    return SETTINGS_TEXT.noPermission;
  }
  if (!unitId || isAllBranches(hrScopeOf(m))) return null;
  try {
    assertCan(m, { module: "hr", action: SETTINGS_KEY, unitId });
  } catch {
    return SETTINGS_TEXT.otherUnit;
  }
  return null;
}

// ── อ่านฟอร์ม (ช่องที่ไม่ส่ง = ไม่แก้) ──
const str = (f: FormData, k: string): string | undefined => {
  const v = f.get(k);
  return typeof v === "string" ? v : undefined;
};
const unitOfForm = (f: FormData): string | null => {
  const v = str(f, "unitId");
  return v && v.trim() ? v.trim() : null;
};
const idOfForm = (f: FormData, alt: string): string => (str(f, "id") ?? str(f, alt) ?? "").trim();
/** "HH:MM" → นาที (24:00 = 1440) */
function hhmm(v: string | undefined): number | undefined {
  const m = v ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
  if (!m) return undefined;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h >= 0 && h <= 24 && mi >= 0 && mi < 60 && !(h === 24 && mi > 0) ? h * 60 + mi : Number.NaN;
}
function minutes(f: FormData, k: string, alt?: string): number | undefined {
  const raw = str(f, k);
  if (raw !== undefined && raw.trim() !== "") return Number(raw);
  return alt ? hhmm(str(f, alt)) : undefined;
}
const flag = (f: FormData, k: string): boolean | undefined => {
  const v = str(f, k);
  return v === undefined ? undefined : v === "on" || v === "true" || v === "1";
};
function assign<T extends object>(o: T, k: keyof T, v: unknown) {
  if (v !== undefined) (o as Record<string, unknown>)[k as string] = v;
}
function shiftOfForm(f: FormData, withUnit: boolean): ShiftInput {
  const o: ShiftInput = {};
  if (withUnit) o.unitId = unitOfForm(f);
  assign(o, "name", str(f, "name"));
  assign(o, "code", str(f, "code"));
  assign(o, "startMin", minutes(f, "startMin", "start"));
  assign(o, "endMin", minutes(f, "endMin", "end"));
  assign(o, "breakMin", minutes(f, "breakMin"));
  assign(o, "graceMin", minutes(f, "graceMin"));
  assign(o, "crossesMidnight", flag(f, "crossesMidnight"));
  assign(o, "colour", str(f, "colour"));
  assign(o, "sortOrder", minutes(f, "sortOrder"));
  return o;
}
function policyOfForm(f: FormData, withUnit: boolean): LeavePolicyInput {
  const o: LeavePolicyInput = {};
  if (withUnit) o.unitId = unitOfForm(f);
  assign(o, "category", str(f, "category"));
  assign(o, "name", str(f, "name"));
  assign(o, "paid", flag(f, "paid"));
  assign(o, "quotaDays", str(f, "quotaDays"));
  assign(o, "minServiceDays", str(f, "minServiceDays"));
  assign(o, "firstYearProrata", flag(f, "firstYearProrata"));
  assign(o, "carryMaxDays", str(f, "carryMaxDays"));
  assign(o, "carryExpiresMonthDay", str(f, "carryExpiresMonthDay"));
  assign(o, "allowHalfDay", flag(f, "allowHalfDay"));
  assign(o, "allowHours", flag(f, "allowHours"));
  assign(o, "attachmentAfterDays", str(f, "attachmentAfterDays"));
  assign(o, "yearStartMonth", str(f, "yearStartMonth"));
  return o;
}
function holidayOfForm(f: FormData, withUnit: boolean): HolidayInput {
  const o: HolidayInput = {};
  if (withUnit) o.unitId = unitOfForm(f);
  assign(o, "date", str(f, "date"));
  assign(o, "name", str(f, "name"));
  assign(o, "kind", str(f, "kind"));
  assign(o, "presetYear", str(f, "presetYear"));
  assign(o, "shopOpen", flag(f, "shopOpen"));
  assign(o, "note", str(f, "note"));
  return o;
}

const done = (ctx: Ctx, r: SettingsResult): SettingsResult => {
  if (r.ok) revalidatePath(`/app/sys/${ctx.systemId}/hr/settings`);
  return r;
};
type RowEntity = "shift" | "leave-policy" | "holiday";
/** แถวเดิม: ระบบ + สาขาจาก DB + ด่าน — คืน ctx หรือเหตุผล */
async function rowGate(auth: Auth, formData: FormData, entity: RowEntity, id: string): Promise<{ ctx: Ctx } | { ok: false; reason: string }> {
  const ctx = await ctxOf(auth, formData);
  if (!ctx) return { ok: false, reason: NO_SYSTEM_TEXT };
  const keyOnly = gate(auth, null);
  if (keyOnly) return { ok: false, reason: keyOnly };
  const row = await settingsRowUnit(ctx, entity, id);
  if (!row) return { ok: false, reason: SETTINGS_TEXT.notFound };
  const g = gate(auth, row.unitId); // สาขาของแถวจาก DB
  return g ? { ok: false, reason: g } : { ctx };
}
/** แถวใหม่: ระบบ + ด่านกับสาขาที่เลือก */
async function newGate(auth: Auth, formData: FormData): Promise<{ ctx: Ctx } | { ok: false; reason: string }> {
  const ctx = await ctxOf(auth, formData);
  if (!ctx) return { ok: false, reason: NO_SYSTEM_TEXT };
  const g = gate(auth, unitOfForm(formData)); // สาขาปลายทางจากฟอร์ม — service ตรวจกับ BusinessUnit + ขอบเขตอีกชั้น
  return g ? { ok: false, reason: g } : { ctx };
}

// ═══ กะ ═══
export async function createShiftAction(formData: FormData): Promise<SettingsResult> {
  const auth = await requireTenant();
  const g = await newGate(auth, formData);
  if (!("ctx" in g)) return g;
  return done(g.ctx, await createShift(g.ctx, hrViewerOf(auth), shiftOfForm(formData, true)));
}
export async function updateShiftAction(formData: FormData): Promise<SettingsResult> {
  const auth = await requireTenant();
  const id = idOfForm(formData, "shiftId");
  const g = await rowGate(auth, formData, "shift", id);
  if (!("ctx" in g)) return g;
  const patch = shiftOfForm(formData, formData.has("unitId"));
  if (patch.unitId !== undefined) {
    const t = gate(auth, patch.unitId); // ย้ายสาขา: ปลายทางต้องอยู่ในขอบเขตด้วย
    if (t) return { ok: false, reason: t };
  }
  return done(g.ctx, await updateShift(g.ctx, hrViewerOf(auth), id, patch));
}
export async function archiveShiftAction(formData: FormData): Promise<SettingsResult> {
  const auth = await requireTenant();
  const id = idOfForm(formData, "shiftId");
  const g = await rowGate(auth, formData, "shift", id);
  if (!("ctx" in g)) return g;
  return done(g.ctx, await archiveShift(g.ctx, hrViewerOf(auth), id));
}

// ═══ ประเภทการลา ═══
export async function createLeavePolicyAction(formData: FormData): Promise<SettingsResult> {
  const auth = await requireTenant();
  const g = await newGate(auth, formData);
  if (!("ctx" in g)) return g;
  return done(g.ctx, await createLeavePolicy(g.ctx, hrViewerOf(auth), policyOfForm(formData, true)));
}
export async function updateLeavePolicyAction(formData: FormData): Promise<SettingsResult> {
  const auth = await requireTenant();
  const id = idOfForm(formData, "policyId");
  const g = await rowGate(auth, formData, "leave-policy", id);
  if (!("ctx" in g)) return g;
  const patch = policyOfForm(formData, formData.has("unitId"));
  if (patch.unitId !== undefined) {
    const t = gate(auth, patch.unitId);
    if (t) return { ok: false, reason: t };
  }
  return done(g.ctx, await updateLeavePolicy(g.ctx, hrViewerOf(auth), id, patch));
}
export async function archiveLeavePolicyAction(formData: FormData): Promise<SettingsResult> {
  const auth = await requireTenant();
  const id = idOfForm(formData, "policyId");
  const g = await rowGate(auth, formData, "leave-policy", id);
  if (!("ctx" in g)) return g;
  return done(g.ctx, await archiveLeavePolicy(g.ctx, hrViewerOf(auth), id));
}

// ═══ วันหยุด ═══
/** ไม่มี id = เพิ่ม · มี id = แก้ (สาขาของแถวเดิมจาก DB) */
export async function upsertHolidayAction(formData: FormData): Promise<SettingsResult> {
  const auth = await requireTenant();
  const id = idOfForm(formData, "holidayId");
  if (!id) {
    const g = await newGate(auth, formData);
    if (!("ctx" in g)) return g;
    return done(g.ctx, await upsertHoliday(g.ctx, hrViewerOf(auth), holidayOfForm(formData, true)));
  }
  const g = await rowGate(auth, formData, "holiday", id);
  if (!("ctx" in g)) return g;
  const input = { ...holidayOfForm(formData, formData.has("unitId")), id };
  if (input.unitId !== undefined) {
    const t = gate(auth, input.unitId ?? null);
    if (t) return { ok: false, reason: t };
  }
  return done(g.ctx, await upsertHoliday(g.ctx, hrViewerOf(auth), input));
}
export async function deleteHolidayAction(formData: FormData): Promise<SettingsResult> {
  const auth = await requireTenant();
  const id = idOfForm(formData, "holidayId");
  const g = await rowGate(auth, formData, "holiday", id);
  if (!("ctx" in g)) return g;
  return done(g.ctx, await deleteHoliday(g.ctx, hrViewerOf(auth), id));
}
