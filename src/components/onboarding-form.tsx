"use client";

import { useActionState } from "react";
import { createTenantAction, type OnboardingState } from "@/lib/actions/onboarding";

const initial: OnboardingState = { status: "idle" };

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createTenantAction, initial);

  return (
    <form action={action} className="flex w-full max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-sm text-[color:var(--color-muted)]" htmlFor="orgName">
          ชื่อร้าน / กิจการของคุณ
        </label>
        <input
          id="orgName"
          name="orgName"
          required
          autoFocus
          placeholder="เช่น ร้านตัดผมบ้านสวน"
          className="rounded-lg border px-3 py-3 text-base outline-none focus:border-[color:var(--color-accent)]"
        />
        <p className="text-xs text-[color:var(--color-muted)]">
          เดี๋ยว AI จะถามคุณไม่กี่ข้อ แล้วประกอบระบบให้เหมาะกับกิจการของคุณเอง — ไม่ต้องเลือกเมนูเยอะ ๆ
        </p>
      </div>

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary py-3">
        {pending ? "กำลังสร้าง..." : "เริ่มต้น — คุยกับ AI ผู้ช่วย"}
      </button>
    </form>
  );
}
