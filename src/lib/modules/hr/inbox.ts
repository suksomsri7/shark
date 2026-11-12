// HR H2.11 ▸ กล่องคำขอรวมของผู้จัดการ (ภาพ 05) + ภาพรวมทีม (ภาพ 01) — ตัวรวม + ตัวส่งต่อ "ไม่มีกติกาใหม่"
//
// กติกา (brief H2.11 R3–R11 · มติผู้คุม Q1–Q11):
//   • อ่าน = ตัวอ่านสาธารณะของแต่ละชนิดเท่านั้น (ด่านผู้ดู + ขอบเขตสาขาอยู่ในตัวอ่านของชนิดนั้น — ที่นี่ไม่ขยาย) แล้วรวมชุด "รออนุมัติ" ในหน่วยความจำ (Q1) ·
//     เพดานต่อชนิด = INBOX_CAP (500) · ชนิดที่ถึงเพดาน = truncated (หน้าแสดง "แสดงบางส่วน — กรองเพิ่ม" + ตัวนับ "500+") · ตัวนับกับรายการมาจากการอ่านครั้งเดียวกัน ·
//     จำนวนคิวรีไม่ขึ้นกับจำนวนรายการ (R11)
//   • ซ่อนของผู้ดูเอง (พนักงานที่ผูกกับผู้ดู / ผู้ดูเป็นคู่สลับกะ — อยู่ที่ "ของฉัน" H2.10) · แสดงแบบอ่านอย่างเดียว: สายอนุมัติ (CHAIN → /app/approvals) ·
//     ผู้ดูเป็นผู้ยื่นที่ชนิดนั้นห้ามตัดสิน (FILED_BY_YOU) · ผู้อ่านที่ไม่มีสิทธิ์ตัดสิน (NO_RIGHT) — ป้ายเป็นคำใบ้ ผู้ตัดสินจริง = ฟังก์ชันของชนิด
//   • ตัดสิน = ฟังก์ชันตัดสินของแต่ละชนิดทีละรายการ ธุรกรรมของมันเอง (ไม่มีธุรกรรมข้ามชนิด) · ผลต่อรายการ = ข้อความของชนิดนั้นทุกไบต์ ·
//     รายการเพิ่ม/หักเงินในชุด (>1) = oneByOne · เหตุผลไม่อนุมัติ (บังคับ) ลง audit hr.inbox.decide (ไม่มีฟังก์ชันของชนิดใดรับเหตุผล — Q6)
//   • กันกดซ้ำ (R8 · ไม่มี migration): ล็อก advisory ของชุด → แถว audit hr.inbox.batch (ชุดเดิม = เล่นผลเดิม) · ปล่อยล็อกก่อนตัดสินใด ๆ (C.8)
//   • ไฟล์นี้ไม่เขียนตารางของ HR/สายอนุมัติ — เขียนได้เฉพาะ auditLog ◂
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { canViewPayroll, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { thaiDateKey } from "@/lib/ui/date";
import {
  INBOX_BATCH_MAX,
  INBOX_CAP,
  INBOX_KEY_RE,
  INBOX_PAGE_MAX,
  INBOX_TEXT,
  INBOX_TYPES,
  type InboxBlocker,
  type InboxCounts,
  type InboxDecideInput,
  type InboxDecideOutcome,
  type InboxDetail,
  type InboxImpact,
  type InboxItem,
  type InboxList,
  type InboxResult,
  type InboxType,
} from "./inbox-shared";
import { decideLeaveAs, inboxSubjects, leaveDetailsMany, teamLeaveBalances } from "./leave";
import { leaveListScopeOf, pendingLeaves } from "./service";
import { decideOtRequest, otRequestList } from "./ot";
import { decideSwap, listSwapsForManager } from "./swap";
import { decideCorrection, listCorrections } from "./correction";
import { decideAdjustmentAs, listAdjustments, listRuns, stockChargeTargetPeriod } from "./payroll";
import { stockConsentByAdjustment } from "./stock-charge";
import { leaveDutyHintsMany } from "./availability";
import { attendanceNeedsRecompute, loadAttendanceBoard, otDaySpans } from "./judge";
import { lifecycleDue } from "./lifecycle";
import { rosterLeaveOverlay } from "./roster-board";
import { hrScopeOf, unitsForScope } from "./scope";
import type { HrViewer } from "./privacy";

type Ctx = { tenantId: string; systemId: string };
type Opts = { now?: Date };
type Any = Record<string, unknown>;
const DAY_MS = 86_400_000;
const nowOf = (o?: Opts) => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? new Date(o.now.getTime()) : new Date());
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const addDay = (day: string, n: number) => dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));
const memberOf = (v: HrViewer): MembershipCtx =>
  ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown> }) as MembershipCtx;
