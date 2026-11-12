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
//   ดึงชั่วโมงทำงาน      : P อย่างเดียว (work-entries.ts)
//   สร้าง/คำนวณใหม่/อนุมัติรอบ (fix r1 R4): งวดงาน < งวดของรอบ ที่รายการหักสาย/ขาดเกี่ยวข้อง (เรียงน้อย → มาก) → งวดของรอบ → แถวรอบ ·
//     อ่านชุดซ้ำใต้ล็อก — มีงวดที่ไม่ได้ล็อก ⇒ ปฏิเสธ (lockRetry) · markPaid/ลบร่าง/กลับรายการ: งวดของรอบเท่านั้น
//   แก้เวลา (H2.6)      : งวด (เรียง) → hr-corr → hr:clock → hr:judge · จ่าย OT (H2.9): งวด → ปลายทาง → hr:ot → hr:judge · หักค่าของ (H4.6): hr:stock → งวด
//   ⇒ ไม่มีใครถือล็อกงวดแล้วรอ hr:clockpolicy / ล็อกงวดที่น้อยกว่า ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { employeeOfUser } from "./service";
import { hrScopeOf, type HrScope } from "./scope";
import { canBuildWorkEntries, canReadWorkEntries, normalMinutesOf, workEntrySourceEmployeesInTx, workEntryStatesInTx, type WorkEntryState, type WorkEntryViewer } from "./work-entries";
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
  attendanceInForceOf,
  attendanceInForceToggle,
  attendancePeriodInForce,
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
/** fix r2 (F2): ช่วงเดือนที่กฎมีผล — คีย์แยก (อ็อบเจกต์นโยบายเดิมอยู่ในลายนิ้วมือ ห้ามเพิ่มช่อง) · ไม่มี migration (JSON ของ AppSystem.settings) */
const INFORCE_KEY = "hrAttendancePayInForce";
/** fix r2 (F4): ล็อกนโยบาย — sync ถือฝั่ง shared ตลอด tx · บันทึกนโยบายถือฝั่ง exclusive (ไม่ถือล็อกงวดใด) */
const policyLockKey = (ctx: Ctx) => `hr:attpay:policy:${ctx.systemId}`;
const lockShared = (tx: Db, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`;
const bkkMonth = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);
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

/**
 * fix r1 (R6 · hunter D5): ผู้เรียกต้องเป็นสมาชิกของร้านใน ctx จริง (ไม่พึ่งชั้น action) — ผู้ใช้ + สมาชิกภาพที่ตอบรับแล้ว + บทบาทตรงกับที่ผู้เรียกส่งมา ·
 * ผู้ดูที่ระบุร้านมา (tenantId) ต้องเป็นร้านเดียวกัน · ไม่ผ่าน = คำปฏิเสธของจุดนั้น (ไม่บอกเหตุผล)
 */
async function inTenant(ctx: Ctx, viewer: WorkEntryViewer | null | undefined): Promise<boolean> {
  const v = (viewer ?? {}) as { tenantId?: unknown; userId?: unknown; role?: unknown };
  if (typeof v.tenantId === "string" && v.tenantId !== ctx.tenantId) return false;
  const uid = typeof v.userId === "string" ? v.userId : "";
  if (!uid || !ctx?.tenantId) return false;
  const m = await tenantDb({ tenantId: ctx.tenantId }).membership.findFirst({ where: { tenantId: ctx.tenantId, userId: uid, acceptedAt: { not: null } }, select: { role: true } });
  return !!m && String(m.role) === String(v.role);
}

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
  if (!viewer || viewer.role !== "OWNER" || !(await inTenant(ctx, viewer))) return { ok: false, reason: ATT_TEXT.policyNo };
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
  // fix r2 (F2): เปิด = เปิดช่วงที่งวดปัจจุบัน (งวดที่มีรอบอนุมัติ/จ่ายแล้ว ⇒ งวดถัดไป) · ปิด = ปิดช่วงที่งวดปัจจุบัน ·
  //   อ่านรอบด้วย client ของระบบ (HrPayrollRun เป็นตาราง system-scoped — tx ด้านล่างเปิดระดับร้าน) ก่อนเข้า tx
  let period = bkkMonth(nowOf(opts));
  for (let k = 0; k < 240 && (await frozenRun(tenantDb(ctx) as unknown as Db, ctx, period)); k++) period = nextMonth(period);
  const closeAt = bkkMonth(nowOf(opts));
  // fix r3 (reviewer minor): ล็อกรอนานเกิน (sync ยาว) ⇒ คืนข้อความคงที่ failed แทนการ throw
  const res = await tenantDb({ tenantId: ctx.tenantId }).$transaction(async (t) => {
    const tx = t as unknown as Db;
    await lock(tx, `hr:clockpolicy:${ctx.systemId}`);
    await lock(tx, policyLockKey(ctx)); // fix r2 (F4): รอ sync ที่กำลังทำอยู่ (ถือ shared) ให้จบก่อน — ไม่ถือล็อกงวดใด ⇒ ไม่มีวงรอ
    const sys = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true, settings: true } });
    if (!sys) return null;
    const base = obj(sys.settings);
    const cur = attendancePayPolicyOf(base[SETTINGS_KEY]);
    const next: AttendancePayPolicy = { ...cur, ...patch };
    const inForce = attendanceInForceToggle(attendanceInForceOf(base[INFORCE_KEY]), next.enabled, next.enabled ? period : closeAt);
    const u = await tx.appSystem.updateMany({ where: { id: sys.id, tenantId: ctx.tenantId }, data: { settings: { ...base, [SETTINGS_KEY]: next, [INFORCE_KEY]: inForce } as Prisma.InputJsonValue } });
    return u.count === 1 ? { cur, next, inForce } : null;
  }, TX_OPTS).catch(() => null);
  if (!res) return { ok: false, reason: ATT_TEXT.failed };
  await writeAudit({ tenantId: ctx.tenantId, actorType: viewer.userId ? "USER" : "SYSTEM", actorId: viewer.userId ?? null, action: "hr.attpay.policy", targetType: "AppSystem", targetId: ctx.systemId, after: { systemId: ctx.systemId, ...res.next, inForce: res.inForce } });
  if (!res.next.enabled) await withdrawPendingOnOff(ctx, nowOf(opts));
  return { ok: true, id: ctx.systemId };
}

/** งวดงานที่ยังมีรายการ PENDING ไม่เข้ารอบ (หัวรายการยังไม่ปิด) — เรียง */
async function pendingPeriods(ctx: Ctx): Promise<string[]> {
  const db = tenantDb(ctx) as unknown as Db;
  const heads = await db.hrAttendanceDeduction.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, endCode: null }, select: { adjustmentId: true, workPeriodKey: true }, take: 20_000 });
  if (!heads.length) return [];
  const pend = await db.hrPayAdjustment.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: heads.map((h) => h.adjustmentId) }, status: "PENDING", runId: null }, select: { id: true }, take: 20_000 });
  const pendIds = new Set(pend.map((p) => p.id));
  return [...new Set(heads.filter((h) => pendIds.has(h.adjustmentId)).map((h) => h.workPeriodKey))].sort();
}
/**
 * ปิดกฎ ⇒ ถอน PENDING ที่ยังไม่เข้ารอบ (ทีละงวดงาน · ล็อก P → งวดของแถว เรียง) · ตรวจซ้ำใต้ล็อกว่ากฎยังปิด ·
 * fix r1 (R7): ไล่รายการงวดใหม่หลังแต่ละรอบจนไม่เหลือ PENDING (sync ที่อ่านกฎก่อนปิดแล้วเขียนทีหลังจะถูกเก็บในรอบถัดไป) — สูงสุด 5 รอบ
 */
async function withdrawPendingOnOff(ctx: Ctx, now: Date): Promise<number> {
  let n = 0;
  for (let pass = 0; pass < 5; pass++) {
    const periods = await pendingPeriods(ctx);
    if (!periods.length) break;
    let moved = 0;
    for (const P of periods) {
      const c = await tenantDb(ctx).$transaction(async (t) => {
        const tx = t as unknown as Db;
        await lock(tx, payKey(ctx, P));
        if (attendancePayPolicyOf((await settingsIn(tx, ctx))[SETTINGS_KEY]).enabled) return -1;
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
        let cc = 0;
        for (const g of groups.values()) {
          const w = await writeAttendanceDeductionInTx(tx, ctx, { employeeId: g.employeeId, workPeriodKey: P, rule: g.rule, reject: g.ids.map((id) => ({ id, status: "PENDING" as const })), create: null, requestedById: null, now });
          cc += (await tx.hrAttendanceDeduction.updateMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, adjustmentId: { in: w.rejected }, endCode: null }, data: { endCode: "POLICY_OFF", endedAt: now } })).count;
        }
        return cc;
      }, TX_OPTS);
      if (c < 0) return n; // กฎถูกเปิดกลับแล้ว — หยุด
      n += c;
      moved += c;
    }
    if (!moved) break;
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
async function frozenRun(db: Db, ctx: Ctx, P: string): Promise<boolean> {
  return !!(await db.hrPayrollRun.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: P, status: { in: ["APPROVED", "PAID"] } }, select: { id: true } }));
}
/** ฐานที่ใช้คิด (อยู่ในลายนิ้วมือ) */
type Basis = { base: number; N: number; policy: AttendancePayPolicy };
/** skip: NOT_IN_FORCE = งวดอยู่นอกช่วงที่กฎมีผล (F2) · NO_SNAPSHOT = ต้องใช้ภาพนิ่งแต่ไม่มีหัวรายการ (งวดปิดแล้ว F1 · กฎปิดอยู่) — ไม่มียอดที่ต้องหัก */
type Calc = { state: WorkEntryState | "NONE"; code: string | null; out: AttOut | null; res: AttOut | null; basis: Basis; skip: "NOT_IN_FORCE" | "NO_SNAPSHOT" | null };
type CalcSet = { policy: AttendancePayPolicy; N: number; frozen: boolean; inForce: boolean; useCurrent: boolean; byEmp: Map<string, Calc> };
/**
 * คิดรายการหักสดของพนักงานชุดหนึ่งในงวดงาน P —
 *   ใช้ค่าปัจจุบัน (เงินเดือน · N · นโยบาย) เฉพาะเมื่องวดยังไม่ปิด + อยู่ในช่วงที่กฎมีผล + กฎเปิดอยู่ ·
 *   นอกนั้นใช้ภาพนิ่งในหัวรายการล่าสุดของพนักงานคนนั้นในงวด (fix r1 R3 งวดที่ปิดแล้ว · fix r2 F2 กฎปิดอยู่) ·
 *   fix r2 (F1): งวดที่ปิดแล้ว/กฎปิดอยู่ แต่ไม่มีหัวรายการ ⇒ NO_SNAPSHOT (ไม่มีอะไรต้องหัก — ไม่ใช้เงินเดือน/กฎปัจจุบันย้อนหลังเด็ดขาด) ·
 *   fix r2 (F2): งวดนอกช่วงที่กฎมีผล ⇒ NOT_IN_FORCE (ยอด 0 · ถ้ามีหัวรายการ คิดจากภาพนิ่งไว้ให้ด่านผูกรอบใช้)
 */
async function calcSet(db: Db, ctx: Ctx, P: string, ids: string[]): Promise<CalcSet> {
  const s = await settingsIn(db, ctx);
  const policy = attendancePayPolicyOf(s[SETTINGS_KEY]);
  const N = normalMinutesOf(s);
  const inForce = attendancePeriodInForce(attendanceInForceOf(s[INFORCE_KEY]), P);
  const byEmp = new Map<string, Calc>();
  const frozen = await frozenRun(db, ctx, P);
  const useCurrent = !frozen && inForce && policy.enabled;
  if (!ids.length) return { policy, N, frozen, inForce, useCurrent, byEmp };
  const [states, profiles, days, snaps] = await Promise.all([
    workEntryStatesInTx(db, ctx, P, ids),
    db.hrSalaryProfile.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids } }, select: { employeeId: true, payType: true, baseSalarySatang: true } }),
    db.hrWorkDay.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: P, employeeId: { in: ids } },
      select: { id: true, employeeId: true, date: true, version: true, dayClass: true, lateMin: true, earlyOutMin: true, absentMin: true, review: true },
      orderBy: { id: "asc" },
      take: 200_000,
    }),
    !useCurrent
      ? db.hrAttendanceDeduction.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, workPeriodKey: P, employeeId: { in: ids } }, select: { employeeId: true, baseSalarySatang: true, normalDayMin: true, policyJson: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20_000 })
      : Promise.resolve([] as { employeeId: string; baseSalarySatang: number; normalDayMin: number; policyJson: unknown }[]),
  ]);
  const prof = new Map(profiles.map((p) => [p.employeeId, p]));
  const snap = new Map<string, Basis>();
  for (const h of snaps) if (!snap.has(h.employeeId)) snap.set(h.employeeId, { base: h.baseSalarySatang, N: h.normalDayMin, policy: attendancePayPolicyOf(h.policyJson) });
  const dayBy = new Map<string, AttDayInput[]>();
  for (const d of days) {
    const a = dayBy.get(d.employeeId) ?? [];
    a.push({ workDayId: d.id, version: d.version, day: dayOf(d.date), dayClass: String(d.dayClass), lateMin: d.lateMin, earlyOutMin: d.earlyOutMin, absentMin: d.absentMin, review: [...d.review] });
    dayBy.set(d.employeeId, a);
  }
  for (const id of ids) {
    const state = states.get(id) ?? "NONE";
    const p = prof.get(id);
    const sb = useCurrent ? undefined : snap.get(id);
    const skip = !frozen && !inForce ? "NOT_IN_FORCE" : !useCurrent && !sb ? "NO_SNAPSHOT" : null;
    const basis: Basis = useCurrent ? { base: p?.baseSalarySatang ?? 0, N, policy } : (sb ?? { base: 0, N, policy });
    if (state !== "CURRENT" && state !== "FROZEN") {
      byEmp.set(id, { state, code: state === "NONE" ? "MISSING" : state, out: null, res: null, basis, skip });
      continue;
    }
    let res: AttOut | null;
    if (useCurrent) res = p ? attendanceDeductionOf({ policy, payType: String(p.payType), baseSalarySatang: p.baseSalarySatang, normalDayMin: N, days: dayBy.get(id) ?? [] }) : ({ ok: false, code: "NO_PROFILE" } as unknown as AttOut);
    else res = sb ? attendanceDeductionOf({ policy: sb.policy, payType: "MONTHLY", baseSalarySatang: sb.base, normalDayMin: sb.N, days: dayBy.get(id) ?? [] }) : null;
    byEmp.set(id, { state, code: skip ?? (res && !res.ok ? res.code : null), out: res && res.ok ? res : null, res, basis, skip });
  }
  return { policy, N, frozen, inForce, useCurrent, byEmp };
}
const ruleTotal = (out: AttOut | null, rule: AttRule) => (out && out.ok ? (rule === "LATE_RULE" ? out.late : out.absent) : { days: 0, minutes: 0, amountSatang: 0 });
const ruleLines = (out: AttOut | null, rule: AttRule) => (out && out.ok ? out.lines.filter((l) => l.rule === rule) : []);
const signedOf = (r: { kind: string; amountSatang: number }) => (String(r.kind) === "ALLOWANCE" ? -r.amountSatang : r.amountSatang);
const digestOf = (k: Calc, rule: AttRule) => (k.res ? attendanceDigest(k.res, k.basis, rule) : "");
/** fix r2 (F3b): ยอดที่ควรหักเป็น 0 เพราะโปรไฟล์ (ฐาน 0 · ไม่ใช่รายเดือน · ไม่มีโปรไฟล์) — การคำนวณยังต้องถอนรายการที่ค้าง (ระบบปฏิเสธ ไม่ใช่การสละสิทธิ์) */
const ZERO_CODES = new Set(["NO_BASE", "PAY_TYPE", "NO_PROFILE"]);

type Head = { adjustmentId: string; employeeId: string; workPeriodKey: string; rule: string; gen: number; kind: string; entitledSatang: number; amountSatang: number; digest: string; endCode: string | null; linesJson: unknown; policyJson: unknown; refundOfIds: string[] };
const HEAD_SELECT = { adjustmentId: true, employeeId: true, workPeriodKey: true, rule: true, gen: true, kind: true, entitledSatang: true, amountSatang: true, digest: true, endCode: true, linesJson: true, policyJson: true, refundOfIds: true } as const;
type AdjRow = { id: string; employeeId: string; kind: string; status: string; amountSatang: number; runId: string | null; periodKey: string };
const ADJ_SELECT = { id: true, employeeId: true, kind: true, status: true, amountSatang: true, runId: true, periodKey: true } as const;
/** หัวรายการ + แถวเงินของพนักงานชุดหนึ่งในงวดงาน P (+ สถานะรอบของแถวที่เข้ารอบแล้ว) */
async function rowsOf(db: Db, ctx: Ctx, P: string, ids: string[]): Promise<{ heads: Head[]; adj: Map<string, AdjRow>; runStatus: Map<string, string> }> {
  if (!ids.length) return { heads: [], adj: new Map(), runStatus: new Map() };
  const heads = (await db.hrAttendanceDeduction.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, workPeriodKey: P, employeeId: { in: ids } }, select: HEAD_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20_000 })) as unknown as Head[];
  const adj = heads.length
    ? ((await db.hrPayAdjustment.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: heads.map((h) => h.adjustmentId) } }, select: ADJ_SELECT, take: 20_000 })) as unknown as AdjRow[])
    : [];
  const runIds = [...new Set(adj.map((a) => a.runId).filter((x): x is string => !!x))];
  const runs = runIds.length ? await db.hrPayrollRun.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: runIds } }, select: { id: true, status: true } }) : [];
  return { heads, adj: new Map(adj.map((a) => [a.id, { ...a, kind: String(a.kind), status: String(a.status) }])), runStatus: new Map(runs.map((r) => [r.id, String(r.status)])) };
}
/** fix r1 (R2a): มีรายการหักที่ผูกรอบร่างอยู่ แต่ลายนิ้วมือไม่ตรงข้อมูลปัจจุบัน (ยังไม่ได้หักจริง — ห้ามคิดส่วนต่าง/คืนเงินจากมัน) */
const draftStaleOf = (heads: Head[], adj: Map<string, AdjRow>, runStatus: Map<string, string>, employeeId: string, k: Calc) =>
  heads.some((h) => {
    const a = adj.get(h.adjustmentId);
    return h.employeeId === employeeId && isAtt(h.rule) && h.kind === "DEDUCTION" && !!a && a.status === "APPROVED" && !!a.runId && runStatus.get(a.runId) === "DRAFT" && h.digest !== digestOf(k, h.rule);
  });
/** fix r1 (R8): หัวรายการที่ "คนปฏิเสธ" (แถว REJECTED · หัวยังไม่ถูกระบบปิด) ด้วยลายนิ้วมือเดียวกัน = สละสิทธิ์หักสำหรับข้อมูลชุดนั้น */
const waivedBy = (heads: Head[], adj: Map<string, AdjRow>, employeeId: string, rule: AttRule, digest: string) =>
  !!digest && heads.some((h) => h.employeeId === employeeId && h.rule === rule && h.kind === "DEDUCTION" && !h.endCode && h.digest === digest && adj.get(h.adjustmentId)?.status === "REJECTED");

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

/**
 * ปุ่ม "คำนวณรายการหักสาย/ขาด" (Q4 — ทางเดียวที่สร้างรายการ) · ทีละหน้า ≤ 50 คน / ~20 วิ (next) · หน้าละ 1 tx ตามลำดับล็อกในหัวไฟล์ ·
 * สถานะ ∉ {CURRENT, FROZEN} ⇒ wait (ไม่เขียน) · ไม่มีโปรไฟล์/ไม่ใช่รายเดือน/ฐาน 0 ⇒ skipped · ต่อกฎ: แผนส่วนต่าง (R6) → ตัวเขียนใน payroll.ts (R7) + หัวรายการ ·
 * ทำซ้ำ/ขนานกัน = ผลเดียวกัน (ล็อกงวด P + แผนที่ไม่เปลี่ยนเมื่อยอด/ลายนิ้วมือเท่าเดิม)
 * fix r1: (R3) งวดงานที่อนุมัติ/จ่ายแล้วคำนวณได้ — เขียนเฉพาะงวดปลายทาง (> รอบล่าสุด) ไม่เคยเขียนเข้ารอบ P · ฐานของงวดที่ปิด = ภาพนิ่งในหัวรายการ ·
 *   (R2a) พนักงานที่มีรายการหักผูกรอบร่างแต่ลายนิ้วมือไม่ตรงแล้ว ⇒ ไม่เขียนอะไรเลย · wait RUN_STALE ("คำนวณรอบใหม่ก่อน") ·
 *   (R8) ไม่สร้าง PENDING ซ้ำให้ข้อมูลชุดที่คนปฏิเสธแล้ว (ลายนิ้วมือเดียวกัน) · (R6) ผู้เรียกต้องเป็นสมาชิกร้านใน ctx
 */
export async function syncAttendanceDeductions(
  ctx: Ctx,
  viewer: WorkEntryViewer,
  input: { periodKey?: unknown; employeeIds?: unknown; after?: unknown },
  opts: { now?: Date } = {},
): Promise<SyncResult> {
  if (!canSyncAttendancePay(viewer) || !(await inTenant(ctx, viewer))) return { ok: false, reason: ATT_TEXT.syncNo };
  const P = typeof input?.periodKey === "string" ? input.periodKey.trim() : "";
  if (!PERIOD_RE.test(P)) return { ok: false, reason: ATT_TEXT.period };
  const db = tenantDb(ctx) as unknown as Db;
  {
    // fix r2 (F2): กฎปิดอยู่ แต่งวดนี้อยู่ในช่วงที่กฎมีผล ⇒ ยังคำนวณได้ (ภาพนิ่ง · ถอน/คืนเท่านั้น ไม่สร้างรายการหักใหม่)
    const s0 = await settingsIn(db, ctx);
    if (!attendancePayPolicyOf(s0[SETTINGS_KEY]).enabled && !attendancePeriodInForce(attendanceInForceOf(s0[INFORCE_KEY]), P)) return { ok: false, reason: ATT_TEXT.off };
  }
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
        await lockShared(tx, policyLockKey(ctx)); // fix r2 (F4): บันทึกนโยบาย (exclusive) รอ tx นี้ · อ่านกฎ/ช่วงมีผลซ้ำใต้ล็อกนี้ (calcSet)
        const held = new Set<string>([P]);
        const target = await lockTarget(tx, ctx, P, held); // งวดที่ปิดแล้ว ⇒ เดือนหลังรอบล่าสุด (> P เสมอ)
        const ids = page.map((e) => e.id);
        const cs = await calcSet(tx, ctx, P, ids);
        if (!cs.policy.enabled && !cs.inForce) throw new Refusal(ATT_TEXT.off);
        const { heads, adj, runStatus } = await rowsOf(tx, ctx, P, ids);
        const c = { employees: page.length, created: 0, rejected: 0, kept: 0, refunds: 0, wait: [] as { employeeId: string; code: string }[], skipped: [] as { employeeId: string; code: string }[] };
        for (const e of page) {
          const k = cs.byEmp.get(e.id);
          if (!k || k.state === "NONE") continue;
          if (k.skip) {
            c.skipped.push({ employeeId: e.id, code: k.skip }); // fix r2 (F1 NO_SNAPSHOT · F2 NOT_IN_FORCE): ไม่เขียนอะไร (ไม่ต้องรอชั่วโมงทำงาน)
            continue;
          }
          if (k.state !== "CURRENT" && k.state !== "FROZEN") {
            c.wait.push({ employeeId: e.id, code: k.state });
            continue;
          }
          const zero = !k.out && !!k.res && !k.res.ok && ZERO_CODES.has(k.res.code);
          if (!k.out) {
            c.skipped.push({ employeeId: e.id, code: k.code ?? "BAD_INPUT" });
            // fix r2 (F3b): ยอดที่ควรหักกลายเป็น 0 (ฐาน 0 · ไม่ใช่รายเดือน) แต่ยังมีรายการค้าง ⇒ คิดต่อเพื่อถอน (SUPERSEDED)
            if (!zero || !heads.some((h) => h.employeeId === e.id && adj.has(h.adjustmentId) && adj.get(h.adjustmentId)!.status !== "REJECTED")) continue;
          }
          // R2a: รายการหักที่ผูกรอบร่างแล้วแต่ข้อมูลเปลี่ยน ⇒ ห้ามคิดส่วนต่าง/คืนเงินจากมัน (ยังไม่ได้หักจริง) — ให้คำนวณรอบใหม่ก่อน (ปลดออก) แล้วค่อยคำนวณ
          if (draftStaleOf(heads, adj, runStatus, e.id, k)) {
            c.wait.push({ employeeId: e.id, code: "RUN_STALE" });
            continue;
          }
          await lock(tx, `hr:attpay:${ctx.systemId}:${e.id}:${P}`);
          for (const rule of ATT_RULES) {
            const E = ruleTotal(k.out, rule).amountSatang;
            const digest = digestOf(k, rule);
            const mine = heads.filter((h) => h.employeeId === e.id && h.rule === rule && adj.has(h.adjustmentId));
            const planRows = mine.map((h) => {
              const a = adj.get(h.adjustmentId)!;
              return { id: a.id, kind: a.kind, status: a.status, amountSatang: a.amountSatang, bound: a.runId !== null, digest: h.digest };
            });
            const plan = attendanceDeltaPlan({ entitledSatang: E, digest, rows: planRows });
            // R8: คนปฏิเสธข้อมูลชุดนี้แล้ว ⇒ ไม่สร้างรายการหักใหม่ (การถอน/คืนเงินยังทำตามแผน)
            // fix r2 (F2): กฎปิดอยู่ ⇒ ถอน/คืนเงินได้ แต่ไม่สร้างรายการหักใหม่ (Q12)
            const create0 = plan.create && plan.create.kind === "DEDUCTION" && (waivedBy(heads, adj, e.id, rule, digest) || !cs.policy.enabled) ? null : plan.create;
            if (!plan.reject.length && !create0) {
              if (planRows.some((x) => x.status !== "REJECTED")) c.kept++;
              continue;
            }
            const lines = ruleLines(k.out, rule);
            const minutes = lines.reduce((s2, l) => s2 + l.minutes, 0);
            const m = thaiPeriodLabel(P);
            const create = create0
              ? {
                  kind: create0.kind,
                  amountSatang: create0.amountSatang,
                  periodKey: target,
                  note: create0.kind === "ALLOWANCE" ? attText(ATT_TEXT.refund, { m }) : attText(rule === "LATE_RULE" ? ATT_TEXT.adjLate : ATT_TEXT.adjAbsent, { n: minutes, m }),
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
                  baseSalarySatang: k.basis.base,
                  normalDayMin: k.basis.N,
                  policyJson: k.basis.policy as unknown as Prisma.InputJsonValue,
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

// ═════════════ ด่าน "ต้องคำนวณใหม่" (R8 + มติผู้คุมปิด D1 + fix r1) — อ่านอย่างเดียว ═════════════
/**
 * รายการที่ผูกเข้ารอบไม่ได้ (หรืออนุมัติไม่ได้):
 *   DEDUCTION ของ LATE_RULE/ABSENT_RULE — ไม่มีหัว · หัวถูกปิด · งวดงานไม่ CURRENT/FROZEN · คิดใหม่แล้วลายนิ้วมือไม่ตรง
 *     (นโยบาย = ค่าตั้งปัจจุบัน · ปิดอยู่ ⇒ นโยบายในหัวรายการ (Q12) · งวดงานที่ปิดแล้ว ⇒ ภาพนิ่งในหัวรายการทั้งหมด — R3)
 *   ALLOWANCE (คืนเงินหักเกิน) — fix r1 (R2b): ผูกได้เมื่อทุกแถวใน refundOfIds อยู่ในรอบที่อนุมัติ/จ่ายแล้วเท่านั้น (หักจริงแล้ว) · ไม่งั้นค้างไว้
 *     ให้การคำนวณครั้งถัดไปจัดการ (แถวหักถูกปลดจากรอบ ⇒ ปฏิเสธทั้งคู่แล้วคิดใหม่จาก B)
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
  // R2b: คืนเงินผูกได้เมื่อแถวหักที่อ้างถึงอยู่ในรอบอนุมัติ/จ่ายแล้วทุกแถว
  const refunds = heads.filter((h) => !stale.has(h.adjustmentId) && h.kind === "ALLOWANCE");
  if (refunds.length) {
    const refIds = [...new Set(refunds.flatMap((h) => h.refundOfIds ?? []))];
    const refRows = refIds.length ? await tx.hrPayAdjustment.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: refIds } }, select: { id: true, status: true, runId: true } }) : [];
    const runIds = [...new Set(refRows.map((r) => r.runId).filter((x): x is string => !!x))];
    const taken = new Set((runIds.length ? await tx.hrPayrollRun.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: runIds }, status: { in: ["APPROVED", "PAID"] } }, select: { id: true } }) : []).map((r) => r.id));
    const ok = new Set(refRows.filter((r) => String(r.status) === "APPROVED" && !!r.runId && taken.has(r.runId)).map((r) => r.id));
    for (const h of refunds) if (!(h.refundOfIds ?? []).length || (h.refundOfIds ?? []).some((x) => !ok.has(x))) stale.add(h.adjustmentId);
  }
  const live = heads.filter((h) => !stale.has(h.adjustmentId) && h.kind === "DEDUCTION");
  if (!live.length) return stale;
  // fix r2: ฐานของงวดเลือกใน calcSet (ค่าปัจจุบันเมื่อกฎเปิด+มีผล+งวดยังไม่ปิด · นอกนั้นภาพนิ่งในหัวรายการ — A9)
  const groups = new Map<string, Head[]>();
  for (const h of live) groups.set(h.workPeriodKey, [...(groups.get(h.workPeriodKey) ?? []), h]);
  for (const hs of groups.values()) {
    const P = hs[0]!.workPeriodKey;
    const cs = await calcSet(tx, ctx, P, [...new Set(hs.map((h) => h.employeeId))]);
    for (const h of hs) {
      const k = cs.byEmp.get(h.employeeId);
      const ok = !!k && (k.state === "CURRENT" || k.state === "FROZEN") && !!k.out && digestOf(k, h.rule as AttRule) === h.digest;
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

/**
 * fix r1 (R4): งวดงาน (< งวดของรอบ) ของรายการหักสาย/ขาดที่รอบนี้อาจผูก/ตรวจ — ผู้เรียก (payroll.ts) ล็อกเรียงจากน้อยไปมากก่อนล็อกงวดของรอบ:
 *   รายการ PENDING/APPROVED ที่ยังไม่เข้ารอบของงวดของรอบ (ตัวที่ PENDING อาจถูกอนุมัติก่อนเราได้ล็อก) + รายการที่ผูกรอบนี้อยู่ +
 *   (อนุมัติรอบ) รายการ APPROVED ยังไม่เข้ารอบของพนักงานในรอบที่งวดงาน < งวดของรอบ (ด่าน R1)
 */
export async function attendanceWorkPeriodsInTx(tx: Db, ctx: Ctx, runPeriod: string, runId: string | null, approve: boolean): Promise<string[]> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const att = { in: ["LATE_RULE", "ABSENT_RULE"] as AttRule[] };
  const rows = await tx.hrPayAdjustment.findMany({
    where: { ...scope, sourceType: att, OR: [{ periodKey: runPeriod, runId: null, status: { in: ["PENDING", "APPROVED"] } }, ...(runId ? [{ runId }] : [])] },
    select: { id: true },
    take: 20_000,
  });
  const ps = new Set<string>();
  if (rows.length) for (const h of await tx.hrAttendanceDeduction.findMany({ where: { ...scope, adjustmentId: { in: rows.map((r) => r.id) } }, select: { workPeriodKey: true } })) ps.add(h.workPeriodKey);
  if (approve && runId) {
    const emps = [...new Set((await tx.hrPayrollItem.findMany({ where: { ...scope, runId }, select: { employeeId: true } })).map((x) => x.employeeId))];
    if (emps.length) {
      const hs = await tx.hrAttendanceDeduction.findMany({ where: { ...scope, employeeId: { in: emps }, workPeriodKey: { lt: runPeriod }, endCode: null, kind: "DEDUCTION" }, select: { adjustmentId: true, workPeriodKey: true }, take: 20_000 });
      const free = hs.length ? new Set((await tx.hrPayAdjustment.findMany({ where: { ...scope, id: { in: hs.map((h) => h.adjustmentId) }, status: "APPROVED", runId: null }, select: { id: true } })).map((r) => r.id)) : new Set<string>();
      for (const h of hs) if (free.has(h.adjustmentId)) ps.add(h.workPeriodKey);
    }
  }
  return [...ps].filter((p) => p < runPeriod).sort();
}
/** งวดงานของชุดรายการ (ใช้ตรวจว่าผู้เรียกล็อกครบ) */
export async function attendanceWorkPeriodsOfInTx(tx: Db, ctx: Ctx, adjustmentIds: string[]): Promise<string[]> {
  if (!adjustmentIds.length) return [];
  const hs = await tx.hrAttendanceDeduction.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, adjustmentId: { in: adjustmentIds } }, select: { workPeriodKey: true } });
  return [...new Set(hs.map((h) => h.workPeriodKey))].sort();
}

export type AttendanceRunGate = null | "ATTENDANCE_STALE" | "ATTENDANCE_SYNC" | "ATTENDANCE_LOCK";
/**
 * ด่านอนุมัติรอบ (claimApproveExpected · ใต้ล็อกงวดงานที่ attendanceWorkPeriodsInTx ให้ → ล็อกงวดของรอบ → ล็อกแถวรอบ) — รุ่น 1 และ 2:
 *   ATTENDANCE_LOCK  = มีงวดงาน < งวดของรอบที่ต้องอ่านแต่ไม่ได้ล็อก (ชุดเปลี่ยนระหว่างทาง)
 *   ATTENDANCE_STALE = รอบผูกรายการหัก/คืนเงินที่ผูกไม่ได้แล้ว (ข้อมูลเปลี่ยน · คืนเงินที่แถวหักยังไม่ถูกหักจริง)
 *   ATTENDANCE_SYNC  = fix r1 (R1): กฎเปิดอยู่ และสำหรับพนักงานในรอบ งวดงาน = งวดของรอบ: สถานะไม่ CURRENT/FROZEN · หรือ Σ signed (APPROVED+PENDING)
 *                      ≠ ยอดที่ควรหัก E (เว้นข้อมูลชุดที่คนปฏิเสธไว้ — R8) · หรือมี APPROVED ยังไม่เข้ารอบที่ต้องคำนวณใหม่ของงวดงาน ≤ งวดของรอบ
 */
export async function attendanceRunGateInTx(tx: Db, ctx: Ctx, runId: string, runPeriod: string, held: ReadonlySet<string>): Promise<AttendanceRunGate> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const att = { in: ["LATE_RULE", "ABSENT_RULE"] as AttRule[] };
  const lockedOk = (ps: string[]) => ps.every((p) => p >= runPeriod || held.has(p));
  const bound = (await tx.hrPayAdjustment.findMany({ where: { ...scope, runId, sourceType: att }, select: { id: true } })).map((r) => r.id);
  if (!lockedOk(await attendanceWorkPeriodsOfInTx(tx, ctx, bound))) return "ATTENDANCE_LOCK";
  if ((await attendanceStaleIdsInTx(tx, ctx, bound)).size) return "ATTENDANCE_STALE";
  const emps = [...new Set((await tx.hrPayrollItem.findMany({ where: { ...scope, runId }, select: { employeeId: true } })).map((x) => x.employeeId))].sort();
  if (!emps.length) return null;
  // fix r2 (F2): ด่าน "ต้องคำนวณก่อน" ใช้กับงวดที่อยู่ในช่วงที่กฎมีผลเท่านั้น (แม้วันนี้กฎปิด) · งวดนอกช่วง = ไม่มียอดต้องหัก ไม่ต้องคำนวณ
  const cs = await calcSet(tx, ctx, runPeriod, emps);
  if (cs.inForce) {
    const { heads, adj } = await rowsOf(tx, ctx, runPeriod, emps);
    // fix r3 (N1): ยังไม่ดึงชั่วโมงทำงาน แต่มีข้อมูลต้นทางในงวด (ลงเวลา · ตารางกะ · ตารางประจำ) ⇒ อาจมีสาย/ขาดที่ยังไม่ได้คิด ⇒ ต้องดึง + คำนวณก่อน
    const unpulled = emps.filter((e) => {
      const k = cs.byEmp.get(e);
      return !k || k.state === "NONE" || k.state === "MISSING";
    });
    const withSource = unpulled.length ? await workEntrySourceEmployeesInTx(tx, ctx, runPeriod, unpulled) : new Set<string>();
    for (const e of emps) {
      const k = cs.byEmp.get(e);
      if (k?.skip) continue; // fix r2 (F1): ไม่มีภาพนิ่ง (งวดปิดแล้ว/กฎปิดอยู่โดยไม่เคยคำนวณ) ⇒ ไม่มียอดต้องหัก
      const mine = heads.filter((h) => h.employeeId === e).map((h) => adj.get(h.adjustmentId)).filter((a): a is AdjRow => !!a && (a.status === "APPROVED" || a.status === "PENDING"));
      // fix r2 (F3a): ไม่มีชั่วโมงทำงานในงวด (ไม่อยู่ในชุดของ work entries / ยังไม่ดึง) และไม่มีรายการหักที่ยังมีผล ⇒ ไม่มีอะไรต้องหัก
      if (!k || k.state === "NONE" || k.state === "MISSING") {
        // fix r2 (F3a) แคบลงใน fix r3 (N1): ผ่านได้เฉพาะคนที่ไม่มีข้อมูลต้นทางในงวดจริง ๆ (ไม่ได้ทำงานในงวด / ไม่มีแถวพนักงาน / ไม่มีลงเวลา-กะ-ตารางประจำ)
        if (mine.length || withSource.has(e)) return "ATTENDANCE_SYNC";
        continue;
      }
      if (k.state !== "CURRENT" && k.state !== "FROZEN") return "ATTENDANCE_SYNC";
      for (const rule of ATT_RULES) {
        const E = ruleTotal(k.out, rule).amountSatang;
        const live = mine.filter((a) => heads.some((h) => h.adjustmentId === a.id && h.rule === rule)).reduce((s2, a) => s2 + signedOf(a), 0);
        // กฎเปิด: ต้องเท่ากับยอดที่ควรหัก · กฎปิด (ภาพนิ่ง): ไม่สร้างรายการใหม่ ⇒ ต้องไม่เกินยอดที่ควรหัก
        const ok = cs.policy.enabled ? live === E : live <= E;
        if (!ok && !waivedBy(heads, adj, e, rule, digestOf(k, rule))) return "ATTENDANCE_SYNC";
      }
    }
  }
  const hs = await tx.hrAttendanceDeduction.findMany({ where: { ...scope, employeeId: { in: emps }, workPeriodKey: { lte: runPeriod }, endCode: null, kind: "DEDUCTION" }, select: { adjustmentId: true, workPeriodKey: true }, take: 20_000 });
  const free = hs.length ? (await tx.hrPayAdjustment.findMany({ where: { ...scope, id: { in: hs.map((h) => h.adjustmentId) }, status: "APPROVED", runId: null }, select: { id: true } })).map((r) => r.id) : [];
  if (!lockedOk(await attendanceWorkPeriodsOfInTx(tx, ctx, free))) return "ATTENDANCE_LOCK";
  if ((await attendanceStaleIdsInTx(tx, ctx, free)).size) return "ATTENDANCE_SYNC";
  return null;
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
/**
 * ภาพรวมของงวดงาน (ผู้อ่านชั่วโมงทำงาน · สาขาของผู้ดู) — นาทีทุกคน · เงินเฉพาะ OWNER/hr.payroll.read (Q9) · staleIds = APPROVED ที่ "ต้องคำนวณใหม่" ·
 * fix r1 (N4): employeeIds (ไม่บังคับ) = จำกัดคนที่คิด (แผงรายคนส่งคนเดียว)
 */
export async function attendanceDeductionPreview(ctx: Ctx, viewer: WorkEntryViewer, input: { periodKey?: unknown; employeeIds?: unknown }): Promise<AttPreview | Fail> {
  if (!canReadWorkEntries(viewer) || !(await inTenant(ctx, viewer))) return no();
  const P = typeof input?.periodKey === "string" ? input.periodKey.trim() : "";
  if (!PERIOD_RE.test(P)) return no();
  const only = Array.isArray(input?.employeeIds) ? new Set(input.employeeIds.filter((x): x is string => typeof x === "string")) : null;
  const db = tenantDb(ctx) as unknown as Db;
  const scope = scopeOf(viewer);
  const emps = (await periodEmps(db, ctx, P)).filter((e) => covers(scope, e.unitId) && (!only || only.has(e.id)));
  const ids = emps.map((e) => e.id);
  const cs = await calcSet(db, ctx, P, ids);
  const { heads, adj, runStatus } = await rowsOf(db, ctx, P, ids);
  const money = seesMoney(viewer);
  const approvedFree = heads.map((h) => adj.get(h.adjustmentId)).filter((a): a is AdjRow => !!a && a.status === "APPROVED" && a.runId === null).map((a) => a.id);
  const staleIds = [...(await attendanceStaleIdsInTx(db, ctx, approvedFree))].sort();
  const rows: AttPreviewRow[] = [...emps]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1))
    .map((e) => {
      const k = cs.byEmp.get(e.id);
      const out = k && !k.skip ? k.out : null; // fix r2: นอกช่วงมีผล / ไม่มีภาพนิ่ง = 0
      const late = ruleTotal(out, "LATE_RULE");
      const absent = ruleTotal(out, "ABSENT_RULE");
      const mine = heads.filter((h) => h.employeeId === e.id).map((h) => adj.get(h.adjustmentId)).filter((a): a is AdjRow => !!a && a.status !== "REJECTED");
      const base: AttPreviewRow = {
        employeeId: e.id,
        name: e.name,
        code: k?.code ?? (k?.state === "NONE" ? "MISSING" : k && draftStaleOf(heads, adj, runStatus, e.id, k) ? "RUN_STALE" : null),
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
        pendingSatang: mine.filter((a) => a.status === "PENDING").reduce((s2, a) => s2 + signedOf(a), 0),
        approvedSatang: mine.filter((a) => a.status === "APPROVED").reduce((s2, a) => s2 + signedOf(a), 0),
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
  if (!seesMoney(viewer) || !(await inTenant(ctx, viewer))) return no();
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

/**
 * รายการหักของตัวเอง (พนักงานจากบัญชีผู้ใช้ — ไม่รับ employeeId จากผู้เรียก §C.7) · แถวที่ยังมีผล (ไม่ใช่ REJECTED) ของงวดงาน ·
 * fix r1 (N5): คืนเงิน (ALLOWANCE) ไม่แสดงนาที/บรรทัด (บรรทัดในหัวคือข้อมูลหลังแก้ ไม่ใช่สิ่งที่คืน)
 */
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
      const lines = a.kind === "ALLOWANCE" ? [] : linesOf(h.linesJson);
      return {
        adjustmentId: a.id,
        status: a.status,
        kind: a.kind,
        periodKey: a.periodKey,
        workPeriodKey: h.workPeriodKey,
        rule: h.rule,
        minutes: lines.reduce((s2, l) => s2 + l.minutes, 0),
        amountSatang: a.amountSatang,
        lines: lines.map((l) => ({ day: l.day, minutes: l.minutes, amountSatang: l.amountSatang })),
      };
    });
  return { ok: true as const, periodKey: P, items };
}
