// pos-link.ts — POS ↔ สมุดบัญชี (ACC T4.7 · J8 J7 J6 J2) · ฝั่งบัญชีอ่านตาราง POS ตรง (อ่านอย่างเดียว) · เขียนเฉพาะ JV เงินขาด/เกิน
//
//   posUnpostedBills   บิลขายของจุดขายที่ผูกสมุดนี้แต่ยังไม่มี JV ขาย (PosSale#<id>#PAID) และไม่ใช่ zero entry   — J8
//   posDailyRecon      กระทบยอดรายวัน: ยอดรับของ POS (ยอดบิล + ทิป) เทียบ Σ เดบิตของ JV ขาย · บิลที่ยังไม่ลง · ผลต่าง — J8
//   posShiftVariances  กะที่ปิดแล้วมีเงินขาด/เกิน (นับปิดกะ หรือ นับย้อนหลังของกะที่ระบบบังคับปิด) + สถานะลงบัญชี — J7
//   postPosShiftVariances  ลง JV เงินขาด/เกินของกะที่ยังไม่ลง (gl.postCashVariance · ผูกกะ · ไม่หักกลบข้ามกะ) — J7
//   posLinkWarnings    คำเตือนเครื่องบันทึกการเก็บเงิน (J2) · ทิป (J6) · บิลค้าง (J8)
// skill: domain-shark-accounting-cases §1.3 (ใบย่อลงรายงานภาษีขายรายวันภายใน 3 วันทำการ [V]) · §1.4 (ภ.พ.06 [V] · แท็บเล็ต [U]) · §1.8 ทิป · §1.9 เงินขาด/เกิน [U]
import { tenantDb } from "@/lib/core/db";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { ensureAccounting, postCashVariance } from "./gl";
import { loadBookLegal, tipTreatmentWarning } from "./legal-values";
import { vatConfigOf } from "./service";

export type PosCtx = { tenantId: string; systemId: string };

const ymd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** จุดขาย (AppSystem POS) ที่ผูกและเปิดลงบัญชีกับสมุดนี้ */
export async function linkedPosSystems(ctx: PosCtx): Promise<{ id: string; name: string; linkedAt: Date }[]> {
  const links = await tenantDb(ctx).accountSystemLink.findMany({ where: { linkedKind: "POS", archivedAt: null, enabled: true }, select: { linkedId: true, createdAt: true } });
  if (!links.length) return [];
  const sys = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findMany({ where: { id: { in: links.map((l) => l.linkedId) } }, select: { id: true, name: true } });
  const name = new Map(sys.map((s) => [s.id, s.name]));
  return links.map((l) => ({ id: l.linkedId, name: name.get(l.linkedId) ?? l.linkedId, linkedAt: l.createdAt }));
}

export type DateRange = { from: Date; to: Date };

type SaleRow = { id: string; systemId: string; unitId: string; receiptNo: string | null; status: string; grandTotalSatang: number; tipSatang: number; vatSatang: number; paidAt: Date | null; createdAt: Date };

async function salesOf(ctx: PosCtx, posIds: string[], r: DateRange): Promise<SaleRow[]> {
  const out: SaleRow[] = [];
  for (const posId of posIds) {
    out.push(
      ...(await tenantDb({ tenantId: ctx.tenantId, systemId: posId }).posSale.findMany({
        where: { docType: "SALE", status: { in: ["PAID", "REFUNDED"] }, OR: [{ paidAt: { gte: r.from, lte: r.to } }, { paidAt: null, createdAt: { gte: r.from, lte: r.to } }] },
        select: { id: true, systemId: true, unitId: true, receiptNo: true, status: true, grandTotalSatang: true, tipSatang: true, vatSatang: true, paidAt: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })),
    );
  }
  return out;
}

/** JV ขาย (PAID) ของบิลชุดหนึ่งในสมุดนี้ → Σ เดบิต ต่อบิล · zero entry = 0 */
async function postedOf(ctx: PosCtx, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 1000) {
    const part = ids.slice(i, i + 1000);
    const jvs = await tenantDb(ctx).accountJournalEntry.findMany({
      where: { idempotencyKey: { in: part.map((id) => `PosSale#${id}#PAID`) } },
      select: { refId: true, lines: { select: { debit: true } } },
    });
    for (const j of jvs) if (j.refId) out.set(j.refId, j.lines.reduce((n, l) => n + l.debit, 0));
    const zero = await tenantDb({ tenantId: ctx.tenantId }).auditLog.findMany({ where: { action: "account.external.zeroEntry", targetType: "PosSale", targetId: { in: part }, after: { path: ["bookSystemId"], equals: ctx.systemId } }, select: { targetId: true } });
    for (const z of zero) if (z.targetId && !out.has(z.targetId)) out.set(z.targetId, 0);
  }
  return out;
}