const permOf = (m: MembershipCtx, k: string) => (m.permissions as Record<string, unknown>)[k] === true;

/** ชนิดที่ผู้ดูเห็นได้ (ตามด่านของตัวอ่านแต่ละชนิด — ใช้ตัดสิน "ไม่มีชนิดใดเลย" ก่อนเรียกอะไร) */
function visibleTypes(v: HrViewer | null | undefined): Set<InboxType> {
  const out = new Set<InboxType>();
  if (!v || !str(v.userId)) return out;
  const m = memberOf(v);
  const boss = m.role === "OWNER" || m.role === "MANAGER";
  if ("all" in leaveListScopeOf(m, v.userId)) out.add("LEAVE");
  if (boss || permOf(m, "hr.payadjust.approve") || permOf(m, "hr.*") || canViewPayroll(m)) out.add("OT");
  if (boss || permOf(m, "hr.employee.create") || permOf(m, "hr.*")) (out.add("SWAP"), out.add("CORRECTION"));
  if (canViewPayroll(m)) out.add("ADJUSTMENT");
  return out;
}

// ═══════════════════════════ อ่าน (R3 · R4 · R5) ═══════════════════════════
type Raw = InboxItem & { _at: number };
type ReadAll = { items: Raw[]; truncated: InboxType[] } | null;

const sourceOf = (a: { sourceType: string | null; crmCommissionId: string | null; requestedById: string | null }): "MANUAL" | "STOCK" | "COMMISSION" | "SYSTEM" =>
  a.sourceType === "INVENTORY_ISSUE"
    ? "STOCK"
    : a.sourceType === "CRM_COMMISSION" || !!a.crmCommissionId
      ? "COMMISSION"
      : (a.sourceType && a.sourceType !== "MANUAL") || !a.requestedById
        ? "SYSTEM"
        : "MANUAL";

