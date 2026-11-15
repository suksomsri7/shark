import { MoneyText } from "@/components/ui/MoneyText";
import { equityStatement, equityStatementCsv, type EquityBlock, type EquityColumn } from "@/lib/modules/account/equity-statement";
import { loadReportWithPolicy, fiscalDefaultRange, ReportHeader, TableWrap, WarnBanner } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T5.8 (D9) — งบแสดงการเปลี่ยนแปลงส่วนของเจ้าของ · ตัวเลขงวดก่อน (ปีบัญชีก่อน ช่วงเดียวกัน) แสดงเป็นค่าเริ่มต้น (ปิดได้ด้วย cmp=0)
const KEY = /^\d{4}-\d{2}$/;

function Block({ b, cols, testId }: { b: EquityBlock; cols: EquityColumn[]; testId: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h2 className="text-base font-semibold">งวด {b.label}</h2>
      <TableWrap>
        <thead>
          <tr className="text-left text-[color:var(--color-muted)]">
            <th className="px-3 py-2">รายการ</th>
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right">{c.code ? <span className="font-mono text-xs">{c.code} </span> : null}{c.name}</th>
            ))}
            <th className="px-3 py-2 text-right">รวม</th>
          </tr>
        </thead>
        <tbody>
          {b.rows.map((r) => (
            <tr key={r.kind} className={`border-t ${r.kind === "OPENING" || r.kind === "CLOSING" ? "font-semibold" : ""}`} data-testid={`${testId}-${r.kind}`}>
              <td className="px-3 py-1.5">{r.label}</td>
              {cols.map((c) => (
                <td key={c.key} className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.amounts[c.key] ?? 0} decimals /></td>
              ))}
              <td className="px-3 py-1.5 text-right tabular-nums" data-testid={`${testId}-${r.kind}-total`}><MoneyText satang={r.total} decimals /></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </section>
  );
}

export default async function EquityStatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ to?: string; asOf?: string; cmp?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId, policy } = await loadReportWithPolicy(id);
  const base = `/app/sys/${id}/account`;
  const pick = sp.asOf || sp.to;
  const to = pick && KEY.test(pick) ? pick : fiscalDefaultRange(policy).to;
  const compare = sp.cmp !== "0";
  const s = await equityStatement({ tenantId, systemId }, to, { fiscalYearStartMonth: policy.fiscalYearStartMonth, compare });
  const bad = [s.current, s.prior].filter((b): b is EquityBlock => !!b && !b.reconciled);
  return (
    <div className="flex max-w-5xl flex-col gap-4" data-testid="equity-page">
      <ReportHeader draft base={base} title="งบแสดงการเปลี่ยนแปลงส่วนของเจ้าของ" subtitle={`ตั้งแต่ต้นปีบัญชีถึงสิ้นเดือน ${to}${compare ? " · เทียบงวดเดียวกันของปีบัญชีก่อน" : ""}`} />
      <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)" }} data-testid="equity-draft-label">
        {s.draftLabel} — ตัวเลขคำนวณจากสมุดรายวัน ยังไม่ใช่งบที่ผ่านการตรวจสอบ
      </p>
      <ReportToolbar filename={`งบเปลี่ยนแปลงส่วนของเจ้าของ-${to}`} csv={equityStatementCsv(s)} mode="asof" to={to} compare={compare} />
      {bad.length > 0 && (
        <WarnBanner base={base}>
          ยอดปลายงวดไม่เท่าส่วนของเจ้าของในงบแสดงฐานะการเงิน ({bad.map((b) => b.label).join(", ")})
        </WarnBanner>
      )}
      <Block b={s.current} cols={s.columns} testId="equity-current" />
      {s.prior && <Block b={s.prior} cols={s.columns} testId="equity-prior" />}
      <p className="text-xs text-[color:var(--color-muted)] print:hidden">
        ยอดปลายงวดรวมตรงกับ &quot;รวมส่วนของเจ้าของ&quot; ในงบแสดงฐานะการเงิน ณ เดือนเดียวกัน · กำไรสะสมรวมกำไรของปีก่อน ๆ ที่ระบบยกมาให้ (ไม่ต้องลงรายการปิดบัญชี)
      </p>
    </div>
  );
}
