// HR H4.2 ▸ ค่าแรงต่อยอดขาย (labor %) + ความต้องการคน — service (server เท่านั้น) · brief hr-brief-H4.2 §3–§6 · สัญญา scripts/qc-hr-h4.2.mts (โน้ต wo-notes/hr-H4.2-oracle.md §1 §4)
//   🔒 ด่านเดียว gateOf: ระบบ HR ของร้าน + สมาชิกภาพจริงในฐาน (บทบาทต้องตรง) — สิทธิ์/สาขาใช้ค่าจากฐานเสมอ (ไม่เชื่อ viewer ที่ส่งมา)
//      เงิน (฿ · % · เดือน) = OWNER หรือ hr.payroll.read (P1) · หัวคน (จัด/ต้องการ) = canReadRoster (P3) · อื่น ๆ = NO ข้อความเดียวกันทุกไบต์ (P5)
//      ผู้ดูเงินเดือนที่จำกัดสาขา: ช่องเงินที่มีคนยืมตัวเข้ามา (สาขาประจำนอกขอบเขต) และผู้ร่วม < 3 คน ⇒ null + suppressed (P2 · Q9) — ไม่มีค่าใบ้ใด ๆ
//   ยอดขาย = ตัวเลขสุทธิตามรายงาน POS (รวม VAT · มติ Q2) ผ่าน salesFacts.salesByHour ด้วยสิทธิ์ pos.report.view ของผู้ดูเอง (P3) · import POS แบบ lazy ที่ไฟล์นี้เท่านั้น
//   ประมาณค่าแรง = ค่าจ้างธรรมดา + ค่าทำงานวันหยุด + ปสส. ส่วนนายจ้าง (D4–D6) · ไม่รวม OT/ค่าคอมฯ/โบนัส/ค่าเผื่อ/ลาไม่รับค่าจ้าง/รายการหัก
//   เดือน: มีรอบเงินเดือนที่ปิดงานแล้ว (APPROVED/PAID · รุ่น 2 = finalized) ⇒ gross + ปสส. นายจ้างของรายการ แบ่งตามนาทีทำงานต่อสาขา (D9) · ไม่มี ⇒ ผลรวมรายวัน
//   ไม่มีเงินรายคน (ไม่มี employeeId/ชื่อข้างตัวเลข) · อ่านไม่ลงประวัติ · ค่าตั้ง hrLabor ผ่าน lockHrSettings + writeHrSettingsKeys เท่านั้น (HR-SET-1)
//   ฐานข้อมูล = tenantDb เท่านั้น (โหลดแบบ lazy — ไฟล์นี้ไม่มี import หัวไฟล์ของ core/db · ข้อสอบ S1.5) ◂
import type { MembershipCtx } from "@/lib/core/rbac";
import { canViewPayroll } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { hrScopeOf, type HrScope } from "./scope";
import { canReadRoster } from "./roster-board";
import { canManageHrSettings } from "./settings";
import { unitOfDay } from "./roster";
import { normalMinutesOf } from "./work-entries";
import { loadLawView, pickLawRow } from "./law";
import { otLawOf } from "./ot-rules";
import { lockHrSettings, writeHrSettingsKeys } from "./settings-lock";
import {
  addDays,
  businessDateAt,
  dayWage,
  daysInMonth,
  forecastDates,
  forecastHour,
  holidayPremium,
  hourKeyAt,
  hourSlots,
  isDayKey,
  laborSettingsInput,
  laborSettingsOf,
  laborTextFor,
  largestRemainder,
  mondayOf,
  monthDays,
  needed as neededOf,
  pctTenths,
  prevPeriod,
  scheduledAt,
  ssoEstimate,
  type LaborSettings,
} from "./labor-rules";

type Ctx = { tenantId: string; systemId: string };
export type LaborViewer = { role: string; unitAccess: unknown; permissions: unknown; userId?: string | null };
export type LaborOpts = { now?: Date; locale?: string | null; /** หน้า 03 (ตารางกะ) นับร่างด้วย — Q13 */ drafts?: boolean };
export type LaborNo = { ok: false; code: "NO"; reason: string };
export type LaborFail = { ok: false; code: "UNIT_REQUIRED" | "BAD" | "FAILED"; reason: string };
export type LaborSales = "OK" | "NO_POS" | "NO_PERMISSION";
export type LaborHour = { hour: number; label: string; costSatang: number | null; salesSatang: number | null; forecastSatang: number | null };
export type LaborShift = { shiftId: string; label: string; costSatang: number | null; salesSatang: number | null; pctTenths: number | null };
export type LaborMoney = {
  costSatang: number | null;
  wageSatang: number | null;
  ssoSatang: number | null;
  salesSatang: number | null;
  soFarSatang: number | null;
  pctTenths: number | null;
  targetTenths: number;
  hours: LaborHour[];
  shifts: LaborShift[];
  unallocatedSatang: number | null;
  suppressed: number;
};
export type LaborDemand = { hours: { hour: number; label: string; scheduled: number; needed: number | null }[]; peak: number | null };
export type LaborFlags = { noProfile: number; lawMissing: boolean; smallGroup: boolean };
export type LaborDayDto = { ok: true; day: string; unitId: string | null; basis: "ESTIMATE"; sales: LaborSales; money: LaborMoney | null; demand: LaborDemand | null; flags: LaborFlags };
export type LaborWeekDto = {
  ok: true;
  week: string;
  unitId: string | null;
  basis: "ESTIMATE";
  sales: LaborSales;
  days: { day: string; scheduledAtPeak: number | null; neededAtPeak: number | null; peak: number | null }[];
  footer: { paidMinutes: number; costSatang?: number | null; forecastSalesSatang?: number | null; pctTenths?: number | null; targetTenths?: number; suppressed?: number };
  flags: LaborFlags;
};
export type LaborMonthPart = { periodKey: string; basis: "ACTUAL" | "ESTIMATE"; costSatang: number | null; salesSatang: number | null; pctTenths: number | null; suppressed: number };
export type LaborMonthDto = LaborMonthPart & { ok: true; unitId: string | null; sales: LaborSales; targetTenths: number; prev: LaborMonthPart; flags: LaborFlags };
export type LaborSettingsDto = { ok: true; settings: LaborSettings; canEdit: boolean };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ROLES = new Set(["OWNER", "MANAGER", "STAFF"]);
/** R5 ไม่ระบุสาขา = ทุกสาขาในขอบเขต · เกินนี้ต้องเลือกสาขา */
export const LABOR_MAX_UNITS = 20;
const TX_OPTS = { maxWait: 15_000, timeout: 20_000 } as const;
const SMALL_GROUP = 3;
const textOf = (o?: { locale?: string | null }) => laborTextFor(o?.locale);
const NO = (o?: { locale?: string | null }): LaborNo => ({ ok: false, code: "NO", reason: textOf(o).no });
const fail = (code: LaborFail["code"], reason: string): LaborFail => ({ ok: false, code, reason });
const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const dayOf = (d: Date | null | undefined) => (d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null);
const d0 = (day: string) => new Date(`${day}T00:00:00.000Z`);
const label = (h: number) => String(((h % 24) + 24) % 24).padStart(2, "0");
const nowOf = (o?: LaborOpts) => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? o.now : new Date());
/** ฐานข้อมูลของร้าน — tenantDb (เติม tenantId/systemId เอง) · lazy import */
const dbOf = async (c: { tenantId: string; systemId?: string }) => (await import("@/lib/core/db")).tenantDb(c);

