// staff-commission.ts — สมุดค่าคอมฯ พนักงานขาย + ส่งเข้างวดเงินเดือน HR (POS P3.5 S · R7 R8 R9 · มติ 1 2 8 9)
//
// 🔴 ผู้เขียนเดียวของ PosStaffCommission (ข้อสอบ ST3) · เงินเป็นสตางค์จำนวนเต็ม · คณิตอยู่ที่ staff-commission-shared.ts (บริสุทธิ์)
// 🔴 ตัวรับ 3 event (pos.sale.paid / .voided / .refunded) เป็น "งานหลัก" ใน outbox-consumers.ts (ล้ม = event retry · ไม่ใช่ของแถม compose) ·
//    ทุกตัวเรียก reconcileSale ใต้ pg_advisory_xact_lock ต่อบิล ⇒ ลำดับแข่ง paid ↔ void ↔ refund ได้ผลเดียวเสมอ:
//      ลงสมุด (ACCRUE) เฉพาะตอน paid และบิลยังไม่ถูก void · กลับรายการ void/คืนเงินคิดจากแถว ACCRUE ที่มี (ไม่มี = ไม่มีอะไรให้กลับ)
//    คีย์ PAID:<sale>:<line> · VOID:<sale>:<line> · REFUND:<refundSale>:<refLine> + createMany({skipDuplicates}) ⇒ เล่นซ้ำกี่รอบก็แถวเดิม
// 🔴 ไม่มี JV ของ POS (มติ 2): ค่าใช้จ่ายลงบัญชีผ่าน JV เงินเดือนของ HR ตอนอนุมัติรอบ · ค่าคอมฯ แพลตฟอร์ม (channelCommission*) ไม่เกี่ยว
// 🔴 ส่งเข้างวด (R9): เฉพาะเดือนไทยที่จบแล้ว · ต่อ (ร้าน · ผู้ใช้) ใต้ advisory lock + แถว FOR UPDATE · พนักงาน active ที่มีโปรไฟล์เงินเดือน
//    (payrollEmployeeOfUser) ไม่มี = แถวค้าง OPEN · งวดเป้าหมาย = เดือนของแถว หรือเดือนแรกถัดไปที่ยังไม่มีรอบจ่าย · สุทธิบวก = COMMISSION ·
//    ลบ = DEDUCTION (ยอด |สุทธิ|) · 0 = SENT โดยไม่มีรายการ · รายการ HR = PENDING (อนุมัติด้วยกติกา 4 ตาของ HR) · เขียน HR ผ่าน hr.requestAdjustment ใน tx เดียวกัน
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hrPayrollEmployeeOf, hrPayrollLinkedUserIds, hrPayrollRunPeriods, hrRehomeStrandedSystemAdjustments, hrRequestPayAdjustment } from "./hr-link";
import { posStaffCommission } from "./settings-shared";
import { nextPeriodKey, resolveStaffCommissionRate, staffCommissionAmount, staffCommissionBases, staffCommissionPeriodOf, staffCommissionRefundShare } from "./staff-commission-shared";

type Tx = Prisma.TransactionClient;
type Evt = { id: string; tenantId: string; payload: unknown };
type RowInput = Prisma.PosStaffCommissionCreateManyInput;

/** CD-7 · R7: ใบรับมัดจำ (POS_DEPOSIT) · บิลขายบัตรกำนัล (MEMBER · giftCardId) ไม่ใช่ยอดขายของพนักงาน */
const EXCLUDED_SOURCES: ReadonlySet<string> = new Set(["POS_DEPOSIT", "MEMBER"]);
const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;
const PUSH_BATCH = 500;
const PERIOD_HOPS_MAX = 36;

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;
const saleIdOf = (payload: unknown): string | null => {
  const p = payload && typeof payload === "object" ? (payload as { saleId?: unknown }) : null;
  return p && isId(p.saleId) ? p.saleId : null;
};

