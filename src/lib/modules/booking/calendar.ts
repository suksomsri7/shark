// ─────────────────────────────────────────────────────────────
// booking/calendar.ts — ปฏิทินนัด วัน/สัปดาห์ · ตามคน/ตามห้อง · ลากย้าย · คลิกช่องว่างจองให้ลูกค้า (SVC B.14 · ใบสั่ง §3)
//
// 🔴 loadCalendar = อ่านอย่างเดียว (ไม่ล็อก ไม่เขียน) · null ⇒ หน้า 404 (ctx ผิด/ข้ามร้าน · ไม่ใช่แถวเดียว · ดูไม่ได้ · วันไม่จริง)
// 🔴 ย้าย = rescheduleByShop ตัวเดียว (ด่านคน J5 + ด่านทรัพยากร B.13 ใต้ล็อก สาขา → ช่าง → ทรัพยากร → แถวนัด) · จอง = bookAppointment ช่อง STAFF
//    ไฟล์นี้ไม่เขียนแถวนัดเอง · ไม่มีสูตรชน/ว่างชุดที่สอง · ไม่มีตัวกันในหน่วยความจำ
// 🔴 X1: ทุกคิวรีผูก tenantId + unitId ของ ctx · ของร้าน/หน่วยอื่น ⇒ NOT_FOUND ข้อความเดียว / ไม่โผล่ใน view
// 🔴 X10: view ไม่มีเบอร์ · อีเมล · token · policySnapshot ดิบ · idempotencyKey · partyId/customerId (ชื่อลูกค้าแสดงได้)
// 🔴 เวลาไทยผ่าน localToUtc / epoch + 7 ชม. (ไม่ใช้นาฬิกาเครื่อง)
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import { resolveSettings } from "@/lib/core/settings";
import { canBookingAction } from "./access";
import { lineAccess } from "./line-access";
import { addDaysStr, bkkDayOf, lineSettingsOf } from "./planner-run";
import { rescheduleByShop } from "./queue-line";
import { RESOURCE_KINDS, RESOURCE_KIND_LABELS_TH, isResourceKind } from "./resource-kinds";
import { overrunMinOf, readHolds, readUnitBlocks, readUnitResources, resourceIdsOfRow, resourceKindsOf, walkInNowByService, type RawReader, type WalkInNowRow } from "./resources";
import { bookAppointment, getUnitHours, isRealDateStr, staffDayProfiles, type BookResult, type StaffDayProfile } from "./service";
import { localToUtc, localWeekday } from "./slots";
import { unitDayWindows } from "./staff-hours";

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;

export type CalendarActor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
export type CalMode = "STAFF" | "RESOURCE";
export type CalRange = "DAY" | "WEEK";
export type CalBlock = {
  appointmentId: string;
  kind: "BOOKED" | "WALKIN";
  status: string;
  startMs: number;
  endMs: number;
  holdEndMs: number;
  label: string;
  serviceName: string;
  staffId: string | null;
  staffName: string | null;
  resourceIds: string[];
  resourceNames: string[];
  ticketNumber: string | null;
  movable: boolean;
};
export type CalClosedCode = "LEAVE" | "OFF" | "SHOP_CLOSED" | "MAINTENANCE";
export type CalColumn = {
  key: string;
  kind: "STAFF" | "RESOURCE" | "UNASSIGNED";
  id: string | null;
  name: string;
  sub: string;
  dateStr: string;
  closed: null | { code: CalClosedCode; reasonTh: string };
  maintenance: { startMs: number; endMs: number }[];
  blocks: CalBlock[];
};
/** การ์ดงานที่เลือก (กล่องข้าง) — ไม่มีเบอร์/ตัวตนลูกค้า (ความชอบลูกค้า = loadJobCustomerNotes ของหน้า ตามสิทธิ์ของมันเอง) */
export type CalCard = {
  appointmentId: string;
  kind: "BOOKED" | "WALKIN";
  status: string;
  label: string;
  ticketNumber: string | null;
  serviceName: string;
  staffId: string | null;
  staffName: string | null;
  resourceIds: string[];
  resourceNames: string[];
  startMs: number;
  endMs: number;
  checkedInMs: number | null;
  priceSatang: number | null;
  depositSatang: number;
  depositPaid: boolean;
  movable: boolean;
  canStart: boolean;
};
export type CalendarView = {
  unitId: string;
  mode: CalMode;
  range: CalRange;
  dateStr: string;
  days: string[];
  prevDateStr: string;
  nextDateStr: string;
  todayStr: string;
  nowMs: number;
  openMin: number | null;
  closeMin: number | null;
  providerLabel: string;
  focusId: string | null;
  focusOptions: { id: string; name: string }[];
  columns: CalColumn[];
  access: { move: boolean; book: boolean };
  summary: { staffWorking: number; staffOnLeave: number; resources: { kind: string; labelTh: string; count: number }[] };
  walkInNow: WalkInNowRow[] | null;
  resourcesNow: { id: string; name: string; kind: string; state: "BUSY" | "NEXT" | "FREE" | "MAINT"; nextStartMs: number | null }[] | null;
  /** ตัวเลือกของฟอร์มจอง/ย้าย (ของหน่วยนี้ · active) */
  options: { staff: { id: string; name: string }[]; resources: { id: string; name: string; kind: string }[]; services: { id: string; name: string; durationMin: number }[] };
  card: CalCard | null;
};

