"use client";

import { useActionState, useEffect, useState } from "react";
import { kioskClockAction, type KioskState } from "./actions";

// จอลงเวลาหน้าร้าน (kiosk) — เปิดค้างไว้บนแท็บเล็ต/มือถือเครื่องกลาง
// HR H2.4 r2 ▸ R1 (มติผู้คุม 12 พ.ย. — กลับทาง Q8): กดชื่อตัวเอง → ใส่ PIN → "ลงเวลา" (ระบบเลือกเข้า/ออก/กลับจากพักเอง) หรือ "เริ่มพัก"
//   รายชื่อ = เฉพาะคนในขอบเขตสาขาของบัญชีจอ (R2 · ส่งมาจาก HrKioskSection) · ข้อความมาจาก src/messages hr.kiosk ผ่าน prop `labels` ◂
// ปุ่มใหญ่ตัวเลข (ไม่พึ่งคีย์บอร์ดของเครื่อง) · ผลลัพธ์ขึ้น inline ไม่ใช่ alert
type Person = { id: string; name: string; position: string | null; hasPin: boolean };
export type KioskLabels = {
  prompt: string;
  clear: string;
  back: string;
  submit: string;
  breakStart: string;
  saving: string;
  entered: string;
  pick: string;
  change: string;
  noPin: string;
  tap: string;
  empty: string;
};

export default function KioskClock({ systemId, people, labels }: { systemId: string; people: Person[]; labels: KioskLabels }) {
  const [state, formAction, pending] = useActionState<KioskState, FormData>(
    async (prev, formData) => kioskClockAction(systemId, prev, formData),
    { status: "idle" },
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  // ลงเวลาเสร็จ = กลับหน้าเลือกชื่อ (คนถัดไปใช้ต่อได้ทันที) · ผิด = ล้าง PIN (ไม่ค้าง PIN บนจอ)
  useEffect(() => {
    if (state.status === "ok") {
      setPin("");
      setSelected(null);
    }
    if (state.status === "error") setPin("");
  }, [state]);

  const person = people.find((p) => p.id === selected) ?? null;
  const press = (d: string) => setPin((v) => (v.length >= 6 ? v : v + d));
  const key = "min-h-[56px] rounded-xl border text-lg font-medium hover:bg-[color:var(--color-surface-2)]";

  if (people.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">{labels.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {!person ? (
        <>
          <p className="text-sm text-[color:var(--color-muted)]">{labels.pick}</p>
          <div className="grid grid-cols-2 gap-2">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className="min-h-[64px] rounded-xl border px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]"
                data-testid={`hr-kiosk-name-${p.id}`}
              >
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-[color:var(--color-muted)]">{p.hasPin ? (p.position ?? labels.tap) : labels.noPin}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="employeeId" value={person.id} />
          <input type="hidden" name="pin" value={pin} data-testid="hr-kiosk-pin" />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">{person.name}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{labels.prompt}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setPin("");
              }}
              className="btn btn-ghost min-h-[44px] shrink-0 text-sm"
              data-testid="hr-kiosk-change"
            >
              {labels.change}
            </button>
          </div>

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
      )}

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
