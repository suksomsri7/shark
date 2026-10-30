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
import { manageToken, manageTokenHash } from "./manage-token"; // SVC B.7 ▸ ลิงก์จัดการนัด (pure) ◂

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
    select: { status: true, depositSaleId: true, staffId: true, startAt: true, endAt: true, queueTicketId: true, policySnapshot: true, cancelReason: true },
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
  // SVC B.8 ▸ V1: ปลุกนัดที่ยกเลิกช้า (CANCELLED/CUSTOMER_LATE) = คืนบิลริบแบบเดียวกับออกจาก NO_SHOW ◂
  const lateUndo = before?.status === "CANCELLED" && before.cancelReason === "CUSTOMER_LATE" && status !== "CANCELLED" && status !== "NO_SHOW";
  if (((before?.status === "NO_SHOW" && status !== "NO_SHOW") || lateUndo) && before?.depositSaleId) {
    const u = await (await import("@/lib/modules/pos/deposit")).moduleUnforfeitDeposit({ tenantId, unitId, receiptSaleId: before.depositSaleId, actorUserId: opts?.actorUserId || "module:booking" });
    if (u.ok === false) return { ok: false as const, reason: u.message, unforfeit: true };
  }
  // SVC B.3 ▸ G7: ทุกทางเปลี่ยนสถานะ = compare-and-set จากสถานะที่อ่าน (`before.status`) — แพ้ (เช่น ร้านกดยืนยัน PENDING ขณะ minute-job ปล่อยช่องเป็น CANCELLED)
  //   ⇒ ok:false ไม่เขียนทับ · ไม่ยิง event · ไม่ริบมัดจำ (ริบทำหลัง commit เฉพาะเมื่อชนะ) ·
  //   คืนบิลริบ (ออกจาก NO_SHOW) เกิดก่อน tx: ถ้าแพ้ CAS ผู้ชนะต้องเป็นทางที่พาออกจาก NO_SHOW เช่นกัน (NO_SHOW→NO_SHOW ไม่แพ้ CAS) ⇒ บิลที่คืนสอดคล้องกับสถานะจริง ◂
  const LOST_RACE_REASON = "สถานะนัดเพิ่งถูกเปลี่ยนโดยรายการอื่น กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";
  if (!before) return { ok: false as const, reason: "ไม่พบนัด" };
  let reviveFail = null as string | null; // ตั้งใน callback ของ tx (กัน TS ตีบชนิดเป็น null)
  // SVC B.5 ▸ (ก) หนี้ B.4: ถอย ARRIVED → CONFIRMED/PENDING (ลูกค้ายังไม่มาจริง/กดผิด) ⇒ ใน CAS เดียวกัน ล้าง checkedInAt + queueTicketId
  //   และบัตรเดิม (ถ้ายัง active) → CANCELLED (STAFF) ใน tx เดียว ⇒ เช็กอินใหม่ได้บัตรใหม่ · บัตร active ต่อนัด = 1 ·
  //   CAS ผูก queueTicketId ที่อ่านด้วย (เช็กอินจอเดิมที่ออกบัตรให้ระหว่างนั้น = แพ้ ⇒ LOST_RACE) · ร้านเดิม (ไม่มีบัตร) ผลเดิม + ล้าง checkedInAt ◂
  const undoArrive = before.status === "ARRIVED" && (status === "CONFIRMED" || status === "PENDING");
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
      where: { id: appointmentId, tenantId, unitId, status: before.status, ...(undoArrive ? { queueTicketId: before.queueTicketId } : {}) },
      data: {
        ...(reviving ? { status, cancelReason: null } : { status }),
        ...(manualHoldSnap ? { policySnapshot: manualHoldSnap } : {}),
        ...(undoArrive ? { checkedInAt: null, queueTicketId: null } : {}),
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
    if (undoArrive && before.queueTicketId) {
      // บัตรที่ยัง active (WAITING/CALLED/SERVING/SKIPPED) ⇒ CANCELLED · จบแล้ว = moveTicketTx คืน BAD_STATE ไม่ทำอะไร
      await queue.moveTicketTx(tx, { tenantId, unitId }, before.queueTicketId, "CANCELLED", {
        now: new Date(), actorType: "STAFF", actorId: opts?.actorUserId ?? null, cancelReason: "STAFF",
      });
    }
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
  // SVC B.8 ▸ % ที่ริบจาก snapshot (แถวเก่าไม่มีคีย์ ⇒ ค่าตั้งปัจจุบัน) · null/0 ⇒ ไม่ริบ (มัดจำค้างคืน) · 0<pct<100 ⇒ บิลริบบางส่วน · 100 ⇒ ทางเดิมด้านล่าง ◂
  const pct = await depositForfeitPctOf(tenantId, unitId, appointmentId);
  if (pct === null) return { forfeited: false };
  if (pct < 100) return forfeitDepositPartial(tenantId, unitId, appointmentId, pct, "NO_SHOW");
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
    if ("legacy" in r) return { forfeited: false };
    await afterDepositForfeit({ tenantId, unitId, appointmentId, saleId: r.saleId, satang: r.satang, pct: 100, reason: "NO_SHOW", fresh: !r.duplicated }); // SVC B.8
    return { forfeited: true, saleId: r.saleId };
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
  /** SVC B.7 ▸ ช่อง LINE ที่ผู้เรียกยืนยันตัวตนแล้ว (ลิงก์เซ็น booking.identity) ⇒ ผูก Party ตรง · ข้าม linkPartyAfterCommit ◂ */
  partyId?: string;
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
  opts?: { now?: Date; excludeAppointmentId?: string }, // SVC B.7 ▸ นาฬิกาฉีด + ไม่นับแถวของนัดที่กำลังเลื่อน (ไม่ส่ง = ผลเดิม) ◂
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
  const nowMs = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now.getTime() : Date.now();
  if (self && q.dateStr > addDaysToDateStr(bkkDateStrAt(nowMs), rules.horizonDays - 1)) return [];

  const profiles = await staffDayProfiles({ tenantId, unitId }, q.dateStr, q.staffId ? { staffIds: [q.staffId] } : undefined);
  const cands = profiles.flatMap((p) => {
    if (p.windows.length === 0) return [];
    const c = candOf(p, service);
    return c ? [c] : [];
  });
  if (cands.length === 0) return [];
  const rows = await busyRowsExcept(prisma, tenantId, cands.map((c) => c.staffId), q.dateStr, opts?.excludeAppointmentId);

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
async function memberCustomerIdFor(i: { tenantId: string; memberSystemId: string; phone: string; name: string; self: boolean; walkIn?: boolean }): Promise<string> {
  const input = { tenantId: i.tenantId, memberSystemId: i.memberSystemId, phone: i.phone, name: i.name, source: i.self ? ("SELF" as const) : ("STAFF" as const) };
  for (let attempt = 0; ; attempt++) {
    try {
      const startedAt = new Date(Date.now() - 5_000);
      const c = await member.findOrCreate(input);
      // SVC B.11 ▸ ลูกค้าที่ทางจองเพิ่งสร้าง (source ยังว่าง) ติดแหล่ง BOOKING / WALK_IN — งานลบข้อมูลส่วนตัวแยกแถวค้างจากแข่งจองได้ (หนี้ B.3 · มติผู้คุม 29 ต.ค.)
      //   เฉพาะแถวที่ source ยังว่างและสร้างในคำขอนี้ · ไม่แก้สมาชิกเดิม ◂
      if (c.source === null && c.createdAt >= startedAt) {
        await prisma.customer.updateMany({
          where: { id: c.id, tenantId: i.tenantId, source: null },
          data: i.walkIn ? { source: "WALK_IN" } : { source: "BOOKING" },
        });
      }
      return c.id;
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
  const linePartyId = i.channel === "LINE" && typeof i.partyId === "string" && i.partyId ? i.partyId : null; // SVC B.7
  const phoneUnverified = i.channel === "ONLINE"; // SVC B.7 ▸ เบอร์กรอกเองบนหน้าจอง (ไม่ผ่าน OTP · ไม่ใช่ลิงก์ตัวตน LINE) ◂
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
  // SVC B.7 ▸ O3: Party ที่ยืนยันจากลิงก์ LINE ต้องเป็นของร้านนี้และไม่ถูกรวม (ตรวจก่อนธุรกรรม) ◂
  if (linePartyId && !(await tenantDb({ tenantId }).party.findFirst({ where: { id: linePartyId, tenantId, mergedIntoId: null }, select: { id: true } }))) {
    return fail("BAD_INPUT", BAD);
  }
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
  // SVC B.7 ▸ เบอร์ที่ลูกค้ากรอกเองบนหน้าจอง (ONLINE) ไม่ผ่าน OTP ⇒ ไม่ผูกสมาชิก/Party จากเบอร์อย่างเดียว (มติ B.9 reviewer A) ◂
  const customerId = memberSystemId && !phoneUnverified ? await memberCustomerIdFor({ tenantId, memberSystemId, phone, name, self }) : null;
  // SVC B.8 ▸ #37 ยกเว้นมัดจำสมาชิกระดับ — เฉพาะตัวตนที่ยืนยันแล้ว (ได้ customerId · ช่อง ONLINE ไม่มี) · อ่านก่อนธุรกรรม (G2) ◂
  //   V6: ช่อง LINE = สมาชิกที่ผูก Party ของลิงก์ตัวตนเท่านั้น (ไม่หาจากเบอร์) · STAFF/PHONE = ลูกค้าที่พนักงานจอง · ONLINE = ไม่ยกเว้น
  const exemptTier = i.channel === "LINE"
    ? (linePartyId ? await memberExemptTierForIdentity({ tenantId, unitId }, { partyId: linePartyId }) : null)
    : !self && customerId ? await memberExemptTierOf({ tenantId, unitId }, customerId) : null;

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
      const depositBase = computeDepositSatang(snapVal(snap, "booking.deposit.amount") ?? null, {
        priceSatang: chosen.priceSatang,
        durationMin: chosen.durationMin,
        serviceDepositSatang: service.depositSatang,
      });
      const depositSatang = exemptTier && depositBase > 0 ? 0 : depositBase; // SVC B.8 ▸ #37 ◂
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
          policySnapshot: {
            ...snap,
            job: { durationMin: chosen.durationMin, bufferMin: service.bufferMin },
            ...(exemptTier && depositBase > 0 ? { deposit: { exempt: "MEMBER_TIER", tier: exemptTier } } : {}), // SVC B.8 ▸ additive ◂
          } as unknown as Prisma.InputJsonValue,
          ...(linePartyId ? { partyId: linePartyId } : {}), // SVC B.7
        },
        select: APPT_LITE,
      });
      // SVC B.7 ▸ ช่องลูกค้าจองเอง (ONLINE/LINE): hash ลิงก์จัดการนัด + booking.created ใน tx เดียวกับ create
      //   payload = id ล้วน (X8 ไม่มีชื่อ/เบอร์ · ไม่มี token/hash) · ช่อง STAFF/PHONE คงพฤติกรรม B.3 (ไม่ยิง · มติ Q2) ◂
      if (self) {
        const tok = manageToken(created.id);
        if (tok) await tx.appointment.updateMany({ where: { id: created.id, tenantId, unitId }, data: { manageTokenHash: manageTokenHash(tok) } });
        await emitOutbox(tx, {
          tenantId, unitId, type: "booking.created", idempotencyKey: `booking.created#${created.id}`,
          payload: { appointmentId: created.id, unitId, staffId: created.staffId, kind: "BOOKED", channel: i.channel, serviceId: service.id, assignMode: created.assignMode, status: created.status },
        });
      }
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
    if (!linePartyId && !phoneUnverified) await linkPartyAfterCommit(tenantId, out.row.id, name, phone); // CRM v2 C1.1 (C11) — หลัง commit เท่านั้น · SVC B.7: LINE ที่ยืนยันแล้วผูกตรงใน create
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
      // SVC B.8 ▸ §3.7: สลิปค้างตรวจ (PENDING/NEEDS_REVIEW) = หยุดนับจนถึงเวลาเริ่มนัด (มติ Q3) · สลิปอนุมัติแล้ว (รอ consumer ลงเงิน) = ไม่ปล่อย ·
      //   สลิปถูกปฏิเสธ = นับต่อ · ปล่อยจริง ⇒ booking.cancelled (DEPOSIT_TIMEOUT) ใน tx เดียวกับ UPDATE (ซ้อนกันหลายโพรเซส = ปล่อยครั้งเดียว event เดียว) ◂
      const rows = await tx.$queryRaw<HoldReleased[]>`
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
            AND NOT EXISTS (
              SELECT 1 FROM "PaymentSlip" s
              WHERE s."tenantId" = x."tenantId" AND s."domain" = 'BOOKING' AND s."refType" = 'APPT_DEPOSIT' AND s."refId" = x."id"
                AND (s."status" IN ('AUTO_APPROVED', 'APPROVED') OR (s."status" IN ('PENDING', 'NEEDS_REVIEW') AND x."startAt" > ${at})))
            AND COALESCE((x."policySnapshot" -> 'deposit' -> 'slipClaim' ->> 'until')::bigint, 0) <= (extract(epoch from now()) * 1000)::bigint
          ORDER BY x."createdAt" ASC
          LIMIT ${HOLD_EXPIRE_BATCH}
          FOR UPDATE SKIP LOCKED
        ) AND a."status" = 'PENDING' AND a."depositPaidAt" IS NULL
        RETURNING a."id", a."tenantId", a."unitId", a."staffId", a."kind"::text AS "kind", a."channel"::text AS "channel", a."serviceId", a."depositSatang"`;
      for (const r of rows) await emitHoldReleasedTx(tx, r); // SVC B.8
      return rows.length;
    }, HOLD_EXPIRE_TX);
    expired += n;
    if (n < HOLD_EXPIRE_BATCH) break;
  }
  return { expired };
}
// ◂ SVC B.3

