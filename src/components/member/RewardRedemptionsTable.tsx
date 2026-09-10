// RewardRedemptionsTable.tsx — ประวัติการแลกของรางวัล (M2.4 · ภาพ 18 ล่าง)
// คอลัมน์: รหัส · ของรางวัล · สมาชิก · สถานะ (ชิป) · สาขา · พนักงานที่ส่งมอบ
import type { RedemptionRowV2 } from "@/lib/modules/reward";
import { REWARD_STATUS_LABEL } from "./RewardsCatalog";

function StatusChip({ status }: { status: string }) {
  const tone = status === "FULFILLED" ? "var(--color-ink)" : status === "CANCELLED" ? "var(--color-danger)" : "var(--color-muted)";
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs" style={{ border: `1px solid ${tone}`, color: tone }}>
      {REWARD_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function RewardRedemptionsTable({ rows }: { rows: RedemptionRowV2[] }) {
  return (
    <div data-testid="rewards-redemptions" className="card p-0">
      <div className="flex items-center justify-between p-4 pb-3">
        <h2 className="text-sm font-semibold">ประวัติการแลก</h2>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {rows.length.toLocaleString("th-TH")} รายการล่าสุด
        </span>
      </div>
      <div className="overflow-x-auto">
        <table data-testid="rewards-redemptions-table" className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--color-muted)", fontSize: 12 }}>
              <th className="px-4 py-2 text-left font-normal">รหัส</th>
              <th className="px-4 py-2 text-left font-normal">ของรางวัล</th>
              <th className="px-4 py-2 text-left font-normal">สมาชิก</th>
              <th className="px-4 py-2 text-left font-normal">สถานะ</th>
              <th className="px-4 py-2 text-left font-normal">สาขา</th>
              <th className="px-4 py-2 text-left font-normal">พนักงานที่ส่งมอบ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                  ยังไม่มีประวัติการแลก
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} data-testid={`rewards-redemptions-row-${r.id}`} style={{ borderTop: "1px solid var(--color-line)" }}>
                <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-3">{r.rewardName}</td>
                <td className="px-4 py-3">{r.memberName}</td>
                <td className="px-4 py-3">
                  <StatusChip status={r.status} />
                </td>
                <td className="px-4 py-3">{r.unitName ?? "—"}</td>
                <td className="px-4 py-3">{r.fulfilledByName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
