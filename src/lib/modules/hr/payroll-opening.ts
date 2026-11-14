// HR H3.4-YTD ▸ ยอดยกมาต้นปี (ก่อนใช้ระบบ) — service (server เท่านั้น) · brief hr-brief-H3.4-YTD R3 R4 R8–R10 (+ fix round · controller rulings)
//   ด่าน (R8) = ด่านแบบยื่นของ H3.6 (canUseFilings: สมาชิกภาพจริงในฐาน · บทบาทต้องตรงกับที่ส่งมา · OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา)
//     ไม่ผ่าน/ไม่พบพนักงาน/ของระบบอื่น/ร้านอื่น = {ok:false, code:"NO", reason} ไบต์เดียวกันทุกทางเข้า · ผู้ไม่ใช่ OWNER แก้แถวของตัวเอง = OWN ·
//     การ์ด/รายการ/แก้ไข ไม่มีหน้าของตัวเอง (พนักงานเห็นบรรทัดยอดยกมาของตัวเองในสลิปรายปีเท่านั้น — มติ Q-B)
//   append-only (R1): แก้ = ปิดแถวเดิม (supersededAt) + แทรก rev ถัดไป · ล้าง = ปิดแถวเดิม · ยอดเงินอยู่ที่แถวเท่านั้น — ประวัติ (AuditLog) ไม่มีบาท (R10)
//   ลำดับล็อก (R4 · hr:ytd ท้ายสุดเสมอ): hr50:<ระบบ>:<พนักงาน>:<ปี> (คีย์เดียวกับออก 50 ทวิ · เรียงน้อย → มาก · คำสั่งเดียว) → hr:ytd:<ระบบ>:<ปี> (payroll-opening-read.ts)
//     สร้าง/คิดใหม่/อนุมัติรอบ (payroll.ts) = งวด → แถวรอบ → hr:ytd · ออก 50 ทวิ (filings/service.ts) = hr50 → hr:ytd ⇒ ไม่มีวงรอ
//   เขียนเป็นชุด (fix round F3): ตรวจ/ปิดแถว/แทรก/ประวัติ ของทุกแถวด้วยคำสั่งชุดเดียว (ไม่วนทีละแถว) · หมดเวลา ⇒ BUSY ข้อความคงที่
//   ไม่มี JV (ลงบัญชีก่อนใช้ระบบแล้ว · R11) · ไม่มี outbox · ไม่อยู่ในเครื่องมือ AI (R9) ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { canUseFilings, type FilingViewer } from "./filings/service";
import { bkkParts } from "./service";
import { ssoLawForPeriod } from "./payroll-rules-sso"; // HR HF-SSO ▸ SSO_HIGH ใช้เพดานตามงวด (ไม่อ่านแถว SSO ของตาราง) ◂
import { liveOpeningsIn, lockYtdInTx, type LiveOpeningRow } from "./payroll-opening-read";
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
export type LiveOpening = LiveOpeningRow;

const TX = { maxWait: 20_000, timeout: 30_000 } as const;
/** แถวที่เปลี่ยนต่อการบันทึกทั้งตาราง (แถวที่ไม่เปลี่ยนไม่นับ) */
export const OPENING_BULK_MAX = 300;
/** แถวที่ส่งมาได้ทั้งหมด (รวมแถวที่ไม่เปลี่ยน) — เท่ากับเพดานรายชื่อ */
export const OPENING_LIST_MAX = 500;
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
/** หมดเวลาธุรกรรม/รอคิวล็อกนาน (Prisma P2028 · statement timeout) ⇒ คำปฏิเสธคงที่ BUSY ไม่ใช่ข้อความดิบ */
const isBusy = (e: unknown): boolean => {
  const code = (e as { code?: unknown })?.code;
  return code === "P2028" || code === "P2034" || /Transaction (already closed|API error)|expired|timed? ?out|canceling statement/i.test(String((e as Error)?.message ?? ""));
};

