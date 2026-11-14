// HR H2.2 ▸ บอร์ดตารางกะ (server เท่านั้น) — ตัวโหลดบอร์ด · ชั้นวันลา (อ่านอย่างเดียว) · แกนของ server action
//   • ไม่เก็บอะไรใหม่: เขียนทุกอย่างผ่านเครื่องยนต์ H2.1 (generateFromTemplate · addEntry · moveEntry · removeEntry · copyWeek · publishRoster)
//     อ่านผ่าน listRoster (+ listShifts · listHolidays · พนักงาน/ใบลาผ่านตัวอ่านใหม่ในไฟล์นี้ที่ map เป็น DTO ทันที)
//   • ผู้อ่านบอร์ด = OWNER · MANAGER · hr.employee.create (= ผู้อ่านของ H2.1) — อื่น ๆ ได้ null (หน้า 404) · ผู้เขียน = canManageHrSettings
//   • DTO (whitelist — roster-board-shared.ts): ชื่อ · อักษรย่อ · ตำแหน่ง · ทดลองงาน · ยืมตัว (+ ชื่อสาขาประจำเฉพาะแถวยืมตัว) · ชิปกะ · สถานะลา ·
//     ไม่มี เงิน / ชนิดค่าจ้าง / เลขบัตร / บัญชี / ที่อยู่ / โทร / อีเมล / PIN / linkedUserId / เหตุผลลา / หมายเหตุของแถว (Q13 · Q17)
//   • แกนของ action = rosterOpCore(auth, op) (ทดสอบได้โดยไม่มี Next) · ผล = { ok:true, …จำนวน } | { ok:false, code } (รหัสจาก allowlist เท่านั้น)
//   • เวลา: วันที่ "YYYY-MM-DD" ตามปฏิทินไทย · todayKey มาจากหน้า (ข้อสอบส่งเอง — ไม่ขึ้นกับนาฬิกาจริง) ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { addEntry, copyWeek, generateFromTemplate, listRoster, moveEntry, publishRoster, removeEntry, unitOfDay, type RosterSkip } from "./roster";
import { ROSTER_RULE_DEFAULTS, ROSTER_RULE_TEXT } from "./roster-rules";
import { hrAccessOf, hrViewerOf, type HrViewer } from "./privacy";
import { hrScopeOf, unitNamesOf, unitsForScope } from "./scope";
import { canManageHrSettings, listHolidays, listShifts, type SettingsViewer } from "./settings";
import { bkkDayKey } from "./time-rules";
import {
  addDaysKey,
  dayLabel,
  hhmm,
  isDayKey,
  mondayOf,
  rangeLabel,
  rosterTitle,
  ROSTER_MSG_CODE_OF,
  shiftKind,
  shiftLabel,
  timeRange,
  weekDays,
  type RosterBoardDto,
  type RosterCellDto,
  type RosterDayDto,
  type RosterEntryDto,
  type RosterHolidayLine,
  type RosterInfoRow,
  type RosterLeaveDto,
  type RosterOpResult,
  type RosterRowDto,
  type RosterRuleKey,
  type RosterRuleRow,
  type RosterShiftDto,
  type RosterSkipCounts,
  type RosterWarnDto,
} from "./roster-board-shared";

type Ctx = { tenantId: string; systemId: string };
export type RosterBoardViewer = SettingsViewer & { userId?: string | null };
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const ALL = "all";
const ALL_UNITS_TH = "ทุกสาขา";
const LEAVE_PLAIN_TH = "ลา";
/** หมวดการลา (ป้ายไทยของ enum HrLeaveType) — ใช้เมื่อใบลาไม่มีประเภทของร้าน */
const LEAVE_CATEGORY_TH: Record<string, string> = { SICK: "ลาป่วย", PERSONAL: "ลากิจ", VACATION: "ลาพักร้อน", OTHER: "ลาอื่น ๆ" };
const THAI_LEADING_VOWELS = new Set(["เ", "แ", "โ", "ใ", "ไ"]);