type Ctx = { tenantId: string; unitId: string };
const isStr = (v: unknown): v is string => typeof v === "string" && v !== "";
const okCtx = (c: unknown): c is Ctx => !!c && typeof c === "object" && isStr((c as Ctx).tenantId) && isStr((c as Ctx).unitId);
const memberOf = (a: CalendarActor | null | undefined) =>
  a && typeof a === "object" && (a.role === "OWNER" || a.role === "MANAGER" || a.role === "STAFF")
    ? {
        role: a.role,
        unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
        permissions: a.permissions && typeof a.permissions === "object" && !Array.isArray(a.permissions) ? a.permissions : {},
      }
    : null;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOr = (v: unknown, d: number | null): number | null => (typeof v === "number" && Number.isFinite(v) ? v : d);
const cmpId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const kindLabel = (k: string) => (isResourceKind(k) ? RESOURCE_KIND_LABELS_TH[k] : k);
const MOVABLE = new Set(["PENDING", "CONFIRMED", "LATE"]);

/** เวลาร้านของวัน (เวลาทำการรายสัปดาห์ + วันปิด/เปิดพิเศษ) */
async function shopDay(ctx: Ctx, dateStr: string): Promise<{ openMin: number | null; closeMin: number | null }> {
  const [hours, closure] = await Promise.all([
    getUnitHours(ctx.tenantId, ctx.unitId),
    tenantDb(ctx).bookingClosure.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, date: dateStr }, select: { closed: true, openMin: true, closeMin: true } }),
  ]);
  const w = unitDayWindows({ dateStr, hours, closure: closure ? { closed: closure.closed, openMin: closure.openMin, closeMin: closure.closeMin } : null });
  return w.length ? { openMin: w[0].startMin, closeMin: w[w.length - 1].endMin } : { openMin: null, closeMin: null };
}

/** จันทร์ของสัปดาห์ (ISO) ที่มีวันนี้ — คิดจากวันที่ปฏิทินล้วน */
function mondayOf(ds: string): string {
  return addDaysStr(ds, -((localWeekday(ds) + 6) % 7));
}

type Row = {
  id: string; kind: string; status: string; staffId: string; plannedStaffId: string | null; serviceId: string;
  startAt: Date; endAt: Date; plannedStartAt: Date | null; startedAt: Date | null; checkedInAt: Date | null;
  resourceId: string | null; customerName: string; queueTicketId: string | null; policySnapshot: unknown;
  priceSatang: number; depositSatang: number; depositPaidAt: Date | null;
};
/** เริ่มแสดง: IN_SERVICE = เริ่มจริง · QUEUED/ARRIVED ที่มีแผน = แผน · อื่น = เวลานัด */
const dispStart = (r: Row): number =>
  r.status === "IN_SERVICE" ? (r.startedAt ?? r.startAt).getTime()
    : (r.status === "QUEUED" || r.status === "ARRIVED") && r.plannedStartAt ? r.plannedStartAt.getTime()
    : r.startAt.getTime();