/** อ่านชุดรออนุมัติทุกชนิดที่ผู้ดูเห็น (ยังไม่กรอง/ไม่แบ่งหน้า) — null = ไม่เห็นชนิดใดเลย */
async function readAll(ctx: Ctx, v: HrViewer, now: Date): Promise<ReadAll> {
  const types = visibleTypes(v);
  if (!types.size) return null;
  const m = memberOf(v);
  const uid = str(v.userId);
  const scope = hrScopeOf(m);
  const canAt = (action: string, unit: string | null) => evaluate(m, { module: "hr", action, ...(scope.unitIds !== "*" && unit ? { unitId: unit } : {}) });
  const owner = m.role === "OWNER";
  const keyHolder = owner || permOf(m, "hr.employee.create") || permOf(m, "hr.*");

  // ── 1. ตัวอ่านของแต่ละชนิด (ขนานกัน · แต่ละตัว 1 ครั้ง) ──
  const [leaves, ots, swaps, corrs, adjs] = await Promise.all([
    types.has("LEAVE") ? pendingLeaves(ctx, INBOX_CAP, leaveListScopeOf(m, uid)) : Promise.resolve(null),
    types.has("OT") ? otRequestList(ctx, v, { status: "PENDING", from: "2000-01-01", to: "2100-12-31" }) : Promise.resolve(null),
    types.has("SWAP") ? listSwapsForManager(ctx, v, { status: "PENDING" }) : Promise.resolve(null),
    types.has("CORRECTION") ? listCorrections(ctx, v, { status: "PENDING" }, { now, max: INBOX_CAP }) : Promise.resolve(null),
    types.has("ADJUSTMENT") ? listAdjustments(ctx, undefined, INBOX_CAP, { ...scope, pendingUnbound: true as const }) : Promise.resolve(null),
  ]);
  const L = leaves ?? [];
  const O = ots && ots.ok ? ots.items : [];
  const S = swaps && swaps.ok ? swaps.items : [];
  const C = corrs && corrs.ok ? corrs.items : [];
  const A = adjs ?? [];
  const seen = new Set<InboxType>([...(leaves ? ["LEAVE" as const] : []), ...(ots?.ok ? ["OT" as const] : []), ...(swaps?.ok ? ["SWAP" as const] : []), ...(corrs?.ok ? ["CORRECTION" as const] : []), ...(adjs ? ["ADJUSTMENT" as const] : [])]);
  if (!seen.size) return null;
  const truncated = INBOX_TYPES.filter((t) => ({ LEAVE: L.length, OT: O.length, SWAP: S.length, CORRECTION: C.length, ADJUSTMENT: A.length })[t] >= INBOX_CAP);

  // ── 2. ข้อเท็จจริงของผู้ดู (สาขา ณ วัน · ของตัวเอง · ผู้ยื่น · สายอนุมัติ) — 1 ชุด ──
  const subj = await inboxSubjects(ctx, v, {
    employeeIds: [...L.map((l) => l.employeeId), ...O.map((o) => o.employeeId), ...S.flatMap((s) => [s.requester.employeeId, s.target.employeeId]), ...C.map((c) => c.employeeId), ...A.map((a) => a.employeeId)],
    otIds: O.map((o) => o.id),
    correctionIds: C.map((c) => c.id),
    chainIds: { leave: L.map((l) => l.id), swap: S.map((s) => s.id), correction: C.map((c) => c.id) },
  });
  if (!subj) return null;
  const who = (id: string) => subj.employees.get(id);
  const own = (id: string) => !!who(id)?.own;
  const unitAt = (id: string, day: string | null) => who(id)?.unitAt(day) ?? null;
  const block = (chain: boolean, filed: boolean, right: boolean): InboxBlocker => (chain ? "CHAIN" : filed ? "FILED_BY_YOU" : right ? null : "NO_RIGHT");
  const out: Raw[] = [];
  const push = (r: Omit<Raw, "ageDays" | "batchable" | "canDecide" | "createdAt"> & { at: Date }) => {
    const { at, ...rest } = r;
    out.push({
      id: rest.id,
      type: rest.type,
      employeeId: rest.employeeId,
      employeeName: rest.employeeName,
      unitId: rest.unitId,
      createdAt: at.toISOString(),
      ageDays: Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS)),
      canDecide: rest.blocker === null,
      blocker: rest.blocker,
      batchable: rest.blocker === null && rest.type !== "ADJUSTMENT",
      detail: rest.detail,
      impact: rest.impact,
      _at: at.getTime(),
    });
  };

  // ── LEAVE ──
  const leaveMine = L.filter((l) => !(l.employee?.linkedUserId && l.employee.linkedUserId === uid) && !own(l.employeeId));
  if (leaveMine.length) {
    const ids = leaveMine.map((l) => l.id);
    const froms = leaveMine.map((l) => dayOf(l.fromDate)).sort();
    const tos = leaveMine.map((l) => dayOf(l.toDate)).sort();
    const years = [...new Set(froms.map((d) => Number(d.slice(0, 4))))];
    const [details, hints, team] = await Promise.all([
      leaveDetailsMany(ctx, v, ids),
      leaveDutyHintsMany(ctx, v, { leaveIds: ids }),
      Promise.all(years.map((y) => teamLeaveBalances(ctx, v, { year: y }))),
    ]);
    const teamOf = new Map(years.map((y, i) => [y, team[i]] as const));
    const people = new Map((team.find(Boolean)?.rows ?? []).map((r) => [r.employeeId, r.name] as const));
    const overlay = people.size ? await rosterLeaveOverlay(ctx, v, { from: froms[0]!, to: tos[tos.length - 1]! }, [...people.keys()]) : [];
    for (const l of leaveMine) {
      const d = details.get(l.id);
      if (!d || !d.ok) continue;
      const it = d.item;
      const from = it.fromDate;
      const to = it.toDate;
      const unit = unitAt(l.employeeId, from);
      const chain = subj.chain.has(l.id);
      const bal = teamOf.get(Number(from.slice(0, 4)))?.rows.find((r) => r.employeeId === l.employeeId)?.items.find((x) => x.policyId === it.policyId) ?? null;
      // คนอื่นในขอบเขตที่ลา (รอ/อนุมัติ) ทับช่วงนี้ — ช่วงวันต่อเนื่องต่อคน
      const off = new Map<string, string[]>();
      for (const c of overlay) if (c.employeeId !== l.employeeId && c.day >= from && c.day <= to) off.set(c.employeeId, [...(off.get(c.employeeId) ?? []), c.day]);
      const othersOff: { fromDate: string; name: string; toDate: string }[] = [];
      for (const [eid, days] of off) {
        const ds = [...new Set(days)].sort();
        let s = ds[0]!;
        for (let i = 1; i <= ds.length; i++) {
          if (i < ds.length && ds[i] === addDay(ds[i - 1]!, 1)) continue;
          othersOff.push({ fromDate: s, name: people.get(eid) ?? "", toDate: ds[i - 1]! });
          s = ds[i]!;
        }
      }
      othersOff.sort((a, b) => (a.fromDate < b.fromDate ? -1 : a.fromDate > b.fromDate ? 1 : a.name < b.name ? -1 : 1));
      const detail: Any = { category: it.category, days: it.days, fromDate: from, halfDay: it.halfDay, hours: it.hours, needsAttachment: it.needsAttachment, policyName: it.policyName, toDate: to };
      if ("reason" in it) detail.reason = it.reason ?? null;
      push({
        id: l.id,
        type: "LEAVE",
        employeeId: l.employeeId,
        employeeName: it.employeeName,
        unitId: unit,
        blocker: block(chain, false, canAt("hr.leave.decide", unit)),
        detail: detail as InboxDetail,
        impact: { balance: bal ? { available: bal.available, pending: bal.pending, used: bal.used } : null, duty: hints.get(l.id) ?? null, othersOff },
        at: l.createdAt,
      });
    }
  }

  // ── OT ──
  const otMine = O.filter((o) => !own(o.employeeId));
  if (otMine.length) {
    const days = otMine.map((o) => o.date).sort();
    const spans = await otDaySpans(ctx, [...new Set(otMine.map((o) => o.employeeId))], addDay(days[0]!, -1), addDay(days[days.length - 1]!, 1));
    for (const o of otMine) {
      const meta = subj.ot.get(o.id);
      const unit = unitAt(o.employeeId, o.date);
      const s0 = Date.parse(o.startAt);
      const e0 = Date.parse(o.endAt);
      let measured: number | null = null;
      for (const sp of spans) {
        if (sp.employeeId !== o.employeeId || !sp.inAt || !sp.outAt) continue;
        const ov = Math.min(e0, sp.outAt.getTime()) - Math.max(s0, sp.inAt.getTime());
        if (ov > 0) measured = (measured ?? 0) + Math.floor(ov / 60_000);
      }
      push({
        id: o.id,
        type: "OT",
        employeeId: o.employeeId,
        employeeName: o.employeeName,
        unitId: unit,
        blocker: block(false, !owner && !!meta?.filedByViewer, canAt("hr.payadjust.approve", unit)),
        detail: { date: o.date, dayClass: o.dayClass, endAt: o.endAt, multiplierBp: o.multiplierBp, reason: o.reason, requestedMin: o.requestedMin, startAt: o.startAt, timing: o.timing, warnWeek: o.warnWeek },
        impact: { measuredMin: measured, weekWarn: o.warnWeek },
        at: meta?.createdAt ?? new Date(`${o.date}T00:00:00Z`),
      });
    }
  }

  // ── SWAP ──
  for (const s of S) {
    if (own(s.requester.employeeId) || (s.target.employeeId && own(s.target.employeeId)) || s.canCancel || s.canRespond) continue;
    const unit = unitAt(s.requester.employeeId, s.from?.date ?? null);
    const detail: Any = { from: s.from, requester: s.requester, shape: s.shape, target: s.target, to: s.to };
    if ("reason" in s) detail.reason = s.reason ?? null;
    push({
      id: s.id,
      type: "SWAP",
      employeeId: s.requester.employeeId,
      employeeName: s.requester.name,
      unitId: unit,
      blocker: block(subj.chain.has(s.id), false, keyHolder && !(s.shape === "SWAP" && s.to === null)),
      detail: detail as InboxDetail,
      impact: null,
      at: new Date(s.createdAt),
    });
  }

  // ── CORRECTION ──
  const corrMine = C.filter((c) => !own(c.employeeId));
  if (corrMine.length) {
    const closed = new Set((await listRuns(ctx, 50)).filter((r) => r.status === "APPROVED" || r.status === "PAID").map((r) => r.periodKey));
    for (const c of corrMine) {
      const unit = unitAt(c.employeeId, c.day);
      const delta = c.action === "CHANGE" && c.originalAt && c.proposedAt ? Math.round((Date.parse(c.proposedAt) - Date.parse(c.originalAt)) / 60_000) : null;
      push({
        id: c.id,
        type: "CORRECTION",
        employeeId: c.employeeId,
        employeeName: c.employeeName,
        unitId: unit,
        blocker: block(subj.chain.has(c.id), subj.correctionFiledByViewer.has(c.id), keyHolder),
        detail: { action: c.action, day: c.day, evidence: c.evidence, filedOnBehalf: c.filedOnBehalf, kind: c.kind, originalAt: c.originalAt, periodCount: c.periodCount, proposedAt: c.proposedAt, reason: c.reason, repeat: c.repeat },
        impact: { deltaMin: delta, monthClosed: !!c.day && closed.has(c.day.slice(0, 7)) },
        at: new Date(c.createdAt),
      });
    }
  }

  // ── ADJUSTMENT (เฉพาะผู้ดูเงินเดือน — ฿ ไม่ถึงผู้จัดการทั่วไป Q8) ──
  const adjMine = A.filter((a) => !own(a.employeeId));
  if (adjMine.length) {
    const stock = adjMine.filter((a) => a.sourceType === "INVENTORY_ISSUE").map((a) => a.id);
    const periods = [...new Set(adjMine.map((a) => a.periodKey))];
    const [consent, targets] = await Promise.all([
      stock.length ? stockConsentByAdjustment(ctx, v, stock) : Promise.resolve(new Map<string, { ref: string; at: string; employeeEnded: boolean }>()),
      Promise.all(periods.map((p) => stockChargeTargetPeriod(ctx, p))),
    ]);
    const targetOf = new Map(periods.map((p, i) => [p, targets[i] ?? null] as const));
    for (const a of adjMine) {
      const src = sourceOf(a);
      const cs = src === "STOCK" ? consent.get(a.id) : undefined;
      const unit = unitAt(a.employeeId, null);
      push({
        id: a.id,
        type: "ADJUSTMENT",
        employeeId: a.employeeId,
        employeeName: who(a.employeeId)?.name ?? "",
        unitId: unit,
        blocker: block(false, !owner && !!uid && a.requestedById === uid, canAt("hr.payadjust.approve", unit) && canViewPayroll(m)),
        detail: { amountSatang: a.amountSatang, consent: cs ? { at: cs.at, ref: cs.ref } : null, kind: String(a.kind), note: a.note ?? null, periodKey: a.periodKey, source: src },
        impact: { targetPeriod: targetOf.get(a.periodKey) ?? null },
        at: a.createdAt,
      });
    }
  }
  out.sort((a, b) => a._at - b._at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { items: out, truncated };
}