// ═════════════ ล็อก (ใน tx ของผู้เรียก) ═════════════
/** hr50 ของทุกคน (คำสั่งเดียว · เรียงน้อย → มาก · seed 36 = คีย์ของการออก 50 ทวิ) → hr:ytd ของปี */
async function lockOpeningInTx(tx: Db, ctx: Ctx, employeeIds: readonly string[], taxYear: number): Promise<void> {
  const keys = [...new Set(employeeIds)].sort().map((e) => `hr50:${ctx.systemId}:${e}:${taxYear}`); await tx.$queryRaw`SELECT count(*)::int AS "n" FROM (SELECT pg_advisory_xact_lock(hashtextextended(s."k", 36)) FROM (SELECT t."k" FROM unnest(${keys}::text[]) WITH ORDINALITY AS t("k", "i") ORDER BY t."i") AS s) AS "l"`;
  await lockYtdInTx(tx, ctx, taxYear);
}

// ═════════════ ตัวอ่านภายใน ═════════════
/** แถวที่ยังมีผลของปีภาษี (ทุกคน หรือเฉพาะ employeeIds) — ใช้ client/tx ของผู้เรียก */
export async function openingsInTx(tx: Pick<Db, "hrPayrollOpeningYtd">, ctx: Ctx, taxYear: number, employeeIds?: readonly string[]): Promise<LiveOpening[]> {
  return liveOpeningsIn(tx, ctx, { taxYear, ...(employeeIds ? { employeeIds } : {}) });
}

// ═════════════ ด่าน ═════════════
type Gate = { userId: string; isOwner: boolean };
async function gateOf(ctx: Ctx, viewer: OpeningViewer | null | undefined): Promise<Gate | null> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string" || !ID_RE.test(ctx.tenantId) || !ID_RE.test(ctx.systemId)) return null;
  if (!(await canUseFilings(ctx, viewer))) return null;
  // canUseFilings ผ่าน ⇒ บทบาทในฐาน = viewer.role · userId = เจ้าของสมาชิกภาพนั้น
  return { userId: String(viewer!.userId), isOwner: viewer!.role === "OWNER" };
}
/** พนักงานของระบบนี้ (ไม่พบ = NO) · ไม่ใช่ OWNER + แถวของตัวเอง = OWN · คืนวันเริ่มงาน (กติกา asOf ≥ วันเริ่มงาน) */
async function employeeGate(ctx: Ctx, g: Gate, employeeIds: string[]): Promise<OpeningFail | Map<string, string | null>> {
  if (!employeeIds.length || employeeIds.some((e) => !ID_RE.test(e))) return NO();
  const uniq = [...new Set(employeeIds)];
  const emps = await tenantDb(ctx).hrEmployee.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: uniq } }, select: { id: true, linkedUserId: true, startDate: true } });
  if (emps.length !== uniq.length) return NO();
  const own = emps.find((e) => e.linkedUserId === g.userId);
  if (own && !g.isOwner) return fail("OWN", own.id);
  return new Map(emps.map((e) => [e.id, dayOf(e.startDate)]));
}

