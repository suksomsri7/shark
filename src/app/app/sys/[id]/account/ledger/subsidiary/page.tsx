import Link from "next/link";
import { loadAccountSystem, accountPageGate } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { bookHeaderOf, paginateBookRows, subsidiaryLedger, SUBSIDIARY_TITLE_TH, type BookRow, type SubsidiarySide } from "@/lib/modules/account/books-report";
import { formatDateTh } from "@/lib/ui/date";
import { BookPrintPages } from "@/components/account-v2/BookPrintPages";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import ReportToolbar from "../../reports/ReportToolbar";

// บัญชีย่อยลูกหนี้/เจ้าหนี้รายตัว จากบัญชีแยกประเภท (ACC T4.2 · ปิด D3) — ประกาศกรมทะเบียนการค้า 2544 ข้อ 3 (แยกประเภทลูกหนี้ · เจ้าหนี้) ข้อ 6
//   สรุปต่อผู้ติดต่อ: ยอดยกมา · เดบิต · เครดิต · ยอดยกไป (ผลรวม = ยอดบัญชีคุมใน GL) · กดชื่อ = รายการของผู้ติดต่อนั้น
const ROWS_PER_PAGE = 36;

export default async function SubsidiaryLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string; from?: string; to?: string; contact?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  accountPageGate(auth, "account.journal.view");
  assertAccountCan(auth, "account.journal.view");
  const ctx = { tenantId, systemId };
  const base = `/app/sys/${id}/account`;
  const side: SubsidiarySide = sp.side === "AP" ? "AP" : "AR";
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : `${now.slice(0, 7)}-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : now;
  const title = SUBSIDIARY_TITLE_TH[side];

  const [header, data] = await Promise.all([
    bookHeaderOf(ctx, title),
    subsidiaryLedger(ctx, { side, from: new Date(`${from}T00:00:00.000+07:00`), to: new Date(`${to}T23:59:59.999+07:00`), contactId: sp.contact ?? undefined }),
  ]);
  const periodLabel = `${formatDateTh(from)} ถึง ${formatDateTh(to)}${data.account ? ` · บัญชีคุม ${data.account.code} ${data.account.name}` : ""}`;
  const q = (extra: string) => `${base}/ledger/subsidiary?side=${side}&from=${from}&to=${to}${extra}`;

  const detail = data.detail;
  const rows: BookRow[] = detail
    ? [
        { kind: "group", cells: [detail.contactName, "", "", null, null, null], keepWithNext: true },
        { kind: "total", cells: ["", "", "ยอดยกมา", null, null, detail.opening] },
        ...detail.lines.map((l) => ({ kind: "line" as const, cells: [formatDateTh(l.date), l.docNo, l.memo ?? "", l.debit || null, l.credit || null, l.balance] })),
        { kind: "total", cells: ["", "", "ยอดยกไป", null, null, detail.closing] },
      ]
    : [
        ...data.rows.map((r) => ({ kind: "line" as const, cells: [r.contactName, r.opening, r.debit, r.credit, r.closing] })),
        { kind: "total", cells: ["รวม (= ยอดบัญชีคุม)", data.totals.opening, data.totals.debit, data.totals.credit, data.totals.closing] },
      ];
  const pages = paginateBookRows(rows, ROWS_PER_PAGE);
  const csv = detail
    ? {
        preamble: [header.orgName || "-", `${title} · ${detail.contactName} · ${periodLabel}`],
        headers: ["วันที่", "เลขที่ใบสำคัญ", "คำอธิบาย", "เดบิต", "เครดิต", "คงเหลือ"],
        rows: [["", "", "ยอดยกมา", "", "", detail.opening / 100], ...detail.lines.map((l) => [formatDateTh(l.date), l.docNo, l.memo ?? "", l.debit / 100, l.credit / 100, l.balance / 100])] as (string | number)[][],
      }
    : {
        preamble: [header.orgName || "-", `${title} · ${periodLabel}`],
        headers: ["ผู้ติดต่อ", "ยอดยกมา", "เดบิต", "เครดิต", "ยอดยกไป"],
        rows: data.rows.map((r) => [r.contactName, r.opening / 100, r.debit / 100, r.credit / 100, r.closing / 100]) as (string | number)[][],
      };

  return (
    <div className="flex flex-col gap-4 p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`${base}/ledger?from=${from}&to=${to}`} className="text-sm text-[color:var(--color-muted)]">
          ← บัญชีแยกประเภท
        </Link>
        <ReportToolbar filename={`${title}-${from}-${to}`} csv={csv} mode="none" showCompare={false} />
      </div>
      <form className="flex flex-wrap items-end gap-2 print:hidden" data-testid="sub-filter">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          บัญชีย่อย
          <select name="side" defaultValue={side} className="input" data-testid="sub-side">
            <option value="AR">ลูกหนี้รายตัว</option>
            <option value="AP">เจ้าหนี้รายตัว</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ตั้งแต่
          <input type="date" name="from" defaultValue={from} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ถึง
          <input type="date" name="to" defaultValue={to} className="input" />
        </label>
        <button className="btn btn-primary text-sm" data-testid="sub-apply">
          แสดง
        </button>
      </form>
      <div className="print:hidden">
        <LegalWarnings warnings={header.warnings} testId="sub-book-warnings" />
      </div>
      {!data.account && <p className="text-sm text-[color:var(--color-danger)]">ยังไม่ได้ผูกบัญชี{side === "AR" ? "ลูกหนี้" : "เจ้าหนี้"}การค้า (ตั้งค่า › ผังบัญชี › การผูกบัญชีอัตโนมัติ)</p>}

      {!detail && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border print:hidden" style={{ borderColor: "var(--color-line)" }}>
          <table className="w-full min-w-[560px] border-collapse text-sm" data-testid="sub-table">
            <thead>
              <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                <th className="px-3 py-2 font-medium">ผู้ติดต่อ</th>
                <th className="px-3 py-2 text-right font-medium">ยอดยกมา</th>
                <th className="px-3 py-2 text-right font-medium">เดบิต</th>
                <th className="px-3 py-2 text-right font-medium">เครดิต</th>
                <th className="px-3 py-2 text-right font-medium">ยอดยกไป</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.contactId ?? "none"} className="border-b last:border-0" style={{ borderColor: "var(--color-line)" }}>
                  <td className="px-3 py-2">
                    <Link href={q(`&contact=${r.contactId ?? "none"}`)} className="text-[color:var(--color-accent)] hover:underline" data-testid={`sub-contact-${r.contactId ?? "none"}`}>
                      {r.contactName}
                    </Link>
                  </td>
                  {[r.opening, r.debit, r.credit, r.closing].map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {(v / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold" style={{ borderColor: "var(--color-line)" }} data-testid="sub-total">
                <td className="px-3 py-2">รวม (= ยอดบัญชีคุม)</td>
                {[data.totals.opening, data.totals.debit, data.totals.credit, data.totals.closing].map((v, i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">
                    {(v / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {detail && (
        <Link href={q("")} className="text-sm text-[color:var(--color-accent)] hover:underline print:hidden" data-testid="sub-back-summary">
          ← สรุปทุกราย
        </Link>
      )}

      <div className={detail ? "" : "hidden print:block"}>
        <BookPrintPages
          header={header}
          title={detail ? `${title} — ${detail.contactName}` : title}
          periodLabel={periodLabel}
          testId="sub-book"
          columns={
            detail
              ? [
                  { label: "วันที่", className: "whitespace-nowrap" },
                  { label: "เลขที่ใบสำคัญ", className: "whitespace-nowrap font-mono" },
                  { label: "คำอธิบาย" },
                  { label: "เดบิต", align: "right", money: true },
                  { label: "เครดิต", align: "right", money: true },
                  { label: "คงเหลือ", align: "right", money: true },
                ]
              : [
                  { label: "ผู้ติดต่อ" },
                  { label: "ยอดยกมา", align: "right", money: true },
                  { label: "เดบิต", align: "right", money: true },
                  { label: "เครดิต", align: "right", money: true },
                  { label: "ยอดยกไป", align: "right", money: true },
                ]
          }
          pages={pages}
        />
      </div>
    </div>
  );
}
