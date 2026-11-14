// deposits-points.ts — เงินประกันหอพัก (I4) + แต้มสะสมคงค้าง ณ วันสิ้นงวด (I9) · ACC T4.8 · อ่านอย่างเดียว
//
// เงินประกันหอ: คำสั่ง ป.73/2541 ข้อ 3(2) — ไม่ถือเป็นรายได้เมื่อ ≤ 6 เท่าของค่าเช่ารายเดือน + สัญญา ≤ 3 ปี + ต้องคืนทันทีเมื่อสัญญาสิ้นสุด [V]
//   (skill domain-shark-accounting-cases §2.2 · ตัวเลข 6 และ 3 อยู่ในตารางค่ากฎหมาย DORM_DEPOSIT_MAX_RENT_MULTIPLE / DORM_DEPOSIT_MAX_CONTRACT_YEARS · ร้านทับได้)
//   ผู้ให้เช่าบุคคลธรรมดา / สัญญาต่ออายุรวมเกิน 3 ปี [U] · ตัวตรวจหอพักแบบเข้ม (th-rental-2568) ไม่แตะ — รายงานนี้เป็นฝั่งบัญชีเท่านั้น
// แต้มคงค้าง: NPAEs 18.31 เลือกตั้งหนี้สิน/รับรู้ตอนใช้ [V] · ภาษี ม.65 ตรี (1) ปรับใช้กับแต้ม [U] — ระบบสมาชิกต้องให้ยอดคงค้างเป็นบาท ณ สิ้นงวด (§3.4)
import { tenantDb } from "@/lib/core/db";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { complianceValueFrom, loadBookLegal } from "./legal-values";
import { isJuristicPayer } from "@/lib/core/settings/legal/th-tax-2569";

const ymd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type DormDepositRow = {
  leaseId: string;
  unitId: string;
  unitName: string;
  roomNumber: string;
  status: string;
  startDate: string;
  endDate: string | null;
  contractMonths: number | null;
  /** ต่อสัญญามาจากสัญญาก่อน — รวมระยะทั้งสายเป็นเดือน */
  chainMonths: number | null;
  rentSatang: number;
  depositSatang: number;
  multiple: number | null;
  overMultiple: boolean;
  overYears: boolean;
  warnings: LegalWarning[];
};

const monthsBetween = (a: Date, b: Date) => Math.round(((b.getTime() - a.getTime()) / 86_400_000) * (12 / 365.25));

/** สัญญาหอพัก (ร่าง/มีผล/แจ้งออก) ของหน่วยหอที่ผูกสมุดนี้ + ตัวตรวจ 6 เท่า / 3 ปี ณ วันที่ */
export async function dormDepositReport(ctx: { tenantId: string; systemId: string }, asOf: Date): Promise<{ rows: DormDepositRow[]; maxMultiple: number; maxYears: number; flagged: number; warnings: LegalWarning[] }> {
  const legal = await loadBookLegal(ctx);
  const mult = complianceValueFrom(legal, "DORM_DEPOSIT_MAX_RENT_MULTIPLE", asOf);
  const yrs = complianceValueFrom(legal, "DORM_DEPOSIT_MAX_CONTRACT_YEARS", asOf);
  const maxMultiple = mult.value ?? 6;
  const maxYears = yrs.value ?? 3;
  const tdb = tenantDb({ tenantId: ctx.tenantId });
  const links = await tenantDb(ctx).accountSystemLink.findMany({ where: { linkedKind: "BUSINESS", archivedAt: null, enabled: true }, select: { linkedId: true } });
  const units = links.length ? await tdb.businessUnit.findMany({ where: { id: { in: links.map((l) => l.linkedId) }, type: "DORM" }, select: { id: true, name: true } }) : [];
  const rows: DormDepositRow[] = [];
  for (const u of units) {
    const udb = tenantDb({ tenantId: ctx.tenantId, unitId: u.id });
    const leases = await udb.dormLease.findMany({
      where: { status: { in: ["DRAFT", "ACTIVE", "NOTICE"] } },
      select: { id: true, status: true, startDate: true, endDate: true, rentSatang: true, depositSatang: true, previousLeaseId: true, room: { select: { number: true } } },
      orderBy: { startDate: "asc" },
    });
    for (const l of leases) {
      const months = l.endDate ? monthsBetween(l.startDate, l.endDate) : null;
      // สายต่อสัญญา: เดินย้อน previousLeaseId (สูงสุด 20 ขั้น)
      let chainStart = l.startDate;
      let prev = l.previousLeaseId;
      for (let i = 0; prev && i < 20; i++) {
        const p = await udb.dormLease.findFirst({ where: { id: prev }, select: { startDate: true, previousLeaseId: true } });
        if (!p) break;
        chainStart = p.startDate;
        prev = p.previousLeaseId;
      }
      const chainMonths = l.previousLeaseId && l.endDate ? monthsBetween(chainStart, l.endDate) : null;
      const multiple = l.rentSatang > 0 ? Math.round((l.depositSatang / l.rentSatang) * 100) / 100 : null;
      const overMultiple = multiple !== null && multiple > maxMultiple;
      const overYears = months !== null && months > maxYears * 12;
      const label = `ห้อง ${l.room?.number ?? "-"} (${u.name})`;
      const warnings: LegalWarning[] = [];
      if (overMultiple) warnings.push(legalWarning("DORM_DEPOSIT_OVER_MULTIPLE", { lease: label, deposit: baht(l.depositSatang), rent: baht(l.rentSatang), max: maxMultiple, years: maxYears }, mult.origin === "SHOP" && mult.row ? { citation: mult.row.source } : {}));
      if (overYears) warnings.push(legalWarning("DORM_DEPOSIT_LONG_CONTRACT", { lease: label, months: months!, years: maxYears }));
      if (chainMonths !== null && chainMonths > maxYears * 12 && !overYears) warnings.push(legalWarning("DORM_DEPOSIT_UNVERIFIED_CASE"));
      rows.push({ leaseId: l.id, unitId: u.id, unitName: u.name, roomNumber: l.room?.number ?? "", status: l.status, startDate: ymd(l.startDate), endDate: l.endDate ? ymd(l.endDate) : null, contractMonths: months, chainMonths, rentSatang: l.rentSatang, depositSatang: l.depositSatang, multiple, overMultiple, overYears, warnings });
    }
  }
  const warnings: LegalWarning[] = [...mult.warnings, ...yrs.warnings];
  // เจ้าของหอที่เป็นบุคคลธรรมดา — แนวทางยังไม่ยืนยัน (แจ้งครั้งเดียวต่อรายงาน)
  if (rows.length && isJuristicPayer(legal.entityKind) === false) warnings.push(legalWarning("DORM_DEPOSIT_UNVERIFIED_CASE"));
  return { rows, maxMultiple, maxYears, flagged: rows.filter((r) => r.overMultiple || r.overYears).length, warnings };
}

