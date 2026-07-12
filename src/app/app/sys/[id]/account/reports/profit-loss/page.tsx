import { Fragment } from "react";
import { baht } from "@/lib/modules/account/service";
import { profitLoss, type ProfitLoss, type PLRow } from "@/lib/modules/account/reports";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

export default async function ProfitLossPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; compare?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;

  const now = currentPeriodKey();
  const from = sp.from || now;
  const to = sp.to || from;
  const compare = sp.compare === "1";
  const pl = await profitLoss({ tenantId, systemId }, from, to, { compare });

  // สร้างแถวคู่กัน (ปัจจุบัน + งวดก่อน) ตามรหัสบัญชี
  const cmpRow = (rows: PLRow[] | undefined, code: string) =>
    rows?.find((r) => r.code === code)?.amount ?? 0;

  const section = (
    label: string,
    cur: { rows: PLRow[]; total: number },
    prev: { rows: PLRow[]; total: number } | undefined,
  ) => {
    const codes = new Set<string>([...cur.rows.map((r) => r.code), ...(prev?.rows.map((r) => r.code) ?? [])]);
    const merged = [...codes].sort().map((code) => {
      const c = cur.rows.find((r) => r.code === code);
      return {
        code,
        name: c?.name ?? prev?.rows.find((r) => r.code === code)?.name ?? code,
        cur: c?.amount ?? 0,
        prev: cmpRow(prev?.rows, code),
      };
    });
    return { label, merged, curTotal: cur.total, prevTotal: prev?.total ?? 0 };
  };

  const p = pl.compare as ProfitLoss["compare"];
  const sections = [
    section("รายได้", pl.income, p?.income),
    section("ต้นทุนขาย", pl.cogs, p?.cogs),
    section("ค่าใช้จ่าย", pl.expense, p?.expense),
  ];

  const csvRows: (string | number)[][] = [];
  for (const s of sections) {
    csvRows.push([s.label, "", ""]);
    for (const r of s.merged)
      csvRows.push([`  ${r.code} ${r.name}`, (r.cur / 100).toFixed(2), compare ? (r.prev / 100).toFixed(2) : ""]);
  }
  csvRows.push(["กำไรขั้นต้น", (pl.grossProfit / 100).toFixed(2), compare ? (p!.grossProfit / 100).toFixed(2) : ""]);
  csvRows.push(["กำไรสุทธิ", (pl.netProfit / 100).toFixed(2), compare ? (p!.netProfit / 100).toFixed(2) : ""]);
  const csv = { headers: ["รายการ", "งวดนี้", "งวดก่อน"], rows: csvRows };

  const Amt = ({ v }: { v: number }) => (
    <span className="tabular-nums">{v < 0 ? `(${baht(-v)})` : baht(v)}</span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader base={base} title="งบกำไรขาดทุน" subtitle={`${from} ถึง ${to}`} />
        <ReportToolbar filename={`งบกำไรขาดทุน-${from}-${to}`} csv={csv} />
      </div>

      <form className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ตั้งแต่<input type="month" name="from" defaultValue={from} className="rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ถึง<input type="month" name="to" defaultValue={to} className="rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
          <input type="checkbox" name="compare" value="1" defaultChecked={compare} /> เทียบงวดก่อน
        </label>
        <button className="btn btn-primary text-sm">แสดง</button>
      </form>

      <TableWrap>
        <thead className="border-b text-left text-xs text-[color:var(--color-muted)]">
          <tr>
            <th className="px-3 py-2">รายการ</th>
            <th className="px-3 py-2 text-right">งวดนี้ ({from}–{to})</th>
            {compare && <th className="px-3 py-2 text-right">งวดก่อน ({p!.from}–{p!.to})</th>}
          </tr>
        </thead>
        <tbody>
          {sections.map((s, si) => (
            <Fragment key={s.label}>
              <tr className="bg-[color:var(--color-surface-2,#fafafa)] font-medium">
                <td className="px-3 py-1.5" colSpan={compare ? 3 : 2}>{s.label}</td>
              </tr>
              {s.merged.map((r) => (
                <tr key={`${s.label}-${r.code}`} className="border-b last:border-0">
                  <td className="px-3 py-1.5 pl-6"><span className="font-mono text-xs">{r.code}</span> {r.name}</td>
                  <td className="px-3 py-1.5 text-right"><Amt v={r.cur} /></td>
                  {compare && <td className="px-3 py-1.5 text-right"><Amt v={r.prev} /></td>}
                </tr>
              ))}
              <tr key={`t-${s.label}`} className="border-b font-medium">
                <td className="px-3 py-1.5 pl-6">รวม{s.label}</td>
                <td className="px-3 py-1.5 text-right"><Amt v={s.curTotal} /></td>
                {compare && <td className="px-3 py-1.5 text-right"><Amt v={s.prevTotal} /></td>}
              </tr>
              {si === 1 && (
                <tr key="gross" className="border-b-2 font-semibold">
                  <td className="px-3 py-2">กำไรขั้นต้น</td>
                  <td className="px-3 py-2 text-right"><Amt v={pl.grossProfit} /></td>
                  {compare && <td className="px-3 py-2 text-right"><Amt v={p!.grossProfit} /></td>}
                </tr>
              )}
            </Fragment>
          ))}
          <tr className="border-t-2 text-base font-bold">
            <td className="px-3 py-2.5">กำไรสุทธิ</td>
            <td className="px-3 py-2.5 text-right"><Amt v={pl.netProfit} /></td>
            {compare && <td className="px-3 py-2.5 text-right"><Amt v={p!.netProfit} /></td>}
          </tr>
        </tbody>
      </TableWrap>
    </div>
  );
}
