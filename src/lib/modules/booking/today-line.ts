// SVC B.5 — ตัวโหลดจอคิววันนี้แถวเดียว (ภาพ จอง 01) · มือถือช่าง "ของฉัน" · ปฏิทินรายวันตามคน · ด่านปุ่มต่องาน
// สัญญา: ledger/svc-briefs/svc-brief-b.5.md §3.2 · แบบ: DESIGN-BOOKING-QUEUE.md R5 R6(ย่อ) §7
//
// 🔴 อ่านอย่างเดียว (ไม่ล็อก ไม่เขียน) · แผนบนจอคิดสด ณ now ด้วยตัววางคิวตัวเดียวกับ runPlanner (planPreOf + jobRowsOf → planDay)
// 🔴 เฉพาะหน่วย BOOKING ที่เปิด `booking.queue.singleLine` — ร้านเดิม / หน่วยไม่ใช่ของ tenant / ผู้ดูไม่มีสิทธิ์ดู ⇒ null (หน้าใช้จอเดิม)
// 🔴 ขอบเขต (X1): ทุกคิวรีผูก tenantId + unitId ของ ctx
// 🔴 X8: ผู้ดูที่ไม่มี fullPhone ⇒ ไม่มีเบอร์เต็มที่ใดใน DTO (phone = null · phoneMasked = "•••-•••-" + 4 หลักท้าย) · ข้อความ todo ไม่มีเบอร์
// 🔴 ปุ่มต่องาน (`actions`) กับ authorizeLineOp คิดด้วยฟังก์ชันเดียว (actionsOf) ⇒ ปุ่มที่เห็น = สิ่งที่ action ยอมทำ
// 🔴 เวลาไทยคิดจาก epoch + 7 ชม. (ไม่ใช้นาฬิกาเครื่อง) · ทุกฟังก์ชันรับ now ฉีดได้
import { tenantDb } from "@/lib/core/db";
import type { Prisma } from "@prisma/client";
import { resolveSettingsMany } from "@/lib/core/settings";
import { employeeOfUser } from "@/lib/modules/hr";
import { planDay, type PlannedJob } from "./planner";
import { addDaysStr, bkkDayOf, jobRowsOf, latePolicyOf, lineSettingsOf, planInputOf, planPreOf, skippedOf, type JobRow } from "./planner-run";
import type { LineAccess } from "./line-access";
import { movable } from "./line-ops";
import { maskPhone } from "./privacy-shared";
import { getUnitHours, isRealDateStr } from "./service";
import { BKK_OFFSET_MIN, localToUtc } from "./slots";
import { unitDayWindows } from "./staff-hours";

const MIN_MS = 60_000;
const SOON_MIN = 60; // §6 ข้อ 9 — "ต้องจัดการ" SOON = นัดที่เริ่มภายใน 60 นาที

