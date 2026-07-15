import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { pnd, listWhtCredits } from "@/lib/modules/account/wht";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import FormField from "@/components/ui/FormField";
import { DataTable } from "@/components/ui/DataList";
import MoneyText from "@/components/ui/MoneyText";
import { formatThaiDate as fmtDate } from "@/lib/ui/date";


const pct = (bp: number | null) => (bp != null ? `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%` : "—");

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function TaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; type?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const period = sp.period || defaultPeriod();
  const type = sp.type === "3" ? 3 : sp.type === "53" ? 53 : 53;
  const year = period.slice(0, 4);
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;

  const [report, creditYear] = await Promise.all([
    pnd(tenantId, systemId, { type, period }),
    listWhtCredits(tenantId, systemId, { year }),
  ]);

  type SummaryRow = { key: string; label: string; count: number; base: number; wht: number; total?: boolean };
  const summaryRows: SummaryRow[] =
    report.byIncomeType.length === 0
      ? []
      : [
          ...report.byIncomeType.map((b) => ({
            key: String(b.incomeType),
            label: b.label,
            count: b.count,
            base: b.base,
            wht: b.wht,
          })),
          { key: "__total__", label: "รวม", count: report.rows.length, base: report.grandBase, wht: report.grandWht, total: true },
        ];

  type DetailRow = (typeof report.rows)[number];
  type CreditRow = (typeof creditYear.rows)[number];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="ภาษี — ภ.ง.ด.3 / 53 · เครดิตภาษีถูกหัก"
        back={{ href: `${base}/wht`, label: "หัก ณ ที่จ่าย (50 ทวิ)" }}
      />

      {/* ตัวกรอง */}
      <form className="flex flex-wrap items-end gap-2">
        <FormField label="แบบ">
          <select name="type" defaultValue={String(type)} className="input">
            <option value="3">ภ.ง.ด.3 (บุคคลธรรมดา)</option>
            <option value="53">ภ.ง.ด.53 (นิติบุคคล)</option>
          </select>
        </FormField>
        <FormField label="งวด">
          <input name="period" type="month" defaultValue={period} className="input" />
        </FormField>
        <button className="btn btn-primary text-sm">ดู</button>
        <a href={`${base}/tax/export?kind=pnd&type=${type}&period=${period}`} className="btn btn-ghost text-sm">ดาวน์โหลด CSV (ภ.ง.ด.)</a>
      </form>

      {/* สรุปตามประเภทเงินได้ */}
      <Section title={`ภ.ง.ด.${type} — งวด ${period} · สรุปตามประเภทเงินได้`}>
        <DataTable<SummaryRow>
          cols={[
            { key: "label", header: "ประเภทเงินได้", render: (r) => (r.total ? <span className="font-semibold">{r.label}</span> : r.label) },
            { key: "count", header: "ราย", align: "right", render: (r) => (r.total ? <span className="font-semibold">{r.count}</span> : r.count) },
            { key: "base", header: "ฐานเงินได้", align: "right", render: (r) => <span className={r.total ? "font-semibold" : undefined}><MoneyText satang={r.base} decimals /></span> },
            { key: "wht", header: "ภาษีที่หัก", align: "right", render: (r) => <span className={r.total ? "font-semibold" : "font-medium"}><MoneyText satang={r.wht} decimals /></span> },
          ]}
          rows={summaryRows}
          minWidth={520}
          empty="ไม่มี 50 ทวิ ในงวดนี้"
          rowKey={(r) => r.key}
        />
      </Section>

      {/* รายตัว 50 ทวิ */}
      {report.rows.length > 0 && (
        <Section title="รายการ 50 ทวิ (รายใบ)">
          <DataTable<DetailRow>
            cols={[
              { key: "seq", header: "#", render: (r) => r.seq },
              { key: "certNo", header: "เลขที่", render: (r) => <Link href={`${base}/wht/${r.certId}/print`} className="underline">{r.certNo}</Link> },
              { key: "recipient", header: "ผู้รับเงิน", render: (r) => r.recipientName },
              { key: "taxId", header: "เลขภาษี", render: (r) => r.recipientTaxId ?? "—" },
              { key: "income", header: "ประเภท", render: (r) => r.incomeLabel },
              { key: "base", header: "ฐาน", align: "right", render: (r) => <MoneyText satang={r.base} decimals /> },
              { key: "rate", header: "อัตรา", align: "right", render: (r) => pct(r.whtRateBp) },
              { key: "wht", header: "ภาษี", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.whtAmount} decimals /></span> },
            ]}
            rows={report.rows}
            minWidth={760}
            empty="ไม่มีรายการ"
            rowKey={(r) => r.certId}
          />
        </Section>
      )}

      {/* เครดิตภาษีถูกหัก สะสมทั้งปี */}
      <Section
        title={`เครดิตภาษีถูกหัก (สะสม 1160) — ปี ${year}`}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-[color:var(--color-muted)]">รวม <MoneyText satang={creditYear.totalWht} decimals /></span>
            <a href={`${base}/tax/export?kind=credits&year=${year}`} className="btn btn-ghost text-sm">ดาวน์โหลด CSV</a>
          </div>
        }
      >
        <DataTable<CreditRow>
          cols={[
            { key: "date", header: "วันที่", render: (r) => fmtDate(r.paidAt) },
            { key: "doc", header: "เอกสาร", render: (r) => r.docNo ?? "—" },
            { key: "payer", header: "ผู้หัก", render: (r) => r.contactName },
            { key: "wht", header: "ภาษีถูกหัก", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.whtAmount} decimals /></span> },
            { key: "copy", header: "สำเนา", render: (r) => (r.hasCertCopy ? "✓" : "—") },
          ]}
          rows={creditYear.rows}
          minWidth={560}
          empty="ไม่มีรายการถูกหักในปีนี้"
          rowKey={(r) => r.paymentId}
        />
      </Section>
    </div>
  );
}
