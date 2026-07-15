import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { listWhtCredits, listWhtDeductions, WHT_INCOME_LABEL } from "@/lib/modules/account/wht";
import { issueWhtCertAction } from "./actions";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import FormField from "@/components/ui/FormField";
import TabPills from "@/components/ui/TabPills";
import { DataTable } from "@/components/ui/DataList";
import MoneyText from "@/components/ui/MoneyText";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatThaiDate as fmtDate } from "@/lib/ui/date";


const pct = (bp: number | null) => (bp != null ? `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%` : "—");

const INCOME_TYPES = Object.entries(WHT_INCOME_LABEL) as [keyof typeof WHT_INCOME_LABEL, string][];

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function WhtPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; err?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { period: periodQ, err, tab } = await searchParams;
  const period = periodQ || defaultPeriod();
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;

  const [credits, deductions] = await Promise.all([
    listWhtCredits(tenantId, systemId, { period }),
    listWhtDeductions(tenantId, systemId, { period }),
  ]);
  const view = tab === "credit" ? "credit" : "deduct";
  type DeductRow = (typeof deductions.rows)[number];
  type CreditRow = (typeof credits.rows)[number];

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="ภาษีหัก ณ ที่จ่าย (50 ทวิ)"
        back={{ href: base, label: "ระบบบัญชี" }}
      />

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}

      {/* งวด + ลิงก์ ภ.ง.ด. */}
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={view} />
        <FormField label="งวด (เดือน)">
          <input name="period" type="month" defaultValue={period} className="input" />
        </FormField>
        <button className="btn btn-primary text-sm">ดู</button>
        <Link href={`${base}/tax?period=${period}`} className="btn btn-ghost text-sm">ภ.ง.ด.3/53 ›</Link>
      </form>

      {/* แท็บ */}
      <TabPills
        active={view}
        tabs={[
          { key: "deduct", label: "เราหักผู้ขาย (ออก 50 ทวิ)", href: `${base}/wht?tab=deduct&period=${period}` },
          { key: "credit", label: "ถูกหัก (เครดิตภาษี)", href: `${base}/wht?tab=credit&period=${period}` },
        ]}
      />

      {view === "deduct" ? (
        <Section
          title="ภาษีที่เราหักผู้ขาย"
          actions={<span className="text-sm text-[color:var(--color-muted)]">รวม <MoneyText satang={deductions.totalWht} decimals /></span>}
        >
          <DataTable<DeductRow>
            cols={[
              { key: "date", header: "วันที่", render: (r) => fmtDate(r.paidAt) },
              {
                key: "recipient",
                header: "ผู้รับเงิน",
                render: (r) => (
                  <div>
                    <div>{r.contactName}</div>
                    {r.contactTaxId && <div className="text-[color:var(--color-muted)]">{r.contactTaxId}</div>}
                  </div>
                ),
              },
              { key: "base", header: "ฐาน", align: "right", render: (r) => (r.base != null ? <MoneyText satang={r.base} decimals /> : "—") },
              { key: "rate", header: "อัตรา", align: "right", render: (r) => pct(r.whtRateBp) },
              { key: "wht", header: "ภาษีหัก", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.whtAmount} decimals /></span> },
              {
                key: "cert",
                header: "50 ทวิ",
                render: (r) =>
                  r.certDocId ? (
                    <Link href={`${base}/wht/${r.certDocId}/print`} className="underline">
                      {r.certNo ?? "พิมพ์"}
                    </Link>
                  ) : (
                    <form action={issueWhtCertAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="paymentId" value={r.paymentId} />
                      <select name="whtIncomeType" defaultValue="M40_8" className="input">
                        {INCOME_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                      {r.whtRateBp == null && (
                        <input name="whtRateBp" type="number" placeholder="อัตรา (300 = 3%)" className="input w-32" />
                      )}
                      <SubmitButton pendingText="กำลังออก…">ออก 50 ทวิ</SubmitButton>
                    </form>
                  ),
              },
            ]}
            rows={deductions.rows}
            minWidth={640}
            empty="ไม่มีรายการในงวดนี้"
            rowKey={(r) => r.paymentId}
          />
        </Section>
      ) : (
        <Section
          title="ภาษีถูกหัก (เครดิตภาษี)"
          actions={<span className="text-sm text-[color:var(--color-muted)]">รวม <MoneyText satang={credits.totalWht} decimals /></span>}
        >
          <DataTable<CreditRow>
            cols={[
              { key: "date", header: "วันที่", render: (r) => fmtDate(r.paidAt) },
              { key: "doc", header: "เอกสาร", render: (r) => r.docNo ?? "—" },
              {
                key: "payer",
                header: "ผู้หัก (ลูกค้า)",
                render: (r) => (
                  <div>
                    <div>{r.contactName}</div>
                    {r.contactTaxId && <div className="text-[color:var(--color-muted)]">{r.contactTaxId}</div>}
                  </div>
                ),
              },
              { key: "base", header: "ฐาน", align: "right", render: (r) => (r.base != null ? <MoneyText satang={r.base} decimals /> : "—") },
              { key: "rate", header: "อัตรา", align: "right", render: (r) => pct(r.whtRateBp) },
              { key: "wht", header: "ภาษีถูกหัก", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.whtAmount} decimals /></span> },
              { key: "copy", header: "สำเนา 50 ทวิ", render: (r) => (r.hasCertCopy ? "✓" : "—") },
            ]}
            rows={credits.rows}
            minWidth={680}
            empty="ไม่มีรายการในงวดนี้"
            rowKey={(r) => r.paymentId}
          />
        </Section>
      )}
    </div>
  );
}