// ═════════════ ด่าน (จุดเดียว) ═════════════
type Gate = { settings: Record<string, unknown>; m: MembershipCtx; userId: string; scope: HrScope; money: boolean; roster: boolean; manage: boolean; limited: boolean };
async function gateOf(ctx: Ctx, viewer: LaborViewer | null | undefined): Promise<Gate | null> {
  if (!viewer || typeof viewer.role !== "string" || !ROLES.has(viewer.role) || typeof viewer.userId !== "string" || !ID_RE.test(viewer.userId)) return null;
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string" || !ID_RE.test(ctx.tenantId) || !ID_RE.test(ctx.systemId)) return null;
  const db = await dbOf({ tenantId: ctx.tenantId });
  const [sys, mem] = await Promise.all([
    db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { settings: true } }),
    db.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: viewer.userId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } }),
  ]);
  if (!sys || !mem || String(mem.role) !== viewer.role) return null;
  const m = { role: String(mem.role), unitAccess: (Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((u): u is string => typeof u === "string") : []) as string[], permissions: obj(mem.permissions) } as MembershipCtx;
  const scope = hrScopeOf(m);
  const money = canViewPayroll(m);
  const manage = canManageHrSettings(m);
  const roster = canReadRoster(m);
  return { settings: obj(sys.settings), m, userId: viewer.userId, scope, money, roster, manage, limited: m.role !== "OWNER" && scope.unitIds !== "*" };
}
const viewerOk = (g: Gate) => g.money || g.roster;

/** สาขาที่ดู: ระบุ = ต้องเป็นสาขาของร้านในขอบเขต (อื่น = NO) · ไม่ระบุ = ทุกสาขาในขอบเขต (> 20 = UNIT_REQUIRED) */
type View = { unitIds: string[]; unassigned: boolean; unitId: string | null };
async function viewOf(ctx: Ctx, g: Gate, unitRaw: unknown, o?: LaborOpts): Promise<View | LaborNo | LaborFail> {
  const db = await dbOf({ tenantId: ctx.tenantId });
  const all = g.scope.unitIds === "*";
  if (unitRaw !== undefined && unitRaw !== null && unitRaw !== "") {
    if (typeof unitRaw !== "string" || !ID_RE.test(unitRaw)) return NO(o);
    if (!all && !(g.scope.unitIds as string[]).includes(unitRaw)) return NO(o);
    const u = await db.businessUnit.findFirst({ where: { id: unitRaw, tenantId: ctx.tenantId }, select: { id: true } });
    if (!u) return NO(o);
    return { unitIds: [u.id], unassigned: false, unitId: u.id };
  }
  const units = await db.businessUnit.findMany({ where: all ? { tenantId: ctx.tenantId } : { tenantId: ctx.tenantId, id: { in: g.scope.unitIds as string[] } }, select: { id: true }, orderBy: { id: "asc" }, take: LABOR_MAX_UNITS + 1 });
  if (units.length > LABOR_MAX_UNITS) return fail("UNIT_REQUIRED", textOf(o).unitRequired);
  return { unitIds: units.map((u) => u.id), unassigned: all, unitId: null };
}
const isNo = (x: unknown): x is LaborNo | LaborFail => !!x && typeof x === "object" && (x as { ok?: unknown }).ok === false;