// ═══════════ R8 ตัวรับ event (งานหลัก) ═══════════
/** pos.sale.paid ⇒ ACCRUE ต่อบรรทัดที่ได้ค่าคอมฯ (+ กลับรายการของใบคืน/void ที่มาก่อนแล้ว) */
export async function staffCommissionOnSalePaid(evt: Evt): Promise<void> {
  const saleId = saleIdOf(evt.payload);
  if (saleId) await reconcileSale(evt.tenantId, saleId, true);
}
/** pos.sale.voided ⇒ REVERSE = −(ที่ยังเหลือ) ต่อบรรทัด (มีแถว ACCRUE เท่านั้น) */
export async function staffCommissionOnSaleVoided(evt: Evt): Promise<void> {
  const saleId = saleIdOf(evt.payload);
  if (saleId) await reconcileSale(evt.tenantId, saleId, false);
}
/** pos.sale.refunded ⇒ REVERSE ต่อบรรทัดที่คืนของใบคืนนั้น (ใบที่ทำให้บรรทัดคืนครบ = เศษที่เหลือ · Σ = ACCRUE พอดี) */
export async function staffCommissionOnSaleRefunded(evt: Evt): Promise<void> {
  const saleId = saleIdOf(evt.payload);
  if (saleId) await reconcileSale(evt.tenantId, saleId, false);
}

/** ทำสมุดของบิลหนึ่งใบให้ตรงสถานะปัจจุบัน (idempotent · ใต้ล็อกต่อบิล) — accrue = ลงสมุดได้ (เฉพาะตัวรับ paid) */
async function reconcileSale(tenantId: string, saleId: string, accrue: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${"pos.staffcomm.sale:"}::text || ${tenantId}::text || ':' || ${saleId}::text))) l`;
    const sale = await tx.posSale.findFirst({
      where: { id: saleId, tenantId },
      select: { id: true, tenantId: true, systemId: true, unitId: true, docType: true, status: true, sourceModule: true, giftCardId: true, soldByUserId: true, serviceChargeSatang: true, grandTotalSatang: true, paidAt: true, createdAt: true, updatedAt: true },
    });
    if (!sale || sale.docType !== "SALE") return;
    let accruals = await tx.posStaffCommission.findMany({ where: { tenantId, saleId, kind: "ACCRUE" }, orderBy: [{ lineId: "asc" }] });
    // ลงสมุดครั้งเดียวต่อบิล (ทั้งบิลใน tx เดียว) · บิลที่ถูก void ก่อนตัวรับ paid ทำงาน = ไม่ลง (CL7 · hunter: paid ↔ void)
    if (accrue && accruals.length === 0 && sale.status !== "VOIDED") {
      const rows = await accrualRows(tx, sale);
      if (rows.length) {
        await tx.posStaffCommission.createMany({ data: rows, skipDuplicates: true });
        accruals = await tx.posStaffCommission.findMany({ where: { tenantId, saleId, kind: "ACCRUE" }, orderBy: [{ lineId: "asc" }] });
      }
    }
    if (accruals.length === 0) return;
    const reversals: RowInput[] = [];
    // ── คืนเงิน (ใบ REFUND ของบิลนี้ เรียงตามเวลา) — คิดใหม่ทั้งชุดทุกครั้ง (อินพุตไม่เปลี่ยน ⇒ ผลเดิม ⇒ คีย์เดิม) ──
    const refunds = await tx.posSale.findMany({
      where: { tenantId, refSaleId: saleId, docType: "REFUND" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, paidAt: true, createdAt: true, lines: { select: { refLineId: true, qty: true, lineTotalSatang: true } } },
    });
    const lineQty = new Map((await tx.posSaleLine.findMany({ where: { saleId, tenantId }, select: { id: true, qty: true } })).map((l) => [l.id, l.qty]));
    const reversedByLine = new Map<string, number>();
    for (const acc of accruals) {
      const qtyTotal = lineQty.get(acc.lineId) ?? 0;
      let cumQty = 0;
      let prev = 0;
      for (const rf of refunds) {
        const mine = rf.lines.filter((l) => l.refLineId === acc.lineId);
        if (!mine.length) continue;
        const q = mine.reduce((t, l) => t + l.qty, 0);
        const amt = mine.reduce((t, l) => t + l.lineTotalSatang, 0);
        cumQty += q;
        const share = staffCommissionRefundShare(acc.amountSatang, acc.baseSatang, amt, prev, qtyTotal > 0 && cumQty >= qtyTotal, { q, Q: qtyTotal }); // POS P3.5 ▸ fix2 N4 ◂
        prev += share;
        if (share > 0) reversals.push(reverseRow(acc, `REFUND:${rf.id}:${acc.lineId}`, -share, staffCommissionPeriodOf(rf.paidAt ?? rf.createdAt)));
      }
      reversedByLine.set(acc.lineId, prev);
    }
    // ── ยกเลิกบิล: กลับส่วนที่ยังเหลือของทุกบรรทัด (void หลังคืนเงินทำไม่ได้อยู่แล้ว — กันไว้ด้วย "ที่เหลือ") · เดือน = เดือนของ event void ──
    if (sale.status === "VOIDED") {
      const ev = await tx.outboxEvent.findFirst({ where: { tenantId, idempotencyKey: `PosSale#${saleId}#VOIDED` }, select: { createdAt: true } });
      const pk = staffCommissionPeriodOf(ev?.createdAt ?? sale.updatedAt);
      for (const acc of accruals) {
        const left = acc.amountSatang - (reversedByLine.get(acc.lineId) ?? 0);
        if (left !== 0) reversals.push(reverseRow(acc, `VOID:${saleId}:${acc.lineId}`, -left, pk));
      }
    }
    if (reversals.length) await tx.posStaffCommission.createMany({ data: reversals, skipDuplicates: true });
  }, TX_OPTS);
}

