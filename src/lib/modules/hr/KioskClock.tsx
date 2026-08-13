"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { kioskClockAction, type KioskState } from "./actions";

// จอลงเวลาหน้าร้าน (kiosk) — เปิดค้างไว้บนแท็บเล็ต/มือถือเครื่องกลาง
// พนักงานกดชื่อตัวเอง → ใส่ PIN → ระบบเลือกให้เองว่าเป็น "เข้างาน" หรือ "ออกงาน"
// ปุ่มใหญ่ตัวเลข (ไม่พึ่งคีย์บอร์ดของเครื่อง) · ผลลัพธ์ขึ้น inline ไม่ใช่ alert
type Person = { id: string; name: string; position: string | null; hasPin: boolean };

export default function KioskClock({ systemId, people }: { systemId: string; people: Person[] }) {
  const [state, formAction, pending] = useActionState<KioskState, FormData>(
    async (prev, formData) => kioskClockAction(systemId, prev, formData),
    { status: "idle" },
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ลงเวลาเสร็จ = เคลียร์จอกลับเป็นหน้าเลือกชื่อ (คนถัดไปใช้ต่อได้ทันที)
  useEffect(() => {
    if (state.status === "ok") {
      setPin("");
      setSelected(null);
      if (timer.current) clearTimeout(timer.current);
    }
    if (state.status === "error") setPin("");
  }, [state]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const person = people.find((p) => p.id === selected) ?? null;
  const press = (d: string) => setPin((v) => (v.length >= 6 ? v : v + d));

  if (people.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-muted)]">
        ยังไม่มีพนักงาน — เพิ่มที่แท็บ “พนักงาน” ก่อน
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!person ? (
        <>
          <p className="text-sm text-[color:var(--color-muted)]">กดชื่อของคุณ แล้วใส่ PIN</p>
          <div className="grid grid-cols-2 gap-2">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className="min-h-[64px] rounded-xl border px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]"
              >
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-[color:var(--color-muted)]">
                  {p.hasPin ? (p.position ?? "แตะเพื่อลงเวลา") : "ยังไม่มี PIN"}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="employeeId" value={person.id} />
          <input type="hidden" name="pin" value={pin} />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">{person.name}</div>
              <div className="text-xs text-[color:var(--color-muted)]">ใส่ PIN 4-6 หลัก</div>
            </div>
            <button
              type="button"
              onClick={() => { setSelected(null); setPin(""); }}
              className="btn btn-ghost min-h-[44px] shrink-0 text-sm"
            >
              เปลี่ยนชื่อ
            </button>
          </div>

          {/* จุดแทนตัวเลข — ไม่โชว์ PIN บนจอที่คนอื่นมองเห็น */}
          <div className="flex h-10 items-center gap-2" aria-label={`ใส่ PIN แล้ว ${pin.length} หลัก`}>
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
              <button
                key={d}
                type="button"
                onClick={() => press(d)}
                className="min-h-[56px] rounded-xl border text-lg font-medium hover:bg-[color:var(--color-surface-2)]"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin("")}
              className="min-h-[56px] rounded-xl border text-sm text-[color:var(--color-muted)]"
            >
              ล้าง
            </button>
            <button
              type="button"
              onClick={() => press("0")}
              className="min-h-[56px] rounded-xl border text-lg font-medium hover:bg-[color:var(--color-surface-2)]"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((v) => v.slice(0, -1))}
              className="min-h-[56px] rounded-xl border text-sm text-[color:var(--color-muted)]"
            >
              ลบ
            </button>
          </div>

          <button
            type="submit"
            disabled={pin.length < 4 || pending}
            className="btn btn-primary min-h-[52px] text-base disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก…" : "ลงเวลา"}
          </button>
        </form>
      )}

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && (
        <div className="rounded-xl border px-3 py-3 text-sm" style={{ borderColor: "var(--color-ink)" }}>
          <div className="font-medium">✓ {state.message}</div>
          {state.detail && <div className="text-xs text-[color:var(--color-muted)]">{state.detail}</div>}
        </div>
      )}
    </div>
  );
}
