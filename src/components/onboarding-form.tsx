"use client";

import { useActionState, useState } from "react";
import { createTenantAction, type OnboardingState } from "@/lib/actions/onboarding";

const initial: OnboardingState = { status: "idle" };

const TYPES = [
  { value: "BOOKING", label: "จองคิว / นัดหมาย", hint: "ร้านตัดผม นวด สปา คลินิก" },
  { value: "RESTAURANT", label: "ร้านอาหาร", hint: "เมนู โต๊ะ ครัว" },
  { value: "HOTEL", label: "โรงแรม", hint: "ห้องพัก จอง เช็คอิน" },
  { value: "QUEUE", label: "บัตรคิว", hint: "ออกบัตร เรียกคิว" },
  { value: "TICKET", label: "ตั๋ว / อีเวนต์", hint: "ขายตั๋ว เช็คอิน" },
  { value: "SHOP", label: "ร้านค้า (POS)", hint: "ขายหน้าร้าน สต็อก" },
] as const;

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createTenantAction, initial);
  const [type, setType] = useState<string>("BOOKING");

  return (
    <form action={action} className="flex w-full max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-sm text-[color:var(--color-muted)]" htmlFor="orgName">
          ชื่อร้าน / องค์กรของคุณ
        </label>
        <input
          id="orgName"
          name="orgName"
          required
          placeholder="เช่น บาร์เบอร์บ้านสวน"
          className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-[color:var(--color-muted)]">เริ่มกิจการแรกของคุณ</span>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                type === t.value
                  ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)]"
                  : "hover:bg-[color:var(--color-surface-2)]"
              }`}
            >
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{t.hint}</div>
            </button>
          ))}
        </div>
        <input type="hidden" name="unitType" value={type} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-[color:var(--color-muted)]" htmlFor="unitName">
          ชื่อกิจการแรก
        </label>
        <input
          id="unitName"
          name="unitName"
          required
          placeholder="เช่น สาขาหลัก"
          className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
        />
      </div>

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "กำลังสร้าง..." : "สร้างร้านและเริ่มใช้งาน"}
      </button>
    </form>
  );
}