const strip = (r: Raw): InboxItem => {
  const { _at, ...it } = r;
  void _at;
  return it;
};
const countsOf = (xs: Raw[]): InboxCounts => {
  const n = (t: InboxType) => xs.filter((x) => x.type === t).length;
  return { LEAVE: n("LEAVE"), OT: n("OT"), SWAP: n("SWAP"), CORRECTION: n("CORRECTION"), ADJUSTMENT: n("ADJUSTMENT"), total: xs.length, decidable: xs.filter((x) => x.canDecide).length };
};
const cursorOf = (r: Raw) => Buffer.from(`${r._at}.${r.id}`).toString("base64url");
function parseCursor(c: unknown): { at: number; id: string } | null {
  if (typeof c !== "string" || c.length > 200) return null;
  const s = Buffer.from(c, "base64url").toString("utf8");
  const i = s.indexOf(".");
  const at = Number(s.slice(0, i));
  return i > 0 && Number.isFinite(at) ? { at, id: s.slice(i + 1) } : null;
}

export type InboxFilter = { type?: unknown; unitId?: unknown; minAgeDays?: unknown; take?: unknown; cursor?: unknown };
/** กล่องคำขอรวม (R4) — null = ผู้ดูไม่เห็นชนิดใดเลย · ตัวนับ = ตัวกรองสาขา/อายุเดียวกัน ไม่สนชนิด · เรียงเก่าสุดก่อน */
export async function listInbox(ctx: Ctx, v: HrViewer, filter: InboxFilter = {}, opts: Opts = {}): Promise<InboxList | null> {
  const now = nowOf(opts);
  const all = await readAll(ctx, v, now);
  if (!all) return null;
  const scope = hrScopeOf(memberOf(v));
  const unitId = str(filter?.unitId);
  const outOfScope = !!unitId && scope.unitIds !== "*" && !scope.unitIds.includes(unitId);
  const age = Number.isInteger(filter?.minAgeDays) && (filter.minAgeDays as number) > 0 ? (filter.minAgeDays as number) : 0;
  const base = outOfScope ? [] : all.items.filter((x) => (!unitId || x.unitId === unitId) && x.ageDays >= age);
  const type = INBOX_TYPES.find((t) => t === filter?.type) ?? null;
  const typed = type ? base.filter((x) => x.type === type) : base;
  const take = Number.isInteger(filter?.take) ? Math.min(Math.max(filter.take as number, 1), INBOX_PAGE_MAX) : INBOX_PAGE_MAX;
  const cur = parseCursor(filter?.cursor);
  const rest = cur ? typed.filter((x) => x._at > cur.at || (x._at === cur.at && x.id > cur.id)) : typed;
  const page = rest.slice(0, take);
  return { items: page.map(strip), counts: countsOf(base), nextCursor: rest.length > take ? cursorOf(page[page.length - 1]!) : null, truncated: all.truncated };
}