type SaleForAccrual = { id: string; tenantId: string; systemId: string; unitId: string; status: string; sourceModule: string; giftCardId: string | null; soldByUserId: string | null; serviceChargeSatang: number; grandTotalSatang: number; paidAt: Date | null; createdAt: Date };
/** R7 — แถว ACCRUE ของบิล (ว่าง = บิลนี้ไม่มีสิทธิ์ได้ค่าคอมฯ) · อัตรา = ค่าตั้ง ณ ตอนลงสมุด (สำเนาลงทุกแถว) · บทบาท = membership ปัจจุบันของผู้ขาย */
async function accrualRows(tx: Tx, sale: SaleForAccrual): Promise<RowInput[]> {
  if (EXCLUDED_SOURCES.has(sale.sourceModule) || sale.giftCardId || !sale.soldByUserId) return [];
  const sys = await tx.appSystem.findFirst({ where: { id: sale.systemId, tenantId: sale.tenantId, type: "POS" }, select: { settings: true } });
  const cfg = posStaffCommission(sys?.settings);
  if (!cfg.enabled) return [];
  // POS P3.6 ▸ R12 มติ 10: บิลที่ผูกดีล CRM (crmDealId) ไม่ลงค่าคอมฯ พนักงาน — ค่าคอมฯ ของดีลจ่ายทาง CRM (afterPaymentCounted) · skipDealBills false = ลงทั้งคู่ ◂
  if (cfg.skipDealBills && (await tx.posSale.findFirst({ where: { id: sale.id, tenantId: sale.tenantId }, select: { crmDealId: true } }))?.crmDealId) return [];
  // ผู้ขายต้องเป็นสมาชิกของร้าน (ไม่ใช่คีย์ API — soldByUserId ของ REST = ApiKey.id) ที่บทบาทอยู่ใน sellerRoles
  const member = await tx.membership.findFirst({ where: { tenantId: sale.tenantId, userId: sale.soldByUserId, acceptedAt: { not: null } }, select: { role: true } });
  if (!member || !(cfg.sellerRoles as string[]).includes(member.role)) return [];
  const lines = await tx.posSaleLine.findMany({ where: { saleId: sale.id, tenantId: sale.tenantId }, orderBy: { id: "asc" }, select: { id: true, qty: true, lineTotalSatang: true, productId: true } });
  if (!lines.length) return [];
  const productIds = [...new Set(lines.map((l) => l.productId).filter((x): x is string => !!x))];
  const catOf = new Map(
    productIds.length ? (await tx.posProduct.findMany({ where: { tenantId: sale.tenantId, id: { in: productIds } }, select: { id: true, categoryId: true } })).map((p) => [p.id, p.categoryId]) : [],
  );
  // มติ 8 · CD-8: ฐาน = ยอดสุทธิหลังส่วนลดระดับบิล (ลำดับบรรทัดเดียวกับบัญชี/การคืนเงิน = id) · รวม VAT · ไม่รวมทิป/ค่าบริการ
  const bases = staffCommissionBases(lines.map((l) => l.lineTotalSatang), sale.serviceChargeSatang, sale.grandTotalSatang);
  const periodKey = staffCommissionPeriodOf(sale.paidAt ?? sale.createdAt);
  const out: RowInput[] = [];
  lines.forEach((l, i) => {
    const rate = resolveStaffCommissionRate(cfg, { productId: l.productId, categoryId: l.productId ? (catOf.get(l.productId) ?? null) : null });
    const base = bases[i]!;
    const amount = staffCommissionAmount(base, rate, l.qty);
    if (amount <= 0) return;
    out.push({
      tenantId: sale.tenantId,
      systemId: sale.systemId,
      unitId: sale.unitId,
      saleId: sale.id,
      lineId: l.id,
      userId: sale.soldByUserId!,
      kind: "ACCRUE",
      sourceKey: `PAID:${sale.id}:${l.id}`,
      baseSatang: base,
      rateBp: rate.bp,
      fixedSatang: rate.fixedSatang,
      amountSatang: amount,
      periodKey,
      status: "OPEN",
    });
  });
  return out;
}