// ───────────────────────── สัญญา (§3.2) ─────────────────────────
export type LineAction = "call" | "recall" | "skip" | "start" | "done" | "move" | "checkin" | "noshow" | "cancel";
/** cancelStale = ผู้ดูมีคีย์เลื่อน/ยกเลิกนัด (booking.appointment.reschedule) — ใช้กับปุ่มยกเลิกงานค้างข้ามวันเท่านั้น (ไม่ส่ง = false) */
export type LineViewer = { userId: string; access: LineAccess; cancelStale?: boolean };
export type LineJob = {
  appointmentId: string; kind: "BOOKED" | "WALKIN"; status: string; assignMode: "SPECIFIC" | "ANY";
  ticketNumber: string | null; ticketStatus: string | null;
  label: string;
  serviceName: string;
  staffId: string | null; staffName: string | null;
  bookedStartMs: number | null;
  plannedStartMs: number | null; plannedEndMs: number | null;
  waitMin: number | null;
  waitedMin: number | null;
  whyText: string | null;
  phoneMasked: string | null; phone: string | null;
  mine: boolean;
  actions: LineAction[];
};
export type LineBlock = { appointmentId: string; staffId: string; look: "now" | "arrived" | "booked" | "placed" | "noshow" | "done"; startMs: number; endMs: number; ticketNumber: string | null; label: string };
export type LineTodo = { appointmentId: string; kind: "LATE" | "SOON" | "STALE"; title: string; detail: string; actions: LineAction[]; phone: string | null };
export type TodayLineView = {
  unitId: string; dayStr: string; nowMs: number; openMin: number | null; closeMin: number | null; axisStartMs: number; axisEndMs: number;
  kpi: { booked: number; arrived: number; absent: number; upcoming: number; walkIns: number; walkInsLeft: number; waiting: number; longestWaitMin: number | null; longestWaitTicket: string | null; done: number };
  staff: { staffId: string; name: string; seat: number; mine: boolean; blocks: LineBlock[] }[];
  waiting: LineJob[]; inService: LineJob[]; skipped: LineJob[]; todo: LineTodo[];
  why: { appointmentId: string; ticketNumber: string | null; staffName: string | null; startMs: number | null; text: string } | null;
  access: LineAccess; myStaffIds: string[];
  walkInForm: { services: { id: string; name: string; durationMin: number; walkIn?: boolean }[]; staff: { id: string; name: string }[] } | null;
};
export type DayCalendarView = {
  unitId: string; dateStr: string; prevDateStr: string; nextDateStr: string; openMin: number | null; closeMin: number | null;
  staff: { staffId: string; name: string; blocks: { appointmentId: string; startMs: number; endMs: number; status: string; label: string; ticketNumber: string | null }[] }[];
};
type Ctx = { tenantId: string; unitId: string };
export type AuthResult = { ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND"; reason: string };

// ───────────────────────── ตัวช่วย ─────────────────────────
const validNow = (now: Date | undefined): Date => (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date());
const okCtx = (ctx: Ctx | null | undefined): ctx is Ctx =>
  !!ctx && typeof ctx.tenantId === "string" && !!ctx.tenantId && typeof ctx.unitId === "string" && !!ctx.unitId;
/** HH:MM เวลาไทยจาก epoch ms */
const hhmm = (ms: number) => new Date(ms + BKK_OFFSET_MIN * MIN_MS).toISOString().slice(11, 16);
/** นาทีจากเที่ยงคืนไทย */
const minOfDay = (ms: number) => Math.floor((ms + BKK_OFFSET_MIN * MIN_MS) / MIN_MS) % 1440;
const IN_SHOP = new Set<string>(["ARRIVED", "QUEUED"]);
const STALE_STATUSES = ["ARRIVED", "QUEUED", "IN_SERVICE"] as const;

/** เวลาเปิด–ปิดร้านของวัน (BookingHours + วันพิเศษ) · ปิด = null */
async function shopHoursOf(ctx: Ctx, dayStr: string): Promise<{ openMin: number | null; closeMin: number | null }> {
  const [hours, closure] = await Promise.all([
    getUnitHours(ctx.tenantId, ctx.unitId),
    tenantDb(ctx).bookingClosure.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, date: dayStr }, select: { closed: true, openMin: true, closeMin: true } }),
  ]);
  const w = unitDayWindows({ dateStr: dayStr, hours, closure: closure ? { closed: closure.closed, openMin: closure.openMin, closeMin: closure.closeMin } : null });
  return w.length ? { openMin: w[0].startMin, closeMin: w[w.length - 1].endMin } : { openMin: null, closeMin: null };
}

/** แกนเวลาของตารางช่าง: ชั่วโมงของ now −1 ชม. ถึง +4 ชม. (5 ชม.) ตัดด้วยเวลาร้าน · คร่อม now เสมอ · ≥ 3 ชม. เมื่อร้านเปิด ≥ 3 ชม. */
function axisOf(dayStr: string, nowMs: number, openMin: number | null, closeMin: number | null): { axisStartMs: number; axisEndMs: number } {
  const nowMin = bkkDayOf(nowMs) === dayStr ? minOfDay(nowMs) : 0;
  const lo = openMin ?? 0;
  const hi = closeMin ?? 1440;
  let s = Math.floor(nowMin / 60) * 60 - 60;
  let e = s + 300;
  if (s < lo) { s = lo; e = Math.min(hi, s + 300); }
  if (e > hi) { e = hi; s = Math.max(lo, e - 300); }
  s = Math.min(s, nowMin);
  e = Math.max(e, Math.min(1440, nowMin + 1));
  return { axisStartMs: localToUtc(dayStr, s).getTime(), axisEndMs: localToUtc(dayStr, e).getTime() };
}