/** ตัวนับของกล่อง (ไม่กรอง) — null = ไม่เห็นชนิดใด · ป้ายบนแท็บ = decidable */
export async function inboxCounts(ctx: Ctx, v: HrViewer, opts: Opts = {}): Promise<InboxCounts | null> {
  return (await listInbox(ctx, v, {}, opts))?.counts ?? null;
}

/** สาขาสำหรับตัวกรองของหน้า (เฉพาะสาขาในขอบเขตของผู้ดู) — ผู้ไม่เห็นกล่อง = [] */
export async function inboxUnits(ctx: Ctx, v: HrViewer): Promise<{ id: string; name: string }[]> {
  if (!visibleTypes(v).size) return [];
  return unitsForScope(ctx.tenantId, hrScopeOf(memberOf(v)));
}

// ═══════════════════════════ ตัดสิน (R6 · R7 · R8) ═══════════════════════════
const UNEXPECTED = "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
async function decideOne(ctx: Ctx, v: HrViewer, it: { type: InboxType; id: string }, decision: "APPROVED" | "REJECTED", now: Date | undefined): Promise<{ ok: true; status: string } | { ok: false; reason: string }> {
  try {
    const nowOpt = now ? { now } : {};
    if (it.type === "LEAVE") return await decideLeaveAs(ctx, v, it.id, decision);
    if (it.type === "OT") return await decideOtRequest(ctx, v, it.id, decision, nowOpt);
    if (it.type === "SWAP") return await decideSwap(ctx, v, it.id, { decision });
    if (it.type === "CORRECTION") return await decideCorrection(ctx, v, it.id, { decision }, nowOpt);
    return await decideAdjustmentAs(ctx, v, it.id, decision);
  } catch (e) {
    console.error("[hr.inbox.decide]", it.type, e);
    return { ok: false, reason: UNEXPECTED };
  }
}

