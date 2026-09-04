import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { listLedgers, ledgerRunning } from "@/lib/modules/account/coa";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormField } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable } from "@/components/ui/DataList";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatDateTh } from "@/lib/ui/date";

// แยกประเภท: ยอดยกมา + movement รายบรรทัด + ยอดยกไป
export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.journal.view");

  const base = `/app/sys/${id}/account`;
  const ledgers = await listLedgers({ tenantId, systemId });

  // ช่วงเวลา default = เดือนปัจจุบัน (เวลาไทย)
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const from = sp.from || `${now.slice(0, 7)}-01`;
  const to = sp.to || now;
  const accountId = sp.account || "";

  const fromDate = new Date(`${from}T00:00:00.000+07:00`);
  const toDate = new Date(`${to}T23:59:59.999+07:00`);

  // WO 6.1 รอบ 2: ย้าย query มาที่ coa.ledgerRunning (รวมทุกสถานะ — เดิมกรอง POSTED ทำให้ใบที่ถูก
  // กลับรายการเหลือแต่ขากลับ ยอดเพี้ยนคนละทางกับผังบัญชี/งบทดลอง) · ข้อสอบ qc-acc-v2-coa T14 คุมไว้
  const ledgerData = accountId
    ? await ledgerRunning({ tenantId, systemId }, accountId, { from: fromDate, to: toDate })
    : { opening: 0, rows: [], movementDebit: 0, movementCredit: 0, closing: 0 };
  const opening = ledgerData.opening;
  const rows = ledgerData.rows;

  const movementDr = ledgerData.movementDebit;
  const movementCr = ledgerData.movementCredit;
  const closing = ledgerData.closing;
  // WO 6.1 รอบ 2: วันที่ในโมดูลบัญชี V2 ใช้ตัวจัดรูปกลาง (ค.ศ. ตาม UI_STANDARD §3.4) — เดิมหน้านี้โชว์ พ.ศ.
  const fmtDate = (d: Date) => formatDateTh(d);

  // running balance ต่อบรรทัด (คิดใน ledgerRunning แล้ว)
  const lineRows = rows.map((r) => ({ ...r, run: r.running }));

  type LedgerRow =
    | { kind: "open" }
    | ((typeof lineRows)[number] & { kind: "line" })
    | { kind: "total" };

  const tableRows: LedgerRow[] = [
    { kind: "open" },
    ...lineRows.map((r) => ({ kind: "line" as const, ...r })),
    { kind: "total" },
  ];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title="บัญชีแยกประเภท" back={{ href: base, label: "ระบบบัญชี" }} />

      <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="sm:w-64">
          <FormField label="บัญชี">
            <select name="account" defaultValue={accountId} className="input">
              <option value="">— เลือกบัญชี —</option>
              {ledgers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} {l.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="sm:w-40">
          <FormField label="ตั้งแต่">
            <input type="date" name="from" defaultValue={from} className="input" />
          </FormField>
        </div>
        <div className="sm:w-40">
          <FormField label="ถึง">
            <input type="date" name="to" defaultValue={to} className="input" />
          </FormField>
        </div>
        <button className="btn btn-primary text-sm">แสดง</button>
      </form>

      {!accountId ? (
        <EmptyState text="เลือกบัญชีเพื่อดูการเคลื่อนไหว" />
      ) : (
        <DataTable<LedgerRow>
          minWidth={600}
          empty="ยังไม่มีการเคลื่อนไหวในงวดนี้"
          rows={tableRows}
          rowKey={(r, i) => (r.kind === "line" ? r.id : `${r.kind}-${i}`)}
          cols={[
            {
              key: "date",
              header: "วันที่",
              render: (r) =>
                r.kind === "line" ? <span className="whitespace-nowrap">{fmtDate(r.date)}</span> : "",
            },
            {
              key: "doc",
              header: "ใบสำคัญ",
              render: (r) => {
                if (r.kind === "open")
                  return <span className="text-[color:var(--color-muted)]">ยอดยกมา</span>;
                if (r.kind === "total") return <span className="font-medium">เคลื่อนไหวในงวด</span>;
                return (
                  <span>
                    <Link href={`${base}/journal/${r.entryId}`} className="hover:underline">
                      {r.docNo}
                    </Link>
                    {r.memo && (
                      <span className="ml-1 text-xs text-[color:var(--color-muted)]">— {r.memo}</span>
                    )}
                    {r.reversed && (
                      <span
                        className="ml-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] text-[color:var(--color-muted)]"
                        style={{ borderColor: "var(--color-line)" }}
                        title="ใบสำคัญนี้ถูกกลับรายการแล้ว — ยังนับในยอดคู่กับใบกลับรายการ"
                      >
                        กลับรายการแล้ว
                      </span>
                    )}
                  </span>
                );
              },
            },
            {
              key: "debit",
              header: "เดบิต",
              align: "right",
              render: (r) =>
                r.kind === "line" ? (
                  r.debit > 0 ? <MoneyText satang={r.debit} decimals /> : ""
                ) : r.kind === "total" ? (
                  <span className="font-medium">
                    <MoneyText satang={movementDr} decimals />
                  </span>
                ) : (
                  ""
                ),
            },
            {
              key: "credit",
              header: "เครดิต",
              align: "right",
              render: (r) =>
                r.kind === "line" ? (
                  r.credit > 0 ? <MoneyText satang={r.credit} decimals /> : ""
                ) : r.kind === "total" ? (
                  <span className="font-medium">
                    <MoneyText satang={movementCr} decimals />
                  </span>
                ) : (
                  ""
                ),
            },
            {
              key: "balance",
              header: "คงเหลือ",
              align: "right",
              render: (r) =>
                r.kind === "open" ? (
                  <span className="text-[color:var(--color-muted)]">
                    <MoneyText satang={opening} decimals />
                  </span>
                ) : r.kind === "line" ? (
                  <MoneyText satang={r.run} decimals />
                ) : (
                  <span className="font-medium">
                    ยกไป <MoneyText satang={closing} decimals />
                  </span>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
