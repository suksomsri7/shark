"use client";

// CrmCardScanButton — "อ่านนามบัตร" ด้วยผู้ช่วย AI (CRM v2 · ใบ C2.4 · มติผู้คุมงาน C2.4 ข้อ 6)
//
// 🔴 รูปนามบัตร **ไม่ถูกเก็บ**: ส่งเข้าโมเดลเป็น `data:` URL แล้วทิ้ง (บริการฝั่งเซิร์ฟเวอร์เป็นคนประกอบ)
// 🔴 ผลที่ได้เป็น **ข้อเสนอ** — ผู้ติดต่อเกิดเมื่อกด "เพิ่มเป็นผู้ติดต่อ" เท่านั้น (AI ไม่เขียนข้อมูลลูกค้าเอง)
// 🔴 แจ้งปัญหาแบบ inline เสมอ — ห้ามใช้กล่องเตือนของเบราว์เซอร์ · 390 px: ทุกช่องกว้างเต็มกล่อง ไม่มีความกว้างคงที่

import { useRef, useState } from "react";
import { acceptLeadProposalAction, rejectLeadProposalAction, scanBusinessCardAction } from "@/app/app/sys/[id]/crm/_actions/calls";
import type { CrmCallCardDraft } from "./types";

/** MB เต็มหน่วยสำหรับข้อความเตือน (เพดานจริงมาจาก prop — ไม่มีเพดานสองชุดในระบบ) */
const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

export function CrmCardScanButton({ systemId, maxCardBytes }: { systemId: string; maxCardBytes: number }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<(CrmCallCardDraft & { proposalId: string }) | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  async function run() {
    const f = ref.current?.files?.[0] ?? null;
    setError(null);
    setDraft(null);
    setDoneId(null);
    if (!f) return;
    if (f.size > maxCardBytes) {
      setError(`รูปนามบัตรใหญ่เกิน ${mb(maxCardBytes)} MB — ถ่ายใหม่ด้วยความละเอียดต่ำลง`);
      return;
    }
    const form = new FormData();
    form.set("card", f);
    setBusy(true);
    const r = await scanBusinessCardAction(systemId, form);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDraft({ ...r.draft, proposalId: r.proposalId });
  }

  /**
   * "ทิ้งผลนี้" = ปิดใบข้อเสนอจริง ๆ (ใบ C2.4 รอบ 2 · ข้อ F8)
   * 🔴 ของเดิมแค่ `setDraft(null)` — ใบข้อเสนอยังนอนอยู่ในฐานพร้อม **ชื่อ เบอร์ อีเมล** ของคนบนนามบัตรอีก 24 ชั่วโมง
   *    ทั้งที่พนักงานบอกว่าไม่เอาแล้ว ⇒ เก็บข้อมูลส่วนบุคคลเกินจำเป็น · ตัวนับข้อเสนอค้าง · เปิดหน้าใหม่ยังเห็นของเก่า
   *    ⇒ กดทิ้ง = REJECTED + ล้าง payload ที่ฝั่งเซิร์ฟเวอร์ (ล้มก็ยังปิดการ์ดให้ พร้อมข้อความ inline)
   */
  async function reject() {
    if (!draft) return;
    setBusy(true);
    const r = await rejectLeadProposalAction(systemId, draft.proposalId);
    setBusy(false);
    setDraft(null);
    if (!r.ok) setError(r.error);
  }

  async function accept() {
    if (!draft) return;
    setBusy(true);
    const r = await acceptLeadProposalAction(systemId, draft.proposalId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDraft(null);
    setDoneId(r.contactId);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold">อ่านนามบัตรด้วย AI</span>
        <input ref={ref} className="w-full rounded-lg border px-2 py-1.5 text-sm" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={run} disabled={busy} data-testid="crm-card-scan" />
      </label>
      {busy && <span className="text-xs text-[color:var(--color-muted)]">กำลังอ่านนามบัตร…</span>}
      {error && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="crm-card-scan-error">
          {error}
        </p>
      )}
      {draft && (
        <div className="flex w-full flex-col gap-1 rounded-lg border p-2 text-sm" data-testid="crm-card-scan-draft">
          <span className="text-xs text-[color:var(--color-muted)]">ตรวจข้อมูลก่อนเพิ่ม — แก้ไขได้หลังเพิ่มผู้ติดต่อ</span>
          <span className="font-semibold">{draft.name || "(ไม่พบชื่อบนนามบัตร)"}</span>
          <span>{[draft.jobTitle, draft.company].filter(Boolean).join(" · ") || "—"}</span>
          <span className="text-xs text-[color:var(--color-muted)]">{[draft.phone, draft.email].filter(Boolean).join(" · ") || "—"}</span>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn btn-primary text-sm" onClick={accept} disabled={busy} data-testid="crm-card-scan-accept">
              เพิ่มเป็นผู้ติดต่อ
            </button>
            <button type="button" className="btn btn-ghost text-sm" onClick={reject} disabled={busy} data-testid="crm-card-scan-reject">
              ทิ้งผลนี้
            </button>
          </div>
        </div>
      )}
      {doneId && (
        <p className="text-xs" role="status" data-testid="crm-card-scan-done">
          เพิ่มผู้ติดต่อจากนามบัตรแล้ว (รหัส {doneId})
        </p>
      )}
    </div>
  );
}
