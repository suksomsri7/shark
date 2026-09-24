"use client";

// SequenceListView.tsx — รายการ "ลำดับการติดตาม" + ฟอร์มสร้างใหม่ (ใบ C2.2 · ภาพ 07 ล่าง)
// 🔴 client component — import เฉพาะ server actions ของหน้า + ช่องกรอกขั้น (ห้าม import โมดูล CRM ที่แตะ prisma · fitness F2.3)
// 🔴 ข้อผิดพลาดแสดงในหน้า (inline) ไม่ใช้ alert · ข้อความไม่โทษผู้ใช้

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSequenceAction } from "@/app/app/sys/[id]/crm/settings/sequences/actions";
import { emptyStep, StepFields, stepPayload } from "./StepFields";
import type { SeqListRow, SeqStepDraft } from "./types";

const STATUS_TEXT = (c: SeqListRow["counts"]) =>
  `กำลังเดิน ${c.ACTIVE.toLocaleString("th-TH")} · พักไว้ ${c.PAUSED.toLocaleString("th-TH")} · จบแล้ว ${c.DONE.toLocaleString("th-TH")} · หยุด ${c.STOPPED.toLocaleString("th-TH")}`;

export function SequenceListView({ systemId, rows, canManage }: { systemId: string; rows: SeqListRow[]; canManage: boolean }) {
  const router = useRouter();
  const base = `/app/sys/${systemId}/crm/settings/sequences`;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [step, setStep] = useState<SeqStepDraft>(() => emptyStep("EMAIL", "new"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (!name.trim()) return setMsg({ ok: false, text: "ตั้งชื่อลำดับการติดตามก่อนบันทึก" });
    setBusy(true);
    const r = await createSequenceAction(systemId, { name: name.trim(), steps: [stepPayload(step)] });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: "สร้างลำดับแล้ว — เพิ่มขั้นต่อไปได้ในหน้าถัดไป" });
    router.push(`${base}/${r.id}`);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-seq-list">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary text-sm" onClick={() => setOpen((v) => !v)} data-testid="crm-seq-new">
            {open ? "ปิดฟอร์ม" : "+ สร้างลำดับใหม่"}
          </button>
          <Link href={`/app/sys/${systemId}/crm/settings/holidays`} className="btn btn-ghost text-sm" data-testid="crm-seq-calendar-link">
            วันทำการและวันหยุด
          </Link>
        </div>
      )}

      {open && canManage && (
        <form
          className="card flex min-w-0 flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          data-testid="crm-seq-new-form"
        >
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ชื่อลำดับ</span>
            <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder='เช่น "ติดตามใบเสนอราคา"' className="input text-sm" data-testid="crm-seq-new-name" />
          </label>
          <p className="text-xs text-[color:var(--color-muted)]">ขั้นแรกของลำดับ (เพิ่มขั้นต่อไปได้ในหน้าถัดไป)</p>
          <StepFields step={step} disabled={busy} onChange={(p) => setStep((s) => ({ ...s, ...p }))} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary text-sm" disabled={busy} data-testid="crm-seq-new-submit">
              บันทึกลำดับ
            </button>
            <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => setOpen(false)} data-testid="crm-seq-new-cancel">
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {msg && (
        <p className="text-sm" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="crm-seq-msg">
          {msg.text}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card py-10 text-center" data-testid="crm-seq-empty">
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีลำดับการติดตาม — สร้างลำดับแรกเพื่อให้ระบบส่งอีเมล/LINE และสร้างงานติดตามให้เองตามเวลาที่ตั้งไว้</p>
        </div>
      ) : (
        <ul className="card flex flex-col divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 p-3" data-testid={`crm-seq-row-${r.id}`}>
              <span className="flex min-w-0 flex-1 flex-col">
                <Link href={`${base}/${r.id}`} className="break-words font-medium underline" data-testid={`crm-seq-open-${r.id}`}>
                  {r.name}
                </Link>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {r.stepCount.toLocaleString("th-TH")} ขั้น · เวอร์ชัน {r.version.toLocaleString("th-TH")}
                  {r.active ? "" : " · ปิดรับคนใหม่"}
                </span>
                <span className="text-xs text-[color:var(--color-muted)]">{STATUS_TEXT(r.counts)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
