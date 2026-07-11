"use client";

import { useActionState, useState } from "react";
import { createTenantAction, type OnboardingState } from "@/lib/actions/onboarding";
import { UNIT_TYPES } from "@/lib/systems";

const initial: OnboardingState = { status: "idle" };
const firstAvailable = UNIT_TYPES.find((u) => u.status === "available")?.type ?? "BOOKING";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createTenantAction, initial);
  const [type, setType] = useState<string>(firstAvailable);

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
          {UNIT_TYPES.map((t) => {
            const disabled = t.status === "coming_soon";
            const selected = type === t.type;
            return (
              <button
                type="button"
                key={t.type}
                disabled={disabled}
                aria-disabled={disabled}
                onClick={() => !disabled && setType(t.type)}
                className={[
                  "relative rounded-xl border p-3 text-left transition-colors",
                  disabled
                    ? "cursor-not-allowed opacity-45"
                    : selected
                      ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)]"
                      : "hover:bg-[color:var(--color-surface-2)]",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--color-muted)]">{t.hint}</div>
                {disabled && (
                  <span className="absolute right-2 top-2 rounded-full border px-1.5 py-0.5 text-[10px] text-[color:var(--color-muted)]">
                    เร็วๆ นี้
                  </span>
                )}
              </button>
            );
          })}
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