function reverseRow(acc: { tenantId: string; systemId: string; unitId: string; saleId: string; lineId: string; userId: string; baseSatang: number; rateBp: number; fixedSatang: number }, sourceKey: string, amountSatang: number, periodKey: string): RowInput {
  return {
    tenantId: acc.tenantId,
    systemId: acc.systemId,
    unitId: acc.unitId,
    saleId: acc.saleId,
    lineId: acc.lineId,
    userId: acc.userId,
    kind: "REVERSE",
    sourceKey,
    baseSatang: acc.baseSatang,
    rateBp: acc.rateBp,
    fixedSatang: acc.fixedSatang,
    amountSatang,
    periodKey,
    status: "OPEN",
  };
}

// ═══════════ R9 ส่งเข้างวดเงินเดือน (รอบรายชั่วโมง minute-jobs + ปุ่มของเจ้าของ) ═══════════
export type StaffCommissionSyncResult = { ok: true; users: number; adjustments: number; sentRows: number; noEmployee: number; failed: number; stoppedEarly: boolean; /** POS P3.5 ▸ fix2 N1 ◂ */ rehomed: number };

/**
 * ส่งแถว OPEN ของเดือนไทยที่จบแล้ว (periodKey < เดือนของ now) เข้างวดเงินเดือน HR — ทั้งระบบ หรือร้านเดียว (tenantId) ·
 * หยุดเมื่อถึง deadline (ms epoch · รอบหลังทำต่อ) · ทำซ้ำ/พร้อมกันได้ผลเดียว (ล็อกต่อผู้ใช้ + ตรวจสถานะ OPEN ใต้ FOR UPDATE)
 */
