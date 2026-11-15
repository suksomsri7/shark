import Link from "next/link";
import { loadAccountSystem, accountPageGate } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { bookHeaderOf, ledgerBookAll, paginateBookRows, type BookRow } from "@/lib/modules/account/books-report";
import { formatDateTh } from "@/lib/ui/date";
import { BookPrintPages } from "@/components/account-v2/BookPrintPages";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import ReportToolbar from "../../reports/ReportToolbar";

// ใบพิมพ์/ส่งออกบัญชีแยกประเภท (ACC T4.2 · ปิด D3 K5)
//   ?account= บัญชีเดียว · ไม่ส่ง = ทุกบัญชีที่มียอดยกมาหรือเคลื่อนไหวในช่วง (เรียงรหัส) · ยอดยกมา → รายการ → ยอดยกไป ต่อบัญชี
//   หัวทุกหน้า: ชื่อกิจการ · เลขผู้เสียภาษี · สาขา · "บัญชีแยกประเภท" · ช่วงวันที่ · หน้า i/N · Excel = CSV ทุกบรรทัด
const ROWS_PER_PAGE = 36;

export default async function LedgerPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  accountPageGate(auth, "account.journal.view");
  assertAccountCan(auth, "account.journal.view");
  const ctx = { tenantId, systemId };
  const base = `/app/sys/${id}/account`;
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : `${now.slice(0, 7)}-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : now;
  const title = "บัญชีแยกประเภท";

  const [header, accounts] = await Promise.all([
    bookHeaderOf(ctx, title),
    ledgerBookAll(ctx, { from: new Date(`${from}T00:00:00.000+07:00`), to: new Date(`${to}T23:59:59.999+07:00`) }, sp.account || null),
  ]);

  const rows: BookRow[] = [];
  for (const a of accounts) {
    rows.push({ kind: "group", cells: [`${a.code} ${a.name}`, "", "", null, null, null], keepWithNext: true });
    rows.push({ kind: "total", cells: ["", "", "ยอดยกมา", null, null, a.opening] });
    for (const l of a.lines) rows.push({ kind: "line", cells: [formatDateTh(l.date), l.docNo, l.memo ?? "", l.debit || null, l.credit || null, l.balance] });
    rows.push({ kind: "total", cells: ["", "", "รวม / ยอดยกไป", a.debit, a.credit, a.closing] });
  }
  const pages = paginateBookRows(rows, ROWS_PER_PAGE);
  const periodLabel = `${formatDateTh(from)} ถึง ${formatDateTh(to)}`;
  const csv = {
    preamble: [header.orgName || "-", `${title} · ${periodLabel}`],
    headers: ["รหัสบัญชี", "ชื่อบัญชี", "วันที่", "เลขที่ใบสำคัญ", "คำอธิบาย", "เดบิต", "เครดิต", "คงเหลือ"],
    rows: accounts.flatMap((a) => [
      [a.code, a.name, "", "", "ยอดยกมา", "", "", a.opening / 100] as (string | number)[],
      ...a.lines.map((l) => [a.code, a.name, formatDateTh(l.date), l.docNo, l.memo ?? "", l.debit / 100, l.credit / 100, l.balance / 100] as (string | number)[]),
      [a.code, a.name, "", "", "ยอดยกไป", a.debit / 100, a.credit / 100, a.closing / 100] as (string | number)[],
    ]),
  };

  return (
    <div className="flex flex-col gap-4 p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`${base}/ledger?${sp.account ? `account=${sp.account}&` : ""}from=${from}&to=${to}`} className="text-sm text-[color:var(--color-muted)]">
          ← กลับไปบัญชีแยกประเภท
        </Link>
        <ReportToolbar filename={`${title}-${from}-${to}`} csv={csv} mode="none" showCompare={false} />
      </div>
      <div className="print:hidden">
        <LegalWarnings warnings={header.warnings} testId="ledger-book-warnings" />
      </div>
      <p className="text-sm print:hidden" data-testid="ledger-book-summary">
        {accounts.length} บัญชี · {pages.length} หน้า
      </p>
      <BookPrintPages
        header={header}
        title={title}
        periodLabel={periodLabel}
        testId="ledger-book"
        columns={[
          { label: "วันที่", className: "whitespace-nowrap" },
          { label: "เลขที่ใบสำคัญ", className: "whitespace-nowrap font-mono" },
          { label: "คำอธิบาย" },
          { label: "เดบิต", align: "right", money: true },
          { label: "เครดิต", align: "right", money: true },
          { label: "คงเหลือ", align: "right", money: true },
        ]}
        pages={pages}
      />
    </div>
  );
}
