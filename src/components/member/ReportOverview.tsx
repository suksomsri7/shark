// ReportOverview.tsx — KPI 6 ช่อง + กราฟแท่ง "สมาชิกใหม่ต่อเดือน" (M3.8 · ภาพ 25 แถวบน)
// server component ล้วน · กราฟเป็น div ล้วน (ห้ามไลบรารีกราฟ) · สีจากโทเคน `--color-ink` ผสมขาว (ไม่มี hex)
import { MemberIcon } from "@/components/member/MemberIcon";
import { bahtCompact, baht, int, thaiMonthShort, type ReportOverview } from "@/lib/modules/member/reports-shared";

const MUTED = "var(--color-muted)";
/** แท่งปกติ = หมึกจาง 17% · แท่งเดือนล่าสุด = หมึกเต็ม (ภาพ 25) */
const BAR_SOFT = "color-mix(in srgb, var(--color-ink) 17%, white)";
const BAR_STRONG = "var(--color-ink)";

function Kpi({ icon, label, value, hint }: { icon: string; label: string; value: string; hint: string }) {
  return (
    <div className="card flex min-w-0 flex-col gap-1.5 p-4">
      <span className="flex min-w-0 items-center gap-1.5 text-xs" style={{ color: MUTED }}>
        <MemberIcon name={icon} size="sm" />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
        {value}
      </span>
      <span className="text-xs break-words" style={{ color: MUTED }}>
        {hint}
      </span>
    </div>
  );
}

export function ReportKpis({ data }: { data: ReportOverview }) {
  const share = data.sales.sharePct === null ? "ยังไม่มียอดขายของร้านในช่วงนี้" : `${data.sales.sharePct}% ของยอดร้าน`;
  return (
    <div data-testid="reports-kpi" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Kpi icon="users" label="สมาชิกทั้งหมด" value={int(data.members.total)} hint={`+${int(data.members.newThisMonth)} เดือนนี้`} />
      <Kpi
        icon="card"
        label={data.sales.months === 12 ? "ยอดขายสมาชิก 12 เดือน" : `ยอดขายสมาชิก ${data.sales.months} เดือน`}
        value={bahtCompact(data.sales.satang)}
        hint={share}
      />
      <Kpi icon="chart" label="เฉลี่ย/คน" value={baht(data.sales.perMemberSatang)} hint={data.sales.months === 12 ? "ต่อปี" : `ต่อ ${data.sales.months} เดือน`} />
      <Kpi icon="restore" label="อัตรารักษาลูกค้า" value={`${data.retentionPct}%`} hint={`กลับมาซื้อซ้ำใน ${data.sales.months} เดือน`} />
      <Kpi icon="star" label="แต้มคงค้าง" value={int(data.pointsOutstanding)} hint={`≈ ${baht(data.pointsLiabilitySatang)} หนี้สิน`} />
      <Kpi icon="tag" label="ต้นทุนโปรโมชันเดือนนี้" value={baht(data.promoCostMonthSatang)} hint="voucher + แต้มที่แจก" />
    </div>
  );
}

/** กราฟแท่งแนวตั้งแบบ div — แท่งสุดท้าย (เดือนล่าสุด) เข้ม · ความสูงเทียบค่าสูงสุด · ค่า 0 = เส้นบางที่ฐาน */
export function ReportBars({
  rows,
  label,
  unit,
  height = 112,
}: {
  rows: { month: string; value: number }[];
  label: string;
  unit: string;
  height?: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-end gap-1" style={{ height }} role="img" aria-label={label}>
        {rows.map((r, i) => (
          <div
            key={r.month}
            title={`${r.month}: ${int(r.value)} ${unit}`}
            className="min-w-0 flex-1 rounded-t-[3px]"
            style={{
              height: `${r.value > 0 ? Math.max(4, Math.round((r.value / max) * 100)) : 2}%`,
              background: i === rows.length - 1 ? BAR_STRONG : BAR_SOFT,
            }}
          />
        ))}
      </div>
      <div className="flex min-w-0 gap-1">
        {rows.map((r) => (
          <span key={r.month} className="min-w-0 flex-1 truncate text-center text-[10px]" style={{ color: MUTED }}>
            {thaiMonthShort(r.month)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ReportNewMembersChart({ rows }: { rows: ReportOverview["newPerMonth"] }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <section data-testid="reports-chart-new" className="card flex min-w-0 flex-col gap-3 p-4">
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-bold">สมาชิกใหม่ต่อเดือน</h2>
        <span className="text-xs" style={{ color: MUTED }}>
          {rows.length} เดือนล่าสุด · รวม {int(total)} คน
        </span>
      </header>
      <ReportBars rows={rows.map((r) => ({ month: r.month, value: r.count }))} label="จำนวนสมาชิกใหม่ต่อเดือน" unit="คน" />
    </section>
  );
}