// ═════════════ ยอดขายจาก POS (facade · lazy) ═════════════
type UnitSales = { state: LaborSales; cutoff: number; today: string; act: Map<string, Map<number, number>> };
const MAX_SPAN = 45;
function chunksOf(dates: Set<string>): { from: string; to: string }[] {
  const ds = [...dates].sort();
  const out: { from: string; to: string }[] = [];
  for (const d of ds) {
    const c = out[out.length - 1];
    if (c && d <= addDays(c.from, MAX_SPAN - 1) && d <= addDays(c.to, 8)) c.to = d;
    else out.push({ from: d, to: d });
  }
  return out;
}
async function salesOf(ctx: Ctx, g: Gate, unitIds: string[], dates: Set<string>, now: Date): Promise<Map<string, UnitSales>> {
  const out = new Map<string, UnitSales>();
  if (!unitIds.length) return out;
  const facts = (await import("@/lib/modules/pos")).salesFacts;
  const actor = { userId: g.userId, role: g.m.role, unitAccess: [...g.m.unitAccess], permissions: { ...g.m.permissions } } as Parameters<typeof facts.salesByHour>[1];
  const parts = chunksOf(dates);
  await Promise.all(
    unitIds.map(async (u) => {
      const s: UnitSales = { state: "OK", cutoff: 0, today: businessDateAt(now.getTime(), 0), act: new Map() };
      for (const p of parts) {
        const r = await facts.salesByHour({ tenantId: ctx.tenantId, unitId: u }, actor, p);
        if (!r.ok) {
          s.state = "NO_PERMISSION";
          break;
        }
        if (!r.connected) {
          s.state = "NO_POS";
          break;
        }
        s.cutoff = r.cutoffMin;
        s.today = businessDateAt(now.getTime(), r.cutoffMin);
        for (const d of r.days) {
          const m = s.act.get(d.date) ?? new Map<number, number>();
          for (const h of d.hours) m.set(h.hour, (m.get(h.hour) ?? 0) + h.netSalesSatang);
          s.act.set(d.date, m);
        }
      }
      if (s.state !== "OK") s.act.clear();
      out.set(u, s);
    }),
  );
  return out;
}
/** วันที่ที่ต้องอ่านยอด: วันที่ดู (+ วันถัดไปของกะข้ามคืน) + วันย้อนหลังของคาดการณ์ (ทั้ง "วันนี้" และ "เมื่อวาน" — ตัดวัน POS ทำให้วันนี้เลื่อนได้ ≤ 1 วัน) */
function datesFor(days: string[], now: Date, withForecast: boolean): Set<string> {
  const t0 = businessDateAt(now.getTime(), 0);
  const ts = [t0, addDays(t0, -1)];
  const set = new Set<string>();
  for (const d of days) {
    for (const x of [d, addDays(d, 1)]) {
      set.add(x);
      if (withForecast) for (const t of ts) for (const f of forecastDates(x, t)) set.add(f);
    }
  }
  return set;
}
const actualAt = (s: UnitSales, date: string, hour: number) => s.act.get(date)?.get(hour) ?? 0;
function forecastAt(s: UnitSales, date: string, hour: number): number {
  return forecastHour({ day: date, today: s.today, valueOf: (x) => actualAt(s, x, hour) });
}
/** ชั่วโมงที่มีในประวัติของคาดการณ์วันนั้น */
function forecastHours(s: UnitSales, date: string): Set<number> {
  const hs = new Set<number>();
  for (const f of forecastDates(date, s.today)) for (const h of s.act.get(f)?.keys() ?? []) hs.add(h);
  return hs;
}
function salesState(view: View, sales: Map<string, UnitSales>): { state: LaborSales; ok: UnitSales[] } {
  const all = view.unitIds.map((u) => sales.get(u)).filter((x): x is UnitSales => !!x);
  if (all.some((x) => x.state === "NO_PERMISSION")) return { state: "NO_PERMISSION", ok: [] };
  const ok = all.filter((x) => x.state === "OK");
  return { state: ok.length ? "OK" : "NO_POS", ok };
}
/** D10 ใช้ยอดจริงของวันนั้นไหม: อดีต = จริง · วันนี้ = คาดการณ์ (+ ขายแล้ว) · วันข้างหน้า = คาดการณ์ เว้นแต่ POS มียอดของวันนั้นแล้ว (ยอดจริงชนะ) */
const actualDay = (s: UnitSales, d: string) => d < s.today || (d > s.today && s.act.has(d));
/** D10 ยอดของวัน */
function daySalesOf(ok: UnitSales[], d: string): number {
  let t = 0;
  for (const s of ok) {
    if (actualDay(s, d)) for (const v of s.act.get(d)?.values() ?? []) t += v;
    else for (const h of forecastHours(s, d)) t += forecastAt(s, d, h);
  }
  return t;
}

// ═════════════ ข้อมูล HR ของช่วง ═════════════
type Emp = { id: string; unitId: string | null; active: boolean; startDate: string | null; endDate: string | null; units: { id: string; unitId: string; fromDate: Date; toDate: Date | null }[] };
type Prof = { payType: string; base: number; daily: number | null; hourly: number | null; sso: boolean };
type Entry = { employeeId: string; date: string; shiftId: string; unitId: string | null; startMin: number; endMin: number; breakMin: number; crossesMidnight: boolean };
type Loaded = {
  emps: Emp[];
  empById: Map<string, Emp>;
  prof: Map<string, Prof>;
  byEmpDay: Map<string, Entry[]>;
  byDay: Map<string, Entry[]>;
  holidays: { unitId: string | null; date: string; kind: string }[];
  shiftName: Map<string, string>;
  law: { id: string; kind: string; effectiveFrom: string; status: string; json: unknown }[];
  N: number;
  labor: LaborSettings;
};
async function loadRange(ctx: Ctx, g: Gate, from: string, to: string, drafts: boolean): Promise<Loaded> {
  const db = await dbOf(ctx);
  const [emps, profs, entries, hols, view] = await Promise.all([
    db.hrEmployee.findMany({ select: { id: true, unitId: true, active: true, startDate: true, endDate: true, units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 } }, orderBy: { id: "asc" }, take: 5000 }),
    db.hrSalaryProfile.findMany({ select: { employeeId: true, payType: true, baseSalarySatang: true, dailyRateSatang: true, hourlyRateSatang: true, ssoEligible: true }, take: 5000 }),
    db.hrRosterEntry.findMany({
      where: { date: { gte: d0(addDays(from, -1)), lte: d0(to) }, ...(drafts ? {} : { published: true }) },
      select: { employeeId: true, date: true, shiftId: true, unitId: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true },
      orderBy: [{ date: "asc" }, { startMin: "asc" }, { id: "asc" }],
      take: 20_000,
    }),
    db.hrHoliday.findMany({ where: { date: { gte: d0(from), lte: d0(to) } }, select: { unitId: true, date: true, kind: true }, take: 2000 }),
    loadLawView(to),
  ]);
  const es: Emp[] = emps.map((e) => ({ id: e.id, unitId: e.unitId, active: e.active, startDate: dayOf(e.startDate), endDate: dayOf(e.endDate), units: e.units }));
  const byEmpDay = new Map<string, Entry[]>();
  const byDay = new Map<string, Entry[]>();
  for (const x of entries) {
    const en: Entry = { employeeId: x.employeeId, date: dayOf(x.date)!, shiftId: x.shiftId, unitId: x.unitId, startMin: x.startMin, endMin: x.endMin, breakMin: x.breakMin, crossesMidnight: x.crossesMidnight };
    const k = `${en.employeeId}|${en.date}`;
    byEmpDay.set(k, [...(byEmpDay.get(k) ?? []), en]);
    byDay.set(en.date, [...(byDay.get(en.date) ?? []), en]);
  }
  const shiftIds = [...new Set(entries.map((x) => x.shiftId))];
  const shifts = shiftIds.length ? await db.hrShift.findMany({ where: { id: { in: shiftIds } }, select: { id: true, name: true } }) : [];
  return {
    emps: es,
    empById: new Map(es.map((e) => [e.id, e])),
    prof: new Map(profs.map((p) => [p.employeeId, { payType: String(p.payType), base: p.baseSalarySatang, daily: p.dailyRateSatang, hourly: p.hourlyRateSatang, sso: p.ssoEligible }])),
    byEmpDay,
    byDay,
    holidays: hols.map((h) => ({ unitId: h.unitId, date: dayOf(h.date)!, kind: String(h.kind) })),
    shiftName: new Map(shifts.map((s) => [s.id, s.name])),
    law: view.groups.flatMap((gr) => gr.rows.map((r) => ({ id: r.key, kind: gr.kind, effectiveFrom: r.effectiveFrom, status: r.status, json: r.values }))),
    N: normalMinutesOf(g.settings),
    labor: laborSettingsOf(g.settings.hrLabor),
  };
}

