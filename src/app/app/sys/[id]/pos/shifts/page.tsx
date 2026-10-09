import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { ShiftsClient } from "./ShiftsClient";

// POS P1.9 / P1.9 U — หน้ากะและลิ้นชักเงิน (ภาพ 07 + เปิดกะ 13A ส่วน A) · ข้อมูลทั้งหน้าโหลดจาก shiftsPageDataAction คำขอเดียว
//   (รหัสเครื่องอยู่ใน localStorage ของเบราว์เซอร์ ⇒ อ่านฝั่ง client) · คำปฏิเสธเป็นข้อมูล
// 🔴 สิทธิ์จริงตัดสินใน shift.ts (operate/manage) — หน้านี้แค่เลือกสาขาที่เข้าได้ + บอกจอว่าเห็นเมนูผู้จัดการไหม (manage เห็นทุกกะ · operate เห็นของตัวเอง)
export default async function PosShiftsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unit?: string }> }) {
  const { id } = await params;
  const { unit } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const m = posMembership(auth.active);
  const units = (await posUnits(tenantId, id)).filter((u) => canAccessUnit(m, u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (units.length === 0) notFound();
  const unitId = units.some((u) => u.id === unit) ? unit! : units[0]!.id;
  const canManage = evaluate(m, { module: "pos", action: "pos.shift.manage", unitId });
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.shift");
  return (
    <div className="flex w-full min-w-0 max-w-7xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id, await getTranslations("pos"))} />
      <ShiftsClient systemId={id} units={units} unitId={unitId} canManage={canManage} meName={auth.user.name?.trim() || auth.user.email || "-"} />
    </div>
  );
}