// ═════════ SVC B.7 ▸ จองออนไลน์ + ลิงก์จัดการนัด (ใบสั่ง svc-brief-b.7 §3.7 · เพิ่มเท่านั้น) ═════════
// 🔴 ตัวตรวจชน/โควตา = ของ B.3 ชุดเดียว (busyRowsOf · slotClear · selfQuotaOk · candOf) — ไม่นับแถวของนัดที่กำลังเลื่อน (busyRowsExcept)
// 🔴 ลำดับล็อกของการเลื่อน = แบบ rescheduleByShop: advisory สาขา → ช่างทั้งสาขาตาม sortOrder (lockUnitTx) → แถวนัด (lockAppt) · CAS ทุกการเขียน
//    ไม่มี connection ที่สองใต้ล็อก (ค่าตั้ง/โปรไฟล์/บริการ เตรียมก่อนธุรกรรม) · 40P01/P2028 ลองใหม่ 1 ครั้งแล้ว BUSY (ไม่ throw)
// 🔴 กติกาของนัดที่จองแล้ว = policySnapshot (CC §1.6) · ค่าหายใน snapshot (แถวเก่า) ⇒ resolver ปัจจุบัน · เวลาใหม่ตรวจด้วยกติกาจองปัจจุบัน

/** แถวถือช่องของช่าง (busyRowsOf ทุกไบต์) ตัดแถวของนัด excludeId ออก 1 แถว (จับด้วยช่าง + เริ่ม + จบของแถวนั้น) · ไม่ส่ง ⇒ busyRowsOf เดิม */
async function busyRowsExcept(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  tenantId: string,
  staffIds: string[],
  dateStr: string,
  excludeId: string | undefined,
): Promise<BusyRow[]> {
  const rows = await busyRowsOf(client, tenantId, staffIds, dateStr);
  if (typeof excludeId !== "string" || !excludeId || !rows.length) return rows;
  const [me] = await client.$queryRaw<{ staffId: string; startAt: Date; endAt: Date }[]>`
    SELECT "staffId", "startAt", "endAt" FROM "Appointment"
    WHERE "id" = ${excludeId} AND "tenantId" = ${tenantId} AND "status" NOT IN ('CANCELLED', 'NO_SHOW')`;
  if (!me) return rows;
  const k = rows.findIndex((r) => r.staffId === me.staffId && r.startAt.getTime() === me.startAt.getTime() && r.endAt.getTime() === me.endAt.getTime());
  return k < 0 ? rows : [...rows.slice(0, k), ...rows.slice(k + 1)];
}

/** กติกาจองระดับสาขา(+บริการ) ของ B.3 (horizon · lead · ช่อง · ใครก็ได้) — ให้หน้าจองออนไลน์ใช้ตัวเดียวกับ findSlots/bookAppointment */
export function onlineRulesOf(ctx: { tenantId: string; unitId: string }, serviceId: string): Promise<{ horizonDays: number; minLeadMin: number; stepMin: number; anyStaff: boolean }> {
  return unitRulesOf(ctx, serviceId);
}

/** กติกาที่ลูกค้าเห็น/ใช้กับลิงก์จัดการนัด (ใบสั่ง §3.2 OnlinePolicy) */
export type SelfPolicy = {
  graceMin: number | null;
  afterGrace: "RELEASE_REQUEUE" | "WAIT_NOTIFY_COUNTER" | null;
  freeChangeBeforeMin: number;
  selfRescheduleMax: number;
  requireConfirm: boolean;
  depositMethod: string;
  payWithinMin: number | null;
  forfeitPct: number | null;
};
const SELF_POLICY_KEYS = [
  "booking.late.graceMin",
  "booking.late.afterGrace",
  "booking.late.freeChangeBeforeMin",
  "booking.late.selfRescheduleMax",
  "booking.booking.requireConfirm",
  "booking.deposit.method",
  "booking.deposit.payWithinMin",
  "booking.deposit.forfeitPct",
] as const;
function selfPolicyFrom(v: (k: string) => unknown): SelfPolicy {
  const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const ag = v("booking.late.afterGrace");
  const method = v("booking.deposit.method");
  return {
    graceMin: num(v("booking.late.graceMin")),
    afterGrace: ag === "RELEASE_REQUEUE" || ag === "WAIT_NOTIFY_COUNTER" ? ag : null,
    freeChangeBeforeMin: Math.max(0, num(v("booking.late.freeChangeBeforeMin")) ?? 0),
    selfRescheduleMax: Math.max(0, Math.floor(num(v("booking.late.selfRescheduleMax")) ?? 0)),
    requireConfirm: v("booking.booking.requireConfirm") === true,
    depositMethod: typeof method === "string" ? method : "NONE",
    payWithinMin: num(v("booking.deposit.payWithinMin")),
    forfeitPct: num(v("booking.deposit.forfeitPct")),
  };
}
/** ค่าตั้งปัจจุบัน (หน่วย + บริการ + ช่างถ้าระบุ) — ตัวเดียวกับที่ snapshot จะจด · อ่านทุกคำขอ (ไม่แคช) */
export async function currentSelfPolicy(ctx: { tenantId: string; unitId: string }, refs: { serviceId: string; staffId?: string | null }): Promise<SelfPolicy> {
  const r = await resolveSettings({ tenantId: ctx.tenantId }, [...SELF_POLICY_KEYS], {
    unitId: ctx.unitId, serviceId: refs.serviceId, ...(refs.staffId ? { staffId: refs.staffId } : {}),
  });
  return selfPolicyFrom((k) => r[k]?.value);
}
/** กติกาของนัดที่จองแล้ว: snapshot ชนะ · คีย์ที่ snapshot ไม่ได้จด (แถวเก่า) ⇒ resolver ปัจจุบัน */
export async function snapshotSelfPolicy(
  ctx: { tenantId: string; unitId: string },
  row: { serviceId: string; staffId: string; policySnapshot: unknown },
): Promise<SelfPolicy> {
  const vals = row.policySnapshot && typeof row.policySnapshot === "object" ? (row.policySnapshot as PolicySnap).values : undefined;
  const has = (k: string) => !!vals && typeof vals === "object" && Object.prototype.hasOwnProperty.call(vals, k);
  if (SELF_POLICY_KEYS.every(has)) return selfPolicyFrom((k) => vals![k]);
  const cur = await resolveSettings({ tenantId: ctx.tenantId }, [...SELF_POLICY_KEYS], { unitId: ctx.unitId, serviceId: row.serviceId, staffId: row.staffId });
  return selfPolicyFrom((k) => (has(k) ? vals![k] : cur[k]?.value));
}

