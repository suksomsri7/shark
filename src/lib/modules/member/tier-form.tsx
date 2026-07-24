"use client";

import { useActionState } from "react";
import { saveTierConfigAction, type SaveTierConfigState } from "./tier-actions";

const muted = "text-[color:var(--color-muted)]";

type TierRow = { tier: "SILVER" | "GOLD" | "PLATINUM"; label: string; minBaht: number };

// ── ฟอร์มตั้งค่าระดับสมาชิก (ชื่อระดับ + ยอดขั้นต่ำเป็นบาท) — 3 แถว + inline error ──
export function MemberTiersForm({ systemId, rows }: { systemId: string; rows: TierRow[] }) {
  const [state, action, pending] = useActionState<SaveTierConfigState, FormData>(
    saveTierConfigAction,
    { status: "idle" },
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="systemId" value={systemId} />
      <p className={`text-xs ${muted}`}>ลูกค้าเลื่อนระดับอัตโนมัติตามยอดสะสม</p>

      {rows.map((r) => (
        <div key={r.tier} className="flex flex-col gap-2 rounded-lg border p-3">
          <span className="text-xs font-medium text-[color:var(--color-accent)]">{r.tier}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ชื่อระดับ
              <input
                name={`${r.tier}_label`}
                defaultValue={r.label}
                required
                placeholder="เช่น ลูกค้าประจำ"
                className="input min-h-[44px]"
              />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ยอดสะสมขั้นต่ำ (บาท)
              <input
                name={`${r.tier}_baht`}
                type="number"
                min={0}
                step="0.01"
                defaultValue={r.minBaht}
                required
                placeholder="0"
                className="input min-h-[44px]"
              />
            </label>
          </div>
        </div>
      ))}

      <p className={`text-xs ${muted}`}>ยอดขั้นต่ำต้องเรียงจากน้อยไปมาก: SILVER &lt; GOLD &lt; PLATINUM</p>

      {state.status === "error" && (
        <p className="text-xs text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && <p className="text-sm font-medium">✅ บันทึกเกณฑ์ระดับแล้ว</p>}

      <button className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50" disabled={pending}>
        {pending ? "กำลังบันทึก…" : "บันทึกเกณฑ์ระดับ"}
      </button>
    </form>
  );
}
