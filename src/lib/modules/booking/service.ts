import { resolvePublicUnit } from "@/lib/core/storefront";
import { prisma, tenantDb } from "@/lib/core/db";
import { callerTx } from "@/lib/core/caller-tx"; // POS P5.1 ▸ MA2: ใบรับมัดจำในธุรกรรมของ moduleTakeDeposit ◂
import type { AppointmentStatus, PosPayType, Prisma } from "@prisma/client";
import * as member from "@/lib/modules/member/service";
import { normalizePartyPhone, safeFindOrCreate } from "@/lib/modules/party";
import * as pos from "@/lib/modules/pos/service";
import * as hr from "@/lib/modules/hr/service";
import { staffWindows as hrStaffWindows } from "@/lib/modules/hr"; // SVC B.1 ▸ BQ-1 กะรายวัน (facade) ◂
import { resolveSettingsMany } from "@/lib/core/settings"; // SVC B.1 ▸ ค่าตั้งต่อช่าง (CC §1.4) ◂
import { getDef, resolveSettings, snapshotPolicy, SNAPSHOT_KEYS } from "@/lib/core/settings"; // SVC B.3 ▸ กติกาจอง + snapshot (CC §1.4 §1.6) ◂
import * as inv from "@/lib/modules/inventory/service";
import { systemForUnit } from "@/lib/modules/system/service";
import { emitOutbox } from "@/lib/core/outbox";
import * as queue from "@/lib/modules/queue/service"; // SVC B.4 ▸ บัตรเดินตามงาน (เส้น booking→queue · ทิศเดียว) ◂

/** POS P1.1b R2 F9: actorUserId (ไม่บังคับ) = ผู้กระทำจริง → audit ของแคตตาล็อกเมื่อนำบริการเข้าคลัง */
export type BookingCtx = { tenantId: string; unitId: string; actorUserId?: string };
import {
  BKK_OFFSET_MIN,
  computeDepositSatang, // SVC B.3
  computeStaffSlots,
  localToUtc,
  minutesToHHMM,
} from "./slots";
// SVC B.1 ▸ เวลาต่อช่าง + ช่าง↔บริการ (pure)
import {
  staffDayWindows,
  staffServiceTerms,
  unitDayWindows,
  type HoursSource,
  type MinWindow,
  type StaffServiceRow,
} from "./staff-hours";
export type { HoursSource, MinWindow, StaffServiceRow } from "./staff-hours";
// ◂ SVC B.1

// resolve unit จาก slug (public/no-auth) → tenantId+unitId
export async function resolveUnit(tenantSlug: string, unitSlug: string) {
  // คิวรีเดียว (เดิมยิง tenant แล้ว unit เรียงกัน = 2 round-trip ไปสิงคโปร์)
  return resolvePublicUnit(tenantSlug, unitSlug, "BOOKING");
}