export type SelfChangeBlock = "LATE_CHANGE" | "MAX_RESCHEDULE" | "BAD_STATE" | null;
/** ยกเลิก/เลื่อนเองได้ไหม ณ now (ใบสั่ง §3.4) — pure */
export function selfChangeState(
  row: { status: string; startAt: Date; rescheduleCount: number },
  pol: SelfPolicy,
  now: Date,
): { freeUntilMs: number; rescheduleLeft: number; cancelBlock: SelfChangeBlock; rescheduleBlock: SelfChangeBlock } {
  const freeUntilMs = row.startAt.getTime() - pol.freeChangeBeforeMin * B3_MIN_MS;
  const rescheduleLeft = Math.max(0, pol.selfRescheduleMax - row.rescheduleCount);
  const open = row.status === "PENDING" || row.status === "CONFIRMED";
  const late = now.getTime() > freeUntilMs;
  const cancelBlock: SelfChangeBlock = !open ? "BAD_STATE" : late ? "LATE_CHANGE" : null;
  const rescheduleBlock: SelfChangeBlock = !open ? "BAD_STATE" : late ? "LATE_CHANGE" : rescheduleLeft <= 0 ? "MAX_RESCHEDULE" : null;
  return { freeUntilMs, rescheduleLeft, cancelBlock, rescheduleBlock };
}

/** เวลาสิ้นสุดถือช่องมัดจำ (สูตร holdMinutesOf ของ B.3) เมื่อยังถือ (PENDING · ยังไม่จ่าย) · อื่น ⇒ null */
export function holdUntilOf(r: { channel: string | null; depositSatang: number; policySnapshot: unknown; status: string; depositPaidAt: Date | null; createdAt: Date }): Date | null {
  const hold = holdMinutesOf(r.channel, r.depositSatang, r.policySnapshot);
  if (hold === null || r.status !== "PENDING" || r.depositPaidAt !== null) return null;
  return new Date(r.createdAt.getTime() + hold * B3_MIN_MS);
}

export type ManageRow = {
  id: string; tenantId: string; unitId: string; kind: string; status: AppointmentStatus; channel: string | null; assignMode: string;
  staffId: string; plannedStaffId: string | null; serviceId: string; startAt: Date; endAt: Date; createdAt: Date;
  priceSatang: number; depositSatang: number; depositPaidAt: Date | null; cancelReason: string | null; rescheduleCount: number; policySnapshot: unknown;
};
const MANAGE_ROW = {
  id: true, tenantId: true, unitId: true, kind: true, status: true, channel: true, assignMode: true, staffId: true, plannedStaffId: true, serviceId: true,
  startAt: true, endAt: true, createdAt: true, priceSatang: true, depositSatang: true, depositPaidAt: true, cancelReason: true, rescheduleCount: true, policySnapshot: true,
} as const;
/** นัดจาก hash ของ token ลิงก์จัดการนัด (ก่อนรู้ร้าน · เฉพาะ kind BOOKED) — ผู้เรียกต้องเทียบ token แบบ timing-safe อีกชั้น */
export async function appointmentByManageHash(hash: string): Promise<ManageRow | null> {
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return null;
  return prisma.appointment.findFirst({ where: { manageTokenHash: hash, kind: "BOOKED" }, select: MANAGE_ROW });
}

export type SelfRescheduleFail =
  | "NOT_FOUND" | "RATE_LIMITED" | "LATE_CHANGE" | "MAX_RESCHEDULE" | "BAD_STATE" | "LOST_RACE" | "BUSY"
  | "FULL" | "PAST" | "LEAD_TIME" | "BEYOND_HORIZON" | "OFF_GRID" | "OUTSIDE_HOURS" | "NOT_QUALIFIED" | "ON_LEAVE" | "BAD_INPUT";
export type SelfRescheduleResult = { ok: true; startAt: Date } | { ok: false; code: SelfRescheduleFail; reason: string };
const SELF_R = {
  NOT_FOUND: "ไม่พบนัดนี้",
  STAFF_NOT_FOUND: "ไม่พบช่างที่เลือก",
  SVC_NOT_FOUND: "บริการนี้ไม่เปิดให้จองออนไลน์แล้ว — กรุณาติดต่อร้าน",
  ANY_OFF: "ร้านนี้ให้เลือกช่างก่อนจอง",
  BAD_STATE: "นัดนี้เลื่อนหรือยกเลิกเองไม่ได้ในสถานะปัจจุบัน",
  LATE_CHANGE: "เลยเวลาที่เลื่อน/ยกเลิกเองได้แล้ว — กรุณาติดต่อร้าน",
  MAX_RESCHEDULE: "นัดนี้เลื่อนเองครบจำนวนครั้งที่ร้านกำหนดแล้ว — กรุณาติดต่อร้าน",
  LOST_RACE: "นัดนี้เพิ่งถูกเปลี่ยน กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
  BUSY: "ระบบกำลังจัดคิวพร้อมกันหลายรายการ กรุณาลองใหม่อีกครั้ง",
  RATE: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
} as const;

/** policySnapshot หลังเลื่อน: job.durationMin = นาทีของช่างใหม่ · ล้าง job.manualHold (แบบ N1 ของ B.4) · คีย์อื่นคงเดิม */
function snapAfterSelfMove(snap: unknown, durationMin: number, bufferMin: number): Prisma.InputJsonValue {
  const base = snap && typeof snap === "object" && !Array.isArray(snap) ? (snap as Record<string, unknown>) : {};
  const job = base.job && typeof base.job === "object" && !Array.isArray(base.job) ? { ...(base.job as Record<string, unknown>) } : {};
  delete job.manualHold;
  return { ...base, job: { ...job, durationMin, bufferMin } } as unknown as Prisma.InputJsonValue;
}

/**
 * ลูกค้าเลื่อนนัดเอง (ใบสั่ง §3.5) — แถวเดิม (id/ลิงก์/มัดจำเดิม) · rescheduleCount + 1 · requireConfirm(snapshot) ⇒ กลับ PENDING
 * ลำดับตรวจ: นัด (NOT_FOUND) → สถานะ (BAD_STATE) → เวลาฟรี (LATE_CHANGE) → เพดานเลื่อน (MAX_RESCHEDULE) → รูปข้อมูล (BAD_INPUT) →
 *   บริการ/ช่าง (NOT_FOUND) → ลา/ทำไม่ได้ → เวลา (PAST · BEYOND_HORIZON · LEAD_TIME · OFF_GRID · OUTSIDE_HOURS) → ว่าง/โควตา (FULL) → ล็อก + CAS
 * `charge` (ผู้เรียกสาธารณะ: ถังต่อ token) เรียกเมื่อคำขอถูกตัดสินด้วยสถานะนัด (BAD_STATE/LATE_CHANGE/MAX_RESCHEDULE) หรือก่อนเข้าล็อกเขียน · false ⇒ RATE_LIMITED
 */
