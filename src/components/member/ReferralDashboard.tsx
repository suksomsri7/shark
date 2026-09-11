// ReferralDashboard.tsx — ขวาของหน้า "แนะนำเพื่อน" (M3.5 · ภาพ 24): KPI 4 ช่อง + ผู้แนะนำสูงสุด 5 อันดับ
// 🔴 ไม่มี state → เรนเดอร์ฝั่งเซิร์ฟเวอร์ได้ · ชนิดข้อมูลมาจาก `referrals-shared.ts` (ไฟล์บริสุทธิ์) เท่านั้น
import type { LeaderboardRow, ReferralStats } from "@/lib/modules/member/referrals-shared";
import { MemberIcon } from "./MemberIcon";

const money = (satang: number): string => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
const int = (n: number): string => n.toLocaleString("th-TH");

function Kpi({ icon, label, value, hint, testid }: { icon: string; label: string; value: string; hint: string; testid: string }) {
  return (
    <div data-testid={testid} className="card flex min-w-0 flex-col gap-1.5 p-4">
      <span className="flex min-w-0 items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
        <MemberIcon name={icon} size="sm" />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-2xl font-semibold" style={{ color: "var(--color-ink)" }}>
        {value}
      </span>
      <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
        {hint}
      </span>
    </div>
  );
}

export function ReferralKpis({ stats, windowLabel }: { stats: ReferralStats; windowLabel: string }) {
  const vs =
    stats.first90dSpendSatang === 0
      ? "ยังไม่มียอดซื้อ"
      : stats.vsAvgPct >= 0
        ? `สูงกว่าเฉลี่ย ${int(stats.vsAvgPct)}%`
        : `ต่ำกว่าเฉลี่ย ${int(Math.abs(stats.vsAvgPct))}%`;
  return (
    <div data-testid="referrals-kpi" className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi testid="referrals-kpi-members" icon="users" label="สมาชิกจากการแนะนำ" value={int(stats.referredMembers)} hint={windowLabel} />
      <Kpi testid="referrals-kpi-conversion" icon="bolt" label="อัตราแปลง" value={`${int(stats.conversionPct)}%`} hint="เพื่อนสมัคร→ซื้อจริง" />
      <Kpi testid="referrals-kpi-cost" icon="money" label="ต้นทุน/คน" value={money(stats.costPerMemberSatang)} hint="รวมรางวัลสองฝั่ง" />
      <Kpi testid="referrals-kpi-spend" icon="chart" label="ยอด 90 วันแรก" value={money(stats.first90dSpendSatang)} hint={vs} />
    </div>
  );
}

function Rank({ n }: { n: number }) {
  const top = n <= 3;
  return (
    <span
      className="inline-grid h-6 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
      style={
        top
          ? { background: "var(--color-ink)", color: "var(--color-surface)" }
          : { border: "1px solid var(--color-line)", color: "var(--color-ink)" }
      }
    >
      {n}
    </span>
  );
}

function rewardText(r: LeaderboardRow): string {
  if (r.pointsEarned > 0 && r.vouchersEarned > 0) return `${int(r.pointsEarned)} แต้ม + voucher ${int(r.vouchersEarned)} ใบ`;
  if (r.vouchersEarned > 0) return `voucher ${int(r.vouchersEarned)} ใบ`;
  return `${int(r.pointsEarned)} แต้ม`;
}

export function ReferralLeaderboard({ rows, windowLabel }: { rows: LeaderboardRow[]; windowLabel: string }) {
  return (
    <section data-testid="referrals-leaderboard" className="card min-w-0 overflow-hidden">
      <div className="flex items-baseline gap-2 px-4 pb-2 pt-3">
        <h2 className="font-semibold">ผู้แนะนำสูงสุด</h2>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {windowLabel}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm" style={{ color: "var(--color-muted)" }}>
          ยังไม่มีการแนะนำในช่วงนี้ — เปิดโปรแกรมแล้วให้สมาชิกแชร์ลิงก์ของตัวเองได้เลย
        </p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }} className="text-xs">
                <th className="w-14 px-3 py-2 text-left font-medium" aria-label="อันดับ" />
                <th className="px-2 py-2 text-left font-medium">ชื่อ</th>
                <th className="px-2 py-2 text-right font-medium">แนะนำ</th>
                <th className="px-2 py-2 text-right font-medium">สำเร็จ</th>
                <th className="px-3 py-2 text-right font-medium">รางวัลที่ได้</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.customerId} data-testid={`referrals-leader-${i + 1}`} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                  <td className="px-3 py-2.5">
                    <Rank n={i + 1} />
                  </td>
                  <td className="max-w-[220px] truncate px-2 py-2.5" style={{ fontWeight: i < 3 ? 600 : 400 }}>
                    {r.name}
                  </td>
                  <td className="px-2 py-2.5 text-right">{int(r.referred)}</td>
                  <td className="px-2 py-2.5 text-right">{int(r.converted)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{rewardText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
