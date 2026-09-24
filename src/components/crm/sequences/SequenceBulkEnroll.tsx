"use client";

// SequenceBulkEnroll.tsx — ใส่ผู้ติดต่อ "ที่เห็นอยู่ในหน้านี้" เข้าลำดับการติดตามเป็นกลุ่ม (ใบ C2.2)
// 🔴 AUDIT-CLASS X9: การกระทำอันตราย — ต้องติ๊กยืนยัน + ใส่เหตุผล ≥ 5 ตัวอักษร · ครั้งละไม่เกิน 500 คน
//    (ตัวตัดสินจริงคือ `bulkEnroll` ในบริการ — หน้าจอแค่บังคับให้กรอกครบก่อนกด และบอกจำนวนที่จะทำจริง)
// 🔴 client component — import เฉพาะ server action ของหน้าลำดับ (ห้าม import โมดูล CRM ที่แตะ prisma · fitness F2.3)
// 🔴 ผู้ติดต่อที่ขอไม่รับข่าวสาร/มองไม่เห็น = ถูกข้าม (บริการรายงานจำนวนกลับมา) ไม่ใช่ error

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bulkEnrollContactsAction } from "@/app/app/sys/[id]/crm/settings/sequences/actions";
import type { SeqOption } from "./types";

const MAX = 500;

export function SequenceBulkEnroll({ systemId, sequences, contactIds }: { systemId: string; sequences: SeqOption[]; contactIds: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(sequences[0]?.id ?? "");
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (sequences.length === 0 || contactIds.length === 0) return null;
  const ids = contactIds.slice(0, MAX);

  const submit = async () => {
    setBusy(true);
    const r = await bulkEnrollContactsAction(systemId, { sequenceId: pick, contactIds: ids, confirm, reason });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({
      ok: true,
      text: `ใส่เข้าลำดับแล้ว ${r.enrolled.toLocaleString("th-TH")} คน · ข้าม ${r.skipped.toLocaleString("th-TH")} คน · อยู่ในลำดับอยู่แล้ว ${r.conflicts.toLocaleString("th-TH")} คน`,
    });
    setConfirm(false);
    setReason("");
    router.refresh();
  };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="crm-seq-bulk-box">
      <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => setOpen((v) => !v)} data-testid="crm-seq-bulk">
        {open ? "ปิด" : "ใส่เข้าลำดับเป็นกลุ่ม"}
      </button>
      {open && (
        <form
          className="card flex min-w-0 flex-col gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          data-testid="crm-seq-bulk-form"
        >
          <p className="text-xs text-[color:var(--color-muted)]">
            จะใส่ผู้ติดต่อที่แสดงอยู่ในหน้านี้ {ids.length.toLocaleString("th-TH")} คน
            {contactIds.length > MAX ? ` (จากทั้งหมด ${contactIds.length.toLocaleString("th-TH")} คน — ครั้งละไม่เกิน ${MAX.toLocaleString("th-TH")} คน)` : ""}
          </p>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ลำดับการติดตาม</span>
            <select value={pick} disabled={busy} onChange={(e) => setPick(e.target.value)} className="input text-sm" data-testid="crm-seq-bulk-pick">
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.stepCount.toLocaleString("th-TH")} ขั้น)
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={confirm} disabled={busy} onChange={(e) => setConfirm(e.target.checked)} data-testid="crm-seq-bulk-confirm" />
            ยืนยันว่าต้องการใส่ทั้งกลุ่มนี้เข้าลำดับ
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>เหตุผล (อย่างน้อย 5 ตัวอักษร · เก็บไว้ในประวัติการแก้ไข)</span>
            <input value={reason} maxLength={500} disabled={busy} onChange={(e) => setReason(e.target.value)} placeholder='เช่น "ลงทะเบียนลูกค้างานแฟร์"' className="input text-sm" data-testid="crm-seq-bulk-reason" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary text-sm" disabled={busy} data-testid="crm-seq-bulk-submit">
              ใส่เข้าลำดับ
            </button>
            <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => setOpen(false)} data-testid="crm-seq-bulk-cancel">
              ยกเลิก
            </button>
          </div>
        </form>
      )}
      {msg && (
        <p className="text-xs" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="crm-seq-bulk-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