// ── สิทธิ์ ──
/** อ่านบอร์ดได้ไหม (= ผู้อ่านของ H2.1 R2): ผู้เขียน + บทบาท MANAGER */
export const canReadRoster = (v: RosterBoardViewer | null | undefined): boolean => !!v && (canManageHrSettings(v) || v.role === "MANAGER" || (String(v.userId ?? "").startsWith("apikey:") && (v.permissions as Record<string, unknown> | null | undefined)?.["hr.roster.read"] === true)); // HR H4.8 ▸ + คีย์อ่านตารางกะ เฉพาะผู้ดูสังเคราะห์ของคีย์ API (ไม่ให้สิทธิ์เขียน · คนไม่ได้อะไรเพิ่ม) ◂
const membershipOf = (v: RosterBoardViewer): MembershipCtx =>
  ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown> }) as MembershipCtx;

// ═════════════════════════ ชั้นวันลา (R6 · อ่านอย่างเดียว) ═════════════════════════
export type RosterLeaveCell = { employeeId: string; day: string; status: "APPROVED" | "PENDING"; label: string };
/**
 * ใบลา PENDING + APPROVED ที่ทับสัปดาห์ ของพนักงานที่ส่งมา (ผู้เรียกกรองขอบเขตแล้ว) → ต่อวัน
 * ป้าย = ชื่อประเภทการลาของร้าน (หรือหมวด) เฉพาะผู้อ่านใบลาได้ (hr.leave.read) · อื่น ๆ = "ลา" · ไม่เคยส่งเหตุผล/ไฟล์แนบ/ผู้ยื่น/จำนวนวัน
 */
export async function rosterLeaveOverlay(ctx: Ctx, viewer: RosterBoardViewer, range: { from: string; to: string }, employeeIds: string[]): Promise<RosterLeaveCell[]> {
  if (!employeeIds.length || !isDayKey(range.from) || !isDayKey(range.to)) return [];
  const readLeave = hrAccessOf({ ...membershipOf(viewer), userId: viewer.userId ?? "" } as HrViewer).readLeave;
  const rows = await tenantDb(ctx).hrLeave.findMany({
    where: { employeeId: { in: employeeIds }, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: dbDate(range.to) }, toDate: { gte: dbDate(range.from) } },
    select: { employeeId: true, fromDate: true, toDate: true, status: true, type: true, policy: { select: { name: true } } },
    orderBy: [{ fromDate: "asc" }, { id: "asc" }],
    take: 2000,
  });
  const out = new Map<string, RosterLeaveCell>();
  for (const r of rows) {
    const status = r.status === "APPROVED" ? "APPROVED" : "PENDING";
    const label = readLeave ? (r.policy?.name?.trim() || LEAVE_CATEGORY_TH[r.type] || LEAVE_PLAIN_TH) : LEAVE_PLAIN_TH;
    for (let d = dayOf(r.fromDate) < range.from ? range.from : dayOf(r.fromDate); d <= dayOf(r.toDate) && d <= range.to; d = addDaysKey(d, 1)) {
      const k = `${r.employeeId}|${d}`;
      const prev = out.get(k);
      if (!prev || (prev.status === "PENDING" && status === "APPROVED")) out.set(k, { employeeId: r.employeeId, day: d, status, label }); // อนุมัติแล้วชนะรออนุมัติ
    }
  }
  return [...out.values()];
}

