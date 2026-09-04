import Link from "next/link";
import { cashFlow, type CashFlowSection } from "@/lib/modules/account/reports";
import { ledgerDrillHref, previousRange } from "@/lib/modules/account/report-drill";
import { MoneyText } from "@/components/ui/MoneyText";
import { loadReportWithPolicy, fiscalDefaultRange, ReportHeader, TableWrap, WarnBanner } from "../_shared";
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
  searchParams: Promise<{ from?: string; to?: string; cmp?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId, policy } = await loadReportWithPolicy(id);
  const base = `/app/sys/${id}/account`;
  // §9.3: ค่าเริ่มต้น = ตั้งแต่ต้นปีบัญชีถึงเดือนปัจจุบัน
  const dflt = fiscalDefaultRange(policy);
  const from = sp.from || dflt.from;
  const to = sp.to || (sp.from ? sp.from : dflt.to);
  const compare = sp.cmp === "1";
  const prev = previousRange(from, to);
  const [cf, cfPrev] = await Promise.all([
    cashFlow({ tenantId, systemId }, from, to),
    compare ? cashFlow({ tenantId, systemId }, prev.from, prev.to) : Promise.resolve(null),
  ]);
  const prevLine = (code: string) =>
    [...(cfPrev?.operating.lines ?? []), ...(cfPrev?.investing.lines ?? []), ...(cfPrev?.financing.lines ?? [])].find(
      (l) => l.code === code,
    )?.amount ?? 0;
  const prevNet = (activity: string) =>
    [cfPrev?.operating, cfPrev?.investing, cfPrev?.financing].find((x) => x?.activity === activity)?.net ?? 0;

  const sections: CashFlowSection[] = [cf.operating, cf.investing, cf.financing];
  const sectionBlock = (s: CashFlowSection) => (
    <tbody key={s.activity}>
      <tr className="bg-[color:var(--color-surface-2)] font-medium">
        <td className="px-3 py-1.5" colSpan={compare ? 3 : 2}>{ACT_LABEL[s.activity]}</td>
      </tr>
      {s.lines.map((l) => (
        <tr key={l.code} className="border-b last:border-0" data-testid={`cf-row-${l.code}`}>
          <td className="px-3 py-1.5 pl-6"><span className="font-mono text-xs">{l.code}</span> {l.name}</td>
          <td className="px-3 py-1.5 text-right">
            {/* คลิกตัวเลข = drill-down ไปแยกประเภทของบัญชีนี้ (§11.3) */}
            <Link href={ledgerDrillHref(base, l.code, from, to)} className="hover:underline" data-testid={`cf-amt-${l.code}`}>
              <MoneyText satang={l.amount} decimals />
            </Link>
          </td>
          {compare && (
            <td className="px-3 py-1.5 text-right text-[color:var(--color-muted)]"><MoneyText satang={prevLine(l.code)} decimals /></td>
          )}
        </tr>
      ))}
      <tr className="border-b font-medium">
        <td className="px-3 py-1.5 pl-3">เงินสดสุทธิจาก{ACT_LABEL[s.activity]}</td>
        <td className="px-3 py-1.5 text-right"><MoneyText satang={s.net} decimals /></td>
        {compare && <td className="px-3 py-1.5 text-right text-[color:var(--color-muted)]"><MoneyText satang={prevNet(s.activity)} decimals /></td>}
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
        <ReportHeader
          base={base}
          title="งบกระแสเงินสด (วิธีตรง)"
          subtitle={`${from} ถึง ${to}${compare ? ` · เทียบ ${prev.from} ถึง ${prev.to}` : ""}`}
        />
      </div>
      <ReportToolbar filename={`งบกระแสเงินสด-${from}-${to}`} csv={csv} mode="range" from={from} to={to} compare={compare} />
      {!cf.reconciled && (
        <WarnBanner base={base}>
          เงินต้นงวด+เปลี่ยนแปลง <MoneyText satang={cf.openingCash + cf.netChange} decimals /> ≠ เงินปลายงวด <MoneyText satang={cf.closingCash} decimals />
        </WarnBanner>
      )}
      {cf.hasUnclassified && (
        <div className="rounded-lg border px-3 py-2 text-xs text-[color:var(--color-muted)]">
          ⚠ มีบัญชีที่ยังไม่ระบุประเภทกิจกรรม — รวมเข้ากิจกรรมดำเนินงานชั่วคราว ควรตั้งค่าในผังบัญชี
        </div>
      )}
      <TableWrap>
        <tbody>
          <tr className="border-b font-medium"><td className="px-3 py-2">เงินสดต้นงวด</td><td className="px-3 py-2 text-right"><MoneyText satang={cf.openingCash} decimals /></td>{compare && <td className="px-3 py-2 text-right text-[color:var(--color-muted)]"><MoneyText satang={cfPrev!.openingCash} decimals /></td>}</tr>
        </tbody>
        {sections.map(sectionBlock)}
        <tbody>
          <tr className="border-t font-medium"><td className="px-3 py-2">เงินสดเพิ่ม(ลด)สุทธิ</td><td className="px-3 py-2 text-right" data-testid="cf-net-change"><MoneyText satang={cf.netChange} decimals /></td>{compare && <td className="px-3 py-2 text-right text-[color:var(--color-muted)]"><MoneyText satang={cfPrev!.netChange} decimals /></td>}</tr>
          <tr className="border-t-2 text-base font-bold"><td className="px-3 py-2.5">เงินสดปลายงวด</td><td className="px-3 py-2.5 text-right" data-testid="cf-closing"><MoneyText satang={cf.closingCash} decimals /></td>{compare && <td className="px-3 py-2.5 text-right text-[color:var(--color-muted)]"><MoneyText satang={cfPrev!.closingCash} decimals /></td>}</tr>
        </tbody>
      </TableWrap>
      <p className="text-xs text-[color:var(--color-muted)] print:hidden">
        คลิกตัวเลขเพื่อดูที่มา → บัญชีแยกประเภท → ใบสำคัญ → เอกสารต้นทาง
      </p>
    </div>
  );
}
