// HR H2.4 ▸ ค่าตั้งการลงเวลา: จุดลงเวลาด้วยมือถือต่อสาขา (HrClockSite — R10) + นโยบายรอบลงเวลาของระบบ HR (มติผู้คุม Q1)
//
// กติกา:
//   • ใครแก้/ดูได้ = OWNER หรือผู้มีคีย์ hr.employee.create ตรง ๆ (ผู้จัดตารางกะ) — บทบาท MANAGER อย่างเดียวไม่พอ (R12: ตำแหน่งร้าน/ผลรัศมี
//     ไม่ให้ผู้จัดการที่ไม่มีคีย์) · สาขา (H1.1/H1.2): แถวของสาขา = สาขานั้นต้องอยู่ในขอบเขต · แถวทั้งร้าน = ผู้ดูแลทุกสาขาเท่านั้น
//   • เปิดลงเวลาด้วยมือถือครั้งแรกของจุดใด ต้องยืนยันว่าแจ้งพนักงานเรื่องการเก็บตำแหน่งแล้ว (acceptPdpaNotice — PDPA) ⇒
//     noticeAcceptedAt/ById + audit hr.clock.notice_accepted 1 แถว
//   • ช่วงค่า: รัศมี 30–2,000 ม. · ความแม่นยำขั้นต่ำ 10–500 ม. · ถ่ายรูปยังไม่เปิด (Q4) · เปิดพร้อมบังคับ GPS ต้องมีตำแหน่งร้าน
//   • 1 แถวต่อ (ระบบ, สาขา) — ล็อก hr:clocksite:<ระบบ>:<สาขา|all> ใน tx + unique บางส่วนใน DB เป็นด่านสุดท้าย
//   • นโยบายรอบ (earlyInMin · closeGraceMin) เก็บที่ AppSystem.settings.hrClock (แบบค่าตั้งของระบบอื่นในร้าน) · ค่าตั้งต้น 120/240
//   • ผลลัพธ์ = { ok, … } | { ok:false, reason ไทยคงที่ } · audit = id/ตัวเลขล้วน (ไม่มีพิกัด) ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { evaluate } from "@/lib/core/rbac"; // VIS-1 C ◂
import { HR_UNIT_NOT_FOUND_TEXT, hrScopeOf, type HrScope } from "./scope";
import { SETTINGS_TEXT, type SettingsViewer } from "./settings";
import { CLOCK_POLICY_RANGE, clockPolicyOf, type ClockPolicy } from "./clock-rules";
import { ATTENDANCE_POLICY_RANGE, attendancePolicyOf, type AttendancePolicy } from "./judge-rules"; // HR H2.5 ▸ R12 ◂

type Ctx = { tenantId: string; systemId: string };
type Tx = Prisma.TransactionClient;
export type ClockSiteViewer = SettingsViewer;

export const CLOCK_SETTINGS_TEXT = {
  sNotice: "เปิดลงเวลาด้วยมือถือครั้งแรก ต้องยืนยันว่าได้แจ้งพนักงานเรื่องการเก็บตำแหน่งแล้ว (PDPA)",
  sCenter: "ตั้งตำแหน่งร้าน (ละติจูด/ลองจิจูด) ก่อนเปิดลงเวลาด้วยมือถือ",
  sRadius: "รัศมีต้องอยู่ระหว่าง 30 ถึง 2,000 เมตร",
  sAcc: "ความแม่นยำขั้นต่ำต้องอยู่ระหว่าง 10 ถึง 500 เมตร",
  sPhoto: "การถ่ายรูปตอนลงเวลายังไม่เปิดให้ใช้",
  sEarly: "เวลาที่เข้างานก่อนเริ่มกะได้ต้องอยู่ระหว่าง 0 ถึง 240 นาที",
  sGrace: "เวลาปิดรอบหลังเลิกกะต้องอยู่ระหว่าง 30 ถึง 720 นาที",
} as const;

const RADIUS = { min: 30, max: 2000 };
const ACCURACY = { min: 10, max: 500 };

class ClockSettingsRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClockSettingsRefusal";
  }
}
const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
function reasonOf(e: unknown): string {
  if (e instanceof ClockSettingsRefusal) return e.message;
  return SETTINGS_TEXT.failed;
}
const isUnique = (e: unknown): boolean => {
  const x = e as { code?: unknown; cause?: { code?: unknown; originalCode?: unknown } } | null;
  return !!x && (x.code === "P2002" || x.code === "23505" || x.cause?.code === "23505" || x.cause?.originalCode === "23505");
};

/** ดู/แก้ค่าตั้งการลงเวลาได้ไหม — OWNER หรือคีย์ hr.employee.create (หรือ hr.*) ตรง ๆ */
export function canManageClockSettings(v: ClockSiteViewer | null | undefined): boolean {
  if (!v) return false;
  if (v.role === "OWNER") return true;
  const p = (v.permissions ?? {}) as Record<string, unknown>;
  return p["hr.employee.create"] === true || p["hr.*"] === true;
}
const scopeOfViewer = (v: ClockSiteViewer): HrScope => hrScopeOf({ role: v.role, unitAccess: v.unitAccess });

/** VIS-1 C ▸ ข้อความเมื่อบัญชีที่ไม่ใช่ผู้ใช้จอลงเวลากดลงเวลา (คงที่ · ไม่บอกชื่อ/รหัสใคร) ◂ */
export const KIOSK_REFUSED_TEXT = "บัญชีนี้ใช้จอลงเวลาหน้าร้านไม่ได้ — ให้เจ้าของร้านหรือผู้จัดการเปิดจอให้";
/**
 * VIS-1 C (มติผู้คุม 12 พ.ย.) ▸ ใครเปิดจอลงเวลาหน้าร้าน (รายชื่อ + ตำแหน่ง + แป้น PIN) และกดลงเวลาที่จอได้ — ด่านเดียวของหน้า /hr/kiosk และ kioskClockAction:
 *   OWNER · MANAGER (ในสาขาที่คุม — รายชื่อตาม hrScopeOf) · บัญชีจอ/ผู้ถือคีย์ hr.attendance.clock (หรือ hr.*) · คนอื่น (สมาชิกไม่มีคีย์ HR ·
 *   ผู้ดูเงินเดือน/การลาอย่างเดียว) = ไม่ได้ (หน้า = 404 เหมือนหน้าลงเวลา) — ตรงกับด่านคีย์ของ action เดิม (assertCan hr.attendance.clock) ◂
 */
export function canRunKiosk(v: Pick<ClockSiteViewer, "role" | "permissions" | "unitAccess"> | null | undefined): boolean {
  if (!v) return false;
  return evaluate({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown> }, { module: "hr", action: "hr.attendance.clock" });
}
function scopeRefusal(scope: HrScope, unitId: string | null): string | null {
  if (scope.unitIds === "*") return null;
  if (unitId === null) return SETTINGS_TEXT.shopWide;
  return scope.unitIds.includes(unitId) ? null : SETTINGS_TEXT.otherUnit;
}
const cleanUnit = (u: unknown): string | null => (typeof u === "string" && u.trim() ? u.trim() : null);

// ═══════════════════════════ จุดลงเวลา (HrClockSite) ═══════════════════════════
const SITE_SELECT = {
  id: true,
  unitId: true,
  mobileEnabled: true,
  gpsRequired: true,
  centerLat: true,
  centerLng: true,
  radiusM: true,
  minAccuracyM: true,
  photoRequired: true,
  noticeAcceptedAt: true,
} as const satisfies Prisma.HrClockSiteSelect;
type SiteRow = Prisma.HrClockSiteGetPayload<{ select: typeof SITE_SELECT }>;
export type ClockSiteItem = {
  id: string;
  unitId: string | null;
  mobileEnabled: boolean;
  gpsRequired: boolean;
  centerLat: number | null;
  centerLng: number | null;
  radiusM: number;
  minAccuracyM: number;
  photoRequired: boolean;
  noticeAcceptedAt: Date | null;
};
const itemOf = (r: SiteRow): ClockSiteItem => ({
  id: r.id,
  unitId: r.unitId,
  mobileEnabled: r.mobileEnabled,
  gpsRequired: r.gpsRequired,
  centerLat: r.centerLat === null ? null : Number(r.centerLat),
  centerLng: r.centerLng === null ? null : Number(r.centerLng),
  radiusM: r.radiusM,
  minAccuracyM: r.minAccuracyM,
  photoRequired: r.photoRequired,
  noticeAcceptedAt: r.noticeAcceptedAt,
});

