// ReportCards.tsx — การ์ด "ระดับ" · "แต้ม" · "โปรโมชัน" (M3.8 · ภาพ 25 แถวล่าง)
// server component ล้วน · testid `reports-tiers` · `reports-points` · `reports-points-liability` · `reports-promotions`
// `detailed` = โหมดแท็บของตัวเอง (ตารางเต็ม) · ไม่ส่ง = การ์ดสรุปบนแท็บภาพรวม
import Link from "next/link";
import { TierChip } from "@/components/member/TierChip";
import { ReportBars } from "@/components/member/ReportOverview";
import {
  baht,
  int,
  roiLabel,
  thaiMonthLabel,
  type ReportPoints,
  type ReportPromotions,
  type ReportTiers,
} from "@/lib/modules/member/reports-shared";

const MUTED = "var(--color-muted)";
const TH = "px-3 py-2 font-medium";

function CardHead({ title, note }: { title: string; note?: string }) {
  return (
    <header className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h2 className="text-sm font-bold">{title}</h2>
      {note && (
        <span className="text-xs" style={{ color: MUTED }}>
          {note}
        </span>
      )}
    </header>
  );
}

// ───────────────────────── ระดับ ─────────────────────────

export function ReportTiersCard({ data, detailed = false }: { data: ReportTiers; detailed?: boolean }) {
  return (
    <section data-testid="reports-tiers" className="card flex min-w-0 flex-col gap-3 p-4">
      <CardHead title="ระดับ" note={detailed ? `สมาชิก ${int(data.total)} คน · ยอดเฉลี่ย 12 เดือนต่อคน` : undefined} />
      <div className="-mx-4 min-w-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: MUTED, background: "var(--color-surface-2)" }}>
              <th className={TH}>ระดับ</th>
              <th className={`${TH} text-right`}>จำนวน</th>
              {detailed && <th className={`${TH} text-right`}>สัดส่วน</th>}
              <th className={`${TH} text-right`}>ยอดเฉลี่ย</th>
              <th className={`${TH} text-right`}>แต้มคงค้าง</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.tierDefId ?? "none"} className="border-t">
                <td className="px-3 py-2">
                  <TierChip name={r.name} color={r.color} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{int(r.count)}</td>
                {detailed && (
                  <td className="px-3 py-2 text-right tabular-nums">{data.total ? `${Math.round((r.count / data.total) * 100)}%` : "—"}</td>
                )}
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{baht(r.avgSpend12mSatang)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(r.pointsOutstanding)}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-xs" style={{ color: MUTED }}>
                  ระบบนี้ยังไม่มีระดับสมาชิก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ───────────────────────── แต้ม ─────────────────────────

export function ReportPointsCard({ data, detailed = false }: { data: ReportPoints; detailed?: boolean }) {
  return (
    <section data-testid="reports-points" className="card flex min-w-0 flex-col gap-3 p-4">
      <CardHead title="แต้ม" note={`${data.months} เดือนล่าสุด · แท่ง = แต้มที่ออก`} />
      <ReportBars rows={data.monthly.map((m) => ({ month: m.month, value: m.earned }))} label="แต้มที่ออกต่อเดือน" unit="แต้ม" height={detailed ? 120 : 64} />
      <p className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: MUTED }}>
        <span>
          ออก <b style={{ color: "var(--color-ink)" }}>{int(data.totals.earned)}</b>
        </span>
        <span>
          ใช้ <b style={{ color: "var(--color-ink)" }}>{int(data.totals.burned)}</b>
        </span>
        <span>
          หมดอายุ <b style={{ color: "var(--color-ink)" }}>{int(data.totals.expired)}</b>
        </span>
      </p>
      <div
        data-testid="reports-points-liability"
        className="flex min-w-0 flex-col gap-0.5 rounded-lg px-3 py-2 text-xs"
        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
      >
        <span style={{ color: MUTED }}>หนี้สินแต้มคงค้าง</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
          ≈ {baht(data.liabilitySatang)}
        </span>
        <span className="break-words" style={{ color: MUTED }}>
          {int(data.outstanding)} แต้ม × มูลค่าแต้มละ {(data.burnRateSatang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท
        </span>
      </div>
      {detailed && (
        <div className="-mx-4 min-w-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: MUTED, background: "var(--color-surface-2)" }}>
                <th className={TH}>เดือน</th>
                <th className={`${TH} text-right`}>ออก</th>
                <th className={`${TH} text-right`}>ใช้</th>
                <th className={`${TH} text-right`}>หมดอายุ</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.map((m) => (
                <tr key={m.month} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{thaiMonthLabel(m.month)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(m.earned)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(m.burned)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(m.expired)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── โปรโมชัน ─────────────────────────

function upliftLabel(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function ReportPromotionsCard({ systemId, data, detailed = false }: { systemId: string; data: ReportPromotions; detailed?: boolean }) {
  const base = `/app/sys/${systemId}/member`;
  const journeys = detailed ? data.journeys : [...data.journeys].sort((a, b) => b.saleSatang - a.saleSatang).slice(0, 5);
  return (
    <section data-testid="reports-promotions" className="card flex min-w-0 flex-col gap-3 p-4">
      <CardHead title="โปรโมชัน" note={detailed ? `Journey ${data.days} วันล่าสุด · แคมเปญตลอดอายุ · ROI = ยอดที่เกิด ÷ ต้นทุน` : "ROI ต่อ journey"} />
      <div className="-mx-4 min-w-0 overflow-x-auto">
        <table className={`w-full text-sm ${detailed ? "min-w-[640px]" : ""}`}>
          <thead>
            <tr className="text-left text-xs" style={{ color: MUTED, background: "var(--color-surface-2)" }}>
              <th className={TH}>Journey</th>
              {detailed && <th className={`${TH} text-right`}>เข้า</th>}
              {detailed && <th className={`${TH} text-right`}>ใช้สิทธิ์</th>}
              <th className={`${TH} text-right`}>ยอดที่เกิด</th>
              {detailed && <th className={`${TH} text-right`}>ต้นทุน</th>}
              <th className={`${TH} text-right`}>ROI</th>
              {detailed && <th className={`${TH} text-right`}>เทียบกลุ่มเทียบ</th>}
            </tr>
          </thead>
          <tbody>
            {journeys.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="max-w-[220px] px-3 py-2">
                  <Link href={`${base}/journeys/${j.id}`} className="block truncate hover:underline">
                    {j.name}
                  </Link>
                </td>
                {detailed && <td className="px-3 py-2 text-right tabular-nums">{int(j.entered)}</td>}
                {detailed && <td className="px-3 py-2 text-right tabular-nums">{int(j.used)}</td>}
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{baht(j.saleSatang)}</td>
                {detailed && <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{baht(j.costSatang)}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{roiLabel(j.roi)}</td>
                {detailed && <td className="px-3 py-2 text-right tabular-nums">{upliftLabel(j.upliftPct)}</td>}
              </tr>
            ))}
            {journeys.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-xs" style={{ color: MUTED }}>
                  ยังไม่มี journey ในระบบนี้ —{" "}
                  <Link href={`${base}/journeys`} className="underline">
                    ไปหน้า Journey อัตโนมัติ
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detailed && (
        <>
          <h3 className="pt-2 text-sm font-bold">แคมเปญ</h3>
          <div className="-mx-4 min-w-0 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: MUTED, background: "var(--color-surface-2)" }}>
                  <th className={TH}>แคมเปญ</th>
                  <th className={`${TH} text-right`}>ส่งถึง</th>
                  <th className={`${TH} text-right`}>ใช้สิทธิ์</th>
                  <th className={`${TH} text-right`}>ยอดที่เกิด</th>
                  <th className={`${TH} text-right`}>ต้นทุน</th>
                  <th className={`${TH} text-right`}>ROI</th>
                  <th className={`${TH} text-right`}>เทียบกลุ่มเทียบ</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="max-w-[220px] px-3 py-2">
                      <Link href={`${base}/campaigns/${c.id}`} className="block truncate hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(c.sent)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(c.used)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{baht(c.saleSatang)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{baht(c.costSatang)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{roiLabel(c.roi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{upliftLabel(c.upliftPct)}</td>
                  </tr>
                ))}
                {data.campaigns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-xs" style={{ color: MUTED }}>
                      ยังไม่มีแคมเปญของระบบสมาชิกนี้ —{" "}
                      <Link href={`${base}/campaigns`} className="underline">
                        ไปหน้าแคมเปญ
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs" style={{ color: MUTED }}>
            <span>
              ยอดที่เกิดรวม <b style={{ color: "var(--color-ink)" }}>{baht(data.totals.saleSatang)}</b>
            </span>
            <span>
              ต้นทุนรวม <b style={{ color: "var(--color-ink)" }}>{baht(data.totals.costSatang)}</b>
            </span>
            <span>
              ROI รวม <b style={{ color: "var(--color-ink)" }}>{roiLabel(data.totals.roi)}</b>
            </span>
          </p>
          <p className="text-xs" style={{ color: MUTED }}>
            ต้นทุน = voucher ที่ถูกใช้ + ค่าส่งข้อความ + แต้มที่แจก × มูลค่าแต้ม · &quot;เทียบกลุ่มเทียบ&quot; = % ใช้สิทธิ์ของคนที่ได้รับ ลบ % ของกลุ่มที่กันไว้ไม่ส่ง
          </p>
        </>
      )}
    </section>
  );
}
