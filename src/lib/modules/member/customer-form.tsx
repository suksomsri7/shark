"use client";

import { useActionState } from "react";
import { updateCustomerAction, type UpdateCustomerState } from "./customer-actions";

const muted = "text-[color:var(--color-muted)]";

// ── ฟอร์มแก้ไขข้อมูลสมาชิก (backoffice) — prefill + inline error ──
export function MemberEditForm({
  customerId,
  name,
  phone,
  email,
  marketingConsent,
}: {
  customerId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  marketingConsent: boolean;
}) {
  const [state, action, pending] = useActionState<UpdateCustomerState, FormData>(
    updateCustomerAction,
    { status: "idle" },
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />

      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        ชื่อ
        <input
          name="name"
          defaultValue={name ?? ""}
          placeholder="ชื่อสมาชิก"
          className="input min-h-[44px]"
        />
      </label>

      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        เบอร์โทร
        <input
          name="phone"
          inputMode="tel"
          defaultValue={phone ?? ""}
          placeholder="เช่น 0812345678"
          className="input min-h-[44px]"
        />
      </label>

      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        อีเมล (ไม่บังคับ)
        <input
          name="email"
          type="email"
          defaultValue={email ?? ""}
          placeholder="name@example.com"
          className="input min-h-[44px]"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="marketingConsent"
          defaultChecked={marketingConsent}
          className="h-5 w-5"
        />
        ยินยอมรับข่าวสาร/โปรโมชัน
      </label>

      <p className={`text-xs ${muted}`}>ต้องมีชื่อหรือเบอร์อย่างน้อย 1 อย่าง</p>

      {state.status === "error" && (
        <p className="text-xs text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && <p className="text-sm font-medium">✅ บันทึกข้อมูลแล้ว</p>}

      <button
        className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
      </button>
    </form>
  );
}