/** BookingStaff active ของสาขาที่ผูกพนักงาน HR ของผู้ใช้ (facade employeeOfUser) · ไม่ผูก ⇒ [] */
export async function myStaffIds(ctx: Ctx, userId: string): Promise<string[]> {
  if (!okCtx(ctx) || typeof userId !== "string" || !userId) return [];
  const emp = await employeeOfUser(ctx.tenantId, userId);
  if (!emp) return [];
  const rows = await tenantDb(ctx).bookingStaff.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, active: true, employeeId: emp.employeeId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ───────────────────────── ปุ่มต่องาน (§3.2.1) — ฟังก์ชันเดียวของจอและ authorizeLineOp ─────────────────────────
type ActRow = {
  kind: string; status: string; assignMode: string; staffId: string; plannedStaffId: string | null;
  startAt: Date; checkedInAt: Date | null; policySnapshot: unknown; ticketStatus: string | null; stale: boolean;
};
type ActEnv = { access: LineAccess; cancelStale: boolean; mine: ReadonlySet<string>; values: Record<string, unknown>; nowMs: number; today: string };

const isMine = (r: Pick<ActRow, "staffId" | "plannedStaffId">, mine: ReadonlySet<string>) =>
  mine.has(r.staffId) || (!!r.plannedStaffId && mine.has(r.plannedStaffId));

function actionsOf(r: ActRow, env: ActEnv): LineAction[] {
  const { access } = env;
  const own = access.runAny || (access.runOwn && isMine(r, env.mine));
  const lead = access.runAny || access.operate;
  const out: LineAction[] = [];
  if (r.stale) {
    // งานค้างข้ามวัน (หนี้ B.4) — ร้านปิดเอง: กำลังทำ ⇒ เสร็จ · ยังรอ ⇒ ยกเลิก
    if (r.status === "IN_SERVICE" && own) out.push("done");
    if (IN_SHOP.has(r.status) && (lead || env.cancelStale)) out.push("cancel");
    return out;
  }
  const inShop = IN_SHOP.has(r.status);
  const tk = r.ticketStatus;
  if (inShop && (tk === "WAITING" || tk === "CALLED") && (own || access.operate)) out.push("call");
  if (inShop && tk === "SKIPPED" && (own || access.operate)) out.push("recall");
  if (inShop && tk === "CALLED" && (own || access.operate)) out.push("skip");
  if (inShop && own) out.push("start");
  if (r.status === "IN_SERVICE" && own) out.push("done");
  if (lead && movable({ id: "", kind: r.kind, status: r.status, assignMode: r.assignMode, checkedInAt: r.checkedInAt, staffId: r.staffId })) out.push("move");
  if (r.kind === "BOOKED" && r.checkedInAt === null && (r.status === "CONFIRMED" || r.status === "LATE")) {
    const pol = latePolicyOf(r.policySnapshot, env.values);
    const startMs = r.startAt.getTime();
    const notExpired = pol.noShowAfterMin === null || env.nowMs < startMs + pol.noShowAfterMin * MIN_MS;
    if (access.checkIn && bkkDayOf(startMs) === env.today && notExpired) out.push("checkin");
    if (lead && (r.status === "LATE" || env.nowMs >= startMs + pol.graceMin * MIN_MS)) out.push("noshow");
  }
  return out;
}

/** งานค้างข้ามวัน: อยู่ในร้าน/กำลังทำ และวันไทยที่เข้าร้าน (เช็กอิน → เริ่ม → เวลานัด) ก่อนวันนี้ */
function isStale(r: { status: string; checkedInAt: Date | null; startedAt: Date | null; startAt: Date }, today: string): boolean {
  if (!(STALE_STATUSES as readonly string[]).includes(r.status)) return false;
  const t = (r.checkedInAt ?? r.startedAt ?? r.startAt).getTime();
  return bkkDayOf(t) < today;
}

// ───────────────────────── ตัวโหลดจอ ─────────────────────────

type Extra = { id: string; customerName: string; customerPhone: string; depositSatang: number; depositPaidAt: Date | null; doneAt: Date | null };
type Tk = { id: string; number: string; status: string; skippedAt: Date | null; createdAt: Date };

/**
 * จอคิววันนี้แถวเดียว (§3.2): ไม่ใช่แถวเดียว / หน่วยไม่ใช่ของ tenant / ไม่มีสิทธิ์ดู ⇒ null
 * แผน = planDay ณ now (ตัวเดียวกับ runPlanner รวมกติกาข้าม = ท้ายแถว) · ไม่ล็อก ไม่เขียน
 */
export async function loadTodayLine(ctx: Ctx, viewer: LineViewer, opts?: { now?: Date }): Promise<TodayLineView | null> {
  if (!okCtx(ctx) || !viewer?.access?.view) return null;
  const now = validNow(opts?.now);
  const nowMs = now.getTime();
  const values = await lineSettingsOf(ctx.tenantId, ctx.unitId);
  if (!values) return null;
  const access = viewer.access;
  const today = bkkDayOf(nowMs);
  const db = tenantDb(ctx); // อ่านอย่างเดียว · ผูกขอบเขตร้าน/สาขา (X1)
  const reader = db as unknown as Prisma.TransactionClient;

  const [pre, rows, mineIds, hours, staleRows] = await Promise.all([
    planPreOf(ctx, today, values),
    jobRowsOf(reader, ctx, today),
    myStaffIds(ctx, viewer.userId),
    shopHoursOf(ctx, today),
    db.appointment.findMany({
      where: { tenantId: ctx.tenantId, unitId: ctx.unitId, status: { in: [...STALE_STATUSES] }, startAt: { lt: localToUtc(today, 0) } },
      select: { id: true, kind: true, status: true, assignMode: true, staffId: true, plannedStaffId: true, serviceId: true, startAt: true, endAt: true, checkedInAt: true, startedAt: true, queueTicketId: true, policySnapshot: true, createdAt: true, plannedStartAt: true },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 50,
    }),
  ]);
  const skipped = await skippedOf(reader, ctx, rows);
  const plan = planDay(planInputOf(pre, rows, nowMs, skipped));
  const pjOf = new Map<string, PlannedJob>(plan.jobs.map((j) => [j.jobId, j]));

  const staleList = [...staleRows.filter((r) => isStale(r, today))];
  for (const r of rows) if (isStale(r, today) && !staleList.some((x) => x.id === r.id)) staleList.push(r);
  const staleIds = new Set(staleList.map((r) => r.id));

  const allIds = [...new Set([...rows.map((r) => r.id), ...staleList.map((r) => r.id)])];
  const ticketIds = [...new Set([...rows, ...staleList].map((r) => r.queueTicketId).filter((x): x is string => !!x))];
  const [extras, tickets] = await Promise.all([
    allIds.length
      ? db.appointment.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: allIds } }, select: { id: true, customerName: true, customerPhone: true, depositSatang: true, depositPaidAt: true, doneAt: true } })
      : Promise.resolve([] as Extra[]),
    ticketIds.length
      ? db.queueTicket.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: ticketIds } }, select: { id: true, number: true, status: true, skippedAt: true, createdAt: true } })
      : Promise.resolve([] as Tk[]),
  ]);
  const exOf = new Map<string, Extra>(extras.map((x) => [x.id, x]));
  const tkOf = new Map<string, Tk>(tickets.map((t) => [t.id, { ...t, status: String(t.status) }]));
  const ticketOf = (r: { queueTicketId: string | null }) => (r.queueTicketId ? tkOf.get(r.queueTicketId) ?? null : null);
  const svcName = (id: string) => pre.svcById.get(id)?.name ?? "";
  const staffName = new Map(pre.profiles.map((p) => [p.staffId, p.name]));
  const mine = new Set(mineIds);
  const env: ActEnv = { access, cancelStale: viewer.cancelStale === true, mine, values, nowMs, today };

  type AnyRow = JobRow & { startedAt: Date | null };
  const actRow = (r: AnyRow): ActRow => ({
    kind: r.kind, status: String(r.status), assignMode: r.assignMode, staffId: r.staffId, plannedStaffId: r.plannedStaffId,
    startAt: r.startAt, checkedInAt: r.checkedInAt, policySnapshot: r.policySnapshot, ticketStatus: ticketOf(r)?.status ?? null, stale: staleIds.has(r.id),
  });
  const placedPj = (id: string) => {
    const pj = pjOf.get(id);
    return pj && (pj.state === "SCHEDULED" || pj.state === "IN_SERVICE") && pj.startAt !== null && pj.endAt !== null && pj.staffId ? pj : null;
  };
  const phones = (r: AnyRow) => {
    const raw = exOf.get(r.id)?.customerPhone ?? "";
    const masked = raw ? maskPhone(raw) : "";
    return { phoneMasked: masked || null, phone: access.fullPhone && raw ? raw : null };
  };
  const labelOf = (r: AnyRow) => (r.kind === "WALKIN" ? svcName(r.serviceId) : exOf.get(r.id)?.customerName ?? "");

  const jobOfRow = (r: AnyRow): LineJob => {
    const pj = placedPj(r.id);
    const tk = ticketOf(r);
    const status = String(r.status);
    const pStart = status === "IN_SERVICE" ? (r.startedAt?.getTime() ?? pj?.startAt ?? null) : pj?.startAt ?? null;
    const sid = pj?.staffId ?? r.plannedStaffId ?? r.staffId;
    const inShop = IN_SHOP.has(status);
    return {
      appointmentId: r.id,
      kind: r.kind === "WALKIN" ? "WALKIN" : "BOOKED",
      status,
      assignMode: r.assignMode === "ANY" ? "ANY" : "SPECIFIC",
      ticketNumber: tk?.number ?? null,
      ticketStatus: tk?.status ?? null,
      label: labelOf(r),
      serviceName: svcName(r.serviceId),
      staffId: sid,
      staffName: staffName.get(sid) ?? null,
      bookedStartMs: r.kind === "WALKIN" ? null : r.startAt.getTime(),
      plannedStartMs: pStart,
      plannedEndMs: pj?.endAt ?? null,
      waitMin: pStart !== null && status !== "IN_SERVICE" ? Math.max(0, Math.round((pStart - nowMs) / MIN_MS)) : null,
      waitedMin: inShop && r.checkedInAt ? Math.max(0, Math.floor((nowMs - r.checkedInAt.getTime()) / MIN_MS)) : null,
      whyText: r.kind === "WALKIN" && pj?.why ? pj.why.text : null,
      ...phones(r),
      mine: isMine(r, mine),
      actions: actionsOf(actRow(r), env),
    };
  };

  // ── แถวรอ · กำลังทำ · ข้ามแล้ว ──
  const live = rows.filter((r) => !staleIds.has(r.id));
  const byId = new Map(live.map((r) => [r.id, r]));
  const isSkipped = (r: AnyRow) => IN_SHOP.has(String(r.status)) && ticketOf(r)?.status === "SKIPPED";
  const waitingIds: string[] = [];
  for (const id of plan.line) {
    const r = byId.get(id);
    if (!r || isSkipped(r)) continue;
    const st = String(r.status);
    if (st === "IN_SERVICE" || st === "DONE" || st === "CANCELLED" || st === "NO_SHOW") continue;
    waitingIds.push(id);
  }
  // งานในร้านที่ตัววางคิววางไม่ได้วันนี้ (ไม่อยู่ใน line) ⇒ ต่อท้าย (ยังรออยู่จริง)
  for (const r of [...live].sort((a, b) => (a.checkedInAt?.getTime() ?? 0) - (b.checkedInAt?.getTime() ?? 0))) {
    if (IN_SHOP.has(String(r.status)) && !isSkipped(r) && !waitingIds.includes(r.id)) waitingIds.push(r.id);
  }
  const waiting = waitingIds.map((id) => jobOfRow(byId.get(id)!));
  const inService = live
    .filter((r) => String(r.status) === "IN_SERVICE")
    .sort((a, b) => (a.startedAt?.getTime() ?? a.startAt.getTime()) - (b.startedAt?.getTime() ?? b.startAt.getTime()) || (a.id < b.id ? -1 : 1))
    .map(jobOfRow);
  const skippedJobs = live
    .filter(isSkipped)
    .sort((a, b) => (ticketOf(a)?.skippedAt?.getTime() ?? 0) - (ticketOf(b)?.skippedAt?.getTime() ?? 0))
    .map(jobOfRow);

  // ── ตารางช่าง ──
  const staffRows = pre.profiles.map((p, i) => ({ staffId: p.staffId, name: p.name, seat: i + 1, mine: mine.has(p.staffId), blocks: [] as LineBlock[] }));
  const rowOfStaff = new Map(staffRows.map((s) => [s.staffId, s]));
  for (const r of live) {
    const st = String(r.status);
    if (st === "CANCELLED") continue;
    const pj = pjOf.get(r.id);
    const placed = placedPj(r.id);
    const len = r.endAt.getTime() - r.startAt.getTime();
    let look: LineBlock["look"];
    let s: number;
    let e: number;
    let sid = placed?.staffId ?? r.plannedStaffId ?? r.staffId;
    if (st === "IN_SERVICE") {
      look = "now";
      s = r.startedAt?.getTime() ?? placed?.startAt ?? r.startAt.getTime();
      e = placed?.endAt ?? s + len;
    } else if (st === "DONE") {
      look = "done";
      s = r.startedAt?.getTime() ?? r.startAt.getTime();
      e = exOf.get(r.id)?.doneAt?.getTime() ?? s + len;
      sid = r.staffId;
    } else if (st === "NO_SHOW") {
      look = "noshow";
      s = r.startAt.getTime();
      e = r.endAt.getTime();
      sid = r.staffId;
    } else if (r.kind === "WALKIN") {
      look = "placed";
      s = placed?.startAt ?? r.startAt.getTime();
      e = placed?.endAt ?? r.endAt.getTime();
    } else if (r.checkedInAt !== null || IN_SHOP.has(st)) {
      look = "arrived";
      s = placed?.startAt ?? r.startAt.getTime();
      e = placed?.endAt ?? r.endAt.getTime();
    } else if (!placed && (st === "LATE" || pj?.state === "RELEASED_LATE" || pj?.state === "NO_SHOW_DUE")) {
      look = "noshow"; // ตัววางคิวปล่อยช่องแล้ว (มาสาย/ถึงเวลาไม่มา)
      s = r.startAt.getTime();
      e = r.endAt.getTime();
      sid = r.staffId;
    } else {
      look = "booked";
      s = placed?.startAt ?? r.startAt.getTime();
      e = placed?.endAt ?? r.endAt.getTime();
    }
    const target = rowOfStaff.get(sid) ?? rowOfStaff.get(r.staffId);
    if (!target) continue;
    target.blocks.push({ appointmentId: r.id, staffId: target.staffId, look, startMs: s, endMs: Math.max(e, s), ticketNumber: ticketOf(r)?.number ?? null, label: labelOf(r) });
  }
  for (const sr of staffRows) sr.blocks.sort((a, b) => a.startMs - b.startMs || (a.appointmentId < b.appointmentId ? -1 : 1));

  // ── ต้องจัดการ ──
  const todo: LineTodo[] = [];
  const todayRows = live.filter((r) => bkkDayOf(r.startAt.getTime()) === today);
  for (const r of [...todayRows].sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || (a.id < b.id ? -1 : 1))) {
    const st = String(r.status);
    if (r.kind !== "BOOKED" || r.checkedInAt !== null || (st !== "CONFIRMED" && st !== "LATE")) continue;
    const pol = latePolicyOf(r.policySnapshot, values);
    const startMs = r.startAt.getTime();
    const name = exOf.get(r.id)?.customerName ?? "";
    const ex = exOf.get(r.id);
    const phone = access.fullPhone && ex?.customerPhone ? ex.customerPhone : null;
    if (st === "LATE" || nowMs >= startMs + pol.graceMin * MIN_MS) {
      const released = !placedPj(r.id) || pol.afterGrace === "RELEASE_REQUEUE";
      const noShowAt = pol.noShowAfterMin === null ? null : startMs + pol.noShowAfterMin * MIN_MS;
      const dep = (ex?.depositSatang ?? 0) > 0 ? (ex?.depositPaidAt ? "มีมัดจำ" : "มัดจำยังไม่จ่าย") : "ไม่มีมัดจำ";
      const parts = [
        `เลยเวลาผ่อนผัน ${pol.graceMin} นาที`,
        released ? "ปล่อยช่องแล้ว" : "ร้านยังถือช่องไว้",
        noShowAt !== null ? `ถ้ามาก่อน ${hhmm(noShowAt)} เข้าแถวแบบ walk-in · หลังนั้นนับไม่มา` : "ร้านรอต่อ (ไม่ตั้งไม่มาเอง)",
        dep,
      ];
      todo.push({ appointmentId: r.id, kind: "LATE", title: `${name} · นัด ${hhmm(startMs)} ยังไม่มา`, detail: parts.join(" · "), actions: actionsOf(actRow(r), env), phone });
    } else if (st === "CONFIRMED" && startMs - nowMs <= SOON_MIN * MIN_MS) {
      const mins = Math.max(0, Math.round((startMs - nowMs) / MIN_MS));
      const sid = placedPj(r.id)?.staffId ?? r.staffId;
      todo.push({
        appointmentId: r.id, kind: "SOON", title: `${name} · นัด ${hhmm(startMs)}`,
        detail: `อีก ${mins} นาที · ยังไม่เช็กอิน · ${svcName(r.serviceId)} · ${staffName.get(sid) ?? ""}`.replace(/ · $/, ""),
        actions: actionsOf(actRow(r), env), phone,
      });
    }
  }
  for (const r of staleList) {
    const st = String(r.status);
    const ex = exOf.get(r.id);
    const label = r.kind === "WALKIN" ? (ticketOf(r)?.number ?? svcName(r.serviceId)) : ex?.customerName ?? "";
    const d = bkkDayOf((r.checkedInAt ?? r.startedAt ?? r.startAt).getTime());
    todo.push({
      appointmentId: r.id, kind: "STALE", title: `${label} · ค้างจากวันที่ ${d}`,
      detail: st === "IN_SERVICE" ? "ยังไม่ได้กดเสร็จ — ปิดงานให้เรียบร้อย" : "ยังรออยู่ในระบบตั้งแต่วันก่อน — ยกเลิกถ้าลูกค้าไม่อยู่แล้ว",
      actions: actionsOf(actRow(r as AnyRow), env),
      phone: access.fullPhone && ex?.customerPhone ? ex.customerPhone : null,
    });
  }

  // ── ตัวเลขบน ──
  const booked = todayRows.filter((r) => r.kind === "BOOKED");
  const walkIns = todayRows.filter((r) => r.kind === "WALKIN");
  const waitingRows = todayRows.filter((r) => IN_SHOP.has(String(r.status)));
  let longest: { min: number; ticket: string | null } | null = null;
  for (const r of waitingRows) {
    if (!r.checkedInAt) continue;
    const m = Math.max(0, Math.floor((nowMs - r.checkedInAt.getTime()) / MIN_MS));
    if (!longest || m > longest.min) longest = { min: m, ticket: ticketOf(r)?.number ?? null };
  }
  const kpi: TodayLineView["kpi"] = {
    booked: booked.filter((r) => String(r.status) !== "CANCELLED").length,
    arrived: booked.filter((r) => ["ARRIVED", "IN_SERVICE", "DONE"].includes(String(r.status))).length,
    absent: booked.filter((r) => ["LATE", "NO_SHOW"].includes(String(r.status))).length,
    upcoming: booked.filter((r) => ["PENDING", "CONFIRMED"].includes(String(r.status))).length,
    walkIns: walkIns.length,
    walkInsLeft: walkIns.filter((r) => String(r.status) === "CANCELLED").length,
    waiting: waitingRows.length,
    longestWaitMin: longest?.min ?? null,
    longestWaitTicket: longest?.ticket ?? null,
    done: todayRows.filter((r) => String(r.status) === "DONE").length,
  };

  // ── กล่องทำไม: walk-in ที่รอ ออกบัตรล่าสุด และตัววางคิวมีเหตุผล ──
  let why: TodayLineView["why"] = null;
  let whyAt = -Infinity;
  for (const r of live) {
    if (r.kind !== "WALKIN" || String(r.status) !== "QUEUED" || isSkipped(r)) continue;
    const pj = placedPj(r.id);
    if (!pj?.why) continue;
    const issued = ticketOf(r)?.createdAt.getTime() ?? r.checkedInAt?.getTime() ?? r.createdAt.getTime();
    if (issued > whyAt) {
      whyAt = issued;
      why = { appointmentId: r.id, ticketNumber: ticketOf(r)?.number ?? null, staffName: staffName.get(pj.staffId!) ?? null, startMs: pj.startAt, text: pj.why.text };
    }
  }

  // ── ฟอร์ม walk-in ──
  let walkInForm: TodayLineView["walkInForm"] = null;
  if (access.walkIn) {
    const svcs = await db.bookingService.findMany({
      where: { tenantId: ctx.tenantId, unitId: ctx.unitId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, durationMin: true },
    });
    const res = svcs.length ? await resolveSettingsMany({ tenantId: ctx.tenantId }, ["booking.service.walkIn"], svcs.map((s) => ({ unitId: ctx.unitId, serviceId: s.id }))) : [];
    // ทุกบริการ active (ข้อสอบ A-4 = 6) · บริการที่ค่าตั้งไม่รับ walk-in (ปิด/ยาวเกินเกณฑ์) ⇒ walkIn:false (จอแสดงเป็นตัวเลือกปิด · createWalkIn ปฏิเสธซ้ำอีกชั้น)
    const services = svcs.map((s, i) => {
      const v = res[i]?.["booking.service.walkIn"]?.value as { enabled?: unknown; closeAtOrAboveMin?: unknown } | null | undefined;
      const open = !v || typeof v !== "object" ? true : v.enabled !== false && !(typeof v.closeAtOrAboveMin === "number" && s.durationMin >= v.closeAtOrAboveMin);
      return { id: s.id, name: s.name, durationMin: s.durationMin, walkIn: open };
    });
    walkInForm = { services, staff: pre.profiles.map((p) => ({ id: p.staffId, name: p.name })) };
  }

  return {
    unitId: ctx.unitId,
    dayStr: today,
    nowMs,
    openMin: hours.openMin,
    closeMin: hours.closeMin,
    ...axisOf(today, nowMs, hours.openMin, hours.closeMin),
    kpi,
    staff: staffRows,
    waiting,
    inService,
    skipped: skippedJobs,
    todo,
    why,
    access,
    myStaffIds: mineIds,
    walkInForm,
  };
}