// ═════════════ รายชื่อ ═════════════
export async function listOpeningYtd(ctx: Ctx, viewer: OpeningViewer, input: { taxYear: unknown }, opts?: Opts): Promise<{ ok: true; taxYear: number; rows: OpeningRowDto[]; truncated: boolean } | OpeningFail> {
  if (!(await gateOf(ctx, viewer))) return NO();
  const taxYear = yearOf(obj(input).taxYear);
  if (!yearOk(taxYear)) return fail("YEAR");
  const today = bkkParts(nowOf(opts)).dateStr;
  const db = tenantDb(ctx);
  const jan1 = `${taxYear}-01-01`;
  const dec31 = `${taxYear}-12-31`;
  const live = await openingsInTx(db as unknown as Db, ctx, taxYear);
  const liveOf = new Map(live.map((o) => [o.employeeId, o]));
  const found = await db.hrEmployee.findMany({
    where: {
      tenantId: ctx.tenantId, systemId: ctx.systemId,
      OR: [
        { AND: [{ OR: [{ startDate: null }, { startDate: { lte: new Date(`${dec31}T00:00:00.000Z`) } }] }, { OR: [{ endDate: null }, { endDate: { gte: new Date(`${jan1}T00:00:00.000Z`) } }] }] },
        { id: { in: live.map((o) => o.employeeId) } },
      ],
    },
    select: { id: true, name: true, code: true, startDate: true },
    orderBy: [{ code: "asc" }, { name: "asc" }, { id: "asc" }],
    take: OPENING_LIST_MAX + 1,
  });
  // fix round F3: ไม่ตัดเงียบ — เกินเพดานแสดงธง truncated (หน้าบอกผู้ใช้)
  const truncated = found.length > OPENING_LIST_MAX;
  const emps = found.slice(0, OPENING_LIST_MAX);
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
  return { ok: true, taxYear, rows, truncated };
}

// ═════════════ บันทึก / ล้าง ═════════════
type Planned = { employeeId: string; value: OpeningInput; expectRev: number | null };
/** ตรวจ 1 แถวก่อนเปิด tx (ไม่มีฐานข้อมูล) · asOf ต้องไม่ก่อนวันเริ่มงาน (fix round MINOR-4) */
function planOf(raw: Record<string, unknown>, taxYear: number, today: string, startDay: string | null): Planned | OpeningFail {
  const employeeId = typeof raw.employeeId === "string" ? raw.employeeId : "";
  const expectRev = revOf(raw.expectRev);
  if (expectRev === undefined) return fail("FIELDS", employeeId || undefined);
  const p = parseOpening(raw, { taxYear, todayBkk: today, startDay });
  if (!p.ok) return fail(p.code, employeeId || undefined);
  return { employeeId, value: { asOfDay: p.asOfDay, months: p.months, incomeSatang: p.incomeSatang, whtSatang: p.whtSatang, ssoSatang: p.ssoSatang }, expectRev };
}
/** แถวที่ส่งมา = แถวที่ยังมีผลทุกค่า (rev ที่เห็นตรง) ⇒ ไม่เปลี่ยน (ไม่ต้องเขียน/ตรวจ) */
const sameAsLive = (raw: Record<string, unknown>, o: LiveOpening | undefined): boolean =>
  !!o && raw.expectRev === o.rev && raw.asOfDay === o.asOfDay && raw.months === o.months && raw.incomeSatang === o.incomeSatang && raw.whtSatang === o.whtSatang && raw.ssoSatang === o.ssoSatang;
/**
 * ใต้ล็อก (ผู้เรียกถือ hr50 ทุกคน → hr:ytd) — ตรวจแล้วเขียนทุกแถวด้วยคำสั่งชุดเดียว:
 * ใบ 50 ทวิ ที่ยังไม่ยกเลิก (CERT_ISSUED) → rev ที่เห็น (REV_CHANGED) → รอบที่จ่ายในช่วงยอดยกมา (OVERLAP) → ปิดแถวเดิม → แทรก rev ถัดไป → ประวัติ (ไม่มีบาท)
 * `value: null` = ล้าง (ปิดแถวเดิมอย่างเดียว · ต้องมีแถวที่มีผล rev = expectRev)
 */
