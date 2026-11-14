// ─────────────────────────────────────────────────────────────
// WhtCertForm — ACC T3.3 · หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ตามโครงแบบทางการ · B&W A4 · 1 หน้า/ฉบับ
//   ข้อมูลทั้งหมดจาก `buildCertPrint` (wht-cert-print.ts) — ส่วนนี้วางอย่างเดียว ไม่คิดตัวเลข
//   ไม่มี "use client" — เรนเดอร์บนเซิร์ฟเวอร์/ข้อสอบ (react-dom/server) ได้
// ─────────────────────────────────────────────────────────────
import { CERT_INCOME_ROWS, WHT_CONDITIONS, type CertPart } from "@/lib/modules/account/wht-forms";
import { certPartLabel, type CertPrintModel } from "@/lib/modules/account/wht-cert-print";
import { WHT_CERT_FORM_BOXES } from "@/lib/core/settings/legal/th-tax-2569";

const Box = ({ on, testId }: { on: boolean; testId?: string }) => (
  <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-black text-[10px] leading-none" data-testid={testId} data-on={on ? "1" : "0"}>
    {on ? "✓" : ""}
  </span>
);

function Party({ title, p, testId }: { title: string; p: CertPrintModel["payer"]; testId: string }) {
  return (
    <div className="border border-black p-2" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span>
          เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* <span className="font-mono tracking-wider" data-testid={`${testId}-taxid`}>{p.taxId || "—"}</span>
        </span>
      </div>
      <div className="mt-1">
        ชื่อ <span className="font-medium" data-testid={`${testId}-name`}>{p.name || "—"}</span>
        <span className="ml-2 text-[10px]">({p.kindTh})</span>
        {p.branch ? <span className="ml-2 text-[10px]">· {p.branch}</span> : null}
      </div>
      <div className="mt-0.5">
        ที่อยู่ <span data-testid={`${testId}-address`}>{p.address || "—"}</span>
      </div>
    </div>
  );
}