// ═════════════ คิดรายวัน (D1–D8) ═════════════
type Cell = { v: number; who: Set<string> };
const cell = (): Cell => ({ v: 0, who: new Set() });
type DayCalc = {
  day: string;
  wage: number;
  sso: number;
  total: Cell;
  unalloc: Cell;
  hours: Map<string, Cell & { date: string; hour: number }>;
  shifts: Map<string, Cell & { keys: Set<string>; first: number }>;
  demand: { employeeId: string; hour: number; minutes: number }[];
  paidMinutes: number;
  noProfile: Set<string>;
  lawMissing: boolean;
};
const paidOf = (e: Entry) => Math.max(0, e.endMin + (e.crossesMidnight ? 1440 : 0) - e.startMin - e.breakMin);
const inPop = (e: Emp, d: string) => (!e.startDate || e.startDate <= d) && (e.active || (!!e.endDate && e.endDate >= d));
const UNASSIGNED = "~";
function holidayOf(L: Loaded, unitId: string | null, d: string) {
  const same = L.holidays.filter((h) => h.date === d);
  return (unitId ? same.find((h) => h.unitId === unitId) : undefined) ?? same.find((h) => h.unitId === null) ?? null;
}
function ssoLawOf(L: Loaded, d: string): { rateBp: number; maxBaseSatang: number } | null {
  const p = pickLawRow(L.law, "SSO", d);
  if (!p.ok) return null;
  const j = obj(p.row.json);
  return Number.isInteger(j.rateBp) && Number.isInteger(j.maxBaseSatang) ? { rateBp: j.rateBp as number, maxBaseSatang: j.maxBaseSatang as number } : null;
}
function computeDay(L: Loaded, d: string, view: View, cutoffOf: (unit: string | null) => number): DayCalc {
  const c: DayCalc = { day: d, wage: 0, sso: 0, total: cell(), unalloc: cell(), hours: new Map(), shifts: new Map(), demand: [], paidMinutes: 0, noProfile: new Set(), lawMissing: false };
  const inView = (u: string | null) => (u ? view.unitIds.includes(u) : view.unassigned);
  const D = daysInMonth(d);
  const sso = ssoLawOf(L, d);
  const ot = otLawOf(L.law, d);
  const bp = ot.ok ? ot.law.holidayWorkPaidBp : null;
  const unitOfEntry = (x: Entry, e: Emp | undefined) => x.unitId ?? (e ? unitOfDay(e, x.date) : null);
  // หัวคนต่อชั่วโมง (D13): กะของวันนี้ + กะข้ามคืนของเมื่อวาน ที่ตกในวันธุรกิจนี้ — นับทุกคนในตารางกะ
  for (const x of [...(L.byDay.get(addDays(d, -1)) ?? []), ...(L.byDay.get(d) ?? [])]) {
    const u = unitOfEntry(x, L.empById.get(x.employeeId));
    if (!inView(u)) continue;
    for (const s of hourSlots({ day: x.date, startMin: x.startMin, endMin: x.endMin, crossesMidnight: x.crossesMidnight, cutoffMin: cutoffOf(u) })) {
      if (s.date === d) c.demand.push({ employeeId: x.employeeId, hour: s.hour, minutes: s.minutes });
    }
  }
  for (const e of L.emps) {
    const es = L.byEmpDay.get(`${e.id}|${d}`) ?? [];
    for (const x of es) if (inView(unitOfEntry(x, e))) c.paidMinutes += paidOf(x);
    if (!inPop(e, d)) continue;
    const units = es.length ? es.map((x) => unitOfEntry(x, e)) : [unitOfDay(e, d)];
    if (!units.some(inView)) continue;
    const p = L.prof.get(e.id);
    if (!p) {
      c.noProfile.add(e.id);
      continue;
    }
    const m = es.reduce((a, x) => a + paidOf(x), 0);
    const wage = dayWage({ payType: p.payType, baseSatang: p.base, dailySatang: p.daily, hourlySatang: p.hourly, day: d, paidMin: m, normalMin: L.N, startDate: e.startDate, endDate: e.endDate });
    let premium = 0;
    for (const x of es) {
      const h = holidayOf(L, unitOfEntry(x, e), d);
      if (!h) continue;
      if (bp === null) c.lawMissing = true;
      const rate = p.payType === "MONTHLY" ? p.base : p.payType === "DAILY" ? (p.daily ?? 0) : (p.hourly ?? 0);
      premium += holidayPremium({ payType: p.payType, rateSatang: rate, paidMin: paidOf(x), normalMin: L.N, kind: h.kind, holidayWorkPaidBp: bp });
    }
    let er = 0;
    if (p.sso && wage > 0) {
      if (sso) er = ssoEstimate({ wageSatang: wage, daysInMonth: D, rateBp: sso.rateBp, maxBaseSatang: sso.maxBaseSatang });
      else c.lawMissing = true;
    }
    // D7 แบ่งตามนาทีจ่ายต่อสาขาของกะ (เศษมากก่อน · เท่ากัน = รหัสสาขาน้อยก่อน · ไม่ระบุสาขาท้ายสุด)
    const keys = [...new Set(units.map((u) => u ?? UNASSIGNED))].sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a < b ? -1 : a > b ? 1 : 0));
    const weights = keys.map((k) => (es.length ? es.filter((x) => (unitOfEntry(x, e) ?? UNASSIGNED) === k).reduce((a, x) => a + paidOf(x), 0) : 1));
    const wSplit = largestRemainder(wage + premium, weights);
    const sSplit = largestRemainder(er, weights);
    keys.forEach((k, i) => {
      const unit = k === UNASSIGNED ? null : k;
      if (!inView(unit)) return;
      const uw = wSplit[i] ?? 0;
      const us = sSplit[i] ?? 0;
      const uc = uw + us;
      c.wage += uw;
      c.sso += us;
      c.total.v += uc;
      if (uc > 0) c.total.who.add(e.id);
      const ue = es.filter((x) => (unitOfEntry(x, e) ?? UNASSIGNED) === k);
      if (!ue.length) {
        c.unalloc.v += uc;
        if (uc > 0) c.unalloc.who.add(e.id);
        return;
      }
      // D8 ชั่วโมง: ตามนาทีของช่วงกะต่อคีย์ชั่วโมง (เศษมากก่อน · เท่ากัน = ชั่วโมงก่อน)
      const slotMin = new Map<string, { date: string; hour: number; minutes: number }>();
      const entrySlots = ue.map((x) => hourSlots({ day: d, startMin: x.startMin, endMin: x.endMin, crossesMidnight: x.crossesMidnight, cutoffMin: cutoffOf(unit) }));
      for (const ss of entrySlots)
        for (const s of ss) {
          const key = `${s.date}|${String(s.hour).padStart(3, "0")}`;
          const cur = slotMin.get(key) ?? { date: s.date, hour: s.hour, minutes: 0 };
          cur.minutes += s.minutes;
          slotMin.set(key, cur);
        }
      const order = [...slotMin.keys()].sort();
      const hSplit = largestRemainder(uc, order.map((k2) => slotMin.get(k2)!.minutes));
      order.forEach((k2, j) => {
        const s = slotMin.get(k2)!;
        const h = c.hours.get(k2) ?? { ...cell(), date: s.date, hour: s.hour };
        h.v += hSplit[j] ?? 0;
        if ((hSplit[j] ?? 0) > 0) h.who.add(e.id);
        c.hours.set(k2, h);
      });
      // กะ (R4): ค่าแรงของกะ = ส่วนของสาขาแบ่งตามนาทีจ่ายของแต่ละแถว · ช่วงของกะ = คีย์ชั่วโมงที่ทับ ≥ 30 นาที
      const eSplit = largestRemainder(uc, ue.map(paidOf));
      ue.forEach((x, j) => {
        const sh = c.shifts.get(x.shiftId) ?? { ...cell(), keys: new Set<string>(), first: x.startMin };
        sh.v += eSplit[j] ?? 0;
        if ((eSplit[j] ?? 0) > 0) sh.who.add(e.id);
        sh.first = Math.min(sh.first, x.startMin);
        for (const s of entrySlots[j] ?? []) if (s.minutes >= 30) sh.keys.add(`${s.date}|${s.hour}`);
        c.shifts.set(x.shiftId, sh);
      });
    });
  }
  return c;
}

