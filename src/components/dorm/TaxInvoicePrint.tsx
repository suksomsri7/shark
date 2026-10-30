// SVC D.3 ▸ ใบกำกับภาษีเต็มรูปของหอ (ม.86/4) — พิมพ์ A4 · สัญญา DOM ledger/svc-briefs/svc-brief-d.3.md §5.2
//   • render ล้วน: ข้อมูลทั้งหมดมาจาก billTaxInvoice (props.model) · import ได้เฉพาะ type ⇒ renderToStaticMarkup ได้
//   • ม.86/4: (1) คำว่า "ใบกำกับภาษี" (2) ชื่อ ที่อยู่ เลขผู้เสียภาษีผู้ขาย + สาขา (3) ชื่อ ที่อยู่ผู้ซื้อ (+ เลข/สาขาเมื่อมี)
//     (4) เลขที่ (5) รายการ · มูลค่า · VAT แยกจากมูลค่า (6) วันที่ — เฉพาะรายการที่มี VAT (ค่าห้องยกเว้นอยู่ในใบแจ้งหนี้)
//   • ผู้ขาย = ค่าที่ตรึงไว้ตอนออก (ใน snapshot) · โหมด ต้นฉบับ/สำเนา (พิมพ์ซ้ำ = สำเนา · ?copy=1)
//   • ไม่มีเบอร์โทรผู้เช่า · ข้อความบริการล้วน
import type { TaxInvoiceView } from "@/lib/modules/dorm";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-10-26" ⇒ "26 ต.ค. 2569" (อ่านจากข้อความ ไม่ผ่าน Date) */
function thDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : ymd;
}
/** สตางค์ ⇒ "1,234.56" */
function baht(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${satang < 0 ? "-" : ""}${Math.trunc(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
}
/** เลขผู้เสียภาษี 13 หลัก ⇒ "0-1055-61000-00-3" */
function taxIdFmt(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : v;
}

/** copy = พิมพ์ซ้ำ/สำเนา (หัวเอกสาร "สำเนา") · ไม่ส่ง = ต้นฉบับ */
export default function TaxInvoicePrint({ model, copy = false }: { model: TaxInvoiceView; copy?: boolean }) {
  const m = model;
  const voided = m.status === "VOIDED";
  return (
    <div data-tax-invoice={m.docNo ?? ""} data-ti-status={m.status} className="relative mx-auto flex w-full max-w-[210mm] flex-col gap-4 bg-white p-8 text-[13px] text-black print:p-0">
      <style>{"@page { size: A4; margin: 12mm }"}</style>
      {voided ? (
        <p className="rounded border-2 border-red-700 px-3 py-1 text-center text-base font-bold text-red-700">ยกเลิกแล้ว — มีการออกใบกำกับภาษีฉบับใหม่แทนฉบับนี้</p>
      ) : null}
      <header className="flex items-start gap-4 border-b-2 border-black pb-3">
        <div data-ti-seller className="min-w-0 flex-1">
          <p className="text-lg font-bold">{m.seller.name}</p>
          {m.seller.address ? <p>{m.seller.address}</p> : null}
          <p>{`เลขประจำตัวผู้เสียภาษีอากร ${taxIdFmt(m.seller.taxId)}`}</p>
          <p>{m.seller.branchLabel}</p>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold">ใบกำกับภาษี</h1>
          <p data-ti-copy={copy ? "COPY" : "ORIGINAL"} className="text-xs font-semibold">{copy ? "สำเนา" : "ต้นฉบับ"}</p>
          <p data-ti-no>{`เลขที่ ${m.docNo ?? "-"}`}</p>
          <p data-ti-date>{`วันที่ ${thDate(m.issueDate)}`}</p>
        </div>
      </header>
      <section data-ti-buyer className="flex flex-col gap-0.5">
        <p className="text-xs font-semibold">ผู้ซื้อ / ผู้รับบริการ</p>
        <p className="font-bold">{m.buyer.name}</p>
        <p>{m.buyer.address}</p>
        {m.buyer.taxId ? (
          <p>{`เลขประจำตัวผู้เสียภาษีอากร ${taxIdFmt(m.buyer.taxId)} · ${m.buyer.branchLabel ?? "สำนักงานใหญ่"}`}</p>
        ) : null}
      </section>
      <p className="text-xs">{`อ้างอิงใบแจ้งหนี้${m.invoiceDocNo ? ` เลขที่ ${m.invoiceDocNo}` : ""} · ห้อง ${m.roomNumber} · รอบ ${m.periodKey}`}</p>
      <table className="w-full">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1">รายการ</th>
            <th className="py-1 text-right">มูลค่า</th>
            <th className="py-1 text-right">ภาษีมูลค่าเพิ่ม 7%</th>
            <th className="py-1 text-right">รวม</th>
          </tr>
        </thead>
        <tbody>
          {m.lines.map((l) => (
            <tr key={l.code} data-ti-line={l.code} className="border-b border-dashed">
              <td className="py-1.5">{l.description}</td>
              <td className="py-1.5 text-right tabular-nums">{baht(l.netSatang)}</td>
              <td className="py-1.5 text-right tabular-nums">{baht(l.vatSatang)}</td>
              <td className="py-1.5 text-right tabular-nums">{baht(l.grossSatang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto flex w-full max-w-[90mm] flex-col gap-1">
        <p data-ti-subtotal className="flex justify-between">
          <span>มูลค่าสินค้า/บริการ (ไม่รวมภาษี)</span>
          <span className="tabular-nums">{baht(m.subTotalSatang)}</span>
        </p>
        <p data-ti-vat className="flex justify-between">
          <span>ภาษีมูลค่าเพิ่ม 7%</span>
          <span className="tabular-nums">{baht(m.vatSatang)}</span>
        </p>
        <p data-ti-total className="flex justify-between border-t-2 border-black pt-1 text-base font-bold">
          <span>รวมทั้งสิ้น</span>
          <span className="tabular-nums">{baht(m.totalSatang)}</span>
        </p>
      </div>
      {m.replaces ? (
        <p data-ti-replaces className="rounded border border-black p-2 text-xs">
          {`ยกเลิกและออกใบกำกับภาษีฉบับใหม่แทนฉบับเดิม เลขที่ ${m.replaces.docNo ?? "-"} ลงวันที่ ${thDate(m.replaces.issueDate)} — เหตุผล: ${m.replaces.reason}`}
        </p>
      ) : null}
      <p className="text-xs text-gray-600">
        {`ใบกำกับภาษีนี้ออกเฉพาะรายการที่มีภาษีมูลค่าเพิ่ม · ค่าเช่าที่อยู่อาศัยได้รับยกเว้นภาษีมูลค่าเพิ่ม (แสดงในใบแจ้งหนี้/ใบเสร็จ)${m.pricesIncludeVat ? " · ราคารวมภาษีแล้ว" : ""}`}
      </p>
    </div>
  );
}