async function writeManyInTx(tx: Db, ctx: Ctx, g: Gate, taxYear: number, plans: { employeeId: string; value: OpeningInput | null; expectRev: number | null }[], now: Date, by: "ONE" | "BULK" | "CLEAR"): Promise<{ employeeId: string; rev: number }[]> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const ids = plans.map((p) => p.employeeId);
  const certs = await tx.hrTaxCertificate.findMany({ where: { ...scope, employeeId: { in: ids }, taxYear, voidedAt: null }, select: { employeeId: true }, orderBy: { employeeId: "asc" } });
  if (certs.length) throw new Refused(fail("CERT_ISSUED", certs[0]!.employeeId));
  const all = await tx.hrPayrollOpeningYtd.findMany({ where: { ...scope, employeeId: { in: ids }, taxYear }, select: { id: true, rev: true, employeeId: true, supersededAt: true } });
  for (const p of plans) {
    const live = all.find((r) => r.employeeId === p.employeeId && !r.supersededAt);
    if ((live?.rev ?? null) !== p.expectRev || (p.value === null && !live)) throw new Refused(fail("REV_CHANGED", p.employeeId));
  }
  const asOfs = plans.flatMap((p) => (p.value ? [p.value.asOfDay] : []));
  if (asOfs.length) {
    // รอบที่ยังมีผล (ทุกรุ่น/สถานะ ยกเว้น REVERSED) ของปีนี้ ที่วันจ่าย (เวลาไทย) ≤ วันที่ยอดถึง และมีคนนี้ — คำสั่งเดียวทุกคน
    const maxAsOf = asOfs.reduce((a, b) => (a > b ? a : b));
    const held = await tx.hrPayrollItem.findMany({
      where: { ...scope, employeeId: { in: ids }, run: { status: { not: "REVERSED" }, payDate: { gte: bkkStartOf(`${taxYear}-01-01`), lt: bkkStartOf(nextDay(maxAsOf)) } } },
      select: { employeeId: true, run: { select: { payDate: true } } },
    });
    for (const p of plans) if (p.value && held.some((h) => h.employeeId === p.employeeId && bkkParts(h.run.payDate).dateStr <= p.value!.asOfDay)) throw new Refused(fail("OVERLAP", p.employeeId));
  }
  const liveIds = all.filter((r) => !r.supersededAt).map((r) => r.id);
  if (liveIds.length) {
    const u = await tx.hrPayrollOpeningYtd.updateMany({ where: { ...scope, id: { in: liveIds }, supersededAt: null }, data: { supersededAt: now, supersededById: g.userId } });
    if (u.count !== liveIds.length) throw new Refused(fail("REV_CHANGED", ids[0]));
  }
  const out = plans.map((p) => {
    const mine = all.filter((r) => r.employeeId === p.employeeId);
    const live = mine.find((r) => !r.supersededAt);
    return { employeeId: p.employeeId, rev: p.value ? mine.reduce((m, r) => Math.max(m, r.rev), 0) + 1 : live!.rev, value: p.value };
  });
  const adds = out.filter((o) => o.value);
  if (adds.length)
    await tx.hrPayrollOpeningYtd.createMany({
      data: adds.map((o) => ({ ...scope, employeeId: o.employeeId, taxYear, asOfDay: new Date(`${o.value!.asOfDay}T00:00:00.000Z`), months: o.value!.months, incomeSatang: o.value!.incomeSatang, whtSatang: o.value!.whtSatang, ssoSatang: o.value!.ssoSatang, rev: o.rev, createdById: g.userId, createdAt: now })),
    });
  await tx.auditLog.createMany({
    data: out.map((o) => ({
      tenantId: ctx.tenantId, actorType: "USER" as const, actorId: g.userId, action: by === "CLEAR" ? "hr.payroll.opening.clear" : "hr.payroll.opening.save", targetType: "HrEmployee", targetId: o.employeeId,
      after: (by === "CLEAR" ? { employeeId: o.employeeId, taxYear, rev: o.rev } : { employeeId: o.employeeId, taxYear, rev: o.rev, by }) as Prisma.InputJsonValue,
    })),
  });
  return out.map((o) => ({ employeeId: o.employeeId, rev: o.rev }));
}
/** เงินสมทบสูงสุดต่อเดือน ณ งวดของวันที่ยอดถึง — HR HF-SSO ▸ R2: จาก ssoLawForPeriod (ตัวเดียวกับรอบจ่ายรุ่น 1 · งวดทั้ง 12 เดือนของปีภาษีอยู่ช่วงเดียวกัน — ช่วงเริ่ม 1 ม.ค.) ◂ */
async function ssoWarnings(plans: Planned[]): Promise<Set<string>> {
  const law = new Map<string, { rateBp: number; maxBaseSatang: number } | null>();
  for (const day of new Set(plans.map((p) => p.value.asOfDay))) {
    const l = isDay(day) ? ssoLawForPeriod(day.slice(0, 7)) : null; // HR HF-SSO ◂
    law.set(day, l ? { rateBp: l.rateBp, maxBaseSatang: l.maxBaseSatang } : null);
  }
  return new Set(plans.filter((p) => ssoHigh(p.value, law.get(p.value.asOfDay) ?? null)).map((p) => p.employeeId));
}
/** คำปฏิเสธที่ต้องลงประวัติ (OVERLAP · CERT_ISSUED) — รหัสอย่างเดียว */
async function refusedAudit(ctx: Ctx, g: Gate, f: OpeningFail): Promise<void> {
  if (f.code !== "OVERLAP" && f.code !== "CERT_ISSUED") return;
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: g.userId, action: "hr.payroll.opening.refused", targetType: "HrEmployee", ...(f.employeeId ? { targetId: f.employeeId } : {}), after: { code: f.code } });
}
const pub = (f: OpeningFail, keepEmployee = false): OpeningFail => (keepEmployee && f.employeeId ? f : { ok: false, code: f.code, reason: f.reason });
/** ธุรกรรมเดียว: ล็อก → เขียน · Refused ⇒ ย้อนทั้งหมด + ประวัติคำปฏิเสธ · หมดเวลา ⇒ BUSY */
async function run<T>(ctx: Ctx, g: Gate, ids: string[], taxYear: number, fn: (tx: Db) => Promise<T>, keepEmployee: boolean): Promise<{ ok: true; v: T } | OpeningFail> {
  try {
    const v = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Db;
      await lockOpeningInTx(tx, ctx, ids, taxYear);
      return fn(tx);
    }, TX);
    return { ok: true, v };
  } catch (e) {
    if (e instanceof Refused) {
      await refusedAudit(ctx, g, e.f);
      return pub(e.f, keepEmployee);
    }
    if (isBusy(e)) return fail("BUSY");
    throw e;
  }
}