export async function rescheduleBySelf(
  ctx: BookingCtx,
  appointmentId: string,
  to: { dateStr: string; startMin: number; staffId: string | null },
  opts?: { now?: Date; charge?: () => Promise<boolean> },
): Promise<SelfRescheduleResult> {
  const fail = (code: SelfRescheduleFail, reason: string): SelfRescheduleResult => ({ ok: false, code, reason });
  const now = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  const nowMs = now.getTime();
  const charge = async (): Promise<boolean> => (opts?.charge ? opts.charge() : true);
  const gate = async (code: SelfRescheduleFail, reason: string): Promise<SelfRescheduleResult> =>
    (await charge()) ? fail(code, reason) : fail("RATE_LIMITED", SELF_R.RATE);
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.unitId !== "string" || typeof appointmentId !== "string" || !appointmentId) {
    return fail("NOT_FOUND", SELF_R.NOT_FOUND);
  }
  const { tenantId, unitId } = ctx;
  const db = tenantDb({ tenantId, unitId });
  const cur = await db.appointment.findFirst({ where: { id: appointmentId, tenantId, unitId, kind: "BOOKED" }, select: MANAGE_ROW });
  if (!cur) return fail("NOT_FOUND", SELF_R.NOT_FOUND);
  const pol = await snapshotSelfPolicy(ctx, cur);
  const st0 = selfChangeState(cur, pol, now);
  if (st0.rescheduleBlock) return gate(st0.rescheduleBlock, SELF_R[st0.rescheduleBlock]);

  // รูปข้อมูล
  const t = to as { dateStr?: unknown; startMin?: unknown; staffId?: unknown } | null;
  if (!t || typeof t !== "object" || typeof t.dateStr !== "string" || !isRealDateStr(t.dateStr)
    || typeof t.startMin !== "number" || !Number.isInteger(t.startMin) || t.startMin < 0 || t.startMin >= 24 * 60
    || (t.staffId !== null && (typeof t.staffId !== "string" || !t.staffId))) {
    return fail("BAD_INPUT", BAD_INPUT_REASON);
  }
  const dateStr = t.dateStr;
  const startMin = t.startMin;
  const staffId = t.staffId as string | null;
  // O6: ถังต่อ token ของผู้เรียกนับทันทีหลังด่านรูปข้อมูล (มติผู้คุม B.7) — ก่อนค้นบริการ/ช่าง/ตาราง
  if (!(await charge())) return fail("RATE_LIMITED", SELF_R.RATE);
  // O9: เวลา + ช่างเดิม (ระบุช่างเดิม หรือ "ใครก็ได้" กับนัดใครก็ได้) ⇒ ok ไม่นับครั้ง ไม่ยิง event
  const sameAs = (r: { startAt: Date; staffId: string; assignMode: string }) =>
    r.startAt.getTime() === localToUtc(dateStr, startMin).getTime() && (staffId === null ? r.assignMode === "ANY" : r.assignMode !== "ANY" && r.staffId === staffId);
  if (sameAs(cur)) return { ok: true, startAt: cur.startAt };

  // บริการ/ช่าง (ของหน่วยนี้เท่านั้น · ลูกค้าเลือกชื่อไม่ได้ = ไม่พบ)
  const service = await db.bookingService.findFirst({ where: { id: cur.serviceId, active: true } });
  if (!service || !service.bookable) return fail("NOT_FOUND", SELF_R.SVC_NOT_FOUND);
  const rules = await unitRulesOf(ctx, service.id);
  if (staffId !== null) {
    const stf = await db.bookingStaff.findFirst({ where: { id: staffId, active: true }, select: { id: true } });
    if (!stf) return fail("NOT_FOUND", SELF_R.STAFF_NOT_FOUND);
    const cc = await resolveSettings({ tenantId }, ["booking.staff.customerCanChoose"], { unitId, staffId });
    if (cc["booking.staff.customerCanChoose"]?.value === false) return fail("NOT_FOUND", SELF_R.STAFF_NOT_FOUND);
  } else if (!rules.anyStaff) {
    return fail("NOT_FOUND", SELF_R.ANY_OFF);
  }

  // ช่างระบุตัว: ลา / ทำบริการไม่ได้ · ใครก็ได้ = ทุกคนที่ทำได้ + อยู่ในหน้าต่าง + ออนไลน์ > 0%
  const profiles = await staffDayProfiles({ tenantId, unitId }, dateStr, staffId ? { staffIds: [staffId] } : undefined);
  let cands: B3Cand[];
  if (staffId !== null) {
    const p = profiles[0];
    if (!p) return fail("NOT_FOUND", SELF_R.STAFF_NOT_FOUND);
    if (p.onLeave) return fail("ON_LEAVE", `${p.name} ลาในวันที่เลือก`);
    const c = candOf(p, service);
    if (!c) return fail("NOT_QUALIFIED", `${p.name} ไม่ได้ให้บริการ "${service.name}"`);
    cands = [c];
  } else {
    cands = profiles.flatMap((p) => {
      const c = p.onLeave ? null : candOf(p, service);
      if (!c || !inWindows(c.windows, startMin, c.durationMin) || !(c.onlineSharePct > 0)) return [];
      return [c];
    });
  }

  // เวลา (กติกาจองปัจจุบัน · ช่อง SELF · now ฉีด)
  const startAt = localToUtc(dateStr, startMin);
  if (startAt.getTime() <= nowMs) return fail("PAST", "เวลาที่เลือกผ่านไปแล้ว");
  if (dateStr > addDaysToDateStr(bkkDateStrAt(nowMs), rules.horizonDays - 1)) {
    return fail("BEYOND_HORIZON", `เปิดให้จองล่วงหน้าได้ไม่เกิน ${rules.horizonDays} วัน`);
  }
  if (startAt.getTime() < nowMs + rules.minLeadMin * B3_MIN_MS) return fail("LEAD_TIME", `ต้องจองล่วงหน้าอย่างน้อย ${rules.minLeadMin} นาที`);
  if (startMin % rules.stepMin !== 0) return fail("OFF_GRID", `เวลาเริ่มต้องเป็นช่วงทุก ${rules.stepMin} นาที`);
  if (staffId !== null && !inWindows(cands[0].windows, startMin, cands[0].durationMin)) {
    return fail("OUTSIDE_HOURS", `${cands[0].name} ไม่ได้ทำงานในช่วงเวลาที่เลือก`);
  }
  if (cands.length === 0) return fail("FULL", FULL_REASON);

  // ตรวจล่วงหน้าแบบไม่ล็อก (ไม่นับแถวตัวเอง) — ผลจริงตัดสินใต้ล็อก
  const buf = (() => {
    const j = cur.policySnapshot && typeof cur.policySnapshot === "object" ? (cur.policySnapshot as { job?: { bufferMin?: unknown } }).job : undefined;
    return typeof j?.bufferMin === "number" && Number.isFinite(j.bufferMin) ? j.bufferMin : service.bufferMin;
  })();
  {
    const rows = await busyRowsExcept(prisma, tenantId, cands.map((c) => c.staffId), dateStr, cur.id);
    const anyFree = cands.some((c) => selfQuotaOk(c, dayLoadOf(rows, c.staffId, dateStr), c.durationMin + buf) && slotClear(dateStr, startMin, c, buf, rows, true));
    if (!anyFree) return fail("FULL", FULL_REASON);
  }

  const { lockAppt, retryBusy } = await import("./queue-line");
  const { lockUnitTx, LINE_TX } = await import("./planner-run");
  type TxOut = { ok: true; startAt: Date } | { ok: false; code: SelfRescheduleFail; reason: string };
  const res = await retryBusy(() => prisma.$transaction(async (tx): Promise<TxOut> => {
    await lockUnitTx(tx, ctx); // advisory สาขา → ช่างทั้งสาขา (ตัวเดิม + ตัวใหม่ ตาม sortOrder)
    const a = await lockAppt(tx, ctx, cur.id);
    if (!a || a.kind !== "BOOKED") return fail("NOT_FOUND", SELF_R.NOT_FOUND);
    const live = await tx.appointment.findFirst({ where: { id: a.id, tenantId, unitId }, select: { rescheduleCount: true, assignMode: true, channel: true, depositSatang: true, depositPaidAt: true } });
    if (!live) return fail("NOT_FOUND", SELF_R.NOT_FOUND);
    const st = selfChangeState({ status: a.status, startAt: a.startAt, rescheduleCount: live.rescheduleCount }, pol, now);
    if (st.rescheduleBlock) return fail(st.rescheduleBlock, SELF_R[st.rescheduleBlock]);
    // คำขอพร้อมกันอีกทางเพิ่งย้ายนัดไปเวลา/ช่างนี้แล้ว ⇒ แพ้ (ไม่นับซ้ำเป็นการเลื่อนครั้งใหม่)
    if (sameAs({ startAt: a.startAt, staffId: a.staffId, assignMode: live.assignMode })) return fail("LOST_RACE", SELF_R.LOST_RACE);
    let chosen: B3Cand | null = null;
    for (const c of cands) {
      const rows = await busyRowsExcept(tx, tenantId, [c.staffId], dateStr, a.id);
      if (!selfQuotaOk(c, dayLoadOf(rows, c.staffId, dateStr), c.durationMin + buf)) continue;
      if (!slotClear(dateStr, startMin, c, buf, rows, true)) continue;
      chosen = c;
      break;
    }
    if (!chosen) return fail("FULL", FULL_REASON);
    const data: Prisma.AppointmentUncheckedUpdateManyInput = {
      startAt,
      endAt: localToUtc(dateStr, startMin + chosen.durationMin + buf),
      staffId: chosen.staffId,
      assignMode: staffId === null ? "ANY" : "SPECIFIC",
      rescheduleCount: live.rescheduleCount + 1,
      plannedStartAt: null,
      plannedStaffId: null,
      lateAt: null,
      policySnapshot: snapAfterSelfMove(a.policySnapshot, chosen.durationMin, buf),
      // O1: requireConfirm ⇒ ร้านยืนยันเวลาใหม่ (PENDING) — ยกเว้นนัดที่ยังค้างมัดจำตามกติกาถือช่อง (PENDING จะถูก expireDepositHolds ยกเลิกทันทีเพราะ createdAt เก่า) ⇒ คงสถานะเดิม
      ...(pol.requireConfirm && !(holdMinutesOf(live.channel, live.depositSatang, a.policySnapshot) !== null && live.depositPaidAt === null)
        ? { status: "PENDING" as AppointmentStatus } : {}),
    };
    const w = await tx.appointment.updateMany({
      where: { id: a.id, tenantId, unitId, status: a.status, rescheduleCount: live.rescheduleCount },
      data,
    });
    if (w.count !== 1) return fail("LOST_RACE", SELF_R.LOST_RACE);
    // O7: คีย์แบบ B.4 · ถ้าคีย์นี้เคยใช้แล้ว (กลับไปเวลา/ช่างเดิม) ⇒ ต่อท้ายครั้งที่เลื่อน กัน event หาย
    const baseKey = `booking.rescheduled#${a.id}#${startAt.toISOString()}#${chosen.staffId}`;
    const used = await tx.outboxEvent.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: baseKey } }, select: { id: true } });
    await emitOutbox(tx, {
      tenantId, unitId, type: "booking.rescheduled",
      idempotencyKey: used ? `${baseKey}#${live.rescheduleCount + 1}` : baseKey,
      payload: {
        appointmentId: a.id, unitId: a.unitId, staffId: chosen.staffId, kind: a.kind, channel: a.channel, serviceId: a.serviceId,
        fromStartAt: a.startAt.toISOString(), fromStaffId: a.staffId, startAt: startAt.toISOString(), by: "CUSTOMER",
      },
    });
    return { ok: true, startAt };
  }, LINE_TX));
  if (!res) return fail("BUSY", SELF_R.BUSY);
  if (res.ok) await replanAfterCommit(tenantId, unitId, now);
  return res;
}
// ◂ SVC B.7

// ═════════ SVC B.8 ▸ มัดจำรุ่นแรก — ตัวช่วยฐานข้อมูลของ booking/deposit.ts (ใบสั่ง svc-brief-b.8 §3.7 · เพิ่มเท่านั้น) ═════════
// 🔴 เงินผ่านฟังก์ชันโมดูลของ POS เท่านั้น (moduleTakeDeposit · moduleForfeitDeposit) + createSale จุดเดียวของไฟล์ (bookingTxSale)
// 🔴 แถวนัด = ตัวตัดสินเดียว: ผูกใบรับใต้ FOR UPDATE ของแถว (CAS depositPaidAt IS NULL) + event/audit ใน tx เดียวกัน
// 🔴 ไม่มี connection ที่สองใต้ tx · event นอก tx (บิลริบ) กันชน unique ด้วยการกลืน P2002 (คีย์เดียวกัน = event เดียว)

type HoldReleased = { id: string; tenantId: string; unitId: string; staffId: string; kind: string; channel: string | null; serviceId: string; depositSatang: number };
/** booking.cancelled ของนัดที่ปล่อยช่องเพราะไม่จ่ายมัดจำ (คีย์เดียวกับทางยกเลิกอื่น) — เรียกใน tx ของ UPDATE */
async function emitHoldReleasedTx(tx: Prisma.TransactionClient, r: HoldReleased): Promise<void> {
  await emitOutbox(tx, {
    tenantId: r.tenantId, unitId: r.unitId, type: "booking.cancelled", idempotencyKey: `booking.cancelled#${r.id}`,
    payload: {
      appointmentId: r.id, unitId: r.unitId, staffId: r.staffId, kind: r.kind, channel: r.channel, serviceId: r.serviceId,
      reason: "DEPOSIT_TIMEOUT", from: "PENDING", depositSatang: Number(r.depositSatang), depositPaid: false,
    },
  });
}