/** นาทีบริการ (ไม่รวม buffer): job.durationMin ?? endAt − startAt − (job.bufferMin ?? buffer ของบริการ) */
function durMsOf(r: Row, svcBuffer: number): number {
  const job = isRec(r.policySnapshot) && isRec(r.policySnapshot.job) ? r.policySnapshot.job : {};
  const d = numOr(job.durationMin, null);
  if (d !== null) return d * MIN_MS;
  return r.endAt.getTime() - r.startAt.getTime() - (numOr(job.bufferMin, svcBuffer) ?? 0) * MIN_MS;
}

/** ช่วงปิดซ่อมที่ตัดวัน (ตัดขอบวัน) */
function clipBlocks(blocks: readonly { resourceId: string; startAt: Date; endAt: Date | null }[], resourceId: string, d0: number, d1: number) {
  return blocks
    .filter((b) => b.resourceId === resourceId && b.startAt.getTime() < d1 && (b.endAt === null || b.endAt.getTime() > d0))
    .map((b) => ({ startMs: Math.max(d0, b.startAt.getTime()), endMs: Math.min(d1, b.endAt === null ? d1 : b.endAt.getTime()) }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}
/** ช่วงปิดซ่อมคลุม [s, e) ทั้งหมดไหม */
function covers(ws: readonly { startMs: number; endMs: number }[], s: number, e: number): boolean {
  let at = s;
  for (const w of ws) {
    if (w.startMs > at) break;
    at = Math.max(at, w.endMs);
    if (at >= e) return true;
  }
  return at >= e;
}

/**
 * ปฏิทินนัด (ใบสั่ง §3.1) — วัน (คอลัมน์ = คน/ห้อง) · สัปดาห์ (7 วันของคน/ห้องที่เลือก) · null ⇒ 404
 * opts.apptId (เพิ่ม · ไม่บังคับ) = การ์ดงานที่เลือก · ไม่ส่ง ⇒ งาน ARRIVED ที่รอนานสุดของวันนี้ (ถ้ามี)
 */
export async function loadCalendar(
  ctx: Ctx,
  actor: CalendarActor,
  opts: { dateStr: string; range?: CalRange; mode?: CalMode; focusId?: string; now?: Date; apptId?: string },
): Promise<CalendarView | null> {
  if (!okCtx(ctx) || !opts || typeof opts !== "object") return null;
  const member = memberOf(actor);
  if (!member) return null;
  const { tenantId, unitId } = ctx;
  if (!lineAccess(member, unitId).view) return null;
  const dateStr = isStr(opts.dateStr) && isRealDateStr(opts.dateStr) ? opts.dateStr : null;
  if (!dateStr) return null;
  if (!(await lineSettingsOf(tenantId, unitId))) return null; // หน่วยไม่ใช่ของร้าน / ไม่ใช่ BOOKING / ไม่ใช่แถวเดียว
  const range: CalRange = opts.range === "WEEK" ? "WEEK" : "DAY";
  const mode: CalMode = opts.mode === "RESOURCE" ? "RESOURCE" : "STAFF";
  const now = opts.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  const nowMs = now.getTime();
  const todayStr = bkkDayOf(nowMs);
  const days = range === "DAY" ? [dateStr] : Array.from({ length: 7 }, (_, i) => addDaysStr(mondayOf(dateStr), i));
  const db = tenantDb(ctx);
  const reader = db as unknown as RawReader; // อ่านดิบของด่าน B.13 (ขอบเขตร้าน/หน่วยในคิวรีเอง)
  const access = { move: canBookingAction(member, unitId, "moveAppointmentAction"), book: canBookingAction(member, unitId, "bookForCustomerAction") };
  const la = lineAccess(member, unitId);

  const d0 = localToUtc(days[0], 0).getTime();
  const d1 = localToUtc(days[days.length - 1], 24 * 60).getTime();
  const [staff, services, resRows, blocks, rows, label, shops, profilesByDay] = await Promise.all([
    db.bookingStaff.findMany({ where: { tenantId, unitId, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
    db.bookingService.findMany({ where: { tenantId, unitId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }], select: { id: true, name: true, durationMin: true, bufferMin: true, active: true } }),
    readUnitResources(reader, tenantId, unitId),
    readUnitBlocks(reader, tenantId, unitId, new Date(d0), new Date(d1)),
    db.appointment.findMany({
      where: { tenantId, unitId, status: { not: "CANCELLED" }, startAt: { gte: new Date(d0 - DAY_MS), lt: new Date(d1 + DAY_MS) } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      select: {
        id: true, kind: true, status: true, staffId: true, plannedStaffId: true, serviceId: true, startAt: true, endAt: true, plannedStartAt: true, startedAt: true,
        checkedInAt: true, resourceId: true, customerName: true, queueTicketId: true, policySnapshot: true, priceSatang: true, depositSatang: true, depositPaidAt: true,
      },
    }),
    resolveSettings({ tenantId }, ["booking.general.providerLabel"], { unitId }),
    Promise.all(days.map((d) => shopDay(ctx, d))),
    Promise.all([...new Set([dateStr, ...days])].map(async (d) => [d, await staffDayProfiles(ctx, d)] as const)),
  ]);
  const profiles = new Map<string, StaffDayProfile[]>(profilesByDay);
  const shopOf = new Map(days.map((d, i) => [d, shops[i]]));
  const svcOf = new Map(services.map((s) => [s.id, s]));
  const kindsOf = await resourceKindsOf(ctx, services.map((s) => s.id));
  const resName = new Map(resRows.map((r) => [r.id, r.name]));
  const activeRes = resRows.filter((r) => r.active);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const pl = label["booking.general.providerLabel"]?.value;
  const providerLabel = typeof pl === "string" && pl.trim() ? pl.trim() : "ผู้ให้บริการ";

  const ticketIds = rows.map((r) => r.queueTicketId).filter(isStr);
  const tickets = ticketIds.length ? await db.queueTicket.findMany({ where: { tenantId, unitId, id: { in: ticketIds } }, select: { id: true, number: true } }) : [];
  const ticketNo = new Map(tickets.map((t) => [t.id, t.number]));

  // งานที่ "เริ่มแสดง" ตกในวันของ view (ไม่รวมยกเลิก)
  type Job = { r: Row; day: string; s: number; e: number; holdStaff: number; resIds: string[]; colStaff: string };
  const daySet = new Set(days);
  const jobs: Job[] = [];
  for (const r0 of rows) {
    const r: Row = { ...r0, kind: String(r0.kind), status: String(r0.status) };
    const s = dispStart(r);
    const day = bkkDayOf(s);
    if (!daySet.has(day)) continue;
    const e = s + durMsOf(r, svcOf.get(r.serviceId)?.bufferMin ?? 0);
    jobs.push({ r, day, s, e, holdStaff: s + (r.endAt.getTime() - r.startAt.getTime()), resIds: resourceIdsOfRow(r.resourceId, r.policySnapshot), colStaff: r.plannedStaffId ?? r.staffId });
  }
  const movableOf = (r: Row) => access.move && r.kind === "BOOKED" && MOVABLE.has(r.status) && r.startAt.getTime() > nowMs;
  const blockOf = (j: Job, holdEndMs: number): CalBlock => {
    const tk = j.r.queueTicketId ? ticketNo.get(j.r.queueTicketId) ?? null : null;
    return {
      appointmentId: j.r.id,
      kind: j.r.kind === "WALKIN" ? "WALKIN" : "BOOKED",
      status: j.r.status,
      startMs: j.s,
      endMs: j.e,
      holdEndMs,
      label: j.r.kind === "WALKIN" ? `${tk ?? ""} walk-in`.trim() : j.r.customerName,
      serviceName: svcOf.get(j.r.serviceId)?.name ?? "",
      staffId: j.colStaff,
      staffName: staffName.get(j.colStaff) ?? null,
      resourceIds: j.resIds,
      resourceNames: j.resIds.map((id) => resName.get(id) ?? ""),
      ticketNumber: tk,
      movable: movableOf(j.r),
    };
  };
  const sortBlocks = (bs: CalBlock[]) => bs.sort((a, b) => a.startMs - b.startMs || cmpId(a.appointmentId, b.appointmentId));

  // ป้ายบริการที่คนทำได้ (ย่อ)
  const activeSvcs = services.filter((s) => s.active);
  const subOfStaff = (staffId: string): string => {
    const p = profiles.get(dateStr)?.find((x) => x.staffId === staffId);
    const names = p?.services === null || p === undefined ? activeSvcs.map((s) => s.name) : p.services.map((x) => svcOf.get(x.serviceId)?.name ?? "").filter(Boolean);
    return names.slice(0, 3).join(" · ") + (names.length > 3 ? " …" : "");
  };
  const staffClosed = (staffId: string, d: string): CalColumn["closed"] => {
    const shop = shopOf.get(d);
    if (!shop || shop.openMin === null) return { code: "SHOP_CLOSED", reasonTh: "ร้านปิดวันนี้" };
    const p = profiles.get(d)?.find((x) => x.staffId === staffId);
    if (p?.onLeave) return { code: "LEAVE", reasonTh: "ลา · อนุมัติแล้วในระบบพนักงาน · ปิดรับจองทั้งวัน" };
    if (!p || p.windows.length === 0) return { code: "OFF", reasonTh: "ไม่ได้เข้างานวันนี้" };
    return null;
  };
  const resMaint = (resourceId: string, d: string) => clipBlocks(blocks, resourceId, localToUtc(d, 0).getTime(), localToUtc(d, 24 * 60).getTime());
  const resClosed = (resourceId: string, d: string): CalColumn["closed"] => {
    const shop = shopOf.get(d);
    if (!shop || shop.openMin === null || shop.closeMin === null) return { code: "SHOP_CLOSED", reasonTh: "ร้านปิดวันนี้" };
    if (covers(resMaint(resourceId, d), localToUtc(d, shop.openMin).getTime(), localToUtc(d, shop.closeMin).getTime())) {
      return { code: "MAINTENANCE", reasonTh: "ปิดซ่อมทั้งวัน · ไม่รับจอง" };
    }
    return null;
  };
  const staffCol = (id: string, d: string, key: string): CalColumn => ({
    key, kind: "STAFF", id, name: staffName.get(id) ?? "", sub: subOfStaff(id), dateStr: d, closed: staffClosed(id, d), maintenance: [],
    blocks: sortBlocks(jobs.filter((j) => j.day === d && j.colStaff === id).map((j) => blockOf(j, j.holdStaff))),
  });
  const resCol = (r: (typeof activeRes)[number], d: string, key: string): CalColumn => ({
    key, kind: "RESOURCE", id: r.id, name: r.name, sub: kindLabel(r.kind), dateStr: d, closed: resClosed(r.id, d), maintenance: resMaint(r.id, d),
    blocks: sortBlocks(jobs.filter((j) => j.day === d && j.resIds.includes(r.id)).map((j) => blockOf(j, j.e + r.cleanupMin * MIN_MS))),
  });

  const focusOptions = mode === "STAFF" ? staff.map((s) => ({ id: s.id, name: s.name })) : activeRes.map((r) => ({ id: r.id, name: r.name }));
  let focusId: string | null = null;
  let columns: CalColumn[] = [];
  if (range === "DAY") {
    if (mode === "STAFF") columns = staff.map((s) => staffCol(s.id, dateStr, s.id));
    else {
      columns = activeRes.map((r) => resCol(r, dateStr, r.id));
      const un = sortBlocks(jobs.filter((j) => j.day === dateStr && (kindsOf.get(j.r.serviceId)?.length ?? 0) > 0 && j.resIds.length === 0).map((j) => blockOf(j, j.e)));
      if (un.length) columns.push({ key: "UNASSIGNED", kind: "UNASSIGNED", id: null, name: "ยังไม่ได้ห้อง", sub: "รอจัดห้อง/เตียง", dateStr, closed: null, maintenance: [], blocks: un });
    }
  } else {
    focusId = focusOptions.some((o) => o.id === opts.focusId) ? (opts.focusId as string) : focusOptions[0]?.id ?? null;
    if (focusId) {
      const fid = focusId;
      const r = activeRes.find((x) => x.id === fid);
      columns = days.map((d) => (mode === "STAFF" ? staffCol(fid, d, d) : resCol(r!, d, d)));
    }
  }

  // สรุป (วันของ dateStr)
  const staffClosedToday = staff.map((s) => staffClosed(s.id, dateStr));
  const resCount = new Map<string, number>();
  for (const r of activeRes) if (!resClosed(r.id, dateStr)) resCount.set(r.kind, (resCount.get(r.kind) ?? 0) + 1);
  const summary = {
    staffWorking: staffClosedToday.filter((c) => c === null).length,
    staffOnLeave: staffClosedToday.filter((c) => c?.code === "LEAVE").length,
    resources: [...RESOURCE_KINDS.filter((k) => (resCount.get(k) ?? 0) > 0), ...[...resCount.keys()].filter((k) => !isResourceKind(k))]
      .map((k) => ({ kind: k, labelTh: kindLabel(k), count: resCount.get(k) ?? 0 })),
  };

  // ตอนนี้ (วันนี้เท่านั้น)
  let walkInNow: WalkInNowRow[] | null = null;
  let resourcesNow: CalendarView["resourcesNow"] = null;
  if (dateStr === todayStr) {
    walkInNow = await walkInNowByService(ctx, { now });
    const overrunMin = await overrunMinOf(ctx);
    const [holds, nb] = await Promise.all([
      readHolds(reader, tenantId, unitId, { from: new Date(nowMs - DAY_MS), to: new Date(nowMs + DAY_MS), nowMs, overrunMin }),
      readUnitBlocks(reader, tenantId, unitId, new Date(nowMs - DAY_MS), new Date(nowMs + DAY_MS)),
    ]);
    resourcesNow = activeRes.map((r) => {
      const base = { id: r.id, name: r.name, kind: r.kind };
      if (nb.some((b) => b.resourceId === r.id && b.startAt.getTime() <= nowMs && (b.endAt === null || b.endAt.getTime() > nowMs))) return { ...base, state: "MAINT" as const, nextStartMs: null };
      const mine = holds.filter((h) => h.ids.includes(r.id));
      if (mine.some((h) => h.s <= nowMs && h.e > nowMs)) return { ...base, state: "BUSY" as const, nextStartMs: null };
      const next = mine.filter((h) => h.s > nowMs && h.s <= nowMs + 60 * MIN_MS).sort((a, b) => a.s - b.s)[0];
      return next ? { ...base, state: "NEXT" as const, nextStartMs: next.s } : { ...base, state: "FREE" as const, nextStartMs: null };
    });
  }

  // การ์ดงานที่เลือก
  let pick: Job | undefined = isStr(opts.apptId) ? jobs.find((j) => j.r.id === opts.apptId) : undefined;
  if (!pick && dateStr === todayStr) {
    pick = jobs
      .filter((j) => j.day === todayStr && j.r.status === "ARRIVED")
      .sort((a, b) => (a.r.checkedInAt?.getTime() ?? a.s) - (b.r.checkedInAt?.getTime() ?? b.s) || cmpId(a.r.id, b.r.id))[0];
  }
  const card: CalCard | null = pick
    ? {
        appointmentId: pick.r.id,
        kind: pick.r.kind === "WALKIN" ? "WALKIN" : "BOOKED",
        status: pick.r.status,
        label: blockOf(pick, pick.e).label,
        ticketNumber: pick.r.queueTicketId ? ticketNo.get(pick.r.queueTicketId) ?? null : null,
        serviceName: svcOf.get(pick.r.serviceId)?.name ?? "",
        staffId: pick.colStaff,
        staffName: staffName.get(pick.colStaff) ?? null,
        resourceIds: pick.resIds,
        resourceNames: pick.resIds.map((id) => resName.get(id) ?? ""),
        startMs: pick.s,
        endMs: pick.e,
        checkedInMs: pick.r.checkedInAt ? pick.r.checkedInAt.getTime() : null,
        priceSatang: pick.r.priceSatang >= 0 ? pick.r.priceSatang : null,
        depositSatang: pick.r.depositSatang,
        depositPaid: pick.r.depositPaidAt !== null,
        movable: movableOf(pick.r),
        canStart: pick.r.status === "ARRIVED" && (la.runAny || la.runOwn),
      }
    : null;

  const shopToday = shopOf.get(dateStr) ?? (await shopDay(ctx, dateStr));
  return {
    unitId,
    mode,
    range,
    dateStr,
    days,
    prevDateStr: addDaysStr(dateStr, range === "DAY" ? -1 : -7),
    nextDateStr: addDaysStr(dateStr, range === "DAY" ? 1 : 7),
    todayStr,
    nowMs,
    openMin: shopToday.openMin,
    closeMin: shopToday.closeMin,
    providerLabel,
    focusId,
    focusOptions,
    columns,
    access,
    summary,
    walkInNow,
    resourcesNow,
    options: {
      staff: staff.map((s) => ({ id: s.id, name: s.name })),
      resources: activeRes.map((r) => ({ id: r.id, name: r.name, kind: r.kind })),
      services: activeSvcs.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin })),
    },
    card,
  };
}

// ═════════════════════════ ลากย้าย ═════════════════════════

export type CalMoveTo = { dateStr: string; startMin: number; staffId?: string; resourceId?: string };
export type CalMoveFail = "FORBIDDEN" | "NOT_FOUND" | "BAD_INPUT" | "BAD_STATE" | "FULL" | "PAST" | "ON_LEAVE" | "NOT_QUALIFIED" | "OUTSIDE_HOURS" | "LOST_RACE" | "BUSY" | "GROUP"; // SVC B.15 ▸ GROUP = ลากนัดกลุ่มไปเวลาอื่นรายคนไม่ได้ (เลื่อนทั้งกลุ่ม) ◂
export type CalMoveResult = { ok: true; appointmentId: string; startAt: Date; staffId: string; resourceIds: string[] } | { ok: false; code: CalMoveFail; reason: string };

const M = {
  FORBIDDEN: "บัญชีนี้เลื่อนนัดแทนลูกค้าไม่ได้ — ขอสิทธิ์ \"ยกเลิก/เลื่อนนัดแทนลูกค้า\" จากเจ้าของร้าน",
  NOT_FOUND: "ไม่พบนัดนี้ในสาขานี้",
  BAD_INPUT: "ข้อมูลการย้ายไม่ครบหรือไม่ถูกต้อง กรุณาลองใหม่",
  STAFF_NOT_FOUND: "ไม่พบผู้ให้บริการที่เลือกในสาขานี้",
  RES_NOT_FOUND: "ไม่พบห้อง/เตียงที่เลือกในสาขานี้",
  BAD_STATE: "นัดนี้ย้ายจากปฏิทินไม่ได้ในสถานะปัจจุบัน (ลูกค้ามาถึง/กำลังทำ/เสร็จแล้ว หรือเป็น walk-in) — ใช้ปุ่มบนจอคิววันนี้",
  BOOK_FORBIDDEN: "บัญชีนี้จองให้ลูกค้าไม่ได้ — ขอสิทธิ์ \"จองให้ลูกค้า\" จากเจ้าของร้าน",
} as const;

/**
 * ลากบล็อกนัดไปเวลา/คน/ห้องใหม่ (ใบสั่ง §3.2) — ลำดับตรวจ: สิทธิ์ → นัด (ขอบเขต) → รูปข้อมูล → ปลายทางของหน่วย → สถานะ →
 * (rescheduleByShop: อดีต/ลา/ทำไม่ได้/นอกเวลา → ใต้ล็อก: สถานะ → expect → คน J5 → ทรัพยากร → CAS) · ล้ม = ไม่เขียนอะไร
 */
export async function moveAppointment(
  actor: CalendarActor,
  ctx: Ctx,
  appointmentId: string,
  to: CalMoveTo,
  opts: { expect: { startAt: string; staffId: string }; now?: Date },
): Promise<CalMoveResult> {
  const fail = (code: CalMoveFail, reason: string): CalMoveResult => ({ ok: false, code, reason });
  const member = memberOf(actor);
  const unitId = okCtx(ctx) ? ctx.unitId : "";
  if (!member || !canBookingAction(member, unitId, "moveAppointmentAction")) return fail("FORBIDDEN", M.FORBIDDEN);
  if (!okCtx(ctx) || !isStr(appointmentId)) return fail("NOT_FOUND", M.NOT_FOUND);
  const { tenantId } = ctx;
  const db = tenantDb(ctx);
  const row = await db.appointment.findFirst({ where: { id: appointmentId, tenantId, unitId }, select: { id: true, kind: true, status: true } });
  if (!row) return fail("NOT_FOUND", M.NOT_FOUND);

  // รูปข้อมูล
  const t = to as Partial<Record<keyof CalMoveTo, unknown>> | null;
  const e = opts && typeof opts === "object" ? (opts.expect as unknown) : null;
  const exp = isRec(e) ? e : null;
  if (!t || typeof t !== "object" || !isStr(t.dateStr) || !isRealDateStr(t.dateStr)
    || typeof t.startMin !== "number" || !Number.isInteger(t.startMin) || t.startMin < 0 || t.startMin >= 24 * 60
    || (t.staffId !== undefined && !isStr(t.staffId)) || (t.resourceId !== undefined && !isStr(t.resourceId))
    || !exp || !isStr(exp.startAt) || !Number.isFinite(Date.parse(exp.startAt)) || !isStr(exp.staffId)) {
    return fail("BAD_INPUT", M.BAD_INPUT);
  }
  const dest: CalMoveTo = { dateStr: t.dateStr, startMin: t.startMin, ...(isStr(t.staffId) ? { staffId: t.staffId } : {}), ...(isStr(t.resourceId) ? { resourceId: t.resourceId } : {}) };

  // ปลายทางต้องเป็นของหน่วยนี้ (X1)
  if (dest.staffId && !(await db.bookingStaff.findFirst({ where: { id: dest.staffId, tenantId, unitId, active: true }, select: { id: true } }))) {
    return fail("NOT_FOUND", M.STAFF_NOT_FOUND);
  }
  if (dest.resourceId && !(await db.svcResource.findFirst({ where: { id: dest.resourceId, tenantId, unitId, active: true }, select: { id: true } }))) {
    return fail("NOT_FOUND", M.RES_NOT_FOUND);
  }
  if (String(row.kind) !== "BOOKED" || !MOVABLE.has(String(row.status))) return fail("BAD_STATE", M.BAD_STATE);

  const r = await rescheduleByShop({ tenantId, unitId, actorUserId: isStr(actor.userId) ? actor.userId : undefined }, appointmentId, dest, {
    now: opts.now,
    expect: { startAt: exp.startAt, staffId: exp.staffId },
    strictHours: true,
  });
  if (!r.ok) return fail(r.code === "CLASH" ? "FULL" : r.code, r.reason);
  const after = await db.appointment.findFirst({ where: { id: appointmentId, tenantId, unitId }, select: { startAt: true, staffId: true, resourceId: true, policySnapshot: true } });
  if (!after) return fail("NOT_FOUND", M.NOT_FOUND);
  return { ok: true, appointmentId, startAt: after.startAt, staffId: after.staffId, resourceIds: resourceIdsOfRow(after.resourceId, after.policySnapshot) };
}

// ═════════════════════════ จองจากปฏิทิน ═════════════════════════

/** คลิกช่องว่าง / "+ จองให้ลูกค้า" (ใบสั่ง §3.3) — ไม่มีสิทธิ์ ⇒ FORBIDDEN · ผ่าน ⇒ bookAppointment ช่อง STAFF ตรงตัว */
export async function bookForCustomer(
  actor: CalendarActor,
  ctx: Ctx,
  i: { serviceId: string; staffId: string | null; dateStr: string; startMin: number; customerName: string; customerPhone: string; note?: string; idempotencyKey: string },
): Promise<BookResult | { ok: false; code: "FORBIDDEN"; reason: string }> {
  const member = memberOf(actor);
  const unitId = okCtx(ctx) ? ctx.unitId : "";
  if (!member || !canBookingAction(member, unitId, "bookForCustomerAction")) return { ok: false, code: "FORBIDDEN", reason: M.BOOK_FORBIDDEN };
  if (!okCtx(ctx) || !i || typeof i !== "object") return { ok: false, code: "NOT_FOUND", reason: "ไม่พบบริการที่เลือก" };
  return bookAppointment(
    { tenantId: ctx.tenantId, unitId: ctx.unitId },
    {
      serviceId: i.serviceId,
      staffId: i.staffId,
      dateStr: i.dateStr,
      startMin: i.startMin,
      channel: "STAFF",
      customerName: i.customerName,
      customerPhone: i.customerPhone,
      ...(typeof i.note === "string" && i.note.trim() ? { note: i.note } : {}),
      idempotencyKey: i.idempotencyKey,
    },
  );
}