export async function saveOpeningYtd(ctx: Ctx, viewer: OpeningViewer, input: SaveOpeningInput, opts?: Opts): Promise<{ ok: true; rev: number; warnings: OpeningWarning[] } | OpeningFail> {
  const g = await gateOf(ctx, viewer);
  if (!g) return NO();
  const raw = obj(input);
  const employeeId = typeof raw.employeeId === "string" ? raw.employeeId : "";
  const eg = await employeeGate(ctx, g, [employeeId]);
  if (!(eg instanceof Map)) return pub(eg);
  const taxYear = yearOf(raw.taxYear);
  if (!yearOk(taxYear)) return fail("YEAR");
  const now = nowOf(opts);
  const p = planOf(raw, taxYear, bkkParts(now).dateStr, eg.get(employeeId) ?? null);
  if ("ok" in p) return pub(p);
  const r = await run(ctx, g, [employeeId], taxYear, (tx) => writeManyInTx(tx, ctx, g, taxYear, [p], now, "ONE"), false);
  if (!r.ok) return r;
  return { ok: true, rev: r.v[0]!.rev, warnings: (await ssoWarnings([p])).size ? ["SSO_HIGH"] : [] };
}

/**
 * ตารางเดียว · ทั้งหมดหรือไม่มีเลย (tx เดียว) · ประวัติ 1 แถวต่อคน (by BULK) · fix round F3/MINOR-2:
 * แถวที่ค่าเท่าแถวที่ยังมีผล (rev ที่เห็นตรง) = ไม่เปลี่ยน ⇒ ไม่เขียน · ไม่ตรวจ OWN · ไม่นับเพดาน — แถวที่เปลี่ยน ≤ 300
 */