/** จุดลงเวลาที่ผู้ดูเห็น: ทั้งร้าน + สาขาในขอบเขต (ผู้ดูทุกสาขา = ทุกแถว) */
export async function listClockSites(ctx: Ctx, viewer: ClockSiteViewer): Promise<{ ok: true; items: ClockSiteItem[] } | { ok: false; reason: string }> {
  if (!canManageClockSettings(viewer)) return refuse(SETTINGS_TEXT.noPermission);
  const scope = scopeOfViewer(viewer);
  const where: Prisma.HrClockSiteWhereInput = scope.unitIds === "*" ? {} : { OR: [{ unitId: null }, { unitId: { in: [...scope.unitIds] } }] };
  const rows = await tenantDb(ctx).hrClockSite.findMany({ where, select: SITE_SELECT, orderBy: [{ unitId: "asc" }, { id: "asc" }], take: 500 });
  return { ok: true, items: rows.map(itemOf) };
}

export type ClockSiteInput = {
  unitId?: string | null;
  mobileEnabled?: boolean;
  gpsRequired?: boolean;
  centerLat?: number | string | null;
  centerLng?: number | string | null;
  radiusM?: number | string;
  minAccuracyM?: number | string;
  photoRequired?: boolean;
  acceptPdpaNotice?: boolean;
};
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k) && (o as Record<string, unknown>)[k] !== undefined;
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
function intIn(v: unknown, r: { min: number; max: number }, text: string): number {
  const n = num(v);
  if (n === null || !Number.isInteger(n) || n < r.min || n > r.max) throw new ClockSettingsRefusal(text);
  return n;
}
/** ตำแหน่งร้าน: null/"" = ล้าง · อื่น ๆ ต้องเป็นตัวเลขในช่วงพิกัดโลก (ไม่ใช่ ⇒ sCenter) · ทศนิยม 6 ตำแหน่ง */
function coord(v: unknown, limit: number): number | null {
  if (v === null || v === "") return null;
  const n = num(v);
  if (n === null || Math.abs(n) > limit) throw new ClockSettingsRefusal(CLOCK_SETTINGS_TEXT.sCenter);
  return Math.round(n * 1e6) / 1e6;
}

/**
 * บันทึกจุดลงเวลาของสาขา (หรือทั้งร้านเมื่อ unitId ว่าง) — ช่องที่ไม่ส่ง = คงค่าเดิม (แถวใหม่ = ค่าตั้งต้น) ·
 * เปิดครั้งแรกต้องส่ง acceptPdpaNotice: true
 */
