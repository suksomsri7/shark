"use client";

// LostReasonSettings.tsx — เหตุผลที่แพ้ (CRM v2 · ใบ C1.5): เพิ่ม · แก้ข้อความ · เปิด/ปิดใช้งาน (ไม่ลบ — ดีลเก่าชี้อยู่)

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createLostReasonAction, updateLostReasonAction } from "@/lib/modules/crm/lost-reasons-actions";
import { LOST_REASON_LABEL_MAX } from "@/lib/modules/crm/deals-shared";

type Row = { id: string; label: string; active: boolean; usedBy: number };

export function LostReasonSettings({ systemId, reasons }: { systemId: string; reasons: Row[] }) {
  const router = useRouter();
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(reasons.map((r) => [r.id, r.label])));
  const [newLabel, setNewLabel] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
    return r.ok;
  };
  return (
    <div className="flex flex-col gap-4" data-testid="lost-reason-settings">
      <ul className="card flex flex-col divide-y">
        {reasons.length === 0 && <li className="p-4 text-sm text-[color:var(--color-muted)]">ยังไม่มีเหตุผล — เพิ่มด้านล่าง (ย้ายดีลเป็นแพ้ต้องเลือกเหตุผลเสมอ)</li>}
        {reasons.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 p-3" data-testid={`lr-row-${r.id}`}>
            <input value={labels[r.id] ?? ""} onChange={(e) => setLabels((l) => ({ ...l, [r.id]: e.target.value }))} maxLength={LOST_REASON_LABEL_MAX + 10} aria-label="ข้อความเหตุผล" className="input min-w-0 flex-1 text-sm" data-testid={`lr-label-${r.id}`} />
            <span className="text-xs text-[color:var(--color-muted)]">
              ใช้กับ {r.usedBy.toLocaleString("th-TH")} ดีล{r.active ? "" : " · ปิดใช้อยู่"}
            </span>
            <button type="button" className="btn btn-ghost text-sm" disabled={busy || labels[r.id] === r.label} onClick={() => void run(() => updateLostReasonAction(systemId, r.id, { label: labels[r.id] ?? "" }), "บันทึกแล้ว")} data-testid={`lr-save-${r.id}`}>
              บันทึก
            </button>
            <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void run(() => updateLostReasonAction(systemId, r.id, { active: !r.active }), r.active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว")} data-testid={`lr-toggle-${r.id}`}>
              {r.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="card flex flex-wrap items-end gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newLabel.trim()) return setMsg({ ok: false, text: "ใส่ข้อความเหตุผลก่อน" });
          void run(() => createLostReasonAction(systemId, newLabel.trim()), "เพิ่มเหตุผลแล้ว").then((ok) => {
            if (ok) setNewLabel("");
          });
        }}
        data-testid="lr-new-form"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>เหตุผลใหม่</span>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder='เช่น "ราคาสูงไป"' className="input text-sm" data-testid="lr-new-label" />
        </label>
        <button type="submit" className="btn btn-primary text-sm" disabled={busy} data-testid="lr-new-submit">
          เพิ่ม
        </button>
      </form>
      {msg && (
        <p className="text-sm" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="lr-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