// ═════════════ ความเป็นส่วนตัว (P2) ═════════════
function hiderOf(g: Gate, L: { empById: Map<string, Emp> }) {
  const home = (id: string) => L.empById.get(id)?.unitId ?? null;
  const ids = g.scope.unitIds === "*" ? null : (g.scope.unitIds as string[]);
  return (who: Set<string>): boolean => {
    if (!g.limited || !ids || who.size === 0 || who.size >= SMALL_GROUP) return false;
    return [...who].some((id) => {
      const h = home(id);
      return !h || !ids.includes(h);
    });
  };
}

// ═════════════ ประกอบผลรายวัน ═════════════
function demandOf(c: DayCalc, ok: UnitSales[], salesOk: boolean, labor: LaborSettings, cutoff: number): LaborDemand | null {
  if (labor.splhSatang === null) return null;
  const first = Math.floor(cutoff / 60);
  const hours = Array.from({ length: 24 }, (_, i) => first + i).map((hour) => {
    const f = salesOk ? ok.reduce((a, s) => a + forecastAt(s, c.day, hour), 0) : null;
    return { hour, label: label(hour), scheduled: scheduledAt(c.demand, hour), needed: f === null ? null : neededOf({ forecastSatang: f, splhSatang: labor.splhSatang, minStaff: labor.minStaff }), f };
  });
  let peak: number | null = null;
  let best = 0;
  for (const h of hours) if (h.f !== null && h.f > best) ((best = h.f), (peak = h.hour));
  return { hours: hours.map(({ hour, label: l, scheduled, needed }) => ({ hour, label: l, scheduled, needed })), peak };
}
function assembleDay(g: Gate, L: Loaded, c: DayCalc, view: View, sales: Map<string, UnitSales>, now: Date): Omit<LaborDayDto, "ok" | "day" | "unitId" | "basis"> {
  const { state, ok } = salesState(view, sales);
  const salesOk = state === "OK";
  const single = view.unitIds.length === 1 ? sales.get(view.unitIds[0]!) : undefined;
  const cutoff = single && single.state === "OK" ? single.cutoff : 0;
  const demand = g.roster || g.money ? demandOf(c, ok, salesOk, L.labor, cutoff) : null;
  const flags: LaborFlags = { noProfile: c.noProfile.size, lawMissing: c.lawMissing, smallGroup: false };
  if (!g.money) return { sales: state, money: null, demand, flags };
  const hide = hiderOf(g, L);
  let suppressed = 0;
  const show = (x: Cell): number | null => {
    if (hide(x.who)) {
      suppressed += 1;
      return null;
    }
    return x.v;
  };
  const d = c.day;
  const salesTotal = salesOk ? daySalesOf(ok, d) : null;
  let soFar: number | null = null;
  if (salesOk && ok.some((s) => s.today === d)) {
    soFar = 0;
    for (const s of ok) {
      if (s.today !== d) continue;
      const nk = hourKeyAt(now.getTime(), s.cutoff);
      for (const [h, v] of s.act.get(d) ?? []) if (nk.date > d || h <= nk.hour) soFar += v;
    }
  }
  const cost = show(c.total);
  // ชั่วโมง: คีย์ที่มีค่าแรง + ชั่วโมงที่มีขาย/คาดการณ์ของวันธุรกิจนี้ · ชั่วโมงของวันธุรกิจอื่น (กะข้ามคืน) แสดงเป็น +24
  const keys = new Map<string, { date: string; hour: number }>();
  for (const h of c.hours.values()) keys.set(`${h.date}|${String(h.hour).padStart(3, "0")}`, { date: h.date, hour: h.hour });
  if (salesOk)
    for (const s of ok) {
      for (const h of s.act.get(d)?.keys() ?? []) keys.set(`${d}|${String(h).padStart(3, "0")}`, { date: d, hour: h });
      for (const h of forecastHours(s, d)) keys.set(`${d}|${String(h).padStart(3, "0")}`, { date: d, hour: h });
    }
  const hours: LaborHour[] = [...keys.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, { date, hour }]) => {
      const hc = c.hours.get(k);
      const shown = hc ? show(hc) : 0;
      const disp = hour + 24 * Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
      return {
        hour: disp,
        label: label(disp),
        costSatang: shown,
        salesSatang: salesOk ? ok.reduce((a, s) => a + actualAt(s, date, hour), 0) : null,
        forecastSatang: salesOk ? ok.reduce((a, s) => a + forecastAt(s, date, hour), 0) : null,
      };
    });
  const shifts: LaborShift[] = [...c.shifts.entries()]
    .sort((a, b) => a[1].first - b[1].first || (a[0] < b[0] ? -1 : 1))
    .map(([shiftId, sh]) => {
      const sc = show(sh);
      let ss: number | null = null;
      if (salesOk) {
        ss = 0;
        for (const k of sh.keys) {
          const [date, hs] = k.split("|");
          const hour = Number(hs);
          for (const s of ok) ss += actualDay(s, date!) ? actualAt(s, date!, hour) : forecastAt(s, date!, hour);
        }
      }
      return { shiftId, label: L.shiftName.get(shiftId) ?? "", costSatang: sc, salesSatang: ss, pctTenths: sc === null || ss === null ? null : pctTenths(sc, ss) };
    });
  const unalloc = show(c.unalloc);
  const money: LaborMoney = {
    costSatang: cost,
    wageSatang: cost === null ? null : c.wage,
    ssoSatang: cost === null ? null : c.sso,
    salesSatang: salesTotal,
    soFarSatang: soFar,
    pctTenths: cost === null || salesTotal === null ? null : pctTenths(cost, salesTotal),
    targetTenths: L.labor.targetTenths,
    hours,
    shifts,
    unallocatedSatang: unalloc,
    suppressed,
  };
  flags.smallGroup = suppressed > 0;
  return { sales: state, money, demand, flags };
}

