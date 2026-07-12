import { trialBalance } from "@/lib/modules/account/reports";
import { MoneyText } from "@/components/ui/MoneyText";
import { loadReport, currentPeriodKey, ReportHeader, WarnBanner, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// เลขศูนย์เว้นว่างไว้ให้ตารางอ่านง่าย
const m = (v: number) => (v === 0 ? null : <MoneyText satang={v} decimals />);

export default async function TrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;

  const now = currentPeriodKey();
  const from = sp.from || now;
  const to = sp.to || from;
  const tb = await trialBalance({ tenantId, systemId }, from, to);

  const csv = {
    headers: ["รหัส", "ชื่อบัญชี", "ยกมา-เดบิต", "ยกมา-เครดิต", "เดบิต", "เครดิต", "คงเหลือ-เดบิต", "คงเหลือ-เครดิต"],
    rows: [
      ...tb.rows.map((r) => [
        r.code, r.name,
        (r.openingDebit / 100).toFixed(2), (r.openingCredit / 100).toFixed(2),
        (r.movementDebit / 100).toFixed(2), (r.movementCredit / 100).toFixed(2),
        (r.closingDebit / 100).toFixed(2), (r.closingCredit / 100).toFixed(2),
      ]),
      ["", "รวม",
        (tb.totals.openingDebit / 100).toFixed(2), (tb.totals.openingCredit / 100).toFixed(2),
        (tb.totals.movementDebit / 100).toFixed(2), (tb.totals.movementCredit / 100).toFixed(2),
        (tb.totals.closingDebit / 100).toFixed(2), (tb.totals.closingCredit / 100).toFixed(2)],
    ],
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader base={base} title="งบทดลอง" subtitle={`${from} ถึง ${to}`} />
        <ReportToolbar filename={`งบทดลอง-${from}-${to}`} csv={csv} />
      </div>

      <form className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ตั้งแต่<input type="month" name="from" defaultValue={from} className="rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ถึง<input type="month" name="to" defaultValue={to} className="rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <button className="btn btn-primary text-sm">แสดง</button>
      </form>

      {!tb.balanced && (
        <WarnBanner base={base}>
          รวมเดบิต (<MoneyText satang={tb.totals.closingDebit} decimals />) ≠ รวมเครดิต (<MoneyText satang={tb.totals.closingCredit} decimals />)
        </WarnBanner>
      )}

      <TableWrap>
        <thead className="sticky top-0 bg-[color:var(--color-surface-2)]">
          <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
            <th className="px-2 py-2">รหัส</th>
            <th className="px-2 py-2">ชื่อบัญชี</th>
            <th className="px-2 py-2 text-right">ยกมาเดบิต</th>
            <th className="px-2 py-2 text-right">ยกมาเครดิต</th>
            <th className="px-2 py-2 text-right">เดบิต</th>
            <th className="px-2 py-2 text-right">เครดิต</th>
            <th className="px-2 py-2 text-right">คงเหลือเดบิต</th>
            <th className="px-2 py-2 text-right">คงเหลือเครดิต</th>
          </tr>
        </thead>
        <tbody>
          {tb.rows.map((r) => (
            <tr key={r.code} className="border-b last:border-0">
              <td className="px-2 py-1.5 font-mono text-xs">{r.code}</td>
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m(r.openingDebit)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m(r.openingCredit)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m(r.movementDebit)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m(r.movementCredit)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m(r.closingDebit)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m(r.closingCredit)}</td>
            </tr>
          ))}
          {tb.rows.length === 0 && (
            <tr><td colSpan={8} className="px-2 py-6 text-center text-[color:var(--color-muted)]">ไม่มีความเคลื่อนไหวในช่วงนี้</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="px-2 py-2" colSpan={2}>รวม</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.openingDebit)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.openingCredit)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.movementDebit)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.movementCredit)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.closingDebit)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.closingCredit)}</td>
          </tr>
        </tfoot>
      </TableWrap>
    </div>
  );
}
