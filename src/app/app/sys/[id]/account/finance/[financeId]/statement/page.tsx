import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { financeStatement, FINANCE_TYPE_LABEL } from "@/lib/modules/account/finance";
import PageHeader from "@/components/ui/PageHeader";
import FormField from "@/components/ui/FormField";
import { DataTable } from "@/components/ui/DataList";
import MoneyText from "@/components/ui/MoneyText";
import { formatThaiDate as fmtDate } from "@/lib/ui/date";


export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; financeId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id, financeId } = await params;
  const { from, to } = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const stmt = await financeStatement(tenantId, systemId, financeId, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  if (!stmt || !stmt.account) notFound();
  const base = `/app/sys/${id}/account`;
  type Row = (typeof stmt.rows)[number];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={stmt.account.name}
        back={{ href: `${base}/finance`, label: "บัญชีเงิน" }}
        desc={FINANCE_TYPE_LABEL[stmt.account.type]}
      />

      {/* ตัวกรองช่วงเวลา */}
      <form className="flex flex-wrap items-end gap-2">
        <FormField label="ตั้งแต่">
          <input name="from" type="date" defaultValue={from} className="input" />
        </FormField>
        <FormField label="ถึง">
          <input name="to" type="date" defaultValue={to} className="input" />
        </FormField>
        <button className="btn btn-primary text-sm">กรอง</button>
      </form>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
        <span className="text-[color:var(--color-muted)]">ยอดยกมา</span>
        <span className="font-semibold"><MoneyText satang={stmt.opening} decimals /></span>
      </div>

      <DataTable<Row>
        cols={[
          { key: "date", header: "วันที่", render: (r) => fmtDate(r.date) },
          { key: "docNo", header: "เลขที่", render: (r) => <span className="text-xs">{r.docNo}</span> },
          { key: "memo", header: "รายการ", render: (r) => r.memo ?? "—" },
          { key: "debit", header: "รับ", align: "right", render: (r) => (r.debit > 0 ? <MoneyText satang={r.debit} decimals /> : "") },
          { key: "credit", header: "จ่าย", align: "right", render: (r) => (r.credit > 0 ? <MoneyText satang={r.credit} decimals /> : "") },
          { key: "balance", header: "คงเหลือ", align: "right", render: (r) => <span className="font-medium"><MoneyText satang={r.balance} decimals /></span> },
        ]}
        rows={stmt.rows}
        minWidth={620}
        empty="ไม่มีความเคลื่อนไหวในช่วงที่เลือก"
        rowKey={(r, i) => `${r.entryId}-${i}`}
      />

      <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
        <span className="text-[color:var(--color-muted)]">ยอดคงเหลือปลายงวด</span>
        <span className="font-semibold"><MoneyText satang={stmt.closing} decimals /></span>
      </div>
    </div>
  );
}