// ═════════════ ตัวช่วยหลายวัน ═════════════
async function prepare(ctx: Ctx, viewer: LaborViewer, unitRaw: unknown, o: LaborOpts | undefined, needMoney: boolean) {
  const g = await gateOf(ctx, viewer);
  if (!g || !viewerOk(g) || (needMoney && !g.money)) return NO(o);
  const view = await viewOf(ctx, g, unitRaw, o);
  if (isNo(view)) return view;
  return { g, view };
}
async function calcDays(ctx: Ctx, g: Gate, view: View, days: string[], now: Date, drafts: boolean, withForecast: boolean) {
  const [L, sales] = await Promise.all([loadRange(ctx, g, days[0]!, days[days.length - 1]!, drafts), salesOf(ctx, g, view.unitIds, datesFor(days, now, withForecast), now)]);
  const cutoffOf = (u: string | null) => {
    const s = u ? sales.get(u) : undefined;
    return s && s.state === "OK" ? s.cutoff : 0;
  };
  return { L, sales, calcs: days.map((d) => computeDay(L, d, view, cutoffOf)) };
}
const union = (cs: Cell[]): Cell => {
  const out = cell();
  for (const x of cs) {
    out.v += x.v;
    for (const w of x.who) out.who.add(w);
  }
  return out;
};
const mergeFlags = (cs: DayCalc[]): LaborFlags => {
  const np = new Set<string>();
  for (const c of cs) for (const e of c.noProfile) np.add(e);
  return { noProfile: np.size, lawMissing: cs.some((c) => c.lawMissing), smallGroup: false };
};

