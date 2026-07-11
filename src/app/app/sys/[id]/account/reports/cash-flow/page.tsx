import { baht } from "@/lib/modules/account/service";
import { cashFlow, type CashFlowSection } from "@/lib/modules/account/reports";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap, WarnBanner } from "../_shared";
import ReportToolbar from "../ReportToolbar";

const ACT_LABEL: Record<string, string> = {
  OPERATING: "กิจกรรมดำเนินงาน",
  INVESTING: "กิจกรรมลงทุน",
  FINANCING: "กิจกรรมจัดหาเงิน",
};

export default async function CashFlowPage({
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
  const cf = await cashFlow({ tenantId, systemId }, from, to);

  const sections: CashFlowSection[] = [cf.operating, cf.investing, cf.financing];
  const sectionBlock = (s: CashFlowSection) => (
    <tbody key={s.activity}>
      <tr className="bg-[color:var(--color-bg,#fafafa)] font-medium">
        <td className="px-3 py-1.5" colSpan={2}>{ACT_LABEL[s.activity]}</td>
      </tr>
      {s.lines.map((l) => (
        <tr key={l.code} className="border-b last:border-0">
          <td className="px-3 py-1.5 pl-6"><span className="font-mono text-xs">{l.code}</span> {l.name}</td>
          <td className="px-3 py-1.5 text-right">{baht(l.amount)}</td>
        </tr>
      ))}
      <tr className="border-b font-medium">
        <td className="px-3 py-1.5 pl-3">เงินสดสุทธิจาก{ACT_LABEL[s.activity]}</td>
        <td className="px-3 py-1.5 text-right">{baht(s.net)}</td>
      </tr>
    </tbody>
  );

  const csv = {
    headers: ["กิจกรรม", "รหัส", "ชื่อ", "จำนวน (บาท)"],
    rows: sections.flatMap((s) =>
      s.lines.map((l) => [ACT_LABEL[s.activity], l.code, l.name, l.amount / 100] as (string | number)[]),
    ),
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <ReportHeader base={base} title="งบกระแสเงินสด (วิธีตรง)" subtitle={`${from} ถึง ${to}`} />
        <ReportToolbar filename={`งบกระแสเงินสด-${from}-${to}`} csv={csv} />
      </div>
      <form className="flex flex-wrap gap-2 print:hidden">
        <input name="from" defaultValue={from} placeholder="จาก YYYY-MM" className="rounded-lg border px-2 py-1.5 text-sm" />
        <input name="to" defaultValue={to} placeholder="ถึง YYYY-MM" className="rounded-lg border px-2 py-1.5 text-sm" />
        <button className="btn text-sm">ดู</button>
      </form>
      {!cf.reconciled && (
        <WarnBanner base={base}>
          เงินต้นงวด+เปลี่ยนแปลง {baht(cf.openingCash + cf.netChange)} ≠ เงินปลายงวด {baht(cf.closingCash)}
        </WarnBanner>
      )}
      {cf.hasUnclassified && (
        <div className="rounded-lg border px-3 py-2 text-xs text-[color:var(--color-muted)]">
          ⚠ มีบัญชีคู่ที่ยังไม่ระบุกิจกรรม (activity=NONE) — รวมเข้ากิจกรรมดำเนินงานชั่วคราว ควรตั้งค่าในผังบัญชี
        </div>
      )}
      <TableWrap>
        <tbody>
          <tr className="border-b font-medium"><td className="px-3 py-2">เงินสดต้นงวด</td><td className="px-3 py-2 text-right">{baht(cf.openingCash)}</td></tr>
        </tbody>
        {sections.map(sectionBlock)}
        <tbody>
          <tr className="border-t font-medium"><td className="px-3 py-2">เงินสดเพิ่ม(ลด)สุทธิ</td><td className="px-3 py-2 text-right">{baht(cf.netChange)}</td></tr>
          <tr className="border-t-2 text-base font-bold"><td className="px-3 py-2.5">เงินสดปลายงวด</td><td className="px-3 py-2.5 text-right">{baht(cf.closingCash)}</td></tr>
        </tbody>
      </TableWrap>
    </div>
  );
}
