"use client";

import { useActionState } from "react";
import { setPinAction, type PinState } from "./actions";

// ตั้ง/เปลี่ยน PIN ลงเวลาของพนักงาน 1 คน — inline error/สำเร็จ (ไม่ใช้ alert)
// ว่างแล้วกดบันทึก = ปิดการลงเวลาเองของคนนี้
export default function PinField({
  systemId,
  employeeId,
  hasPin,
}: {
  systemId: string;
  employeeId: string;
  hasPin: boolean;
}) {
  const [state, formAction, pending] = useActionState<PinState, FormData>(
    async (prev, formData) => setPinAction(systemId, employeeId, prev, formData),
    { status: "idle" },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        PIN ลงเวลาเอง (4-6 หลัก)
        <input
          name="pin"
          inputMode="numeric"
          maxLength={6}
          placeholder={hasPin ? "ตั้งไว้แล้ว — พิมพ์ใหม่เพื่อเปลี่ยน" : "เช่น 1234"}
          className="input w-52"
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-ghost min-h-[44px] text-sm disabled:opacity-50">
        {pending ? "กำลังบันทึก…" : "บันทึก PIN"}
      </button>
      {state.status === "error" && (
        <span className="text-xs text-[color:var(--color-danger)]">{state.message}</span>
      )}
      {state.status === "ok" && (
        <span className="text-xs text-[color:var(--color-muted)]">{state.message}</span>
      )}
    </form>
  );
}
