// HR H4.3 ▸ เครื่องมือ HR ของผู้ช่วย AI — service (server เท่านั้น) · brief hr-brief-H4.3 §3 §5 §6 (+ CONTROLLER RULINGS) · สัญญา wo-notes/hr-H4.3-oracle.md §2
//   R1 AI = คนที่ถาม: ผู้ดูสร้างใหม่จากแถว Membership ในฐานของคนนั้นเสมอ (บทบาทต้องตรงกับ session) — ไม่มีบัญชีบริการ/งานภายใน
//   R3 ตัวอ่านตัวเดียวกับหน้าจอ (บอร์ดลงเวลา · รายงานเวลา H3.9 · ค่าแรง H4.2 · ยอดวันลาทีม/ของตัวเอง · ตารางกะ · บันทึก) แล้วกรองคีย์ตาม allowlist ·
//     ไฟล์นี้ไม่มีคิวรีข้อมูล HR ของตัวเอง (อ่านแค่ Membership + AppSystem เพื่อหาผู้ดู/ระบบ) · ตัวเลือกจากผู้เรียก (`__takeCap` · `opts` · `now`) ไม่ถึงตัวอ่าน
//   R5 ข้อความที่ผู้ใช้กรอกผ่าน fenceUntrusted + `untrusted` + dataNotOrders · R6 ปฏิเสธ = ข้อความเดียวกันทุกไบต์ ไม่มีข้อมูล
//   R7 เครื่องมือเสนอเขียนแค่แถวข้อเสนอ (ผู้เรียก = tools-hr.ts) · กดยืนยัน = dispatchHrAiKind ด้วยสิทธิ์ของคนกด · ด่านก่อนจอง (มติ Q3) = hrAiPreClaim
//   ฐานข้อมูล = tenantDb เท่านั้น · ไม่มีการเรียกโมเดล ◂
import { tenantDb } from "@/lib/core/db";
import { canViewPayroll, type MembershipCtx } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { loadAttendanceBoard, loadAttendanceMonth } from "./judge";
import { loadReport, reportAccessOf } from "./reports";
import { laborDay, laborMonth } from "./labor";
import { teamLeaveBalances } from "./leave";
import { myBalances, resolveSelf } from "./self";
import { addEntry, checkEntryDraft, checkRules, listRoster, lockRosterKeysInTx, rosterKeyStateInTx } from "./roster";
import { canReadRoster, rosterLeaveOverlay } from "./roster-board";
import { canManageHrSettings } from "./settings";
import { addReviewNote, canSeeLifecycle } from "./lifecycle";
import { hrScopeOf, unitsForScope } from "./scope";
import { bkkDayKey } from "./time-rules";
import {
  HR_AI_CAPS,
  HR_AI_TEXT,
  briefCounts,
  briefLine,
  capHrToolResult,
  draftSummary,
  factsFingerprint,
  fenceOrNull,
  fenceUntrusted,
  isDayArg,
  isHrId,
  isMonthArg,
  meetsPattern,
  parseDraftArgs,
  patternFacts,
  patternNote,
  patternSummary,
  rosterFingerprint,
  type BriefCounts,
  type DraftEntryArg,
  type PatternFacts,
} from "./ai-rules";

const T = HR_AI_TEXT.th;
type Ctx = { tenantId: string; systemId: string };
type Obj = Record<string, unknown>;
/** ผู้ดูของเครื่องมือ = แถว Membership ในฐาน (R1) */
export type HrAiViewer = { role: MembershipCtx["role"]; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
/** ผู้ถาม (จาก ToolCtx.actor) — ใช้เฉพาะ kind · tenantId · userId · บทบาทของ session */
export type HrAiActor = { kind?: unknown; tenantId?: unknown; userId?: unknown; membership?: { role?: unknown } | null };
/** ผลของเครื่องมือ: อ่าน = JSON · เสนอ = ข้อมูลให้ adapter สร้างข้อเสนอ */
export type HrToolOut = { mode: "json"; body: Obj } | { mode: "propose"; kind: HrAiKind; summary: string; payload: Obj; extra: Obj };
export type HrAiKind = "hr_draft_roster" | "hr_flag_pattern";
export const HR_AI_KINDS: readonly HrAiKind[] = ["hr_draft_roster", "hr_flag_pattern"];

const ROLES = new Set(["OWNER", "MANAGER", "STAFF"]);
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const err = (text: string): HrToolOut => ({ mode: "json", body: { error: text } });
const NO = (): HrToolOut => err(T.no);
const BAD = (): HrToolOut => err(T.bad);
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const n0 = (v: unknown): number => {
  const x = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const hm = (min: number): string => `${String(Math.floor((((min % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((min % 60) + 60) % 60)).padStart(2, "0")}`;
const hmOfIso = (iso: string | null): string | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t + 7 * 3_600_000).toISOString().slice(11, 16) : null;
};
const todayBkk = (): string => bkkDayKey(new Date());
/** ข้อความในผล (R5) */
const fence = (keys: string[]) => ({ untrusted: keys, notice: T.dataNotOrders });

