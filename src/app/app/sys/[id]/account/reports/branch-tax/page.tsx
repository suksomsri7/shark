import { MoneyText } from "@/components/ui/MoneyText";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { VAT_FILING_MODE_LABEL_TH } from "@/lib/core/settings/defs/account";
import { branchLabelTh, loadBranches, purchaseTaxReportForBranch, salesTaxReportForBranch } from "@/lib/modules/account/branches";
import { saveBranchesAction } from "@/lib/modules/account/t5b-actions";
import { loadReport, ReportHeader, TableWrap, currentPeriodKey } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T5.11 (A7) — สาขา (สถานประกอบการ) + รายงานภาษีขาย/ซื้อแยกสาขา
const KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function BranchTaxPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string; branch?: string; msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const ctx = { tenantId, systemId };
  const setup = await loadBranches(ctx);
  const month = sp.month && KEY.test(sp.month) ? sp.month : currentPeriodKey();
  const branch = setup.all.find((b) => b.code === sp.branch) ?? setup.home;
  const [sales, purchase] = await Promise.all([salesTaxReportForBranch(ctx, month, branch.code), purchaseTaxReportForBranch(ctx, month, branch.code)]);
  const csv = {
    headers: ["รายงาน", "วันที่", "เลขที่", "คู่ค้า", "เลขผู้เสียภาษี", "ฐานภาษี (บาท)", "ภาษี (บาท)"],
    rows: [
      ...sales.rows.map((r) => ["ภาษีขาย", r.date, r.docNo, r.buyerName, r.buyerTaxId, r.base / 100, r.vat / 100]),
      ...purchase.rows.map((r) => ["ภาษีซื้อ", r.receivedDate, r.invoiceNo, r.vendorName, r.vendorTaxId, r.base / 100, r.vat / 100]),
    ],
  };
  const editRows = [...setup.branches, { code: "", name: "", address: null, isHome: false }];
  return (
    <div className="flex max-w-5xl flex-col gap-4" data-testid="branch-tax-page">
      <ReportHeader base={base} title="สาขาและรายงานภาษีแยกสาขา" subtitle={`${branchLabelTh(branch)} · เดือนภาษี ${month}`} />
      {sp.msg && <p className="rounded-lg border px-3 py-2 text-sm" data-testid="br-msg">{sp.msg}</p>}
      {sp.err && <p className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]" data-testid="br-err">{sp.err}</p>}
      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">สถานประกอบการ
          <select name="branch" defaultValue={branch.code} className="rounded-lg border px-2 py-1.5 text-sm" data-testid="br-select">
            {setup.all.map((b) => (
              <option key={b.code} value={b.code}>{b.code} · {b.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">เดือนภาษี<input type="month" name="month" defaultValue={month} className="rounded-lg border px-2 py-1.5 text-sm" data-testid="br-month" /></label>
        <button type="submit" className="btn btn-primary btn-sm h-9" data-testid="br-apply">แสดง</button>
      </form>
      <ReportToolbar filename={`ภาษีแยกสาขา-${branch.code}-${month}`} csv={csv} mode="none" showCompare={false} />
      <LegalWarnings warnings={sales.branchWarnings} compact collapsible testId="br-warnings" />
      <section>
        <h2 className="mb-1 text-base font-semibold">รายงานภาษีขาย — {sales.header.orgName} · เลขประจำตัวผู้เสียภาษี {sales.header.taxId || "-"} · {sales.header.branchLabel}</h2>
        <TableWrap>
          <thead><tr className="text-left text-[color:var(--color-muted)]"><th className="px-3 py-2">วันที่</th><th className="px-3 py-2">เลขที่</th><th className="px-3 py-2">ผู้ซื้อ</th><th className="px-3 py-2 text-right">ฐานภาษี</th><th className="px-3 py-2 text-right">ภาษี</th></tr></thead>
          <tbody>
            {sales.rows.length === 0 ? <tr className="border-t"><td colSpan={5} className="px-3 py-3 text-center text-[color:var(--color-muted)]">ไม่มีรายการ</td></tr> : sales.rows.map((r) => (
              <tr key={r.key} className="border-t" data-testid="br-sales-row"><td className="px-3 py-1.5">{r.date}</td><td className="px-3 py-1.5">{r.docNo}</td><td className="px-3 py-1.5">{r.buyerName}</td><td className="px-3 py-1.5 text-right"><MoneyText satang={r.base} decimals /></td><td className="px-3 py-1.5 text-right"><MoneyText satang={r.vat} decimals /></td></tr>
            ))}
            <tr className="border-t font-semibold"><td className="px-3 py-1.5" colSpan={3}>รวม</td><td className="px-3 py-1.5 text-right"><MoneyText satang={sales.total.base} decimals /></td><td className="px-3 py-1.5 text-right" data-testid="br-sales-vat"><MoneyText satang={sales.total.vat} decimals /></td></tr>
          </tbody>
        </TableWrap>
      </section>
      <section>
        <h2 className="mb-1 text-base font-semibold">รายงานภาษีซื้อ — {purchase.header.branchLabel}</h2>
        <TableWrap>
          <thead><tr className="text-left text-[color:var(--color-muted)]"><th className="px-3 py-2">วันที่ได้รับ</th><th className="px-3 py-2">เลขที่ใบกำกับ</th><th className="px-3 py-2">ผู้ขาย</th><th className="px-3 py-2 text-right">ฐานภาษี</th><th className="px-3 py-2 text-right">ภาษี</th></tr></thead>
          <tbody>
            {purchase.rows.length === 0 ? <tr className="border-t"><td colSpan={5} className="px-3 py-3 text-center text-[color:var(--color-muted)]">ไม่มีรายการ</td></tr> : purchase.rows.map((r, i) => (
              <tr key={`${r.docNo}-${i}`} className="border-t" data-testid="br-purchase-row"><td className="px-3 py-1.5">{r.receivedDate}</td><td className="px-3 py-1.5">{r.invoiceNo}</td><td className="px-3 py-1.5">{r.vendorName}</td><td className="px-3 py-1.5 text-right"><MoneyText satang={r.base} decimals /></td><td className="px-3 py-1.5 text-right"><MoneyText satang={r.vat} decimals /></td></tr>
            ))}
            <tr className="border-t font-semibold"><td className="px-3 py-1.5" colSpan={3}>รวม</td><td className="px-3 py-1.5 text-right"><MoneyText satang={purchase.branchTotal.base} decimals /></td><td className="px-3 py-1.5 text-right"><MoneyText satang={purchase.branchTotal.vat} decimals /></td></tr>
          </tbody>
        </TableWrap>
      </section>

      <form action={saveBranchesAction} className="flex flex-col gap-2 rounded-lg border p-3 text-sm print:hidden" style={{ borderColor: "var(--color-line)" }} data-testid="br-form">
        <input type="hidden" name="systemId" value={id} />
        <h2 className="text-base font-semibold">สาขาของร้าน</h2>
        <p className="text-xs text-[color:var(--color-muted)]">สาขาตั้งต้นของสมุด: {setup.home.code} · {setup.home.name} (แก้ที่ตั้งค่าข้อมูลกิจการ) · ล้างรหัสและชื่อของแถว = ลบสาขานั้น</p>
        {editRows.map((b, i) => (
          <div key={`${b.code}-${i}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr_2fr]" data-testid="br-edit-row">
            <input name="code" defaultValue={b.code} placeholder="รหัส 5 หลัก" maxLength={5} inputMode="numeric" className="rounded-lg border px-2 py-1.5" data-testid={`br-code-${i}`} />
            <input name="name" defaultValue={b.name} placeholder="ชื่อสาขา" maxLength={120} className="rounded-lg border px-2 py-1.5" data-testid={`br-name-${i}`} />
            <input name="address" defaultValue={b.address ?? ""} placeholder="ที่อยู่สาขา (พิมพ์บนใบกำกับ)" maxLength={300} className="rounded-lg border px-2 py-1.5" />
          </div>
        ))}
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">การยื่น ภ.พ.30
          <select name="vatFilingMode" defaultValue={setup.vatFilingMode} className="rounded-lg border px-2 py-1.5 text-sm sm:w-80" data-testid="br-mode">
            {Object.entries(VAT_FILING_MODE_LABEL_TH).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="ack" value="BRANCH_COMBINED_FILING" data-testid="br-ack" /> ยืนยันว่าได้รับอนุมัติจากอธิบดีให้ยื่นรวมแล้ว (เมื่อเลือกยื่นรวม)</label>
        {setup.warnings.length > 0 && <LegalWarnings warnings={setup.warnings} compact />}
        <div><button type="submit" className="btn btn-primary btn-sm h-9" data-testid="br-save">บันทึกสาขา</button></div>
      </form>
    </div>
  );
}
