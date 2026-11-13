import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { hrTabsFor } from "@/lib/modules/hr/ui";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { hrScopeOf, unitsForScope } from "@/lib/modules/hr/scope"; // ตัวกันของหน้า (fitness-hr F16.3) — สาขาในขอบเขตของผู้ดูสำหรับตัวกรอง
import { loadReport, reportAccessOf } from "@/lib/modules/hr/reports";
import { isReportId, periodOk, reportTextFor, REPORT_CATALOG, type ReportId } from "@/lib/modules/hr/reports-rules";
import { HrReportFullIdCard, HrReportsSection } from "@/lib/modules/hr/reports-ui";
import { thaiDateKey } from "@/lib/ui/date";

// HR H3.9 ▸ หน้า "รายงาน" ของ HR (ไม่มีแท็บใหม่ — เข้าจากการ์ดภาพรวม/ลิงก์บนหน้าภาพรวม · มติ Q7) ·
//   ?report=<รหัส>&period=<ช่วง>&unit=<สาขา> · ผู้ไม่มีรายงานใดเลย = 404 · ด่าน/คอลัมน์/แถวทั้งหมดอยู่ใน hr/reports.ts ◂
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export default async function HrReportsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ report?: string; period?: string; unit?: string; rs?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);
  const v = hrViewerOf(auth);
  const access = reportAccessOf(v);
  if (access.reports.length === 0) notFound();
  const t = await getTranslations("hr.report");
  const locale = await getLocale();
  const one = (x: unknown) => (typeof x === "string" ? x : undefined);
  const report: ReportId = isReportId(one(sp.report)) && access.reports.includes(one(sp.report) as ReportId) ? (one(sp.report) as ReportId) : access.reports[0]!;
  const today = thaiDateKey();
  const kind = REPORT_CATALOG[report].period;
  const period = periodOk(report, one(sp.period)) ? one(sp.period)! : kind === "month" ? today.slice(0, 7) : kind === "year" ? today.slice(0, 4) : today;
  const units = await unitsForScope(auth.active.tenantId, hrScopeOf(v));
  const unitId = ID_RE.test(one(sp.unit) ?? "") && units.some((u) => u.id === one(sp.unit)) ? one(sp.unit)! : null;
  const ctx = { tenantId: auth.active.tenantId, systemId: id };
  const dto = await loadReport(ctx, v, { report, period, unitId }, { locale });
  const tx = reportTextFor(locale) as unknown as Record<string, string>;
  const rs = one(sp.rs);
  const flash = rs === "ok" ? t("saved") : rs === "OWNER" ? tx.settingOwner : rs === "ACK" ? tx.ackFullId : rs ? tx.no : undefined;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("linkDesc")} back={{ href: `/app/sys/${id}`, label: sys.name }} />
      <ModuleTabs items={await hrTabsFor(id, v)} />
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <HrReportsSection systemId={id} viewer={v} allowed={access.reports} report={report} period={period} unitId={unitId} units={units} dto={dto} flash={flash} />
      {report === "register" && <HrReportFullIdCard systemId={id} tenantId={auth.active.tenantId} viewer={v} />}
    </div>
  );
}
