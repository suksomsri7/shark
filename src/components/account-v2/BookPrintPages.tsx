// BookPrintPages — ใบพิมพ์สมุดบัญชีแบบแบ่งหน้า (ACC T4.2) · server component (ไม่มี state)
//   ทุกหน้ามีหัวรายงาน: ชื่อกิจการ · เลขผู้เสียภาษี · สาขา · ชนิดบัญชี · ช่วงวันที่ · "หน้า i / N" (ข้อ 5 เลขหน้าเรียง)
//   คอลัมน์เงิน (amountCols): ยอดยกมา · รวมหน้านี้ · ยอดยกไป · หน้าต่อไปขึ้นหน้ากระดาษใหม่ (break-after: page)
import type { BookPage } from "@/lib/modules/account/books-report";

export type BookColumn = { label: string; align?: "left" | "right"; money?: boolean; className?: string };

const money = (v: string | number | null) => (typeof v === "number" ? (v / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (v ?? ""));

export function BookPrintPages({
  header,
  title,
  periodLabel,
  columns,
  pages,
  amountCols = [],
  testId = "book-print",
  footNote,
}: {
  header: { orgName: string; taxId: string; branchLabel: string };
  title: string;
  periodLabel: string;
  columns: BookColumn[];
  pages: BookPage[];
  amountCols?: number[];
  testId?: string;
  footNote?: string;
}) {
  const n = pages.length;
  const firstMoney = amountCols.length ? Math.min(...amountCols) : columns.length;
  const sumRow = (label: string, values: number[], tid: string) => (
    <tr className="border-t font-semibold" data-testid={tid}>
      <td className="py-1 pr-2" colSpan={firstMoney}>
        {label}
      </td>
      {columns.slice(firstMoney).map((_, j) => {
        const idx = amountCols.indexOf(firstMoney + j);
        return (
          <td key={j} className="py-1 pr-2 text-right tabular-nums">
            {idx >= 0 ? money(values[idx] ?? 0) : ""}
          </td>
        );
      })}
    </tr>
  );
  return (
    <div className="flex flex-col gap-6 print:gap-0" data-testid={testId}>
      {pages.map((p) => (
        <section
          key={p.no}
          className="book-page rounded-lg border p-4 print:rounded-none print:border-0 print:p-0"
          style={{ breakAfter: p.no < n ? "page" : "auto", borderColor: "var(--color-line)" }}
          data-testid={`${testId}-page-${p.no}`}
        >
          <header className="mb-2 flex flex-wrap items-start justify-between gap-2 border-b pb-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <div className="text-base font-semibold" data-testid={`${testId}-org`}>
                {header.orgName || "(ยังไม่ได้กรอกชื่อกิจการ)"}
              </div>
              <div className="text-xs">
                เลขประจำตัวผู้เสียภาษี {header.taxId || "-"} · {header.branchLabel}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold" data-testid={`${testId}-title`}>
                {title}
              </div>
              <div className="text-xs">{periodLabel}</div>
              <div className="text-xs" data-testid={`${testId}-pageno`}>
                หน้า {p.no} / {n}
              </div>
            </div>
          </header>
          <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[720px] border-collapse text-xs print:min-w-0 print:text-[9.5px]">
            <thead>
              <tr className="border-b text-left">
                {columns.map((c, i) => (
                  <th key={i} className={`py-1 pr-2 font-semibold ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {amountCols.length > 0 && p.no > 1 && sumRow("ยอดยกมา", p.carriedIn, `${testId}-carried-in-${p.no}`)}
              {p.rows.map((r, i) => (
                <tr key={i} className={r.kind === "group" ? "border-t font-semibold" : r.kind === "total" ? "border-t font-semibold" : ""}>
                  {r.cells.map((c, j) => (
                    <td key={j} className={`py-0.5 pr-2 align-top ${columns[j]?.align === "right" ? "text-right tabular-nums" : ""} ${columns[j]?.className ?? ""}`}>
                      {columns[j]?.money ? money(c) : c}
                    </td>
                  ))}
                </tr>
              ))}
              {amountCols.length > 0 && sumRow("รวมหน้านี้", p.pageSums, `${testId}-page-sum-${p.no}`)}
              {amountCols.length > 0 && sumRow(p.no < n ? "ยอดยกไป" : "รวมทั้งสิ้น", p.carriedOut, `${testId}-carried-out-${p.no}`)}
            </tbody>
          </table>
          </div>
          {footNote && p.no === n && <p className="mt-2 text-[10px]">{footNote}</p>}
        </section>
      ))}
    </div>
  );
}
