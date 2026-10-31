import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormReportModel, type DormReportRange } from "@/lib/modules/dorm";
import DormReports from "@/components/dorm/DormReports";
import { exportDormReportCsvAction } from "./actions";

// SVC D.19 ▸ จอ "รายงานหอ" (ภาพ ledger/design-dorm/14-dorm-reports.png เฉพาะส่วนพื้นฐาน) — ใบสั่ง ledger/svc-briefs/svc-brief-d.19.md §5.1
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · dormReportModel ตรวจ Membership สด + dorm.view + เห็นเงิน + ขอบเขตอาคารเอง (ไม่ผ่าน ⇒ 404)
//   ช่วงจาก ?range= (ค่าไม่รู้จัก ⇒ 6M) · อ่านอย่างเดียว
export const dynamic = "force-dynamic";

const RANGES: readonly DormReportRange[] = ["MONTH", "6M", "YEAR"];

export default async function DormReportsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const raw = typeof sp.range === "string" ? sp.range : "";
  const range = RANGES.find((r) => r === raw) ?? "6M";
  const model = await dormReportModel({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, range });
  if (!model.ok) notFound();

  return <DormReports model={model} unitSlug={unitSlug} actions={{ exportCsv: exportDormReportCsvAction.bind(null, unitSlug) }} />;
}