/** emit นอก tx — คำขอพร้อมกันชน unique ของคีย์ = มีแถวแล้ว (เงียบ) */
async function emitOutsideTxOnce(input: Parameters<typeof emitOutbox>[1]): Promise<void> {
  try {
    await emitOutbox(prisma, input);
  } catch (e) {
    if (!isP2002(e)) throw e;
  }
}

/** ระดับสมาชิกเรียงต่ำ → สูง (Customer.tier) · ค่าตั้งที่ไม่ใช่ 4 ตัวนี้ = ไม่ยกเว้นใคร */
const MEMBER_TIER_RANK: Readonly<Record<string, number>> = { MEMBER: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

/** #37: ลูกค้าสมาชิก (ยืนยันตัวตนแล้ว) ได้ยกเว้นมัดจำไหม — คืนระดับของลูกค้าเมื่อ ≥ booking.deposit.memberExemptTier (ค่าตั้งปัจจุบัน) · อื่น null */
export async function memberExemptTierOf(ctx: { tenantId: string; unitId: string }, customerId: string): Promise<string | null> {
  const r = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.deposit.memberExemptTier"], { unitId: ctx.unitId });
  const want = r["booking.deposit.memberExemptTier"]?.value;
  const need = typeof want === "string" ? MEMBER_TIER_RANK[want.trim().toUpperCase()] : undefined;
  if (!need) return null;
  const c = await prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { tier: true } });
  const have = c ? MEMBER_TIER_RANK[String(c.tier)] : undefined;
  return have && have >= need ? String(c!.tier) : null;
}

/** หน้าจอง (อ่านอย่างเดียว): ตัวตน LINE ที่ยืนยันแล้ว ⇒ ระดับที่ยกเว้นมัดจำ หรือ null (สมาชิกของระบบสมาชิกที่ผูกสาขา · ผูก Party หรือเบอร์เดียวกับ Party) */
export async function memberExemptTierForIdentity(ctx: { tenantId: string; unitId: string }, ident: { partyId: string }): Promise<string | null> {
  // V6 (มติผู้คุม · บทเรียน B.9): Customer.partyId === Party ของลิงก์ตัวตนเท่านั้น — ไม่หาจากเบอร์ (เบอร์ใน Party ไม่ผ่าน OTP)
  const memberSystemId = await systemForUnit(ctx.tenantId, ctx.unitId, "MEMBER");
  if (!memberSystemId || typeof ident?.partyId !== "string" || !ident.partyId) return null;
  const c = await prisma.customer.findFirst({
    where: { tenantId: ctx.tenantId, memberSystemId, partyId: ident.partyId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return c ? memberExemptTierOf(ctx, c.id) : null;
}

// ── ข้อมูลมัดจำของนัด (สถานะคิดจากข้อมูล §3.1) ──
export type DepositFacts = {
  appt: {
    id: string; tenantId: string; unitId: string; status: string; channel: string | null; depositSatang: number; depositPaidAt: Date | null; depositSaleId: string | null;
    cancelReason: string | null; createdAt: Date; startAt: Date; policySnapshot: unknown; customerId: string | null; customerName: string; customerPhone: string;
    serviceName: string; staffName: string | null;
  };
  dep: { id: string; amountSatang: number; usedSatang: number; refundedSatang: number; status: string; receiptNo: string | null } | null;
  receiptNo: string | null;
  /** Σ บิลริบ PAID ของมัดจำ (ทางจองคิว + ทางหน้าขาย · V18) */
  forfeitedSatang: number;
  /** มีบิลริบของมัดจำ/นัด สถานะใดก็ได้ (รวม VOIDED) */
  forfeitBillEver: boolean;
  slip: { id: string; status: string } | null;
};

/** ค่ามัดจำเพิ่มเติมใน policySnapshot.deposit (additive · ไม่มี migration) */
export type DepositSnap = {
  exempt?: string; tier?: string;
  /** V21: ร้านยอมรับยอดที่ได้ (UNDERPAID) */
  accepted?: boolean;
  /** V2/V3: ยกเลิกช้า — จ่ายแล้ว ณ ตอน CAS ยกเลิก · ยอดที่ลูกค้ายอมให้เก็บ */
  late?: { paid: boolean; acceptSatang: number };
  /** เงินเข้าหลังนัดจบ/ปล่อยช่อง (late_money) — ค้างคืนเต็ม ไม่เข้ารอริบ */
  lateMoney?: boolean;
  /** V4: ด่านแนบสลิปต่อนัด */
  slipClaim?: { key: string; until: number };
};
export function depositSnapOf(snap: unknown): DepositSnap {
  const d = snap && typeof snap === "object" && !Array.isArray(snap) ? (snap as Record<string, unknown>).deposit : undefined;
  return d && typeof d === "object" && !Array.isArray(d) ? (d as DepositSnap) : {};
}

const FACT_APPT = {
  id: true, tenantId: true, unitId: true, status: true, channel: true, depositSatang: true, depositPaidAt: true, depositSaleId: true, cancelReason: true,
  createdAt: true, startAt: true, policySnapshot: true, customerId: true, customerName: true, customerPhone: true,
  service: { select: { name: true } }, staff: { select: { name: true } },
} as const;

async function factsFor(tenantId: string, rows: Prisma.AppointmentGetPayload<{ select: typeof FACT_APPT }>[]): Promise<DepositFacts[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const saleIds = rows.map((r) => r.depositSaleId).filter((x): x is string => !!x);
  const [deps, sales, slips] = await Promise.all([
    saleIds.length ? prisma.posDeposit.findMany({ where: { tenantId, receiptSaleId: { in: saleIds } }, select: { id: true, receiptSaleId: true, amountSatang: true, usedSatang: true, refundedSatang: true, status: true, receiptNo: true } }) : [],
    saleIds.length ? prisma.posSale.findMany({ where: { tenantId, id: { in: saleIds } }, select: { id: true, receiptNo: true } }) : [],
    prisma.paymentSlip.findMany({ where: { tenantId, domain: "BOOKING", refType: "APPT_DEPOSIT", refId: { in: ids } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, refId: true, status: true } }),
  ]);
  const depIds = deps.map((d) => d.id);
  // V18: บิลริบของมัดจำ ไม่ว่าออกทางจองคิว (BOOKING) หรือหน้าขาย (POS) — คีย์ dep-forfeit:<PosDeposit.id>
  const forfeits = await prisma.posSale.findMany({
    where: {
      tenantId, docType: "SALE", idempotencyKey: { startsWith: "dep-forfeit:" },
      OR: [{ sourceModule: "BOOKING", sourceId: { in: ids } }, ...depIds.map((d) => ({ idempotencyKey: { startsWith: `dep-forfeit:${d}` } }))],
    },
    select: { idempotencyKey: true, sourceModule: true, sourceId: true, status: true, grandTotalSatang: true },
  });
  const depOf = new Map(deps.map((d) => [d.receiptSaleId, d]));
  const saleOf = new Map(sales.map((s) => [s.id, s]));
  const slipOf = new Map<string, { id: string; status: string }>();
  for (const s of slips) if (!slipOf.has(s.refId)) slipOf.set(s.refId, { id: s.id, status: s.status });
  return rows.map((r) => {
    const d = r.depositSaleId ? depOf.get(r.depositSaleId) : undefined;
    const mine = forfeits.filter((f) => (d && (f.idempotencyKey ?? "").startsWith(`dep-forfeit:${d.id}`)) || (f.sourceModule === "BOOKING" && f.sourceId === r.id));
    return {
      appt: {
        id: r.id, tenantId: r.tenantId, unitId: r.unitId, status: String(r.status), channel: r.channel, depositSatang: r.depositSatang, depositPaidAt: r.depositPaidAt,
        depositSaleId: r.depositSaleId, cancelReason: r.cancelReason, createdAt: r.createdAt, startAt: r.startAt, policySnapshot: r.policySnapshot,
        customerId: r.customerId, customerName: r.customerName, customerPhone: r.customerPhone, serviceName: r.service?.name ?? "", staffName: r.staff?.name ?? null,
      },
      dep: d ? { id: d.id, amountSatang: d.amountSatang, usedSatang: d.usedSatang, refundedSatang: d.refundedSatang, status: String(d.status), receiptNo: d.receiptNo } : null,
      receiptNo: d?.receiptNo ?? (r.depositSaleId ? (saleOf.get(r.depositSaleId)?.receiptNo ?? null) : null),
      forfeitedSatang: mine.filter((f) => f.status === "PAID").reduce((t, f) => t + f.grandTotalSatang, 0),
      forfeitBillEver: mine.length > 0,
      slip: slipOf.get(r.id) ?? null,
    };
  });
}

/** ข้อมูลมัดจำของนัดในหน่วยนี้ (นัด BOOKED ของ ctx เท่านั้น · หน่วยอื่น/ร้านอื่น ⇒ null) */
export async function depositFactsOf(ctx: { tenantId: string; unitId: string }, appointmentId: string): Promise<DepositFacts | null> {
  if (typeof appointmentId !== "string" || !appointmentId || appointmentId.length > 200) return null;
  const row = await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId: ctx.tenantId, unitId: ctx.unitId, kind: "BOOKED" }, select: FACT_APPT });
  return row ? ((await factsFor(ctx.tenantId, [row]))[0] ?? null) : null;
}

/**
 * V7 คิวมัดจำ: SQL กรองเฉพาะแถวที่ยังค้าง — ยังถือช่องและยังไม่จ่าย · จ่ายแล้วแต่ยอดไม่ตรง (ขาด/เกิน) ที่ร้านยังไม่ยอมรับ ·
 * จบแบบไม่ใช้บริการ (ยกเลิก/ไม่มา) ที่มัดจำยังมีคงเหลือ · เรียงเวลานัด · แบ่งหน้า (offset/limit · คืน hasMore — ไม่ตัดทิ้งเงียบ) · กรองช่วงวันได้
 */