/** ตัดสินชุด (หรือ 1 รายการ) — แต่ละรายการผ่านฟังก์ชันของชนิดนั้นเอง ทีละรายการ · กันกดซ้ำด้วยรหัสชุด */
export async function decideInbox(ctx: Ctx, v: HrViewer, input: InboxDecideInput, opts: Opts = {}): Promise<InboxDecideOutcome> {
  if (!visibleTypes(v).size) return { ok: false, reason: INBOX_TEXT.noAccess };
  const uid = str(v.userId);
  const batchKey = typeof input?.batchKey === "string" ? input.batchKey : "";
  if (!INBOX_KEY_RE.test(batchKey)) return { ok: false, reason: INBOX_TEXT.key };
  const raw = Array.isArray(input?.items) ? input.items : [];
  if (!raw.length) return { ok: false, reason: INBOX_TEXT.empty };
  const items: { type: InboxType; id: string }[] = [];
  const dup = new Set<string>();
  let bad = false;
  for (const x of raw) {
    const type = INBOX_TYPES.find((t) => t === (x as Any)?.type) ?? null;
    const id = typeof (x as Any)?.id === "string" ? ((x as Any).id as string) : "";
    if (!type || !ID_RE.test(id)) {
      bad = true;
      continue;
    }
    if (dup.has(`${type}:${id}`)) continue;
    dup.add(`${type}:${id}`);
    items.push({ type, id });
  }
  if (items.length > INBOX_BATCH_MAX) return { ok: false, reason: INBOX_TEXT.tooMany };
  const decision = input?.decision === "APPROVED" || input?.decision === "REJECTED" ? input.decision : null;
  if (bad || !items.length || !decision) return { ok: false, reason: INBOX_TEXT.badItem };
  const reason = decision === "REJECTED" ? str(input?.reason) : "";
  if (decision === "REJECTED" && (Array.from(reason).length < 3 || Array.from(reason).length > 200)) return { ok: false, reason: INBOX_TEXT.rejectReason };

  // ── R8 claim: ล็อกชุด → แถว hr.inbox.batch (ธุรกรรมสั้น · ปล่อยล็อกก่อนตัดสิน) ──
  const target = `${ctx.systemId}:${batchKey}`;
  const itemsKey = items.map((i) => `${i.type}:${i.id}`).join(",");
  type Claim = { kind: "new" } | { kind: "replay"; results: InboxResult[] } | { kind: "diff" } | { kind: "busy" };
  const claim: Claim = await tenantDb({ tenantId: ctx.tenantId }).$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:inbox:${target}`}, 0))`;
      const prev = await tx.auditLog.findFirst({ where: { tenantId: ctx.tenantId, action: "hr.inbox.batch", targetType: "HrInboxBatch", targetId: target }, select: { actorId: true, after: true } });
      if (prev) {
        const a = (prev.after ?? {}) as Any;
        if (prev.actorId !== uid || a.decision !== decision || a.itemsKey !== itemsKey) return { kind: "diff" };
        const done = await tx.auditLog.findFirst({ where: { tenantId: ctx.tenantId, action: "hr.inbox.batch_done", targetType: "HrInboxBatch", targetId: target }, select: { after: true } });
        const results = ((done?.after ?? null) as Any | null)?.results;
        return Array.isArray(results) ? { kind: "replay", results: results as InboxResult[] } : { kind: "busy" };
      }
      await tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: "USER", actorId: uid, action: "hr.inbox.batch", targetType: "HrInboxBatch", targetId: target, after: { batchKey, decision, itemsKey, count: items.length } } });
      return { kind: "new" };
    },
    { maxWait: 20_000, timeout: 30_000 },
  );
  if (claim.kind === "diff") return { ok: false, reason: INBOX_TEXT.batchDiff };
  if (claim.kind === "busy") return { ok: false, reason: INBOX_TEXT.inProgress };
  if (claim.kind === "replay") return { ok: true, batchKey, replayed: true, results: claim.results };

  // ── ทีละรายการ ผ่านฟังก์ชันของชนิดนั้น (ธุรกรรมของมันเอง) ──
  const now = opts?.now instanceof Date ? opts.now : undefined;
  const results: InboxResult[] = [];
  for (const it of items) {
    const r = items.length > 1 && it.type === "ADJUSTMENT" ? ({ ok: false, reason: INBOX_TEXT.oneByOne } as const) : await decideOne(ctx, v, it, decision, now);
    results.push(r.ok ? { id: it.id, ok: true, status: r.status, type: it.type } : { id: it.id, ok: false, reason: r.reason, type: it.type });
    await writeAudit({ tenantId: ctx.tenantId, actorId: uid, action: "hr.inbox.decide", targetType: "HrInboxBatch", targetId: target, after: { type: it.type, id: it.id, decision, ok: r.ok, batchKey, ...(reason ? { reason } : {}) } });
  }
  await writeAudit({ tenantId: ctx.tenantId, actorId: uid, action: "hr.inbox.batch_done", targetType: "HrInboxBatch", targetId: target, after: { results } });
  return { ok: true, batchKey, replayed: false, results };
}

