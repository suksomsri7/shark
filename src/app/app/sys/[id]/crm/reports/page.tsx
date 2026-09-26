import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import CrmReportTabPage from "./[tab]/page";

// รายงาน CRM — แท็บ "ภาพรวม" (ใบ C3.1 · ภาพ 09) · `/app/sys/{id}/crm/reports`
// 🔴 404-not-403 (ด่านเดียวกับหน้าแท็บ · กติกาถาวร R-E.14 ของ C1.11-S6.10 = ทุก page.tsx ของ CRM v2 เรียก requireCrmV2Page เอง):
//    ระบบ type: "CRM" ของร้านนี้ → requireCrmV2Page → crmCan(actor, "crm.report.view") → ไม่ผ่าน = notFound()
//    แล้วค่อยส่งแท็บ overview เข้าหน้าแท็บ (ซึ่งตรวจซ้ำอีกชั้น — สองทางเข้า ด่านเท่ากัน)
export default async function CrmReportsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" }, select: { id: true } });
  if (!sys) notFound();
  await requireCrmV2Page({ tenantId, systemId: id });
  if (!crmCan(toMemberActor(auth.user.id, auth.active), "crm.report.view")) notFound();
  return CrmReportTabPage({ params: Promise.resolve({ id, tab: "overview" }), searchParams });
}