export async function depositFactsForQueue(
  ctx: { tenantId: string; unitId: string },
  page: { offset?: number; limit?: number; fromMs?: number | null; toMs?: number | null } = {},
): Promise<{ facts: DepositFacts[]; hasMore: boolean }> {
  const limit = Math.min(200, Math.max(1, Math.floor(page.limit ?? 200)));
  const offset = Math.max(0, Math.floor(page.offset ?? 0));
  const from = typeof page.fromMs === "number" && Number.isFinite(page.fromMs) ? new Date(page.fromMs) : null;
  const to = typeof page.toMs === "number" && Number.isFinite(page.toMs) ? new Date(page.toMs) : null;
  const idRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT a."id" FROM "Appointment" a
    LEFT JOIN "PosDeposit" d ON d."receiptSaleId" = a."depositSaleId" AND d."tenantId" = a."tenantId"
    WHERE a."tenantId" = ${ctx.tenantId} AND a."unitId" = ${ctx.unitId} AND a."kind" = 'BOOKED'
      AND (${from}::timestamptz IS NULL OR a."startAt" >= ${from}::timestamptz)
      AND (${to}::timestamptz IS NULL OR a."startAt" < ${to}::timestamptz)
      AND (
        (a."status" IN ('PENDING', 'CONFIRMED') AND a."depositSatang" > 0 AND a."depositPaidAt" IS NULL)
        OR (a."status" IN ('PENDING', 'CONFIRMED') AND a."depositPaidAt" IS NOT NULL AND d."id" IS NOT NULL AND d."amountSatang" <> a."depositSatang"
            AND COALESCE(a."policySnapshot" -> 'deposit' ->> 'accepted', '') <> 'true')
        OR (a."status" IN ('CANCELLED', 'NO_SHOW') AND a."depositPaidAt" IS NOT NULL
            AND (d."id" IS NULL OR (d."status" = 'OPEN' AND d."amountSatang" - d."usedSatang" - d."refundedSatang" > 0)))
      )
    ORDER BY a."startAt" ASC, a."id" ASC
    OFFSET ${offset} LIMIT ${limit + 1}`;
  const hasMore = idRows.length > limit;
  const ids = idRows.slice(0, limit).map((r) => r.id);
  if (!ids.length) return { facts: [], hasMore };
  const rows = await prisma.appointment.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: ids } }, select: FACT_APPT });
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
  return { facts: await factsFor(ctx.tenantId, rows), hasMore };
}

/** สลิปของร้าน (อ่านจากฐานใหม่เสมอ · consumer ไม่เชื่อ payload) */
export async function depositSlipOf(tenantId: string, slipId: string) {
  if (typeof slipId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(slipId)) return null;
  return prisma.paymentSlip.findFirst({
    where: { id: slipId, tenantId },
    select: { id: true, unitId: true, domain: true, refType: true, refId: true, status: true, amountSatang: true, expectedSatang: true, checks: true },
  });
}

/** audit ของนัด (กันเขียนซ้ำ/ตรวจว่าสลิปนี้ลงเงินแล้ว) */
export async function depositAuditExists(tenantId: string, appointmentId: string, action: string, slipId?: string): Promise<boolean> {
  const hit = await prisma.auditLog.findFirst({
    where: { tenantId, action, targetType: "Appointment", targetId: appointmentId, ...(slipId ? { after: { path: ["slipId"], equals: slipId } } : {}) },
    select: { id: true },
  });
  return !!hit;
}
export async function writeDepositAudit(a: { tenantId: string; unitId: string; appointmentId: string; action: string; actorType: "USER" | "SYSTEM"; actorId: string; after: Record<string, unknown> }): Promise<void> {
  await prisma.auditLog.create({
    data: { tenantId: a.tenantId, unitId: a.unitId, actorType: a.actorType, actorId: a.actorId, action: a.action, targetType: "Appointment", targetId: a.appointmentId, after: a.after as Prisma.InputJsonValue },
  });
}

/** ใบรับมัดจำของนัดที่ยัง PAID (คีย์ฐาน booking-deposit-<id> หรือ -r<n>) — ใช้เมื่อสองทางรับเงินชนคีย์เดียวกันด้วย payload ต่างกัน */
export async function liveDepositReceiptOf(tenantId: string, appointmentId: string): Promise<string | null> {
  const s = await prisma.posSale.findFirst({
    where: { tenantId, sourceModule: "POS_DEPOSIT", status: "PAID", docType: "SALE", idempotencyKey: { startsWith: `booking-deposit-${appointmentId}` } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return s?.id ?? null;
}

export type TakeDepositResult = { ok: true; saleId: string | null; duplicated: boolean } | { ok: false; code: "SHIFT_REQUIRED" | "CONFLICT" | "BUSY"; reason: string };
/**
 * ใบรับมัดจำของนัด (ทุกทางรับเงิน: สลิปอนุมัติ · ร้านกดยืนยัน) — moduleTakeDeposit คีย์ฐานเดียวกับ recordDeposit (`booking-deposit-<id>`) ⇒
 * ยิงซ้ำ/พร้อมกัน/สองทาง = ใบรับเดียว · ไม่ผูก POS ⇒ saleId null (บันทึก depositPaidAt เฉย ๆ แบบ recordDeposit) · ไม่แตะแถวนัด
 */
export async function takeAppointmentDeposit(i: {
  tenantId: string; unitId: string; appointmentId: string; amountSatang: number; payType: PosPayType; customerId: string | null; customerName: string | null; serviceName: string;
}): Promise<TakeDepositResult> {
  const posSystemId = await systemForUnit(i.tenantId, i.unitId, "POS");
  if (!posSystemId) return { ok: true, saleId: null, duplicated: false };
  try {
    const posDeposit = await import("@/lib/modules/pos/deposit");
    const sale = await posDeposit.moduleTakeDeposit(
      { tenantId: i.tenantId, unitId: i.unitId, systemId: posSystemId, keyBase: `booking-deposit-${i.appointmentId}`, amountSatang: i.amountSatang, payType: i.payType, customerId: i.customerId, customerName: i.customerName, note: `มัดจำ ${i.serviceName}`, createdBy: "module:booking" },
      (tx, k) =>
        bookingTxSale(tx, {
          tenantId: i.tenantId,
          unitId: i.unitId,
          systemId: posSystemId,
          sourceModule: k.sourceModule,
          sourceId: k.sourceId,
          idempotencyKey: k.idempotencyKey,
          lines: [{ name: `มัดจำ ${i.serviceName}`, qty: 1, unitPriceSatang: i.amountSatang }],
          payMethods: [{ type: k.payType, amountSatang: i.amountSatang }],
        }),
    );
    return { ok: true, saleId: sale.saleId, duplicated: sale.duplicated };
  } catch (e) {
    if (e instanceof pos.PosSaleError) {
      if (e.code === "IDEMPOTENCY_CONFLICT") return { ok: false, code: "CONFLICT", reason: e.message };
      if (e.code === "SHIFT_REQUIRED" || e.code === "SHIFT_CLOSED") return { ok: false, code: "SHIFT_REQUIRED", reason: e.message };
    }
    const code = (e as { code?: unknown } | null)?.code;
    if (code === "P2002" || code === "P2034" || code === "P2028" || (e instanceof Error && e.message.startsWith("ระบบไม่ว่าง"))) return { ok: false, code: "BUSY", reason: "ระบบไม่ว่าง — ลองอีกครั้ง" };
    throw e;
  }
}

const isRetryableTx = (e: unknown): boolean => {
  const c = (e as { code?: unknown; meta?: { code?: unknown } } | null);
  return c?.code === "P2034" || c?.code === "40P01" || c?.meta?.code === "40P01" || (e instanceof Error && /deadlock detected|40P01/.test(e.message));
};
/** tx สั้นของแถวนัด: deadlock/serialization ⇒ ลองใหม่ 1 ครั้ง แล้ว BUSY (null) */
async function apptTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await prisma.$transaction(fn, { maxWait: 15_000, timeout: 20_000 });
    } catch (e) {
      if (!isRetryableTx(e)) throw e;
    }
  }
  return null;
}

type LockedAppt = { id: string; status: string; cancelReason: string | null; depositSatang: number; depositPaidAt: Date | null; depositSaleId: string | null; policySnapshot: unknown };
async function lockApptRow(tx: Prisma.TransactionClient, tenantId: string, unitId: string, id: string): Promise<LockedAppt | null> {
  const [r] = await tx.$queryRaw<LockedAppt[]>`
    SELECT "id", "status"::text AS "status", "cancelReason", "depositSatang", "depositPaidAt", "depositSaleId", "policySnapshot"
    FROM "Appointment" WHERE "id" = ${id} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND "kind" = 'BOOKED' FOR UPDATE`;
  return r ?? null;
}
/** policySnapshot + deposit.<patch> (additive · คีย์อื่นคงเดิม) */
export function withDepositSnap(snap: unknown, patch: Partial<DepositSnap> & Record<string, unknown>): Prisma.InputJsonValue {
  const base = snap && typeof snap === "object" && !Array.isArray(snap) ? (snap as Record<string, unknown>) : {};
  const next: Record<string, unknown> = { ...depositSnapOf(snap) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return { ...base, deposit: next } as unknown as Prisma.InputJsonValue;
}

export type DepositBind =
  | { kind: "BOUND"; status: string; partial: boolean; late: boolean; amountSatang: number }
  | { kind: "ALREADY"; saleId: string | null }
  | { kind: "GONE" }
  | { kind: "BUSY" };
/**
 * ผูกใบรับกับแถวนัด (ตัดสินใต้ล็อกแถว · CAS depositPaidAt IS NULL) — §3.3 ตารางกรณี:
 *   PENDING/CONFIRMED ครบยอด ⇒ CONFIRMED (SLIP: เว้นแต่ snapshot requireConfirm = true) · ขาดยอด ⇒ สถานะคงเดิม · สถานะอื่น ⇒ ไม่ปลุกนัด (late = ค้างคืน) ·
 *   SHOP (ร้านกดยืนยัน) ⇒ CONFIRMED เมื่อยังถือช่อง · จ่ายแล้ว ⇒ ALREADY (ไม่แตะ) · event booking.deposit_paid + audit ใน tx เดียว ·
 *   V8: ยอด = ยอดจริงของใบรับ (PosDeposit) ไม่ใช่ยอดที่ผู้เรียกส่งมา
 */
export async function bindDepositReceipt(i: {
  tenantId: string; unitId: string; appointmentId: string; saleId: string | null; amountSatang: number; via: "SLIP" | "SHOP";
  slipId?: string | null; actorUserId?: string | null; payType?: string | null;
}): Promise<DepositBind> {
  const out = await apptTx(async (tx): Promise<DepositBind> => {
    const row = await lockApptRow(tx, i.tenantId, i.unitId, i.appointmentId);
    if (!row) return { kind: "GONE" };
    if (row.depositPaidAt) return { kind: "ALREADY", saleId: row.depositSaleId };
    const d = i.saleId ? await tx.posDeposit.findUnique({ where: { receiptSaleId: i.saleId }, select: { amountSatang: true, tenantId: true } }) : null;
    const amount = d && d.tenantId === i.tenantId ? d.amountSatang : i.amountSatang;
    const open = row.status === "PENDING" || row.status === "CONFIRMED";
    const required = Number(row.depositSatang);
    const partial = amount < required;
    let status = row.status;
    if (open && (i.via === "SHOP" || (!partial && snapVal(row.policySnapshot, "booking.booking.requireConfirm") !== true))) status = "CONFIRMED";
    const w = await tx.appointment.updateMany({
      where: { id: row.id, tenantId: i.tenantId, unitId: i.unitId, depositPaidAt: null },
      data: {
        depositPaidAt: new Date(), depositSaleId: i.saleId,
        ...(status !== row.status ? { status: status as AppointmentStatus } : {}),
        ...(i.via === "SHOP" && open ? { policySnapshot: withDepositSnap(row.policySnapshot, { accepted: true }) } : {}),
        ...(!open ? { policySnapshot: withDepositSnap(row.policySnapshot, { lateMoney: true }) } : {}),
      },
    });
    if (w.count !== 1) return { kind: "ALREADY", saleId: null };
    await emitOutbox(tx, {
      tenantId: i.tenantId, unitId: i.unitId, type: "booking.deposit_paid", idempotencyKey: `booking.deposit_paid#${row.id}#${i.saleId ?? "none"}`,
      payload: { appointmentId: row.id, unitId: i.unitId, amountSatang: amount, requiredSatang: required, via: i.via, partial, late: !open, status },
    });
    const base = { tenantId: i.tenantId, unitId: i.unitId, targetType: "Appointment", targetId: row.id };
    if (i.via === "SLIP") {
      await tx.auditLog.create({ data: { ...base, actorType: "SYSTEM", actorId: "module:booking", action: "booking.deposit.receive", after: { slipId: i.slipId ?? null, receiptSaleId: i.saleId, amountSatang: amount, partial, late: !open } } });
    } else {
      await tx.auditLog.create({ data: { ...base, actorType: "USER", actorId: i.actorUserId ?? "unknown", action: "booking.deposit.confirm", after: { receiptSaleId: i.saleId, amountSatang: amount, payType: i.payType ?? null, partial, late: !open } } });
    }
    if (!open) {
      await tx.auditLog.create({ data: { ...base, actorType: "SYSTEM", actorId: "module:booking", action: "booking.deposit.late_money", after: { appointmentId: row.id, receiptSaleId: i.saleId, amountSatang: amount, status: row.status, via: i.via } } });
    }
    return { kind: "BOUND", status, partial, late: !open, amountSatang: amount };
  });
  return out ?? { kind: "BUSY" };
}

