import Link from "next/link";
import { loadAccountSystem, accountPageGate } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { journalRangeOf, JOURNAL_TABS } from "@/lib/modules/account/journal-v2";
import { bookHeaderOf, journalBookAll, journalBookTitleTh, paginateBookRows, JOURNAL_BOOK_PRINT_MAX, type BookRow } from "@/lib/modules/account/books-report";
import { formatDateTh } from "@/lib/ui/date";
import { BookPrintPages } from "@/components/account-v2/BookPrintPages";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import ReportToolbar from "../../reports/ReportToolbar";

// ใบพิมพ์สมุดรายวันแบบเต็ม (ACC T4.2 · ปิด D3) — ปุ่ม "พิมพ์รายงาน" ของหน้าบัญชีรายวัน
//   ทุกบรรทัดบัญชี (รหัส ชื่อบัญชี เดบิต เครดิต) ของทุกใบในช่วง — ไม่ตัดที่ 200 ใบ (books-report.journalBookAll อ่านเป็นก้อน)
//   หัวทุกหน้า: ชื่อกิจการ · เลขผู้เสียภาษี · สาขา · ชนิดบัญชี (สมุดรายวัน + เล่ม) · ช่วงวันที่ · หน้า i/N · ยอดยกมา/ยกไป
//   ตัวกรองเล่ม + ช่วงวันที่ชุดเดียวกับหน้ารายการ (คำค้นไม่ใช้ — สมุดบัญชีต้องครบทุกรายการของช่วง)
const ROWS_PER_PAGE = 34;

export default async function JournalPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  accountPageGate(auth, "account.journal.view"); // SVC G2-F F2 ▸ ไม่มีสิทธิ์ ⇒ ไม่พบ (ไม่ใช่ 500) ◂
  assertAccountCan(auth, "account.journal.view");
  const ctx = { tenantId, systemId };

  const month = journalRangeOf("this_month", new Date());
  const from = sp.from || month.from;
  const to = sp.to || month.to;
  const tab = JOURNAL_TABS.find((t) => t.key === sp.tab) ?? JOURNAL_TABS[0];
  const base = `/app/sys/${id}/account`;
  const title = journalBookTitleTh(tab.book);

  const [header, data] = await Promise.all([
    bookHeaderOf(ctx, title),
    journalBookAll(ctx, { book: tab.book, from: new Date(`${from}T00:00:00.000+07:00`), to: new Date(`${to}T23:59:59.999+07:00`) }),
  ]);

  const rows: BookRow[] = [];
  for (const e of data.entries) {
    e.lines.forEach((l, i) => {
      const desc = i === 0 ? [e.memo, l.note && l.note !== e.memo ? l.note : null].filter(Boolean).join(" · ") : [l.note, l.contactName].filter(Boolean).join(" · ");
      rows.push({
        kind: "line",
        ...(i === 0 ? { blockSize: e.lines.length } : {}),
        cells: [
          i === 0 ? formatDateTh(e.date) : "",
          i === 0 ? `${e.docNo}${e.status === "REVERSED" ? " (กลับรายการแล้ว)" : ""}` : "",
          i === 0 && !tab.book ? e.bookLabel : "",
          `${l.accountCode} ${l.accountName}`,
          desc || (i === 0 ? "—" : ""),
          i === 0 ? (e.refDocNo ?? "") : "",
          l.debit || null,
          l.credit || null,
        ],
      });
    });
  }
  const pages = paginateBookRows(rows, ROWS_PER_PAGE, [6, 7]);
  const periodLabel = `${formatDateTh(from)} ถึง ${formatDateTh(to)}`;
  const totalDr = data.entries.reduce((s, e) => s + e.totalDebit, 0);
  const totalCr = data.entries.reduce((s, e) => s + e.totalCredit, 0);
  const csv = {
    preamble: [header.orgName || "-", `${title} · ${periodLabel}`],
    headers: ["วันที่", "เลขที่ใบสำคัญ", "สมุด", "รหัสบัญชี", "ชื่อบัญชี", "คำอธิบาย", "อ้างอิงเอกสาร", "เดบิต", "เครดิต"],
    rows: data.entries.flatMap((e) =>
      e.lines.map((l) => [formatDateTh(e.date), e.docNo, e.bookLabel, l.accountCode, l.accountName, [e.memo, l.note].filter(Boolean).join(" · "), e.refDocNo ?? "", l.debit / 100, l.credit / 100] as (string | number)[]),
    ),
  };

  return (
    <div className="flex flex-col gap-4 p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`${base}/journal?tab=${tab.key}&from=${from}&to=${to}`} className="text-sm text-[color:var(--color-muted)]">
          ← กลับไปบัญชีรายวัน
        </Link>
        <ReportToolbar filename={`${title}-${from}-${to}`} csv={csv} mode="none" showCompare={false} />
      </div>
      <div className="print:hidden">
        <LegalWarnings warnings={header.warnings} testId="journal-book-warnings" />
      </div>
      <p className="text-sm print:hidden" data-testid="journal-book-summary">
        {data.entries.length} ใบสำคัญ · เดบิตรวม {(totalDr / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} · เครดิตรวม {(totalCr / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} · {pages.length} หน้า
      </p>
      {data.truncated && (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="journal-book-truncated">
          ช่วงนี้มีมากกว่า {JOURNAL_BOOK_PRINT_MAX.toLocaleString("en-US")} ใบสำคัญ — แบ่งช่วงวันที่ให้สั้นลงเพื่อพิมพ์ให้ครบ
        </p>
      )}
      <BookPrintPages
        header={header}
        title={title}
        periodLabel={periodLabel}
        testId="journal-book"
        columns={[
          { label: "วันที่", className: "whitespace-nowrap" },
          { label: "เลขที่ใบสำคัญ", className: "whitespace-nowrap font-mono" },
          { label: tab.book ? "" : "สมุด" },
          { label: "บัญชี" },
          { label: "คำอธิบาย" },
          { label: "อ้างอิง" },
          { label: "เดบิต", align: "right", money: true },
          { label: "เครดิต", align: "right", money: true },
        ]}
        pages={pages}
        amountCols={[6, 7]}
        footNote="พิมพ์จากระบบบัญชี SHARK — ทุกรายการมีวันที่ เลขที่ใบสำคัญ ชื่อบัญชี คำอธิบาย และจำนวนเงิน"
      />
    </div>
  );
}
