// TierHistory.tsx — "การเปลี่ยนระดับล่าสุด" 20 แถว (M1.10 · ภาพ 04 ล่างสุด)
// รับข้อมูลที่ page.tsx ประกอบมาให้แล้ว (join ชื่อสมาชิก + ระดับเดิม/ใหม่) — คอมโพเนนต์นี้แค่วาดตาราง

import { TierChip } from "./TierChip";
import type { TierChangeReason } from "@prisma/client";

const REASON_LABELS: Record<TierChangeReason, string> = {
  RULE_UPGRADE: "เลื่อนระดับอัตโนมัติ",
  RULE_DOWNGRADE: "ลดระดับอัตโนมัติ",
  RULE_KEEP: "คงระดับ",
  MANUAL: "ตั้งด้วยมือ",
  PAID_PLAN: "สมัครแบบเสียเงิน",
  PLAN_EXPIRED: "แบบเสียเงินหมดอายุ",
  MERGE: "รวมบัญชี",
  INITIAL: "เริ่มต้น",
};

/** เหตุผลไทยจาก evidence (Json) — MANUAL/archive เก็บ `reason` เป็นข้อความไว้ตรง ๆ, กฎอัตโนมัติเก็บตัวเลขประกอบ */
function evidenceSummary(evidence: unknown): string {
  const ev = evidence && typeof evidence === "object" ? (evidence as Record<string, unknown>) : {};
  if (typeof ev.reason === "string" && ev.reason) return ev.reason;
  const parts: string[] = [];
  if (typeof ev.spent12m === "number") parts.push(`ยอด 12 เดือน ฿${Math.round(ev.spent12m / 100).toLocaleString("th-TH")}`);
  if (typeof ev.visits12m === "number") parts.push(`มาใช้บริการ ${ev.visits12m} ครั้ง`);
  if (typeof ev.shortfall === "number" && ev.shortfall > 0) parts.push(`ขาดอีก ${ev.shortfall.toLocaleString("th-TH")}`);
  return parts.length ? parts.join(" · ") : "—";
}

export type TierHistoryRow = {
  id: string;
  createdAt: string;
  customerName: string;
  fromTier: { name: string; color: string } | null;
  toTier: { name: string; color: string } | null;
  reason: TierChangeReason;
  evidence: unknown;
  notifiedAt: string | null;
  pending: boolean;
};

export type TierHistoryProps = { rows: TierHistoryRow[] };

/** ตารางประวัติการเปลี่ยนระดับ 20 แถวล่าสุด (`tiers-history`) */
export function TierHistory({ rows }: TierHistoryProps) {
  return (
    <div data-testid="tiers-history" className="flex flex-col gap-2 rounded-2xl border p-4" style={{ borderColor: "var(--color-line)" }}>
      <h2 className="text-sm font-semibold">การเปลี่ยนระดับล่าสุด</h2>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          ยังไม่มีการเปลี่ยนระดับ
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead style={{ color: "var(--color-muted)" }}>
              <tr>
                <th className="py-1 pr-3 font-normal">วันที่</th>
                <th className="py-1 pr-3 font-normal">ชื่อ</th>
                <th className="py-1 pr-3 font-normal">เดิม → ใหม่</th>
                <th className="py-1 pr-3 font-normal">เหตุผล</th>
                <th className="py-1 font-normal">แจ้งแล้ว</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString("th-TH", { day: "2-digit", month: "short", timeZone: "Asia/Bangkok" })}
                  </td>
                  <td className="py-1.5 pr-3">{r.customerName}</td>
                  <td className="py-1.5 pr-3">
                    <span className="flex items-center gap-1">
                      {r.fromTier ? <TierChip name={r.fromTier.name} color={r.fromTier.color} /> : <span style={{ color: "var(--color-muted)" }}>—</span>}
                      →
                      {r.toTier ? <TierChip name={r.toTier.name} color={r.toTier.color} /> : <span style={{ color: "var(--color-muted)" }}>—</span>}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    {REASON_LABELS[r.reason]}: {evidenceSummary(r.evidence)}
                  </td>
                  <td className="py-1.5">
                    {r.pending ? (
                      <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
                        รออนุมัติ
                      </span>
                    ) : r.notifiedAt ? (
                      <span className="rounded-full px-2 py-0.5" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                        ส่งแล้ว
                      </span>
                    ) : (
                      <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
                        รอส่ง
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TierHistory;