/** V21: ร้านยอมรับยอดที่ได้ (UNDERPAID) ⇒ CONFIRMED (PENDING เท่านั้นที่เปลี่ยน) + snapshot deposit.accepted + audit booking.deposit.confirm · ไม่ออกใบรับเพิ่ม */
export async function acceptPaidDeposit(i: { tenantId: string; unitId: string; appointmentId: string; actorUserId: string; amountSatang: number }): Promise<"OK" | "GONE" | "BUSY"> {
  const out = await apptTx(async (tx): Promise<"OK" | "GONE"> => {
    const row = await lockApptRow(tx, i.tenantId, i.unitId, i.appointmentId);
    if (!row || !row.depositPaidAt || (row.status !== "PENDING" && row.status !== "CONFIRMED")) return "GONE";
    await tx.appointment.updateMany({
      where: { id: row.id, tenantId: i.tenantId, unitId: i.unitId, status: row.status as AppointmentStatus },
      data: { status: "CONFIRMED", policySnapshot: withDepositSnap(row.policySnapshot, { accepted: true }) },
    });
    await tx.auditLog.create({
      data: { tenantId: i.tenantId, unitId: i.unitId, actorType: "USER", actorId: i.actorUserId, action: "booking.deposit.confirm", targetType: "Appointment", targetId: row.id, after: { receiptSaleId: row.depositSaleId, amountSatang: i.amountSatang, accepted: true } },
    });
    return "OK";
  });
  return out ?? "BUSY";
}

// ── V4 ด่านแนบสลิปต่อนัด (CAS บน policySnapshot.deposit.slipClaim · ไม่ถือ tx ข้ามการเรียกตัวตรวจสลิป) ──
const SLIP_CLAIM_TTL_MS = 60_000;
export type SlipClaim = { ok: true; row: { status: string; cancelReason: string | null; depositPaidAt: Date | null; depositSatang: number } } | { ok: false; code: "HELD" | "GONE" | "BUSY" };
/** จองสิทธิ์แนบสลิปของนัด: ว่าง/หมดอายุ/key เดียวกัน ⇒ ได้ · ถืออยู่โดย key อื่น ⇒ HELD · หมดอายุตามนาฬิกาจริง (กันค้างเมื่อโพรเซสตาย) */
export async function claimSlipSubmit(ctx: { tenantId: string; unitId: string }, appointmentId: string, key: string): Promise<SlipClaim> {
  const out = await apptTx(async (tx): Promise<SlipClaim> => {
    const row = await lockApptRow(tx, ctx.tenantId, ctx.unitId, appointmentId);
    if (!row) return { ok: false, code: "GONE" };
    const c = depositSnapOf(row.policySnapshot).slipClaim;
    const nowMs = Date.now();
    if (c && typeof c.until === "number" && c.until > nowMs && c.key !== key) return { ok: false, code: "HELD" };
    await tx.appointment.updateMany({ where: { id: row.id, tenantId: ctx.tenantId, unitId: ctx.unitId }, data: { policySnapshot: withDepositSnap(row.policySnapshot, { slipClaim: { key, until: nowMs + SLIP_CLAIM_TTL_MS } }) } });
    return { ok: true, row: { status: row.status, cancelReason: row.cancelReason, depositPaidAt: row.depositPaidAt, depositSatang: Number(row.depositSatang) } };
  });
  return out ?? { ok: false, code: "BUSY" };
}
/** ปล่อยสิทธิ์แนบสลิป (เฉพาะ key ของตัวเอง) — ไม่ throw */
export async function releaseSlipSubmit(ctx: { tenantId: string; unitId: string }, appointmentId: string, key: string): Promise<void> {
  try {
    await apptTx(async (tx) => {
      const row = await lockApptRow(tx, ctx.tenantId, ctx.unitId, appointmentId);
      if (!row || depositSnapOf(row.policySnapshot).slipClaim?.key !== key) return;
      await tx.appointment.updateMany({ where: { id: row.id, tenantId: ctx.tenantId, unitId: ctx.unitId }, data: { policySnapshot: withDepositSnap(row.policySnapshot, { slipClaim: undefined }) } });
    });
  } catch (e) {
    console.error(`[booking] ปล่อยสิทธิ์แนบสลิปนัด ${appointmentId} ไม่สำเร็จ`, e instanceof Error ? e.message : e);
  }
}

/** V11: ก่อนคืนมัดจำ — ตรวจใต้ล็อกแถวว่านัดจบแบบไม่ใช้บริการ (CANCELLED/NO_SHOW) และยังอ้างใบรับเดิม */
export async function lockForRefund(ctx: { tenantId: string; unitId: string }, appointmentId: string, receiptSaleId: string): Promise<"OK" | "BAD_STATE" | "BUSY"> {
  const out = await apptTx(async (tx): Promise<"OK" | "BAD_STATE"> => {
    const row = await lockApptRow(tx, ctx.tenantId, ctx.unitId, appointmentId);
    if (!row || (row.status !== "CANCELLED" && row.status !== "NO_SHOW") || row.depositSaleId !== receiptSaleId) return "BAD_STATE";
    return "OK";
  });
  return out ?? "BUSY";
}

/** ยอดของใบคืนเงิน (CN) ของร้าน — ใช้เป็นยอดใน audit/event คืนมัดจำ (V11) */
export async function refundSaleTotalOf(tenantId: string, saleId: string): Promise<number | null> {
  const s = await prisma.posSale.findFirst({ where: { id: saleId, tenantId }, select: { grandTotalSatang: true } });
  return s ? s.grandTotalSatang : null;
}

// ── ริบ (ไม่มา · ยกเลิกช้า) — §3.5 ──
/** % ที่ร้านเก็บของนัด: snapshot ชนะ · แถวเก่าไม่มีคีย์ ⇒ ค่าตั้งปัจจุบัน · null/≤0/ไม่ใช่ตัวเลข ⇒ null (ไม่ริบ) · เพดาน 100 */
export async function depositForfeitPctOf(tenantId: string, unitId: string, appointmentId: string): Promise<number | null> {
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId, unitId }, select: { policySnapshot: true } });
  if (!a) return null;
  const key = "booking.deposit.forfeitPct";
  const vals = a.policySnapshot && typeof a.policySnapshot === "object" ? (a.policySnapshot as PolicySnap).values : undefined;
  const v = vals && typeof vals === "object" && Object.prototype.hasOwnProperty.call(vals, key)
    ? vals[key]
    : (await resolveSettings({ tenantId }, [key], { unitId }))[key]?.value;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(100, v) : null;
}

const FORFEIT_LATE_LINE = "มัดจำริบ — ยกเลิกช้า";
class ForfeitAgain extends Error {}

