// SVC H.7 ▸ ตารางรายงานโรงแรม (ใบสั่ง h.7 §4) — แสดงผลล้วน · เลื่อนแนวนอนในกรอบตัวเอง (มือถือไม่ล้นจอ) · ปุ่มส่งออก CSV เป็นลิงก์ไป route ที่ตรวจสิทธิ์
import { fmtCell, type ReportColumn } from "./reports-shared";

export type ReportTableProps = {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  csvHref?: string | null;
  empty?: string;
  rowKey?: string;
};

const SOFT = "text-[color:var(--color-ink-soft)]";

export default function ReportTable({ title, columns, rows, csvHref, empty, rowKey }: ReportTableProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
      <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-5">
        <h2 className="text-base font-bold">{title}</h2>
        <span className="flex-1" />
        {csvHref ? (
          <a href={csvHref} data-report-export="" className="flex min-h-[40px] items-center rounded-xl border border-[color:var(--color-line)] px-3 text-sm font-medium">
            ส่งออก CSV
          </a>
        ) : null}
      </div>
      <div data-scroll-hint="" className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className={`border-b border-[color:var(--color-line)] text-left ${SOFT}`}>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2 font-medium ${c.kind === "text" ? "" : "text-right"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={`px-4 py-6 text-center ${SOFT}`}>
                  {empty ?? "ยังไม่มีข้อมูลในช่วงนี้"}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={String((rowKey ? r[rowKey] : undefined) ?? i)} className="border-b border-[color:var(--color-line)] last:border-b-0">
                  {columns.map((c) => (
                    <td key={c.key} className={`whitespace-nowrap px-4 py-2 ${c.kind === "text" ? "" : "text-right tabular-nums"}`}>
                      {fmtCell(c.kind, r[c.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
