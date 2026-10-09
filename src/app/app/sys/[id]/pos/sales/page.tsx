import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership, posSalesReadScope, posSaleWhere } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { bkkDateOf, isBillDate } from "@/lib/modules/pos/bills-shared";
import { posAccountSystemId } from "@/lib/modules/account";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { BillsClient } from "./BillsClient";

// POS P1.16 U — หน้า "บิลวันนี้" (ภาพ 12 · route เดิม /pos/sales · มติ CD1 แทนหน้าประวัติบิลเดิม)
//   ข้อมูลทั้งหน้าโหลดจาก billsPageDataAction คำขอเดียว (client) · หน้านี้เลือกสาขาที่เข้าได้ + บอกว่าร้านเคยมีบิลไหม (ข้อความว่าง)
// 🔴 HF-POS-PAGES: ต้องขายได้ที่สาขาใดสาขาหนึ่ง · คนจำกัดสาขาเห็นเฉพาะสาขาของตัวเอง — สิทธิ์จริงต่อบิลตัดสินใน bills.ts
export default async function PosSalesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unit?: string; date?: string }> }) {
  const { id } = await params;
  const { unit, date } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const m = posMembership(auth.active);
  // POS P1.18 ▸ มติ Q9: ดูบิลได้ด้วย pos.sale.read หรือ pos.sale.create (เท่ากับ action ของหน้า) ◂
  const scope = posSalesReadScope(posMembership(auth.active));
  if (!scope) notFound();
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.bills");

  const [allUnits, anyBill, accountSystemId] = await Promise.all([
    posUnits(tenantId, id),
    // ร้านนี้เคยมีบิลในขอบเขตของผู้ใช้ไหม — แยกข้อความ "วันนี้ยังไม่มีบิล" กับ "ยังไม่เคยขาย"
    prisma.posSale.findFirst({ where: posSaleWhere(tenantId, id, scope), select: { id: true } }),
    posAccountSystemId(tenantId, id),
  ]);
  const units = allUnits
    .filter((u) => canAccessUnit(m, u.id) && (scope.allUnits || scope.unitIds.includes(u.id)))
    .map((u) => ({ id: u.id, name: u.name }));
  const unitId = units.some((u) => u.id === unit) ? unit! : units[0]?.id;
  // ?date=YYYY-MM-DD (ลิงก์ตรงไปวันที่ · ไม่เกินวันนี้) — ไม่ระบุ/ผิดรูป = วันนี้ตามเวลาไทย
  const today = bkkDateOf();
  const initialDate = isBillDate(date) && date <= today ? date : today;
  // POS P1.13U มติ 4: ปุ่มออก/ปฏิเสธใบกำกับเต็มรูปในลิ้นชัก = สิทธิ์ pos.taxinvoice.issue ที่สาขานี้ (เจ้าของ/ผู้จัดการโดยปริยาย) — บริการตรวจซ้ำทุกครั้ง
  const canIssueTaxInvoice = !!unitId && evaluate(m, { module: "pos", action: "pos.taxinvoice.issue", unitId });

  return (
    <div className="flex w-full min-w-0 max-w-[1600px] flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id, await getTranslations("pos"))} />
      {unitId ? (
        <BillsClient systemId={id} units={units} unitId={unitId} today={today} initialDate={initialDate} hasAnyBill={!!anyBill} accountSystemId={accountSystemId} canIssueTaxInvoice={canIssueTaxInvoice} />
      ) : (
        <div className="card text-sm text-[color:var(--color-muted)]" data-testid="pos-bills-no-unit">
          {t("noUnits")}
        </div>
      )}
    </div>
  );
}