// ═════════════ R4 API ═════════════
/** วันเดียว (หน้า 01 = กะที่เผยแพร่แล้ว · หน้า 03 ส่ง drafts) */
export async function laborDay(ctx: Ctx, viewer: LaborViewer, input: { unitId?: string | null; day?: unknown }, opts?: LaborOpts): Promise<LaborDayDto | LaborNo | LaborFail> {
  const p = await prepare(ctx, viewer, input?.unitId, opts, false);
  if (isNo(p)) return p;
  if (!isDayKey(input?.day)) return fail("BAD", textOf(opts).bad);
  const day = input.day;
  const now = nowOf(opts);
  const { L, sales, calcs } = await calcDays(ctx, p.g, p.view, [day], now, opts?.drafts === true, true);
  return { ok: true, day, unitId: p.view.unitId, basis: "ESTIMATE", ...assembleDay(p.g, L, calcs[0]!, p.view, sales, now) };
}

/** สัปดาห์ (หน้า 03 · นับร่างด้วย) — หัวคอลัมน์ จัด/ต้องการ ณ ชั่วโมงพีค + แถบท้าย */
export async function laborWeek(ctx: Ctx, viewer: LaborViewer, input: { unitId?: string | null; week?: unknown }, opts?: LaborOpts): Promise<LaborWeekDto | LaborNo | LaborFail> {
  const p = await prepare(ctx, viewer, input?.unitId, opts, false);
  if (isNo(p)) return p;
  if (!isDayKey(input?.week) || mondayOf(input.week) !== input.week) return fail("BAD", textOf(opts).bad);
  const days = Array.from({ length: 7 }, (_, i) => addDays(input.week as string, i));
  const now = nowOf(opts);
  const { L, sales, calcs } = await calcDays(ctx, p.g, p.view, days, now, true, true);
  const { state, ok } = salesState(p.view, sales);
  const salesOk = state === "OK";
  const single = p.view.unitIds.length === 1 ? sales.get(p.view.unitIds[0]!) : undefined;
  const cutoff = single && single.state === "OK" ? single.cutoff : 0;
  const rows = calcs.map((c) => {
    const dm = demandOf(c, ok, salesOk, { ...L.labor, splhSatang: L.labor.splhSatang ?? 1 }, cutoff);
    const at = dm?.peak !== null && dm?.peak !== undefined ? dm.hours.find((h) => h.hour === dm.peak) : undefined;
    return { day: c.day, scheduledAtPeak: at ? at.scheduled : null, neededAtPeak: at && L.labor.splhSatang !== null ? at.needed : null, peak: dm?.peak ?? null };
  });
  const flags = mergeFlags(calcs);
  const paidMinutes = calcs.reduce((a, c) => a + c.paidMinutes, 0);
  if (!p.g.money) return { ok: true, week: input.week as string, unitId: p.view.unitId, basis: "ESTIMATE", sales: state, days: rows, footer: { paidMinutes }, flags };
  const total = union(calcs.map((c) => c.total));
  const hidden = hiderOf(p.g, L)(total.who);
  const forecastSales = salesOk ? days.reduce((a, d) => a + daySalesOf(ok, d), 0) : null;
  const cost = hidden ? null : total.v;
  flags.smallGroup = hidden;
  return {
    ok: true,
    week: input.week as string,
    unitId: p.view.unitId,
    basis: "ESTIMATE",
    sales: state,
    days: rows,
    footer: { paidMinutes, costSatang: cost, forecastSalesSatang: forecastSales, pctTenths: cost === null || forecastSales === null ? null : pctTenths(cost, forecastSales), targetTenths: L.labor.targetTenths, suppressed: hidden ? 1 : 0 },
    flags,
  };
}

