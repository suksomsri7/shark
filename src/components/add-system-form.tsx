"use client";

import { useActionState, useState } from "react";
import { addSystemAction, type AddSystemState } from "@/lib/actions/systems";
import { SYSTEM_DEFS } from "@/lib/systems";

const initial: AddSystemState = { status: "idle" };
const firstAvailable = SYSTEM_DEFS.find((s) => s.status === "available")?.code ?? "BOOKING";

// เลือก 1 จาก 14 ระบบ + ตั้งชื่อ → สร้าง (ใช้ทั้ง onboarding และหน้าเพิ่มระบบ)
export function AddSystemForm({ submitLabel = "สร้างระบบ" }: { submitLabel?: string }) {
  const [state, action, pending] = useActionState(addSystemAction, initial);
  const [code, setCode] = useState<string>(firstAvailable);
  const selected = SYSTEM_DEFS.find((s) => s.code === code);

  return (
    <form action={action} className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-[color:var(--color-muted)]">เลือกระบบ</span>
        <div className="grid grid-cols-2 gap-2">
          {SYSTEM_DEFS.map((s) => {
            const disabled = s.status === "coming_soon";
            const active = code === s.code;
            return (
              <button
                type="button"
                key={s.code}
                disabled={disabled}
                onClick={() => !disabled && setCode(s.code)}
                className={[
                  "relative rounded-xl border p-3 text-left transition-colors",
                  disabled
                    ? "cursor-not-allowed opacity-45"
                    : active
                      ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)]"
                      : "hover:bg-[color:var(--color-surface-2)]",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--color-muted)]">{s.hint}</div>
                {disabled && (
                  <span className="absolute right-2 top-2 rounded-full border px-1.5 py-0.5 text-[10px] text-[color:var(--color-muted)]">
                    เร็วๆ นี้
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="code" value={code} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-[color:var(--color-muted)]" htmlFor="sysName">
          ชื่อระบบ{selected ? ` (${selected.label})` : ""}
        </label>
        <input
          id="sysName"
          name="name"
          required
          placeholder={selected?.kind === "business" ? "เช่น A Barber สาขา 2" : "เช่น สมาชิกสปา"}
          className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
        />
      </div>

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "กำลังสร้าง..." : submitLabel}
      </button>
    </form>
  );
}