export type UnpostedBill = { saleId: string; posSystemId: string; posName: string; receiptNo: string | null; at: Date; day: string; grossSatang: number; tipSatang: number; ageDays: number; beforeLink: boolean };

export async function posUnpostedBills(ctx: PosCtx, r: DateRange, now: Date = new Date()): Promise<{ bills: UnpostedBill[]; count: number; totalSatang: number; posSystems: { id: string; name: string }[] }> {
  const pos = await linkedPosSystems(ctx);
  const sales = await salesOf(ctx, pos.map((p) => p.id), r);
  const posted = await postedOf(ctx, sales.map((s) => s.id));
  const name = new Map(pos.map((p) => [p.id, p]));
  const bills = sales
    .filter((s) => !posted.has(s.id))
    .map((s) => {
      const at = s.paidAt ?? s.createdAt;
      return { saleId: s.id, posSystemId: s.systemId, posName: name.get(s.systemId)?.name ?? s.systemId, receiptNo: s.receiptNo, at, day: ymd(at), grossSatang: s.grandTotalSatang, tipSatang: s.tipSatang, ageDays: Math.floor((now.getTime() - at.getTime()) / 86_400_000), beforeLink: at < (name.get(s.systemId)?.linkedAt ?? at) };
    });
  return { bills, count: bills.length, totalSatang: bills.reduce((n, b) => n + b.grossSatang, 0), posSystems: pos.map((p) => ({ id: p.id, name: p.name })) };
}

export type ReconDay = { day: string; bills: number; posReceivedSatang: number; postedBills: number; glDebitSatang: number; unpostedBills: number; unpostedSatang: number; differenceSatang: number };

/**
 * กระทบยอดรายวัน (วันไทยของเวลาชำระ): POS = Σ (ยอดบิล + ทิป) ของบิลขาย · บัญชี = Σ เดบิตของ JV ขาย (= เงินที่รับเข้าตามช่องทาง)
 *   ผลต่าง = POS − บัญชี · ผลต่างที่ไม่ใช่บิลค้าง = มัดจำที่หัก VAT ไปแล้ว / ทิปพนักงานรับตรง / JV ถูกแก้ — ต้องตรวจ
 */
export async function posDailyRecon(ctx: PosCtx, r: DateRange): Promise<{ days: ReconDay[]; totals: Omit<ReconDay, "day"> }> {
  const pos = await linkedPosSystems(ctx);
  const sales = await salesOf(ctx, pos.map((p) => p.id), r);
  const posted = await postedOf(ctx, sales.map((s) => s.id));
  const by = new Map<string, ReconDay>();
  for (const s of sales) {
    const d = ymd(s.paidAt ?? s.createdAt);
    const row = by.get(d) ?? { day: d, bills: 0, posReceivedSatang: 0, postedBills: 0, glDebitSatang: 0, unpostedBills: 0, unpostedSatang: 0, differenceSatang: 0 };
    row.bills++;
    row.posReceivedSatang += s.grandTotalSatang + s.tipSatang;
    if (posted.has(s.id)) {
      row.postedBills++;
      row.glDebitSatang += posted.get(s.id)!;
    } else {
      row.unpostedBills++;
      row.unpostedSatang += s.grandTotalSatang + s.tipSatang;
    }
    by.set(d, row);
  }
  const days = [...by.values()].sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ ...d, differenceSatang: d.posReceivedSatang - d.glDebitSatang }));
  const totals = days.reduce(
    (t, d) => ({ bills: t.bills + d.bills, posReceivedSatang: t.posReceivedSatang + d.posReceivedSatang, postedBills: t.postedBills + d.postedBills, glDebitSatang: t.glDebitSatang + d.glDebitSatang, unpostedBills: t.unpostedBills + d.unpostedBills, unpostedSatang: t.unpostedSatang + d.unpostedSatang, differenceSatang: t.differenceSatang + d.differenceSatang }),
    { bills: 0, posReceivedSatang: 0, postedBills: 0, glDebitSatang: 0, unpostedBills: 0, unpostedSatang: 0, differenceSatang: 0 },
  );
  return { days, totals };
}