/** D9 เดือนของสาขา: รอบเงินเดือนที่ปิดงานแล้ว = จริง (gross + ปสส. นายจ้าง แบ่งตามนาทีทำงานต่อสาขา) · ไม่มี = ผลรวมประมาณรายวัน */
async function monthPart(ctx: Ctx, g: Gate, view: View, periodKey: string, now: Date): Promise<LaborMonthPart & { sales: LaborSales; flags: LaborFlags; targetTenths: number }> {
  const db = await dbOf(ctx);
  const days = monthDays(periodKey);
  const runs = (await db.hrPayrollRun.findMany({ where: { periodKey, status: { in: ["APPROVED", "PAID"] } }, select: { id: true, engineVersion: true, journalEntryId: true, stepsJson: true }, take: 50 })).filter(
    (r) => r.engineVersion < 2 || !!r.journalEntryId || obj(r.stepsJson).finalized === true,
  );
  const sales = await salesOf(ctx, g, view.unitIds, new Set(days), now);
  const { state, ok } = salesState(view, sales);
  const salesTotal = state === "OK" ? ok.reduce((a, s) => a + days.reduce((b, d) => b + [...(s.act.get(d)?.values() ?? [])].reduce((x, y) => x + y, 0), 0), 0) : null;
  let total: Cell;
  let flags: LaborFlags;
  let basis: "ACTUAL" | "ESTIMATE";
  let empById: Map<string, Emp>;
  const labor = laborSettingsOf(g.settings.hrLabor);
  if (runs.length) {
    basis = "ACTUAL";
    const items = await db.hrPayrollItem.findMany({ where: { runId: { in: runs.map((r) => r.id) } }, select: { employeeId: true, grossSatang: true, ssoEmployerSatang: true }, take: 10_000 });
    const ids = [...new Set(items.map((i) => i.employeeId))];
    const [emps, wds] = await Promise.all([
      db.hrEmployee.findMany({ where: { id: { in: ids } }, select: { id: true, unitId: true, active: true, startDate: true, endDate: true } }),
      db.hrWorkDay.findMany({ where: { periodKey, employeeId: { in: ids } }, select: { employeeId: true, unitId: true, workMin: true }, take: 50_000 }),
    ]);
    empById = new Map(emps.map((e) => [e.id, { id: e.id, unitId: e.unitId, active: e.active, startDate: dayOf(e.startDate), endDate: dayOf(e.endDate), units: [] }]));
    const inView = (u: string | null) => (u ? view.unitIds.includes(u) : view.unassigned);
    total = cell();
    for (const id of ids) {
      const amount = items.filter((i) => i.employeeId === id).reduce((a, i) => a + i.grossSatang + i.ssoEmployerSatang, 0);
      const byUnit = new Map<string, number>();
      for (const w of wds) if (w.employeeId === id && w.workMin > 0) byUnit.set(w.unitId ?? UNASSIGNED, (byUnit.get(w.unitId ?? UNASSIGNED) ?? 0) + w.workMin);
      if (!byUnit.size) byUnit.set(empById.get(id)?.unitId ?? UNASSIGNED, 1);
      const keys = [...byUnit.keys()].sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a < b ? -1 : a > b ? 1 : 0));
      const split = largestRemainder(amount, keys.map((k) => byUnit.get(k)!));
      keys.forEach((k, i) => {
        if (!inView(k === UNASSIGNED ? null : k)) return;
        total.v += split[i] ?? 0;
        if ((split[i] ?? 0) !== 0) total.who.add(id);
      });
    }
    flags = { noProfile: 0, lawMissing: false, smallGroup: false };
  } else {
    basis = "ESTIMATE";
    const L = await loadRange(ctx, g, days[0]!, days[days.length - 1]!, false);
    const cutoffOf = (u: string | null) => {
      const s = u ? sales.get(u) : undefined;
      return s && s.state === "OK" ? s.cutoff : 0;
    };
    const calcs = days.map((d) => computeDay(L, d, view, cutoffOf));
    total = union(calcs.map((c) => c.total));
    flags = mergeFlags(calcs);
    empById = L.empById;
  }
  const hidden = hiderOf(g, { empById })(total.who);
  const cost = hidden ? null : total.v;
  flags.smallGroup = hidden;
  return { periodKey, basis, costSatang: cost, salesSatang: salesTotal, pctTenths: cost === null || salesTotal === null ? null : pctTenths(cost, salesTotal), suppressed: hidden ? 1 : 0, sales: state, flags, targetTenths: labor.targetTenths };
}
/** เดือน + เดือนก่อน (การ์ดเดือนของหน้า 01) — เฉพาะผู้ดูเงิน */
export async function laborMonth(ctx: Ctx, viewer: LaborViewer, input: { unitId?: string | null; periodKey?: unknown }, opts?: LaborOpts): Promise<LaborMonthDto | LaborNo | LaborFail> {
  const p = await prepare(ctx, viewer, input?.unitId, opts, true);
  if (isNo(p)) return p;
  if (typeof input?.periodKey !== "string" || !PERIOD_RE.test(input.periodKey)) return fail("BAD", textOf(opts).bad);
  const now = nowOf(opts);
  const [cur, prev] = await Promise.all([monthPart(ctx, p.g, p.view, input.periodKey, now), monthPart(ctx, p.g, p.view, prevPeriod(input.periodKey), now)]);
  const { sales, flags, targetTenths, ...part } = cur;
  return {
    ok: true,
    unitId: p.view.unitId,
    sales,
    targetTenths,
    ...part,
    prev: { periodKey: prev.periodKey, basis: prev.basis, costSatang: prev.costSatang, salesSatang: prev.salesSatang, pctTenths: prev.pctTenths, suppressed: prev.suppressed },
    flags: { ...flags, smallGroup: flags.smallGroup || prev.flags.smallGroup },
  };
}

// ═════════════ R6 ค่าตั้ง hrLabor ═════════════
/** อ่านค่าตั้ง (ผู้ดูเงิน · ผู้อ่านตารางกะ · ผู้ตั้งค่า HR) — ไม่ลงประวัติ */
export async function getLaborSettings(ctx: Ctx, viewer: LaborViewer, opts?: { locale?: string | null }): Promise<LaborSettingsDto | LaborNo> {
  const g = await gateOf(ctx, viewer);
  if (!g || !(g.money || g.roster || g.manage)) return NO(opts);
  return { ok: true, settings: laborSettingsOf(g.settings.hrLabor), canEdit: g.manage && g.scope.unitIds === "*" };
}

/** บันทึกค่าตั้ง (ผู้ตั้งค่า HR ทุกสาขา) — ล็อก hr:clockpolicy → แถว AppSystem แล้วเปลี่ยนเฉพาะคีย์ hrLabor · ลงประวัติ hr.labor.settings {keys} */
export async function setLaborSettings(ctx: Ctx, viewer: LaborViewer, input: unknown, opts?: { locale?: string | null }): Promise<{ ok: true; settings: LaborSettings } | LaborNo | LaborFail> {
  const g = await gateOf(ctx, viewer);
  if (!g || !canManageHrSettings(g.m) || g.scope.unitIds !== "*") return g && (g.money || g.roster || g.manage) ? fail("BAD", textOf(opts).settingsNo) : NO(opts);
  const next = laborSettingsInput(input);
  if (!next) return fail("BAD", textOf(opts).settingsBad);
  const db = await dbOf({ tenantId: ctx.tenantId });
  const done = await db.$transaction(async (t) => {
    const tx = t as unknown as Parameters<typeof lockHrSettings>[0];
    const sys = await lockHrSettings(tx, ctx); // HR-SET-1 ▸ hr:clockpolicy → แถว AppSystem · อ่านใหม่ใต้ล็อก ◂
    if (!sys) return false;
    const r = await writeHrSettingsKeys(tx, ctx, { hrLabor: next }); // HR-SET-1 ▸ เปลี่ยนเฉพาะคีย์ hrLabor ◂
    return r.count === 1;
  }, TX_OPTS);
  if (!done) return fail("FAILED", textOf(opts).settingsFailed);
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: g.userId, action: "hr.labor.settings", targetType: "AppSystem", targetId: ctx.systemId, after: { keys: ["targetTenths", "splhSatang", "minStaff"] } });
  return { ok: true, settings: next };
}
// ◂ HR H4.2