export function WhtCertPage({ m, part, money, fmtDate }: { m: CertPrintModel; part: CertPart | null; money: (satang: number) => string; fmtDate: (d: Date) => string }) {
  return (
    <div
      className="relative mx-auto flex min-w-[720px] max-w-[210mm] flex-col gap-2 bg-white p-6 text-[11px] leading-snug text-black print:break-after-page"
      data-testid="wht-cert-page"
      data-part={part ?? "record"}
      data-cancelled={m.cancelled ? "1" : "0"}
    >
      {m.cancelled && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid="wht-cert-void-watermark">
          <span className="-rotate-30 select-none text-[110px] font-bold text-neutral-300">ยกเลิก</span>
        </div>
      )}
      <div className="relative flex items-start justify-between gap-3">
        <div className="text-[10px]" data-testid="wht-cert-part">
          {part ? certPartLabel(part) : m.recordBanner}
        </div>
        {m.reprintLine && (
          <div className="shrink-0 text-[10px]" data-testid="wht-cert-reprint">
            {m.reprintLine}
          </div>
        )}
      </div>
      <div className="relative grid grid-cols-[1fr_auto] items-end gap-2">
        <div className="text-center">
          <div className="text-[15px] font-bold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
          <div>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        </div>
        <div className="text-right">
          <div>
            เล่มที่ <span data-testid="wht-cert-book">{m.bookNo}</span>
          </div>
          <div>
            เลขที่ <span className="font-semibold" data-testid="wht-cert-no">{m.docNo}</span>
          </div>
        </div>
      </div>
      {(m.cancelLine || m.replacesLine || m.replacedByLine) && (
        <div className="relative border border-black px-2 py-1 font-semibold" data-testid="wht-cert-status-line">
          {[m.cancelLine, m.replacedByLine, m.replacesLine].filter(Boolean).join(" · ")}
        </div>
      )}
      <Party title="ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :" p={m.payer} testId="wht-cert-payer" />
      <Party title="ผู้ถูกหักภาษี ณ ที่จ่าย :" p={m.payee} testId="wht-cert-payee" />
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border border-black p-2" data-testid="wht-cert-forms">
        <span>
          ลำดับที่ <span className="font-semibold" data-testid="wht-cert-seq">{m.seq ?? "—"}</span> ในแบบ
        </span>
        {WHT_CERT_FORM_BOXES.map((b) => (
          <span key={b.box} className="inline-flex items-center gap-1">
            <Box on={m.formBox === b.box} testId={`wht-cert-form-${b.box}`} />({b.box}) {b.labelTh}
          </span>
        ))}
        {m.noBoxNote && (
          <span className="w-full text-[10px]" data-testid="wht-cert-nobox">
            {m.noBoxNote}
          </span>
        )}
      </div>
      <table className="relative w-full border-collapse border border-black" data-testid="wht-cert-income">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-black p-1 text-left font-semibold">ประเภทเงินได้พึงประเมินที่จ่าย</th>
            <th className="w-[80px] border-r border-black p-1 font-semibold">วัน เดือน หรือปีภาษี ที่จ่าย</th>
            <th className="w-[90px] border-r border-black p-1 font-semibold">จำนวนเงินที่จ่าย</th>
            <th className="w-[90px] p-1 font-semibold">ภาษีที่หัก และนำส่งไว้</th>
          </tr>
        </thead>
        <tbody>
          {CERT_INCOME_ROWS.map((r) => {
            const on = r.row === m.incomeRow;
            return (
              <tr key={r.row} className="align-top" data-testid={`wht-cert-row-${r.row}`} data-on={on ? "1" : "0"}>
                <td className="border-r border-black p-1">
                  {r.labelTh}
                  {on ? <div className="font-semibold" data-testid="wht-cert-income-detail">{m.incomeDetail}</div> : null}
                </td>
                <td className="border-r border-black p-1 text-center">{on ? fmtDate(m.paidDate) : ""}</td>
                <td className="border-r border-black p-1 text-right tabular-nums">{on ? money(m.amount) : ""}</td>
                <td className="p-1 text-right tabular-nums">{on ? money(m.tax) : ""}</td>
              </tr>
            );
          })}
          <tr className="border-t border-black font-semibold">
            <td className="border-r border-black p-1 text-right" colSpan={2}>
              รวมเงินที่จ่ายและภาษีที่หักนำส่ง
            </td>
            <td className="border-r border-black p-1 text-right tabular-nums" data-testid="wht-cert-total-amount">
              {money(m.amount)}
            </td>
            <td className="p-1 text-right tabular-nums" data-testid="wht-cert-total-tax">
              {money(m.tax)}
            </td>
          </tr>
          <tr className="border-t border-black">
            <td className="p-1" colSpan={4}>
              รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) <span className="font-semibold" data-testid="wht-cert-words">({m.taxWords})</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="relative border border-black p-2">
        เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ........ บาท · กองทุนประกันสังคม ........ บาท · กองทุนสำรองเลี้ยงชีพ ........ บาท
      </div>
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1 border border-black p-2" data-testid="wht-cert-condition">
        <span className="font-semibold">ผู้จ่ายเงิน</span>
        {WHT_CONDITIONS.map((c) => (
          <span key={c.value} className="inline-flex items-center gap-1">
            <Box on={m.condition === c.value} testId={`wht-cert-cond-${c.value}`} />({c.value}) {c.labelTh}
          </span>
        ))}
      </div>
      <div className="relative grid grid-cols-[1fr_auto] gap-3 border border-black p-2">
        <div className="text-[10px]">
          <div className="font-semibold">คำเตือน</div>
          ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <div>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
          <div className="mt-6 w-56 border-t border-dotted border-black pt-1">ลงชื่อ ผู้จ่ายเงิน</div>
          <div data-testid="wht-cert-sign-date">{fmtDate(m.paidDate)}</div>
          <div className="text-[10px]">(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</div>
        </div>
        <div className="col-span-2 text-right text-[10px]">ประทับตรานิติบุคคล (ถ้ามี)</div>
      </div>
      <div className="relative text-[9px]">
        หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง 2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า 3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร
      </div>
    </div>
  );
}

/** ชุดหน้า: IN = ตามฉบับที่ขอ · OUT (WTI) = หน้าบันทึกเดียวไม่มีป้ายฉบับ */
export function WhtCertForm({ m, parts, money, fmtDate }: { m: CertPrintModel; parts: CertPart[]; money: (satang: number) => string; fmtDate: (d: Date) => string }) {
  if (m.direction === "OUT") return <WhtCertPage m={m} part={null} money={money} fmtDate={fmtDate} />;
  return (
    <>
      {parts.map((p) => (
        <WhtCertPage key={p} m={m} part={p} money={money} fmtDate={fmtDate} />
      ))}
    </>
  );
}

export default WhtCertForm;
