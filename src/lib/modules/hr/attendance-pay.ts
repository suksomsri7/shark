// HR H3.2 ▸ กฎหักสาย/ออกก่อน/ขาดงาน → รายการหัก PENDING (pro-rata · เปิดเองเท่านั้น ค่าตั้งต้นปิด · HQ11) — brief hr-brief-H3.2 R2 R4–R12
//   ที่มาเดียว = ชั่วโมงทำงาน H3.1 (HrWorkDay) ของงวดที่สถานะ CURRENT (ไม่คิดจากวันที่ OUTDATED/ต้องตรวจ/ยังไม่ดึง) · พนักงานรายเดือนเท่านั้น (Q7)
//   เงินคิดที่ attendance-pay-rules.ts (pure) · แถวเงิน (HrPayAdjustment) เขียนที่ payroll.ts#writeAttendanceDeductionInTx ที่เดียว ·
//   ไฟล์นี้เขียนแค่หัวรายการ HrAttendanceDeduction (1 แถวต่อแถวเงิน: ภาพนิ่งบรรทัดรายวัน · ฐาน · N · นโยบาย · ลายนิ้วมือ)
//   ไม่สร้างรายการ OT/เงินวันหยุดใด ๆ (H2.9 จ่าย OT · H3.4 จ่ายวันหยุด) — ไม่อ่านนาที OT/วันหยุดเลย · ไม่มี event (Q10)
//
// ลำดับล็อก (ไม่มีวงรอ — ทุกผู้ถือล็อกงวดถือมันเป็นตัวแรก และงวดเรียงจากน้อยไปมาก):
//   คำนวณ (sync)      : hr:payroll:run:<ระบบ>:<P> → งวดปลายทาง (> รอบล่าสุด ≥ P · มากขึ้นเท่านั้น) → hr:attpay:<ระบบ>:<พนักงาน>:<P> (เรียง id)
//   ปิดกฎ (OFF)        : hr:clockpolicy:<ระบบ> (tx บันทึกค่าตั้ง · ปล่อยแล้ว) → tx ใหม่: P → งวดของแถว (เรียง)
//   อนุมัติรายการ       : P → งวดของแถว → งวดที่ย้ายไป (payroll.ts#decideAdjustment)
//   ดึงชั่วโมงทำงาน      : P อย่างเดียว (work-entries.ts) · สร้าง/คำนวณใหม่/อนุมัติ/จ่ายรอบ: งวดของรอบก่อน (อ่านสถานะงวดงานโดยไม่ล็อก)
//   แก้เวลา (H2.6)      : งวด (เรียง) → hr-corr → hr:clock → hr:judge · จ่าย OT (H2.9): งวด → ปลายทาง → hr:ot → hr:judge · หักค่าของ (H4.6): hr:stock → งวด
//   ⇒ ไม่มีใครถือล็อกงวดแล้วรอ hr:clockpolicy / ล็อกงวดที่น้อยกว่า ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { employeeOfUser } from "./service";
import { hrScopeOf, type HrScope } from "./scope";
import { canBuildWorkEntries, canReadWorkEntries, normalMinutesOf, workEntryStatesInTx, type WorkEntryState, type WorkEntryViewer } from "./work-entries";
import { AttendanceAdjustmentConflict, writeAttendanceDeductionInTx } from "./payroll";
import {
  ATT_STEP_OPTIONS,
  ATT_FREE_MAX,
  ATT_RULES,
  ATT_TEXT,
  attText,
  attendanceDeductionOf,
  attendanceDeltaPlan,
  attendanceDigest,
  attendancePayPolicyOf,
  thaiPeriodLabel,
  type AttDayInput,
  type AttOut,
  type AttRule,
  type AttendancePayPolicy,
} from "./attendance-pay-rules";