// ═════════════════════════ ตัวโหลดบอร์ด (R3 · R4 · R5 · R7 · R8) ═════════════════════════
const EMP_SELECT = {
  id: true,
  name: true,
  position: true,
  employmentStatus: true,
  unitId: true,
  active: true,
  createdAt: true,
  startDate: true,
  endDate: true,
  contractEndAt: true,
  units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 },
} as const satisfies Prisma.HrEmployeeSelect;
type EmpRow = Prisma.HrEmployeeGetPayload<{ select: typeof EMP_SELECT }>;
const isEnded = (e: EmpRow) => !e.active || e.employmentStatus === "ENDED";
function employedOn(e: EmpRow, day: string): boolean {
  if (isEnded(e)) return false;
  if (e.startDate && day < dayOf(e.startDate)) return false;
  const last = e.endDate ?? e.contractEndAt;
  return !(last && day > dayOf(last));
}
/** อักษรย่อบนวงกลม: ตัวแรกที่ไม่ใช่สระหน้า (เจ → จ) */
function initialOf(name: string): string {
  for (const ch of Array.from(name.trim())) if (!THAI_LEADING_VOWELS.has(ch) && ch.trim()) return ch;
  return "·";
}
const RULE_ORDER: RosterRuleKey[] = ["MAX_DAY", "REST", "DAY_OFF", "MAX_WEEK"];
/** ป้ายกฎจากค่าตั้งต้นของเครื่องยนต์ (ROSTER_RULE_DEFAULTS) — ไม่พิมพ์ตัวเลขเอง */
export function rosterRuleLabel(rule: RosterRuleKey): { label: string; limit: number | null } {
  const L = ROSTER_RULE_DEFAULTS;
  switch (rule) {
    case "MAX_DAY":
      return { label: `ชม. สูงสุด/วัน ${L.maxDayMin / 60}`, limit: L.maxDayMin / 60 };
    case "REST":
      return { label: `พักระหว่างกะ ≥ ${L.minRestMin / 60} ชม.`, limit: L.minRestMin / 60 };
    case "DAY_OFF":
      return { label: `วันหยุด ≥ ${L.minDaysOffPerWeek}/สัปดาห์`, limit: L.minDaysOffPerWeek };
    case "MAX_WEEK":
      return { label: `ชม./สัปดาห์ ≤ ${L.maxWeekMin / 60}`, limit: L.maxWeekMin / 60 };
    default:
      return { label: ROSTER_RULE_TEXT.OVERLAP, limit: null };
  }
}
const hours1 = (min: number) => Math.round((min / 60) * 10) / 10;

export type RosterBoardInput = { week?: unknown; unit?: unknown; todayKey?: unknown };

