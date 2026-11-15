import Link from "next/link";
import { MoneyText } from "@/components/ui/MoneyText";
import { DateInput } from "@/components/account-v2/DateInput";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { prisma } from "@/lib/core/db";
import { resolveBookSettings } from "@/lib/core/settings";
import { ACCOUNT_SETTING_KEYS, DEEMED_SALE_MODE_LABEL_TH } from "@/lib/core/settings/defs/account";
import { GOODS_OUT_KINDS, GOODS_OUT_LABEL_TH, giveawayDeemedSales, goodsPeriodReport, wasteLog } from "@/lib/modules/account/goods-report";
import { saveDeemedSaleAction, saveWasteEvidenceAction } from "@/lib/modules/account/t5b-actions";
import { vatRateBpAt } from "@/lib/modules/account/legal-values";
import { loadReport, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T5.9 (E14 H4 H5 H6) — รายงานสินค้าและวัตถุดิบ (รับ/จ่าย/คงเหลือ) · บันทึกของเสีย/ทำลาย · ของแถม + ถือเป็นขาย
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const TABS = [
  { key: "report", label: "รับ · จ่าย · คงเหลือ" },
  { key: "waste", label: "ของเสีย/ทำลาย" },
  { key: "deemed", label: "ของแถม · ถือเป็นขาย" },
] as const;
const qty = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 4 });
const bkkToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export default async function GoodsReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; tab?: string; msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const ctx = { tenantId, systemId };
  const to = sp.to && YMD.test(sp.to) ? sp.to : bkkToday();
  const from = sp.from && YMD.test(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 7)}-01`;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "report";
  const q = (t: string) => `?tab=${t}&from=${from}&to=${to}`;

  let body: React.ReactNode = null;
  let csv: { headers: string[]; rows: (string | number)[][] } = { headers: [], rows: [] };
  if (tab === "report") {
    const r = await goodsPeriodReport(ctx, from, to);
    csv = {
      headers: ["สินค้า", "รหัส", "หน่วย", "ยกมา (จำนวน)", "ยกมา (บาท)", "รับ (จำนวน)", "รับ (บาท)", ...GOODS_OUT_KINDS.flatMap((k) => [`${GOODS_OUT_LABEL_TH[k]} (จำนวน)`, `${GOODS_OUT_LABEL_TH[k]} (บาท)`]), "คงเหลือ (จำนวน)", "คงเหลือ (บาท)"],
      rows: r.rows.map((x) => [x.name, x.sku ?? "", x.unit ?? "", x.opening.qty, x.opening.valueSatang / 100, x.receipts.qty, x.receipts.valueSatang / 100, ...GOODS_OUT_KINDS.flatMap((k) => [x.issues[k].qty, x.issues[k].valueSatang / 100]), x.closing.qty, x.closing.valueSatang / 100]),
    };
    const shown = GOODS_OUT_KINDS.filter((k) => r.totals.issues[k].qty !== 0);
    body = (
      <>
        <LegalWarnings warnings={r.warnings} compact collapsible testId="goods-warnings" />
        <TableWrap>
          <thead>
            <tr className="text-left text-[color:var(--color-muted)]">
              <th className="px-3 py-2">สินค้า</th>
              <th className="px-3 py-2 text-right">ยกมา</th>
              <th className="px-3 py-2 text-right">รับ</th>
              {shown.map((k) => (
                <th key={k} className="px-3 py-2 text-right">{GOODS_OUT_LABEL_TH[k]}</th>
              ))}
              <th className="px-3 py-2 text-right">คงเหลือ</th>
              <th className="px-3 py-2 text-right">ต้นทุนคงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.length === 0 ? (
              <tr className="border-t"><td colSpan={5 + shown.length} className="px-3 py-4 text-center text-[color:var(--color-muted)]">ไม่มีความเคลื่อนไหวของสินค้าที่ผูกคลังในช่วงนี้</td></tr>
            ) : (
              r.rows.map((x) => (
                <tr key={x.productId} className="border-t" data-testid="goods-row">
                  <td className="px-3 py-1.5">{x.name}{x.unit ? <span className="text-xs text-[color:var(--color-muted)]"> ({x.unit})</span> : null}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{qty(x.opening.qty)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{qty(x.receipts.qty)}</td>
                  {shown.map((k) => (
                    <td key={k} className="px-3 py-1.5 text-right tabular-nums">{qty(x.issues[k].qty)}</td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{qty(x.closing.qty)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={x.closing.valueSatang} decimals /></td>
                </tr>
              ))
            )}
            <tr className="border-t font-semibold" data-testid="goods-total">
              <td className="px-3 py-1.5">รวมต้นทุน</td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.opening.valueSatang} decimals /></td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.receipts.valueSatang} decimals /></td>
              {shown.map((k) => (
                <td key={k} className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.issues[k].valueSatang} decimals /></td>
              ))}
              <td />
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.closing.valueSatang} decimals /></td>
            </tr>
          </tbody>
        </TableWrap>
      </>
    );
  } else if (tab === "waste") {
    const w = await wasteLog(ctx, from, to);
    csv = { headers: ["วันที่", "เลขที่", "สาเหตุ", "รายการ", "ต้นทุน (บาท)", "ผู้ทำ", "ผู้อนุมัติ", "พยาน", "รูป"], rows: w.rows.map((r) => [r.date, r.docNo ?? "", r.reasonLabel, r.items.map((i) => `${i.name} × ${i.qty}`).join("; "), r.costTotalSatang / 100, r.createdByName ?? "", r.approvedByName ?? "", r.evidence.witnessName ?? "", r.photos]) };
    body = (
      <div className="flex flex-col gap-3" data-testid="waste-log">
        <p className="text-sm text-[color:var(--color-muted)]">ใบเบิกสาเหตุของเสีย/ทำลาย · ชำรุด/สูญหาย · สินค้าขาด ในช่วงวันที่ — พิมพ์หน้านี้เป็นรายงานการทำลายได้ · รวมต้นทุน <MoneyText satang={w.costTotalSatang} decimals /></p>
        {w.rows.length === 0 && <p className="rounded-lg border px-3 py-4 text-center text-sm text-[color:var(--color-muted)]">ไม่มีใบเบิกของเสีย/ทำลายในช่วงนี้</p>}
        {w.rows.map((r) => (
          <div key={r.documentId} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--color-line)" }} data-testid="waste-row">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`${base}/docs/GOODS_ISSUE/${r.documentId}`} className="font-medium hover:underline">{r.docNo ?? "-"}</Link>
              <span className="text-[color:var(--color-muted)]">{r.date} · {r.reasonLabel}</span>
              <span className="font-medium"><MoneyText satang={r.costTotalSatang} decimals /></span>
            </div>
            <ul className="mt-1 list-disc pl-5 text-[color:var(--color-muted)]">
              {r.items.map((i, k) => (
                <li key={k}>{i.name} × {qty(i.qty)}</li>
              ))}
            </ul>
            <p className="mt-1">ผู้ทำ: {r.createdByName ?? "-"} · ผู้อนุมัติ: {r.approvedByName ?? "-"} · พยาน: {r.evidence.witnessName ?? "-"}{r.evidence.witnessRole ? ` (${r.evidence.witnessRole})` : ""} · รูป {r.photos} ไฟล์</p>
            {r.warnings.length > 0 && <div className="mt-2"><LegalWarnings warnings={r.warnings} compact /></div>}
            <form action={saveWasteEvidenceAction} className="mt-2 flex flex-wrap items-end gap-2 print:hidden">
              <input type="hidden" name="systemId" value={id} />
              <input type="hidden" name="documentId" value={r.documentId} />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">พยาน<input name="witnessName" defaultValue={r.evidence.witnessName ?? ""} maxLength={200} className="rounded-lg border px-2 py-1.5 text-sm" data-testid="waste-witness" /></label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">ตำแหน่ง<input name="witnessRole" defaultValue={r.evidence.witnessRole ?? ""} maxLength={200} className="rounded-lg border px-2 py-1.5 text-sm" /></label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">วิธีทำลาย/ตรวจสภาพ<input name="method" defaultValue={r.evidence.method ?? ""} maxLength={200} className="rounded-lg border px-2 py-1.5 text-sm" /></label>
              <button type="submit" className="btn btn-sm btn-secondary h-9" data-testid="waste-save">บันทึกพยาน</button>
            </form>
          </div>
        ))}
      </div>
    );
  } else {
    const [st, set] = await Promise.all([
      prisma.accountSettings.findFirst({ where: { systemId }, select: { vatRegistered: true } }),
      resolveBookSettings({ tenantId }, [ACCOUNT_SETTING_KEYS.deemedSale], systemId),
    ]);
    const mode = set[ACCOUNT_SETTING_KEYS.deemedSale]?.value === "OFF" ? "OFF" : "WARN";
    const g = await giveawayDeemedSales(ctx, from, to, { setting: mode, vatRateBp: await vatRateBpAt(ctx, new Date(`${to}T12:00:00+07:00`)), vatRegistered: st?.vatRegistered ?? true });
    csv = { headers: ["ชนิด", "วันที่", "เลขที่", "สาเหตุ", "ต้นทุน (บาท)", "ราคาตลาดโดยประมาณ (บาท)", "ภาษีขายโดยประมาณ (บาท)"], rows: [...g.giveaways.map((r) => ["ของแถม", r.date, r.docNo ?? "", r.reasonLabel, r.costSatang / 100, "", ""]), ...g.deemed.map((r) => ["ถือเป็นขาย", r.date, r.docNo ?? "", r.reasonLabel, r.costSatang / 100, mode === "OFF" ? "" : r.marketValueSatang / 100, mode === "OFF" ? "" : r.vatSatang / 100])] };
    body = (
      <div className="flex flex-col gap-4" data-testid="deemed-tab">
        <form action={saveDeemedSaleAction} className="flex flex-wrap items-end gap-2 print:hidden">
          <input type="hidden" name="systemId" value={id} />
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">สินค้าใช้ส่วนตัว/ขาด ถือเป็นการขาย
            <select name="deemedSale" defaultValue={mode} className="rounded-lg border px-2 py-1.5 text-sm" data-testid="deemed-setting">
              {Object.entries(DEEMED_SALE_MODE_LABEL_TH).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-sm btn-secondary h-9" data-testid="deemed-save">บันทึก</button>
        </form>
        {g.warnings.length > 0 && <LegalWarnings warnings={g.warnings} compact collapsible testId="deemed-warnings" />}
        <section>
          <h2 className="mb-1 text-base font-semibold">ของแถม/ตัวอย่าง</h2>
          <TableWrap>
            <thead><tr className="text-left text-[color:var(--color-muted)]"><th className="px-3 py-2">วันที่</th><th className="px-3 py-2">เลขที่</th><th className="px-3 py-2">สาเหตุ</th><th className="px-3 py-2 text-right">ต้นทุน</th></tr></thead>
            <tbody>
              {g.giveaways.length === 0 ? <tr className="border-t"><td colSpan={4} className="px-3 py-3 text-center text-[color:var(--color-muted)]">ไม่มี</td></tr> : g.giveaways.map((r) => (
                <tr key={r.documentId} className="border-t" data-testid="giveaway-row"><td className="px-3 py-1.5">{r.date}</td><td className="px-3 py-1.5">{r.docNo}</td><td className="px-3 py-1.5">{r.reasonLabel}</td><td className="px-3 py-1.5 text-right"><MoneyText satang={r.costSatang} decimals /></td></tr>
              ))}
            </tbody>
          </TableWrap>
        </section>
        <section>
          <h2 className="mb-1 text-base font-semibold">ถือเป็นการขาย (ใช้ส่วนตัว · สินค้าขาด)</h2>
          <TableWrap>
            <thead><tr className="text-left text-[color:var(--color-muted)]"><th className="px-3 py-2">วันที่</th><th className="px-3 py-2">เลขที่</th><th className="px-3 py-2">สาเหตุ</th><th className="px-3 py-2 text-right">ต้นทุน</th>{mode === "WARN" && <><th className="px-3 py-2 text-right">ราคาตลาดโดยประมาณ</th><th className="px-3 py-2 text-right">ภาษีขายโดยประมาณ</th></>}</tr></thead>
            <tbody>
              {g.deemed.length === 0 ? <tr className="border-t"><td colSpan={mode === "WARN" ? 6 : 4} className="px-3 py-3 text-center text-[color:var(--color-muted)]">ไม่มี</td></tr> : g.deemed.map((r) => (
                <tr key={r.documentId} className="border-t" data-testid="deemed-row"><td className="px-3 py-1.5">{r.date}</td><td className="px-3 py-1.5">{r.docNo}</td><td className="px-3 py-1.5">{r.reasonLabel}</td><td className="px-3 py-1.5 text-right"><MoneyText satang={r.costSatang} decimals /></td>{mode === "WARN" && <><td className="px-3 py-1.5 text-right"><MoneyText satang={r.marketValueSatang} decimals />{r.marketBasis === "COST" ? <span className="text-xs text-[color:var(--color-muted)]"> (ไม่มีราคาขาย ใช้ต้นทุน)</span> : null}</td><td className="px-3 py-1.5 text-right" data-testid="deemed-vat"><MoneyText satang={r.vatSatang} decimals /></td></>}</tr>
              ))}
            </tbody>
          </TableWrap>
        </section>
      </div>
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-4" data-testid="goods-page">
      <ReportHeader base={base} title="รายงานสินค้าและวัตถุดิบ" subtitle={`${from} ถึง ${to}`} />
      {sp.msg && <p className="rounded-lg border px-3 py-2 text-sm" data-testid="goods-msg">{sp.msg}</p>}
      {sp.err && <p className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]" data-testid="goods-err">{sp.err}</p>}
      <nav className="flex flex-wrap gap-2 print:hidden" data-testid="goods-tabs">
        {TABS.map((t) => (
          <Link key={t.key} href={q(t.key)} className={`rounded-full border px-3 py-1 text-sm ${t.key === tab ? "bg-[color:var(--color-surface-2)] font-semibold" : ""}`} data-testid={`goods-tab-${t.key}`}>{t.label}</Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
        <input type="hidden" name="tab" value={tab} />
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">ตั้งแต่<DateInput name="from" defaultValue={from} testId="goods-from" /></label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">ถึง<DateInput name="to" defaultValue={to} testId="goods-to" /></label>
        <button type="submit" className="btn btn-primary btn-sm h-9" data-testid="goods-apply">แสดง</button>
      </form>
      <ReportToolbar filename={`สินค้า-${tab}-${from}-${to}`} csv={csv} mode="none" showCompare={false} />
      {body}
    </div>
  );
}
