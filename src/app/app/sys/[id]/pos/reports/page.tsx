import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server"; // POS P3.9U ▸ + getLocale ◂
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, canViewPayroll, evaluate } from "@/lib/core/rbac"; // POS P3.5U ▸ + canViewPayroll (แท็บค่าคอมฯ · มติ 8) ◂
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { ANOMALY_PERMISSION, HOURLY_MAX_DAYS, isReportKind, REPORT_MAX_DAYS, REPORT_PERMISSION } from "@/lib/modules/pos/reports"; // POS P2.12U ▸ + HOURLY_MAX_DAYS ANOMALY_PERMISSION ◂
import { posAnomalyThresholds, posCreditSettings, posDayCutoffMinutes } from "@/lib/modules/pos/settings-shared"; // POS P2.12U ▸ มติ 2 4 5 ◂ · POS P3.6U ▸ + posCreditSettings (แท็บลูกหนี้) ◂
import { posBusinessToday } from "@/lib/modules/pos/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { ReportsClient } from "./ReportsClient";
import { AiBriefPanel } from "./AiBriefPanel"; // POS P3.9U ▸ มติ 1 ◂
import { posBoardSettings } from "@/lib/modules/pos/board-settings-shared"; // POS P3.8U ▸ CD-P38U-7/8: บอร์ดงานเปิดไหม (ตัวอ่านบริสุทธิ์) ◂

