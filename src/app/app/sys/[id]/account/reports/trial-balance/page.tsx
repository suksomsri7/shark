import Link from "next/link";
import { trialBalance } from "@/lib/modules/account/reports";
import { ledgerDrillHref, previousRange } from "@/lib/modules/account/report-drill";
import { MoneyText } from "@/components/ui/MoneyText";
import { loadReportWithPolicy, fiscalDefaultRange, ReportHeader, WarnBanner, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// งบทดลอง (§11.3) — คลิกยอดของบัญชี = drill-down ไปแยกประเภทของบัญชีนั้นในช่วงเดียวกัน
// เทียบงวดก่อน = เรียก trialBalance ซ้ำด้วยช่วงก่อนหน้าที่ยาวเท่ากัน (ไม่ fork ตรรกะรายงาน)

// เลขศูนย์เว้นว่างไว้ให้ตารางอ่านง่าย
const m = (v: number) => (v === 0 ? null : <MoneyText satang={v} decimals />);

export default async function TrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; cmp?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId, policy } = await loadReportWithPolicy(id);
  const base = `/app/sys/${id}/account`;
  const ctx = { tenantId, systemId };

  // §9.3: ค่าเริ่มต้น = ตั้งแต่ต้นปีบัญชีถึงเดือนปัจจุบัน
  const dflt = fiscalDefaultRange(policy);
  const from = sp.from || dflt.from;
  const to = sp.to || (sp.from ? sp.from : dflt.to);
  const compare = sp.cmp === "1";
  const prev = previousRange(from, to);

  const [tb, tbPrev] = await Promise.all([
    trialBalance(ctx, from, to),
    compare ? trialBalance(ctx, prev.from, prev.to) : Promise.resolve(null),
  ]);
  const prevByCode = new Map((tbPrev?.rows ?? []).map((r) => [r.code, r]));
  const netOf = (r: { closingDebit: number; closingCredit: number }) => r.closingDebit - r.closingCredit;

  const csv = {
    headers: [
      "รหัส", "ชื่อบัญชี", "ยกมา-เดบิต", "ยกมา-เครดิต", "เดบิต", "เครดิต", "คงเหลือ-เดบิต", "คงเหลือ-เครดิต",
      ...(compare ? ["คงเหลือสุทธิงวดก่อน"] : []),
    ],
    rows: [
      ...tb.rows.map((r) => [
        r.code, r.name,
        (r.openingDebit / 100).toFixed(2), (r.openingCredit / 100).toFixed(2),
        (r.movementDebit / 100).toFixed(2), (r.movementCredit / 100).toFixed(2),
        (r.closingDebit / 100).toFixed(2), (r.closingCredit / 100).toFixed(2),
        ...(compare ? [(netOf(prevByCode.get(r.code) ?? { closingDebit: 0, closingCredit: 0 }) / 100).toFixed(2)] : []),
      ]),
      ["", "รวม",
        (tb.totals.openingDebit / 100).toFixed(2), (tb.totals.openingCredit / 100).toFixed(2),
        (tb.totals.movementDebit / 100).toFixed(2), (tb.totals.movementCredit / 100).toFixed(2),
        (tb.totals.closingDebit / 100).toFixed(2), (tb.totals.closingCredit / 100).toFixed(2),
        ...(compare ? [""] : []),
      ],
    ],
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader
          base={base}
          title="งบทดลอง"
          subtitle={`${from} ถึง ${to}${compare ? ` · เทียบ ${prev.from} ถึง ${prev.to}` : ""}`}
        />
      </div>
      <ReportToolbar filename={`งบทดลอง-${from}-${to}`} csv={csv} mode="range" from={from} to={to} compare={compare} />

      {!tb.balanced && (
        <WarnBanner base={base}>
          รวมเดบิต (<MoneyText satang={tb.totals.closingDebit} decimals />) ≠ รวมเครดิต (<MoneyText satang={tb.totals.closingCredit} decimals />)
        </WarnBanner>
      )}

      <TableWrap>
        <thead className="sticky top-0 bg-[color:var(--color-surface-2)]">
          <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
            <th className="sticky left-0 z-20 bg-[color:var(--color-surface-2)] px-2 py-2">รหัส</th>
            <th className="px-2 py-2">ชื่อบัญชี</th>
            <th className="px-2 py-2 text-right">ยกมาเดบิต</th>
            <th className="px-2 py-2 text-right">ยกมาเครดิต</th>
            <th className="px-2 py-2 text-right">เดบิต</th>
            <th className="px-2 py-2 text-right">เครดิต</th>
            <th className="px-2 py-2 text-right">คงเหลือเดบิต</th>
            <th className="px-2 py-2 text-right">คงเหลือเครดิต</th>
            {compare && <th className="px-2 py-2 text-right">งวดก่อน</th>}
          </tr>
        </thead>
        <tbody>
          {tb.rows.map((r) => {
            const href = ledgerDrillHref(base, r.code, from, to);
            const p = prevByCode.get(r.code);
            return (
              <tr key={r.code} className="border-b last:border-0" data-testid={`tb-row-${r.code}`}>
                <td className="sticky left-0 z-10 bg-[color:var(--color-surface)] px-2 py-1.5 font-mono text-xs">
                  <Link href={href} className="text-[color:var(--color-accent)] hover:underline">
                    {r.code}
                  </Link>
                </td>
                <td className="px-2 py-1.5">{r.name}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{m(r.openingDebit)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{m(r.openingCredit)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <Drill href={href}>{m(r.movementDebit)}</Drill>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <Drill href={href}>{m(r.movementCredit)}</Drill>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" data-testid={`tb-close-dr-${r.code}`}>
                  <Drill href={href}>{m(r.closingDebit)}</Drill>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" data-testid={`tb-close-cr-${r.code}`}>
                  <Drill href={href}>{m(r.closingCredit)}</Drill>
                </td>
                {compare && (
                  <td className="px-2 py-1.5 text-right tabular-nums text-[color:var(--color-muted)]" data-testid={`tb-prev-${r.code}`}>
                    {p ? <MoneyText satang={Math.abs(netOf(p))} decimals /> : "—"}
                  </td>
                )}
              </tr>
            );
          })}
          {tb.rows.length === 0 && (
            <tr><td colSpan={compare ? 9 : 8} className="px-2 py-6 text-center text-[color:var(--color-muted)]">ไม่มีความเคลื่อนไหวในช่วงนี้</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="sticky left-0 z-10 bg-[color:var(--color-surface)] px-2 py-2" colSpan={2}>รวม</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.openingDebit)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.openingCredit)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.movementDebit)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{m(tb.totals.movementCredit)}</td>
            <td className="px-2 py-2 text-right tabular-nums" data-testid="tb-total-dr">{m(tb.totals.closingDebit)}</td>
            <td className="px-2 py-2 text-right tabular-nums" data-testid="tb-total-cr">{m(tb.totals.closingCredit)}</td>
            {compare && <td className="px-2 py-2" />}
          </tr>
        </tfoot>
      </TableWrap>

      <p className="text-xs text-[color:var(--color-muted)] print:hidden">
        คลิกตัวเลขเพื่อดูที่มา → บัญชีแยกประเภท → ใบสำคัญ → เอกสารต้นทาง
      </p>
    </div>
  );
}

/** ตัวเลขที่คลิกได้ (drill-down) — ยอด 0 ที่แสดงเป็นช่องว่างไม่ต้องทำเป็นลิงก์ */
function Drill({ href, children }: { href: string; children: React.ReactNode }) {
  if (children === null) return null;
  return (
    <Link href={href} className="hover:underline">
      {children}
    </Link>
  );
}
