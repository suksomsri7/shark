import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { baht } from "@/lib/modules/account/service";
import { financeStatement, FINANCE_TYPE_LABEL } from "@/lib/modules/account/finance";

const fmtDate = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

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

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`${base}/finance`} className="text-sm text-[color:var(--color-muted)]">← การเงิน</Link>
        <h1 className="mt-1 text-2xl font-semibold">{stmt.account.name}</h1>
        <p className="text-xs text-[color:var(--color-muted)]">{FINANCE_TYPE_LABEL[stmt.account.type]}</p>
      </div>

      {/* ตัวกรองช่วงเวลา */}
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col">
          <span className="text-xs text-[color:var(--color-muted)]">ตั้งแต่</span>
          <input name="from" type="date" defaultValue={from} className="rounded-lg border px-2 py-1.5" />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-[color:var(--color-muted)]">ถึง</span>
          <input name="to" type="date" defaultValue={to} className="rounded-lg border px-2 py-1.5" />
        </label>
        <button className="btn btn-primary text-sm">กรอง</button>
      </form>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
        <span className="text-[color:var(--color-muted)]">ยอดยกมา</span>
        <span className="font-semibold">{baht(stmt.opening)} ฿</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y text-xs text-[color:var(--color-muted)]">
              <th className="py-1.5 text-left">วันที่</th>
              <th className="py-1.5 text-left">เลขที่</th>
              <th className="py-1.5 text-left">รายการ</th>
              <th className="py-1.5 text-right">รับ</th>
              <th className="py-1.5 text-right">จ่าย</th>
              <th className="py-1.5 text-right">คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {stmt.rows.length === 0 ? (
              <tr><td colSpan={6} className="py-4 text-center text-[color:var(--color-muted)]">ไม่มีความเคลื่อนไหว</td></tr>
            ) : (
              stmt.rows.map((r, i) => (
                <tr key={`${r.entryId}-${i}`} className="border-b">
                  <td className="py-1.5">{fmtDate(r.date)}</td>
                  <td className="py-1.5 text-xs">{r.docNo}</td>
                  <td className="py-1.5">{r.memo ?? "—"}</td>
                  <td className="py-1.5 text-right">{r.debit > 0 ? baht(r.debit) : ""}</td>
                  <td className="py-1.5 text-right">{r.credit > 0 ? baht(r.credit) : ""}</td>
                  <td className="py-1.5 text-right font-medium">{baht(r.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
        <span className="text-[color:var(--color-muted)]">ยอดคงเหลือปลายงวด</span>
        <span className="font-semibold">{baht(stmt.closing)} ฿</span>
      </div>
    </div>
  );
}