export async function syncStaffCommissionToPayroll(input: { tenantId?: string; now: Date; deadline: number }): Promise<StaffCommissionSyncResult> {
  const now = input?.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now : new Date();
  const deadline = typeof input?.deadline === "number" && Number.isFinite(input.deadline) ? input.deadline : Date.now() + 20_000;
  const current = staffCommissionPeriodOf(now);
  const res: StaffCommissionSyncResult = { ok: true, users: 0, adjustments: 0, sentRows: 0, noEmployee: 0, failed: 0, stoppedEarly: false, rehomed: 0 };
  // POS P3.5 ▸ fix3 N8: ตัวกวาดมีเวลาของตัวเอง = max(25% ของงบที่เหลือ, 5 วินาที) — รอบส่งใช้ได้ถึง pushDeadline เท่านั้น ◂
  const sweepSliceMs = Math.max(Math.floor(Math.max(0, deadline - Date.now()) * 0.25), 5_000);
  const pushDeadline = deadline - sweepSliceMs;
  // POS P3.5 ▸ fix2 N2 = R1-F1: คู่ (ร้าน · ผู้ใช้) ด้วย SELECT DISTINCT ของฐาน (ไม่อ่านทุกแถวเข้าหน่วยความจำ) · เฉพาะร้านที่มีระบบ HR ·
  //   เรียงด้วย md5(ร้าน:ผู้ใช้:ชั่วโมง) ⇒ ลำดับหมุนทุกชั่วโมง · keyset ทีละหน้าจนหมดหรือถึง deadline · กรองผู้ใช้ด้วย activeLinkedUserIds ของ HR
  //   ก่อนทำงานรายคู่ ⇒ คู่ที่ค้างถาวร (ไม่มีพนักงาน/โปรไฟล์) ไม่กินคิวของคู่ข้างหลัง ◂
  const salt = String(Math.floor(now.getTime() / 3_600_000));
  const onlyTenant = isId(input?.tenantId) ? input.tenantId : null;
  let cursor: string | null = null;
  for (;;) {
    if (Date.now() >= pushDeadline) {
      res.stoppedEarly = true;
      break;
    }
    const page: { tenantId: string; userId: string; h: string }[] = await prisma.$queryRaw<{ tenantId: string; userId: string; h: string }[]>`
      SELECT DISTINCT c."tenantId", c."userId", md5(c."tenantId" || ':' || c."userId" || ':' || ${salt}) AS h
      FROM "PosStaffCommission" c
      WHERE c.status = 'OPEN' AND c."periodKey" < ${current}
        AND (${onlyTenant}::text IS NULL OR c."tenantId" = ${onlyTenant}::text)
        AND EXISTS (SELECT 1 FROM "AppSystem" s WHERE s."tenantId" = c."tenantId" AND s.type = 'HR')
        AND (${cursor}::text IS NULL OR md5(c."tenantId" || ':' || c."userId" || ':' || ${salt}) > ${cursor}::text)
      ORDER BY h
      LIMIT ${PUSH_BATCH}`;
    if (!page.length) break;
    cursor = page[page.length - 1]!.h;
    const byTenant = new Map<string, string[]>();
    for (const x of page) byTenant.set(x.tenantId, [...(byTenant.get(x.tenantId) ?? []), x.userId]);
    const linked = new Map<string, Set<string>>();
    for (const [tenantId, users] of byTenant) {
      try {
        linked.set(tenantId, await hrPayrollLinkedUserIds(tenantId, users));
      } catch (e) {
        res.failed++;
        console.error(`[pos/staff-commission] linked ${tenantId} ${(e as { name?: string })?.name ?? "Error"}`);
      }
    }
    for (const { tenantId, userId } of page) {
      if (Date.now() >= pushDeadline) {
        res.stoppedEarly = true;
        break;
      }
      const set = linked.get(tenantId);
      if (!set) continue; // อ่านไม่ได้ทั้งร้าน (นับใน failed แล้ว) — รอบหน้า
      if (!set.has(userId)) {
        res.noEmployee++; // ยังไม่ผูกพนักงาน HR ที่มีโปรไฟล์เงินเดือน — แถวค้าง OPEN · รายงาน noEmployee
        continue;
      }
      res.users++;
      try {
        const emp = await hrPayrollEmployeeOf(tenantId, userId); // POS P3.5 ▸ fix2 N7: อ่าน HR ใน try ต่อคู่ — ร้านหนึ่งล้มไม่หยุดทั้งรอบ ◂
        if (!emp) {
          res.noEmployee++;
          continue;
        }
        const r = await pushUser(tenantId, userId, emp, current);
        res.adjustments += r.adjustments;
        res.sentRows += r.sentRows;
      } catch (e) {
        res.failed++;
        console.error(`[pos/staff-commission] push ${tenantId} ${(e as { name?: string })?.name ?? "Error"}: ${String((e as Error)?.message ?? "").slice(0, 160)}`);
      }
    }
    if (res.stoppedEarly || page.length < PUSH_BATCH) break;
  }
  // POS P3.5 ▸ fix2 N1 + fix3 N8: รายการที่ส่งไปแล้วแต่งวดของมันเพิ่งมีรอบจ่าย (ก่อนอนุมัติ / ก่อนผูกโปรไฟล์) ⇒ HR ย้ายไปงวดแรกที่ว่าง —
  //   ร้านที่เคยส่งเข้า HR (แถว SENT ที่มีรายการ) และยังมีระบบ HR · ลำดับ md5(ร้าน:ชั่วโมง) แบบ keyset (เกลือเดียวกับรอบส่ง) จนถึง deadline ·
  //   ล้มร้านหนึ่งไม่หยุดร้านอื่น ◂
  let sweepCursor: string | null = null;
  let sweepStopped = false;
  for (;;) {
    if (Date.now() >= deadline) {
      res.stoppedEarly = sweepStopped = true;
      break;
    }
    const tenants: { tenantId: string; h: string }[] = onlyTenant
      ? [{ tenantId: onlyTenant, h: "" }]
      : await prisma.$queryRaw<{ tenantId: string; h: string }[]>`
          SELECT DISTINCT c."tenantId", md5(c."tenantId" || ':' || ${salt}) AS h
          FROM "PosStaffCommission" c
          WHERE c.status = 'SENT' AND c."hrPayAdjustmentId" IS NOT NULL
            AND EXISTS (SELECT 1 FROM "AppSystem" s WHERE s."tenantId" = c."tenantId" AND s.type = 'HR')
            AND (${sweepCursor}::text IS NULL OR md5(c."tenantId" || ':' || ${salt}) > ${sweepCursor}::text)
          ORDER BY h
          LIMIT ${PUSH_BATCH}`;
    if (!tenants.length) break;
    sweepCursor = tenants[tenants.length - 1]!.h;
    for (const { tenantId } of tenants) {
      if (Date.now() >= deadline) {
        res.stoppedEarly = sweepStopped = true;
        break;
      }
      try {
        res.rehomed += await hrRehomeStrandedSystemAdjustments(tenantId);
      } catch (e) {
        res.failed++;
        console.error(`[pos/staff-commission] rehome ${tenantId} ${(e as { name?: string })?.name ?? "Error"}`);
      }
    }
    if (onlyTenant || sweepStopped || tenants.length < PUSH_BATCH) break;
  }
  return res;
}

