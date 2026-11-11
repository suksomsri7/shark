// SVC D.9 ▸ หลักฐานการรับชำระ (พิมพ์ A5) · /d/<token>/receipt?bill=<billId> — สาธารณะ ด่านเดียวกับหน้าจ่าย (ล้ม ⇒ notFound() เนื้อเดียวกัน)
//   เลขใบเสร็จ RC อัตโนมัติ = D.10 · หน้านี้แสดงเลขใบแจ้งหนี้ + รายการรับชำระที่ไม่ถูกยกเลิกจากบัญชี · ไม่มีชื่อ/เบอร์ผู้เช่า
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadPortalReceipt, portalClientKey } from "@/lib/platform/dorm-portal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ใบเสร็จรับเงิน", robots: { index: false, follow: false }, referrer: "no-referrer" };

const money = (satang: number) => `฿${Math.trunc(Math.abs(satang) / 100).toLocaleString("en-US")}.${String(Math.abs(satang) % 100).padStart(2, "0")}`;
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thDate = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : ymd;
};

export default async function DormPortalReceiptPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ bill?: string | string[] }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const bill = typeof sp.bill === "string" ? sp.bill : "";
  const r = await loadPortalReceipt(token, { bill }, { clientKey: portalClientKey(await headers()) });
  if (!r) notFound();
  return (
    <main data-portal-receipt-page={r.billId} className="mx-auto flex w-full max-w-[148mm] flex-col gap-3 bg-white p-6 text-[13px] text-[#0a0a0a] print:p-0">
      <style>{"@page { size: A5; margin: 12mm }"}</style>
      <header className="border-b border-[#e5e5e5] pb-2">
        <h1 className="text-[18px] font-bold">{r.titleTh}</h1>
        <p className="text-[#404040]">{`${r.unitName} · ห้อง ${r.roomNumber} · รอบ ${r.periodLabel}`}</p>
        {r.docNo ? <p className="text-[#737373]">{`อ้างอิงใบแจ้งหนี้ ${r.docNo}`}</p> : null}
      </header>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#e5e5e5] text-left text-[#737373]">
            <th className="py-1 font-normal">วันที่</th>
            <th className="py-1 font-normal">ช่องทาง</th>
            <th className="py-1 text-right font-normal">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {r.payments.map((p, i) => (
            <tr key={i} className="border-b border-dashed border-[#e5e5e5]">
              <td className="py-1">{thDate(p.paidAt)}</td>
              <td className="py-1">{p.channelTh}</td>
              <td className="py-1 text-right tabular-nums">{money(p.amountSatang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between font-bold">
        <span>รับชำระแล้ว</span>
        <span className="tabular-nums">{money(r.paidSatang)}</span>
      </div>
      <div className="flex justify-between text-[#404040]">
        <span>ยอดบิล</span>
        <span className="tabular-nums">{money(r.totalSatang)}</span>
      </div>
      <p className="text-[11px] text-[#737373] print:hidden">พิมพ์จากเบราว์เซอร์ (Ctrl/⌘ + P)</p>
    </main>
  );
}