// ───────────────────────── ปฏิทินรายวันตามคน (อ่านอย่างเดียว) ─────────────────────────

/** ทุกงานของวัน (ยกเว้นยกเลิก) ในคอลัมน์ช่างตาม plannedStaffId ?? staffId · เวลา = แผน (walk-in รอ) ไม่งั้น startAt/endAt · ไม่มีเบอร์ */
export async function loadDayCalendar(ctx: Ctx, viewer: LineViewer, opts: { dateStr: string; now?: Date }): Promise<DayCalendarView | null> {
  if (!okCtx(ctx) || !viewer?.access?.view) return null;
  const dateStr = typeof opts?.dateStr === "string" && isRealDateStr(opts.dateStr) ? opts.dateStr : null;
  if (!dateStr) return null;
  const values = await lineSettingsOf(ctx.tenantId, ctx.unitId);
  if (!values) return null;
  const db = tenantDb(ctx);
  const [staff, rows, hours] = await Promise.all([
    db.bookingStaff.findMany({
      where: { tenantId: ctx.tenantId, unitId: ctx.unitId, active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    db.appointment.findMany({
      where: { tenantId: ctx.tenantId, unitId: ctx.unitId, startAt: { gte: localToUtc(dateStr, 0), lt: localToUtc(dateStr, 24 * 60) }, status: { not: "CANCELLED" } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      select: {
        id: true, kind: true, status: true, staffId: true, plannedStaffId: true, plannedStartAt: true, startAt: true, endAt: true,
        customerName: true, queueTicketId: true, service: { select: { name: true } },
      },
    }),
    shopHoursOf(ctx, dateStr),
  ]);
  const ticketIds = rows.map((r) => r.queueTicketId).filter((x): x is string => !!x);
  const tickets = ticketIds.length
    ? await db.queueTicket.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: ticketIds } }, select: { id: true, number: true } })
    : [];
  const num = new Map(tickets.map((t) => [t.id, t.number]));
  const cols = staff.map((s) => ({ staffId: s.id, name: s.name, blocks: [] as DayCalendarView["staff"][number]["blocks"] }));
  const colOf = new Map(cols.map((c) => [c.staffId, c]));
  for (const r of rows) {
    const col = colOf.get(r.plannedStaffId ?? r.staffId) ?? colOf.get(r.staffId);
    if (!col) continue;
    const len = r.endAt.getTime() - r.startAt.getTime();
    const waitingWalkIn = r.kind === "WALKIN" && String(r.status) === "QUEUED";
    const s = waitingWalkIn && r.plannedStartAt ? r.plannedStartAt.getTime() : r.startAt.getTime();
    col.blocks.push({
      appointmentId: r.id, startMs: s, endMs: s + len, status: String(r.status),
      label: r.kind === "WALKIN" ? r.service.name : r.customerName,
      ticketNumber: r.queueTicketId ? num.get(r.queueTicketId) ?? null : null,
    });
  }
  return {
    unitId: ctx.unitId, dateStr, prevDateStr: addDaysStr(dateStr, -1), nextDateStr: addDaysStr(dateStr, 1),
    openMin: hours.openMin, closeMin: hours.closeMin, staff: cols,
  };
}

