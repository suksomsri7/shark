import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership, posSalesReadScope, posSaleWhere } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { BILLS_ALL_UNITS, bkkDateOf, isBillDate } from "@/lib/modules/pos/bills-shared"; // POS P2.12U ▸ + BILLS_ALL_UNITS ◂
import { accountCan, posAccountSystemId } from "@/lib/modules/account"; // POS P4.3 ▸ CD-P43-2 + accountCan ◂
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { BillsClient } from "./BillsClient";
import { SLIP_MAX_BYTES } from "@/lib/modules/pos/payment-slip"; // POS P3-SKEL U ▸ CD-SKELU-7: ขนาดไฟล์สลิปเป็นค่าจากหน้าเพจ (ไม่ import ค่าในไฟล์ client) ◂

// POS P1.16 U — หน้า "บิลวันนี้" (ภาพ 12 · route เดิม /pos/sales · มติ CD1 แทนหน้าประวัติบิลเดิม)
//   ข้อมูลทั้งหน้าโหลดจาก billsPageDataAction คำขอเดียว (client) · หน้านี้เลือกสาขาที่เข้าได้ + บอกว่าร้านเคยมีบิลไหม (ข้อความว่าง)
// 🔴 HF-POS-PAGES: ต้องขายได้ที่สาขาใดสาขาหนึ่ง · คนจำกัดสาขาเห็นเฉพาะสาขาของตัวเอง — สิทธิ์จริงต่อบิลตัดสินใน bills.ts
export default async function PosSalesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unit?: string; date?: string; bill?: string }> }) {
  const { id } = await params;
  const { unit, date, bill } = await searchParams; // POS P2.8U ▸ ?bill=<saleId> = เปิดลิ้นชักบิลนั้นทันที (ปุ่ม "ดูบิล" ของจอออเดอร์ · สิทธิ์ตรวจใน billDetailAction) ◂
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
  // POS P4.3 ▸ CD-P43-2: ลิงก์ "เอกสารบัญชี" ในลิ้นชักบิล = เฉพาะผู้เปิดหน้าพิมพ์เอกสารบัญชีได้ (account.doc.view · กติกาเดียวกับ requireAccountPage)
  //   ไม่มีสิทธิ์ = ไม่ส่งสมุดให้ BillsClient (ลิงก์ไม่แสดง แทนที่จะพาไปหน้า 403) ◂
  const canOpenAccounting = accountCan(auth, "account.doc.view");
  const units = allUnits
    .filter((u) => canAccessUnit(m, u.id) && (scope.allUnits || scope.unitIds.includes(u.id)))
    .map((u) => ({ id: u.id, name: u.name }));
  // POS P2.12U ▸ มติ 7: ?unit=* = ทุกสาขา (เฉพาะผู้อ่านบิลได้ > 1 สาขา — billsPageData ตัดขอบเขตเองด้วย receiptReadScope) ◂
  const unitId = unit === BILLS_ALL_UNITS && units.length > 1 ? BILLS_ALL_UNITS : units.some((u) => u.id === unit) ? unit! : units[0]?.id;
  const allMode = unitId === BILLS_ALL_UNITS;
  // ?date=YYYY-MM-DD (ลิงก์ตรงไปวันที่ · ไม่เกินวันนี้) — ไม่ระบุ/ผิดรูป = วันนี้ตามเวลาไทย
  const today = bkkDateOf();
  const initialDate = isBillDate(date) && date <= today ? date : today;
  // POS P1.13U มติ 4: ปุ่มออก/ปฏิเสธใบกำกับเต็มรูปในลิ้นชัก = สิทธิ์ pos.taxinvoice.issue ที่สาขานี้ (เจ้าของ/ผู้จัดการโดยปริยาย) — บริการตรวจซ้ำทุกครั้ง
  const canIssueTaxInvoice = !!unitId && !allMode && evaluate(m, { module: "pos", action: "pos.taxinvoice.issue", unitId });
  // POS P2.12U ▸ มติ 7: ทุกสาขา = สาขาที่ออกใบกำกับได้ (ลิ้นชักใช้สาขาของบิล) · ?bill= = สาขาของบิลนั้นในขอบเขตเดียวกับหน้า (ไม่พบ = ไม่เปิด) ◂
  const taxInvoiceUnits = allMode ? units.filter((u) => evaluate(m, { module: "pos", action: "pos.taxinvoice.issue", unitId: u.id })).map((u) => u.id) : [];
  const billParam = typeof bill === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(bill) ? bill : null;
  const initialBillUnitId = allMode && billParam ? ((await prisma.posSale.findFirst({ where: { ...posSaleWhere(tenantId, id, scope), id: billParam }, select: { unitId: true } }))?.unitId ?? null) : null;

  return (
    <div className="flex w-full min-w-0 max-w-[1600px] flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id, await getTranslations("pos"))} data-testid="pos-bills-module-tabs" /* POS P4.1 ▸ R5 ◂ */ />
      {unitId ? (
        <BillsClient
          systemId={id}
          units={units}
          unitId={unitId}
          today={today}
          initialDate={initialDate}
          hasAnyBill={!!anyBill}
          accountSystemId={canOpenAccounting ? accountSystemId : null}
          canIssueTaxInvoice={canIssueTaxInvoice}
          initialBillId={allMode && !initialBillUnitId ? null : billParam} // POS P2.8U ▸ ?bill= ◂ · POS P2.12U ▸ ทุกสาขา: ต้องรู้สาขาของบิล ◂
          taxInvoiceUnits={taxInvoiceUnits}
          initialBillUnitId={initialBillUnitId}
          slip={{ manageUnits: units.filter((u) => evaluate(m, { module: "pos", action: "pos.shift.manage", unitId: u.id })).map((u) => u.id), maxBytes: SLIP_MAX_BYTES }} // POS P3-SKEL U ▸ CD-SKELU-7 ◂
          canSeeCost={allMode ? units.some((u) => evaluate(m, { module: "pos", action: "pos.report.view", unitId: u.id })) : evaluate(m, { module: "pos", action: "pos.report.view", unitId })} // POS P2.14 ▸ UI-4: ต้นทุน/กำไรต่อบรรทัด = ผู้ดูรายงานได้ ◂
        />
      ) : (
        <div className="card text-sm text-[color:var(--color-muted)]" data-testid="pos-bills-no-unit">
          {t("noUnits")}
        </div>
      )}
    </div>
  );
}