/** หลังได้บิลริบทาง POS (100% ไม่มา): event booking.deposit_forfeited (ครั้งเดียวต่อบิลริบ) + audit booking.deposit.forfeit (บิลใหม่) — ไม่ throw · หนี้ V16: ทางนี้ยังนอก tx ของบิล */
async function afterDepositForfeit(a: { tenantId: string; unitId: string; appointmentId: string; saleId: string; satang: number; pct: number; reason: "NO_SHOW" | "CUSTOMER_LATE"; fresh: boolean }): Promise<void> {
  try {
    await emitOutsideTxOnce({
      tenantId: a.tenantId, unitId: a.unitId, type: "booking.deposit_forfeited", idempotencyKey: `booking.deposit_forfeited#${a.saleId}`,
      payload: { appointmentId: a.appointmentId, unitId: a.unitId, forfeitSatang: a.satang, pct: a.pct, reason: a.reason },
    });
    if (a.fresh) {
      await writeDepositAudit({ tenantId: a.tenantId, unitId: a.unitId, appointmentId: a.appointmentId, action: "booking.deposit.forfeit", actorType: "SYSTEM", actorId: "module:booking", after: { saleId: a.saleId, forfeitSatang: a.satang, pct: a.pct, reason: a.reason } });
    }
  } catch (e) {
    console.error(`[booking] event/audit ริบมัดจำนัด ${a.appointmentId} ไม่สำเร็จ`, e instanceof Error ? e.message : e);
  }
}

/**
 * บิลริบ min(floor(คงเหลือ × pct / 100), capSatang) ผ่าน bookingTxSale (แถว DEPOSIT อ้างใบรับ · คีย์ dep-forfeit:<PosDeposit.id> แบบ POS ⇒ moduleUnforfeitDeposit ใช้ได้) ·
 * ล็อกคีย์ (advisory เดียวกับ createSale) ⇒ ยิงซ้ำ/พร้อมกัน = บิลเดียว · event + audit ใน tx ของบิล (V16) · ส่วนที่เหลือคงอยู่ในมัดจำ (ค้างคืน) · ไม่ throw
 */
async function forfeitDepositPartial(
  tenantId: string, unitId: string, appointmentId: string, pct: number, reason: "NO_SHOW" | "CUSTOMER_LATE", capSatang: number | null = null, actorId = "module:booking",
): Promise<{ forfeited: boolean; saleId?: string; reason?: string }> {
  try {
    const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId, unitId }, select: { depositPaidAt: true, depositSaleId: true } });
    if (!appt?.depositPaidAt || !appt.depositSaleId) return { forfeited: false };
    const posSystemId = await systemForUnit(tenantId, unitId, "POS");
    if (!posSystemId) return { forfeited: false };
    const d0 = await prisma.posDeposit.findUnique({ where: { receiptSaleId: appt.depositSaleId }, select: { id: true, tenantId: true, unitId: true, receiptSaleId: true, customerId: true, receiptNo: true } });
    if (!d0 || d0.tenantId !== tenantId || d0.unitId !== unitId) return { forfeited: false }; // มัดจำแบบเดิม/ไม่ใช่ของหน่วยนี้ = ไม่แตะ
    const lineName = reason === "CUSTOMER_LATE" ? FORFEIT_LATE_LINE : (await import("@/lib/modules/pos/deposit")).FORFEIT_LINE_NAME;
    for (let attempt = 0; attempt < 4; attempt++) {
      let key: string | null = null;
      for (let round = 0; round <= 20 && key === null; round++) {
        const k = round === 0 ? `dep-forfeit:${d0.id}` : `dep-forfeit:${d0.id}-r${round}`;
        const s = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: k } }, select: { id: true, status: true } });
        if (!s) key = k;
        else if (s.status !== "VOIDED") return { forfeited: true, saleId: s.id };
      }
      if (key === null) return { forfeited: false, reason: "ริบมัดจำไม่สำเร็จ — บิลริบถูกยกเลิกหลายครั้งเกินไป" };
      const lockKey = key;
      try {
        const out = await prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text || ':' || ${lockKey}::text))) l`;
            const again = await tx.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: lockKey } }, select: { id: true, grandTotalSatang: true, status: true } });
            if (again && again.status === "VOIDED") throw new ForfeitAgain();
            if (again) return { kind: "dup" as const, saleId: again.id };
            const d = await tx.posDeposit.findUnique({ where: { id: d0.id }, select: { amountSatang: true, usedSatang: true, refundedSatang: true, status: true } });
            const remaining = d ? d.amountSatang - d.usedSatang - d.refundedSatang : 0;
            if (!d || String(d.status) !== "OPEN" || remaining <= 0) return { kind: "none" as const };
            const formula = Math.floor((remaining * pct) / 100);
            const amount = capSatang === null ? formula : Math.min(formula, Math.max(0, Math.floor(capSatang)));
            if (amount <= 0) return { kind: "none" as const };
            const lines = [{ name: lineName, qty: 1, unitPriceSatang: amount }];
            const r = await bookingTxSale(tx, {
              tenantId, unitId, systemId: posSystemId, sourceModule: "BOOKING", sourceId: appointmentId, idempotencyKey: lockKey, lines,
              payMethods: [{ type: "DEPOSIT", amountSatang: amount, refSaleId: d0.receiptSaleId }],
              ...(d0.customerId ? { memberId: d0.customerId, memberAttachOnly: true } : {}),
            });
            if (r.status !== undefined && r.status !== "PAID") throw new Error("บิลริบมัดจำไม่สำเร็จ");
            await tx.auditLog.create({
              data: {
                tenantId, unitId, actorType: "SYSTEM", actorId: "module:booking", action: "pos.deposit.forfeit", targetType: "PosDeposit", targetId: d0.id,
                after: { saleId: r.saleId, receiptSaleId: d0.receiptSaleId, depositReceiptNo: d0.receiptNo, satang: amount, pct, reason, source: "module:booking" } as Prisma.InputJsonValue,
              },
            });
            // V16: event + audit ของการริบใน tx เดียวกับบิล
            await emitOutbox(tx, {
              tenantId, unitId, type: "booking.deposit_forfeited", idempotencyKey: `booking.deposit_forfeited#${r.saleId}`,
              payload: { appointmentId, unitId, forfeitSatang: amount, pct, reason },
            });
            await tx.auditLog.create({
              data: { tenantId, unitId, actorType: actorId === "module:booking" ? "SYSTEM" : "USER", actorId, action: "booking.deposit.forfeit", targetType: "Appointment", targetId: appointmentId, after: { saleId: r.saleId, forfeitSatang: amount, pct, reason, capSatang } as Prisma.InputJsonValue },
            });
            return { kind: "new" as const, saleId: r.saleId, lines };
          },
          { timeout: 20_000, maxWait: 15_000 },
        );
        if (out.kind === "none") return { forfeited: false };
        if (out.kind === "new") await pos.afterSaleCommitted({ tenantId, unitId, lines: out.lines }, out.saleId);
        return { forfeited: true, saleId: out.saleId };
      } catch (e) {
        if (e instanceof ForfeitAgain) continue;
        if (e instanceof pos.PosSaleError && e.code === "DEPOSIT_EXCEEDS") continue;
        if (e instanceof pos.PosSaleError) return { forfeited: false, reason: `ริบมัดจำไม่สำเร็จ: ${e.message} — ร้านตัดสินริบหรือคืนที่คิวมัดจำ` };
        const code = (e as { code?: unknown } | null)?.code;
        if (code === "P2002" || code === "P2034" || code === "P2028" || isRetryableTx(e)) continue;
        throw e;
      }
    }
    return { forfeited: false, reason: "ริบมัดจำไม่สำเร็จ (ระบบไม่ว่าง) — ร้านตัดสินริบหรือคืนที่คิวมัดจำ" };
  } catch (e) {
    console.error(`[booking] ริบมัดจำนัด ${appointmentId} ล้ม`, e instanceof Error ? e.message : e);
    return { forfeited: false, reason: "ริบมัดจำไม่สำเร็จ — ร้านตัดสินริบหรือคืนที่คิวมัดจำ" };
  }
}

/**
 * ยกเลิกช้า (CANCELLED CUSTOMER_LATE): ริบตาม % ของ snapshot แต่ไม่เกินยอดที่ลูกค้ายอมรับ (V3) · เฉพาะมัดจำที่จ่ายแล้ว ณ ตอนยกเลิก (V2 ·
 * snapshot deposit.late.paid) · V10: มีบิลริบของนัดแล้ว (สถานะใดก็ได้) ⇒ ไม่ริบซ้ำ (เว้นร้านสั่งเองจากคิว · manual) · ไม่ throw
 */
export async function forfeitAfterLateCancel(tenantId: string, unitId: string, appointmentId: string, opts?: { manual?: { actorUserId: string } }): Promise<{ forfeited: boolean; saleId?: string; reason?: string }> {
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId, unitId }, select: { status: true, cancelReason: true, depositPaidAt: true, depositSaleId: true, policySnapshot: true } });
  if (!a || a.status !== "CANCELLED" || a.cancelReason !== "CUSTOMER_LATE" || !a.depositPaidAt || !a.depositSaleId) return { forfeited: false };
  const late = depositSnapOf(a.policySnapshot).late;
  if (!late || late.paid !== true || !(late.acceptSatang > 0)) return { forfeited: false };
  if (!opts?.manual) {
    const prior = await prisma.posSale.findFirst({ where: { tenantId, sourceModule: "BOOKING", sourceId: appointmentId, idempotencyKey: { startsWith: "dep-forfeit:" } }, select: { id: true } });
    if (prior) return { forfeited: false };
  }
  const pct = await depositForfeitPctOf(tenantId, unitId, appointmentId);
  if (pct === null) return { forfeited: false };
  return forfeitDepositPartial(tenantId, unitId, appointmentId, pct, "CUSTOMER_LATE", late.acceptSatang, opts?.manual?.actorUserId ?? "module:booking");
}

/** V5: ร้านสั่งริบจากคิวมัดจำ (FORFEIT_PENDING) — ไม่มา ⇒ ทางเดียวกับ setAppointmentStatus · ยกเลิกช้า ⇒ ตามยอดที่ลูกค้ายอมรับ */
export async function forfeitPendingDeposit(ctx: { tenantId: string; unitId: string }, appointmentId: string, actorUserId: string): Promise<{ forfeited: boolean; saleId?: string; reason?: string }> {
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { status: true, cancelReason: true } });
  if (a?.status === "NO_SHOW") return forfeitNoShowDeposit(ctx.tenantId, ctx.unitId, appointmentId);
  if (a?.status === "CANCELLED" && a.cancelReason === "CUSTOMER_LATE") return forfeitAfterLateCancel(ctx.tenantId, ctx.unitId, appointmentId, { manual: { actorUserId } });
  return { forfeited: false, reason: "นัดนี้ไม่อยู่ในสถานะที่ริบมัดจำได้" };
}
// ◂ SVC B.8
