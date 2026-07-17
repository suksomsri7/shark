"use client";

import { useActionState } from "react";
import { redeemRewardAction, type RedeemState } from "@/lib/actions/systems";

type RewardOpt = { id: string; name: string; pointsCost: number; stock: number | null };
type CustomerOpt = { id: string; name: string | null; memberCode: string; phone: string | null };

// ฟอร์มแลกรางวัลแทนลูกค้า (พนักงานกดให้) — โชว์โค้ดรับของ/ข้อผิดพลาดแบบ inline
export function RedeemForm({
  systemId,
  rewards,
  customers,
}: {
  systemId: string;
  rewards: RewardOpt[];
  customers: CustomerOpt[];
}) {
  const [state, action, pending] = useActionState<RedeemState, FormData>(redeemRewardAction, {
    status: "idle",
  });

  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="text-sm font-medium">แลกรางวัลให้สมาชิก</div>
      <input type="hidden" name="systemId" value={systemId} />

      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        รางวัล
        <select name="rewardId" required className="input" defaultValue="">
          <option value="" disabled>
            เลือกรางวัล
          </option>
          {rewards.map((r) => (
            <option key={r.id} value={r.id} disabled={r.stock !== null && r.stock <= 0}>
              {r.name} · {r.pointsCost} แต้ม
              {r.stock !== null ? (r.stock <= 0 ? " · หมด" : ` · เหลือ ${r.stock}`) : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        สมาชิก
        <select name="customerId" required className="input" defaultValue="">
          <option value="" disabled>
            เลือกสมาชิก
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? "ไม่ระบุชื่อ"} · {c.memberCode}
              {c.phone ? ` · ${c.phone}` : ""}
            </option>
          ))}
        </select>
      </label>

      {state.status === "error" && (
        <p className="text-xs text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && (
        <p className="text-sm font-medium">
          ✅ แลกสำเร็จ — โค้ดรับของ <span className="font-mono tracking-widest">{state.code}</span>
        </p>
      )}

      <button className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50" disabled={pending}>
        {pending ? "กำลังแลก…" : "แลกรางวัล"}
      </button>
    </form>
  );
}
