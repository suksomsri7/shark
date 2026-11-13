import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
// HF-HR-0 (D3): สลิป = ผู้ดูเงินเดือน หรือตัวพนักงานเอง (รอบอนุมัติ/จ่ายแล้ว) เท่านั้น
import { hrViewerOf, loadPayslipForViewer } from "@/lib/modules/hr/privacy";
// HR H3.8 ▸ การ์ดสลิป 07c (ตัวเลขจาก slipView ของข้อมูลที่ loadPayslipForViewer คืน — ทางข้อมูลเดียวของหน้านี้) · ป้ายสถานะ DRAFT/NOT_FINAL/WITHDRAWN ·
//   PDF = <a download> (ISSUED เท่านั้น) · ประวัติรายปี = ผู้ดูเงินเดือน (ด่านในตัว) · หมายเหตุของรายการเพิ่ม/หักไม่แสดงแล้ว ◂
import { GateSlipHistory, SlipCard, SlipDataNotice, gateSlipPdfHref, mySlipPdfHref, slipCardFromHotfix, slipTaxYear } from "@/lib/modules/hr/payslip-ui";

// สลิปเงินเดือน (payslip) — HR H3.8 ▸ ภาพ 07c (มือถือก่อน) · พิมพ์ = ไฟล์ PDF ◂
export default async function PayslipPage({
  params,
}: {
  params: Promise<{ id: string; runId: string; employeeId: string }>;
}) {
  const { id, runId, employeeId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys || sys.type !== "HR") notFound();

  const viewer = hrViewerOf(auth); // HR H3.8 ◂
  const slip = await loadPayslipForViewer({ tenantId, systemId: id }, viewer, runId, employeeId);
  if (!slip) notFound(); // ไม่มีสิทธิ์/ไม่พบ/ข้ามร้าน = 404
  // HR H3.8 ▸ ผู้ดูเงินเดือน = OWNER หรือ hr.payroll.read (ตัวเดียวกับ loadPayslipForViewer) · ตัวเอง = ลิงก์ฝั่ง "ของฉัน" ◂
  const payroll = viewer.role === "OWNER" || viewer.permissions["hr.payroll.read"] === true;
  const d = slipCardFromHotfix(slip);
  if (!d) return <SlipDataNotice />;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      {/* HR H3.8 ▸ การ์ด 07c + ประวัติรายปี ◂ */}
      <SlipCard
        d={d}
        backHref={payroll ? `/app/sys/${id}/hr/payroll` : "/app/me/hr/pay"}
        pdfHref={d.state !== "ISSUED" ? null : payroll ? gateSlipPdfHref(id, d.runId, employeeId) : mySlipPdfHref(d.runId)}
        certHref={payroll ? `/app/sys/${id}/hr/payroll#hr-salarycert` : "/app/me/hr/pay#hr-salarycert-mine"}
        history={null}
      />
      {payroll ? <GateSlipHistory systemId={id} employeeId={employeeId} taxYear={slipTaxYear(slip.run.payDate)} /> : null}
    </div>
  );
}