type Ctx = { tenantId: string; systemId: string };
type Db = Prisma.TransactionClient;
type Fail = { ok: false; reason: string };
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PAGE = 50;
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const SETTINGS_KEY = "hrAttendancePay";
const lock = (tx: Db, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const payKey = (ctx: Ctx, p: string) => `hr:payroll:run:${ctx.systemId}:${p}`;
const nowOf = (o: { now?: Date } | undefined) => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? new Date(o.now.getTime()) : new Date());
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const nextMonth = (p: string) => {
  const y = Number(p.slice(0, 4));
  const m = Number(p.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const lastDayOf = (p: string) => `${p}-${String(new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const permsOf = (v: WorkEntryViewer) => obj(v?.permissions);
const hasKey = (v: WorkEntryViewer, k: string) => permsOf(v)[k] === true || permsOf(v)["hr.*"] === true;
const scopeOf = (v: WorkEntryViewer): HrScope => hrScopeOf({ role: v.role, unitAccess: v.unitAccess });
const covers = (s: HrScope, unitId: string | null) => s.unitIds === "*" || (!!unitId && s.unitIds.includes(unitId));
const isAtt = (r: string | null | undefined): r is AttRule => r === "LATE_RULE" || r === "ABSENT_RULE";
/** ผู้คำนวณ = OWNER · หรือ hr.payroll.read + hr.payadjust.request (ในขอบเขตสาขาของตัวเอง) */
export const canSyncAttendancePay = (v: WorkEntryViewer | null | undefined): boolean => !!v && (v.role === "OWNER" || (hasKey(v, "hr.payroll.read") && hasKey(v, "hr.payadjust.request")));
/** เห็นจำนวนเงิน = OWNER · hr.payroll.read (Q9) — ผู้จัดการเห็นนาที */
const seesMoney = (v: WorkEntryViewer | null | undefined): boolean => canBuildWorkEntries(v);
class Refusal extends Error {}

// ═════════════ นโยบาย (R2 · settings.hrAttendancePay ต่อร้าน) ═════════════
async function settingsIn(db: Db, ctx: Ctx): Promise<Record<string, unknown>> {
  return obj((await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } }))?.settings);
}
/** นโยบายที่ใช้อยู่ (ยังไม่ตั้ง = ค่าตั้งต้น — ปิด) */
export async function getAttendancePayPolicy(ctx: Ctx): Promise<AttendancePayPolicy> {
  return attendancePayPolicyOf((await settingsIn(tenantDb(ctx) as unknown as Db, ctx))[SETTINGS_KEY]);
}
const boolOf = (v: unknown): boolean | undefined => (v === true || v === "true" || v === "on" || v === "1" ? true : v === false || v === "false" || v === "off" || v === "0" || v === "" ? false : undefined);
const numOf = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : null);
/**
 * บันทึกกฎ (เจ้าของร้านเท่านั้น · ตรวจเข้ม: นาทีไม่หัก 0–60 จำนวนเต็ม · ปัดนาที 1/5/10/15) — ช่องที่ไม่ส่ง = คงเดิม · ล็อก hr:clockpolicy:<ระบบ> (ตัวเดียวกับค่าตั้ง HR อื่นที่ spread JSON) ·
 * ไม่มีตัวเลือกค่าปรับ/ตัวคูณ/ปัดขึ้น · ปิดกฎ (เปิด → ปิด) ⇒ ถอนรายการ PENDING ที่ยังไม่เข้ารอบทุกแถว (POLICY_OFF) · APPROVED คงไว้ (Q12)
 */
export async function saveAttendancePayPolicy(ctx: Ctx, viewer: WorkEntryViewer, raw: unknown, opts: { now?: Date } = {}): Promise<{ ok: true; id: string } | Fail> {
  if (!viewer || viewer.role !== "OWNER") return { ok: false, reason: ATT_TEXT.policyNo };
  const i = obj(raw);
  const has = (k: string) => Object.prototype.hasOwnProperty.call(i, k) && i[k] !== undefined;
  const patch: Partial<AttendancePayPolicy> = {};
  if (has("freeMin")) {
    const n = numOf(i.freeMin);
    if (n === null || !Number.isInteger(n) || n < 0 || n > ATT_FREE_MAX) return { ok: false, reason: ATT_TEXT.sFree };
    patch.freeMin = n;
  }
  if (has("stepMin")) {
    const n = numOf(i.stepMin);
    if (n === null || !(ATT_STEP_OPTIONS as readonly number[]).includes(n)) return { ok: false, reason: ATT_TEXT.sStep };
    patch.stepMin = n;
  }
  for (const k of ["enabled", "late", "earlyOut", "absent"] as const) {
    if (!has(k)) continue;
    const b = boolOf(i[k]);
    if (b === undefined) return { ok: false, reason: ATT_TEXT.failed };
    patch[k] = b;
  }
  const res = await tenantDb({ tenantId: ctx.tenantId }).$transaction(async (t) => {
    const tx = t as unknown as Db;
    await lock(tx, `hr:clockpolicy:${ctx.systemId}`);
    const sys = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true, settings: true } });
    if (!sys) return null;
    const base = obj(sys.settings);
    const cur = attendancePayPolicyOf(base[SETTINGS_KEY]);
    const next: AttendancePayPolicy = { ...cur, ...patch };
    const u = await tx.appSystem.updateMany({ where: { id: sys.id, tenantId: ctx.tenantId }, data: { settings: { ...base, [SETTINGS_KEY]: next } as Prisma.InputJsonValue } });
    return u.count === 1 ? { cur, next } : null;
  }, TX_OPTS);
  if (!res) return { ok: false, reason: ATT_TEXT.failed };
  await writeAudit({ tenantId: ctx.tenantId, actorType: viewer.userId ? "USER" : "SYSTEM", actorId: viewer.userId ?? null, action: "hr.attpay.policy", targetType: "AppSystem", targetId: ctx.systemId, after: { systemId: ctx.systemId, ...res.next } });
  if (!res.next.enabled) await withdrawPendingOnOff(ctx, nowOf(opts));
  return { ok: true, id: ctx.systemId };
}

/** ปิดกฎ ⇒ ถอน PENDING ที่ยังไม่เข้ารอบ (ทีละงวดงาน · ล็อก P → งวดของแถว เรียง) · ตรวจซ้ำใต้ล็อกว่ากฎยังปิด */
async function withdrawPendingOnOff(ctx: Ctx, now: Date): Promise<number> {
  const db = tenantDb(ctx) as unknown as Db;
  const heads = await db.hrAttendanceDeduction.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, endCode: null }, select: { adjustmentId: true, workPeriodKey: true }, take: 20_000 });
  if (!heads.length) return 0;
  const pend = await db.hrPayAdjustment.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: heads.map((h) => h.adjustmentId) }, status: "PENDING", runId: null }, select: { id: true }, take: 20_000 });
  const pendIds = new Set(pend.map((p) => p.id));
  const periods = [...new Set(heads.filter((h) => pendIds.has(h.adjustmentId)).map((h) => h.workPeriodKey))].sort();
  let n = 0;
  for (const P of periods) {
    n += await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Db;
      await lock(tx, payKey(ctx, P));
      if (attendancePayPolicyOf((await settingsIn(tx, ctx))[SETTINGS_KEY]).enabled) return 0;
      const hs = await tx.hrAttendanceDeduction.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, workPeriodKey: P, endCode: null }, select: { adjustmentId: true, employeeId: true, rule: true }, take: 20_000 });
      const rows = await tx.hrPayAdjustment.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: hs.map((h) => h.adjustmentId) }, status: "PENDING", runId: null }, select: { id: true, periodKey: true }, orderBy: { id: "asc" } });
      if (!rows.length) return 0;
      for (const p of [...new Set(rows.map((r) => r.periodKey))].filter((p) => p > P).sort()) await lock(tx, payKey(ctx, p));
      const byId = new Map(hs.map((h) => [h.adjustmentId, h]));
      const groups = new Map<string, { employeeId: string; rule: AttRule; ids: string[] }>();
      for (const r of rows) {
        const h = byId.get(r.id);
        if (!h || !isAtt(h.rule)) continue;
        const k = `${h.employeeId}|${h.rule}`;
        const g = groups.get(k) ?? { employeeId: h.employeeId, rule: h.rule, ids: [] };
        g.ids.push(r.id);
        groups.set(k, g);
      }
      let c = 0;
      for (const g of groups.values()) {
        const w = await writeAttendanceDeductionInTx(tx, ctx, { employeeId: g.employeeId, workPeriodKey: P, rule: g.rule, reject: g.ids.map((id) => ({ id, status: "PENDING" as const })), create: null, requestedById: null, now });
        c += (await tx.hrAttendanceDeduction.updateMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, adjustmentId: { in: w.rejected }, endCode: null }, data: { endCode: "POLICY_OFF", endedAt: now } })).count;
      }
      return c;
    }, TX_OPTS);
  }
  return n;
}

// ═════════════ ข้อมูลต้นทางของงวดงาน (อ่านอย่างเดียว) ═════════════
const EMP_SELECT = { id: true, name: true, unitId: true, startDate: true, endDate: true, active: true } as const;
type Emp = { id: string; name: string; unitId: string | null };
/** พนักงานที่ทำงานอย่างน้อย 1 วันในงวด (กติกาเดียวกับ work-entries.ts) · เรียงตาม id */
async function periodEmps(db: Db, ctx: Ctx, P: string, where: Prisma.HrEmployeeWhereInput = {}): Promise<Emp[]> {
  return (await db.hrEmployee.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      ...where,
      AND: [{ OR: [{ startDate: null }, { startDate: { lte: dbDate(lastDayOf(P)) } }] }, { OR: [{ endDate: null }, { endDate: { gte: dbDate(`${P}-01`) } }] }, { OR: [{ active: true }, { endDate: { not: null } }] }],
    },
    select: EMP_SELECT,
    orderBy: { id: "asc" },
    take: 5000,
  })) as Emp[];
}
type Calc = { state: WorkEntryState | "NONE"; code: string | null; out: AttOut | null; base: number };
type CalcSet = { policy: AttendancePayPolicy; N: number; byEmp: Map<string, Calc> };
/** คิดรายการหักสดของพนักงานชุดหนึ่งในงวดงาน P — `policyFor` = นโยบายที่ใช้คิด (ค่าปริยาย = ค่าตั้งปัจจุบัน) */
async function calcSet(db: Db, ctx: Ctx, P: string, ids: string[], policyOverride?: AttendancePayPolicy): Promise<CalcSet> {
  const s = await settingsIn(db, ctx);
  const policy = policyOverride ?? attendancePayPolicyOf(s[SETTINGS_KEY]);
  const N = normalMinutesOf(s);
  const byEmp = new Map<string, Calc>();
  if (!ids.length) return { policy, N, byEmp };
  const [states, profiles, days] = await Promise.all([
    workEntryStatesInTx(db, ctx, P, ids),
    db.hrSalaryProfile.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids } }, select: { employeeId: true, payType: true, baseSalarySatang: true } }),
    db.hrWorkDay.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: P, employeeId: { in: ids } },
      select: { id: true, employeeId: true, date: true, version: true, dayClass: true, lateMin: true, earlyOutMin: true, absentMin: true, review: true },
      orderBy: { id: "asc" },
      take: 200_000,
    }),
  ]);
  const prof = new Map(profiles.map((p) => [p.employeeId, p]));
  const dayBy = new Map<string, AttDayInput[]>();
  for (const d of days) {
    const a = dayBy.get(d.employeeId) ?? [];
    a.push({ workDayId: d.id, version: d.version, day: dayOf(d.date), dayClass: String(d.dayClass), lateMin: d.lateMin, earlyOutMin: d.earlyOutMin, absentMin: d.absentMin, review: [...d.review] });
    dayBy.set(d.employeeId, a);
  }
  for (const id of ids) {
    const state = states.get(id) ?? "NONE";
    const p = prof.get(id);
    if (state !== "CURRENT" && state !== "FROZEN") {
      byEmp.set(id, { state, code: state === "NONE" ? "MISSING" : state, out: null, base: p?.baseSalarySatang ?? 0 });
      continue;
    }
    if (!p) {
      byEmp.set(id, { state, code: "NO_PROFILE", out: null, base: 0 });
      continue;
    }
    const out = attendanceDeductionOf({ policy, payType: String(p.payType), baseSalarySatang: p.baseSalarySatang, normalDayMin: N, days: dayBy.get(id) ?? [] });
    byEmp.set(id, { state, code: out.ok ? null : out.code, out: out.ok ? out : null, base: p.baseSalarySatang });
  }
  return { policy, N, byEmp };
}
const ruleTotal = (out: AttOut | null, rule: AttRule) => (out && out.ok ? (rule === "LATE_RULE" ? out.late : out.absent) : { days: 0, minutes: 0, amountSatang: 0 });
const ruleLines = (out: AttOut | null, rule: AttRule) => (out && out.ok ? out.lines.filter((l) => l.rule === rule) : []);
const signedOf = (r: { kind: string; amountSatang: number }) => (String(r.kind) === "ALLOWANCE" ? -r.amountSatang : r.amountSatang);

type Head = { adjustmentId: string; employeeId: string; workPeriodKey: string; rule: string; gen: number; kind: string; entitledSatang: number; amountSatang: number; digest: string; endCode: string | null; linesJson: unknown; policyJson: unknown };
const HEAD_SELECT = { adjustmentId: true, employeeId: true, workPeriodKey: true, rule: true, gen: true, kind: true, entitledSatang: true, amountSatang: true, digest: true, endCode: true, linesJson: true, policyJson: true } as const;
type AdjRow = { id: string; employeeId: string; kind: string; status: string; amountSatang: number; runId: string | null; periodKey: string };
const ADJ_SELECT = { id: true, employeeId: true, kind: true, status: true, amountSatang: true, runId: true, periodKey: true } as const;
/** หัวรายการ + แถวเงินของพนักงานชุดหนึ่งในงวดงาน P */
async function rowsOf(db: Db, ctx: Ctx, P: string, ids: string[]): Promise<{ heads: Head[]; adj: Map<string, AdjRow> }> {
  if (!ids.length) return { heads: [], adj: new Map() };
  const heads = (await db.hrAttendanceDeduction.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, workPeriodKey: P, employeeId: { in: ids } }, select: HEAD_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20_000 })) as unknown as Head[];
  const adj = heads.length
    ? ((await db.hrPayAdjustment.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: heads.map((h) => h.adjustmentId) } }, select: ADJ_SELECT, take: 20_000 })) as unknown as AdjRow[])
    : [];
  return { heads, adj: new Map(adj.map((a) => [a.id, { ...a, kind: String(a.kind), status: String(a.status) }])) };
}

// ═════════════ คำนวณ (R4–R7) ═════════════
export type SyncResult =
  | { ok: true; periodKey: string; employees: number; created: number; rejected: number; kept: number; refunds: number; wait: { employeeId: string; code: string }[]; skipped: { employeeId: string; code: string }[]; next: string | null }
  | Fail;
/** งวดปลายทาง (R5): ไม่มีรอบที่ยังมีผลตั้งแต่ P ⇒ P · ไม่งั้นเดือนหลังรอบล่าสุด — ล็อกแล้วตรวจซ้ำจนนิ่ง (มากขึ้นเท่านั้น) */
async function lockTarget(tx: Db, ctx: Ctx, P: string, held: Set<string>): Promise<string> {
  let t: string | null = null;
  for (let i = 0; i < 36; i++) {
    const latest = (await tx.hrPayrollRun.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: { gte: P }, status: { not: "REVERSED" } }, orderBy: { periodKey: "desc" }, select: { periodKey: true } }))?.periodKey ?? null;
    let want = latest ? nextMonth(latest) : P;
    if (t !== null && want < t) want = t;
    if (t === want) return t;
    if (!held.has(want)) {
      await lock(tx, payKey(ctx, want));
      held.add(want);
    }
    t = want;
  }
  throw new Refusal(ATT_TEXT.failed);
}
async function frozenRun(db: Db, ctx: Ctx, P: string): Promise<boolean> {
  return !!(await db.hrPayrollRun.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: P, status: { in: ["APPROVED", "PAID"] } }, select: { id: true } }));
}

/**
 * ปุ่ม "คำนวณรายการหักสาย/ขาด" (Q4 — ทางเดียวที่สร้างรายการ) · ทีละหน้า ≤ 50 คน / ~20 วิ (next) · หน้าละ 1 tx ตามลำดับล็อกในหัวไฟล์ ·
 * สถานะ ≠ CURRENT ⇒ wait (ไม่เขียน) · ไม่มีโปรไฟล์/ไม่ใช่รายเดือน/ฐาน 0 ⇒ skipped · ต่อกฎ: แผนส่วนต่าง (R6) → ตัวเขียนใน payroll.ts (R7) + หัวรายการ ·
 * ทำซ้ำ/ขนานกัน = ผลเดียวกัน (ล็อกงวด P + แผนที่ไม่เปลี่ยนเมื่อยอด/ลายนิ้วมือเท่าเดิม)
 */
export async function syncAttendanceDeductions(
  ctx: Ctx,
  viewer: WorkEntryViewer,
  input: { periodKey?: unknown; employeeIds?: unknown; after?: unknown },
  opts: { now?: Date } = {},
): Promise<SyncResult> {
  if (!canSyncAttendancePay(viewer)) return { ok: false, reason: ATT_TEXT.syncNo };
  const P = typeof input?.periodKey === "string" ? input.periodKey.trim() : "";
  if (!PERIOD_RE.test(P)) return { ok: false, reason: ATT_TEXT.period };
  const db = tenantDb(ctx) as unknown as Db;
  if (!attendancePayPolicyOf((await settingsIn(db, ctx))[SETTINGS_KEY]).enabled) return { ok: false, reason: ATT_TEXT.off };
  if (await frozenRun(db, ctx, P)) return { ok: false, reason: ATT_TEXT.frozen };
  const now = nowOf(opts);
  const scope = scopeOf(viewer);
  const only = Array.isArray(input?.employeeIds) ? new Set(input.employeeIds.filter((x): x is string => typeof x === "string")) : null;
  const after = typeof input?.after === "string" ? input.after : "";
  const all = (await periodEmps(db, ctx, P)).filter((e) => covers(scope, e.unitId) && (!only || only.has(e.id)) && e.id > after);
  const total = { employees: 0, created: 0, rejected: 0, kept: 0, refunds: 0 };
  const wait: { employeeId: string; code: string }[] = [];
  const skipped: { employeeId: string; code: string }[] = [];
  const started = Date.now();
  let next: string | null = null;
  try {
    for (let i = 0; i < all.length; i += PAGE) {
      if (i > 0 && Date.now() - started > 20_000) {
        next = all[i - 1]!.id;
        break;
      }
      const page = all.slice(i, i + PAGE);
      const r = await tenantDb(ctx).$transaction(async (t) => {
        const tx = t as unknown as Db;
        await lock(tx, payKey(ctx, P)); // ล็อกงวดงานก่อนทุกอย่าง
        if (await frozenRun(tx, ctx, P)) throw new Refusal(ATT_TEXT.frozen);
        const held = new Set<string>([P]);
        const target = await lockTarget(tx, ctx, P, held);
        const ids = page.map((e) => e.id);
        const cs = await calcSet(tx, ctx, P, ids);
        if (!cs.policy.enabled) throw new Refusal(ATT_TEXT.off);
        const { heads, adj } = await rowsOf(tx, ctx, P, ids);
        const c = { employees: page.length, created: 0, rejected: 0, kept: 0, refunds: 0, wait: [] as { employeeId: string; code: string }[], skipped: [] as { employeeId: string; code: string }[] };
        const basisPolicy = cs.policy;
        for (const e of page) {
          const k = cs.byEmp.get(e.id);
          if (!k || k.state === "NONE") continue;
          if (k.state !== "CURRENT") {
            c.wait.push({ employeeId: e.id, code: k.state });
            continue;
          }
          if (!k.out) {
            c.skipped.push({ employeeId: e.id, code: k.code ?? "BAD_INPUT" });
            continue;
          }
          await lock(tx, `hr:attpay:${ctx.systemId}:${e.id}:${P}`);
          for (const rule of ATT_RULES) {
            const E = ruleTotal(k.out, rule).amountSatang;
            const digest = attendanceDigest(k.out, { base: k.base, N: cs.N, policy: basisPolicy }, rule);
            const mine = heads.filter((h) => h.employeeId === e.id && h.rule === rule && adj.has(h.adjustmentId));
            const planRows = mine.map((h) => {
              const a = adj.get(h.adjustmentId)!;
              return { id: a.id, kind: a.kind, status: a.status, amountSatang: a.amountSatang, bound: a.runId !== null, digest: h.digest };
            });
            const plan = attendanceDeltaPlan({ entitledSatang: E, digest, rows: planRows });
            if (!plan.reject.length && !plan.create) {
              if (planRows.some((x) => x.status !== "REJECTED")) c.kept++;
              continue;
            }
            const lines = ruleLines(k.out, rule);
            const minutes = lines.reduce((s, l) => s + l.minutes, 0);
            const m = thaiPeriodLabel(P);
            const create = plan.create
              ? {
                  kind: plan.create.kind,
                  amountSatang: plan.create.amountSatang,
                  periodKey: target,
                  note: plan.create.kind === "ALLOWANCE" ? attText(ATT_TEXT.refund, { m }) : attText(rule === "LATE_RULE" ? ATT_TEXT.adjLate : ATT_TEXT.adjAbsent, { n: minutes, m }),
                }
              : null;
            const statusOf = new Map(planRows.map((x) => [x.id, x.status]));
            const w = await writeAttendanceDeductionInTx(tx, ctx, {
              employeeId: e.id,
              workPeriodKey: P,
              rule,
              reject: plan.reject.map((id) => ({ id, status: statusOf.get(id) === "APPROVED" ? ("APPROVED" as const) : ("PENDING" as const) })),
              create,
              requestedById: viewer.userId ?? null,
              now,
            });
            if (w.rejected.length) {
              await tx.hrAttendanceDeduction.updateMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, adjustmentId: { in: w.rejected }, endCode: null }, data: { endCode: "SUPERSEDED", endedAt: now } });
              c.rejected += w.rejected.length;
            }
            if (w.created && create) {
              const refundOf = create.kind === "ALLOWANCE" ? planRows.filter((x) => x.bound && x.status === "APPROVED" && x.kind === "DEDUCTION").map((x) => x.id).sort() : [];
              await tx.hrAttendanceDeduction.create({
                data: {
                  tenantId: ctx.tenantId,
                  systemId: ctx.systemId,
                  employeeId: e.id,
                  adjustmentId: w.created.id,
                  workPeriodKey: P,
                  rule,
                  gen: w.created.gen,
                  kind: create.kind,
                  entitledSatang: E,
                  amountSatang: create.amountSatang,
                  baseSalarySatang: k.base,
                  normalDayMin: cs.N,
                  policyJson: basisPolicy as unknown as Prisma.InputJsonValue,
                  linesJson: lines.map((l) => ({ day: l.day, workDayId: l.workDayId, version: l.version, minutes: l.minutes, amountSatang: l.amountSatang })) as unknown as Prisma.InputJsonValue,
                  digest,
                  refundOfIds: refundOf,
                },
              });
              if (create.kind === "ALLOWANCE") c.refunds++;
              else c.created++;
            }
          }
        }
        return c;
      }, TX_OPTS);
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r[k];
      wait.push(...r.wait);
      skipped.push(...r.skipped);
      if (r.created || r.rejected || r.refunds) {
        await writeAudit({
          tenantId: ctx.tenantId,
          actorType: viewer.userId ? "USER" : "SYSTEM",
          actorId: viewer.userId ?? null,
          action: "hr.attpay.sync",
          targetType: "AppSystem",
          targetId: ctx.systemId,
          after: { systemId: ctx.systemId, periodKey: P, employees: r.employees, created: r.created, rejected: r.rejected, refunds: r.refunds },
        });
      }
    }
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, reason: e.message };
    if (e instanceof AttendanceAdjustmentConflict) return { ok: false, reason: ATT_TEXT.failed };
    throw e;
  }
  return { ok: true, periodKey: P, ...total, wait, skipped, next };
}

// ═════════════ ด่าน "ต้องคำนวณใหม่" (R8 + มติผู้คุมปิด D1) — อ่านอย่างเดียว ═════════════
/**
 * รายการหัก (DEDUCTION ของ LATE_RULE/ABSENT_RULE) ที่ไม่ตรงข้อมูลเวลาปัจจุบัน: ไม่มีหัว · หัวถูกปิด · งวดงานไม่ CURRENT/FROZEN ·
 * คิดใหม่ (วันปัจจุบัน + โปรไฟล์ปัจจุบัน + N + นโยบาย) แล้วลายนิ้วมือไม่ตรง — นโยบาย = ค่าตั้งปัจจุบัน (ปิดอยู่ ⇒ นโยบายในหัวรายการ: APPROVED ที่คงไว้ตอนปิดกฎยังผูกได้ Q12)
 */
export async function attendanceStaleIdsInTx(tx: Db, ctx: Ctx, adjustmentIds: string[]): Promise<Set<string>> {
  const stale = new Set<string>();
  if (!adjustmentIds.length) return stale;
  const heads = (await tx.hrAttendanceDeduction.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, adjustmentId: { in: adjustmentIds } }, select: HEAD_SELECT })) as unknown as Head[];
  const byAdj = new Map(heads.map((h) => [h.adjustmentId, h]));
  for (const id of adjustmentIds) {
    const h = byAdj.get(id);
    if (!h || h.endCode || !isAtt(h.rule)) stale.add(id);
  }
  const live = heads.filter((h) => !stale.has(h.adjustmentId));
  const cur = attendancePayPolicyOf((await settingsIn(tx, ctx))[SETTINGS_KEY]);
  const groups = new Map<string, Head[]>();
  for (const h of live) {
    const pol = cur.enabled ? cur : attendancePayPolicyOf(h.policyJson);
    const k = `${h.workPeriodKey}|${JSON.stringify(pol)}`;
    groups.set(k, [...(groups.get(k) ?? []), h]);
  }
  for (const hs of groups.values()) {
    const P = hs[0]!.workPeriodKey;
    const pol = cur.enabled ? cur : attendancePayPolicyOf(hs[0]!.policyJson);
    const cs = await calcSet(tx, ctx, P, [...new Set(hs.map((h) => h.employeeId))], pol);
    for (const h of hs) {
      const k = cs.byEmp.get(h.employeeId);
      const ok = !!k && (k.state === "CURRENT" || k.state === "FROZEN") && !!k.out && attendanceDigest(k.out, { base: k.base, N: cs.N, policy: cs.policy }, h.rule as AttRule) === h.digest;
      if (!ok) stale.add(h.adjustmentId);
    }
  }
  return stale;
}
/** ด่านอนุมัติรายการ (decideAdjustment · ผู้เรียกถือล็อก P → งวดของแถว) — ไม่ใช่รายการหักของกฎนี้ = ผ่าน */
export async function attendanceAdjustmentApproveCheckInTx(tx: Db, ctx: Ctx, adjustmentId: string): Promise<{ ok: true } | Fail> {
  const a = await tx.hrPayAdjustment.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: adjustmentId }, select: { sourceType: true, kind: true } });
  if (!a || !isAtt(a.sourceType) || String(a.kind) !== "DEDUCTION") return { ok: true };
  return (await attendanceStaleIdsInTx(tx, ctx, [adjustmentId])).size ? { ok: false, reason: ATT_TEXT.stale } : { ok: true };
}

// ═════════════ ตัวอ่าน (R10) ═════════════
export type AttPreviewRow = {
  employeeId: string;
  name: string;
  code: string | null;
  lateMin: number;
  absentMin: number;
  days: number;
  adjustmentIds: string[];
  lateSatang?: number;
  absentSatang?: number;
  pendingSatang?: number;
  approvedSatang?: number;
};
export type AttPreview = { ok: true; periodKey: string; enabled: boolean; rows: AttPreviewRow[]; staleIds: string[] };
const NO: Fail = { ok: false, reason: ATT_TEXT.no };
const no = (): Fail => ({ ...NO });
/** ภาพรวมของงวดงาน (ผู้อ่านชั่วโมงทำงาน · สาขาของผู้ดู) — นาทีทุกคน · เงินเฉพาะ OWNER/hr.payroll.read (Q9) · staleIds = APPROVED ที่ "ต้องคำนวณใหม่" */
export async function attendanceDeductionPreview(ctx: Ctx, viewer: WorkEntryViewer, input: { periodKey?: unknown }): Promise<AttPreview | Fail> {
  if (!canReadWorkEntries(viewer)) return no();
  const P = typeof input?.periodKey === "string" ? input.periodKey.trim() : "";
  if (!PERIOD_RE.test(P)) return no();
  const db = tenantDb(ctx) as unknown as Db;
  const scope = scopeOf(viewer);
  const emps = (await periodEmps(db, ctx, P)).filter((e) => covers(scope, e.unitId));
  const ids = emps.map((e) => e.id);
  const cs = await calcSet(db, ctx, P, ids);
  const { heads, adj } = await rowsOf(db, ctx, P, ids);
  const money = seesMoney(viewer);
  const approvedFree = heads.map((h) => adj.get(h.adjustmentId)).filter((a): a is AdjRow => !!a && a.status === "APPROVED" && a.runId === null && a.kind === "DEDUCTION").map((a) => a.id);
  const staleIds = [...(await attendanceStaleIdsInTx(db, ctx, approvedFree))].sort();
  const rows: AttPreviewRow[] = [...emps]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1))
    .map((e) => {
      const k = cs.byEmp.get(e.id);
      const out = cs.policy.enabled ? (k?.out ?? null) : null;
      const late = ruleTotal(out, "LATE_RULE");
      const absent = ruleTotal(out, "ABSENT_RULE");
      const mine = heads.filter((h) => h.employeeId === e.id).map((h) => adj.get(h.adjustmentId)).filter((a): a is AdjRow => !!a && a.status !== "REJECTED");
      const base: AttPreviewRow = {
        employeeId: e.id,
        name: e.name,
        code: k?.code ?? (k?.state === "NONE" ? "MISSING" : null),
        lateMin: late.minutes,
        absentMin: absent.minutes,
        days: new Set(out && out.ok ? out.lines.map((l) => l.day) : []).size,
        adjustmentIds: mine.map((a) => a.id),
      };
      if (!money) return base;
      return {
        ...base,
        lateSatang: late.amountSatang,
        absentSatang: absent.amountSatang,
        pendingSatang: mine.filter((a) => a.status === "PENDING").reduce((s, a) => s + signedOf(a), 0),
        approvedSatang: mine.filter((a) => a.status === "APPROVED").reduce((s, a) => s + signedOf(a), 0),
      };
    });
  return { ok: true, periodKey: P, enabled: cs.policy.enabled, rows, staleIds };
}

type LineDto = { day: string; workDayId: string; minutes: number; amountSatang: number };
const linesOf = (raw: unknown): LineDto[] =>
  (Array.isArray(raw) ? raw : []).map((l) => {
    const o = obj(l);
    return { day: String(o.day ?? ""), workDayId: String(o.workDayId ?? ""), minutes: Number(o.minutes ?? 0), amountSatang: Number(o.amountSatang ?? 0) };
  });
/** บรรทัดรายวันของรายการหนึ่ง — ผู้ดูเงินเดือน (OWNER · hr.payroll.read) ในสาขาของตัวเองเท่านั้น · อื่น/ไม่พบ/ร้านอื่น = คำปฏิเสธเดียวกันทุกไบต์ */
export async function attendanceDeductionLines(ctx: Ctx, viewer: WorkEntryViewer, input: { adjustmentId?: unknown }) {
  if (!seesMoney(viewer)) return no();
  const id = typeof input?.adjustmentId === "string" ? input.adjustmentId.trim() : "";
  if (!id) return no();
  const db = tenantDb(ctx) as unknown as Db;
  const h = (await db.hrAttendanceDeduction.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, adjustmentId: id }, select: HEAD_SELECT })) as unknown as Head | null;
  if (!h) return no();
  const emp = await db.hrEmployee.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: h.employeeId }, select: { unitId: true } });
  if (!emp || !covers(scopeOf(viewer), emp.unitId)) return no();
  return {
    ok: true as const,
    adjustmentId: h.adjustmentId,
    employeeId: h.employeeId,
    workPeriodKey: h.workPeriodKey,
    rule: h.rule,
    gen: h.gen,
    entitledSatang: h.entitledSatang,
    amountSatang: h.amountSatang,
    lines: linesOf(h.linesJson),
  };
}

/** รายการหักของตัวเอง (พนักงานจากบัญชีผู้ใช้ — ไม่รับ employeeId จากผู้เรียก §C.7) · แถวที่ยังมีผล (ไม่ใช่ REJECTED) ของงวดงาน */
export async function myAttendanceDeductions(ctx: Ctx, actor: { userId?: unknown }, input: { periodKey?: unknown }) {
  const userId = typeof actor?.userId === "string" ? actor.userId : "";
  const link = await employeeOfUser(ctx?.tenantId ?? "", userId);
  if (!link) return { ok: false as const, reason: ATT_TEXT.noEmp };
  const P = typeof input?.periodKey === "string" ? input.periodKey.trim() : "";
  if (!PERIOD_RE.test(P)) return no();
  const own: Ctx = { tenantId: ctx.tenantId, systemId: link.systemId };
  const { heads, adj } = await rowsOf(tenantDb(own) as unknown as Db, own, P, [link.employeeId]);
  const items = heads
    .map((h) => ({ h, a: adj.get(h.adjustmentId) }))
    .filter((x): x is { h: Head; a: AdjRow } => !!x.a && x.a.status !== "REJECTED")
    .map(({ h, a }) => {
      const lines = linesOf(h.linesJson);
      return {
        adjustmentId: a.id,
        status: a.status,
        kind: a.kind,
        periodKey: a.periodKey,
        workPeriodKey: h.workPeriodKey,
        rule: h.rule,
        minutes: lines.reduce((s, l) => s + l.minutes, 0),
        amountSatang: a.amountSatang,
        lines: lines.map((l) => ({ day: l.day, minutes: l.minutes, amountSatang: l.amountSatang })),
      };
    });
  return { ok: true as const, periodKey: P, items };
}