// ═══════════════════════════ ภาพรวมทีม (R9) · โควตาทีม (R10) ═══════════════════════════
export type TeamOverview = {
  board: Awaited<ReturnType<typeof loadAttendanceBoard>>;
  inbox: InboxCounts | null;
  lifecycleDue: number | null;
  needsRecompute: number | null;
};
/** ภาพรวมทีม = ตัวอ่านเดิม 4 ตัว (ไม่มีการตัดสินใหม่) · null = ทุกส่วนเป็น null */
export async function teamOverview(ctx: Ctx, v: HrViewer, input: { day?: unknown; unit?: unknown } = {}, opts: Opts = {}): Promise<TeamOverview | null> {
  const [board, needs, due, inbox] = await Promise.all([
    loadAttendanceBoard(ctx, v, { day: input?.day, unit: input?.unit }, opts),
    attendanceNeedsRecompute(ctx, v, opts),
    lifecycleDue(ctx, v, opts),
    inboxCounts(ctx, v, opts),
  ]);
  const r: TeamOverview = { board: board ?? null, inbox: inbox ?? null, lifecycleDue: due ? due.items.length : null, needsRecompute: needs ? needs.count : null };
  return r.board === null && r.inbox === null && r.lifecycleDue === null && r.needsRecompute === null ? null : r;
}