/** บอร์ด 1 สัปดาห์ (จันทร์–อาทิตย์) · null = ผู้ดูไม่ใช่ผู้อ่านตารางกะ */
export async function loadRosterBoard(ctx: Ctx, viewer: RosterBoardViewer, input: RosterBoardInput): Promise<RosterBoardDto | null> {
  if (!canReadRoster(viewer)) return null;
  const scope = hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess });
  const askToday = input?.todayKey;
  const todayKey = isDayKey(askToday) ? askToday : bkkDayKey(new Date());
  const thisMonday = mondayOf(todayKey)!;
  const monday = mondayOf(input?.week) ?? thisMonday;
  const days = weekDays(monday);
  const sunday = days[6];
  const db = tenantDb(ctx);

  // ── สาขา (R3 · Q2): ทุกสาขา ⇒ "ทุกสาขา" เมื่อร้านมี ≥ 2 สาขา · จำกัดสาขา ⇒ เฉพาะสาขาของตัวเอง (หลายสาขา ⇒ "ทุกสาขาของฉัน") ·
  //    ขอสาขานอกขอบเขต ⇒ กลับไปค่าตั้งต้นเงียบ ๆ (ไม่บอกว่ามีสาขานั้น)
  const units = await unitsForScope(ctx.tenantId, scope);
  const allBranches = scope.unitIds === "*";
  const allowAll = units.length >= 2 || (allBranches && units.length === 0);
  const fallback = allowAll ? ALL : (units[0]?.id ?? ALL);
  const askU = typeof input?.unit === "string" ? input.unit.trim() : "";
  const unitSel = askU === ALL && allowAll ? ALL : units.some((u) => u.id === askU) ? askU : fallback;
  const view: "*" | string[] = unitSel === ALL ? (allBranches ? "*" : units.map((u) => u.id)) : [unitSel];
  const inView = (u: string | null) => view === "*" || (!!u && view.includes(u));
  const unitName = unitSel === ALL ? ALL_UNITS_TH : (units.find((u) => u.id === unitSel)?.name ?? ALL_UNITS_TH);

  // ── เครื่องยนต์: อ่านครั้งเดียว 7 วัน ──
  const lr = await listRoster(ctx, viewer, { from: monday, to: sunday, unitId: unitSel === ALL ? null : unitSel });
  const entries = lr.ok ? lr.entries.filter((e) => e.date >= monday && e.date <= sunday) : [];
  const warnings = lr.ok ? lr.warnings : [];

  // ── แถว (Q3): คนที่อยู่ในมุมมองวันใดวันหนึ่งของสัปดาห์ (สาขาประจำ หรือยืมตัวเข้ามาทับสัปดาห์) ∪ เจ้าของแถวตารางกะในมุมมอง ──
  const liveWhere: Prisma.HrEmployeeWhereInput =
    view === "*"
      ? { active: true }
      : { active: true, OR: [{ unitId: { in: view } }, { units: { some: { unitId: { in: view }, fromDate: { lte: dbDate(sunday) }, OR: [{ toDate: null }, { toDate: { gte: dbDate(monday) } }] } } }] };
  const live = (await db.hrEmployee.findMany({ where: liveWhere, select: EMP_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 2000 })).filter(
    (e) => !isEnded(e) && days.some((d) => employedOn(e, d) && inView(unitOfDay(e, d))),
  );
  const have = new Set(live.map((e) => e.id));
  const missing = [...new Set(entries.map((e) => e.employeeId))].filter((id) => !have.has(id));
  const owners = missing.length ? await db.hrEmployee.findMany({ where: { id: { in: missing } }, select: EMP_SELECT, take: 2000 }) : [];
  const borrowedOf = (e: EmpRow) => view !== "*" && !(e.unitId && view.includes(e.unitId));
  const emps = [...live, ...owners].sort((a, b) => Number(borrowedOf(a)) - Number(borrowedOf(b)) || a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const homeNames = await unitNamesOf(ctx.tenantId, emps.filter(borrowedOf).map((e) => e.unitId));

  // ── กะ: ชื่อ/สีของกะที่แถวอ้าง + รายการกะที่ใช้ได้ (ตัวเลือก) ──
  const shiftIds = [...new Set(entries.map((e) => e.shiftId))];
  const shiftInfo = new Map(
    (shiftIds.length ? await db.hrShift.findMany({ where: { id: { in: shiftIds } }, select: { id: true, name: true, colour: true }, take: 1000 }) : []).map((s) => [s.id, s]),
  );
  const shifts: RosterShiftDto[] = (await listShifts(ctx, { scope })).map((s) => ({
    id: s.id,
    label: shiftLabel(s.name),
    kind: shiftKind(s.colour),
    startMin: s.startMin,
    endMin: s.endMin,
    crossesMidnight: s.crossesMidnight,
    unitId: s.unitId,
    range: timeRange(s.startMin, s.endMin),
  }));

  // ── วันหยุด (ทั้งร้าน หรือของสาขาที่เลือก — สาขาชนะทั้งร้าน) ──
  const years = [...new Set([monday.slice(0, 4), sunday.slice(0, 4)].map(Number))];
  const hols = (await Promise.all(years.map((year) => listHolidays(ctx, { year, scope })))).flat();
  const holidayOn = (day: string) => {
    const same = hols.filter((h) => dayOf(h.date) === day);
    return (unitSel !== ALL ? same.find((h) => h.unitId === unitSel) : undefined) ?? same.find((h) => h.unitId === null) ?? null;
  };

  // ── ชั้นวันลา ──
  const leaves = await rosterLeaveOverlay(ctx, viewer, { from: monday, to: sunday }, emps.map((e) => e.id));
  const leaveOf = new Map(leaves.map((l) => [`${l.employeeId}|${l.day}`, l]));

  // ── ประกอบแถว ──
  const pastOf = (d: string) => d < todayKey;
  const entryDto = (e: (typeof entries)[number]): RosterEntryDto => {
    const s = shiftInfo.get(e.shiftId);
    return { id: e.id, shiftId: e.shiftId, label: shiftLabel(s?.name ?? ""), kind: shiftKind(s?.colour), start: hhmm(e.startMin), end: hhmm(e.endMin), overnight: e.crossesMidnight, paidMin: e.paidMin, published: e.published, source: String(e.source) };
  };
  const byEmpDay = new Map<string, RosterEntryDto[]>();
  for (const e of entries) {
    const k = `${e.employeeId}|${e.date}`;
    byEmpDay.set(k, [...(byEmpDay.get(k) ?? []), entryDto(e)]);
  }
  const warnRules = new Set(["MAX_DAY", "REST", "OVERLAP", "DAY_OFF", "MAX_WEEK"]);
  const rows: RosterRowDto[] = emps.map((e) => {
    const cells: RosterCellDto[] = days.map((day) => {
      const list = byEmpDay.get(`${e.id}|${day}`) ?? [];
      const u = unitOfDay(e, day);
      const here = inView(u) && employedOn(e, day);
      const state: RosterCellDto["state"] = pastOf(day) ? "past" : list.length ? "work" : here ? "off" : "out";
      const cell: RosterCellDto = { day, state, entries: list };
      const lv = leaveOf.get(`${e.id}|${day}`);
      if (lv && (here || list.length)) cell.leave = { status: lv.status, label: lv.label } satisfies RosterLeaveDto;
      if ((state === "work" || state === "off") && inView(u)) cell.unit = u;
      return cell;
    });
    const all = cells.flatMap((c) => c.entries);
    const mine = warnings.filter((w) => w.employeeId === e.id);
    const week = mine.filter((w) => w.rule === "MAX_WEEK").sort((a, b) => (b.valueMin ?? 0) - (a.valueMin ?? 0))[0];
    const borrowed = borrowedOf(e);
    return {
      employeeId: e.id,
      name: e.name,
      initial: initialOf(e.name),
      position: e.position?.trim() || null,
      probation: e.employmentStatus === "PROBATION",
      borrowed,
      homeUnitName: borrowed && e.unitId ? (homeNames.get(e.unitId) ?? null) : null,
      ended: isEnded(e),
      cells,
      weekMin: all.reduce((a, x) => a + x.paidMin, 0),
      shiftCount: all.length,
      leaveDays: cells.filter((c) => c.leave).length,
      warn: mine.some((w) => warnRules.has(w.rule)),
      weekWarnMin: week?.valueMin ?? null,
      weekLimitMin: week?.limitMin ?? null,
    };
  });

  // ── วัน ──
  const shown = new Set(rows.flatMap((r) => r.cells.flatMap((c) => c.entries.map((x) => x.id))));
  const dayDtos: RosterDayDto[] = days.map((key, i) => {
    const dow = (i + 1) % 7;
    const h = holidayOn(key);
    return {
      key,
      dow,
      label: dayLabel(key),
      weekend: dow === 6 || dow === 0,
      past: pastOf(key),
      headcount: rows.filter((r) => r.cells[i].entries.length > 0).length,
      ...(h ? { holiday: { name: h.name, shopOpen: h.shopOpen } } : {}),
    };
  });
  const notes: RosterHolidayLine[] = dayDtos.filter((d) => d.holiday).map((d) => ({ day: d.key, label: d.label, name: d.holiday!.name, shopOpen: d.holiday!.shopOpen }));

  // ── แผงกฎ (R8): ชื่อมาจากแถวบนบอร์ดเท่านั้น · คำเตือนของคนที่ไม่ใช่แถว = นับแต่ไม่ระบุชื่อ ──
  const rowIdx = new Map(rows.map((r, i) => [r.employeeId, i]));
  const nameOf = new Map(rows.map((r) => [r.employeeId, r.name]));
  const ruleRow = (rule: RosterRuleKey): RosterRuleRow => {
    const ws = warnings.filter((w) => w.rule === rule).sort((a, b) => (rowIdx.get(a.employeeId) ?? 1e9) - (rowIdx.get(b.employeeId) ?? 1e9));
    const named = [...new Set(ws.filter((w) => nameOf.has(w.employeeId)).map((w) => w.employeeId))];
    const first = ws.find((w) => nameOf.has(w.employeeId));
    const { label, limit } = rosterRuleLabel(rule);
    return {
      rule,
      label,
      limit,
      ok: ws.length === 0,
      names: named.map((id) => nameOf.get(id)!),
      unnamed: new Set(ws.filter((w) => !nameOf.has(w.employeeId)).map((w) => w.employeeId)).size,
      hours: (rule === "MAX_WEEK" || rule === "MAX_DAY") && first?.valueMin !== undefined ? hours1(first.valueMin) : null,
      entryIds: [...new Set(ws.flatMap((w) => w.entryIds))].filter((id) => shown.has(id)),
    };
  };
  const ruleRows = RULE_ORDER.map(ruleRow);
  if (warnings.some((w) => w.rule === "OVERLAP")) ruleRows.push(ruleRow("OVERLAP"));
  const info: RosterInfoRow[] = (["HOLIDAY_WORK", "ON_LEAVE"] as const)
    .map((rule) => ({ rule, text: ROSTER_RULE_TEXT[rule], count: warnings.filter((w) => w.rule === rule).length }))
    .filter((x) => x.count > 0);
  const warnDtos: RosterWarnDto[] = warnings.map((w) => ({
    rule: w.rule,
    employeeId: w.employeeId,
    ...(w.day ? { day: w.day } : {}),
    ...(w.weekStart ? { weekStart: w.weekStart } : {}),
    ...(w.valueMin !== undefined ? { valueMin: w.valueMin } : {}),
    ...(w.limitMin !== undefined ? { limitMin: w.limitMin } : {}),
    entryIds: w.entryIds.filter((id) => shown.has(id)),
  }));

  const canWrite = canManageHrSettings(viewer);
  const unpublishedCount = lr.ok ? lr.unpublishedCount : 0;
  return {
    monday,
    prevMonday: addDaysKey(monday, -7),
    nextMonday: addDaysKey(monday, 7),
    todayKey,
    thisMonday,
    allPast: sunday < todayKey,
    unitSel,
    unitName,
    units: units.map((u) => ({ id: u.id, name: u.name })),
    allBranches,
    canWrite,
    canPublish: canWrite && unpublishedCount > 0,
    unpublishedCount,
    loadFailed: !lr.ok,
    warnings: warnDtos,
    totalMin: rows.reduce((a, r) => a + r.weekMin, 0),
    notes,
    title: rosterTitle(monday, unitName),
    rangeLabel: rangeLabel(monday),
    borrowedCount: rows.filter((r) => r.borrowed).length,
    days: dayDtos,
    rows,
    shifts,
    rulePanel: { rows: ruleRows, info },
  };
}