export type PointsOutstandingRow = { pointSystemId: string; name: string; members: number; points: number; burnRateSatang: number; valueSatang: number; currentPoints: number };

/**
 * แต้มคงค้าง ณ วันสิ้นงวด (เวลาไทย 23:59:59 ของ asOf) = Σ delta ของ PointLedger ที่เกิด ≤ วันนั้น ต่อระบบแต้ม (ทุกระบบแต้มของร้าน — แต้มใช้ข้ามกิจการของร้าน)
 *   มูลค่า = แต้ม × อัตราแลก (PointSettings.burnRateSatang · สตางค์/แต้ม) · ยอดปัจจุบัน (PointBalance) แสดงคู่ไว้ตรวจ
 */
export async function pointsOutstandingAt(ctx: { tenantId: string; systemId: string }, asOfYmd: string): Promise<{ asOf: string; rows: PointsOutstandingRow[]; totalPoints: number; totalValueSatang: number; warnings: LegalWarning[] }> {
  const end = new Date(`${asOfYmd}T23:59:59.999+07:00`);
  const tdb = tenantDb({ tenantId: ctx.tenantId });
  const [systems, settings] = await Promise.all([
    tdb.appSystem.findMany({ where: { type: "POINT" }, select: { id: true, name: true } }),
    tdb.pointSettings.findFirst({ where: {}, select: { burnRateSatang: true } }),
  ]);
  const rate = settings?.burnRateSatang ?? 0;
  const rows: PointsOutstandingRow[] = [];
  for (const s of systems) {
    const pdb = tenantDb({ tenantId: ctx.tenantId, systemId: s.id });
    const [agg, members, cur] = await Promise.all([
      pdb.pointLedger.aggregate({ where: { createdAt: { lte: end } }, _sum: { delta: true } }),
      pdb.pointLedger.groupBy({ by: ["customerId"], where: { createdAt: { lte: end } }, _sum: { delta: true } }),
      pdb.pointBalance.aggregate({ where: {}, _sum: { balance: true } }),
    ]);
    const points = Math.max(0, agg._sum.delta ?? 0);
    rows.push({ pointSystemId: s.id, name: s.name, members: members.filter((m) => (m._sum.delta ?? 0) > 0).length, points, burnRateSatang: rate, valueSatang: points * rate, currentPoints: cur._sum.balance ?? 0 });
  }
  const totalPoints = rows.reduce((n, r) => n + r.points, 0);
  const totalValueSatang = rows.reduce((n, r) => n + r.valueSatang, 0);
  const warnings = totalPoints > 0 ? [legalWarning("LOYALTY_POINTS_OUTSTANDING", { asOf: asOfYmd, points: totalPoints.toLocaleString("en-US"), amount: baht(totalValueSatang) })] : [];
  return { asOf: asOfYmd, rows, totalPoints, totalValueSatang, warnings };
}
