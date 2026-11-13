// ─────────────────────────────────────────────────────────────
// PurchaseTaxSection — รายงานภาษีซื้อบนหน้า ภ.พ.30 (ACC T1.6) · แบบเดียวกับรายงานภาษีขาย (T1.1)
//   หัวรายงาน · ตารางรายใบ (ลำดับที่ต่อเดือน เรียงตามวันที่ได้รับ) · รายการปรับปรุง · รวม · ข้อตรวจ
//   ต่อท้าย (ไม่รวมยอด): ภาษีซื้อที่หักไม่ได้ตามเหตุ · รอใบกำกับ · ใบพิมพ์ = หน้านี้ (ไม่มี tfoot)
// server component · ไอคอน AccountIcon เท่านั้น ไม่มี emoji
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import type { AccountDocType } from "@prisma/client";
import type { PurchaseTaxReport, PurchaseTaxRow } from "@/lib/modules/account/purchase-tax-report";
import { buyerBranchLabelTh } from "@/lib/modules/account/sales-tax-shared";
import { editorDetailPath } from "@/lib/modules/account/doc-editor-config";
import { AccountIcon } from "@/components/account-v2/AccountIcon";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { MoneyText } from "@/components/ui/MoneyText";
import { TableWrap } from "../_shared";

const thDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${Number(d)}/${Number(m)}/${Number(y) + 543}`;
};
const cellCls = "px-2 py-1.5 align-top print:px-1 print:py-1";
const money = (n: number) => (n / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function docHref(base: string, docType: string | null, docId: string | null): string | null {
  return docType && docId ? editorDetailPath(base, docType as AccountDocType, docId) : null;
}

function HeaderBox({ pt }: { pt: PurchaseTaxReport }) {
  const h = pt.header;
  return (
    <section className="rounded-lg border p-3 text-sm print:break-before-page print:border-black" data-testid="purchasetax-header">
      <h2 className="text-base font-semibold">รายงานภาษีซื้อ</h2>
      <dl className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
        <div><dt className="inline text-[color:var(--color-muted)]">ชื่อผู้ประกอบการ </dt><dd className="inline font-medium" data-testid="purchasetax-org">{h.orgName || "—"}</dd></div>
        <div><dt className="inline text-[color:var(--color-muted)]">เลขประจำตัวผู้เสียภาษีอากร </dt><dd className="inline font-mono" data-testid="purchasetax-taxid">{h.taxId || "—"}</dd></div>
        <div><dt className="inline text-[color:var(--color-muted)]">สถานประกอบการ </dt><dd className="inline" data-testid="purchasetax-branch">{h.branchLabel}</dd></div>
        <div><dt className="inline text-[color:var(--color-muted)]">เดือนภาษี </dt><dd className="inline" data-testid="purchasetax-month">{h.monthLabel}</dd></div>
      </dl>
      {h.warnings.length > 0 && (
        <div className="mt-2">
          <LegalWarnings warnings={h.warnings} testId="purchasetax-header-warn" compact />
        </div>
      )}
    </section>
  );
}

function Row({ r, base }: { r: PurchaseTaxRow; base: string }) {
  const href = docHref(base, r.docType, r.docId);
  return (
    <tr className={`border-b ${r.cancelled ? "text-[color:var(--color-muted)]" : ""}`} data-testid={r.kind === "JOURNAL" ? "purchasetax-adjust-row" : "purchasetax-row"}>
      <td className={`${cellCls} text-right tabular-nums`}>{r.seq ?? ""}</td>
      <td className={`${cellCls} whitespace-nowrap`}>{thDate(r.receivedDate)}</td>
      <td className={`${cellCls} whitespace-nowrap`}>{r.kind === "JOURNAL" ? "" : thDate(r.invoiceDate)}</td>
      <td className={`${cellCls} whitespace-nowrap font-mono text-xs print:whitespace-normal print:text-[9px]`}>
        {r.kind === "JOURNAL" ? "" : r.invoiceNo}
        {(r.kind === "JOURNAL" || r.invoiceNo !== r.docNo) && (
          <span className="block font-sans text-[11px] text-[color:var(--color-muted)]">
            {href ? <Link href={href} className="hover:underline">{r.docNo}</Link> : r.docNo}
          </span>
        )}
        {r.kind !== "JOURNAL" && r.invoiceNo === r.docNo && href && (
          <Link href={href} className="block font-sans text-[11px] text-[color:var(--color-muted)] hover:underline print:hidden">เปิดเอกสาร</Link>
        )}
      </td>
      <td className={`${cellCls} min-w-[9rem] print:min-w-0`}>{r.vendorName || "—"}</td>
      <td className={`${cellCls} font-mono text-xs`}>{r.vendorTaxId}</td>
      <td className={`${cellCls} text-xs`}>{buyerBranchLabelTh(r.vendorBranchCode)}</td>
      <td className={`${cellCls} text-right`}><MoneyText satang={r.base} decimals /></td>
      <td className={`${cellCls} text-right`}><MoneyText satang={r.vat} decimals /></td>
      <td className={`${cellCls} min-w-[14rem] text-xs print:min-w-0`}>
        {r.cancelled && <span className="mr-1 rounded border px-1 font-semibold" data-testid="purchasetax-cancel">ยกเลิก</span>}
        {r.notes.join(" · ")}
        {r.flag && (
          <span className="mt-0.5 flex items-center gap-1 text-[color:var(--color-danger)]">
            <AccountIcon name="warn" className="h-3.5 w-3.5" />{r.flag}
          </span>
        )}
      </td>
    </tr>
  );
}

export function PurchaseTaxSection({ pt, base }: { pt: PurchaseTaxReport; base: string }) {
  return (
    <div className="flex flex-col gap-4" data-testid="purchasetax">
      <HeaderBox pt={pt} />
      <TableWrap>
        <thead>
          <tr className="border-b bg-[color:var(--color-surface-2)] text-left">
            <th className="px-3 py-2" colSpan={10}>รายงานภาษีซื้อ{pt.inputLedger ? ` (บัญชี ${pt.inputLedger.code} ${pt.inputLedger.name})` : ""} — เฉพาะภาษีซื้อที่หักได้ เรียงตามวันที่ได้รับ</th>
          </tr>
          <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
            <th className="px-2 py-1.5 text-right">ลำดับ</th>
            <th className="px-2 py-1.5">วันที่ได้รับ</th>
            <th className="px-2 py-1.5">วันที่ใบกำกับ</th>
            <th className="px-2 py-1.5">เลขที่ใบกำกับ</th>
            <th className="px-2 py-1.5">ชื่อผู้ขาย</th>
            <th className="px-2 py-1.5">เลขผู้เสียภาษี</th>
            <th className="px-2 py-1.5">สาขา</th>
            <th className="px-2 py-1.5 text-right">มูลค่า</th>
            <th className="px-2 py-1.5 text-right">ภาษี</th>
            <th className="px-2 py-1.5">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {pt.rows.length === 0 && (
            <tr><td className="px-3 py-3 text-[color:var(--color-muted)]" colSpan={10}>ไม่มีภาษีซื้อที่หักได้ในเดือนนี้</td></tr>
          )}
          {pt.rows.map((r) => <Row key={r.key} r={r} base={base} />)}
          <tr className="border-b text-xs font-semibold" data-testid="purchasetax-docs-total">
            <td className="px-3 py-1.5" colSpan={7}>รวมรายใบ ({pt.rows.length} ใบ)</td>
            <td className="px-2 py-1.5 text-right"><MoneyText satang={pt.docsTotal.base} decimals /></td>
            <td className="px-2 py-1.5 text-right"><MoneyText satang={pt.docsTotal.vat} decimals /></td>
            <td />
          </tr>
        </tbody>
        {pt.adjustments.length > 0 && (
          <tbody data-testid="purchasetax-adjustments">
            <tr className="border-b bg-[color:var(--color-surface-2)] text-xs font-semibold">
              <td className="px-3 py-1.5" colSpan={10}>รายการปรับปรุง (ไม่มีใบกำกับ — JV ที่บันทึกเองแตะบัญชีภาษีซื้อ)</td>
            </tr>
            {pt.adjustments.map((r) => <Row key={r.key} r={r} base={base} />)}
            <tr className="border-b text-xs font-semibold">
              <td className="px-3 py-1.5" colSpan={7}>รวมรายการปรับปรุง ({pt.adjustmentsTotal.count} รายการ)</td>
              <td className="px-2 py-1.5 text-right"><MoneyText satang={0} decimals /></td>
              <td className="px-2 py-1.5 text-right"><MoneyText satang={pt.adjustmentsTotal.vat} decimals /></td>
              <td />
            </tr>
          </tbody>
        )}
        <tbody>
          <tr className="border-t-2 font-semibold" data-testid="purchasetax-total">
            <td className="px-3 py-2" colSpan={7}>รวมภาษีซื้อทั้งสิ้น</td>
            <td className="px-2 py-2 text-right"><MoneyText satang={pt.total.base} decimals /></td>
            <td className="px-2 py-2 text-right"><MoneyText satang={pt.total.vat} decimals /></td>
            <td />
          </tr>
        </tbody>
      </TableWrap>

      <section className="rounded-lg border p-3 text-sm" data-testid="purchasetax-checks">
        <h3 className="mb-1 font-medium">ข้อตรวจกระทบยอดรายงานภาษีซื้อ</h3>
        <ul className="flex flex-col gap-1">
          {pt.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-1.5" data-testid={`purchasetax-check-${c.key}`} data-ok={c.ok ? "1" : "0"}>
              <AccountIcon name={c.ok ? "check" : "warn"} className={`mt-0.5 h-4 w-4 shrink-0 ${c.ok ? "" : "text-[color:var(--color-danger)]"}`} />
              <span>
                {c.label} — {c.ok ? "ตรง" : "ไม่ตรง"}
                {!c.ok && (
                  <span className="text-[color:var(--color-danger)]">
                    {" "}(ควรเป็น {c.key === "BASE_VAT" ? c.expected : money(c.expected)} · ได้ {c.key === "BASE_VAT" ? `${c.actual} แถว` : money(c.actual)}{c.detail ? ` · ${c.detail}` : ""})
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ส่วนที่หักไม่ได้ — ไม่อยู่ในยอดรายงาน (skill §18: ลงเฉพาะส่วนที่หักได้) */}
      <section className="flex flex-col gap-2 rounded-lg border p-3 text-sm" data-testid="purchasetax-nonclaim">
        <h3 className="font-medium">
          ภาษีซื้อที่หักไม่ได้ (ไม่รวมในรายงาน) · รวม <MoneyText satang={pt.notClaimable.total.vat} decimals />
        </h3>
        {pt.notClaimable.posting === "INTO_COST" && (
          <p className="text-xs text-[color:var(--color-muted)]">ค่าตั้งของสมุด: ภาษีซื้อที่เคลมไม่ได้รวมเข้าค่าใช้จ่าย/ต้นทุนของบรรทัด — ไม่มีบัญชีแยกให้รายงานอ่าน</p>
        )}
        {pt.notClaimable.groups.length === 0 ? (
          <p className="text-xs text-[color:var(--color-muted)]">ไม่มีภาษีซื้อที่หักไม่ได้ในเดือนนี้</p>
        ) : (
          pt.notClaimable.groups.map((g) => (
            <div key={`${g.reason}-${g.group}`} data-testid={`purchasetax-nonclaim-${g.reason}`}>
              <p className="text-xs font-semibold">
                {g.labelTh}{g.sectionTh ? ` (${g.sectionTh})` : ""} · {g.group === "DEDUCTIBLE" ? "ถือเป็นรายจ่ายได้" : "รายจ่ายต้องห้าม"} · <MoneyText satang={g.vat} decimals />
              </p>
              <ul className="ml-3 text-xs">
                {g.rows.map((x) => {
                  const href = docHref(base, x.docType, x.docId);
                  return (
                    <li key={x.key} data-testid="purchasetax-nonclaim-row">
                      {thDate(x.date)} · {href ? <Link href={href} className="underline">{x.docNo}</Link> : x.docNo} · {x.vendorName || "—"}{x.vendorTaxId ? ` (${x.vendorTaxId})` : ""} · มูลค่า {money(x.base)} · ภาษี {money(x.vat)}
                      {x.notes.length ? ` · ${x.notes.join(" · ")}` : ""}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* รอใบกำกับ — ไม่อยู่ในยอดรายงาน */}
      <section className="flex flex-col gap-2 rounded-lg border p-3 text-sm" data-testid="purchasetax-pending">
        <h3 className="flex flex-wrap items-baseline justify-between gap-2 font-medium">
          <span>
            ภาษีซื้อรอใบกำกับ (ไม่รวมในรายงาน · ณ วันที่ดู) · {pt.pending.rows.length} ใบ · <MoneyText satang={pt.pending.vat} decimals />
          </span>
          <Link href={`${base}/tax/pending-input-vat`} className="text-xs font-normal underline print:hidden" data-testid="purchasetax-pending-link">
            รายการรอใบกำกับทั้งหมด
          </Link>
        </h3>
        {pt.pending.rows.length === 0 ? (
          <p className="text-xs text-[color:var(--color-muted)]">ไม่มีภาษีซื้อรอใบกำกับของเอกสารที่ลงวันที่ถึงสิ้นเดือนนี้</p>
        ) : (
          <ul className="ml-3 text-xs">
            {pt.pending.rows.map((x) => {
              const href = docHref(base, x.sourceDocType, x.sourceId);
              return (
                <li key={x.ptxId} data-testid="purchasetax-pending-row">
                  {thDate(x.sourceDate)} · {href ? <Link href={href} className="underline">{x.sourceDocNo ?? "—"}</Link> : x.sourceDocNo ?? "—"} · {x.vendorName || "—"}
                  {x.vendorTaxId ? ` (${x.vendorTaxId})` : " (ไม่มีเลขผู้เสียภาษี)"} · ภาษีรอ {money(x.vat)} · อายุ {x.ageDays} วัน ·{" "}
                  <span className={x.pastWindow ? "text-[color:var(--color-danger)]" : ""}>{x.pastWindow ? "เลย" : "เคลมได้ถึง"} {x.lastClaimMonthTh ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default PurchaseTaxSection;