export type TeamLeaveQuota = {
  year: number;
  policies: { category: string; id: string; name: string; unlimited: boolean }[];
  rows: { employeeId: string; name: string; cells: { available: string | null; pending: string; policyId: string; used: string }[] }[];
};
/** ตารางโควตาวันลาของทีม (ภาพ 05 ขวา) — ด่าน = leaveBalances · ค่าต่อช่อง = leaveBalances ของคนนั้นทุกไบต์ · null = ไม่ผ่านด่าน */
export async function teamLeaveQuota(ctx: Ctx, v: HrViewer, input: { year?: unknown; unitId?: unknown } = {}, opts: Opts = {}): Promise<TeamLeaveQuota | null> {
  const year = Number.isInteger(input?.year) ? (input.year as number) : Number(thaiDateKey(nowOf(opts)).slice(0, 4));
  const t = await teamLeaveBalances(ctx, v, { year, unitId: str(input?.unitId) || null });
  if (!t) return null;
  const policies = new Map<string, TeamLeaveQuota["policies"][number]>();
  for (const r of t.rows) for (const x of r.items) if (!policies.has(x.policyId)) policies.set(x.policyId, { category: x.category, id: x.policyId, name: x.name, unlimited: x.unlimited });
  return {
    year: t.year,
    policies: [...policies.values()],
    rows: t.rows.map((r) => ({ employeeId: r.employeeId, name: r.name, cells: r.items.map((x) => ({ available: x.available, pending: x.pending, policyId: x.policyId, used: x.used })) })),
  };
}
// ◂ HR H2.11