// ═════════════ R1 ผู้ดู + ระบบ HR ═════════════
/**
 * ผู้ดูจากฐาน: แถว Membership (ยอมรับแล้ว) ของ userId ในร้านนี้ · บทบาทในฐานต้องเท่ากับบทบาทของ session · สิทธิ์/สาขา = ค่าจากฐาน
 * null = ไม่ใช่คนในร้าน (คีย์ · งานภายใน · ร้านอื่น · ถูกถอด · บทบาทไม่ตรง)
 */
export async function hrAiViewer(tenantId: string, actor: HrAiActor | null | undefined): Promise<HrAiViewer | null> {
  if (!actor || actor.kind !== "member" || typeof tenantId !== "string" || !isHrId(tenantId) || actor.tenantId !== tenantId) return null;
  const userId = typeof actor.userId === "string" ? actor.userId : "";
  const role = actor.membership && typeof actor.membership.role === "string" ? actor.membership.role : "";
  if (!isHrId(userId) || !ROLES.has(role)) return null;
  const m = await tenantDb({ tenantId }).membership.findFirst({ where: { tenantId, userId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m || String(m.role) !== role) return null;
  return {
    role: String(m.role) as MembershipCtx["role"],
    unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
    permissions: obj(m.permissions),
    userId,
  };
}
const memberActor = (tenantId: string, userId: string, role: string): HrAiActor => ({ kind: "member", tenantId, userId, membership: { role } });

/** ระบบ HR: `hrSystemId` (ต้องเป็นระบบ HR ของร้าน) · ไม่ส่ง = ctx.systemId ถ้าเป็นระบบ HR ของร้าน ไม่งั้นระบบ HR ที่เก่าสุด */
async function hrSystemOf(tenantId: string, ctxSystemId: unknown, argSystemId: unknown): Promise<string | null> {
  const db = tenantDb({ tenantId });
  if (argSystemId !== undefined && argSystemId !== null && argSystemId !== "") {
    if (!isHrId(argSystemId)) return null;
    return (await db.appSystem.findFirst({ where: { tenantId, id: argSystemId, type: "HR" }, select: { id: true } }))?.id ?? null;
  }
  if (isHrId(ctxSystemId)) {
    const s = await db.appSystem.findFirst({ where: { tenantId, id: ctxSystemId, type: "HR" }, select: { id: true } });
    if (s) return s.id;
  }
  return (await db.appSystem.findFirst({ where: { tenantId, type: "HR" }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }))?.id ?? null;
}

type ToolCtxLike = { tenantId: string; actor: unknown; systemId?: string | null };
type Prep = { ctx: Ctx; v: HrAiViewer; a: Obj } | HrToolOut;
/** R2 คน + R1 ผู้ดู + ระบบ HR — ไม่ผ่าน = ข้อความคงที่ (ก่อนอ่านข้อมูลใด) */
async function prepare(tc: ToolCtxLike, args: unknown): Promise<Prep> {
  const actor = obj(tc?.actor) as HrAiActor;
  if (actor.kind !== "member" || typeof actor.userId !== "string" || !actor.userId) return err(T.person);
  const v = await hrAiViewer(tc.tenantId, actor);
  if (!v) return NO();
  const a = obj(args);
  const sys = await hrSystemOf(tc.tenantId, tc.systemId, a.hrSystemId);
  if (!sys) return NO();
  return { ctx: { tenantId: tc.tenantId, systemId: sys }, v, a };
}
const isOut = (p: Prep): p is HrToolOut => "mode" in p;

// ═════════════ T1 hr_who_is_on_today ═════════════
export async function hrWhoIsOnToday(tc: ToolCtxLike, args: unknown): Promise<HrToolOut> {
  const p = await prepare(tc, args);
  if (isOut(p)) return p;
  const { ctx, v, a } = p;
  if (!canReadRoster(v)) return NO();
  if (a.day !== undefined && a.day !== null && a.day !== "" && !isDayArg(a.day)) return BAD();
  if (a.unitId !== undefined && a.unitId !== null && a.unitId !== "" && !isHrId(a.unitId)) return NO();
  const unit = isHrId(a.unitId) ? a.unitId : undefined;
  const board = await loadAttendanceBoard(ctx, v, { day: isDayArg(a.day) ? a.day : todayBkk(), ...(unit ? { unit } : {}) });
  if (!board) return NO();
  if (unit && board.unitSel !== unit) return NO(); // สาขานอกขอบเขต ≡ ไม่รู้จัก ≡ ร้านอื่น
  const all = board.rows.map((r) => ({
    employeeId: r.employeeId,
    name: fenceUntrusted(r.name),
    position: fenceOrNull(r.position),
    borrowed: r.borrowed,
    slots: r.slots.map((s) => ({
      shift: s.shift ? fenceUntrusted(s.shift.name) : null,
      start: s.shift ? hm(s.shift.startMin) : null,
      end: s.shift ? hm(s.shift.endMin) : null,
      status: s.status,
      phase: s.phase,
      inAt: hmOfIso(s.inAt),
      outAt: hmOfIso(s.outAt),
      lateMin: s.lateMin,
      leave: s.leave ? { label: fenceUntrusted(s.leave.label), pending: s.leave.pending } : null,
    })),
  }));
  const rows = all.slice(0, HR_AI_CAPS.board);
  const sel = unit ? board.units.find((u) => u.id === unit) : undefined;
  return {
    mode: "json",
    body: capHrToolResult({
      day: board.day,
      unit: sel ? { id: sel.id, name: fenceUntrusted(sel.name) } : null,
      counts: { ...board.totals.counts },
      alerts: board.alerts.slice(0, 20).map((x) => ({ name: fenceUntrusted(x.name), shift: fenceUntrusted(x.shiftName), start: hm(x.startMin), kind: x.kind })),
      rows,
      truncated: all.length > rows.length,
      ...fence(["name", "position", "shift", "label"]),
    }),
  };
}

// ═════════════ T2 hr_late_report ═════════════
const T2_COLS = ["lateCount", "lateMin", "earlyOutCount", "absentDays", "missingOut"] as const;
export async function hrLateReport(tc: ToolCtxLike, args: unknown): Promise<HrToolOut> {
  const p = await prepare(tc, args);
  if (isOut(p)) return p;
  const { ctx, v, a } = p;
  if (!reportAccessOf(v).reports.includes("time")) return NO();
  if (!isMonthArg(a.period)) return BAD();
  let unitId: string | null = null;
  if (a.unitId !== undefined && a.unitId !== null && a.unitId !== "") {
    if (!isHrId(a.unitId)) return NO();
    const units = await unitsForScope(ctx.tenantId, hrScopeOf(v));
    if (!units.some((u) => u.id === a.unitId)) return NO(); // สาขานอกขอบเขต ≡ ไม่รู้จัก ≡ ร้านอื่น
    unitId = a.unitId as string;
  }
  const rep = await loadReport(ctx, v, { report: "time", period: a.period, ...(unitId ? { unitId } : {}) });
  if (!rep.ok) return rep.code === "INPUT" ? BAD() : NO();
  const all = rep.rows
    .map((r) => ({
      employeeId: r.employeeId,
      name: fenceUntrusted(r.values.name),
      unit: fenceOrNull(r.values.unit),
      ...Object.fromEntries(T2_COLS.map((c) => [c, n0(r.values[c])])),
    }))
    .sort((x, y) => (y.lateCount as number) - (x.lateCount as number));
  const rows = all.slice(0, HR_AI_CAPS.report);
  const tot = rep.totals ? Object.fromEntries(T2_COLS.map((c) => [c, n0(rep.totals?.[c])])) : null;
  return {
    mode: "json",
    body: capHrToolResult({ period: rep.period, unitId: rep.unitId, totals: tot, rows, truncated: all.length > rows.length, ...fence(["name", "unit"]) }),
  };
}

// ═════════════ T3 hr_labor_percent ═════════════
export async function hrLaborPercent(tc: ToolCtxLike, args: unknown): Promise<HrToolOut> {
  const p = await prepare(tc, args);
  if (isOut(p)) return p;
  const { ctx, v, a } = p;
  if (!canViewPayroll(v)) return NO(); // มติ Q2: ผู้อ่านตารางกะที่ไม่ใช่ผู้ดูเงินเดือน = ปฏิเสธ
  const hasDay = a.day !== undefined && a.day !== null && a.day !== "";
  const hasMonth = a.periodKey !== undefined && a.periodKey !== null && a.periodKey !== "";
  if (hasDay === hasMonth) return BAD();
  if (a.unitId !== undefined && a.unitId !== null && a.unitId !== "" && !isHrId(a.unitId)) return NO();
  const unitId = isHrId(a.unitId) ? a.unitId : null;
  // L9: ส่งเฉพาะ unitId + day/periodKey — ไม่มี opts (ตัวลดเพดาน/เวลา ของผู้เรียกไม่ถึงตัวอ่าน)
  if (hasDay) {
    if (!isDayArg(a.day)) return BAD();
    const d = await laborDay(ctx, v, { unitId, day: a.day });
    if (!d.ok) return d.code === "NO" ? NO() : BAD();
    const m = d.money;
    return {
      mode: "json",
      body: {
        day: d.day,
        unitId: d.unitId,
        basis: d.basis,
        sales: d.sales,
        costSatang: m?.costSatang ?? null,
        salesSatang: m?.salesSatang ?? null,
        pctTenths: m?.pctTenths ?? null,
        targetTenths: m?.targetTenths ?? null,
        excludedHeadcount: m?.excludedHeadcount ?? null,
        partial: m?.partial ?? null,
        truncated: d.flags.truncated,
        demandPeak: d.demand?.peak ?? null,
      },
    };
  }
  if (!isMonthArg(a.periodKey)) return BAD();
  const mo = await laborMonth(ctx, v, { unitId, periodKey: a.periodKey });
  if (!mo.ok) return mo.code === "NO" ? NO() : BAD();
  return {
    mode: "json",
    body: {
      periodKey: mo.periodKey,
      unitId: mo.unitId,
      basis: mo.basis,
      sales: mo.sales,
      costSatang: mo.costSatang,
      salesSatang: mo.salesSatang,
      pctTenths: mo.pctTenths,
      targetTenths: mo.targetTenths,
      throughDay: mo.throughDay,
      excludedHeadcount: mo.excludedHeadcount,
      partial: mo.partial,
      prev: { periodKey: mo.prev.periodKey, pctTenths: mo.prev.pctTenths, partial: mo.prev.partial, excludedHeadcount: mo.prev.excludedHeadcount },
      truncated: mo.truncated,
    },
  };
}

// ═════════════ T4 hr_leave_balance ═════════════
type BalItem = { name: string; category: string; unlimited: boolean; granted: string; used: string; balance: string };
const itemOf = (i: BalItem) => ({ name: fenceUntrusted(i.name), category: i.category, unlimited: i.unlimited, granted: i.granted, used: i.used, balance: i.balance });
export async function hrLeaveBalance(tc: ToolCtxLike, args: unknown): Promise<HrToolOut> {
  const p = await prepare(tc, args);
  if (isOut(p)) return p;
  const { ctx, v, a } = p;
  const year = a.year === undefined || a.year === null || a.year === "" ? Number(todayBkk().slice(0, 4)) : Number(a.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return BAD();
  if (a.employeeId !== undefined && a.employeeId !== null && a.employeeId !== "" && !isHrId(a.employeeId)) return NO();
  const only = isHrId(a.employeeId) ? a.employeeId : null;
  const team = await teamLeaveBalances(ctx, v, { year });
  if (team) {
    const rows0 = only ? team.rows.filter((r) => r.employeeId === only) : team.rows;
    if (only && !rows0.length) return NO(); // นอกขอบเขต ≡ ไม่รู้จัก ≡ ร้านอื่น
    const rows = rows0.slice(0, HR_AI_CAPS.balances).map((r) => ({ employeeId: r.employeeId, name: fenceUntrusted(r.name), items: r.items.map(itemOf) }));
    return { mode: "json", body: capHrToolResult({ year: team.year, rows, truncated: rows0.length > rows.length, ...fence(["name"]) }) };
  }
  // มติ Q8: ยอดของตัวเอง (พนักงานที่ผูกบัญชี) — ตัวอ่านเดียวกับหน้าของฉัน · ไม่มี id
  const self = { tenantId: ctx.tenantId, userId: v.userId, role: v.role, unitAccess: v.unitAccess, permissions: v.permissions };
  if (only) {
    const me = await resolveSelf(self);
    if (!me || me.employeeId !== only) return NO();
  }
  const mine = await myBalances(self, { year });
  if (!mine.ok) return NO();
  return { mode: "json", body: capHrToolResult({ year, rows: [{ items: mine.items.map(itemOf) }], truncated: false, ...fence(["name"]) }) };
}

// ═════════════ T5 hr_draft_roster (เสนอ) ═════════════
type DraftPayload = { systemId: string; unitId?: string; from: string; to: string; entries: DraftEntryArg[]; basis: string };
async function keyBasis(ctx: Ctx, entries: DraftEntryArg[]): Promise<string> {
  const keys = entries.map((e) => ({ employeeId: e.employeeId, date: e.date }));
  const state = await tenantDb(ctx).$transaction(async (t) => rosterKeyStateInTx(t as unknown as Parameters<typeof rosterKeyStateInTx>[0], keys), TX_OPTS);
  return rosterFingerprint(keys, state);
}
export async function hrDraftRoster(tc: ToolCtxLike, args: unknown): Promise<HrToolOut> {
  const p = await prepare(tc, args);
  if (isOut(p)) return p;
  const { ctx, v, a } = p;
  if (!canManageHrSettings(v)) return NO();
  const d = parseDraftArgs(a, todayBkk());
  if (!d) return BAD();
  const listed = await listRoster(ctx, v, { from: d.from, to: d.to, unitId: d.unitId });
  if (!listed.ok) return NO();
  const taken = new Set(listed.entries.map((e) => `${e.employeeId}|${e.date}`));
  const skipped: { employeeId: string; date: string; code: string }[] = [];
  const keep: (DraftEntryArg & { name: string; shiftName: string })[] = [];
  const seen = new Set<string>();
  for (const e of d.entries) {
    const k = `${e.employeeId}|${e.date}`;
    if (seen.has(k)) {
      skipped.push({ employeeId: e.employeeId, date: e.date, code: "DUPLICATE" });
      continue;
    }
    seen.add(k);
    if (taken.has(k)) {
      skipped.push({ employeeId: e.employeeId, date: e.date, code: "EXISTS" }); // มติ Q6: ร่างเฉพาะช่องว่าง — ไม่ทับของเดิม
      continue;
    }
    const c = await checkEntryDraft(ctx, v, e);
    if (!c.ok) {
      skipped.push({ employeeId: e.employeeId, date: e.date, code: "INVALID" }); // ไม่รู้จัก ≡ นอกขอบเขต (ไม่บอกเหตุผลที่ต่างกัน)
      continue;
    }
    keep.push({ ...e, name: c.name, shiftName: c.shiftName });
  }
  const leaves = await rosterLeaveOverlay(ctx, v, { from: d.from, to: d.to }, [...new Set(keep.map((e) => e.employeeId))]);
  const leaveOf = new Map(leaves.map((l) => [`${l.employeeId}|${l.day}`, l.status]));
  const warnings: { code: string; employeeId: string; date: string | null }[] = [];
  const draft = keep.filter((e) => {
    const st = leaveOf.get(`${e.employeeId}|${e.date}`);
    if (st === "APPROVED") {
      skipped.push({ employeeId: e.employeeId, date: e.date, code: "LEAVE" });
      return false;
    }
    if (st === "PENDING") warnings.push({ code: "LEAVE_PENDING", employeeId: e.employeeId, date: e.date });
    return true;
  });
  if (!draft.length) return { mode: "json", body: capHrToolResult({ result: "NOTHING_TO_DRAFT", message: T.nothing, skipped: skipped.slice(0, HR_AI_CAPS.draftEntries) }) };
  const rules = await checkRules(ctx, v, { from: d.from, to: d.to, unitId: d.unitId });
  const ids = new Set(draft.map((e) => e.employeeId));
  if (rules.ok) for (const w of rules.warnings) if (ids.has(w.employeeId)) warnings.push({ code: String(w.rule), employeeId: w.employeeId, date: w.day ?? w.weekStart ?? null });
  const entries = draft.map((e) => ({ employeeId: e.employeeId, date: e.date, shiftId: e.shiftId }));
  const payload: DraftPayload = { systemId: ctx.systemId, ...(d.unitId ? { unitId: d.unitId } : {}), from: d.from, to: d.to, entries, basis: await keyBasis(ctx, entries) };
  const summary = draftSummary(draft.map((e) => ({ name: e.name, date: e.date, shift: e.shiftName })));
  return { mode: "propose", kind: "hr_draft_roster", summary, payload, extra: { skipped, warnings: warnings.slice(0, HR_AI_CAPS.warnings), ...fence(["summary"]) } };
}

// ═════════════ T6 hr_flag_pattern (เสนอ) ═════════════
async function factsOf(ctx: Ctx, v: HrAiViewer, employeeId: string, month: string): Promise<{ facts: PatternFacts; name: string } | null> {
  const mo = await loadAttendanceMonth(ctx, v, { employeeId, month });
  if (!mo || mo.employee.id !== employeeId || mo.month !== month) return null;
  const rep = await loadReport(ctx, v, { report: "time", period: month });
  const team = rep.ok ? rep.rows.map((r) => n0(r.values.lateCount)) : [];
  return { facts: patternFacts(mo.summary, mo.days, team), name: mo.employee.name };
}
/** แถวของตัวเอง (บัญชีที่ผูกกับพนักงานคนนี้) — ตัวอ่านเดียวกับหน้าของฉัน */
async function isOwnRow(ctx: Ctx, v: HrAiViewer, employeeId: string): Promise<boolean> {
  const me = await resolveSelf({ tenantId: ctx.tenantId, userId: v.userId, role: v.role, unitAccess: v.unitAccess, permissions: v.permissions });
  return !!me && me.employeeId === employeeId;
}
export async function hrFlagPattern(tc: ToolCtxLike, args: unknown): Promise<HrToolOut> {
  const p = await prepare(tc, args);
  if (isOut(p)) return p;
  const { ctx, v, a } = p;
  if (!canSeeLifecycle(v)) return NO();
  if (!isMonthArg(a.month)) return BAD();
  if (!isHrId(a.employeeId)) return NO();
  const employeeId = a.employeeId;
  if (await isOwnRow(ctx, v, employeeId)) return NO(); // แถวของตัวเอง = ปฏิเสธ (กติกาเดียวกับ addReviewNote)
  const f = await factsOf(ctx, v, employeeId, a.month);
  if (!f) return NO();
  const facts = f.facts;
  if (!meetsPattern(facts)) return { mode: "json", body: { result: "NO_PATTERN", message: T.noPattern, facts } };
  const payload = { systemId: ctx.systemId, employeeId, month: a.month, basis: factsFingerprint(facts) };
  return { mode: "propose", kind: "hr_flag_pattern", summary: patternSummary(f.name, a.month, facts), payload, extra: { facts, ...fence(["summary"]) } };
}

// ═════════════ กดยืนยัน (R7) ═════════════
type Confirm = { tenantId: string; v: HrAiViewer; ctx: Ctx; p: Obj };
/** ผู้กด (จากฐาน) + ระบบ HR ใน payload ต้องเป็นของร้านนี้ — null = ไม่ผ่าน */
async function confirmerOf(m: MembershipCtx, tenantId: string, payload: unknown, userId: string | null): Promise<Confirm | null> {
  if (!userId) return null;
  const v = await hrAiViewer(tenantId, memberActor(tenantId, userId, m.role));
  if (!v) return null;
  const p = obj(payload);
  if (!isHrId(p.systemId)) return null;
  const sys = await hrSystemOf(tenantId, undefined, p.systemId);
  if (!sys) return null;
  return { tenantId, v, ctx: { tenantId, systemId: sys }, p };
}
const draftEntriesOf = (p: Obj): DraftEntryArg[] =>
  (Array.isArray(p.entries) ? p.entries : [])
    .map(obj)
    .filter((e) => isHrId(e.employeeId) && isHrId(e.shiftId) && isDayArg(e.date))
    .slice(0, HR_AI_CAPS.draftEntries)
    .map((e) => ({ employeeId: e.employeeId as string, date: e.date as string, shiftId: e.shiftId as string }));

/** คนกดมีสิทธิ์ลงมือข้อเสนอนี้ไหม (ก่อนจอง) — โค้ดเหตุผลล้วน · null = ผ่าน */
async function confirmBlock(m: MembershipCtx, tenantId: string, kind: string, payload: unknown, userId: string | null): Promise<string | null> {
  const c = await confirmerOf(m, tenantId, payload, userId);
  if (!c) return "VIEWER";
  if (kind === "hr_draft_roster") {
    if (!canManageHrSettings(c.v)) return "ROLE";
    const es = draftEntriesOf(c.p);
    if (!es.length) return "PAYLOAD";
    for (const e of es) if (!(await checkEntryDraft(c.ctx, c.v, e)).ok) return "SCOPE";
    return null;
  }
  if (kind === "hr_flag_pattern") {
    if (!canSeeLifecycle(c.v)) return "ROLE";
    if (!isHrId(c.p.employeeId) || !isMonthArg(c.p.month)) return "PAYLOAD";
    const mo = await loadAttendanceMonth(c.ctx, c.v, { employeeId: c.p.employeeId, month: c.p.month });
    if (!mo) return "SCOPE";
    if (await isOwnRow(c.ctx, c.v, c.p.employeeId)) return "SELF";
    return null;
  }
  return "KIND";
}

/**
 * มติ Q3 (ด่านก่อนจองใน executeProposal): คนกดที่มองไม่เห็นสาขา/พนักงานของข้อเสนอ หรือไม่ใช่ผู้มีสิทธิ์ของงานนี้ ⇒ ปฏิเสธด้วยข้อความคงที่
 *   ข้อเสนอคง PENDING (คนที่มีสิทธิ์กดทีหลังได้ — คนไม่มีสิทธิ์ทำให้ข้อเสนอตายไม่ได้) · audit `hr.ai.proposal.refused` {kind, code} · null = ผ่าน
 */
export async function hrAiPreClaim(m: MembershipCtx, tenantId: string, proposalId: string, kind: string, payload: unknown, userId: string | null): Promise<string | null> {
  let code: string | null;
  try {
    code = await confirmBlock(m, tenantId, kind, payload, userId);
  } catch {
    code = "ERROR";
  }
  if (!code) return null;
  await writeAudit({ tenantId, actorType: "USER", actorId: userId ?? null, action: "hr.ai.proposal.refused", targetType: "AiProposal", targetId: proposalId, after: { kind, code } });
  return T.no;
}

class HrAiStale extends Error {}

/** ลงมือข้อเสนอ (หลังจอง PENDING→EXECUTED ใน executeProposal) — โยน = FAILED + ข้อความไทย (ไม่มีแถวใดถูกเขียน) */
export async function dispatchHrAiKind(m: MembershipCtx, tenantId: string, proposalId: string, kind: string, payload: unknown, userId: string | null): Promise<string> {
  const c = await confirmerOf(m, tenantId, payload, userId);
  if (!c) throw new Error(T.no);
  if (kind === "hr_draft_roster") return confirmDraft(c, proposalId);
  if (kind === "hr_flag_pattern") return confirmPattern(c, proposalId);
  throw new Error(T.no);
}

async function confirmDraft(c: Confirm, proposalId: string): Promise<string> {
  if (!canManageHrSettings(c.v)) throw new Error(T.no);
  const entries = draftEntriesOf(c.p);
  const basis = typeof c.p.basis === "string" ? c.p.basis : "";
  if (!entries.length || !basis) throw new Error(T.no);
  const keys = entries.map((e) => ({ employeeId: e.employeeId, date: e.date }));
  let ids: string[];
  try {
    ids = await tenantDb(c.ctx).$transaction(async (t) => {
      const tx = t as unknown as Parameters<typeof lockRosterKeysInTx>[0];
      await lockRosterKeysInTx(tx, c.ctx.systemId, keys);
      // ลายนิ้วมือของช่องที่ร่าง (แถวตารางกะ + ลาอนุมัติ) ต้องเท่าตอนเสนอ — ไม่เท่า = ข้อมูลเปลี่ยน ⇒ ไม่เขียนอะไรเลย
      if (rosterFingerprint(keys, await rosterKeyStateInTx(tx, keys)) !== basis) throw new HrAiStale(T.stale);
      const out: string[] = [];
      for (const e of entries) {
        const r = await addEntry(c.ctx, c.v, e, { source: "AI", tx });
        if (!r.ok) throw new Error(r.reason);
        out.push(r.id);
      }
      return out;
    }, TX_OPTS);
  } catch (e) {
    if (e instanceof HrAiStale) throw new Error(T.stale);
    throw e instanceof Error && e.message ? e : new Error(T.no);
  }
  await writeAudit({ tenantId: c.tenantId, actorType: "USER", actorId: c.v.userId, action: "hr.ai.proposal.confirm", targetType: "AiProposal", targetId: proposalId, after: { kind: "hr_draft_roster", via: "AI", systemId: c.ctx.systemId, count: ids.length, entryIds: ids } });
  return `เพิ่มร่างตารางกะ ${ids.length} ช่องแล้ว (ยังไม่ประกาศ) — ตรวจแล้วกดประกาศเองที่หน้าตารางกะ`;
}

async function confirmPattern(c: Confirm, proposalId: string): Promise<string> {
  if (!canSeeLifecycle(c.v) || !isHrId(c.p.employeeId) || !isMonthArg(c.p.month)) throw new Error(T.no);
  const f = await factsOf(c.ctx, c.v, c.p.employeeId, c.p.month);
  if (!f) throw new Error(T.no);
  if (factsFingerprint(f.facts) !== c.p.basis) throw new Error(T.stale);
  const t = patternNote(c.p.month, f.facts);
  const r = await addReviewNote(c.ctx, c.v, { employeeId: c.p.employeeId, kind: "NOTE", title: t.title, body: t.body, visibleToEmployee: false });
  if (!r.ok) throw new Error(r.reason);
  await writeAudit({ tenantId: c.tenantId, actorType: "USER", actorId: c.v.userId, action: "hr.ai.proposal.confirm", targetType: "AiProposal", targetId: proposalId, after: { kind: "hr_flag_pattern", via: "AI", systemId: c.ctx.systemId, count: 1, noteId: r.id } });
  return "บันทึกข้อสังเกต (ส่วนตัว ลูกจ้างไม่เห็น) แล้ว — ดูได้ที่หน้าพนักงานคนนั้น";
}

// ═════════════ Daily Brief (Q1 · R10) ═════════════
/**
 * บรรทัดสรุปพนักงานวันนี้ (เวลาไทย) ของผู้ดูคนนี้ — นับจากบอร์ดลงเวลาของเขา (+ ช่วงขายดีขาดคนเมื่อเขาเห็นความต้องการคน) ·
 * ไม่มีชื่อ/ประเภทลา · null = ไม่ใช่ผู้อ่านตารางกะ / ไม่ใช่สมาชิกจริง / ร้านไม่มี HR
 */
export async function hrTodayLine(
  tenantId: string,
  viewer: { role: unknown; unitAccess?: unknown; permissions?: unknown; userId?: unknown },
  now: Date,
): Promise<{ line: string; counts: BriefCounts } | null> {
  const v = await hrAiViewer(tenantId, memberActor(tenantId, typeof viewer?.userId === "string" ? viewer.userId : "", typeof viewer?.role === "string" ? viewer.role : ""));
  if (!v || !canReadRoster(v)) return null;
  const sys = await hrSystemOf(tenantId, undefined, undefined);
  if (!sys) return null;
  const ctx = { tenantId, systemId: sys };
  const at = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const day = bkkDayKey(at);
  const board = await loadAttendanceBoard(ctx, v, { day }, { now: at });
  if (!board) return null;
  let short = 0;
  try {
    const ld = await laborDay(ctx, v, { day }, { now: at });
    const dm = ld.ok ? ld.demand : null;
    const h = dm && dm.peak !== null ? dm.hours.find((x) => x.hour === dm.peak) : undefined;
    if (h && h.needed !== null) short = Math.max(0, h.needed - h.scheduled);
  } catch {
    short = 0;
  }
  const counts = briefCounts(board.rows, short);
  return { line: briefLine(counts), counts };
}
// ◂ HR H4.3
