import Link from "next/link";
import { loadAccountSystem, accountPermFlags } from "@/lib/modules/account/guard";
import { parkedOutputVat, type ParkedVatRow } from "@/lib/modules/account/tax-point";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { DataTable } from "@/components/ui/DataList";
import MoneyText from "@/components/ui/MoneyText";
import { formatThaiDate as fmtDate } from "@/lib/ui/date";
import { editorDetailPath } from "@/lib/modules/account/doc-editor-config";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { ParkedVatReleaseForm } from "@/components/account-v2/ParkedVatPanel";

// ACC T1.2 — ภาษีขายที่ค้างพัก (ยังไม่เข้า ภ.พ.30) ต่อใบแจ้งหนี้ พร้อมอายุ + คำเตือนข้ามเดือน + ปล่อยเป็นชุด
//   แหล่งความจริง = GL (2205 สินค้ารอออกใบกำกับ · 2210 บริการรอรับเงิน) ผ่าน tax-point.parkedOutputVat

export default async function ParkedVatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ only?: string; err?: string; msg?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.tax.view" });
  const perm = await accountPermFlags(id);
  const base = `/app/sys/${id}/account`;
  const onlyPastMonth = sp.only === "past";
  const r = await parkedOutputVat({ tenantId, systemId }, { onlyPastMonth });
  const self = `${base}/tax/parked-vat${onlyPastMonth ? "?only=past" : ""}`;
  const formId = "parked-batch";
  const hasService = r.rows.some((x) => x.service > 0);

  return (
    <div className="flex max-w-5xl flex-col gap-6" data-testid="parked-vat-page">
      <PageHeader title="ภาษีขายที่ค้างพัก" back={{ href: `${base}/reports`, label: "รายงาน" }} />
      {sp.err && <p className="text-sm text-[color:var(--color-danger)]" data-testid="parked-err">{sp.err}</p>}
      {sp.msg && <p className="text-sm font-medium" data-testid="parked-msg">{sp.msg}</p>}

      <p className="text-sm text-[color:var(--color-muted)]">
        ภาษีขายที่ยังไม่เข้า ภ.พ.30 — ของสินค้ารอออกใบกำกับ (บัญชี 2205) และของบริการรอรับชำระ (บัญชี 2210) ·
        ใบแจ้งหนี้สินค้าที่ออกหลังเปิดใช้งาน T1.2 ออกใบกำกับพร้อมกันอยู่แล้ว รายการที่ค้างคือข้อมูลเก่าหรือใบที่ปิดสวิตช์ไว้
      </p>

      {r.warning && <LegalWarnings warnings={[r.warning]} testId="parked-total-warning" />}

      <div className="flex flex-wrap gap-6 text-sm" data-testid="parked-totals">
        <span>สินค้า (2205) <MoneyText satang={r.total.goods} decimals /></span>
        <span>บริการ (2210) <MoneyText satang={r.total.service} decimals /></span>
        <span>สินค้าค้างข้ามเดือน {r.total.countPastMonth} ใบ · <MoneyText satang={r.total.goodsPastMonth} decimals /></span>
      </div>

      <div className="flex gap-2 text-sm">
        <Link href={`${base}/tax/parked-vat`} className={`btn btn-sm ${onlyPastMonth ? "btn-ghost" : "btn-primary"}`}>ทั้งหมด</Link>
        <Link href={`${base}/tax/parked-vat?only=past`} className={`btn btn-sm ${onlyPastMonth ? "btn-primary" : "btn-ghost"}`} data-testid="parked-filter-past">ค้างข้ามเดือน</Link>
      </div>

      <Section title={`ใบแจ้งหนี้ที่ยังมีภาษีขายพัก (${r.rows.length} ใบ)`}>
        <DataTable<ParkedVatRow>
          cols={[
            {
              key: "pick",
              header: "เลือก",
              render: (x) =>
                perm.issue && x.goods + x.service > 0 ? (
                  <input type="checkbox" name="id" value={x.documentId} form={formId} defaultChecked={x.pastMonth && x.goods > 0} aria-label={`เลือก ${x.docNo ?? ""}`} data-testid={`parked-pick-${x.docNo}`} />
                ) : null,
            },
            { key: "docNo", header: "เลขที่", render: (x) => <Link href={editorDetailPath(base, "INVOICE", x.documentId)} className="underline">{x.docNo ?? "—"}</Link> },
            { key: "date", header: "วันที่", render: (x) => fmtDate(x.issueDate) },
            { key: "contact", header: "ลูกค้า", render: (x) => x.contactName ?? "—" },
            { key: "goods", header: "VAT สินค้า", align: "right", render: (x) => <MoneyText satang={x.goods} decimals /> },
            { key: "service", header: "VAT บริการ", align: "right", render: (x) => <MoneyText satang={x.service} decimals /> },
            { key: "age", header: "อายุ (วัน)", align: "right", render: (x) => x.ageDays },
            {
              key: "state",
              header: "สถานะ",
              render: (x) =>
                x.warning ? (
                  <span className="text-[color:var(--color-danger)]" data-testid={`parked-flag-${x.docNo}`}>ค้างข้ามเดือน</span>
                ) : x.goods > 0 ? (
                  "รอออกใบกำกับ"
                ) : (
                  "รอรับชำระ (บริการ)"
                ),
            },
          ]}
          rows={r.rows}
          minWidth={820}
          empty="ไม่มีภาษีขายค้างพัก"
          rowKey={(x) => x.documentId}
        />
      </Section>

      {perm.issue && r.rows.length > 0 && (
        <Section title="ปล่อยภาษีขายของใบที่เลือก (ออกใบกำกับตามหลัง)">
          <ParkedVatReleaseForm systemId={systemId} back={self} hasService={hasService} testId={formId} submitLabel="ออกใบกำกับของใบที่เลือก" />
        </Section>
      )}
    </div>
  );
}