export async function saveOpeningYtdBulk(ctx: Ctx, viewer: OpeningViewer, input: { taxYear: unknown; rows: unknown }, opts?: Opts): Promise<{ ok: true; saved: { employeeId: string; rev: number }[]; unchanged: number; warnings: { employeeId: string; warning: OpeningWarning }[] } | OpeningFail> {
  const g = await gateOf(ctx, viewer);
  if (!g) return NO();
  const i = obj(input);
  const list = Array.isArray(i.rows) ? (i.rows as unknown[]).map(obj) : null;
  const allIds = (list ?? []).map((r) => (typeof r.employeeId === "string" ? r.employeeId : ""));
  if (!list || list.length < 1 || list.length > OPENING_LIST_MAX || new Set(allIds).size !== allIds.length || allIds.some((e) => !ID_RE.test(e))) return fail("FIELDS");
  const taxYear = yearOf(i.taxYear);
  if (!yearOk(taxYear)) return fail("YEAR");
  const live = new Map((await openingsInTx(tenantDb(ctx) as unknown as Db, ctx, taxYear, allIds)).map((o) => [o.employeeId, o]));
  const changed = list.filter((r) => !sameAsLive(r, live.get(String(r.employeeId))));
  if (changed.length > OPENING_BULK_MAX) return fail("FIELDS");
  if (!changed.length) return { ok: true, saved: [], unchanged: list.length, warnings: [] };
  const ids = changed.map((r) => String(r.employeeId));
  const eg = await employeeGate(ctx, g, ids);
  if (!(eg instanceof Map)) return pub(eg, true);
  const now = nowOf(opts);
  const today = bkkParts(now).dateStr;
  const plans: Planned[] = [];
  for (const r of changed) {
    const p = planOf(r, taxYear, today, eg.get(String(r.employeeId)) ?? null);
    if ("ok" in p) return pub(p, true);
    plans.push(p);
  }
  plans.sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1));
  const r = await run(ctx, g, ids, taxYear, (tx) => writeManyInTx(tx, ctx, g, taxYear, plans, now, "BULK"), true);
  if (!r.ok) return r;
  const warn = await ssoWarnings(plans);
  return { ok: true, saved: r.v, unchanged: list.length - changed.length, warnings: [...warn].map((employeeId) => ({ employeeId, warning: "SSO_HIGH" as const })) };
}

export async function clearOpeningYtd(ctx: Ctx, viewer: OpeningViewer, input: { employeeId: unknown; taxYear: unknown; expectRev: unknown }, opts?: Opts): Promise<{ ok: true } | OpeningFail> {
  const g = await gateOf(ctx, viewer);
  if (!g) return NO();
  const raw = obj(input);
  const employeeId = typeof raw.employeeId === "string" ? raw.employeeId : "";
  const eg = await employeeGate(ctx, g, [employeeId]);
  if (!(eg instanceof Map)) return pub(eg);
  const taxYear = yearOf(raw.taxYear);
  if (!yearOk(taxYear)) return fail("YEAR");
  const expectRev = revOf(raw.expectRev);
  if (expectRev === undefined || expectRev === null) return fail("REV_CHANGED");
  const r = await run(ctx, g, [employeeId], taxYear, (tx) => writeManyInTx(tx, ctx, g, taxYear, [{ employeeId, value: null, expectRev }], nowOf(opts), "CLEAR"), false);
  return r.ok ? { ok: true } : r;
}

/** วันที่ "YYYY-MM-DD" ถูกต้องไหม (ใช้ซ้ำในหน้า/actions) */
export const openingDayOk = isDay;
