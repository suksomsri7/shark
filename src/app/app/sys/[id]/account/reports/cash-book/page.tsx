import { MoneyText } from "@/components/ui/MoneyText";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { ENTITY_KIND_LABEL_TH } from "@/lib/core/settings/legal/th-tax-2569";
import { cashBook } from "@/lib/modules/account/cash-book";
import { ymdTh } from "@/lib/modules/account/tax-calendar";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T5.2 — รายงานเงินสดรับ-จ่าย เกณฑ์เงินสด (ปิด A3) · ตัวคิดเดียวกับ REST `GET /reports/cash-book` (cash-book.ts)
//   ช่วงเป็นเดือน (แถบเครื่องมือกลาง) → วันแรก–วันสุดท้ายของเดือน · แถวต่อใบสำคัญ + ยอดรวมต่อวัน + สรุปรายเดือน
const isYm = (v: string | undefined): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const m = (v: number) => (v === 0 ? null : <MoneyText satang={v} decimals />);

export default async function CashBookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const to = isYm(sp.to) ? sp.to : currentPeriodKey();
  const from = isYm(sp.from) && sp.from <= to ? sp.from : to;
  const r = await cashBook({ tenantId, systemId }, { from: `${from}-01`, to: monthEnd(to) });
  const csv = {
    preamble: ["รายงานเงินสดรับ-จ่าย (เกณฑ์เงินสด)", `${ymdTh(r.from)} ถึง ${ymdTh(r.to)}`],
    headers: ["วันที่", "เลขที่ใบสำคัญ", "รายการ", "รายรับ", "รายจ่าย", "หมายเหตุ"],
    rows: r.rows.map((x) => [x.date, x.docNo, x.description, x.receipt ? x.receipt / 100 : "", x.payment ? x.payment / 100 : "", x.owner ? `เงินทุน/ถอนใช้ส่วนตัว · ${x.counterTh}` : x.counterTh]) as (string | number)[][],
  };
  // แถวต่อวัน: รายการของวัน + บรรทัดรวมของวัน
  const byDay = new Map<string, typeof r.rows>();
  for (const x of r.rows) byDay.set(x.date, [...(byDay.get(x.date) ?? []), x]);
  const dayTotal = new Map(r.days.map((d) => [d.date, d]));

  return (
    <div className="flex max-w-5xl flex-col gap-5" data-testid="cash-book-page">
      <ReportHeader base={base} title="รายงานเงินสดรับ-จ่าย" subtitle={`${ymdTh(r.from)} ถึง ${ymdTh(r.to)} · เกณฑ์เงินสด (วันที่รับ/จ่ายเงินจริง) · ${ENTITY_KIND_LABEL_TH[r.entityKind]}${r.vatRegistered ? " · จด VAT" : " · ไม่จด VAT"}`} />
      <ReportToolbar filename={`รายงานเงินสดรับจ่าย-${from}-${to}`} csv={csv} mode="range" from={from} to={to} showCompare={false} />
      {!r.applies && (
        <p className="text-sm text-[color:var(--color-muted)]" data-testid="cash-book-not-applicable">
          ใช้ดูเงินสดเข้า-ออกของกิจการ — สมุดนี้{r.vatRegistered ? "จดทะเบียน VAT" : "ไม่ใช่บุคคลธรรมดา"} บัญชีหลักใช้เกณฑ์สิทธิ (สมุดรายวัน · งบการเงิน)
        </p>
      )}
      <div className="print:hidden">
        <LegalWarnings warnings={r.warnings} testId="cash-book-warnings" />
      </div>

      <section className="flex flex-col gap-2" data-testid="cash-book-months">
        <h2 className="text-sm font-medium">สรุปรายเดือน</h2>
        <TableWrap>
          <thead>
            <tr className="text-left text-[color:var(--color-muted)]">
              <th className="px-3 py-2">เดือน</th>
              <th className="px-3 py-2 text-right">รายรับ</th>
              <th className="px-3 py-2 text-right">รายจ่าย</th>
              <th className="px-3 py-2 text-right">รับ − จ่าย</th>
              <th className="px-3 py-2 text-right">เงินทุนเข้า</th>
              <th className="px-3 py-2 text-right">ถอนใช้ส่วนตัว</th>
            </tr>
          </thead>
          <tbody>
            {r.months.map((x) => (
              <tr key={x.month} className="border-t" data-testid={`cash-book-month-${x.month}`}>
                <td className="px-3 py-1.5">{x.month}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m(x.receipt)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m(x.payment)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={x.net} decimals /></td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m(x.ownerIn)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m(x.ownerOut)}</td>
              </tr>
            ))}
            <tr className="border-t font-semibold" data-testid="cash-book-total">
              <td className="px-3 py-1.5">รวม</td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.receipt} decimals /></td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.payment} decimals /></td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.net} decimals /></td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.ownerIn} decimals /></td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.ownerOut} decimals /></td>
            </tr>
          </tbody>
        </TableWrap>
      </section>

      <section className="flex flex-col gap-2" data-testid="cash-book-rows">
        <h2 className="text-sm font-medium">รายการประจำวัน ({r.rows.length} รายการ)</h2>
        {/* มือถือ: การ์ดต่อวัน (ตาราง 6 คอลัมน์กว้างเกินจอ) · พิมพ์ใช้ตาราง */}
        <div className="flex flex-col gap-2 sm:hidden print:hidden" data-testid="cash-book-cards">
          {[...byDay.entries()].map(([day, rows]) => (
            <div key={`m-${day}`} className="rounded-lg border text-sm" style={{ borderColor: "var(--color-line)" }}>
              {rows.map((x) => (
                <div key={`m-${x.entryId}`} className="flex items-start justify-between gap-2 border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
                  <div className="min-w-0">
                    <div className="text-xs text-[color:var(--color-muted)]">{ymdTh(x.date)} · {x.docNo}</div>
                    <div>{x.description}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">{x.owner ? "เงินทุน/ถอนใช้ส่วนตัว" : x.counterTh}</div>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    {x.receipt ? <span>+<MoneyText satang={x.receipt} decimals /></span> : <span>−<MoneyText satang={x.payment} decimals /></span>}
                  </div>
                </div>
              ))}
              {dayTotal.get(day) && (
                <div className="flex justify-between bg-[color:var(--color-surface-2)] px-3 py-1 text-xs font-medium">
                  <span>รวมวันที่ {ymdTh(day)}</span>
                  <span className="tabular-nums">รับ <MoneyText satang={dayTotal.get(day)!.receipt} decimals /> · จ่าย <MoneyText satang={dayTotal.get(day)!.payment} decimals /></span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="hidden sm:block print:block">
        <TableWrap>
          <thead>
            <tr className="text-left text-[color:var(--color-muted)]">
              <th className="px-3 py-2">วันที่</th>
              <th className="px-3 py-2">เลขที่ใบสำคัญ</th>
              <th className="px-3 py-2">รายการ</th>
              <th className="px-3 py-2 text-right">รายรับ</th>
              <th className="px-3 py-2 text-right">รายจ่าย</th>
              <th className="px-3 py-2">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {[...byDay.entries()].map(([day, rows]) => (
              <DayRows key={day} day={day} rows={rows} total={dayTotal.get(day)} base={base} />
            ))}
            {r.rows.length === 0 && (
              <tr className="border-t">
                <td colSpan={6} className="px-3 py-4 text-center text-[color:var(--color-muted)]">ไม่มีเงินเข้า-ออกในช่วงนี้</td>
              </tr>
            )}
          </tbody>
        </TableWrap>
        </div>
      </section>
    </div>
  );
}

function DayRows({ day, rows, total, base }: { day: string; rows: Awaited<ReturnType<typeof cashBook>>["rows"]; total?: { receipt: number; payment: number }; base: string }) {
  return (
    <>
      {rows.map((x) => (
        <tr key={x.entryId} className="border-t" data-testid="cash-book-row" data-owner={x.owner ? "1" : "0"}>
          <td className="px-3 py-1.5 whitespace-nowrap">{ymdTh(x.date)}</td>
          <td className="px-3 py-1.5 whitespace-nowrap">
            <a href={`${base}/journal?q=${encodeURIComponent(x.docNo)}`} className="underline">{x.docNo}</a>
          </td>
          <td className="px-3 py-1.5">{x.description}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{m(x.receipt)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{m(x.payment)}</td>
          <td className="px-3 py-1.5 text-xs text-[color:var(--color-muted)]">{x.owner ? `เงินทุน/ถอนใช้ส่วนตัว (ไม่รวมในรายรับ/รายจ่าย) · ${x.counterTh}` : x.counterTh}</td>
        </tr>
      ))}
      {total && (
        <tr className="border-t bg-[color:var(--color-surface-2)] text-xs font-medium" data-testid={`cash-book-day-${day}`}>
          <td className="px-3 py-1" colSpan={3}>รวมวันที่ {ymdTh(day)}</td>
          <td className="px-3 py-1 text-right tabular-nums">{m(total.receipt)}</td>
          <td className="px-3 py-1 text-right tabular-nums">{m(total.payment)}</td>
          <td />
        </tr>
      )}
    </>
  );
}
