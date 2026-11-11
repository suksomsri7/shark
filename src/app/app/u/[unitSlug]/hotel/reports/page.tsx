import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import {
  bookingFunnel,
  depositsReport,
  forecast30,
  getUnitKpi,
  housekeepingReport,
  isReportFail,
  occupancyReport,
  pendingAuditDays,
  revenueReport,
  type HotelReportCtx,
} from "@/lib/modules/hotel";
import ReportsScreen from "@/components/hotel/ReportsScreen";
import { isTabKey, type ReportTabKey } from "@/components/hotel/reports-shared";

// SVC H.7 ▸ จอ "รายงานโรงแรม" (ใบสั่ง h.7 §4 · PARITY โครงกับรายงานหอ) — RSC อ่านรายงานตรงจาก facade (ไม่มี action)
//   ด่าน: requireUnit · หน่วยต้องเป็น "HOTEL" · สิทธิ์ hotel.reports.read (ไม่มี ⇒ notFound · ทาง ข มติ §9.8 — แท็บเห็นทุกคน หน้าตรวจเอง)
//   ?tab= (อัตราเข้าพัก/รายได้/การจอง/ล่วงหน้า 30 วัน/แม่บ้าน/มัดจำ) · ?groupBy= · ?from=&to= (ค่าผิด ⇒ 30 วันล่าสุด)
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { params: Promise<{ unitSlug: string }> } & { searchParams: Promise<SearchParams> };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");

export default async function HotelReportsPage({ params, searchParams }: PageProps) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!evaluate(m, { module: "hotel", action: "hotel.reports.read", unitId: unit.id })) notFound();
  const canAudit = evaluate(m, { module: "hotel", action: "hotel.audit.run", unitId: unit.id });

  const ctx: HotelReportCtx = { tenantId: auth.active.tenantId, actorUserId: auth.active.userId };
  const rawTab = one(sp.tab);
  const tab: ReportTabKey = isTabKey(rawTab) ? rawTab : "occupancy";
  const fromQ = one(sp.from);
  const toQ = one(sp.to);
  const range = YMD.test(fromQ) && YMD.test(toQ) && fromQ <= toQ ? { from: fromQ, to: toQ } : {};
  const groupByQ = one(sp.groupBy);
  const occGroup = groupByQ === "month" ? "month" : "day";
  const revGroup = groupByQ === "ratePlan" || groupByQ === "roomType" ? groupByQ : "source";

  let summary = await occupancyReport(ctx, { unitId: unit.id, ...range, groupBy: occGroup });
  if (isReportFail(summary) && summary.code === "INVALID_RANGE") summary = await occupancyReport(ctx, { unitId: unit.id, groupBy: occGroup });
  if (isReportFail(summary)) notFound();
  const r = { from: summary.from, to: summary.to };
  const [kpi, pending, revenue, funnel, forecast, housekeeping, deposits] = await Promise.all([
    getUnitKpi(unit.id),
    canAudit ? pendingAuditDays({ tenantId: auth.active.tenantId }, { unitId: unit.id }) : Promise.resolve(null),
    tab === "revenue" ? revenueReport(ctx, { unitId: unit.id, ...r, groupBy: revGroup }) : Promise.resolve(null),
    tab === "funnel" ? bookingFunnel(ctx, { unitId: unit.id, ...r }) : Promise.resolve(null),
    tab === "forecast" ? forecast30(ctx, { unitId: unit.id }) : Promise.resolve(null),
    tab === "housekeeping" ? housekeepingReport(ctx, { unitId: unit.id, ...r }) : Promise.resolve(null),
    tab === "deposits" ? depositsReport(ctx, { unitId: unit.id, ...r }) : Promise.resolve(null),
  ]);

  return (
    <ReportsScreen
      base={`/app/u/${unitSlug}`}
      tab={tab}
      from={r.from}
      to={r.to}
      groupBy={tab === "revenue" ? revGroup : occGroup}
      canAudit={canAudit}
      pendingAudit={pending && pending.ok && pending.started && pending.daysBehind > 0 ? pending.pendingDate : null}
      kpi={kpi}
      summary={summary.total}
      occupancy={tab === "occupancy" ? summary : null}
      revenue={revenue && revenue.ok ? revenue : null}
      funnel={funnel && funnel.ok ? funnel : null}
      forecast={forecast && forecast.ok ? forecast : null}
      housekeeping={housekeeping && housekeeping.ok ? housekeeping : null}
      deposits={deposits && deposits.ok ? deposits : null}
    />
  );
}