// ───────────────────────── ด่านของ server action ─────────────────────────

/**
 * ด่านเดียวกับปุ่ม (§3.2.1): งานไม่พบ/ข้ามขอบเขต/ร้านไม่เปิดแถวเดียว ⇒ NOT_FOUND · action ไม่อยู่ในปุ่มของงานนั้น ณ now ⇒ FORBIDDEN ·
 * op "walkin" (ไม่มี id) ⇒ ตาม access.walkIn
 */
export async function authorizeLineOp(ctx: Ctx, viewer: LineViewer, op: LineAction | "walkin", appointmentId: string | null, opts?: { now?: Date }): Promise<AuthResult> {
  const NF: AuthResult = { ok: false, code: "NOT_FOUND", reason: "ไม่พบงานนี้ในสาขานี้" };
  const FB: AuthResult = { ok: false, code: "FORBIDDEN", reason: "บัญชีนี้ทำรายการนี้กับงานนี้ไม่ได้ (หรือสถานะงานเปลี่ยนแล้ว) — โหลดหน้าใหม่แล้วลองอีกครั้ง" };
  if (!okCtx(ctx) || !viewer?.access) return NF;
  const values = await lineSettingsOf(ctx.tenantId, ctx.unitId);
  if (!values) return NF;
  if (op === "walkin") {
    if (appointmentId !== null && appointmentId !== undefined && appointmentId !== "") return NF;
    return viewer.access.walkIn ? { ok: true } : { ok: false, code: "FORBIDDEN", reason: "บัญชีนี้รับลูกค้า walk-in ไม่ได้" };
  }
  if (typeof appointmentId !== "string" || !appointmentId) return NF;
  const now = validNow(opts?.now);
  const nowMs = now.getTime();
  const today = bkkDayOf(nowMs);
  const db = tenantDb(ctx);
  const r = await db.appointment.findFirst({
    where: { id: appointmentId, tenantId: ctx.tenantId, unitId: ctx.unitId },
    select: { id: true, kind: true, status: true, assignMode: true, staffId: true, plannedStaffId: true, startAt: true, checkedInAt: true, startedAt: true, policySnapshot: true, queueTicketId: true },
  });
  if (!r) return NF;
  const [tk, mineIds] = await Promise.all([
    r.queueTicketId ? db.queueTicket.findFirst({ where: { id: r.queueTicketId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { status: true } }) : Promise.resolve(null),
    myStaffIds(ctx, viewer.userId),
  ]);
  const acts = actionsOf(
    {
      kind: r.kind, status: String(r.status), assignMode: r.assignMode, staffId: r.staffId, plannedStaffId: r.plannedStaffId, startAt: r.startAt,
      checkedInAt: r.checkedInAt, policySnapshot: r.policySnapshot, ticketStatus: tk ? String(tk.status) : null, stale: isStale({ ...r, status: String(r.status) }, today),
    },
    { access: viewer.access, cancelStale: viewer.cancelStale === true, mine: new Set(mineIds), values, nowMs, today },
  );
  return acts.includes(op) ? { ok: true } : FB;
}