export async function saveClockSite(ctx: Ctx, viewer: ClockSiteViewer, input: ClockSiteInput): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!canManageClockSettings(viewer)) return refuse(SETTINGS_TEXT.noPermission);
  const i = (input ?? {}) as ClockSiteInput;
  const unitId = cleanUnit(i.unitId);
  const sr = scopeRefusal(scopeOfViewer(viewer), unitId);
  if (sr) return refuse(sr);
  try {
    // ตรวจรูปแบบก่อนแตะ DB (ข้อความคงที่)
    if (i.photoRequired === true) throw new ClockSettingsRefusal(CLOCK_SETTINGS_TEXT.sPhoto);
    const radiusM = has(i, "radiusM") ? intIn(i.radiusM, RADIUS, CLOCK_SETTINGS_TEXT.sRadius) : undefined;
    const minAccuracyM = has(i, "minAccuracyM") ? intIn(i.minAccuracyM, ACCURACY, CLOCK_SETTINGS_TEXT.sAcc) : undefined;
    const centerLat = has(i, "centerLat") ? coord(i.centerLat, 90) : undefined;
    const centerLng = has(i, "centerLng") ? coord(i.centerLng, 180) : undefined;
    if (unitId) {
      const u = await tenantDb({ tenantId: ctx.tenantId }).businessUnit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId }, select: { id: true } });
      if (!u) return refuse(HR_UNIT_NOT_FOUND_TEXT);
    }
    const out = await tenantDb(ctx).$transaction(
      async (t) => {
        const tx = t as unknown as Tx;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:clocksite:${ctx.systemId}:${unitId ?? "all"}`}, 0))`;
        const cur = await tx.hrClockSite.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId }, select: { ...SITE_SELECT, noticeAcceptedById: true } });
        const next = {
          mobileEnabled: has(i, "mobileEnabled") ? i.mobileEnabled === true : (cur?.mobileEnabled ?? false),
          gpsRequired: has(i, "gpsRequired") ? i.gpsRequired !== false : (cur?.gpsRequired ?? true),
          centerLat: centerLat !== undefined ? centerLat : cur?.centerLat === null || cur?.centerLat === undefined ? null : Number(cur.centerLat),
          centerLng: centerLng !== undefined ? centerLng : cur?.centerLng === null || cur?.centerLng === undefined ? null : Number(cur.centerLng),
          radiusM: radiusM ?? cur?.radiusM ?? 150,
          minAccuracyM: minAccuracyM ?? cur?.minAccuracyM ?? 100,
          photoRequired: false,
        };
        if (next.mobileEnabled && next.gpsRequired && (next.centerLat === null || next.centerLng === null)) throw new ClockSettingsRefusal(CLOCK_SETTINGS_TEXT.sCenter);
        const accepting = next.mobileEnabled && !cur?.noticeAcceptedAt;
        if (accepting && i.acceptPdpaNotice !== true) throw new ClockSettingsRefusal(CLOCK_SETTINGS_TEXT.sNotice);
        const notice = accepting ? { noticeAcceptedAt: new Date(), noticeAcceptedById: viewer.userId ?? null } : {};
        if (cur) {
          const r = await tx.hrClockSite.updateMany({ where: { id: cur.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { ...next, ...notice } });
          if (r.count !== 1) throw new ClockSettingsRefusal(SETTINGS_TEXT.notFound);
          return { id: cur.id, created: false, accepted: accepting };
        }
        const row = await tx.hrClockSite.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, ...next, ...notice }, select: { id: true } });
        return { id: row.id, created: true, accepted: accepting };
      },
      { maxWait: 15_000, timeout: 20_000 },
    );
    const actor = { tenantId: ctx.tenantId, actorType: viewer.userId ? ("USER" as const) : ("SYSTEM" as const), actorId: viewer.userId ?? null };
    await writeAudit({ ...actor, action: `hr.settings.clock-site.${out.created ? "create" : "update"}`, targetType: "HrClockSite", targetId: out.id, after: { id: out.id, systemId: ctx.systemId, unitId } });
    if (out.accepted) await writeAudit({ ...actor, action: "hr.clock.notice_accepted", targetType: "HrClockSite", targetId: out.id, after: { id: out.id, systemId: ctx.systemId, unitId } });
    return { ok: true, id: out.id };
  } catch (e) {
    if (isUnique(e)) {
      // แข่งกันสร้างแถวแรก — อีกคำขอสร้างไปแล้ว ⇒ ผลเดียวกับการบันทึกซ้ำ (ไม่เพิ่มแถว)
      const row = await tenantDb(ctx).hrClockSite.findFirst({ where: { unitId }, select: { id: true } });
      if (row) return { ok: true, id: row.id };
    }
    return refuse(reasonOf(e));
  }
}

// ═══════════════════════════ นโยบายรอบลงเวลา (Q1) ═══════════════════════════
const policyOfSettings = (settings: unknown): ClockPolicy => clockPolicyOf(settings && typeof settings === "object" ? (settings as Record<string, unknown>).hrClock : null);

/** นโยบายรอบที่ใช้อยู่ (ค่าตั้งต้น 120/240 เมื่อยังไม่ตั้ง) */
export async function getClockPolicy(ctx: Ctx): Promise<ClockPolicy> {
  const s = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findFirst({ where: { id: ctx.systemId, type: "HR" }, select: { settings: true } });
  return policyOfSettings(s?.settings);
}

