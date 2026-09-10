// RewardsCatalog.tsx — แคตตาล็อกของรางวัล + ตาราง "รอรับ" (M2.4 · ภาพ ledger/design-member/05-loyalty.png ล่าง)
import Link from "next/link";
import type { RedemptionRowV2, RewardDto } from "@/lib/modules/reward";
import { MemberIcon } from "./MemberIcon";

const KIND_ICON: Record<string, string> = { ITEM: "gift", SERVICE: "star", VOUCHER: "tag", DISCOUNT: "tag" };
export const REWARD_STATUS_LABEL: Record<string, string> = { PENDING: "รอรับ", FULFILLED: "รับแล้ว", CANCELLED: "ยกเลิก" };

function StatusChip({ status }: { status: string }) {
  const tone = status === "FULFILLED" ? "var(--color-ink)" : status === "CANCELLED" ? "var(--color-danger)" : "var(--color-muted)";
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs" style={{ border: `1px solid ${tone}`, color: tone }}>
      {REWARD_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export type RewardsCatalogProps = {
  systemId: string;
  rewards: RewardDto[];
  pending: RedemptionRowV2[];
  canManage: boolean;
  tierNameOf: (ids: string[]) => string;
};

export function RewardsCatalog({ systemId, rewards, pending, canManage, tierNameOf }: RewardsCatalogProps) {
  return (
    <div data-testid="rewards-page" className="flex flex-col gap-5">
      <div data-testid="rewards-catalog" className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">แคตตาล็อกของรางวัล</h2>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {rewards.length.toLocaleString("th-TH")} รายการ
          </span>
        </div>
        {rewards.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            ยังไม่มีของรางวัลในระบบ — กด &ldquo;เพิ่มของรางวัล&rdquo; เพื่อเริ่มต้น
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rewards.map((r) => (
              <Link
                key={r.id}
                href={`/app/sys/${systemId}/member/rewards/${r.id}`}
                data-testid={`rewards-card-${r.id}`}
                className="card flex flex-col gap-2 p-3"
                style={{ opacity: r.active ? 1 : 0.55 }}
              >
                <div className="flex h-16 items-center justify-center rounded-lg" style={{ background: "var(--color-surface-2)" }}>
                  <MemberIcon name={KIND_ICON[r.kind] ?? "gift"} size="lg" />
                </div>
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {r.pointsCost > 0 ? `${r.pointsCost.toLocaleString("th-TH")} แต้ม` : ""}
                  {r.pointsCost > 0 && r.stampsCost ? " และ/หรือ " : ""}
                  {r.stampsCost ? `${r.stampsCost} สแตมป์` : ""}
                </div>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {r.stock === null ? "สต็อกไม่จำกัด" : `สต็อก ${r.stock}`}
                  {r.tierDefIds.length > 0 ? ` · เฉพาะ ${tierNameOf(r.tierDefIds)}` : ""}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div data-testid="rewards-pending" className="card p-0">
        <div className="flex items-center justify-between p-4 pb-3">
          <h2 className="text-sm font-semibold">รอรับ</h2>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {pending.length.toLocaleString("th-TH")} รายการ
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--color-muted)", fontSize: 12 }}>
                <th className="px-4 py-2 text-left font-normal">ของรางวัล</th>
                <th className="px-4 py-2 text-left font-normal">สมาชิก</th>
                <th className="px-4 py-2 text-left font-normal">รหัสรับของ</th>
                <th className="px-4 py-2 text-left font-normal">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                    ยังไม่มีรายการรอรับ
                  </td>
                </tr>
              )}
              {pending.map((p) => (
                <tr key={p.id} data-testid={`rewards-pending-row-${p.id}`} style={{ borderTop: "1px solid var(--color-line)" }}>
                  <td className="px-4 py-3">{p.rewardName}</td>
                  <td className="px-4 py-3">{p.memberName}</td>
                  <td className="px-4 py-3">{p.code}</td>
                  <td className="px-4 py-3">
                    <StatusChip status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
