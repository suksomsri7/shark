"use client";

import { useActionState, useEffect, useState } from "react";
import { kioskClockAction, type KioskState } from "./actions";

// จอลงเวลาหน้าร้าน (kiosk) — เปิดค้างไว้บนแท็บเล็ต/มือถือเครื่องกลาง
// HR H2.4 ▸ R9 kiosk v2: ใส่ PIN อย่างเดียว (ไม่มีรายชื่อบนจอ — PIN ไม่ซ้ำทั้งร้านบอกได้ว่าเป็นใคร · Q8) →
//   "ลงเวลา" (ระบบเลือกเข้า/ออก/กลับจากพักเอง) หรือ "เริ่มพัก" · ข้อความมาจาก src/messages hr.kiosk ผ่าน prop `labels` ◂
// ปุ่มใหญ่ตัวเลข (ไม่พึ่งคีย์บอร์ดของเครื่อง) · ผลลัพธ์ขึ้น inline ไม่ใช่ alert
export type KioskLabels = {
  prompt: string;
  clear: string;
  back: string;
  submit: string;
  breakStart: string;
  saving: string;
  entered: string;
};

export default function KioskClock({ systemId, labels }: { systemId: string; labels: KioskLabels }) {
  const [state, formAction, pending] = useActionState<KioskState, FormData>(
    async (prev, formData) => kioskClockAction(systemId, prev, formData),
    { status: "idle" },
  );
  const [pin, setPin] = useState("");

  // ลงเวลาเสร็จ/ผิด = ล้าง PIN (คนถัดไปใช้ต่อได้ทันที · ไม่ค้าง PIN บนจอ)
  useEffect(() => {
    if (state.status !== "idle") setPin("");
  }, [state]);

  const press = (d: string) => setPin((v) => (v.length >= 6 ? v : v + d));
  const key = "min-h-[56px] rounded-xl border text-lg font-medium hover:bg-[color:var(--color-surface-2)]";

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="pin" value={pin} data-testid="hr-kiosk-pin" />
        <p className="text-sm text-[color:var(--color-muted)]">{labels.prompt}</p>

        {/* จุดแทนตัวเลข — ไม่โชว์ PIN บนจอที่คนอื่นมองเห็น */}
        <div className="flex h-10 items-center gap-2" aria-label={`${labels.entered} ${pin.length}`}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span
              key={i}
              className="h-3 w-3 rounded-full border"
              style={i < pin.length ? { background: "var(--color-ink)", borderColor: "var(--color-ink)" } : undefined}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} className={key}>
              {d}
            </button>
          ))}
          <button type="button" onClick={() => setPin("")} className="min-h-[56px] rounded-xl border text-sm text-[color:var(--color-muted)]">
            {labels.clear}
          </button>
          <button type="button" onClick={() => press("0")} className={key}>
            0
          </button>
          <button type="button" onClick={() => setPin((v) => v.slice(0, -1))} className="min-h-[56px] rounded-xl border text-sm text-[color:var(--color-muted)]">
            {labels.back}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="submit"
            name="kind"
            value="NEXT"
            disabled={pin.length < 4 || pending}
            className="btn btn-primary min-h-[52px] text-base disabled:opacity-50"
            data-testid="hr-kiosk-submit"
          >
            {pending ? labels.saving : labels.submit}
          </button>
          <button
            type="submit"
            name="kind"
            value="BREAK_START"
            disabled={pin.length < 4 || pending}
            className="btn btn-ghost min-h-[52px] text-base disabled:opacity-50"
            data-testid="hr-kiosk-break"
          >
            {labels.breakStart}
          </button>
        </div>
      </form>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-[color:var(--color-danger)]" data-testid="hr-kiosk-error">
          {state.message}
        </p>
      )}
      {state.status === "ok" && (
        <div role="status" className="rounded-xl border px-3 py-3 text-sm" style={{ borderColor: "var(--color-ink)" }} data-testid="hr-kiosk-result">
          <div className="font-medium">✓ {state.message}</div>
          {state.detail && <div className="text-xs text-[color:var(--color-muted)]">{state.detail}</div>}
        </div>
      )}
    </div>
  );
}