/** ตั้งนโยบายรอบของระบบ HR (ค่าทั้งร้าน ⇒ ผู้ดูแลทุกสาขาเท่านั้น) — ช่องที่ไม่ส่ง = คงค่าเดิม */
export async function saveClockPolicy(
  ctx: Ctx,
  viewer: ClockSiteViewer,
  input: { earlyInMin?: number | string; closeGraceMin?: number | string },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!canManageClockSettings(viewer)) return refuse(SETTINGS_TEXT.noPermission);
  const sr = scopeRefusal(scopeOfViewer(viewer), null);
  if (sr) return refuse(sr);
  try {
    const i = input ?? {};
    const early = has(i, "earlyInMin") ? intIn(i.earlyInMin, CLOCK_POLICY_RANGE.earlyInMin, CLOCK_SETTINGS_TEXT.sEarly) : undefined;
    const grace = has(i, "closeGraceMin") ? intIn(i.closeGraceMin, CLOCK_POLICY_RANGE.closeGraceMin, CLOCK_SETTINGS_TEXT.sGrace) : undefined;
    const out = await tenantDb({ tenantId: ctx.tenantId }).$transaction(
      async (t) => {
        const tx = t as unknown as Tx;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:clockpolicy:${ctx.systemId}`}, 0))`;
        const sys = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true, settings: true } });
        if (!sys) throw new ClockSettingsRefusal(SETTINGS_TEXT.notFound);
        const base = sys.settings && typeof sys.settings === "object" && !Array.isArray(sys.settings) ? (sys.settings as Record<string, unknown>) : {};
        const cur = policyOfSettings(base);
        const next: ClockPolicy = { earlyInMin: early ?? cur.earlyInMin, closeGraceMin: grace ?? cur.closeGraceMin };
        const r = await tx.appSystem.updateMany({ where: { id: sys.id, tenantId: ctx.tenantId }, data: { settings: { ...base, hrClock: next } as Prisma.InputJsonValue } });
        if (r.count !== 1) throw new ClockSettingsRefusal(SETTINGS_TEXT.notFound);
        return next;
      },
      { maxWait: 15_000, timeout: 20_000 },
    );
    await writeAudit({
      tenantId: ctx.tenantId,
      actorType: viewer.userId ? "USER" : "SYSTEM",
      actorId: viewer.userId ?? null,
      action: "hr.settings.clock-policy.update",
      targetType: "AppSystem",
      targetId: ctx.systemId,
      after: { systemId: ctx.systemId, ...out },
    });
    return { ok: true, id: ctx.systemId };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

// ═══════════════════════════ HR H2.5 ▸ R12 นโยบายตัดสินผล/การเตือน (AppSystem.settings.hrAttendance) ═══════════════════════════
//   ด่าน · กติกาทั้งร้าน · ล็อก · spread ค่าตั้งเดิม = แบบเดียวกับ saveClockPolicy (hrClock ↔ hrAttendance ไม่ทับกัน — ใช้ล็อกเดียวกัน) ◂
export const ATTENDANCE_SETTINGS_TEXT = {
  sAlert: "เวลาเตือนต้องอยู่ระหว่าง 0 ถึง 240 นาทีหลังเริ่มกะ",
  sAbsent: "เวลาที่นับว่าไม่มาต้องอยู่ระหว่าง 30 ถึง 720 นาทีหลังเริ่มกะ",
  sEarly: "เวลาผ่อนผันออกก่อนต้องอยู่ระหว่าง 0 ถึง 60 นาที",
  sOtStep: "หน่วยปัด OT ต้องเป็น 1, 5, 10, 15 หรือ 30 นาที",
} as const;
export type AttendancePolicyInput = {
  notInAlertMin?: number | string;
  absentAfterMin?: number | string | null;
  earlyOutGraceMin?: number | string;
  otStepMin?: number | string;
  flagEarlyOut?: boolean;
  alertsOn?: boolean;
  alertEmployee?: boolean;
};
const attendanceOfSettings = (settings: unknown): AttendancePolicy => attendancePolicyOf(settings && typeof settings === "object" ? (settings as Record<string, unknown>).hrAttendance : null);

