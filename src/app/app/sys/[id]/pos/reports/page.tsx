import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { bkkBusinessDate, isReportKind, REPORT_KINDS, REPORT_MAX_DAYS, REPORT_PERMISSION } from "@/lib/modules/pos/reports";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { ReportsClient } from "./ReportsClient";

// POS P1.17 U — หน้ารายงาน 7 ชุด (ภาพ 08 บางส่วน) · ข้อมูลทั้งหมดผ่าน report-actions (คำปฏิเสธเป็นข้อมูล)
// 🔴 สิทธิ์/ขอบเขตจริงตัดสินใน reports.ts (pos.report.view ต่อสาขา) — หน้านี้แค่เลือกสาขาที่เข้าได้ + บอกจอว่าดูได้ไหม
// 🔴 ไม่มีสิทธิ์รายงานที่สาขาใดเลย = แสดงการ์ดปฏิเสธ (ไม่ 500 · ไม่ redirect)
// สถานะอยู่ใน URL: ?kind=&from=&to=&unit= (ภาพหน้าจอจาก URL เดียวกันได้มุมมองเดียวกัน)
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
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.report");

  // ค่าเริ่ม: 7 วันล่าสุดจบที่วันนี้ (เวลาไทย) · ค่าจาก URL ที่ผิดรูป = ค่าเริ่ม (ช่วงเกิน 92 วันส่งต่อให้จอ/เซิร์ฟเวอร์ปฏิเสธเป็นข้อมูล)
  const today = bkkBusinessDate(new Date());
  const kindRaw = one(sp.kind);
  const kind = isReportKind(kindRaw) ? kindRaw : REPORT_KINDS[0];
  const fromRaw = one(sp.from);
  const toRaw = one(sp.to);
  const to = isDate(toRaw) ? toRaw : today;
  const from = isDate(fromRaw) ? fromRaw : addDays(to, -6);
  const unitRaw = one(sp.unit);
  const unitId = allowed.some((u) => u.id === unitRaw) ? unitRaw! : "";

  return (
    <div className="flex w-full min-w-0 max-w-4xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id)} data-testid="pos-report-module-tabs" />
      {allowed.length === 0 ? (
        <div role="alert" className="card text-sm text-[color:var(--color-muted)]" data-testid="pos-report-refusal">
          {t("errors.permissionDenied")}
        </div>
      ) : (
        <ReportsClient
          systemId={id}
          units={allowed}
          initial={{ kind, from, to, unitId }}
          today={today}
          maxDays={REPORT_MAX_DAYS}
        />
      )}
    </div>
  );
}
