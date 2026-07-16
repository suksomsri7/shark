import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { payslipData } from "@/lib/modules/hr/payroll";
import { formatBaht } from "@/lib/ui/money";
import { formatThaiDateLong as fmtDate } from "@/lib/ui/date";

// สลิปเงินเดือน (payslip) — โทน ink ล้วน B&W A4 · พิมพ์ด้วย Ctrl+P
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

  const [{ run, item, employee }, tenant] = await Promise.all([
    payslipData({ tenantId, systemId: id }, runId, employeeId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  if (!run || !item || !employee) notFound();

  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <div className={`flex justify-between py-1.5 ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-neutral-500"}>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-md bg-white p-8 text-sm text-black">
      <div className="text-center">
        <div className="text-base font-bold">สลิปเงินเดือน</div>
        {tenant?.name && <div className="text-xs">{tenant.name}</div>}
        <div className="mt-1 text-xs">งวด {run.periodKey} · จ่ายวันที่ {fmtDate(run.payDate)}</div>
      </div>

      {/* พนักงาน */}
      <div className="mt-5 border-t pt-3">
        <div className="flex justify-between">
          <span className="text-neutral-500">พนักงาน</span>
          <span className="font-medium">{employee.name}</span>
        </div>
        {employee.position && (
          <div className="flex justify-between">
            <span className="text-neutral-500">ตำแหน่ง</span>
            <span>{employee.position}</span>
          </div>
        )}
      </div>

      {/* รายการเงินได้/หัก */}
      <div className="mt-3 border-t pt-2">
        <Row label="เงินเดือน" value={formatBaht(item.grossSatang, { decimals: true })} />
        <Row
          label={`หัก ประกันสังคม (ฐาน ${formatBaht(item.ssoBaseSatang)})`}
          value={`− ${formatBaht(item.ssoEmployeeSatang, { decimals: true })}`}
        />
        <Row
          label="หัก ภาษี ณ ที่จ่าย (ภ.ง.ด.1)"
          value={`− ${formatBaht(item.whtSatang, { decimals: true })}`}
        />
        <div className="mt-1 border-t pt-1">
          <Row label="เงินเดือนสุทธิ" value={formatBaht(item.netSatang, { decimals: true })} bold />
        </div>
      </div>

      {/* ส่วนนายจ้างสมทบ (ข้อมูลประกอบ) */}
      <div className="mt-3 border-t pt-2 text-xs text-neutral-500">
        <div className="flex justify-between">
          <span>ประกันสังคม (นายจ้างสมทบ)</span>
          <span>{formatBaht(item.ssoEmployerSatang, { decimals: true })}</span>
        </div>
      </div>

      <div className="mt-6 text-center text-[10px] text-neutral-400 print:hidden">
        กด Ctrl+P เพื่อพิมพ์ / บันทึกเป็น PDF
      </div>
    </div>
  );
}