// POS P1.17 U — หน้ารายงาน 7 ชุด (ภาพ 08 บางส่วน) · ข้อมูลทั้งหมดผ่าน report-actions (คำปฏิเสธเป็นข้อมูล)
// 🔴 สิทธิ์/ขอบเขตจริงตัดสินใน reports.ts (pos.report.view ต่อสาขา) — หน้านี้แค่เลือกสาขาที่เข้าได้ + บอกจอว่าดูได้ไหม
// 🔴 ไม่มีสิทธิ์รายงานที่สาขาใดเลย = แสดงการ์ดปฏิเสธ (ไม่ 500 · ไม่ redirect)
// สถานะอยู่ใน URL: ?kind=&from=&to=&unit= (ภาพหน้าจอจาก URL เดียวกันได้มุมมองเดียวกัน)
// R4 (ภาพ 08): ค่าเริ่ม = kind=overview (แดชบอร์ด) ช่วง "วันนี้" · ชนิดตาราง 7 ชุดยังเป็น 7 วันล่าสุดเหมือนเดิม · กรอบกว้าง max-w-7xl (แดชบอร์ด 5 KPI แบบ CRM v2)
// R2 F1: Date.parse ก่อน toISOString — ค่าอย่าง 2026-13-01 ใน URL เคยโยน RangeError (หน้า 500) · ตอนนี้ตกเป็นค่าปริยาย
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function PosReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string | string[]; from?: string | string[]; to?: string | string[]; unit?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const m = posMembership(auth.active);
  const units = (await posUnits(tenantId, id)).filter((u) => canAccessUnit(m, u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (units.length === 0) notFound();
  // สาขาที่ดูรายงานได้ (pos.report.view) — เลือกได้เฉพาะชุดนี้ · ว่าง = การ์ดปฏิเสธ
  const allowed = units.filter((u) => evaluate(m, { module: "pos", action: REPORT_PERMISSION, unitId: u.id }));
  // POS P2.12U ▸ มติ 4: แท็บจุดผิดปกติ = มี pos.report.anomaly ที่สาขาใดสาขาหนึ่งในชุดที่ดูรายงานได้ (ตัวอ่านตรวจซ้ำต่อสาขา) ·
  //   มติ 5: เกณฑ์ป้ายส่วนลดสูงของการ์ดพนักงาน = กฎ A3 ของระบบ (ปิดการตรวจ = ไม่มีป้าย) ◂
  const canAnomaly = allowed.some((u) => evaluate(m, { module: "pos", action: ANOMALY_PERMISSION, unitId: u.id }));
  const anomaly = posAnomalyThresholds(sys.settings);
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.report");

  // ค่าเริ่ม: ภาพรวม = วันนี้ · ชนิดตาราง = 7 วันล่าสุดจบที่วันนี้ (เวลาไทย) · ค่าจาก URL ที่ผิดรูป = ค่าเริ่ม (ช่วงเกิน 92 วันส่งต่อให้จอ/เซิร์ฟเวอร์ปฏิเสธเป็นข้อมูล)
  // POS P1.18U ▸ มติ 10c: "วันนี้" = วันธุรกิจตามเวลาตัดวันของระบบ (posBusinessToday · deviation 9 ของ P1.18 S) ◂
  const today = await posBusinessToday({ tenantId, systemId: id });
  const kindRaw = one(sp.kind);
  const kind = isReportKind(kindRaw) ? kindRaw : kindRaw === "reconcile" ? ("reconcile" as const) : "overview"; // POS P3-SKEL U ▸ CD-SKELU-10: ?kind=reconcile (ไม่ใช่ ReportKind) ◂
  const fromRaw = one(sp.from);
  const toRaw = one(sp.to);
  const to = isDate(toRaw) ? toRaw : today;
  const from = isDate(fromRaw) ? fromRaw : kind === "overview" ? to : addDays(to, -6);
  const unitRaw = one(sp.unit);
  const unitId = allowed.some((u) => u.id === unitRaw) ? unitRaw! : "";

  return (
    <div className="flex w-full min-w-0 max-w-7xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id, await getTranslations("pos"))} data-testid="pos-report-module-tabs" />
      {allowed.length === 0 && kind === "reconcile" ? (
        // POS P3-SKEL U ▸ CD-SKELU-10: ?kind=reconcile โดยไม่มีสิทธิ์รายงานที่สาขาใด = การ์ดปฏิเสธของรายงานกระทบยอด (ไม่เรียกเซิร์ฟเวอร์) ◂
        <div role="alert" className="card text-sm text-[color:var(--color-muted)]" data-testid="pos-reports-reconcile-denied">
          {t("reconcile.denied")}
        </div>
      ) : allowed.length === 0 && kind === "credit" ? (
        // POS P3.6U ▸ CD-P36U-9: ?kind=credit โดยไม่มีสิทธิ์รายงาน = การ์ดปฏิเสธของรายงานลูกหนี้ (ไม่เรียกเซิร์ฟเวอร์) ◂
        <div role="alert" className="card text-sm text-[color:var(--color-muted)]" data-testid="pos-reports-credit-denied">
          {t("credit.denied")}
        </div>
      ) : allowed.length === 0 ? (
        <div role="alert" className="card text-sm text-[color:var(--color-muted)]" data-testid="pos-report-refusal">
          {kind === "commission" ? t("commission.denied") /* POS P3.5U ▸ มติ 8: ?kind=commission ไม่มีสิทธิ์รายงาน = ข้อความของรายงานค่าคอมฯ ◂ */ : t("errors.permissionDenied")}
        </div>
      ) : (
        <ReportsClient
          systemId={id}
          units={allowed}
          initial={{ kind, from, to, unitId }}
          today={today}
          maxDays={REPORT_MAX_DAYS}
          hourlyMaxDays={HOURLY_MAX_DAYS} // POS P2.12U ▸ มติ 2 ◂
          cutoffMinutes={posDayCutoffMinutes(sys.settings)}
          canAnomaly={canAnomaly}
          discountFlagBp={anomaly.enabled ? anomaly.rules.A3.bp : null}
          canPayroll={canViewPayroll(m)} // POS P3.5U ▸ มติ 8 ◂
          creditOn={posCreditSettings(sys.settings).enabled} // POS P3.6U ▸ CD-P36U-9 ◂
          boardOn={posBoardSettings(sys.settings).enabled} // POS P3.8U ▸ CD-P38U-7/8 ◂
        />
      )}
      {/* POS P3.9U ▸ มติ 1: ภาพรวม + ไม่มี pos.report.view ที่สาขาใดเลย = แผงผู้ช่วย AI สถานะปฏิเสธใต้การ์ดปฏิเสธของหน้า (ไม่ยิง action · ไม่มีตัวเลข) ◂ */}
      {allowed.length === 0 && kind === "overview" && <AiBriefPanel systemId={id} locale={await getLocale()} refused />}
    </div>
  );
}
