// HR H3.4-YTD ▸ ยอดยกมาต้นปี (ก่อนใช้ระบบ) — service (server เท่านั้น) · brief hr-brief-H3.4-YTD R3 R4 R8–R10
//   ด่าน (R8) = ด่านแบบยื่นของ H3.6 (canUseFilings: สมาชิกภาพจริงในฐาน · บทบาทต้องตรงกับที่ส่งมา · OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา)
//     ไม่ผ่าน/ไม่พบพนักงาน/ของระบบอื่น/ร้านอื่น = {ok:false, code:"NO", reason} ไบต์เดียวกันทุกทางเข้า · ผู้ไม่ใช่ OWNER แก้แถวของตัวเอง = OWN · ไม่มีหน้าของตัวเอง
//   append-only (R1): แก้ = ปิดแถวเดิม (supersededAt) + แทรก rev ถัดไป · ล้าง = ปิดแถวเดิม · ยอดเงินอยู่ที่แถวเท่านั้น — ประวัติ (AuditLog) ไม่มีบาท (R10)
//   ลำดับล็อก (R4 · hr:ytd ท้ายสุดเสมอ): hr50:<ระบบ>:<พนักงาน>:<ปี> (คีย์เดียวกับออก 50 ทวิ · เรียงน้อย → มาก) → hr:ytd:<ระบบ>:<ปี>
//     สร้าง/คิดใหม่/อนุมัติรอบ (payroll.ts) = งวด → แถวรอบ → hr:ytd · ออก 50 ทวิ (filings/service.ts) = hr50 → hr:ytd ⇒ ไม่มีวงรอ
//   ไม่มี JV (ลงบัญชีก่อนใช้ระบบแล้ว · R11) · ไม่มี outbox · ไม่อยู่ในเครื่องมือ AI (R9) ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { canUseFilings, type FilingViewer } from "./filings/service";
import { bkkParts } from "./service";
import { loadLawSet } from "./law";
import { OPENING_TEXT, isDay, openingMissing, parseOpening, ssoHigh, yearOk, type OpeningCode, type OpeningInput } from "./payroll-opening-rules";

type Ctx = { tenantId: string; systemId: string };
type Db = Prisma.TransactionClient;
type Opts = { now?: Date };
export type OpeningViewer = FilingViewer;
export type OpeningFail = { ok: false; code: OpeningCode; reason: string; employeeId?: string };
export type OpeningState = "SET" | "MISSING" | "NOT_NEEDED";
export type OpeningDto = { asOfDay: string; months: number; incomeSatang: number; whtSatang: number; ssoSatang: number; rev: number };
export type OpeningRowDto = { employeeId: string; name: string; code: string | null; startDay: string | null; state: OpeningState; opening: OpeningDto | null; locked: boolean };
export type SaveOpeningInput = { employeeId: unknown; taxYear: unknown; asOfDay: unknown; months: unknown; incomeSatang: unknown; whtSatang: unknown; ssoSatang: unknown; expectRev?: unknown };
export type OpeningWarning = "SSO_HIGH";
/** แถวที่ยังมีผลของปี (ภายในเท่านั้น — ผู้อ่านคือเครื่องคิดเงินเดือนและแบบยื่น) */
export type LiveOpening = { id: string; rev: number; employeeId: string; taxYear: number } & OpeningInput;

