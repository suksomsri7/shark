import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
// HF-HR-0 (D3): สลิป = ผู้ดูเงินเดือน หรือตัวพนักงานเอง (รอบอนุมัติ/จ่ายแล้ว) เท่านั้น
import { hrViewerOf, loadPayslipForViewer } from "@/lib/modules/hr/privacy";
// HR H3.8 ▸ การ์ดสลิป 07c (ตัวเลขจาก slipView ของข้อมูลที่ loadPayslipForViewer คืน — ทางข้อมูลเดียวของหน้านี้) · ป้ายสถานะ DRAFT/NOT_FINAL/WITHDRAWN ·
//   PDF = <a download> (ISSUED เท่านั้น) · ประวัติรายปี = ผู้ดูเงินเดือน (ด่านในตัว) · หมายเหตุของรายการเพิ่ม/หักไม่แสดงแล้ว ◂
import { GateSlipHistory, SlipCard, SlipDataNotice, gateSlipPdfHref, mySlipPdfHref, slipCardFromHotfix } from "@/lib/modules/hr/payslip-ui";
// HR H3.8 ▸ merge round (ruling 2): ผู้ดูเงินเดือนอ่านผ่าน slipForViewer ด้วย — สมาชิกภาพจริงในฐาน + สาขาประจำเท่านั้น (ยืมตัวไม่นับ) · บัญชีที่บันทึกไว้ · รหัสพนักงาน ◂
import { slipForViewer } from "@/lib/modules/hr/payslip";

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
  // HR H3.8 ▸ merge round (ruling 2 · review M1): ผู้ดูเงินเดือน (OWNER หรือ hr.payroll.read) อ่านผ่าน slipForViewer เท่านั้น — สิทธิ์จากแถว Membership ในฐาน ·
  //   สาขาประจำเท่านั้น (ยืมตัวไม่นับ) · ปฏิเสธ = 404 ไม่มีข้อมูล · SLIP_DATA = ข้อความ · ไม่ผ่านตัวโหลด hotfix เลย ◂
  const payroll = viewer.role === "OWNER" || viewer.permissions["hr.payroll.read"] === true;
  if (payroll) {
    const g = await slipForViewer({ tenantId, systemId: id }, viewer, { runId, employeeId });
    if (!g.ok) {
      if (g.code === "SLIP_DATA") return <SlipDataNotice />;
      notFound();
    }
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
        <SlipCard d={g} backHref={`/app/sys/${id}/hr/payroll`} pdfHref={g.state !== "ISSUED" ? null : gateSlipPdfHref(id, g.runId, employeeId)} certHref={`/app/sys/${id}/hr/payroll#hr-salarycert`} history={null} showEmployee />
        <GateSlipHistory systemId={id} employeeId={employeeId} taxYear={g.taxYear} />
      </div>
    );
  }
  // HR H3.8 ▸ ตัวพนักงานเอง (ลิงก์เดิม) = ตัวโหลด hotfix (สลิปที่ออกแล้วของตัวเองเท่านั้น) ◂
  const slip = await loadPayslipForViewer({ tenantId, systemId: id }, viewer, runId, employeeId);
  if (!slip) notFound(); // ไม่มีสิทธิ์/ไม่พบ/ข้ามร้าน = 404
  const d = slipCardFromHotfix(slip); // HR H3.8 ▸ ตัวเลขจาก slipView ◂
  if (!d) return <SlipDataNotice />;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      {/* HR H3.8 ▸ การ์ด 07c ◂ */}
      <SlipCard d={d} backHref="/app/me/hr/pay" pdfHref={d.state !== "ISSUED" ? null : mySlipPdfHref(d.runId)} certHref="/app/me/hr/pay#hr-salarycert-mine" history={null} />
    </div>
  );
}