// ═════════════════════════ แกนของ server action (R12 · Q11) ═════════════════════════
export type RosterCoreOp = { kind?: unknown; systemId?: unknown; [k: string]: unknown };
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) ? v : undefined);
const fail = (reason: unknown): RosterOpResult => ({ ok: false, code: (typeof reason === "string" && ROSTER_MSG_CODE_OF.get(reason)) || "failed" });
function skipCounts(skipped: RosterSkip[]): RosterSkipCounts {
  const out: RosterSkipCounts = {};
  for (const s of skipped) {
    const k = s.reason === "EXISTS" || s.reason === "NO_SHIFT" || s.reason === "HOLIDAY" || s.reason === "SHIFT_ARCHIVED" ? s.reason : "OTHER";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
type AuthLike = { user: { id: string }; active: { tenantId: string; role: MembershipCtx["role"]; unitAccess: unknown; permissions: unknown } };

/**
 * งานเขียน 1 ครั้งของบอร์ด (สร้างจากแม่แบบ · คัดลอกสัปดาห์ · เพิ่ม · ย้าย · ลบ · เผยแพร่) — `auth` = รูปของ requireTenant()
 *   ด่านคีย์ (assertCan hr.employee.create) → ระบบ HR ของร้านนี้ (ไม่ใช่ ⇒ noSystem) → เครื่องยนต์ H2.1 (ตรวจสาขา/วัน/กะซ้ำทุกครั้ง)
 *   ไม่รับ note จาก client (Q17) · ข้อผิดพลาดใด ๆ ⇒ "failed" (ไม่ส่งข้อความระบบ/stack)
 */
export async function rosterOpCore(auth: unknown, op: RosterCoreOp): Promise<RosterOpResult> {
  try {
    const a = auth as AuthLike;
    const viewer = hrViewerOf(a);
    const tenantId = a.active.tenantId;
    if (typeof tenantId !== "string" || !tenantId) return fail(null);
    try {
      assertCan(membershipOf(viewer), { module: "hr", action: "hr.employee.create" });
    } catch {
      return { ok: false, code: "noPerm" };
    }
    const systemId = str(op?.systemId);
    const sys = systemId ? await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } }) : null;
    if (!sys) return { ok: false, code: "noSystem" };
    const ctx: Ctx = { tenantId, systemId: sys.id };
    const unitId = str(op.unitId) ?? null;
    switch (op.kind) {
      case "generate": {
        const r = await generateFromTemplate(ctx, viewer, { from: str(op.from) ?? "", to: str(op.to) ?? "", unitId });
        return r.ok ? { ok: true, created: r.created, skipped: r.skipped.length, skippedBy: skipCounts(r.skipped) } : fail(r.reason);
      }
      case "copy": {
        const r = await copyWeek(ctx, viewer, { fromWeek: str(op.fromWeek) ?? "", toWeek: str(op.toWeek) ?? "", unitId });
        return r.ok ? { ok: true, created: r.created, skipped: r.skipped.length, skippedBy: skipCounts(r.skipped), warnings: r.warnings.length } : fail(r.reason);
      }
      case "add": {
        const s = int(op.startMin);
        const e = int(op.endMin);
        const times = s !== undefined && e !== undefined ? { startMin: s, endMin: e } : {};
        const r = await addEntry(ctx, viewer, { employeeId: str(op.employeeId) ?? "", date: str(op.date) ?? "", shiftId: str(op.shiftId) ?? "", ...times });
        return r.ok ? { ok: true, id: r.id } : fail(r.reason);
      }
      case "move": {
        const patch = { ...(str(op.date) ? { date: str(op.date) } : {}), ...(str(op.shiftId) ? { shiftId: str(op.shiftId) } : {}), ...(str(op.employeeId) ? { employeeId: str(op.employeeId) } : {}) };
        const r = await moveEntry(ctx, viewer, str(op.entryId) ?? "", patch);
        return r.ok ? { ok: true, id: r.id } : fail(r.reason);
      }
      case "remove": {
        const r = await removeEntry(ctx, viewer, str(op.entryId) ?? "");
        return r.ok ? { ok: true } : fail(r.reason);
      }
      case "publish": {
        const r = await publishRoster(ctx, viewer, { from: str(op.from) ?? "", to: str(op.to) ?? "", unitId });
        return r.ok ? { ok: true, published: r.published } : fail(r.reason);
      }
      default:
        return fail(null);
    }
  } catch {
    return fail(null);
  }
}
// ◂ HR H2.2
