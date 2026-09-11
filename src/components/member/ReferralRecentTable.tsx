"use client";

// ReferralRecentTable.tsx — ตาราง "การแนะนำล่าสุด" (M3.5 · ภาพ 24 ขวาล่าง)
// ผู้แนะนำ → เพื่อน · สมัคร · ซื้อครั้งแรก · สถานะ (รอ / สำเร็จ / ถูกปฏิเสธ · เหตุผล) · รางวัลจ่าย
// 🔴 ปุ่ม "ปฏิเสธ" (สงสัยโกง) เห็นเฉพาะคนที่มี `member.referral.manage` และแถวที่ยังไม่จ่ายรางวัล
//    กรอกเหตุผลในแถวเดียวกัน (ไม่ใช่กล่องเด้ง) · ข้อความผิดพลาดขึ้นใต้ช่องกรอก
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rejectReferralAction } from "@/lib/modules/member/referrals-actions";
import type { ReferralRowView } from "@/lib/modules/member/referrals-shared";

const money = (satang: number): string => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
const shortDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

/** เหตุผลที่ถูกปฏิเสธแบบสั้นในชิป (ข้อความเต็มอยู่ใน title) */
function rejectShort(reason: string | null): string {
  const r = reason ?? "";
  if (r.includes("ตัวเอง")) return "แนะนำตัวเอง";
  if (r.includes("ใหม่")) return "ไม่ใช่สมาชิกใหม่";
  if (r.includes("อุปกรณ์เดียว")) return "อุปกรณ์ซ้ำ";
  if (r.includes("เบอร์")) return "เบอร์ซ้ำ";
  return r.length > 18 ? `${r.slice(0, 18)}…` : r || "ร้านปฏิเสธ";
}

function StatusBadge({ row }: { row: ReferralRowView }) {
  if (row.status === "REJECTED") {
    return (
      <span
        title={row.rejectReason ?? "ถูกปฏิเสธ"}
        className="whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs"
        style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
      >
        ถูกปฏิเสธ · {rejectShort(row.rejectReason)}
      </span>
    );
  }
  if (row.status === "PENDING") {
    return (
      <span className="whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs" style={{ color: "var(--color-muted)", borderColor: "var(--color-line)" }}>
        รอ
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs" style={{ color: "var(--color-tag-green)", borderColor: "var(--color-tag-green)" }}>
      สำเร็จ
    </span>
  );
}

function RewardCell({ row }: { row: ReferralRowView }) {
  if (row.status !== "REWARDED") return <span style={{ color: "var(--color-muted)" }}>—</span>;
  const capped = row.rewards.referrer?.capped === true;
  return (
    <span
      title={capped ? "รางวัลจ่ายแล้ว — เฉพาะเพื่อน (ผู้แนะนำครบเพดานของเดือนนี้)" : "รางวัลจ่ายแล้วทั้งสองฝั่ง"}
      aria-label="รางวัลจ่ายแล้ว"
      className="whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-semibold"
      style={{ color: "var(--color-ink)", borderColor: "var(--color-ink)" }}
    >
      {capped ? "จ่ายเฉพาะเพื่อน" : "จ่ายแล้ว"}
    </span>
  );
}

function RejectInline({ systemId, id }: { systemId: string; id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" data-testid={`referral-reject-${id}`} className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => setOpen(true)}>
        ปฏิเสธ
      </button>
    );
  }
  return (
    <span className="flex min-w-[220px] flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <input
          className="input min-w-[120px] flex-1 text-xs"
          placeholder="เหตุผล เช่น สงสัยโกง"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="เหตุผลที่ปฏิเสธ"
        />
        <button
          type="button"
          className="btn btn-primary px-2 py-0.5 text-xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr("");
              const res = await rejectReferralAction(systemId, id, reason);
              if (res.ok) {
                setOpen(false);
                router.refresh();
              } else setErr(res.reason);
            })
          }
        >
          ยืนยัน
        </button>
        <button type="button" className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => setOpen(false)}>
          ยกเลิก
        </button>
      </span>
      {err && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }}>
          {err}
        </span>
      )}
    </span>
  );
}

export function ReferralRecentTable({
  systemId,
  rows,
  canManage,
}: {
  systemId: string;
  rows: ReferralRowView[];
  canManage: boolean;
}) {
  return (
    <section data-testid="referrals-recent" className="card min-w-0 overflow-hidden">
      <div className="flex items-baseline gap-2 px-4 pb-2 pt-3">
        <h2 className="font-semibold">การแนะนำล่าสุด</h2>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {rows.length.toLocaleString("th-TH")} รายการ
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm" style={{ color: "var(--color-muted)" }}>
          ยังไม่มีเพื่อนสมัครด้วยโค้ดแนะนำ
        </p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }} className="text-xs">
                <th className="px-3 py-2 text-left font-medium">ผู้แนะนำ → เพื่อน</th>
                <th className="px-2 py-2 text-left font-medium">สมัคร</th>
                <th className="px-2 py-2 text-right font-medium">ซื้อครั้งแรก</th>
                <th className="px-2 py-2 text-left font-medium">สถานะ</th>
                <th className="px-3 py-2 text-left font-medium">รางวัลจ่าย</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid={`referral-row-${r.id}`} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                  <td className="max-w-[260px] truncate px-3 py-2.5">
                    {r.referrer.name} → {r.referee?.name ?? "เพื่อน (ยังไม่สมัคร)"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5" style={{ color: "var(--color-muted)" }}>
                    {shortDate(r.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right" style={{ color: r.firstPurchaseSatang === null ? "var(--color-muted)" : "var(--color-ink)" }}>
                    {r.status === "REJECTED" ? "—" : r.firstPurchaseSatang === null ? "ยังไม่ซื้อ" : money(r.firstPurchaseSatang)}
                  </td>
                  <td className="px-2 py-2.5">
                    <StatusBadge row={r} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <RewardCell row={r} />
                      {canManage && (r.status === "PENDING" || r.status === "CONVERTED") && <RejectInline systemId={systemId} id={r.id} />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default ReferralRecentTable;