async function pushUser(tenantId: string, userId: string, emp: { employeeId: string; systemId: string }, current: string): Promise<{ adjustments: number; sentRows: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${"pos.staffcomm.push:"}::text || ${tenantId}::text || ':' || ${userId}::text))) l`;
    const rows = await tx.$queryRaw<{ id: string; periodKey: string; amountSatang: number; saleId: string }[]>`
      SELECT id, "periodKey", "amountSatang", "saleId" FROM "PosStaffCommission"
      WHERE "tenantId" = ${tenantId} AND "userId" = ${userId} AND status = 'OPEN' AND "periodKey" < ${current}
      ORDER BY "periodKey", id FOR UPDATE`;
    if (!rows.length) return { adjustments: 0, sentRows: 0 };
    const hrCtx = { tenantId, systemId: emp.systemId };
    const runs = new Set(await hrPayrollRunPeriods(hrCtx, tx));
    const freeFrom = (pk: string) => {
      let p = pk;
      for (let i = 0; i < PERIOD_HOPS_MAX && runs.has(p); i++) p = nextPeriodKey(p);
      return p;
    };
    // POS P3.5 ▸ fix2 N3: งวดเป้าหมายไม่ย้อนไปก่อนประวัติรอบจ่าย = max(งวดว่างแรกตั้งแต่เดือนของแถว, เดือนถัดจากรอบล่าสุด)
    //   (เดือนเก่าที่ไม่มีรอบ ขณะที่เดือนหลังมีรอบแล้ว = งวดที่ HR จะไม่มีวันรัน) ◂
    // POS P3.5 ▸ fix3 N9: เพดานล่างนับเฉพาะรอบที่งวด ≤ เดือนไทยปัจจุบัน — รอบล่วงหน้าไม่ดันงวด (freeFrom + PERIOD_CLOSED ยังข้ามงวดที่มีรอบให้) ◂
    const lastRun = [...runs].filter((k) => k <= current).sort().pop();
    const floor = lastRun ? nextPeriodKey(lastRun) : null;
    const targetOf = (pk: string) => {
      const t = freeFrom(pk);
      return floor && floor > t ? floor : t;
    };
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const t = targetOf(r.periodKey);
      groups.set(t, [...(groups.get(t) ?? []), r]);
    }
    let adjustments = 0;
    let sentRows = 0;
    const sentAt = new Date();
    for (const [target, list] of groups) {
      const net = list.reduce((t, r) => t + Number(r.amountSatang), 0);
      let adjId: string | null = null;
      if (net !== 0) {
        const months = [...new Set(list.map((r) => r.periodKey))].sort().join(",");
        const bills = new Set(list.map((r) => r.saleId)).size;
        let period = target;
        for (let hop = 0; ; hop++) {
          const a = await hrRequestPayAdjustment(
            hrCtx,
            { employeeId: emp.employeeId, periodKey: period, kind: net > 0 ? "COMMISSION" : "DEDUCTION", amountSatang: Math.abs(net), note: `ค่าคอมฯ ขายหน้าร้าน (POS) · ${bills} บิล · ${months}`, requestedById: null },
            tx,
          );
          if (a.ok && a.id) {
            adjId = a.id;
            break;
          }
          // แข่งกับการสร้างรอบจ่าย: งวดเพิ่งมีรอบ ⇒ ขยับไปเดือนถัดไปที่ว่าง
          if (a.code === "PERIOD_CLOSED" && hop < PERIOD_HOPS_MAX) {
            period = nextPeriodKey(period);
            continue;
          }
          throw new Error(`HR ปฏิเสธรายการปรับเงิน: ${a.reason ?? a.code ?? "?"}`);
        }
        adjustments++;
      }
      const n = await tx.posStaffCommission.updateMany({
        where: { tenantId, userId, status: "OPEN", id: { in: list.map((r) => r.id) } },
        data: { status: "SENT", sentAt, hrSystemId: emp.systemId, hrPayAdjustmentId: adjId },
      });
      if (n.count !== list.length) throw new Error("แถวค่าคอมฯ เปลี่ยนระหว่างส่ง — ลองใหม่รอบหน้า");
      sentRows += n.count;
    }
    return { adjustments, sentRows };
  }, TX_OPTS);
}
