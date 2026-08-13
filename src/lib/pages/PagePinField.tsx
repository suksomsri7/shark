"use client";

import { useActionState } from "react";
import { setPagePinAction, type PinState } from "./actions";

// ตั้ง/เปลี่ยน/ล้าง PIN เข้า Page ของสมาชิก 1 คน — ผลลัพธ์ inline (ไม่ใช้ alert)
export default function PagePinField({
  pageId,
  pageMemberId,
  hasPin,
}: {
  pageId: string;
  pageMemberId: string;
  hasPin: boolean;
}) {
  const [state, formAction, pending] = useActionState<PinState, FormData>(
    async (prev, formData) => setPagePinAction(pageId, pageMemberId, prev, formData),
    { status: "idle" },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        PIN เข้า Page (ตัวเลข 4-8 หลัก)
        <input
          name="pin"
          inputMode="numeric"
          maxLength={8}
          placeholder={hasPin ? "ตั้งไว้แล้ว — พิมพ์ใหม่เพื่อเปลี่ยน · เว้นว่าง+บันทึก = ล้าง" : "เช่น 1234"}
          className="input w-64"
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