const TX = { maxWait: 20_000, timeout: 30_000 } as const;
const BULK_MAX = 300;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NO = (): OpeningFail => ({ ok: false, code: "NO", reason: OPENING_TEXT.NO });
const fail = (code: OpeningCode, employeeId?: string): OpeningFail => ({ ok: false, code, reason: OPENING_TEXT[code], ...(employeeId ? { employeeId } : {}) });
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const nowOf = (o?: Opts) => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? new Date(o.now.getTime()) : new Date());
/** ต้นวันตามเวลาไทย → UTC */
const bkkStartOf = (day: string) => new Date(Date.parse(`${day}T00:00:00.000Z`) - 7 * 3_600_000);
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
const yearOf = (raw: unknown): unknown => (typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : raw);
/** expectRev: null/ไม่ส่ง = ยังไม่มีแถวที่มีผล · จำนวนเต็ม ≥ 1 = rev ที่เห็น · อื่น ๆ = ไม่ถูกต้อง */
const revOf = (v: unknown): number | null | undefined => (v === null || v === undefined ? null : typeof v === "number" && Number.isSafeInteger(v) && v >= 1 ? v : undefined);
class Refused extends Error {
  constructor(readonly f: OpeningFail) {
    super(f.code);
  }
}

// ═════════════ ล็อก (ใน tx ของผู้เรียก) ═════════════
/** hr50 ของทุกคน (เรียงน้อย → มาก · seed 36 = คีย์ของการออก 50 ทวิ) → hr:ytd ของปี */
async function lockOpeningInTx(tx: Db, ctx: Ctx, employeeIds: readonly string[], taxYear: number): Promise<void> {
  for (const e of [...new Set(employeeIds)].sort()) await tx.$queryRaw`SELECT 1 AS "x" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`hr50:${ctx.systemId}:${e}:${taxYear}`}, 36))) AS "l"`;
  await lockYtdInTx(tx, ctx, taxYear);
}
/** hr:ytd:<ระบบ>:<ปีภาษี> (seed 0) — ล็อกสุดท้ายของทุกผู้เขียน/ผู้อ่านยอดยกมา */
export async function lockYtdInTx(tx: Pick<Db, "$queryRaw">, ctx: Ctx, taxYear: number): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS "x" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`hr:ytd:${ctx.systemId}:${taxYear}`}, 0))) AS "l"`;
}

// ═════════════ ตัวอ่านภายใน (เครื่องคิดเงินเดือน · แบบยื่น · รายงาน) ═════════════
/** แถวที่ยังมีผลของปีภาษี (ทุกคน หรือเฉพาะ employeeIds) — ใช้ tx ของผู้เรียก */
export async function openingsInTx(tx: Pick<Db, "hrPayrollOpeningYtd">, ctx: Ctx, taxYear: number, employeeIds?: readonly string[]): Promise<LiveOpening[]> {
  if (employeeIds && !employeeIds.length) return [];
  const rows = await tx.hrPayrollOpeningYtd.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, taxYear, supersededAt: null, ...(employeeIds ? { employeeId: { in: [...employeeIds] } } : {}) },
    select: { id: true, rev: true, employeeId: true, taxYear: true, asOfDay: true, months: true, incomeSatang: true, whtSatang: true, ssoSatang: true },
    orderBy: [{ employeeId: "asc" }],
  });
  return rows.map((r) => ({ ...r, asOfDay: dayOf(r.asOfDay)! }));
}

// ═════════════ ด่าน ═════════════
type Gate = { userId: string; isOwner: boolean };
async function gateOf(ctx: Ctx, viewer: OpeningViewer | null | undefined): Promise<Gate | null> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string" || !ID_RE.test(ctx.tenantId) || !ID_RE.test(ctx.systemId)) return null;
  if (!(await canUseFilings(ctx, viewer))) return null;
  // canUseFilings ผ่าน ⇒ บทบาทในฐาน = viewer.role · userId = เจ้าของสมาชิกภาพนั้น
  return { userId: String(viewer!.userId), isOwner: viewer!.role === "OWNER" };
}
/** พนักงานของระบบนี้ (ไม่พบ = NO) · ไม่ใช่ OWNER + แถวของตัวเอง = OWN */
async function employeeGate(ctx: Ctx, g: Gate, employeeIds: string[]): Promise<OpeningFail | null> {
  if (!employeeIds.length || employeeIds.some((e) => !ID_RE.test(e))) return NO();
  const uniq = [...new Set(employeeIds)];
  const emps = await tenantDb(ctx).hrEmployee.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: uniq } }, select: { id: true, linkedUserId: true } });
  if (emps.length !== uniq.length) return NO();
  const own = emps.find((e) => e.linkedUserId === g.userId);
  return own && !g.isOwner ? fail("OWN", own.id) : null;
}

// ═════════════ รายชื่อ ═════════════
export async function listOpeningYtd(ctx: Ctx, viewer: OpeningViewer, input: { taxYear: unknown }, opts?: Opts): Promise<{ ok: true; taxYear: number; rows: OpeningRowDto[] } | OpeningFail> {
  if (!(await gateOf(ctx, viewer))) return NO();
  const taxYear = yearOf(obj(input).taxYear);
  if (!yearOk(taxYear)) return fail("YEAR");
  const today = bkkParts(nowOf(opts)).dateStr;
  const db = tenantDb(ctx);
  const jan1 = `${taxYear}-01-01`;
  const dec31 = `${taxYear}-12-31`;
  const live = await openingsInTx(db as unknown as Db, ctx, taxYear);
  const liveOf = new Map(live.map((o) => [o.employeeId, o]));
  const emps = await db.hrEmployee.findMany({
    where: {
      tenantId: ctx.tenantId, systemId: ctx.systemId,
      OR: [
        { AND: [{ OR: [{ startDate: null }, { startDate: { lte: new Date(`${dec31}T00:00:00.000Z`) } }] }, { OR: [{ endDate: null }, { endDate: { gte: new Date(`${jan1}T00:00:00.000Z`) } }] }] },
        { id: { in: live.map((o) => o.employeeId) } },
      ],
    },
    select: { id: true, name: true, code: true, startDate: true },
    orderBy: [{ code: "asc" }, { name: "asc" }, { id: "asc" }],
    take: 500,
  });
  const ids = emps.map((e) => e.id);
  const certs = new Set(
    ids.length ? (await db.hrTaxCertificate.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, taxYear, voidedAt: null, employeeId: { in: ids } }, select: { employeeId: true } })).map((c) => c.employeeId) : [],
  );
  // รอบแรกของปี (ไม่นับ REVERSED · ทุกสถานะ) ที่มีคนนี้ — ใช้กติกาเดียวกับคำเตือนในรอบ (openingMissing)
  const firstRun = new Map<string, { payDay: string; periodKey: string }>();
  if (ids.length) {
    const items = await db.hrPayrollItem.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids }, run: { status: { not: "REVERSED" }, payDate: { gte: bkkStartOf(jan1), lt: bkkStartOf(`${taxYear + 1}-01-01`) } } },
      select: { employeeId: true, run: { select: { payDate: true, periodKey: true } } },
    });
    for (const i of items) {
      const payDay = bkkParts(i.run.payDate).dateStr;
      const cur = firstRun.get(i.employeeId);
      if (!cur || payDay < cur.payDay) firstRun.set(i.employeeId, { payDay, periodKey: i.run.periodKey });
    }
  }
  // ยังไม่มีรอบที่มีคนนี้ในปี ⇒ คิดเหมือนรอบถัดไปเป็นงวดเดือนนี้ (ปีที่ผ่านไปแล้ว = ธันวาคม · ปีหน้า = ยังไม่ต้องกรอก)
  const nominal = today.slice(0, 4) === String(taxYear) ? { payDay: today, periodKey: today.slice(0, 7) } : today.slice(0, 4) > String(taxYear) ? { payDay: dec31, periodKey: `${taxYear}-12` } : null;
  const rows: OpeningRowDto[] = emps.map((e) => {
    const o = liveOf.get(e.id);
    const startDay = dayOf(e.startDate);
    const at = firstRun.get(e.id) ?? nominal;
    const state: OpeningState = o ? "SET" : at && openingMissing({ payDay: at.payDay, periodKey: at.periodKey, startDay, hasOpening: false, hasEarlierRun: false }) ? "MISSING" : "NOT_NEEDED";
    return {
      employeeId: e.id, name: e.name, code: e.code?.trim() ? e.code.trim() : null, startDay, state,
      opening: o ? { asOfDay: o.asOfDay, months: o.months, incomeSatang: o.incomeSatang, whtSatang: o.whtSatang, ssoSatang: o.ssoSatang, rev: o.rev } : null,
      locked: certs.has(e.id),
    };
  });
  return { ok: true, taxYear, rows };
}

// ═════════════ บันทึก / ล้าง ═════════════
type Planned = { employeeId: string; value: OpeningInput; expectRev: number | null };
/** ตรวจ 1 แถวก่อนเปิด tx (ไม่มีฐานข้อมูล) */
function planOf(raw: Record<string, unknown>, taxYear: number, today: string): Planned | OpeningFail {
  const employeeId = typeof raw.employeeId === "string" ? raw.employeeId : "";
  const expectRev = revOf(raw.expectRev);
  if (expectRev === undefined) return fail("FIELDS", employeeId || undefined);
  const p = parseOpening(raw, { taxYear, todayBkk: today });
  if (!p.ok) return fail(p.code, employeeId || undefined);
  return { employeeId, value: { asOfDay: p.asOfDay, months: p.months, incomeSatang: p.incomeSatang, whtSatang: p.whtSatang, ssoSatang: p.ssoSatang }, expectRev };
}
/** ใต้ล็อก: ใบ 50 ทวิ ที่ยังไม่ยกเลิก (CERT_ISSUED) → rev ที่เห็น (REV_CHANGED) → รอบที่จ่ายในช่วงยอดยกมา (OVERLAP) */
async function checkInTx(tx: Db, ctx: Ctx, taxYear: number, employeeId: string, expectRev: number | null, asOfDay: string | null): Promise<{ live: { id: string; rev: number } | null; maxRev: number }> {
  const cert = await tx.hrTaxCertificate.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, taxYear, voidedAt: null }, select: { id: true } });
  if (cert) throw new Refused(fail("CERT_ISSUED", employeeId));
  const all = await tx.hrPayrollOpeningYtd.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, taxYear }, select: { id: true, rev: true, supersededAt: true } });
  const live = all.find((r) => !r.supersededAt) ?? null;
  if ((live?.rev ?? null) !== expectRev) throw new Refused(fail("REV_CHANGED", employeeId));
  if (asOfDay) {
    // รอบที่ยังมีผล (ทุกรุ่น/สถานะ ยกเว้น REVERSED) ของปีนี้ ที่วันจ่าย (เวลาไทย) ≤ วันที่ยอดถึง และมีคนนี้
    const run = await tx.hrPayrollRun.findFirst({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: { not: "REVERSED" }, payDate: { gte: bkkStartOf(`${taxYear}-01-01`), lt: bkkStartOf(nextDay(asOfDay)) }, items: { some: { employeeId } } },
      select: { id: true },
    });
    if (run) throw new Refused(fail("OVERLAP", employeeId));
  }
  return { live: live ? { id: live.id, rev: live.rev } : null, maxRev: all.reduce((m, r) => Math.max(m, r.rev), 0) };
}
/** เงินสมทบสูงสุดต่อเดือนตามตารางกฎหมาย ณ วันที่ยอดถึง (ไม่มีตาราง = ไม่เตือน) */
async function ssoLawInTx(tx: Db, asOfDay: string): Promise<{ rateBp: number; maxBaseSatang: number } | null> {
  const law = await loadLawSet(asOfDay, tx as unknown as Parameters<typeof loadLawSet>[1]).catch(() => null);
  if (!law || !law.ok) return null;
  const j = obj((law.set as unknown as { SSO?: { json?: unknown } }).SSO?.json);
  return Number.isSafeInteger(j.rateBp) && Number.isSafeInteger(j.maxBaseSatang) ? { rateBp: j.rateBp as number, maxBaseSatang: j.maxBaseSatang as number } : null;
}
/** เขียน 1 แถว (ปิดแถวเดิม + แทรก rev ถัดไป) + ประวัติ — ใน tx ของผู้เรียก (ถือล็อกแล้ว) */
async function writeOneInTx(tx: Db, ctx: Ctx, g: Gate, taxYear: number, p: Planned, now: Date, by: "ONE" | "BULK"): Promise<{ rev: number; warn: boolean }> {
  const c = await checkInTx(tx, ctx, taxYear, p.employeeId, p.expectRev, p.value.asOfDay);
  if (c.live) {
    const u = await tx.hrPayrollOpeningYtd.updateMany({ where: { id: c.live.id, tenantId: ctx.tenantId, systemId: ctx.systemId, supersededAt: null }, data: { supersededAt: now, supersededById: g.userId } });
    if (u.count !== 1) throw new Refused(fail("REV_CHANGED", p.employeeId));
  }
  const rev = c.maxRev + 1;
  await tx.hrPayrollOpeningYtd.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: p.employeeId, taxYear, asOfDay: new Date(`${p.value.asOfDay}T00:00:00.000Z`), months: p.value.months, incomeSatang: p.value.incomeSatang, whtSatang: p.value.whtSatang, ssoSatang: p.value.ssoSatang, rev, createdById: g.userId, createdAt: now },
  });
  await tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: "USER", actorId: g.userId, action: "hr.payroll.opening.save", targetType: "HrEmployee", targetId: p.employeeId, after: { employeeId: p.employeeId, taxYear, rev, by } } });
  return { rev, warn: ssoHigh(p.value, await ssoLawInTx(tx, p.value.asOfDay)) };
}
/** คำปฏิเสธที่ต้องลงประวัติ (OVERLAP · CERT_ISSUED) — รหัสอย่างเดียว */
async function refusedAudit(ctx: Ctx, g: Gate, f: OpeningFail): Promise<void> {
  if (f.code !== "OVERLAP" && f.code !== "CERT_ISSUED") return;
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: g.userId, action: "hr.payroll.opening.refused", targetType: "HrEmployee", ...(f.employeeId ? { targetId: f.employeeId } : {}), after: { code: f.code } });
}
const pub = (f: OpeningFail, keepEmployee = false): OpeningFail => (keepEmployee && f.employeeId ? f : { ok: false, code: f.code, reason: f.reason });

export async function saveOpeningYtd(ctx: Ctx, viewer: OpeningViewer, input: SaveOpeningInput, opts?: Opts): Promise<{ ok: true; rev: number; warnings: OpeningWarning[] } | OpeningFail> {
  const g = await gateOf(ctx, viewer);
  if (!g) return NO();
  const raw = obj(input);
  const employeeId = typeof raw.employeeId === "string" ? raw.employeeId : "";
  const eg = await employeeGate(ctx, g, [employeeId]);
  if (eg) return pub(eg);
  const taxYear = yearOf(raw.taxYear);
  if (!yearOk(taxYear)) return fail("YEAR");
  const now = nowOf(opts);
  const p = planOf(raw, taxYear, bkkParts(now).dateStr);
  if ("ok" in p) return pub(p);
  let out: { rev: number; warn: boolean };
  try {
    out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Db;
      await lockOpeningInTx(tx, ctx, [employeeId], taxYear);
      return writeOneInTx(tx, ctx, g, taxYear, p, now, "ONE");
    }, TX);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    await refusedAudit(ctx, g, e.f);
    return pub(e.f);
  }
  return { ok: true, rev: out.rev, warnings: out.warn ? ["SSO_HIGH"] : [] };
}

/** ตารางเดียว ≤ 300 แถว · ทั้งหมดหรือไม่มีเลย (tx เดียว) · ประวัติ 1 แถวต่อคน (by BULK) */
export async function saveOpeningYtdBulk(ctx: Ctx, viewer: OpeningViewer, input: { taxYear: unknown; rows: unknown }, opts?: Opts): Promise<{ ok: true; saved: { employeeId: string; rev: number }[]; warnings: { employeeId: string; warning: OpeningWarning }[] } | OpeningFail> {
  const g = await gateOf(ctx, viewer);
  if (!g) return NO();
  const i = obj(input);
  const list = Array.isArray(i.rows) ? (i.rows as unknown[]).map(obj) : null;
  const ids = (list ?? []).map((r) => (typeof r.employeeId === "string" ? r.employeeId : ""));
  if (!list || list.length < 1 || list.length > BULK_MAX || new Set(ids).size !== ids.length) return fail("FIELDS");
  const eg = await employeeGate(ctx, g, ids);
  if (eg) return pub(eg, true);
  const taxYear = yearOf(i.taxYear);
  if (!yearOk(taxYear)) return fail("YEAR");
  const now = nowOf(opts);
  const today = bkkParts(now).dateStr;
  const plans: Planned[] = [];
  for (const r of list) {
    const p = planOf(r, taxYear, today);
    if ("ok" in p) return pub(p, true);
    plans.push(p);
  }
  let out: { employeeId: string; rev: number; warn: boolean }[];
  try {
    out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Db;
      await lockOpeningInTx(tx, ctx, ids, taxYear);
      const res: { employeeId: string; rev: number; warn: boolean }[] = [];
      for (const p of [...plans].sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1))) res.push({ employeeId: p.employeeId, ...(await writeOneInTx(tx, ctx, g, taxYear, p, now, "BULK")) });
      return res;
    }, TX);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    await refusedAudit(ctx, g, e.f);
    return pub(e.f, true);
  }
  return { ok: true, saved: out.map((x) => ({ employeeId: x.employeeId, rev: x.rev })), warnings: out.filter((x) => x.warn).map((x) => ({ employeeId: x.employeeId, warning: "SSO_HIGH" as const })) };
}

export async function clearOpeningYtd(ctx: Ctx, viewer: OpeningViewer, input: { employeeId: unknown; taxYear: unknown; expectRev: unknown }, opts?: Opts): Promise<{ ok: true } | OpeningFail> {
  const g = await gateOf(ctx, viewer);
  if (!g) return NO();
  const raw = obj(input);
  const employeeId = typeof raw.employeeId === "string" ? raw.employeeId : "";
  const eg = await employeeGate(ctx, g, [employeeId]);
  if (eg) return pub(eg);
  const taxYear = yearOf(raw.taxYear);
  if (!yearOk(taxYear)) return fail("YEAR");
  const expectRev = revOf(raw.expectRev);
  if (expectRev === undefined || expectRev === null) return fail("REV_CHANGED");
  const now = nowOf(opts);
  try {
    await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Db;
      await lockOpeningInTx(tx, ctx, [employeeId], taxYear);
      const c = await checkInTx(tx, ctx, taxYear, employeeId, expectRev, null);
      const u = await tx.hrPayrollOpeningYtd.updateMany({ where: { id: c.live!.id, tenantId: ctx.tenantId, systemId: ctx.systemId, supersededAt: null }, data: { supersededAt: now, supersededById: g.userId } });
      if (u.count !== 1) throw new Refused(fail("REV_CHANGED", employeeId));
      await tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: "USER", actorId: g.userId, action: "hr.payroll.opening.clear", targetType: "HrEmployee", targetId: employeeId, after: { employeeId, taxYear, rev: c.live!.rev } } });
    }, TX);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    await refusedAudit(ctx, g, e.f);
    return pub(e.f);
  }
  return { ok: true };
}

/** วันที่ "YYYY-MM-DD" ถูกต้องไหม (ใช้ซ้ำในหน้า/actions) */
export const openingDayOk = isDay;