// ── data สำหรับหน้าจอง ──
export async function getBookingData(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  const [services, staff] = await Promise.all([
    db.bookingService.findMany({
      // bookable=false = รายการที่ขายหน้าร้านอย่างเดียว (ค่าจัดส่ง/ห่อของขวัญ) ห้ามโผล่ให้ลูกค้าจอง
      where: { active: true, bookable: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.bookingStaff.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return { services, staff };
}

// ── เวลาทำการร้าน (B) ──
export type UnitHoursRow = { weekday: number; openMin: number; closeMin: number; closed: boolean };

const DEFAULT_HOURS_ROW = { openMin: 600, closeMin: 1200, closed: false };

// คืน 7 แถวเสมอ (weekday 0=อาทิตย์..6) — merge DB กับค่าเริ่มต้น · ไม่ persist ตอนอ่าน
export async function getUnitHours(tenantId: string, unitId: string): Promise<UnitHoursRow[]> {
  const db = tenantDb({ tenantId, unitId });
  const rows = await db.bookingHours.findMany({ where: {} });
  const byWeekday = new Map(rows.map((r) => [r.weekday, r]));
  return Array.from({ length: 7 }, (_, weekday) => {
    const r = byWeekday.get(weekday);
    return r
      ? { weekday, openMin: r.openMin, closeMin: r.closeMin, closed: r.closed }
      : { weekday, ...DEFAULT_HOURS_ROW };
  });
}

// upsert เวลาทำการรายวัน (unique unitId+weekday)
export async function setUnitHours(
  tenantId: string,
  unitId: string,
  rows: { weekday: number; openMin: number; closeMin: number; closed: boolean }[],
) {
  const db = tenantDb({ tenantId, unitId });
  for (const r of rows) {
    if (!r.closed && r.openMin >= r.closeMin) {
      throw new Error("เวลาเปิดต้องมาก่อนเวลาปิด");
    }
    // upsert รายวัน (unique unitId+weekday) — ผ่าน tenantDb (guard inject tenantId/unitId)
    // ใช้ท่า update→create แทน .upsert() เพราะ guard wrap where ของ upsert เป็น AND
    // ทำให้ compound-unique (unitId_weekday) ใช้ไม่ได้ (guard เป็น core ห้ามแก้)
    try {
      await db.bookingHours.update({
        where: { unitId_weekday: { unitId, weekday: r.weekday } },
        data: { openMin: r.openMin, closeMin: r.closeMin, closed: r.closed },
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "P2025" && !(e instanceof Error && /นอกขอบเขต/.test(e.message))) throw e;
      await db.bookingHours.create({
        data: { tenantId, unitId, weekday: r.weekday, openMin: r.openMin, closeMin: r.closeMin, closed: r.closed },
      });
    }
  }
}

export type SlotOption = { hhmm: string; startMin: number; staffId: string };

/**
 * contract C-2: ช่างคนไหน "ลาอนุมัติแล้ว" ในวันนั้น (คืนเป็น staffId ของระบบจอง)
 * 🔴 ถาม HR เท่านั้น (hr.employeesOnLeave) — ห้ามคิดสูตรวันลาเองที่นี่
 * ช่างที่ไม่ผูกทะเบียนพนักงาน (employeeId = null) = ไม่มีข้อมูลลา → ถือว่าทำงาน (ไม่กล่าวหา ไม่เดา)
 */
async function staffOnLeave(
  tenantId: string,
  staffList: { id: string; employeeId: string | null }[],
  dateStr: string,
): Promise<Set<string>> {
  const linked = staffList.filter((s): s is { id: string; employeeId: string } => !!s.employeeId);
  if (linked.length === 0) return new Set();
  const hrSystems = await prisma.appSystem.findMany({
    where: { tenantId, type: "HR", active: true },
    select: { id: true },
  });
  if (hrSystems.length === 0) return new Set(); // ร้านไม่เปิดระบบทีมงาน = ไม่มีใบลาในระบบ
  const date = new Date(`${dateStr}T00:00:00Z`); // @db.Date เทียบกันที่เที่ยงคืน UTC
  const empIds = linked.map((s) => s.employeeId);
  const onLeaveEmp = new Set<string>();
  for (const sys of hrSystems) {
    // "ใช้งานไม่ได้" = ลาอนุมัติแล้ว หรือถูกลบออกจากทะเบียนพนักงาน (soft delete)
    for (const id of await hr.employeesUnavailable({ tenantId, systemId: sys.id }, empIds, date)) {
      onLeaveEmp.add(id);
    }
  }
  return new Set(linked.filter((s) => onLeaveEmp.has(s.employeeId)).map((s) => s.id));
}

// ═════════ SVC B.1 ▸ เวลาต่อช่าง + ช่าง↔บริการ (ใบสั่ง svc-brief-b.1 §3.2) ═════════
// กรอบเวลาต่อช่าง = แหล่งแรกที่มีข้อมูลตาม `booking.staff.hoursSource` (กะ HR → ตารางสัปดาห์ → เวลาร้าน) ∩ เวลาร้านของวัน
// ร้านเดิม (_fallback: ["UNIT_HOURS"] · servicesMode ALL) ⇒ ทุกช่าง = เวลาร้าน · ทำทุกบริการ = รุ่นแรกทุกไบต์ (ไม่แตะ HR)
// 🔴 % ออนไลน์ / งานสูงสุดต่อวัน / พักขั้นต่ำ: ใบนี้แค่ resolve ใส่ profile — บังคับตอนหาช่อง/จองใน B.3

export type StaffWindowsFn = (i: { tenantId: string; unitId: string; date: string; employeeIds: string[] }) =>
  Promise<{ employeeId: string; windows: MinWindow[]; breaks: MinWindow[] }[]>;
export type StaffDayProfile = {
  staffId: string;
  name: string;
  sortOrder: number;
  employeeId: string | null;
  dateStr: string;
  source: HoursSource | null;
  onLeave: boolean;
  windows: MinWindow[];
  /** null = ทำทุกบริการ · [] = ไม่มีบริการที่ทำได้ */
  services: StaffServiceRow[] | null;
  /** #24 #8 #9 ที่ resolve ต่อช่าง (บังคับใน B.3) */
  onlineSharePct: number;
  maxJobsPerDay: number | null;
  minBreakMin: number;
};

const STAFF_SETTING_KEYS = [
  "booking.staff.hoursSource",
  "booking.staff.servicesMode",
  "booking.booking.onlineSharePct",
  "booking.staff.maxJobsPerDay",
  "booking.staff.minBreakMin",
] as const;
const HOURS_SOURCES: readonly HoursSource[] = ["HR_SHIFT", "STAFF_WEEKLY", "UNIT_HOURS"];

/** "YYYY-MM-DD" ที่เป็นวันจริง (2031-02-30 / abc ⇒ false) — คิดด้วย UTC ล้วน ไม่ขึ้นกับ TZ เครื่อง */
export function isRealDateStr(ds: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function hoursOrderOf(v: unknown): HoursSource[] {
  if (!Array.isArray(v)) return ["UNIT_HOURS"];
  const out = v.filter((x): x is HoursSource => HOURS_SOURCES.includes(x as HoursSource));
  return out.length ? [...new Set(out)] : ["UNIT_HOURS"];
}

/** แถวผูกบริการของช่าง (เฉพาะแถวที่ tenantId+unitId ตรงสาขา — ผิดร้าน/ผิดสาขา = ไม่มีอยู่) */
async function staffServiceRowsOf(ctx: BookingCtx, staffIds: string[]): Promise<Map<string, StaffServiceRow[]>> {
  const out = new Map<string, StaffServiceRow[]>();
  if (!staffIds.length) return out;
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  const rows = await db.bookingStaffService.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, staffId: { in: staffIds } },
    select: { staffId: true, serviceId: true, durationMin: true, priceSatang: true },
    orderBy: [{ serviceId: "asc" }],
  });
  for (const r of rows) {
    const list = out.get(r.staffId) ?? [];
    list.push({ serviceId: r.serviceId, durationMin: r.durationMin, priceSatang: r.priceSatang });
    out.set(r.staffId, list);
  }
  return out;
}

/** มีแถว ≥ 1 ⇒ เฉพาะแถว (ทุกโหมด) · ไม่มีแถว ⇒ ALL = null (ทุกบริการ) · ASSIGNED = [] */
function servicesOf(rows: StaffServiceRow[] | undefined, mode: unknown): StaffServiceRow[] | null {
  if (rows && rows.length) return rows;
  return mode === "ASSIGNED" ? [] : null;
}

/** โปรไฟล์ช่างของวัน (ช่าง active ของสาขาเท่านั้น · เรียง sortOrder → createdAt → id) */
export async function staffDayProfiles(
  ctx: BookingCtx,
  dateStr: string,
  opts?: { staffIds?: string[]; hrWindows?: StaffWindowsFn },
): Promise<StaffDayProfile[]> {
  if (!isRealDateStr(dateStr)) return [];
  const { tenantId, unitId } = ctx;
  const db = tenantDb({ tenantId, unitId });
  const staff = await db.bookingStaff.findMany({
    where: opts?.staffIds ? { active: true, id: { in: opts.staffIds } } : { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, sortOrder: true, employeeId: true },
  });
  if (staff.length === 0) return [];
  const staffIds = staff.map((s) => s.id);

  const [resolved, weeklyRows, svcRows, unitHours, closure, onLeave] = await Promise.all([
    resolveSettingsMany({ tenantId }, [...STAFF_SETTING_KEYS], staff.map((s) => ({ unitId, staffId: s.id }))),
    db.bookingStaffHours.findMany({
      where: { tenantId, unitId, staffId: { in: staffIds } },
      select: { staffId: true, weekday: true, startMin: true, endMin: true },
    }),
    staffServiceRowsOf(ctx, staffIds),
    getUnitHours(tenantId, unitId),
    db.bookingClosure.findFirst({ where: { date: dateStr } }),
    staffOnLeave(tenantId, staff, dateStr),
  ]);
  const unitDay = unitDayWindows({
    dateStr,
    hours: unitHours,
    closure: closure ? { closed: closure.closed, openMin: closure.openMin, closeMin: closure.closeMin } : null,
  });
  const orders = resolved.map((r) => hoursOrderOf(r["booking.staff.hoursSource"]?.value));

  // กะ HR: เรียกครั้งเดียวต่อคำขอ เฉพาะพนักงานที่ผูกและ order มี HR_SHIFT · ไม่มีใครเข้าเกณฑ์ = ไม่เรียก
  const employeeIds = [
    ...new Set(staff.flatMap((s, i) => (s.employeeId && orders[i].includes("HR_SHIFT") ? [s.employeeId] : []))),
  ];
  const shifts = new Map<string, { windows: MinWindow[]; breaks: MinWindow[] }>();
  if (employeeIds.length) {
    const wanted = new Set(employeeIds);
    const rows = await (opts?.hrWindows ?? hrStaffWindows)({ tenantId, unitId, date: dateStr, employeeIds });
    for (const r of rows) {
      if (!wanted.has(r.employeeId)) continue; // แถวคนนอกชุด = ทิ้ง
      const cur = shifts.get(r.employeeId) ?? { windows: [], breaks: [] };
      shifts.set(r.employeeId, { windows: [...cur.windows, ...r.windows], breaks: [...cur.breaks, ...r.breaks] });
    }
  }

  return staff.map((s, i) => {
    const set = resolved[i];
    const weekly = weeklyRows
      .filter((r) => r.staffId === s.id)
      .map((r) => ({ weekday: r.weekday, startMin: r.startMin, endMin: r.endMin }));
    const leave = onLeave.has(s.id);
    const day = staffDayWindows({
      dateStr,
      order: orders[i],
      hrShift: s.employeeId ? (shifts.get(s.employeeId) ?? null) : null,
      weekly,
      unitDay,
      onLeave: leave,
    });
    const share = set["booking.booking.onlineSharePct"]?.value;
    const maxJobs = set["booking.staff.maxJobsPerDay"]?.value;
    const minBreak = set["booking.staff.minBreakMin"]?.value;
    return {
      staffId: s.id,
      name: s.name,
      sortOrder: s.sortOrder,
      employeeId: s.employeeId,
      dateStr,
      source: day.source,
      onLeave: leave,
      windows: day.windows,
      services: servicesOf(svcRows.get(s.id), set["booking.staff.servicesMode"]?.value),
      onlineSharePct: typeof share === "number" ? share : 100,
      maxJobsPerDay: typeof maxJobs === "number" ? maxJobs : null,
      minBreakMin: typeof minBreak === "number" ? minBreak : 0,
    };
  });
}
// ◂ SVC B.1

// ช่องว่างของวัน — staffId=null = ใครก็ได้ (คืน staff ที่ว่างคนแรกต่อเวลา)
// SVC B.1: กรอบ = หน้าต่างรายช่าง (staffDayProfiles) · ข้ามช่างที่ทำบริการนี้ไม่ได้ · นาทีเฉพาะคน
export async function getAvailableSlots(
  tenantId: string,
  unitId: string,
  serviceId: string,
  staffId: string | null,
  dateStr: string,
): Promise<SlotOption[]> {
  const db = tenantDb({ tenantId, unitId });
  const service = await db.bookingService.findFirst({ where: { id: serviceId, active: true, bookable: true } });
  if (!service) return [];

  const dayStart = localToUtc(dateStr, 0);
  const dayEnd = localToUtc(dateStr, 24 * 60);

  // contract C-2 (ลา) + วันหยุด/เวลาพิเศษรายวัน (BookingClosure) อยู่ใน profile แล้ว
  // (เลือก "ใครก็ได้" = ตกไปคนที่เหลือ · เลือกคนที่ลา/ทำบริการไม่ได้ = ไม่มีเวลาว่าง)
  const profiles = await staffDayProfiles({ tenantId, unitId }, dateStr, staffId ? { staffIds: [staffId] } : undefined);
  const staffList = profiles.flatMap((p) => {
    if (p.windows.length === 0) return [];
    const terms = staffServiceTerms(p.services, service);
    return terms ? [{ id: p.staffId, windows: p.windows, durationMin: terms.durationMin }] : [];
  });
  if (staffList.length === 0) return [];

  const appts = await db.appointment.findMany({
    where: {
      staffId: { in: staffList.map((s) => s.id) },
      startAt: { gte: dayStart, lt: dayEnd },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    select: { staffId: true, startAt: true, endAt: true },
  });

  const now = new Date();
  // รวมช่องต่อเวลา → เก็บ staff ที่ว่างคนแรก
  const byTime = new Map<number, string>();
  for (const s of staffList) {
    const mins = computeStaffSlots({
      dateStr,
      hours: s.windows,
      busy: appts.filter((a) => a.staffId === s.id),
      durationMin: s.durationMin,
      bufferMin: service.bufferMin,
      now,
    });
    for (const m of mins) if (!byTime.has(m)) byTime.set(m, s.id);
  }

  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startMin, sid]) => ({ startMin, hhmm: minutesToHHMM(startMin), staffId: sid }));
}

// ═════════ บริการมาจากแคตตาล็อกกลาง (13 ส.ค. 2026 · เจ้าของสั่งข้อ 12-15) ═════════
// เดิมบริการถูกสร้าง/แก้ได้ 2 ที่ (หน้าจองคิว + หน้า POS) → ราคาไม่ตรงกัน แก้ที่หนึ่งอีกที่ไม่รู้
// ใหม่: **ต้นฉบับอยู่ระบบสินค้า/บริการ (InvItem kind=SERVICE)** · ที่นี่แค่ติ๊กว่า "สาขานี้เปิดรับจองอะไร"
//   BookingService = projection ต่อสาขา (นัดอ้างถึงแถวนี้ → ห้ามลบจริง · ปิด active พอ)

/** ระบบสินค้า/บริการ (INVENTORY) ที่ผูกกับสาขานี้ — ไม่มี = ยังไม่เปิดระบบ */
async function catalogSystemFor(ctx: BookingCtx): Promise<string | null> {
  const linked = await systemForUnit(ctx.tenantId, ctx.unitId, "INVENTORY");
  if (linked) return linked;
  // ยังไม่ผูกสาขา แต่ร้านเปิดระบบไว้แล้ว → ใช้ระบบแรกของร้าน (ร้านเดียวสาขาเดียวเป็นส่วนใหญ่)
  const any = await prisma.appSystem.findFirst({
    where: { tenantId: ctx.tenantId, type: "INVENTORY", active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return any?.id ?? null;
}

export type ServiceRosterRow = {
  itemId: string;
  name: string;
  priceSatang: number;
  durationMin: number;
  depositSatang: number;
  bookable: boolean;
  offered: boolean; // สาขานี้เปิดรับจองบริการนี้อยู่ไหม
  serviceId: string | null;
  appointmentCount: number;
};

/** บริการทั้งหมดในแคตตาล็อก + สถานะเปิดรับจองของสาขานี้ (sync ชื่อ/ราคา/เวลาให้ตรงต้นฉบับ) */
export async function serviceRoster(ctx: BookingCtx): Promise<{
  rows: ServiceRosterRow[];
  catalogSystemId: string | null;
  legacy: { id: string; name: string; priceSatang: number; durationMin: number }[];
}> {
  const db = tenantDb(ctx);
  const catalogSystemId = await catalogSystemFor(ctx);
  const services = catalogSystemId
    ? await inv.listServices({ tenantId: ctx.tenantId, systemId: catalogSystemId })
    : [];
  const projections = await db.bookingService.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const byItem = new Map(projections.filter((p) => p.itemId).map((p) => [p.itemId!, p]));
  const counts = await db.appointment.groupBy({ by: ["serviceId"], _count: { _all: true } });
  const countBy = new Map(counts.map((c) => [c.serviceId, c._count._all]));

  // ต้นฉบับเปลี่ยน (ราคา/ชื่อ/เวลา) → sync ลง projection ให้ตรง · นัดที่จองไว้ใช้ราคา snapshot ของตัวเองอยู่แล้ว
  for (const it of services) {
    const p = byItem.get(it.id);
    if (!p) continue;
    const want = {
      name: it.name,
      priceSatang: it.priceSatang,
      durationMin: it.durationMin ?? p.durationMin,
      bufferMin: it.bufferMin,
      depositSatang: it.depositSatang,
      bookable: it.bookable,
    };
    const changed =
      p.name !== want.name || p.priceSatang !== want.priceSatang || p.durationMin !== want.durationMin ||
      p.bufferMin !== want.bufferMin || p.depositSatang !== want.depositSatang || p.bookable !== want.bookable;
    if (changed) await db.bookingService.updateMany({ where: { id: p.id }, data: want });
  }

  return {
    catalogSystemId,
    // บริการเก่าที่ยังไม่ได้ย้ายเข้าแคตตาล็อก (ร้านที่ใช้ระบบมาก่อน 13 ส.ค. 2026)
    legacy: projections
      .filter((p) => !p.itemId && p.active)
      .map((p) => ({ id: p.id, name: p.name, priceSatang: p.priceSatang, durationMin: p.durationMin })),
    rows: services.map((it) => {
      const p = byItem.get(it.id);
      return {
        itemId: it.id,
        name: it.name,
        priceSatang: it.priceSatang,
        durationMin: it.durationMin ?? 30,
        depositSatang: it.depositSatang,
        bookable: it.bookable,
        offered: !!p?.active,
        serviceId: p?.id ?? null,
        appointmentCount: p ? (countBy.get(p.id) ?? 0) : 0,
      };
    }),
  };
}

/** ติ๊ก/เอาติ๊กออก "เปิดรับจองบริการนี้ที่สาขานี้" */
export async function setServiceOffered(
  ctx: BookingCtx,
  itemId: string,
  offered: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const catalogSystemId = await catalogSystemFor(ctx);
  if (!catalogSystemId) return { ok: false, reason: "ยังไม่ได้เปิดระบบสินค้า/บริการ" };
  const it = await inv.getItem({ tenantId: ctx.tenantId, systemId: catalogSystemId }, itemId);
  if (!it || it.kind !== "SERVICE") return { ok: false, reason: "ไม่พบบริการนี้ในแคตตาล็อก" };
  const db = tenantDb(ctx);
  const existing = await db.bookingService.findFirst({ where: { itemId } });
  const data = {
    name: it.name,
    priceSatang: it.priceSatang,
    durationMin: it.durationMin ?? 30,
    bufferMin: it.bufferMin,
    depositSatang: it.depositSatang,
    bookable: it.bookable,
    active: offered,
  };
  if (existing) await db.bookingService.updateMany({ where: { id: existing.id }, data });
  else if (offered) await db.bookingService.create({ data: { ...ctx, ...data, itemId } });
  return { ok: true };
}

/**
 * ย้ายบริการเก่าของสาขา (ที่ยังไม่มีต้นฉบับ) เข้าแคตตาล็อกกลาง — กดครั้งเดียว รันซ้ำได้
 * ชื่อซ้ำในแคตตาล็อก = ผูกของเดิม (ไม่สร้างซ้ำ) · นัด/บิลเก่าไม่ถูกแตะเลย
 */
export async function importServicesToCatalog(ctx: BookingCtx): Promise<{ moved: number; linked: number; reason?: string }> {
  const catalogSystemId = await catalogSystemFor(ctx);
  if (!catalogSystemId) return { moved: 0, linked: 0, reason: "ยังไม่ได้เปิดระบบสินค้า/บริการ" };
  const invCtx = { tenantId: ctx.tenantId, systemId: catalogSystemId, actorUserId: ctx.actorUserId };
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  // เฉพาะบริการที่ยังเปิดใช้อยู่ — บริการที่ร้านเอาออกไปแล้วไม่ต้องไปโผล่ในแคตตาล็อกใหม่
  // (ตรงกับจำนวนที่แถบเตือนบอก = legacy ใน serviceRoster)
  const legacy = await db.bookingService.findMany({ where: { itemId: null, active: true } });
  const existing = await inv.listServices(invCtx, 500);
  const byName = new Map(existing.map((e) => [e.name.trim(), e]));
  let moved = 0;
  let linked = 0;
  for (const s of legacy) {
    const found = byName.get(s.name.trim());
    if (found) {
      await db.bookingService.updateMany({ where: { id: s.id }, data: { itemId: found.id } });
      linked++;
      continue;
    }
    const created = await inv.createItem(invCtx, {
      sku: await inv.nextSku(invCtx),
      name: s.name,
      kind: "SERVICE",
      unitLabel: "ครั้ง",
      priceSatang: s.priceSatang,
      durationMin: s.durationMin,
      bufferMin: s.bufferMin,
      depositSatang: s.depositSatang,
      bookable: s.bookable,
    });
    await db.bookingService.updateMany({ where: { id: s.id }, data: { itemId: created.id } });
    byName.set(s.name.trim(), { ...(created as unknown as { id: string }), name: s.name } as never);
    moved++;
  }
  return { moved, linked };
}

// ─────────────── ใครรับคิวที่สาขานี้ (13 ส.ค. 2026 — มติเจ้าของ) ───────────────
// เดิมหน้านี้เพิ่ม/ลบ "ช่าง" ได้เอง → ซ้ำซ้อนกับทะเบียนพนักงาน HR (กรอกคนเดิม 2 ที่)
// ใหม่: **เพิ่ม/ลบคนทำที่ระบบพนักงาน HR ที่เดียว** · ที่นี่แค่ติ๊กว่าใครรับคิวสาขานี้
//   BookingStaff = "ทะเบียนผู้รับคิวของสาขา" (นัดอ้างถึงแถวนี้ → ห้ามลบจริง ปิด active พอ)
export type QueueRosterRow = {
  employeeId: string;
  name: string;
  position: string | null;
  receiving: boolean; // ติ๊กรับคิวที่สาขานี้อยู่ไหม
  staffId: string | null;
  appointmentCount: number; // มีนัดที่อ้างถึงคนนี้กี่ใบ (ไว้บอกว่าปิดแล้วประวัติยังอยู่)
};

export async function queueRoster(ctx: BookingCtx): Promise<{ rows: QueueRosterRow[]; hrSystemId: string | null; unlinked: number }> {
  const db = tenantDb(ctx);
  const hrSystem = await prisma.appSystem.findFirst({
    where: { tenantId: ctx.tenantId, type: "HR", active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const employees = hrSystem
    ? await prisma.hrEmployee.findMany({
        where: { tenantId: ctx.tenantId, systemId: hrSystem.id, active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, position: true },
      })
    : [];
  const staff = await db.bookingStaff.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const byEmp = new Map(staff.filter((s) => s.employeeId).map((s) => [s.employeeId!, s]));
  const counts = await db.appointment.groupBy({ by: ["staffId"], _count: { _all: true } });
  const countBy = new Map(counts.map((c) => [c.staffId, c._count._all]));

  // ชื่อใน BookingStaff เป็นสำเนา (นัดเก่าต้องอ่านชื่อได้แม้ HR เปลี่ยนชื่อ)
  // แต่ถ้า HR เปลี่ยนชื่อคนนี้แล้ว ให้ sync สำเนาให้ตรงตอนเปิดหน้านี้ — ไม่งั้นหน้าจอ 2 ที่ไม่ตรงกัน
  for (const e of employees) {
    const s = byEmp.get(e.id);
    if (s && s.name !== e.name) await db.bookingStaff.updateMany({ where: { id: s.id }, data: { name: e.name } });
  }

  return {
    hrSystemId: hrSystem?.id ?? null,
    unlinked: staff.filter((s) => s.active && !s.employeeId).length,
    rows: employees.map((e) => {
      const s = byEmp.get(e.id);
      return {
        employeeId: e.id,
        name: e.name,
        position: e.position,
        receiving: !!s?.active,
        staffId: s?.id ?? null,
        appointmentCount: s ? (countBy.get(s.id) ?? 0) : 0,
      };
    }),
  };
}

/** ติ๊ก/เอาติ๊กออก "รับคิวที่สาขานี้" — ไม่ใช่การลบพนักงาน (ทะเบียนคนอยู่ที่ HR) */
export async function setStaffReceiving(
  ctx: BookingCtx,
  employeeId: string,
  receiving: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const hrSystems = await prisma.appSystem.findMany({
    where: { tenantId: ctx.tenantId, type: "HR", active: true },
    select: { id: true },
  });
  const emp = await prisma.hrEmployee.findFirst({
    where: { id: employeeId, tenantId: ctx.tenantId, systemId: { in: hrSystems.map((s) => s.id) }, active: true },
    select: { id: true, name: true },
  });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงานคนนี้ในทะเบียน" };
  const db = tenantDb(ctx);
  const existing = await db.bookingStaff.findFirst({ where: { employeeId: emp.id } });
  if (existing) await db.bookingStaff.updateMany({ where: { id: existing.id }, data: { active: receiving, name: emp.name } });
  else if (receiving) await db.bookingStaff.create({ data: { ...ctx, name: emp.name, employeeId: emp.id } });
  return { ok: true };
}

// ── เชื่อมพนักงานกับระบบ HR (A) ──
// พนักงานจากระบบ HR ที่เปิดอยู่ของ tenant นี้ (เลือกได้ ไม่บังคับ) · ไม่เปิด HR = []
export async function listLinkableEmployees(tenantId: string) {
  const hrSystems = await prisma.appSystem.findMany({
    where: { tenantId, type: "HR", active: true },
    select: { id: true },
  });
  if (hrSystems.length === 0) return [];
  const employees = await prisma.hrEmployee.findMany({
    where: { tenantId, systemId: { in: hrSystems.map((s) => s.id) }, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, position: true },
  });
  return employees.map((e) => ({ id: e.id, name: e.name, position: e.position }));
}

// ตัวกลางสร้างช่าง — เลือกจาก HR (employeeId) หรือพิมพ์ชื่อเอง (name)
export async function createStaff(input: {
  tenantId: string;
  unitId: string;
  name?: string;
  employeeId?: string;
}) {
  const db = tenantDb({ tenantId: input.tenantId, unitId: input.unitId });
  let name = (input.name ?? "").trim();
  let employeeId: string | null = null;

  if (input.employeeId) {
    // ต้องเป็นพนักงานของระบบ HR ใน tenant เดียวกัน
    const hrSystems = await prisma.appSystem.findMany({
      where: { tenantId: input.tenantId, type: "HR", active: true },
      select: { id: true },
    });
    const emp =
      hrSystems.length > 0
        ? await prisma.hrEmployee.findFirst({
            where: {
              id: input.employeeId,
              tenantId: input.tenantId,
              systemId: { in: hrSystems.map((s) => s.id) },
              active: true,
            },
          })
        : null;
    if (!emp) throw new Error("ไม่พบพนักงานที่เลือก");
    name = emp.name;
    employeeId = emp.id;
  } else if (name.length < 1) {
    throw new Error("กรุณากรอกชื่อพนักงาน");
  } else {
    // พิมพ์ชื่อเอง + ร้านเปิดระบบพนักงานอยู่ → ขึ้นทะเบียนใน HR ให้เลยแล้วผูกกัน
    // เจ้าของทัก 11 ส.ค.: "จองคิว>พนักงาน" กับ "ทีมงาน>พนักงาน" ซ้ำซ้อน — ต้นเหตุคือ
    // เพิ่มช่างในระบบจองแล้ว HR ไม่รู้จัก เลยต้องกรอกคนเดิมสองที่ (และลงเวลา/เงินเดือนไม่ได้)
    const hrSystem = await prisma.appSystem.findFirst({
      where: { tenantId: input.tenantId, type: "HR", active: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (hrSystem) {
      // ชื่อซ้ำ = ถือว่าคนเดียวกัน ผูกของเดิม (ไม่สร้างซ้ำ)
      const dup = await prisma.hrEmployee.findFirst({
        where: { tenantId: input.tenantId, systemId: hrSystem.id, name, active: true },
        select: { id: true },
      });
      const emp =
        dup ??
        (await prisma.hrEmployee.create({
          data: { tenantId: input.tenantId, systemId: hrSystem.id, name },
          select: { id: true },
        }));
      employeeId = emp.id;
    }
  }

  return db.bookingStaff.create({
    data: { tenantId: input.tenantId, unitId: input.unitId, name, employeeId },
  });
}

/**
 * รวมช่างในระบบจองที่ยังไม่ผูก HR เข้าทะเบียนพนักงาน — ใช้กับร้านที่เพิ่มช่างไว้ก่อนมีระบบนี้
 * ชื่อซ้ำ = ผูกของเดิม ไม่สร้างซ้ำ · คืนจำนวนที่ผูกได้
 */
export async function linkStaffToHr(ctx: BookingCtx): Promise<{ linked: number; created: number }> {
  const hrSystem = await prisma.appSystem.findFirst({
    where: { tenantId: ctx.tenantId, type: "HR", active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!hrSystem) return { linked: 0, created: 0 };
  const db = tenantDb(ctx);
  const orphans = await db.bookingStaff.findMany({ where: { active: true, employeeId: null } });
  let linked = 0;
  let created = 0;
  for (const st of orphans) {
    const dup = await prisma.hrEmployee.findFirst({
      where: { tenantId: ctx.tenantId, systemId: hrSystem.id, name: st.name, active: true },
      select: { id: true },
    });
    let empId = dup?.id;
    if (!empId) {
      const emp = await prisma.hrEmployee.create({
        data: { tenantId: ctx.tenantId, systemId: hrSystem.id, name: st.name },
        select: { id: true },
      });
      empId = emp.id;
      created += 1;
    }
    await db.bookingStaff.updateMany({ where: { id: st.id }, data: { employeeId: empId } });
    linked += 1;
  }
  return { linked, created };
}

// ── สร้างนัด (กันจองซ้อนใน transaction) ──
export async function createAppointment(input: {
  tenantId: string;
  unitId: string;
  serviceId: string;
  staffId: string; // ต้องเป็น staff จริง (แก้ "ใครก็ได้" มาก่อนเรียก)
  dateStr: string;
  startMin: number;
  customerName: string;
  customerPhone: string;
  note?: string;
  source?: "STAFF" | "ONLINE";
  idempotencyKey?: string; // ผูกกับ 1 การกดจอง → ยิงซ้ำ/ดับเบิลคลิก = คืนนัดเดิม (ไม่สร้างใหม่)
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const db = tenantDb({ tenantId: input.tenantId, unitId: input.unitId });
  const idem = input.idempotencyKey?.trim() || null;

  // fast path: key นี้เคยสร้างนัดแล้ว (กดซ้ำ) → คืนนัดเดิมทันที ไม่แตะ member/tx
  if (idem) {
    const prior = await db.appointment.findFirst({ where: { idempotencyKey: idem } });
    if (prior) return { ok: true, id: prior.id };
  }

  const service = await db.bookingService.findFirst({
    where: { id: input.serviceId, active: true },
  });
  if (!service) return { ok: false, reason: "ไม่พบบริการ" };
  const staff = await db.bookingStaff.findFirst({ where: { id: input.staffId, active: true } });
  if (!staff) return { ok: false, reason: "ไม่พบช่าง" };
  // contract C-2: กันจองตรง ๆ ด้วย (ไม่ใช่แค่ซ่อนช่องใน getAvailableSlots — API สาธารณะยิงเวลามาเองได้)
  if ((await staffOnLeave(input.tenantId, [staff], input.dateStr)).has(staff.id)) {
    return { ok: false, reason: `${staff.name} ลาในวันที่เลือก` };
  }
  // SVC B.1 ▸ ช่าง↔บริการ: ช่างทำบริการนี้ไม่ได้ ⇒ ไม่สร้างนัด · นาที/ราคาเฉพาะคน (null = ตามบริการ)
  //   ไม่ตรวจหน้าต่างเวลา (คงรุ่นแรก — พนักงานลงนัดนอกเวลาได้ · บังคับใน B.3)
  const svcCtx = { tenantId: input.tenantId, unitId: input.unitId };
  const [svcRows, [svcSet]] = await Promise.all([
    staffServiceRowsOf(svcCtx, [staff.id]),
    resolveSettingsMany({ tenantId: input.tenantId }, ["booking.staff.servicesMode"], [{ unitId: input.unitId, staffId: staff.id }]),
  ]);
  const terms = staffServiceTerms(servicesOf(svcRows.get(staff.id), svcSet["booking.staff.servicesMode"]?.value), service);
  if (!terms) return { ok: false, reason: `${staff.name} ไม่ได้ให้บริการ "${service.name}"` };
  // ◂ SVC B.1

  const startAt = localToUtc(input.dateStr, input.startMin);
  const endAt = localToUtc(input.dateStr, input.startMin + terms.durationMin + service.bufferMin);
  if (startAt.getTime() <= Date.now()) return { ok: false, reason: "เวลาที่เลือกผ่านไปแล้ว" };

  const phone = input.customerPhone.trim();

  // ระบบสมาชิกที่เชื่อมกับระบบนี้ (optional — เชื่อมจากหน้า "เพิ่มระบบ")
  const memberSystemId = await systemForUnit(input.tenantId, input.unitId, "MEMBER");

  try {
    const appt = await prisma.$transaction(async (tx) => {
      // กันจองซ้อนระดับ DB: ล็อกแถวช่าง (pessimistic row-lock) → 2 request ที่จองช่าง
      // คนเดียวกันพร้อมกัน serialize กัน → คนที่ 2 เห็น insert ของคนแรกที่ commit แล้ว
      // ตาราง = "BookingStaff" (schema ไม่มี @@map)
      await tx.$queryRaw`SELECT id FROM "BookingStaff" WHERE id = ${input.staffId} FOR UPDATE`;

      // idempotency ข้าม request: key เดิม (ที่เพิ่ง commit ระหว่างที่เรารอ lock) → คืนนัดเดิม
      // ต้องเช็คก่อนกันจองซ้อน ไม่งั้นกดซ้ำ slot เดิมจะกลายเป็น SLOT_TAKEN แทนที่จะ idempotent
      if (idem) {
        const dup = await tx.appointment.findFirst({
          where: { tenantId: input.tenantId, idempotencyKey: idem },
        });
        if (dup) return dup;
      }

      // กันจองซ้อน: ช่วงเวลาช่างคนนี้ทับกับนัดที่ยัง active
      const clash = await tx.appointment.findFirst({
        where: {
          tenantId: input.tenantId,
          unitId: input.unitId,
          staffId: input.staffId,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (clash) throw new Error("SLOT_TAKEN");

      // เชื่อมระบบสมาชิก → findOrCreate (contract 2.6); ไม่เชื่อม → จองแบบ guest
      const customer = memberSystemId
        ? await member.findOrCreate(
            {
              tenantId: input.tenantId,
              memberSystemId,
              phone,
              name: input.customerName,
              source: input.source === "STAFF" ? "STAFF" : "SELF",
            },
            tx,
          )
        : null;

      const created = await tx.appointment.create({
        data: {
          tenantId: input.tenantId,
          unitId: input.unitId,
          customerId: customer?.id ?? null,
          staffId: input.staffId,
          serviceId: input.serviceId,
          startAt,
          endAt,
          status: "CONFIRMED",
          customerName: input.customerName,
          customerPhone: phone,
          note: input.note,
          source: input.source ?? "ONLINE",
          // snapshot มัดจำจากบริการ ณ ตอนสร้างนัด (ราคาบริการเปลี่ยนภายหลังไม่กระทบนัดเดิม)
          // ไม่บังคับจ่ายตอนนี้ — ร้านเก็บทีหลังผ่าน recordDeposit
          // snapshot ราคา+มัดจำ ณ วันจอง — ร้านขึ้นราคาทีหลังไม่กระทบนัดใบนี้
          priceSatang: terms.priceSatang, // SVC B.1: ราคาเฉพาะคน ?? ราคาบริการ
          depositSatang: service.depositSatang,
          idempotencyKey: idem,
        },
      });

      // timeline (contract 2.7) — เฉพาะเมื่อเชื่อมระบบสมาชิก
      if (customer) {
        await member.logActivity(
          {
            tenantId: input.tenantId,
            customerId: customer.id,
            unitId: input.unitId,
            module: "booking",
            type: "APPOINTMENT_BOOKED",
            refType: "Appointment",
            refId: created.id,
            summary: `จองนัด ${service.name} · ${input.dateStr} ${minutesToHHMM(input.startMin)}`,
          },
          tx,
        );
      }
      return created;
    });
    await linkPartyAfterCommit(input.tenantId, appt.id, input.customerName, phone); // CRM v2 C1.1 (C11)
    return { ok: true, id: appt.id };
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return { ok: false, reason: "ช่วงเวลานี้เพิ่งถูกจองไปแล้ว กรุณาเลือกเวลาอื่น" };
    }
    // ชน unique(tenantId, idempotencyKey) จากยิงพร้อมกัน key เดียวกัน → คืนนัดเดิม (idempotent)
    if (idem && (e as { code?: string }).code === "P2002") {
      const dup = await db.appointment.findFirst({ where: { idempotencyKey: idem } });
      if (dup) return { ok: true, id: dup.id };
    }
    throw e;
  }
}

// ── dashboard: รายการนัด ──
export async function listAppointments(tenantId: string, unitId: string, fromDateStr: string) {
  const db = tenantDb({ tenantId, unitId });
  const from = localToUtc(fromDateStr, 0);
  return db.appointment.findMany({
    where: { startAt: { gte: from }, status: { notIn: ["CANCELLED"] } },
    orderBy: { startAt: "asc" },
    include: { staff: true, service: true },
    take: 200,
  });
}

/**
 * contract C-2 ต่อ: นัดที่ค้างอยู่ในช่วงที่ช่างลา (อนุมัติแล้ว) — คืน id ของนัดที่ชน
 * 🔴 ไม่ยกเลิกนัดให้อัตโนมัติ: นัดที่รับลูกค้าไว้แล้วเป็นสัญญากับลูกค้า ร้านต้องเป็นคนตัดสิน
 *    (ระบบแค่บอกให้เห็นว่ามีนัดชน แล้วให้ร้านย้ายช่าง/เลื่อน/โทรแจ้งเอง)
 */
export async function appointmentsHitByLeave(
  tenantId: string,
  appts: { id: string; startAt: Date; staffId: string; staff: { id: string; employeeId: string | null } }[],
): Promise<Set<string>> {
  const byDate = new Map<string, typeof appts>();
  for (const a of appts) {
    // วันไทยของนัด (startAt เป็น UTC)
    const dateStr = new Date(a.startAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    byDate.set(dateStr, [...(byDate.get(dateStr) ?? []), a]);
  }
  const out = new Set<string>();
  for (const [dateStr, list] of byDate) {
    const onLeave = await staffOnLeave(
      tenantId,
      list.map((a) => a.staff),
      dateStr,
    );
    for (const a of list) if (onLeave.has(a.staffId)) out.add(a.id);
  }
  return out;
}

// SVC B.3 ▸ G5: ปลุกนัดกลับ — ช่วง [startAt, endAt) ของนัดนี้ซ้อนกับนัดอื่นของช่างเดียวกันที่ยังถือช่องไหม (กติกาซ้อนแบบ createAppointment) ◂
const REVIVE_CLASH_REASON = "ช่วงเวลานี้มีนัดอื่นของช่างคนนี้แล้ว — นำนัดกลับมาไม่ได้ กรุณาจองเวลาใหม่";
async function reviveClash(
  client: Pick<Prisma.TransactionClient, "appointment">,
  tenantId: string,
  appointmentId: string,
  a: { staffId: string; startAt: Date; endAt: Date },
): Promise<boolean> {
  const hit = await client.appointment.findFirst({
    where: {
      tenantId,
      staffId: a.staffId,
      id: { not: appointmentId },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      startAt: { lt: a.endAt },
      endAt: { gt: a.startAt },
    },
    select: { id: true },
  });
  return !!hit;
}

export async function setAppointmentStatus(
  tenantId: string,
  unitId: string,
  appointmentId: string,
  status: AppointmentStatus,
  opts?: { actorUserId?: string | null }, // POS P5.1 ▸ RC F10a (CD-P51-O10b): ผู้สั่ง (ลง audit ของ void บิลริบ) ◂
) {
  // 🔴 AUDIT M12: event ที่ทำให้ลูกค้า "ได้ของ" (ตราจากการมาตามนัด · แต้มโบนัส CHECKIN · journey · voucher)
  //    ต้องเขียนใน transaction เดียวกับการเปลี่ยนสถานะ (กติกา core/outbox.ts:69-72)
  //    ของเดิมยิงนอก tx: อัปเดตสถานะสำเร็จแล้วโปรเซสถูกตัด (แลมบ์ดาหมดเวลา/รีสตาร์ต) ก่อนยิง
  //    ⇒ ลูกค้ามาตามนัดจริงแต่ไม่ได้ตรา/แต้ม และไม่มีแถวค้างในคิวให้ใครตามเก็บเลย
  //    ขอบเขตร้าน/สาขายังถูกบังคับเหมือน tenantDb (ยัด tenantId/unitId ลง where ของ update ตรง ๆ)
  // POS P5.1 ▸ RC F4 (CD-P51-O10): ออกจาก NO_SHOW (→ สถานะอื่นใด) ⇒ บิลริบที่ยัง PAID + ไม่มีการคืน ถูก void ก่อน (ทาง voidSale เดิม · มัดจำกลับ OPEN ทันที) ·
  //   void ไม่ได้ = ไม่เปลี่ยนสถานะ + เหตุผลที่ระบุเลขบิลริบ (ไม่ออกจาก NO_SHOW เงียบ ๆ โดยบิลยังอยู่) ◂
  const before = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId, unitId },
    select: { status: true, depositSaleId: true, staffId: true, startAt: true, endAt: true, queueTicketId: true, policySnapshot: true },
  });
  // SVC B.4 ▸ J4: หน่วยแถวเดียว · ร้านถอย NO_SHOW/LATE กลับเป็นสถานะที่รอลูกค้า ⇒ จด `policySnapshot.job.manualHold = true` ใน CAS เดียวกัน
  //   ⇒ tick ไม่ตั้ง LATE/NO_SHOW ซ้ำ (และไม่ริบมัดจำซ้ำ) · เช็กอินไม่ติด TOO_LATE · ร้านเดิมไม่ถูกแตะ (เขียนเฉพาะหน่วยแถวเดียว) ◂
  const manualHoldSnap =
    !!before && (before.status === "NO_SHOW" || before.status === "LATE") && (status === "PENDING" || status === "CONFIRMED" || status === "ARRIVED")
    && !!(await (await import("./planner-run")).lineSettingsOf(tenantId, unitId))
      ? withManualHold(before.policySnapshot)
      : null;
  // SVC B.3 ▸ G5: ปลุกนัดที่ไม่ถือช่อง (CANCELLED/NO_SHOW) กลับเป็นสถานะที่ถือช่อง = วางนัดลงช่างใหม่ ⇒ ต้องกันซ้อนแบบเดียวกับการจอง
  //   ตรวจล่วงหน้าแบบไม่ล็อก (ก่อนคืนบิลริบ — ไม่คืนบิลแล้วค่อยมาปฏิเสธ) · ผลจริงตัดสินใต้ล็อกแถวช่างใน tx ด้านล่าง · ทางเปลี่ยนสถานะอื่นพฤติกรรมเดิม ◂
  const reviving =
    !!before && (before.status === "CANCELLED" || before.status === "NO_SHOW") && status !== "CANCELLED" && status !== "NO_SHOW";
  if (reviving && (await reviveClash(prisma, tenantId, appointmentId, before!))) {
    return { ok: false as const, reason: REVIVE_CLASH_REASON };
  }
  if (before?.status === "NO_SHOW" && status !== "NO_SHOW" && before.depositSaleId) {
    const u = await (await import("@/lib/modules/pos/deposit")).moduleUnforfeitDeposit({ tenantId, unitId, receiptSaleId: before.depositSaleId, actorUserId: opts?.actorUserId || "module:booking" });
    if (u.ok === false) return { ok: false as const, reason: u.message, unforfeit: true };
  }
  // SVC B.3 ▸ G7: ทุกทางเปลี่ยนสถานะ = compare-and-set จากสถานะที่อ่าน (`before.status`) — แพ้ (เช่น ร้านกดยืนยัน PENDING ขณะ minute-job ปล่อยช่องเป็น CANCELLED)
  //   ⇒ ok:false ไม่เขียนทับ · ไม่ยิง event · ไม่ริบมัดจำ (ริบทำหลัง commit เฉพาะเมื่อชนะ) ·
  //   คืนบิลริบ (ออกจาก NO_SHOW) เกิดก่อน tx: ถ้าแพ้ CAS ผู้ชนะต้องเป็นทางที่พาออกจาก NO_SHOW เช่นกัน (NO_SHOW→NO_SHOW ไม่แพ้ CAS) ⇒ บิลที่คืนสอดคล้องกับสถานะจริง ◂
  const LOST_RACE_REASON = "สถานะนัดเพิ่งถูกเปลี่ยนโดยรายการอื่น กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";
  if (!before) return { ok: false as const, reason: "ไม่พบนัด" };
  let reviveFail = null as string | null; // ตั้งใน callback ของ tx (กัน TS ตีบชนิดเป็น null)
  await prisma.$transaction(async (tx) => {
    if (reviving) {
      // SVC B.3 ▸ G5: ล็อกเดียวกับการจอง (BookingStaff FOR UPDATE) → ตรวจซ้อนกับนัดที่ถือช่อง (ยกเว้นตัวเอง) → CAS + ล้าง cancelReason ◂
      await tx.$queryRaw`SELECT id FROM "BookingStaff" WHERE id = ${before.staffId} FOR UPDATE`;
      if (await reviveClash(tx, tenantId, appointmentId, before)) {
        reviveFail = REVIVE_CLASH_REASON;
        return;
      }
    }
    const cas = await tx.appointment.updateMany({
      where: { id: appointmentId, tenantId, unitId, status: before.status },
      data: {
        ...(reviving ? { status, cancelReason: null } : { status }),
        ...(manualHoldSnap ? { policySnapshot: manualHoldSnap } : {}),
      },
    });
    if (cas.count === 0) {
      reviveFail = LOST_RACE_REASON;
      return;
    }
    const appt = await tx.appointment.findFirstOrThrow({ where: { id: appointmentId, tenantId, unitId } });
    // M2.3 (§9.2) — "มาแล้ว" คือเหตุการณ์ที่โมดูลอื่นรออยู่: สแตมป์ชนิด "จองที่มาจริง" · ขอรีวิว (M3.4) · journey
    // 🔴 event ใหม่ต้องมีครบ 3 ทะเบียน (consumer + AUTOMATION_EVENTS + WEBHOOK_EVENTS) ไม่งั้นคิวตันเงียบ ๆ
    // 🔴 idempotencyKey ผูกกับตัวนัด ⇒ กด "มาแล้ว" ซ้ำ/สลับสถานะไปกลับ ไม่ยิงซ้ำ (ตราไม่เบิ้ล)
    if (status === "DONE") {
      await emitOutbox(tx, {
        tenantId,
        unitId,
        type: "booking.completed",
        idempotencyKey: `booking.completed#${appointmentId}`,
        payload: {
          appointmentId,
          tenantId,
          unitId,
          customerId: appt.customerId,
          serviceId: appt.serviceId,
        },
      });
    }
    // M3.3 (§7.1) — "ไม่มาตามนัด" = ทริกเกอร์ของ journey "จองแล้วไม่มา" (ชวนนัดใหม่) · ครบ 3 ทะเบียนแล้ว
    // 🔴 idempotencyKey ผูกกับตัวนัดเหมือน booking.completed ⇒ กดสลับสถานะไปกลับไม่ยิงซ้ำ (voucher ไม่เบิ้ล)
    if (status === "NO_SHOW") {
      await emitNoShowTx(tx, { tenantId, unitId, appointmentId, customerId: appt.customerId, serviceId: appt.serviceId });
    }
    // SVC B.4 ▸ บัตรเดินตามงาน (ใบสั่ง §3.1 §3.4): งานที่มีบัตรคิว ⇒ บัตรเปลี่ยนใน tx เดียวกับ CAS ของงาน ·
    //   CANCELLED → CANCELLED(STAFF) · NO_SHOW → NO_SHOW · DONE → DONE (ไม่ยิง queue.served) · สถานะอื่น = บัตรคงเดิม ·
    //   บัตรไม่อยู่ในสถานะที่ย้ายได้ (จบ/ยกเลิกแล้ว) = ไม่ทำอะไร (งานยังเปลี่ยนตามที่สั่ง) ◂
    const move = status === "CANCELLED" ? "CANCELLED" : status === "NO_SHOW" ? "NO_SHOW" : status === "DONE" ? "DONE" : null;
    if (move && appt.queueTicketId) {
      await queue.moveTicketTx(tx, { tenantId, unitId }, appt.queueTicketId, move, {
        now: new Date(), actorType: "STAFF", actorId: opts?.actorUserId ?? null, cancelReason: "STAFF",
      });
    }
  });
  if (reviveFail) return { ok: false as const, reason: reviveFail };
  // SVC B.4 ▸ หน่วยแถวเดียว ⇒ วางคิวใหม่หลัง commit (runPlanner ตรวจโหมดเอง · ร้านเดิม = ran:false ไม่เขียน) · ล้ม = log ไม่ทำให้การเปลี่ยนสถานะล้ม ◂
  await replanAfterCommit(tenantId, unitId);
  // POS P5.1 ▸ MA12 (R1 F3 · CD-P51-O8a · ค่าปริยายระหว่าง W39 ยังเปิด): ไม่มาตามนัด = ริบมัดจำที่ยัง OPEN อัตโนมัติ หลัง commit สถานะ ·
  //   CANCELLED ไม่ริบ (O8b — มัดจำ OPEN ให้คนตัดสินที่หน้าบิล) · ล้ม = มัดจำยัง OPEN (log · ริบ/คืนที่หน้าบิลได้) · กดซ้ำ = คีย์เดิม ไม่มีบิลที่สอง ◂
  if (status === "NO_SHOW") {
    const f = await forfeitNoShowDeposit(tenantId, unitId, appointmentId);
    // POS P5.1 ▸ RC F5 (CD-P51-O10): ผลริบส่งถึง action (จอแสดงเหตุผล + logOps) · สถานะ NO_SHOW บันทึกแล้ว ◂
    return f.reason ? { ok: false as const, reason: f.reason, forfeit: f } : { ok: true as const, forfeit: f };
  }
  return { ok: true as const };
}

// POS P5.1 ▸ MA12 (R1 F3 · CD-P51-O8a): จุดเรียก createSale จุดเดียวของไฟล์นี้ (ทะเบียน U4/HT6.4/L2 = 1) — ใบรับมัดจำ (recordDeposit) กับ
//   บิลริบมัดจำ (NO_SHOW) ใช้ร่วมกัน · client = callerTx(tx) ของธุรกรรมใน pos/deposit (HT6.1) ◂
function bookingTxSale(tx: Prisma.TransactionClient, input: Parameters<typeof pos.createSale>[0]) {
  return pos.createSale(input, callerTx(tx));
}

/**
 * POS P5.1 ▸ MA12 (CD-P51-O8a): บิล "มัดจำริบ — ไม่มาตามนัด" (pos/deposit.moduleForfeitDeposit · ยอด = คงเหลือ · จ่ายด้วยแถว DEPOSIT อ้างใบรับ ⇒ รายได้ ·
 * มัดจำ USED · audit pos.deposit.forfeit) · ไม่มีมัดจำ/มัดจำแบบเดิม (ไม่มี PosDeposit)/ปิดแล้ว = ไม่ทำอะไร · ไม่โยนเข้าหาผู้เรียก ◂
 */
async function forfeitNoShowDeposit(tenantId: string, unitId: string, appointmentId: string): Promise<{ forfeited: boolean; saleId?: string; reason?: string }> {
  const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId, unitId }, select: { status: true, depositPaidAt: true, depositSaleId: true } });
  if (!appt || appt.status !== "NO_SHOW" || !appt.depositPaidAt || !appt.depositSaleId) return { forfeited: false };
  const posSystemId = await systemForUnit(tenantId, unitId, "POS");
  if (!posSystemId) return { forfeited: false };
  try {
    const r = await (await import("@/lib/modules/pos/deposit")).moduleForfeitDeposit(
      { tenantId, unitId, receiptSaleId: appt.depositSaleId, reason: "ไม่มาตามนัด", actorId: "module:booking" },
      (tx, p) => bookingTxSale(tx, { tenantId, unitId, systemId: posSystemId, sourceModule: "BOOKING", sourceId: appointmentId, ...p }),
    );
    if (r.ok === false) {
      if (r.code === "DEPOSIT_CLOSED") return { forfeited: false }; // ใช้/คืนไปแล้ว = ไม่มีอะไรให้ริบ (ไม่ใช่ความล้มเหลว) · POS P5.1 ▸ RC F5 ◂
      console.error(`[booking] ริบมัดจำนัด ${appointmentId} ไม่สำเร็จ: ${r.code}`);
      return { forfeited: false, reason: `ริบมัดจำไม่สำเร็จ: ${r.message} — ริบหรือคืนมัดจำที่หน้าบิล` };
    }
    return "legacy" in r ? { forfeited: false } : { forfeited: true, saleId: r.saleId };
  } catch (e) {
    console.error(`[booking] ริบมัดจำนัด ${appointmentId} ล้ม`, e);
    return { forfeited: false, reason: "ริบมัดจำไม่สำเร็จ — ริบหรือคืนมัดจำที่หน้าบิล" };
  }
}

// ═════════ SVC B.4 ▸ ทางร่วมของ "ไม่มาตามนัด" + วางคิวหลัง commit (ใบสั่ง svc-brief-b.4 §3.3 §3.4) ═════════
/** event `booking.no_show` — คีย์/payload เดียวกันทุกทาง (setAppointmentStatus · runLineTick) · ต้องเรียกใน tx เดียวกับ CAS ของสถานะ */
export async function emitNoShowTx(
  tx: Prisma.TransactionClient,
  a: { tenantId: string; unitId: string; appointmentId: string; customerId: string | null; serviceId: string },
): Promise<void> {
  await emitOutbox(tx, {
    tenantId: a.tenantId,
    unitId: a.unitId,
    type: "booking.no_show",
    idempotencyKey: `booking.no_show#${a.appointmentId}`,
    payload: {
      appointmentId: a.appointmentId,
      tenantId: a.tenantId,
      unitId: a.unitId,
      customerId: a.customerId,
      serviceId: a.serviceId,
    },
  });
}

/** J4: policySnapshot + job.manualHold (additive · คีย์อื่นคงเดิม) */
function withManualHold(snap: unknown): Prisma.InputJsonValue {
  const base = snap && typeof snap === "object" && !Array.isArray(snap) ? (snap as Record<string, unknown>) : {};
  const job = base.job && typeof base.job === "object" && !Array.isArray(base.job) ? (base.job as Record<string, unknown>) : {};
  return { ...base, job: { ...job, manualHold: true } } as unknown as Prisma.InputJsonValue;
}

/**
 * หลัง commit ของ NO_SHOW (ทาง tick): ริบมัดจำแบบเดียวกับ setAppointmentStatus — ไม่ throw ·
 * J4: idempotent ต่อนัด — นัดนี้เคยมีบิลริบของโมดูลจองแล้ว (สถานะใดก็ตาม · รวมที่ถูก void ตอนร้านถอยกลับ) ⇒ ไม่ริบซ้ำ
 */
export async function forfeitAfterNoShow(tenantId: string, unitId: string, appointmentId: string): Promise<{ forfeited: boolean; reason?: string }> {
  const prior = await prisma.posSale.findFirst({
    where: { tenantId, sourceModule: "BOOKING", sourceId: appointmentId, idempotencyKey: { startsWith: "dep-forfeit:" } },
    select: { id: true },
  });
  if (prior) return { forfeited: false };
  return forfeitNoShowDeposit(tenantId, unitId, appointmentId);
}

/** วางคิวใหม่ของหน่วยหลัง commit (โหลดตอนใช้ กันวงโหลด service ↔ planner-run) · ล้ม = log เท่านั้น */
export async function replanAfterCommit(tenantId: string, unitId: string, now?: Date): Promise<void> {
  try {
    await (await import("./planner-run")).runPlanner({ tenantId, unitId }, { now: now ?? new Date() });
  } catch (e) {
    console.error(`[booking] วางคิวใหม่ไม่สำเร็จ unit=${unitId}`, e instanceof Error ? e.message : e);
  }
}
// ◂ SVC B.4

// ── มัดจำ (WO Wave3-A: กัน no-show) ─────────────────────────────
// ตั้งมัดจำต่อบริการ (บาท→สตางค์เก็บที่ action) · 0 = ไม่ต้องมัดจำ
export async function setServiceDeposit(
  ctx: BookingCtx,
  serviceId: string,
  depositSatang: number,
): Promise<{ ok: boolean; reason?: string }> {
  if (!Number.isFinite(depositSatang) || depositSatang < 0) {
    return { ok: false, reason: "มัดจำต้องเป็นจำนวนเงินไม่ติดลบ" };
  }
  const db = tenantDb(ctx);
  const res = await db.bookingService.updateMany({
    where: { id: serviceId },
    data: { depositSatang: Math.round(depositSatang) },
  });
  if (res.count === 0) return { ok: false, reason: "ไม่พบบริการ" };
  return { ok: true };
}

// ร้านกดรับมัดจำ — เปิดบิล POS ชนิด DEPOSIT (ลงบัญชี Dr 2110 เงินมัดจำรับ) แล้วปั๊ม depositPaidAt
//   guard: นัดมีมัดจำ (depositSatang>0) + ยังไม่จ่าย (depositPaidAt=null)
//   idempotent: createSale ผูก key `booking-deposit-<appointmentId>` (ยิงซ้ำ = บิลเดิม ไม่เบิ้ล)
//               + claim อะตอมมิก depositPaidAt (race 2 คนกดพร้อมกัน → บันทึกเดียว)
//   ไม่ผูก POS → บันทึก depositPaidAt เฉย ๆ (standalone · saleId=null)
const DEPOSIT_NOT_OPEN_REASON = "นัดนี้ถูกยกเลิกหรือปล่อยช่องแล้ว รับมัดจำไม่ได้ — กรุณาจองนัดใหม่ก่อนรับเงิน";
export async function recordDeposit(
  ctx: BookingCtx,
  appointmentId: string,
  payMethod: PosPayType = "TRANSFER", // POS P5.1 ▸ MA14 (R1 F4 · CD-P51-O9): วิธีรับจริง · ฟอร์มไม่มีช่องวิธีรับ = TRANSFER (เดิม "DEPOSIT") ◂
): Promise<{ ok: boolean; reason?: string; saleId?: string; noop?: boolean }> {
  const db = tenantDb(ctx);
  const appt = await db.appointment.findFirst({
    where: { id: appointmentId },
    include: { service: true },
  });
  if (!appt) return { ok: false, reason: "ไม่พบนัด" };
  if (appt.depositSatang <= 0) return { ok: false, reason: "นัดนี้ไม่ต้องมัดจำ" };
  // จ่ายแล้วกดซ้ำ = no-op (idempotent) — ไม่เปิดบิลใหม่
  if (appt.depositPaidAt) {
    return { ok: true, noop: true, saleId: appt.depositSaleId ?? undefined };
  }
  // SVC B.3 ▸ G4: รับมัดจำได้เฉพาะนัดที่ยังถือช่อง (PENDING/CONFIRMED) — นัดยกเลิก/ปล่อยเพราะไม่จ่ายมัดจำ/ไม่มา/เสร็จ ⇒ ปฏิเสธก่อนเปิดบิล POS ◂
  if (appt.status !== "PENDING" && appt.status !== "CONFIRMED") {
    return { ok: false, reason: DEPOSIT_NOT_OPEN_REASON };
  }

  const amount = appt.depositSatang;

  // เปิดบิลมัดจำผ่าน POS (chokepoint เงิน) — idempotent · ไม่มี POS = ข้าม (บันทึก paidAt เฉย ๆ)
  let saleId: string | null = null;
  const posSystemId = await systemForUnit(ctx.tenantId, ctx.unitId, "POS");
  if (posSystemId) {
    // POS P5.1 ▸ MA2 MA4 (F2 F4): มัดจำ = ใบรับเงินมัดจำ POS_DEPOSIT (Cr 2110 · ไม่ใช่รายได้ · บรรทัดไม่ผูก serviceId) + PosDeposit ผ่าน
    //   pos/deposit.moduleTakeDeposit — createSale จุดเดิม (client = ธุรกรรมของใบรับ) · วิธีรับจริง (CD-P51-O9 · ค่าปริยาย TRANSFER · GL 1010) ·
    //   ใบรับของคีย์ถูกคืนแล้ว (ไม่ใช่ PAID) ⇒ รับใหม่ใช้คีย์ booking-deposit-<id>-r<n> (เดิม: ได้บิล VOIDED กลับมา · มัดจำ 0 บนสมุด) ◂
    const posDeposit = await import("@/lib/modules/pos/deposit");
    const sale = await posDeposit.moduleTakeDeposit(
      { tenantId: ctx.tenantId, unitId: ctx.unitId, systemId: posSystemId, keyBase: `booking-deposit-${appointmentId}`, amountSatang: amount, payType: payMethod, customerId: appt.customerId ?? null, customerName: appt.customerName ?? null, note: `มัดจำ ${appt.service.name}`, createdBy: "module:booking" },
      (tx, k) =>
        bookingTxSale(tx, {
          // POS P5.1 ▸ MA12: จุดเรียกเดิมย้ายเข้า bookingTxSale (ใช้ร่วมกับบิลริบ) · payload เดิมทุกช่อง ◂
          tenantId: ctx.tenantId,
          unitId: ctx.unitId,
          systemId: posSystemId,
          sourceModule: k.sourceModule,
          sourceId: k.sourceId,
          idempotencyKey: k.idempotencyKey,
          lines: [{ name: `มัดจำ ${appt.service.name}`, qty: 1, unitPriceSatang: amount }],
          payMethods: [{ type: k.payType, amountSatang: amount }],
        }),
    );
    saleId = sale.saleId;
  }

  // claim อะตอมมิก: ปั๊ม depositPaidAt เฉพาะแถวที่ยังไม่จ่าย (กัน 2 request แข่งกัน)
  //   SVC B.3 ▸ G4: + สถานะยังถือช่อง (PENDING/CONFIRMED) ในเงื่อนไข UPDATE เดียวกัน ⇒ แข่งกับ expireDepositHolds (UPDATE … depositPaidAt IS NULL)
  //   ได้ผลเดียว: claim ก่อน ⇒ ปล่อยไม่ได้ · ปล่อยก่อน ⇒ claim 0 แถว ⇒ คืนเงินบิลที่เพิ่งเปิด แล้วปฏิเสธ ◂
  const claim = await db.appointment.updateMany({
    where: { id: appointmentId, depositPaidAt: null, status: { in: ["PENDING", "CONFIRMED"] } },
    data: { depositPaidAt: new Date(), depositSaleId: saleId },
  });
  if (claim.count === 0) {
    const cur = await db.appointment.findFirst({ where: { id: appointmentId } });
    if (cur?.depositPaidAt) {
      // แพ้แข่ง (อีก request บันทึกไปแล้ว) — บิลเดียวกัน (idempotent) ไม่เบิ้ล
      return { ok: true, noop: true, saleId: cur.depositSaleId ?? undefined };
    }
    // SVC B.3 ▸ G4: นัดถูกยกเลิก/ปล่อยระหว่างเปิดบิล ⇒ คืนเงินใบรับที่เพิ่งเปิด (คีย์ผูกใบรับ · ลองซ้ำ = ใบคืนเดิม) แล้วปฏิเสธ ◂
    if (saleId) {
      const r = await (await import("@/lib/modules/pos/deposit")).moduleRefundDeposit({ tenantId: ctx.tenantId, unitId: ctx.unitId, receiptSaleId: saleId, reason: "นัดถูกยกเลิกระหว่างรับมัดจำ", actorId: "module:booking" });
      if (r.ok === false) return { ok: false, reason: `${DEPOSIT_NOT_OPEN_REASON} — คืนเงินใบรับอัตโนมัติไม่สำเร็จ กรุณาคืนที่หน้าบิล (${r.message})` };
      if (r.legacy) {
        // มัดจำแบบเดิม (ไม่มี PosDeposit) = void บิลทางเดิมแบบ refundDeposit
        const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: ctx.tenantId } });
        if (sale && sale.status === "PAID") await pos.voidSale(ctx.tenantId, ctx.unitId, saleId);
      }
    }
    return { ok: false, reason: DEPOSIT_NOT_OPEN_REASON };
  }
  return { ok: true, saleId: saleId ?? undefined };
}

// คืนมัดจำ (ยกเลิกนัด/ตามนโยบาย) — void บิลมัดจำ (กลับ Dr 2110) + เคลียร์ depositPaidAt
//   guard: จ่ายแล้วเท่านั้น (depositPaidAt≠null) · claim อะตอมมิก (double refund = no-op)
//   void เฉพาะบิลที่ยัง PAID (กัน void ซ้ำ) · ไม่ผูก POS = เคลียร์เฉย ๆ
export async function refundDeposit(
  ctx: BookingCtx,
  appointmentId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = tenantDb(ctx);
  const appt = await db.appointment.findFirst({ where: { id: appointmentId } });
  if (!appt) return { ok: false, reason: "ไม่พบนัด" };
  if (!appt.depositPaidAt) return { ok: false, reason: "นัดนี้ยังไม่ได้รับมัดจำ" };
  const saleId = appt.depositSaleId; // จับไว้ก่อน claim (จะถูกเคลียร์)

  // POS P5.1 ▸ MA4 (F4): มัดจำที่เป็นใบรับ POS_DEPOSIT (void ไม่ได้) = คืนเงินคงเหลือผ่าน pos/deposit.moduleRefundDeposit (ใบคืน CN · ใบรับ REFUNDED)
  //   ก่อนเคลียร์ flag — คืนไม่สำเร็จ (ใช้กับบิลแล้ว/กะ) = ไม่แตะนัด · คีย์ผูกใบรับ (ลองซ้ำ = ใบคืนเดิม) · มัดจำแบบเดิม (legacy) = void ทางเดิมด้านล่าง ◂
  let legacy = true;
  if (saleId) {
    const r = await (await import("@/lib/modules/pos/deposit")).moduleRefundDeposit({ tenantId: ctx.tenantId, unitId: ctx.unitId, receiptSaleId: saleId, reason: "คืนมัดจำนัดหมาย", actorId: "module:booking" });
    if (r.ok === false) return { ok: false, reason: r.code === "DEPOSIT_CLOSED" ? "มัดจำนี้ถูกใช้กับบิลหรือคืนไปแล้ว" : r.message };
    legacy = r.legacy;
  }

  // claim อะตอมมิก: เคลียร์ depositPaidAt เฉพาะแถวที่ยังจ่ายอยู่ (กันคืนซ้ำ)
  const claim = await db.appointment.updateMany({
    where: { id: appointmentId, depositPaidAt: { not: null }, depositSaleId: saleId }, // POS P5.1 ▸ MA4: + ใบรับที่คืนไป (กันเคลียร์มัดจำที่รับใหม่) ◂
    data: { depositPaidAt: null, depositSaleId: null },
  });
  if (claim.count === 0) return { ok: false, reason: "มัดจำนี้ถูกคืนไปแล้ว" };
  if (!legacy) return { ok: true };

  // กลับเส้นเงิน — void PosSale (เฉพาะบิลที่ยัง PAID) · voidSale เปิด tx เอง (ไม่ nested)
  if (saleId) {
    const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: ctx.tenantId } });
    if (sale && sale.status === "PAID") {
      await pos.voidSale(ctx.tenantId, ctx.unitId, saleId);
    }
  }
  return { ok: true };
}


// ─────────────────── วันหยุด/เวลาพิเศษรายวัน (11 ส.ค. 2026) ───────────────────
// เดิมตั้งได้แค่รายสัปดาห์ → ร้านปิดปีใหม่/สงกรานต์ หรือวันไหนเปิดสั้นกว่าปกติ ทำไม่ได้เลย
// กติกา: closure ของวันไหน "ทับ" เวลาทำการรายสัปดาห์ของวันนั้นเสมอ

export type ClosureRow = {
  id: string;
  date: string;
  closed: boolean;
  openMin: number | null;
  closeMin: number | null;
  note: string | null;
};

/** วันหยุด/เวลาพิเศษตั้งแต่วันที่ระบุเป็นต้นไป (ค่าเริ่มต้น = วันนี้) เรียงตามวัน */
export async function listClosures(
  ctx: BookingCtx,
  fromDate?: string,
  take = 60,
): Promise<ClosureRow[]> {
  // วันนี้ตามเวลาไทย (ไม่ import จาก pos — ข้ามโมดูล) — booking ใช้ +07:00 คงที่อยู่แล้วทั้งไฟล์
  const from = fromDate ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  return tenantDb(ctx).bookingClosure.findMany({
    where: { date: { gte: from } },
    orderBy: { date: "asc" },
    take,
    select: { id: true, date: true, closed: true, openMin: true, closeMin: true, note: true },
  });
}

/** ตั้ง/แก้วันหยุดของวันหนึ่ง — upsert ต่อ (unit, date) · กดซ้ำวันเดิมไม่งอกแถว */
export async function setClosure(
  ctx: BookingCtx,
  input: { date: string; closed: boolean; openMin?: number | null; closeMin?: number | null; note?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, reason: "รูปแบบวันไม่ถูกต้อง" };
  if (!input.closed) {
    const o = input.openMin ?? null;
    const c = input.closeMin ?? null;
    if (o == null || c == null) return { ok: false, reason: "เปิดเวลาพิเศษต้องระบุเวลาเปิด-ปิด" };
    if (o < 0 || c > 24 * 60 || c <= o) return { ok: false, reason: "เวลาปิดต้องหลังเวลาเปิด" };
  }
  const data = {
    closed: input.closed,
    openMin: input.closed ? null : (input.openMin ?? null),
    closeMin: input.closed ? null : (input.closeMin ?? null),
    note: input.note?.trim() || null,
  };
  const existing = await tenantDb(ctx).bookingClosure.findFirst({ where: { date: input.date } });
  if (existing) {
    await tenantDb(ctx).bookingClosure.updateMany({ where: { id: existing.id }, data });
  } else {
    await prisma.bookingClosure.create({
      data: { tenantId: ctx.tenantId, unitId: ctx.unitId, date: input.date, ...data },
    });
  }
  return { ok: true };
}

/** ลบวันหยุด (กลับไปใช้เวลาทำการรายสัปดาห์ตามปกติ) */
export async function removeClosure(ctx: BookingCtx, id: string): Promise<void> {
  await tenantDb(ctx).bookingClosure.deleteMany({ where: { id } });
}

// ───────── CRM v2 ใบ C1.1 (C11) — ผูก Party กลางให้ Appointment ─────────
// 🔴 เรียก "หลัง commit" เท่านั้น: รายการที่ล้ม (เต็ม/ชน/ไม่พบ) ต้องไม่ทิ้ง Party ของคนที่ไม่ได้เป็นลูกค้า (PDPA · เก็บเท่าที่จำเป็น)
//    และไม่ถือ connection ที่สองขณะ transaction ธุรกิจถือ lock อยู่
// 🔴 กุญแจต้องเชื่อถือได้: เบอร์ normalize ≥ 9 หลัก — ไม่งั้นไม่ผูก (party.findOrCreate สร้างใหม่ทุกครั้งเมื่อเบอร์ < 8 หลัก ⇒ Party ขยะ)
// 🔴 ไม่มีวัน throw เข้าหาผู้เรียก · ล้ม = ปล่อย partyId ว่างให้ backfill party-links เก็บตก
// AUDIT-CLASS X8: log แค่ชื่อตาราง + tenant ไม่มีเบอร์/อีเมล/ชื่อ
export async function linkPartyAfterCommit(tenantId: string, id: string, name: string | null | undefined, phone: string | null | undefined): Promise<void> {
  try {
    const phoneOk = normalizePartyPhone(phone).length >= 9;
    if (!phoneOk) return;
    const partyId = await safeFindOrCreate(tenantId, { name: name?.trim() || "ลูกค้าไม่ระบุชื่อ", phone: phoneOk ? phone : null });
    if (partyId) await prisma.appointment.updateMany({ where: { id, tenantId, partyId: null }, data: { partyId } });
    else console.warn(`[party-link] Appointment tenant=${tenantId}: ไม่ได้ partyId — ปล่อยว่าง`);
  } catch {
    console.warn(`[party-link] Appointment tenant=${tenantId}: ผูก Party ไม่สำเร็จ — ปล่อยว่าง`);
  }
}

// CRM C2.4 ▸ facade อ่านอย่างเดียว "นัดของ Party นี้" ให้ปฏิทิน CRM (มติผู้คุมงาน C2.4 ข้อ 8 · เส้น crm→booking ใน ALLOWED_EDGES)
//   🔴 อ่านอย่างเดียวจริง ๆ — ไม่มีคำสั่งเขียนในบล็อกนี้ (ข้อสอบ C2.4-S4.3 เทียบแถวก่อน/หลังแบบไบต์ต่อไบต์)
//   🔴 AUDIT-CLASS X1: ผูก `tenantId` ของผู้เรียกทุกคิวรี ⇒ แถวของร้านอื่นที่เผลอชี้ Party เดียวกันไม่มีวันหลุดออกไป
//      และกรองสาขาตามที่ผู้เรียกส่งมา (`unitIds` = ขอบเขตสาขาของผู้ดู · `"*"` = ทุกสาขา)
//   🔴 AUDIT-CLASS X8: คืนแค่ id · เวลา · ชื่อบริการ · สถานะ — **ไม่มี** `customerName` / `customerPhone` / `note` / ราคา
//   รูปข้อมูลนี้ต้องตรงกับ `PartyAppointment` ใน `src/lib/modules/crm/activities-shared.ts` (ประกาศซ้ำที่นี่โดยเจตนา:
//   โมดูลจอง **ห้าม** import ชนิดจาก crm ซึ่งจะเป็นเส้น booking→crm ที่ไม่มีใน ALLOWED_EDGES)
export type PartyAppointmentRow = {
  source: "BOOKING";
  id: string;
  partyId: string;
  unitId: string;
  startAt: Date;
  endAt: Date | null;
  title: string;
  status: string;
};

/**
 * ใบ C2.4 รอบ 2 (F5): `partyIds` รับ `null` = **ทุก Party ในหน้าต่างเวลานี้** (ผู้เรียกกรองด้วยการมองเห็นทีหลัง)
 * 🔴 ทำไมต้องมีทาง `null`: ของเดิมผู้เรียกต้องส่งรายชื่อ Party มาก่อน ⇒ ปฏิทิน CRM ต้องหยิบผู้ติดต่อ 1,000 คนแรกมาทำรายชื่อ
 *    ร้านที่มีลูกค้า 5,000 คนจะไม่เห็นนัดของลูกค้าคนที่ 1,001 ขึ้นไป **เงียบ ๆ** (นัดพรุ่งนี้หายจากปฏิทิน)
 *    ⇒ ทางที่ถูกคือ "ถามช่วงเวลาก่อน แล้วค่อยตัดด้วยการมองเห็น" — เพดานอยู่ที่จำนวนแถวที่ตอบ (`opts.take`) ไม่ใช่จำนวนลูกค้า
 * `partyIds = []` (อาร์เรย์ว่าง) = ไม่มีอะไรให้ถาม ⇒ คืน [] เหมือนเดิม
 */
export async function appointmentsByParty(
  tenantId: string,
  partyIds: string[] | null | undefined,
  range: { from: Date; to: Date },
  opts?: { unitIds?: string[] | "*"; take?: number },
): Promise<PartyAppointmentRow[]> {
  const all = partyIds === null || partyIds === undefined;
  const ids = all ? [] : [...new Set(partyIds.filter((x): x is string => typeof x === "string" && !!x))];
  if (!tenantId || (!all && ids.length === 0)) return [];
  const units = opts?.unitIds;
  if (Array.isArray(units) && units.length === 0) return [];
  const take = Math.min(Math.max(Math.round(Number(opts?.take ?? 500) || 500), 1), 5_000);
  const rows = await prisma.appointment.findMany({
    where: {
      tenantId,
      ...(all ? { partyId: { not: null } } : { partyId: { in: ids } }),
      status: { not: "CANCELLED" },
      startAt: { gte: range.from, lt: range.to },
      ...(Array.isArray(units) ? { unitId: { in: units } } : {}),
    },
    select: { id: true, unitId: true, partyId: true, startAt: true, endAt: true, status: true, service: { select: { name: true } } },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take,
  });
  return rows
    .filter((r): r is typeof r & { partyId: string } => !!r.partyId)
    .map((r) => ({
      source: "BOOKING" as const,
      id: r.id,
      partyId: r.partyId,
      unitId: r.unitId,
      startAt: r.startAt,
      endAt: r.endAt,
      title: r.service?.name?.trim() || "นัดบริการ",
      status: r.status,
    }));
}
// ◂ CRM C2.4

// ═════════ SVC B.3 ▸ หาเวลาว่าง v2 + จองแบบมีกติกา (ใบสั่ง svc-brief-b.3 §3.2–§3.3) ═════════
// ทางใหม่ของ "ลูกค้าจองเอง" (ONLINE/LINE = SELF) + "ร้านจองให้" (STAFF/PHONE) · getAvailableSlots/createAppointment รุ่นแรกไม่แตะ (§6 ข้อ 2)
// กติกาออนไลน์ (horizon · lead · กริด · หน้าต่าง · % ออนไลน์ · งานสูงสุด/วัน · พักขั้นต่ำ · เพดานต่อเบอร์ · ใครก็ได้ · bookable ·
//   ร้านยืนยันก่อน · ถือช่องมัดจำ) ใช้กับ SELF เท่านั้น · ร้านจองให้ = รุ่นแรก (ห้ามซ้อน · ลา · ทำบริการได้ · ไม่ใช่อดีต)
// 🔴 กันจองซ้อนบังคับที่ฐาน (ข้ามโพรเซส): ใน $transaction เดียว ล็อกตามลำดับคงที่
//      ① เบอร์ (pg_advisory_xact_lock · เฉพาะ SELF ที่มีเพดานต่อเบอร์) → ② แถว "BookingStaff" FOR UPDATE ทีละคนตามลำดับ sortOrder → createdAt → id
//    ล็อก ② = ล็อกเดียวกับ createAppointment รุ่นแรก ⇒ สองทางผสมกันก็ไม่ซ้อน · ตัวนับทุกตัว (ซ้อน · % ออนไลน์ · งานสูงสุด · เบอร์) ตรวจใหม่ใต้ล็อก
//    ไม่มี NOWAIT — คำขอที่ชนกันเข้าแถวรอ (BOOK_TX ให้เวลาพอ 10 คำขอพร้อมกัน) แล้วได้คำตอบจริง (เต็ม/สำเร็จ) ไม่ throw
// 🔴 เวลาไทยผ่าน localToUtc · วันนี้(ไทย) = Date.now() + 7 ชม. (ไม่ใช้นาฬิกาท้องถิ่นของเครื่อง)

export type BookingChannel = "ONLINE" | "LINE" | "STAFF" | "PHONE";
export type BookInput = {
  serviceId: string;
  staffId: string | null;
  dateStr: string;
  startMin: number;
  channel: BookingChannel;
  customerName: string;
  customerPhone: string;
  note?: string;
  idempotencyKey?: string;
};
export type BookFailCode =
  | "FULL" | "PAST" | "LEAD_TIME" | "BEYOND_HORIZON" | "OFF_GRID" | "OUTSIDE_HOURS" | "PHONE_LIMIT"
  | "NOT_QUALIFIED" | "ON_LEAVE" | "NOT_FOUND" | "ANY_DISABLED" | "BAD_INPUT"
  | "RELEASED"; // G3: ส่งซ้ำด้วย key เดิมแต่นัดถูกยกเลิก/ปล่อยแล้ว
export type BookResult =
  | { ok: true; id: string; staffId: string; status: "PENDING" | "CONFIRMED"; holdUntil: Date | null }
  | { ok: false; code: BookFailCode; reason: string };

const B3_CHANNELS: readonly BookingChannel[] = ["ONLINE", "LINE", "STAFF", "PHONE"];
const isSelfChannel = (c: BookingChannel): boolean => c === "ONLINE" || c === "LINE";
const B3_MIN_MS = 60_000;
const B3_DAY_MS = 24 * 60 * B3_MIN_MS;
/** ข้อความเดียวของ "เต็ม" ทุกกรณี (ชน · % ออนไลน์ · งานสูงสุด · ช่าง 0%) — ไม่บอกว่ากันไว้ให้ walk-in (§4.3) */
const FULL_REASON = "ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น";
const B3_UNIT_KEYS = [
  "booking.booking.horizonDays",
  "booking.booking.minLeadMin",
  "booking.booking.slotStepMin",
  "booking.booking.anyStaffOption",
  "booking.booking.maxOpenPerPhone",
];
/**
 * ธุรกรรมจอง: maxWait = รอ connection จาก pool · timeout = ทั้งธุรกรรม "รวมเวลารอล็อก" —
 * คำขอที่ 10 ของช่างเดียวกันรออีก 9 ธุรกรรมจบก่อน (ใครก็ได้: คำขอหลังถือช่างก่อนหน้าระหว่างลองคนถัดไป) ⇒ เผื่อกว้าง
 */
const BOOK_TX = { maxWait: 20_000, timeout: 30_000 } as const; // G2: ≤ 20s / ≤ 30s (ไม่มี connection ที่สองใต้ล็อกแล้ว ⇒ คิว 20 ทางจบในไม่กี่วินาที)

type UnitRules = { horizonDays: number; minLeadMin: number; stepMin: number; anyStaff: boolean; maxOpenPerPhone: number | null };

/** ค่าตั้งระดับสาขา(+บริการ) — อ่านผ่าน resolver ทุกคำขอ (ไม่แคช) · ค่าหาย ⇒ ค่ารุ่นแรก */
async function unitRulesOf(ctx: { tenantId: string; unitId: string }, serviceId: string): Promise<UnitRules> {
  const r = await resolveSettings({ tenantId: ctx.tenantId }, B3_UNIT_KEYS, { unitId: ctx.unitId, serviceId });
  const num = (k: string, d: number): number => {
    const v = r[k]?.value;
    return typeof v === "number" && Number.isFinite(v) ? v : d;
  };
  const step = num("booking.booking.slotStepMin", 15);
  const cap = r["booking.booking.maxOpenPerPhone"]?.value;
  return {
    horizonDays: num("booking.booking.horizonDays", 14),
    minLeadMin: num("booking.booking.minLeadMin", 0),
    stepMin: step > 0 ? Math.floor(step) : 15,
    anyStaff: r["booking.booking.anyStaffOption"]?.value !== false,
    maxOpenPerPhone: typeof cap === "number" && Number.isFinite(cap) ? cap : null,
  };
}

/** "YYYY-MM-DD" ของวันไทย ณ epoch ms */
function bkkDateStrAt(ms: number): string {
  return new Date(ms + BKK_OFFSET_MIN * B3_MIN_MS).toISOString().slice(0, 10);
}
function addDaysToDateStr(ds: string, n: number): string {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** ผู้ให้บริการที่ "ทำบริการนี้ได้" ในวันนั้น (เรียง sortOrder → createdAt → id ตาม staffDayProfiles) */
type B3Cand = {
  staffId: string;
  name: string;
  onLeave: boolean;
  windows: MinWindow[];
  durationMin: number;
  priceSatang: number;
  minBreakMin: number;
  onlineSharePct: number;
  maxJobsPerDay: number | null;
};
function candOf(p: StaffDayProfile, service: { id: string; durationMin: number; priceSatang: number }): B3Cand | null {
  const terms = staffServiceTerms(p.services, service);
  if (!terms) return null;
  return {
    staffId: p.staffId,
    name: p.name,
    onLeave: p.onLeave,
    windows: p.windows,
    durationMin: terms.durationMin,
    priceSatang: terms.priceSatang,
    minBreakMin: p.minBreakMin,
    onlineSharePct: p.onlineSharePct,
    maxJobsPerDay: p.maxJobsPerDay,
  };
}

/** นัดที่ "ถือช่อง" (ทุกสถานะยกเว้น CANCELLED/NO_SHOW) ของช่าง รอบวันนั้น ±1 วัน (+ bufferMin ของนัดนั้น)
 *  SVC B.4 ▸ หนี้ B.3: buffer = `policySnapshot.job.bufferMin` (จดตอนจอง) ก่อน · แถวเก่าไม่มี = buffer ปัจจุบันของบริการ ◂ */
type BusyRow = { staffId: string; startAt: Date; endAt: Date; channel: string | null; source: string; bufferMin: number };
async function busyRowsOf(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  tenantId: string,
  staffIds: string[],
  dateStr: string,
): Promise<BusyRow[]> {
  if (!staffIds.length) return [];
  const lo = new Date(localToUtc(dateStr, 0).getTime() - B3_DAY_MS);
  const hi = new Date(localToUtc(dateStr, 24 * 60).getTime() + B3_DAY_MS);
  // SVC B.4 ▸ J5: งานที่มาแล้ว/กำลังทำ (ARRIVED · IN_SERVICE) ถือช่องจริงถึง max(endAt, ตอนนี้, เวลาตามแผน + ความยาว, เริ่มจริง + ความยาว) —
  //   มาสายแล้วเข้าแถวแบบ walk-in / งานเลยเวลา ⇒ จองทับไม่ได้ · สถานะอื่น endAt เดิมทุกไบต์ ◂
  const nowAt = new Date(Date.now());
  return client.$queryRaw<BusyRow[]>`
    SELECT b."staffId", b."startAt", b."endAt", b."channel", b."source", b."bufferMin" FROM (
      SELECT a."staffId", a."startAt",
        CASE WHEN a."status" IN ('ARRIVED', 'IN_SERVICE')
             THEN GREATEST(a."endAt", ${nowAt}::timestamp,
                           COALESCE(a."plannedStartAt", a."startAt") + (a."endAt" - a."startAt"),
                           COALESCE(a."startedAt", a."startAt") + (a."endAt" - a."startAt"))
             ELSE a."endAt" END AS "endAt",
        a."channel", a."source",
        COALESCE(CASE WHEN jsonb_typeof(a."policySnapshot" -> 'job' -> 'bufferMin') = 'number'
                      THEN round((a."policySnapshot" -> 'job' ->> 'bufferMin')::numeric)::int END,
                 s."bufferMin", 0)::int AS "bufferMin"
      FROM "Appointment" a
      LEFT JOIN "BookingService" s ON s."id" = a."serviceId"
      WHERE a."tenantId" = ${tenantId}
        AND a."staffId" = ANY(${staffIds}::text[])
        AND a."status" NOT IN ('CANCELLED', 'NO_SHOW')
        AND a."startAt" < ${hi}
        -- N2: ขอบล่างเดิมของ B.3 กลับมา (ผลเท่าเดิม: สถานะอื่น endAt จริง = endAt · ARRIVED/IN_SERVICE ปลายอาจเลย endAt จึงผ่านเสมอแล้วกรองชั้นนอก)
        AND (a."endAt" > ${lo} OR a."status" IN ('ARRIVED', 'IN_SERVICE'))
    ) b
    WHERE b."endAt" > ${lo}`;
}

/** แถวนี้มาจากลูกค้าจองเองไหม (แถวรุ่นแรก channel=null นับเมื่อ source='ONLINE' · §6 ข้อ 3) */
const isSelfRow = (r: { channel: string | null; source: string }): boolean =>
  r.channel === "ONLINE" || r.channel === "LINE" || (r.channel === null && r.source === "ONLINE");

type DayLoad = { selfMin: number; jobs: number };
/** ตัวนับของวันไทยนั้น (นัดที่เริ่มในวัน): นาทีของนัด SELF (endAt−startAt รวม buffer · §6 ข้อ 4) · จำนวนงานทุกช่องทาง */
function dayLoadOf(rows: readonly BusyRow[], staffId: string, dateStr: string): DayLoad {
  const d0 = localToUtc(dateStr, 0).getTime();
  const d1 = localToUtc(dateStr, 24 * 60).getTime();
  let selfMin = 0;
  let jobs = 0;
  for (const r of rows) {
    if (r.staffId !== staffId) continue;
    const s = r.startAt.getTime();
    if (s < d0 || s >= d1) continue;
    jobs++;
    if (isSelfRow(r)) selfMin += (r.endAt.getTime() - s) / B3_MIN_MS;
  }
  return { selfMin, jobs };
}

/** SELF: % ออนไลน์ + งานสูงสุด/วัน ของช่าง (block = dur + buf ของงานใหม่) */
function selfQuotaOk(c: B3Cand, load: DayLoad, blockMin: number): boolean {
  if (!(c.onlineSharePct > 0)) return false; // 0% ⇒ ไม่โผล่/เต็มเสมอ
  if (c.maxJobsPerDay !== null && load.jobs >= c.maxJobsPerDay) return false;
  const workMin = c.windows.reduce((s, w) => s + (w.endMin - w.startMin), 0);
  const cap = Math.floor((c.onlineSharePct * workMin) / 100);
  return load.selfMin + blockMin <= cap;
}

/**
 * ช่อง t ว่างไหมเมื่อเทียบนัดที่ถือช่อง ·
 * STAFF/PHONE = ไม่ซ้อนช่วง [t, t+dur+buf) กับ [start, end) (รุ่นแรก) ·
 * SELF = พักขั้นต่ำแบบค่ามาก (B.2 §7 ข้อ 4): t+dur+max(buf,m) ≤ x.start หรือ t ≥ x.end − x.buf + max(x.buf, m)
 */
function slotClear(
  dateStr: string,
  t: number,
  c: B3Cand,
  bufMin: number,
  rows: readonly BusyRow[],
  self: boolean,
): boolean {
  const s = localToUtc(dateStr, t).getTime();
  const m = self ? Math.max(0, c.minBreakMin) : 0;
  for (const x of rows) {
    if (x.staffId !== c.staffId) continue;
    const xs = x.startAt.getTime();
    const xe = x.endAt.getTime();
    if (!self) {
      if (s < xe && s + (c.durationMin + bufMin) * B3_MIN_MS > xs) return false;
      continue;
    }
    const before = s + (c.durationMin + Math.max(bufMin, m)) * B3_MIN_MS <= xs;
    const after = s >= xe - x.bufferMin * B3_MIN_MS + Math.max(x.bufferMin, m) * B3_MIN_MS;
    if (!before && !after) return false;
  }
  return true;
}

/** ช่วง [t, t+dur] อยู่ในหน้าต่างใดหน้าต่างหนึ่ง (buffer เลยปิดได้ = รุ่นแรก) */
const inWindows = (ws: readonly MinWindow[], t: number, dur: number): boolean =>
  ws.some((w) => t >= w.startMin && t + dur <= w.endMin);

/** เวลาเริ่มขั้นต่ำ (epoch ms · รวม) ตามช่องทาง: STAFF/PHONE > now · SELF ≥ now + lead และ > now */
const earliestOk = (startMs: number, nowMs: number, self: boolean, leadMin: number): boolean =>
  startMs > nowMs && (!self || startMs >= nowMs + leadMin * B3_MIN_MS);

/** ช่องเวลาตามกติกา (ใบสั่ง §3.2 "ช่องเวลา") · SlotOption เรียง startMin ไม่ซ้ำ · ใครก็ได้ = ช่างแรกตามลำดับที่ว่าง */
export async function findSlots(
  ctx: BookingCtx,
  q: { serviceId: string; staffId: string | null; dateStr: string; channel: BookingChannel },
): Promise<SlotOption[]> {
  const { tenantId, unitId } = ctx;
  if (!q || !B3_CHANNELS.includes(q.channel) || typeof q.dateStr !== "string" || !isRealDateStr(q.dateStr)) return [];
  if (typeof q.serviceId !== "string" || (q.staffId !== null && typeof q.staffId !== "string")) return [];
  const self = isSelfChannel(q.channel);
  const db = tenantDb({ tenantId, unitId });
  const service = await db.bookingService.findFirst({ where: { id: q.serviceId, active: true } });
  if (!service || (self && !service.bookable)) return [];
  const rules = await unitRulesOf(ctx, service.id);
  if (self && q.staffId === null && !rules.anyStaff) return [];
  const nowMs = Date.now();
  if (self && q.dateStr > addDaysToDateStr(bkkDateStrAt(nowMs), rules.horizonDays - 1)) return [];

  const profiles = await staffDayProfiles({ tenantId, unitId }, q.dateStr, q.staffId ? { staffIds: [q.staffId] } : undefined);
  const cands = profiles.flatMap((p) => {
    if (p.windows.length === 0) return [];
    const c = candOf(p, service);
    return c ? [c] : [];
  });
  if (cands.length === 0) return [];
  const rows = await busyRowsOf(prisma, tenantId, cands.map((c) => c.staffId), q.dateStr);

  const step = rules.stepMin;
  const byTime = new Map<number, string>();
  for (const c of cands) {
    if (self && !selfQuotaOk(c, dayLoadOf(rows, c.staffId, q.dateStr), c.durationMin + service.bufferMin)) continue;
    for (const w of c.windows) {
      for (let t = Math.ceil(w.startMin / step) * step; t + c.durationMin <= w.endMin; t += step) {
        if (byTime.has(t)) continue;
        if (!earliestOk(localToUtc(q.dateStr, t).getTime(), nowMs, self, rules.minLeadMin)) continue;
        if (!slotClear(q.dateStr, t, c, service.bufferMin, rows, self)) continue;
        byTime.set(t, c.staffId);
      }
    }
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startMin, sid]) => ({ startMin, hhmm: minutesToHHMM(startMin), staffId: sid }));
}

type PolicySnap = { values?: Record<string, unknown> } & Record<string, unknown>;
const snapVal = (snap: unknown, key: string): unknown =>
  snap && typeof snap === "object" ? (snap as PolicySnap).values?.[key] : undefined;

/** ถือช่องมัดจำ (§3.2 ข้อ 9): SELF · method ≠ NONE · มัดจำ > 0 · payWithinMin เป็นตัวเลข ⇒ นาทีที่ต้องจ่าย · อื่น ⇒ null */
function holdMinutesOf(channel: string | null, depositSatang: number, snap: unknown): number | null {
  if (channel !== "ONLINE" && channel !== "LINE") return null;
  const method = snapVal(snap, "booking.deposit.method");
  const within = snapVal(snap, "booking.deposit.payWithinMin");
  if (typeof method !== "string" || method === "NONE") return null;
  if (!(depositSatang > 0)) return null;
  return typeof within === "number" && Number.isFinite(within) ? within : null;
}

type ApptLite = {
  id: string;
  unitId: string;
  staffId: string;
  serviceId: string;
  startAt: Date;
  customerPhone: string;
  assignMode: string;
  status: AppointmentStatus;
  channel: string | null;
  depositSatang: number;
  depositPaidAt: Date | null;
  createdAt: Date;
  policySnapshot: unknown;
};
const APPT_LITE = {
  id: true, unitId: true, staffId: true, serviceId: true, startAt: true, customerPhone: true, assignMode: true,
  status: true, channel: true, depositSatang: true, depositPaidAt: true, createdAt: true, policySnapshot: true,
} as const;

/**
 * G6 ▸ คีย์เบอร์ของระบบจอง (เพดานต่อเบอร์ + ล็อกเบอร์) — ไม่ใช้ normalizePartyPhone ตรง ๆ เพราะตัวนั้นให้ `0066 81…` ⇒ `81…` (ไม่มี 0)
 *   ตัวเลขล้วน → ตัดรหัสประเทศ `0066` หรือ `66` (ครั้งเดียว) → ไม่ขึ้นต้น 0 ⇒ เติม 0 · ว่าง ⇒ "" · ต้องเท่ากับ SQL ใน openCountForPhone ทุกกรณี
 *   (+66 81…, 66 81…, 0066 81…, 0066 081…, 66-0-81… ⇒ 081…) · ผลเหลือ "" หรือ "0" ⇒ ผู้เรียกตอบ BAD_INPUT
 */
export function bookingPhoneKey(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/[^0-9]/g, "");
  if (d.startsWith("0066")) d = d.slice(4);
  else if (d.startsWith("66")) d = d.slice(2);
  if (!d) return "";
  return d.startsWith("0") ? d : `0${d}`;
}

const PHONE_LIMIT_REASON = "เบอร์นี้มีนัดที่ยังไม่ถึงเวลาครบจำนวนที่ร้านรับต่อเบอร์แล้ว";
const RELEASED_REASON = "การจองนี้ถูกยกเลิกแล้ว (เช่น ไม่ได้ชำระมัดจำในเวลา) กรุณาเลือกเวลาแล้วจองใหม่";
const BAD_INPUT_REASON = "ข้อมูลการจองไม่ครบหรือไม่ถูกต้อง กรุณาลองใหม่";

/**
 * ผลของ key ที่เคยสร้างนัดแล้ว (G1 G3 · ใช้ทั้งทางก่อน tx · ใต้ล็อก key · ทาง P2002)
 *   สาขาอื่น ⇒ BAD_INPUT (ไม่คืน id ข้ามสาขา) · ข้อมูลจองต่าง (บริการ/ช่างหรือใครก็ได้/วันเวลา/เบอร์) ⇒ BAD_INPUT ·
 *   แถวไม่ถือช่องแล้ว (CANCELLED/NO_SHOW — รวมปล่อยเพราะมัดจำ) ⇒ RELEASED · อื่น ⇒ ok แถวเดิม
 */
function replayOf(r: ApptLite, want: { unitId: string; serviceId: string; staffId: string | null; startAtMs: number | null; phoneKey: string }): BookResult {
  const same =
    r.unitId === want.unitId &&
    r.serviceId === want.serviceId &&
    (want.staffId === null ? r.assignMode === "ANY" : r.assignMode !== "ANY" && r.staffId === want.staffId) &&
    want.startAtMs !== null && r.startAt.getTime() === want.startAtMs &&
    bookingPhoneKey(r.customerPhone) === want.phoneKey;
  if (!same) return { ok: false, code: "BAD_INPUT", reason: BAD_INPUT_REASON };
  if (r.status === "CANCELLED" || r.status === "NO_SHOW") return { ok: false, code: "RELEASED", reason: RELEASED_REASON };
  const hold = holdMinutesOf(r.channel, r.depositSatang, r.policySnapshot);
  const holding = hold !== null && r.status === "PENDING" && r.depositPaidAt === null;
  return {
    ok: true,
    id: r.id,
    staffId: r.staffId,
    status: r.status === "PENDING" ? "PENDING" : "CONFIRMED",
    holdUntil: holding ? new Date(r.createdAt.getTime() + hold * B3_MIN_MS) : null,
  };
}

/** นัดค้างของเบอร์ในสาขา (PENDING/CONFIRMED · ยังไม่ถึงเวลา · ทุกช่องทาง) — เทียบด้วย bookingPhoneKey ฉบับ SQL (G6) */
async function openCountForPhone(tx: Pick<Prisma.TransactionClient, "$queryRaw">, tenantId: string, unitId: string, key: string, now: Date): Promise<number> {
  const [r] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "Appointment" a
    CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(a."customerPhone", ''), '[^0-9]', '', 'g') AS d1) p1
    CROSS JOIN LATERAL (SELECT CASE WHEN p1.d1 LIKE '0066%' THEN substr(p1.d1, 5)
                                    WHEN p1.d1 LIKE '66%' THEN substr(p1.d1, 3)
                                    ELSE p1.d1 END AS d2) p2
    WHERE a."tenantId" = ${tenantId} AND a."unitId" = ${unitId}
      AND a."status" IN ('PENDING', 'CONFIRMED') AND a."startAt" > ${now}
      AND (CASE WHEN p2.d2 = '' THEN '' WHEN p2.d2 LIKE '0%' THEN p2.d2 ELSE '0' || p2.d2 END) = ${key}`;
  return r?.n ?? 0;
}

const isP2002 = (e: unknown): boolean => (e as { code?: string } | null)?.code === "P2002";

/**
 * G2 ▸ หา/สร้างลูกค้าสมาชิก (+ Party ภายใน member) **นอกธุรกรรมจอง** — ธุรกรรมที่ถือล็อกช่างห้ามขอ connection ที่สอง ·
 *   ชน unique(memberSystemId, phone) จากคำขอพร้อมกัน ⇒ อ่านแถวผู้ชนะ (findOrCreate รอบสองเจอแถวแล้ว) · ล้มซ้ำ ⇒ throw ตามจริง
 */
async function memberCustomerIdFor(i: { tenantId: string; memberSystemId: string; phone: string; name: string; self: boolean }): Promise<string> {
  const input = { tenantId: i.tenantId, memberSystemId: i.memberSystemId, phone: i.phone, name: i.name, source: i.self ? ("SELF" as const) : ("STAFF" as const) };
  for (let attempt = 0; ; attempt++) {
    try {
      return (await member.findOrCreate(input)).id;
    } catch (e) {
      if (!isP2002(e) || attempt >= 2) throw e;
    }
  }
}

/** จองตามกติกา (ใบสั่ง §3.2 bookAppointment) — ตรวจตามลำดับ คืนรหัสแรกที่ล้ม · ไม่ throw ในทางปกติ (รวมยิงพร้อมกัน) */
export async function bookAppointment(ctx: BookingCtx, i: BookInput): Promise<BookResult> {
  const fail = (code: BookFailCode, reason: string): BookResult => ({ ok: false, code, reason });
  const BAD = BAD_INPUT_REASON;
  const { tenantId, unitId } = ctx;
  if (!i || typeof i !== "object" || !B3_CHANNELS.includes(i.channel)) return fail("BAD_INPUT", BAD);
  if (typeof i.serviceId !== "string" || (i.staffId !== null && typeof i.staffId !== "string")) return fail("BAD_INPUT", BAD);
  const self = isSelfChannel(i.channel);
  const db = tenantDb({ tenantId, unitId });
  const idem = typeof i.idempotencyKey === "string" ? i.idempotencyKey.trim() || null : null;
  const name = typeof i.customerName === "string" ? i.customerName.trim() : "";
  const phone = typeof i.customerPhone === "string" ? i.customerPhone.trim() : "";
  const phoneKey = bookingPhoneKey(phone);
  const dateOk = typeof i.dateStr === "string" && isRealDateStr(i.dateStr) && Number.isInteger(i.startMin) && i.startMin >= 0 && i.startMin < 24 * 60;
  const want = { unitId, serviceId: i.serviceId, staffId: i.staffId, startAtMs: dateOk ? localToUtc(i.dateStr, i.startMin).getTime() : null, phoneKey };

  // ⑥ idempotency (ลำดับ): key เคยสร้างนัดแล้ว ⇒ replayOf (ไม่ติดเพดานใด)
  if (idem) {
    const prior = await prisma.appointment.findFirst({ where: { tenantId, idempotencyKey: idem }, select: APPT_LITE });
    if (prior) return replayOf(prior, want);
  }

  // ① บริการ/ช่าง/ใครก็ได้/รูปข้อมูล
  const service = await db.bookingService.findFirst({ where: { id: i.serviceId, active: true } });
  if (!service || (self && !service.bookable)) return fail("NOT_FOUND", "ไม่พบบริการที่เลือก");
  if (i.staffId !== null) {
    const st = await db.bookingStaff.findFirst({ where: { id: i.staffId, active: true }, select: { id: true } });
    if (!st) return fail("NOT_FOUND", "ไม่พบช่างที่เลือก");
  }
  const rules = await unitRulesOf(ctx, service.id);
  if (i.staffId === null && self && !rules.anyStaff) return fail("ANY_DISABLED", "ร้านนี้ให้เลือกช่างก่อนจอง");
  if (!dateOk || !name || phoneKey === "" || phoneKey === "0") return fail("BAD_INPUT", BAD);
  const { dateStr, startMin } = i;

  // ② ช่างระบุตัว: ลา / ทำบริการไม่ได้
  const profiles = await staffDayProfiles({ tenantId, unitId }, dateStr, i.staffId ? { staffIds: [i.staffId] } : undefined);
  let cands: B3Cand[];
  if (i.staffId !== null) {
    const p = profiles[0];
    if (!p) return fail("NOT_FOUND", "ไม่พบช่างที่เลือก");
    if (p.onLeave) return fail("ON_LEAVE", `${p.name} ลาในวันที่เลือก`);
    const c = candOf(p, service);
    if (!c) return fail("NOT_QUALIFIED", `${p.name} ไม่ได้ให้บริการ "${service.name}"`);
    cands = [c];
  } else {
    cands = profiles.flatMap((p) => {
      const c = p.onLeave ? null : candOf(p, service);
      if (!c || !inWindows(c.windows, startMin, c.durationMin)) return [];
      if (self && !(c.onlineSharePct > 0)) return []; // 0% = ค่าตั้ง (ไม่ใช่ตัวนับ) ⇒ ไม่ต้องล็อกช่างที่ไม่มีสิทธิ์อยู่แล้ว
      return [c];
    });
  }

  // ③ เวลา
  const startAt = localToUtc(dateStr, startMin);
  const nowMs = Date.now();
  if (startAt.getTime() <= nowMs) return fail("PAST", "เวลาที่เลือกผ่านไปแล้ว");
  if (self) {
    if (dateStr > addDaysToDateStr(bkkDateStrAt(nowMs), rules.horizonDays - 1)) {
      return fail("BEYOND_HORIZON", `เปิดให้จองล่วงหน้าได้ไม่เกิน ${rules.horizonDays} วัน`);
    }
    if (startAt.getTime() < nowMs + rules.minLeadMin * B3_MIN_MS) {
      return fail("LEAD_TIME", `ต้องจองล่วงหน้าอย่างน้อย ${rules.minLeadMin} นาที`);
    }
    if (startMin % rules.stepMin !== 0) return fail("OFF_GRID", `เวลาเริ่มต้องเป็นช่วงทุก ${rules.stepMin} นาที`);
    if (i.staffId !== null && !inWindows(cands[0].windows, startMin, cands[0].durationMin)) {
      return fail("OUTSIDE_HOURS", `${cands[0].name} ไม่ได้ทำงานในช่วงเวลาที่เลือก`);
    }
  }
  if (cands.length === 0) return fail("FULL", FULL_REASON); // ใครก็ได้: ไม่มีใครทำงาน/ทำได้ช่วงนี้

  // ก่อนธุรกรรม (G2 — ธุรกรรมที่ถือล็อกห้ามขอ connection ที่สอง): snapshot ค่าตั้ง · ระบบสมาชิก · ลูกค้าสมาชิก
  //   snapshot ต่อช่าง: คีย์ของ "appointment" ที่มีชั้น STAFF ⇒ ทำแยกต่อคน · ไม่มี ⇒ ค่าเหมือนกันทุกคน ทำครั้งเดียว
  const perStaff = (SNAPSHOT_KEYS.appointment ?? []).some((k) => {
    const def = getDef(k) as { chain?: readonly string[] } | undefined;
    return !!def?.chain?.includes("STAFF");
  });
  const snaps = new Map<string, Awaited<ReturnType<typeof snapshotPolicy>>>();
  if (perStaff) {
    const all = await Promise.all(cands.map((c) => snapshotPolicy({ tenantId }, "appointment", { unitId, staffId: c.staffId, serviceId: service.id })));
    cands.forEach((c, k) => snaps.set(c.staffId, all[k]));
  } else {
    const one = await snapshotPolicy({ tenantId }, "appointment", { unitId, staffId: cands[0].staffId, serviceId: service.id });
    for (const c of cands) snaps.set(c.staffId, one);
  }
  const capPhone = self && rules.maxOpenPerPhone !== null;

  // ตรวจล่วงหน้าแบบไม่ล็อก (ลดลูกค้าสมาชิกที่สร้างแล้วจองไม่ได้ — ผลจริงตัดสินใต้ล็อกด้านล่างเสมอ) · ลำดับรหัสเดิม: เบอร์ ④ ก่อน เต็ม ⑤
  {
    const replayIfAny = async (): Promise<BookResult | null> => {
      if (!idem) return null;
      const prior = await prisma.appointment.findFirst({ where: { tenantId, idempotencyKey: idem }, select: APPT_LITE });
      return prior ? replayOf(prior, want) : null;
    };
    if (capPhone && (await openCountForPhone(prisma, tenantId, unitId, phoneKey, new Date(nowMs))) >= (rules.maxOpenPerPhone as number)) {
      return (await replayIfAny()) ?? fail("PHONE_LIMIT", PHONE_LIMIT_REASON);
    }
    const rows = await busyRowsOf(prisma, tenantId, cands.map((c) => c.staffId), dateStr);
    const anyFree = cands.some(
      (c) =>
        (!self || selfQuotaOk(c, dayLoadOf(rows, c.staffId, dateStr), c.durationMin + service.bufferMin)) &&
        slotClear(dateStr, startMin, c, service.bufferMin, rows, self),
    );
    if (!anyFree) return (await replayIfAny()) ?? fail("FULL", FULL_REASON);
  }
  const memberSystemId = await systemForUnit(tenantId, unitId, "MEMBER");
  const customerId = memberSystemId ? await memberCustomerIdFor({ tenantId, memberSystemId, phone, name, self }) : null;

  type TxOut = { kind: "row"; row: ApptLite } | { kind: "replay"; res: BookResult } | { kind: "fail"; code: BookFailCode; reason: string };
  try {
    const out = await prisma.$transaction(async (tx): Promise<TxOut> => {
      // ล็อก ⓪ key (G1 · ก่อนทุกล็อก) ⇒ คำขอ key เดียวกันเข้าแถวกันจริงทุกสาขา/ทุกช่องทาง แล้วผู้แพ้เห็นแถวผู้ชนะ
      if (idem) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:idem:${tenantId}:${idem}`}, 0))`;
        const dup = await tx.appointment.findFirst({ where: { tenantId, idempotencyKey: idem }, select: APPT_LITE });
        if (dup) return { kind: "replay", res: replayOf(dup, want) };
      }
      // ล็อก ① เบอร์ (ก่อนช่างเสมอ — ลำดับคงที่ key → เบอร์ → ช่าง กัน deadlock)
      if (capPhone) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:phone:${tenantId}:${unitId}:${phoneKey}`}, 0))`;
        // ④ เพดานนัดค้างต่อเบอร์ (SELF เท่านั้น · นับทุกช่องทาง) — ใต้ล็อกเบอร์
        if ((await openCountForPhone(tx, tenantId, unitId, phoneKey, new Date(nowMs))) >= (rules.maxOpenPerPhone as number)) {
          return { kind: "fail", code: "PHONE_LIMIT", reason: PHONE_LIMIT_REASON };
        }
      }
      // ⑤ ล็อก ② ช่างทีละคนตามลำดับ แล้วตรวจชน/% ออนไลน์/งานสูงสุด ใต้ล็อก — คนแรกที่ผ่าน = ได้
      let chosen: B3Cand | null = null;
      for (const c of cands) {
        await tx.$queryRaw`SELECT id FROM "BookingStaff" WHERE id = ${c.staffId} FOR UPDATE`;
        const rows = await busyRowsOf(tx, tenantId, [c.staffId], dateStr);
        if (self && !selfQuotaOk(c, dayLoadOf(rows, c.staffId, dateStr), c.durationMin + service.bufferMin)) continue;
        if (!slotClear(dateStr, startMin, c, service.bufferMin, rows, self)) continue;
        chosen = c;
        break;
      }
      if (!chosen) return { kind: "fail", code: "FULL", reason: FULL_REASON };

      const snap = snaps.get(chosen.staffId)!;
      const depositSatang = computeDepositSatang(snapVal(snap, "booking.deposit.amount") ?? null, {
        priceSatang: chosen.priceSatang,
        durationMin: chosen.durationMin,
        serviceDepositSatang: service.depositSatang,
      });
      const holding = self && holdMinutesOf(i.channel, depositSatang, snap) !== null;
      const status: AppointmentStatus = !self
        ? "CONFIRMED"
        : snapVal(snap, "booking.booking.requireConfirm") === true || holding
          ? "PENDING"
          : "CONFIRMED";

      const created = await tx.appointment.create({
        data: {
          tenantId,
          unitId,
          customerId,
          staffId: chosen.staffId,
          serviceId: service.id,
          startAt,
          endAt: localToUtc(dateStr, startMin + chosen.durationMin + service.bufferMin),
          status,
          customerName: name,
          customerPhone: phone,
          note: typeof i.note === "string" ? i.note : undefined,
          source: self ? "ONLINE" : "STAFF",
          priceSatang: chosen.priceSatang,
          depositSatang,
          idempotencyKey: idem,
          kind: "BOOKED",
          assignMode: i.staffId === null ? "ANY" : "SPECIFIC",
          channel: i.channel,
          // SVC B.4 ▸ หนี้ B.3: นาทีเฉพาะคน + buffer ของบริการ ณ ตอนจอง (คีย์ระดับบนข้าง values · CC §1.6 additive) ◂
          policySnapshot: { ...snap, job: { durationMin: chosen.durationMin, bufferMin: service.bufferMin } } as unknown as Prisma.InputJsonValue,
        },
        select: APPT_LITE,
      });
      if (customerId) {
        await member.logActivity(
          {
            tenantId,
            customerId,
            unitId,
            module: "booking",
            type: "APPOINTMENT_BOOKED",
            refType: "Appointment",
            refId: created.id,
            summary: `จองนัด ${service.name} · ${dateStr} ${minutesToHHMM(startMin)}`,
          },
          tx,
        );
      }
      return { kind: "row", row: created };
    }, BOOK_TX);
    if (out.kind === "fail") return fail(out.code, out.reason);
    if (out.kind === "replay") return out.res;
    await linkPartyAfterCommit(tenantId, out.row.id, name, phone); // CRM v2 C1.1 (C11) — หลัง commit เท่านั้น
    return replayOf(out.row, want);
  } catch (e) {
    // ชน unique(tenantId, idempotencyKey) — ไม่ควรเกิดเมื่อมีล็อก key แต่กันไว้ ⇒ ผลเดียวกับ replay (ตรวจสาขา/ข้อมูล/สถานะ)
    if (idem && isP2002(e)) {
      const dup = await prisma.appointment.findFirst({ where: { tenantId, idempotencyKey: idem }, select: APPT_LITE });
      if (dup) return replayOf(dup, want);
    }
    throw e;
  }
}

// ── ปล่อยช่องที่ไม่จ่ายมัดจำ (minute-job · ข้ามร้าน · §3.3) ──
const HOLD_EXPIRE_BATCH = 50;
const HOLD_EXPIRE_MAX_BATCHES = 40;
const HOLD_EXPIRE_TX = { maxWait: 5_000, timeout: 10_000 } as const;

/**
 * นัด PENDING · ยังไม่จ่าย · มัดจำ > 0 · ช่อง ONLINE/LINE · snapshot method ≠ NONE · snapshot payWithinMin เป็นตัวเลข ·
 * createdAt + payWithinMin ≤ now ⇒ CANCELLED + cancelReason DEPOSIT_TIMEOUT (ค่าจาก snapshot ชนะค่าตั้งปัจจุบัน · CC §1.6)
 * X5: FOR UPDATE SKIP LOCKED เป็นก้อน + เงื่อนไขสถานะ/ยังไม่จ่ายซ้ำใน UPDATE ⇒ เรียกซ้อนกัน แต่ละแถวถูกปล่อยครั้งเดียว · คืนจำนวนที่ปล่อยจริง
 * ไม่ยิง event (booking.cancelled = B.7) · หนี้ดัชนี partial (createdAt) WHERE PENDING AND depositPaidAt IS NULL = migration ถัดไป (§6 ข้อ 1)
 */
export async function expireDepositHolds(now: Date): Promise<{ expired: number }> {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date(Date.now());
  let expired = 0;
  for (let b = 0; b < HOLD_EXPIRE_MAX_BATCHES; b++) {
    const n = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Appointment" a
        SET "status" = 'CANCELLED', "cancelReason" = 'DEPOSIT_TIMEOUT', "updatedAt" = now()
        WHERE a."id" IN (
          SELECT x."id" FROM "Appointment" x
          WHERE x."status" = 'PENDING' AND x."depositPaidAt" IS NULL AND x."depositSatang" > 0
            AND x."channel" IN ('ONLINE', 'LINE')
            AND (x."policySnapshot" -> 'values' ->> 'booking.deposit.method') <> 'NONE'
            AND jsonb_typeof(x."policySnapshot" -> 'values' -> 'booking.deposit.payWithinMin') = 'number'
            AND x."createdAt" + (CASE WHEN jsonb_typeof(x."policySnapshot" -> 'values' -> 'booking.deposit.payWithinMin') = 'number'
                                      THEN (x."policySnapshot" -> 'values' ->> 'booking.deposit.payWithinMin')::numeric END
                                 * interval '1 minute') <= ${at}
          ORDER BY x."createdAt" ASC
          LIMIT ${HOLD_EXPIRE_BATCH}
          FOR UPDATE SKIP LOCKED
        ) AND a."status" = 'PENDING' AND a."depositPaidAt" IS NULL
        RETURNING a."id"`;
      return rows.length;
    }, HOLD_EXPIRE_TX);
    expired += n;
    if (n < HOLD_EXPIRE_BATCH) break;
  }
  return { expired };
}
// ◂ SVC B.3