/** นโยบายตัดสินผล/การเตือนที่ใช้อยู่ (ค่าตั้งต้นเมื่อยังไม่ตั้ง) */
export async function getAttendancePolicy(ctx: Ctx): Promise<AttendancePolicy> {
  const s = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findFirst({ where: { id: ctx.systemId, type: "HR" }, select: { settings: true } });
  return attendanceOfSettings(s?.settings);
}

/** ตั้งนโยบายตัดสินผล/การเตือนของระบบ HR (ค่าทั้งร้าน ⇒ ผู้ดูแลทุกสาขาเท่านั้น) — ช่องที่ไม่ส่ง = คงค่าเดิม · absentAfterMin null/"" = ถึงเวลาเลิกกะ */
export async function saveAttendancePolicy(ctx: Ctx, viewer: ClockSiteViewer, input: AttendancePolicyInput): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!canManageClockSettings(viewer)) return refuse(SETTINGS_TEXT.noPermission);
  const sr = scopeRefusal(scopeOfViewer(viewer), null);
  if (sr) return refuse(sr);
  try {
    const i = (input ?? {}) as AttendancePolicyInput;
    const R = ATTENDANCE_POLICY_RANGE;
    const T = ATTENDANCE_SETTINGS_TEXT;
    const notIn = has(i, "notInAlertMin") ? intIn(i.notInAlertMin, R.notInAlertMin, T.sAlert) : undefined;
    const absent = !Object.prototype.hasOwnProperty.call(i, "absentAfterMin") || i.absentAfterMin === undefined ? undefined : i.absentAfterMin === null || i.absentAfterMin === "" ? null : intIn(i.absentAfterMin, R.absentAfterMin, T.sAbsent);
    const early = has(i, "earlyOutGraceMin") ? intIn(i.earlyOutGraceMin, R.earlyOutGraceMin, T.sEarly) : undefined;
    let step: number | undefined;
    if (has(i, "otStepMin")) {
      const n = num(i.otStepMin);
      if (n === null || !R.otStepMin.includes(n)) throw new ClockSettingsRefusal(T.sOtStep);
      step = n;
    }
    const bool = (k: "flagEarlyOut" | "alertsOn" | "alertEmployee") => (typeof i[k] === "boolean" ? i[k] : undefined);
    const out = await tenantDb({ tenantId: ctx.tenantId }).$transaction(
      async (t) => {
        const tx = t as unknown as Tx;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:clockpolicy:${ctx.systemId}`}, 0))`;
        const sys = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true, settings: true } });
        if (!sys) throw new ClockSettingsRefusal(SETTINGS_TEXT.notFound);
        const base = sys.settings && typeof sys.settings === "object" && !Array.isArray(sys.settings) ? (sys.settings as Record<string, unknown>) : {};
        const cur = attendanceOfSettings(base);
        const next: AttendancePolicy = {
          notInAlertMin: notIn ?? cur.notInAlertMin,
          absentAfterMin: absent === undefined ? cur.absentAfterMin : absent,
          earlyOutGraceMin: early ?? cur.earlyOutGraceMin,
          flagEarlyOut: bool("flagEarlyOut") ?? cur.flagEarlyOut,
          otStepMin: step ?? cur.otStepMin,
          alertsOn: bool("alertsOn") ?? cur.alertsOn,
          alertEmployee: bool("alertEmployee") ?? cur.alertEmployee,
        };
        const r = await tx.appSystem.updateMany({ where: { id: sys.id, tenantId: ctx.tenantId }, data: { settings: { ...base, hrAttendance: next } as Prisma.InputJsonValue } });
        if (r.count !== 1) throw new ClockSettingsRefusal(SETTINGS_TEXT.notFound);
        return next;
      },
      { maxWait: 15_000, timeout: 20_000 },
    );
    await writeAudit({
      tenantId: ctx.tenantId,
      actorType: viewer.userId ? "USER" : "SYSTEM",
      actorId: viewer.userId ?? null,
      action: "hr.settings.attendance-policy.update",
      targetType: "AppSystem",
      targetId: ctx.systemId,
      after: { systemId: ctx.systemId, ...out },
    });
    return { ok: true, id: ctx.systemId };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}
// ◂ HR H2.5
