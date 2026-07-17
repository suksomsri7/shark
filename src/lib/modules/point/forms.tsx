"use client";

import { useActionState } from "react";
import {
  setPointSettingsAction,
  adjustPointsAction,
  type PointSettingsState,
  type AdjustPointsState,
} from "@/lib/actions/systems";

type CustomerOpt = { id: string; name: string | null; memberCode: string; phone: string | null };

const muted = "text-[color:var(--color-muted)]";

// ── ตั้งค่าอัตราสะสม: บาทต่อ 1 แต้ม + เปิด/ปิดสะสม ──
export function PointSettingsForm({
  systemId,
  bahtPerPoint,
  active,
}: {
  systemId: string;
  bahtPerPoint: number;
  active: boolean;
}) {
  const [state, action, pending] = useActionState<PointSettingsState, FormData>(
    setPointSettingsAction,
    { status: "idle" },
  );

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="text-sm font-medium">ตั้งค่าแต้ม</div>
      <input type="hidden" name="systemId" value={systemId} />

      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        ใช้จ่ายกี่บาท = 1 แต้ม
        <input
          name="bahtPerPoint"
          type="number"
          min={0.01}
          step="0.01"
          required
          defaultValue={bahtPerPoint}
          className="input min-h-[44px]"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={active}
          className="h-5 w-5"
        />
        เปิดการสะสมแต้ม
      </label>

      {state.status === "error" && (
        <p className="text-xs text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && <p className="text-sm font-medium">✅ บันทึกอัตราสะสมแล้ว</p>}

      <button
        className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "กำลังบันทึก…" : "บันทึกอัตราสะสม"}
      </button>
    </form>
  );
}

// ── ปรับ/แจกแต้มมือให้สมาชิก ──
export function AdjustPointsForm({
  systemId,
  customers,
}: {
  systemId: string;
  customers: CustomerOpt[];
}) {
  const [state, action, pending] = useActionState<AdjustPointsState, FormData>(
    adjustPointsAction,
    { status: "idle" },
  );

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="text-sm font-medium">ปรับ/แจกแต้ม</div>
      <input type="hidden" name="systemId" value={systemId} />

      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        สมาชิก
        <select name="customerId" required className="input min-h-[44px]" defaultValue="">
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

      <div className="flex gap-2">
        <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
          ทำรายการ
          <select name="mode" className="input min-h-[44px]" defaultValue="grant">
            <option value="grant">แจกแต้ม (+)</option>
            <option value="deduct">หักแต้ม (−)</option>
          </select>
        </label>
        <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
          จำนวนแต้ม
          <input
            name="amount"
            type="number"
            min={1}
            step={1}
            required
            placeholder="เช่น 10"
            className="input min-h-[44px]"
          />
        </label>
      </div>

      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        เหตุผล (ไม่บังคับ)
        <input name="reason" placeholder="เช่น ชดเชยลูกค้า" className="input min-h-[44px]" />
      </label>

      {state.status === "error" && (
        <p className="text-xs text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && (
        <p className="text-sm font-medium">✅ ปรับแต้มแล้ว — คงเหลือ {state.balance} แต้ม</p>
      )}

      <button
        className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "กำลังบันทึก…" : "บันทึกการปรับแต้ม"}
      </button>
    </form>
  );
}