export type ShiftVariance = {
  refType: "PosShift" | "PosShiftRecount";
  refId: string;
  shiftId: string;
  posSystemId: string;
  posName: string;
  zNumber: number | null;
  deviceLabel: string | null;
  countedById: string | null;
  countedByName: string | null;
  at: Date;
  expectedSatang: number;
  countedSatang: number;
  varianceSatang: number;
  note: string | null;
  posted: boolean;
  entryNo: string | null;
};

/** กะที่ปิดแล้ว/นับย้อนหลังที่มีผลต่าง ในช่วงวัน (เวลาปิด/เวลานับ) */
export async function posShiftVariances(ctx: PosCtx, r: DateRange): Promise<ShiftVariance[]> {
  const pos = await linkedPosSystems(ctx);
  if (!pos.length) return [];
  const ids = pos.map((p) => p.id);
  const name = new Map(pos.map((p) => [p.id, p.name]));
  const shifts: { id: string; systemId: string; zNumber: number | null; deviceLabel: string | null; closedByUserId: string | null; closedAt: Date | null; expectedCashSatang: number | null; countedCashSatang: number | null; overShortSatang: number | null; closeNote: string | null }[] = [];
  const recounts: { id: string; shiftId: string; systemId: string; zNumber: number; recountedByUserId: string; createdAt: Date; expectedCashSatang: number; countedCashSatang: number; varianceSatang: number; note: string }[] = [];
  for (const posId of ids) {
    const pdb = tenantDb({ tenantId: ctx.tenantId, systemId: posId });
    shifts.push(...(await pdb.posShift.findMany({ where: { status: "CLOSED", closedAt: { gte: r.from, lte: r.to }, overShortSatang: { not: 0 } }, select: { id: true, systemId: true, zNumber: true, deviceLabel: true, closedByUserId: true, closedAt: true, expectedCashSatang: true, countedCashSatang: true, overShortSatang: true, closeNote: true }, orderBy: { closedAt: "asc" } })));
    recounts.push(...(await pdb.posShiftRecount.findMany({ where: { createdAt: { gte: r.from, lte: r.to }, varianceSatang: { not: 0 } }, select: { id: true, shiftId: true, systemId: true, zNumber: true, recountedByUserId: true, createdAt: true, expectedCashSatang: true, countedCashSatang: true, varianceSatang: true, note: true }, orderBy: { createdAt: "asc" } })));
  }
  const keys = [...shifts.map((s) => `PosShift#${s.id}#VARIANCE`), ...recounts.map((x) => `PosShiftRecount#${x.id}#VARIANCE`)];
  const jvs = keys.length ? await tenantDb(ctx).accountJournalEntry.findMany({ where: { idempotencyKey: { in: keys } }, select: { idempotencyKey: true, docNo: true } }) : [];
  const jv = new Map(jvs.map((j) => [j.idempotencyKey, j.docNo]));
  const userIds = [...new Set([...shifts.map((s) => s.closedByUserId), ...recounts.map((x) => x.recountedByUserId)].filter((x): x is string => !!x))];
  const users = userIds.length ? await tenantDb({ tenantId: ctx.tenantId }).user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const uname = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  const out: ShiftVariance[] = [
    ...shifts.map((s) => ({
      refType: "PosShift" as const,
      refId: s.id,
      shiftId: s.id,
      posSystemId: s.systemId,
      posName: name.get(s.systemId) ?? s.systemId,
      zNumber: s.zNumber,
      deviceLabel: s.deviceLabel,
      countedById: s.closedByUserId,
      countedByName: s.closedByUserId ? uname.get(s.closedByUserId) ?? null : null,
      at: s.closedAt!,
      expectedSatang: s.expectedCashSatang ?? 0,
      countedSatang: s.countedCashSatang ?? 0,
      varianceSatang: s.overShortSatang ?? 0,
      note: s.closeNote,
      posted: jv.has(`PosShift#${s.id}#VARIANCE`),
      entryNo: jv.get(`PosShift#${s.id}#VARIANCE`) ?? null,
    })),
    ...recounts.map((x) => ({
      refType: "PosShiftRecount" as const,
      refId: x.id,
      shiftId: x.shiftId,
      posSystemId: x.systemId,
      posName: name.get(x.systemId) ?? x.systemId,
      zNumber: x.zNumber,
      deviceLabel: null,
      countedById: x.recountedByUserId,
      countedByName: uname.get(x.recountedByUserId) ?? null,
      at: x.createdAt,
      expectedSatang: x.expectedCashSatang,
      countedSatang: x.countedCashSatang,
      varianceSatang: x.varianceSatang,
      note: x.note,
      posted: jv.has(`PosShiftRecount#${x.id}#VARIANCE`),
      entryNo: jv.get(`PosShiftRecount#${x.id}#VARIANCE`) ?? null,
    })),
  ];
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** ลง JV เงินขาด/เกินของกะที่ยังไม่ลง (refIds ไม่ส่ง = ทุกกะในช่วง) · ล้มทีละกะไม่หยุดกะอื่น (เช่นงวดปิด) */
export async function postPosShiftVariances(
  ctx: PosCtx,
  r: DateRange,
  actor: { userId?: string | null },
  refIds?: readonly string[],
): Promise<{ posted: { refId: string; entryId: string }[]; skipped: number; failed: { refId: string; reason: string }[] }> {
  const list = (await posShiftVariances(ctx, r)).filter((v) => !v.posted && (!refIds || refIds.includes(v.refId)));
  if (list.length) await ensureAccounting(ctx);
  const posted: { refId: string; entryId: string }[] = [];
  const failed: { refId: string; reason: string }[] = [];
  let skipped = 0;
  for (const v of list) {
    const who = v.countedByName ? ` · นับโดย ${v.countedByName}` : "";
    const memo = `${v.varianceSatang > 0 ? "เงินเกิน" : "เงินขาด"}ปิดกะ ${v.posName}${v.zNumber ? ` Z${v.zNumber}` : ""}${v.deviceLabel ? ` · ${v.deviceLabel}` : ""}${who}${v.note ? ` · ${v.note}` : ""}${v.refType === "PosShiftRecount" ? " (นับย้อนหลัง)" : ""}`.slice(0, 300);
    try {
      const res = await postCashVariance(ctx, { refType: v.refType, refId: v.refId, date: v.at, varianceSatang: v.varianceSatang, memo, postedById: actor.userId ?? null });
      if ("entryId" in res) posted.push({ refId: v.refId, entryId: res.entryId });
      else skipped++;
    } catch (e) {
      failed.push({ refId: v.refId, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { posted, skipped, failed };
}

/** คำเตือนของหน้าเชื่อมจุดขาย: เครื่องบันทึกการเก็บเงิน (J2) · ทิป (J6) · บิลยังไม่ลง (J8) · เงินขาด/เกิน (J7) */
export async function posLinkWarnings(ctx: PosCtx, extras: { unposted?: { count: number; totalSatang: number }; variances?: number } = {}): Promise<LegalWarning[]> {
  const out: LegalWarning[] = [];
  const pos = await linkedPosSystems(ctx);
  const { vatRegistered, posAbbreviatedInvoice } = await vatConfigOf(ctx.systemId);
  if (vatRegistered && posAbbreviatedInvoice && pos.length) {
    const devices: { name: string; posRegNo: string | null }[] = [];
    for (const p of pos) devices.push(...(await tenantDb({ tenantId: ctx.tenantId, systemId: p.id }).posDevice.findMany({ where: { status: "ACTIVE" }, select: { name: true, posRegNo: true } })));
    const missing = devices.filter((d) => !d.posRegNo?.trim()).map((d) => d.name);
    out.push(legalWarning("POS_CASH_REGISTER_APPROVAL", missing.length ? { devices: missing.slice(0, 10).join(", ") } : {}));
  }
  const legal = await loadBookLegal(ctx);
  out.push(tipTreatmentWarning(legal.tipTreatment ?? "LIABILITY"));
  if (extras.unposted && extras.unposted.count > 0) out.push(legalWarning("POS_BILLS_NOT_POSTED", { count: extras.unposted.count, amount: baht(extras.unposted.totalSatang) }));
  if (extras.variances && extras.variances > 0) out.push(legalWarning("POS_SHIFT_CASH_VARIANCE", { count: extras.variances }));
  return out;
}
