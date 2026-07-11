"use client";

import { useActionState, useEffect, useRef } from "react";
import { checkInAction } from "@/lib/modules/ticket/actions";
import type { CheckInResult } from "@/lib/modules/ticket/service";

export default function CheckinForm({
  unitSlug,
  eventId,
}: {
  unitSlug: string;
  eventId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState<CheckInResult | null, FormData>(
    async (_prev, formData) => checkInAction(unitSlug, _prev, formData),
    null,
  );

  // เคลียร์ช่องกรอกหลังส่ง เพื่อสแกน/กรอกใบถัดไปได้ทันที
  useEffect(() => {
    if (state && inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex gap-2">
        {eventId && <input type="hidden" name="eventId" value={eventId} />}
        <input
          ref={inputRef}
          name="code"
          required
          autoFocus
          autoComplete="off"
          placeholder="กรอก/สแกนรหัสตั๋ว เช่น TK-XXXXXX"
          className="flex-1 rounded-lg border px-3 py-2 text-sm uppercase"
        />
        <button type="submit" disabled={pending} className="btn btn-primary text-sm disabled:opacity-50">
          {pending ? "…" : "เช็คอิน"}
        </button>
      </form>

      {state && (
        <div
          className={`rounded-xl border p-4 text-center ${
            state.ok
              ? "border-[color:var(--color-success,green)]"
              : "border-[color:var(--color-danger)]"
          }`}
        >
          {state.ok ? (
            <>
              <div className="text-lg font-semibold">✓ ผ่าน</div>
              <div className="mt-1 text-sm">
                {state.admission.typeName} · {state.admission.buyerName}
              </div>
              <div className="text-xs text-[color:var(--color-muted)]">
                {state.admission.code} · {state.admission.eventName}
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold text-[color:var(--color-danger)]">✕ ไม่ผ่าน</div>
              <div className="mt-1 text-sm">{state.reason}</div>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-[color:var(--color-muted)]">
        กล้องสแกน QR อัตโนมัติจะมาในเวอร์ชันถัดไป — ตอนนี้กรอกรหัสตั๋วด้วยมือ (แสกนเนอร์บาร์โค้ดที่พิมพ์ลงช่องได้)
      </p>
    </div>
  );
}
