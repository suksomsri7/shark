"use client";

// SequenceEnrollButton.tsx — ปุ่ม "ใส่เข้าลำดับการติดตาม" บนหน้าผู้ติดต่อ 360 (ใบ C2.2 · พิมพ์เขียว §5.7)
// 🔴 client component — import เฉพาะ server action ของหน้าลำดับ (ห้าม import โมดูล CRM ที่แตะ prisma · fitness F2.3)
// 🔴 ผู้ติดต่อที่ขอไม่รับข่าวสาร: บริการตอบ "ข้ามให้แล้ว" (ไม่มีแถว) — หน้าจอบอกตรง ๆ ไม่โทษผู้ใช้
// 🔴 อยู่ในลำดับนั้นอยู่แล้ว = บริการตอบ CONFLICT ภาษาไทย ⇒ หน้าจอเสนอ "เริ่มใหม่แทนของเดิม"

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enrollContactAction } from "@/app/app/sys/[id]/crm/settings/sequences/actions";
import type { SeqOption } from "./types";

export function SequenceEnrollButton({
  systemId,
  contactId,
  sequences,
  disabled,
}: {
  systemId: string;
  contactId: string;
  sequences: SeqOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(sequences[0]?.id ?? "");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (sequences.length === 0) return null;

  const submit = async () => {
    if (!pick) return setMsg({ ok: false, text: "เลือกลำดับการติดตามก่อน" });
    setBusy(true);
    const r = await enrollContactAction(systemId, { sequenceId: pick, contactId, replace });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: !r.skipped, text: r.note });
    if (!r.skipped) {
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="crm-seq-enroll-box">
      <button type="button" className="btn btn-ghost text-sm" disabled={disabled || busy} onClick={() => setOpen((v) => !v)} data-testid="crm-seq-enroll">
        {open ? "ปิด" : "ใส่เข้าลำดับการติดตาม"}
      </button>
      {open && (
        <form
          className="flex min-w-0 flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          data-testid="crm-seq-enroll-form"
        >
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ลำดับการติดตาม</span>
            <select value={pick} disabled={busy} onChange={(e) => setPick(e.target.value)} className="input text-sm" data-testid="crm-seq-enroll-pick">
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.stepCount.toLocaleString("th-TH")} ขั้น)
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={replace} disabled={busy} onChange={(e) => setReplace(e.target.checked)} data-testid="crm-seq-enroll-replace" />
            ถ้าอยู่ในลำดับนี้อยู่แล้ว ให้เริ่มใหม่แทนของเดิม
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary text-sm" disabled={busy} data-testid="crm-seq-enroll-submit">
              ใส่เข้าลำดับ
            </button>
            <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => setOpen(false)} data-testid="crm-seq-enroll-cancel">
              ยกเลิก
            </button>
          </div>
        </form>
      )}
      {msg && (
        <p className="text-xs" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="crm-seq-enroll-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
