import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormAccess, getBill } from "@/lib/modules/dorm";

// SVC D.8 ▸ ใบแจ้งหนี้พิมพ์ใส่ห้อง (ช่องทาง PRINT) — ขนาด A5 · ด่านเดียวกับหน้ารอบบิล (requireUnit · DORM · dormAccess(...).board)
//   ข้อมูลผ่าน facade `getBill` เท่านั้น · ไม่มีเบอร์โทร · ข้อความบริการล้วน
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thDate = (ymd: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}` : ymd;
};
const baht = (satang: number): string => {
  const a = Math.abs(satang);
  return `${satang < 0 ? "-" : ""}${Math.trunc(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
};

export default async function DormBillPrintPage({ params }: { params: Promise<{ unitSlug: string; billId: string }> }) {
  const { unitSlug, billId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!dormAccess(membership, unit.id).board) notFound();
  const bill = await getBill({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, billId });
  if (!bill) notFound();

  return (
    <div data-bill-print={bill.roomNumber} className="mx-auto flex w-full max-w-[148mm] flex-col gap-3 bg-white p-6 text-[13px] text-black print:p-0">
      <style>{"@page { size: A5; margin: 10mm }"}</style>
      <header className="flex items-start gap-3 border-b pb-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{bill.unitName}</p>
          <p className="text-xs">{`ใบแจ้งหนี้${bill.docNo ? ` เลขที่ ${bill.docNo}` : " (ร่าง)"}`}</p>
          <p className="text-xs">{`วันที่ ${thDate(bill.issueDate)}`}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{`ห้อง ${bill.roomNumber}`}</p>
          <p className="text-xs">{bill.tenantName}</p>
        </div>
      </header>
      <table className="w-full">
        <tbody>
          {bill.lines.map((l) => (
            <tr key={l.code} className="border-b border-dashed">
              <td className="py-1.5">
                {l.labelTh}
                {l.detail ? <span className="ml-1 text-xs text-gray-600">{l.detail}</span> : null}
              </td>
              <td className="py-1.5 text-right tabular-nums">{baht(l.amountSatang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-baseline justify-between border-t-2 border-black pt-2 text-base font-bold">
        <span>ยอดชำระ</span>
        <span className="tabular-nums">{`฿${baht(bill.totalSatang)}`}</span>
      </div>
      <p>{`ครบกำหนดชำระ ${thDate(bill.dueDate)}`}</p>
      {bill.lateFeeRule ? <p className="text-xs">{bill.lateFeeRule}</p> : null}
      <p className="text-xs">{bill.vatRegistered ? `รวมภาษีมูลค่าเพิ่ม ฿${baht(bill.vatSatang)}` : "ไม่มี VAT (ค่าเช่าที่อยู่อาศัยได้รับยกเว้น)"}</p>
      <p className="text-xs text-gray-600">ชำระแล้วแจ้งสลิปกับผู้ดูแลหอ · ขอบคุณค่ะ</p>
    </div>
  );
}
