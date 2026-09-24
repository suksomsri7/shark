"use client";

// CrmCallLogModal — โมดัล "บันทึกการโทร" (CRM v2 · ใบ C2.4 · ภาพ 08 ซ้าย · พิมพ์เขียว §5.5)
//
// ส่วนของแบบ (ภาพ 08 ซ้าย): ผลสาย · ระยะเวลา · ทิศทาง · โน้ต · งานถัดไป · ไฟล์เสียง · (หลังบันทึก) ถอดเสียง + สรุป
// 🔴 'use client' — ห้าม import โมดูลที่ลากกราฟ prisma: ดึงเพดาน/ป้าย/ชนิดจาก `*-shared` และเรียกงานผ่าน `*-actions` เท่านั้น
// 🔴 ผลจาก AI เป็น **ข้อเสนอ**: การ์ดข้างล่างแก้ได้ และค่าจะลงแถวกิจกรรมเมื่อกด "บันทึกผลนี้" (acceptCallAiAction) เท่านั้น
// 🔴 ตรวจค่าแบบ inline เสมอ — ห้ามใช้กล่องเตือนของเบราว์เซอร์ · 390 px: กล่องเต็มความกว้าง (`w-full`) แล้วจำกัดที่ `sm:` ขึ้นไป

import { useEffect, useRef, useState } from "react";
import { acceptCallAiAction, logCallAction, rejectCallAiAction, transcribeCallAction } from "@/app/app/sys/[id]/crm/_actions/calls";
import type { CrmCallAiProposal, CrmCallAiState, CrmCallLogTarget } from "./types";

export type CrmCallLogModalProps = {
  systemId: string;
  target: CrmCallLogTarget;
  /** ทะเบียนผลสายของร้าน (`activities.outcomeOptions().CALL`) — หน้า server ส่งมาให้ (ตัวจริงตรวจซ้ำในบริการ) */
  outcomes: string[];
  /** เพดานไฟล์เสียง (`CRM_RECORDING_MAX_BYTES`) — ค่าคงที่อยู่ฝั่งบริการ ที่นี่รับมาเป็น prop เพื่อไม่ให้มีเพดานสองชุด */
  maxRecordingBytes: number;
  /** สถานะผู้ช่วย AI ของสาย (`calls.callAiStatus`) — อ่านฝั่งเซิร์ฟเวอร์แล้วส่งมาเป็น prop */
  aiState: CrmCallAiState;
  aiMessage: string;
  onClose: () => void;
};

/** MB เต็มหน่วยสำหรับข้อความเตือน (ตัวเลขจริงมาจาก prop — ที่นี่แค่จัดรูป) */
const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));
/** ค่าเริ่มต้นของช่อง `datetime-local` = "ตอนนี้" ตามเวลาไทย (+07:00 คิดจาก epoch — ไม่ใช้ getHours ของเครื่อง) */
const nowLocal = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16);

const LABEL = "text-xs font-semibold";
const FIELD = "w-full rounded-lg border px-2 py-1.5 text-sm";

export function CrmCallLogModal({ systemId, target, outcomes, maxRecordingBytes, aiState, aiMessage, onClose }: CrmCallLogModalProps) {
  const list = outcomes;
  const [outcome, setOutcome] = useState<string>(list[0] ?? "");
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [nextTitle, setNextTitle] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [startAt, setStartAt] = useState(nowLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CrmCallAiProposal | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  /** object URL ตัวล่าสุด (สำหรับคืนตอน unmount — ดู N17 ข้างล่าง) */
  const previewRef = useRef<string | null>(null);

  /**
   * 🔴 N17: `URL.createObjectURL` จองหน่วยความจำของไฟล์ทั้งก้อนไว้จนกว่าจะ `revokeObjectURL` (หรือปิดแท็บ)
   *    ไฟล์เสียง 25 MB × เลือกใหม่หลายรอบ/เปิด-ปิดโมดัลหลายสาย = เบราว์เซอร์บวมจนเครื่องเซลส์อืด
   *    ⇒ คืนของทุกครั้งที่เปลี่ยนไฟล์ และตอนโมดัลถูกถอดออกจากจอ
   */
  const swapPreview = (next: string | null) => {
    setRecordingUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next;
    });
  };
  useEffect(() => {
    // คืน object URL ตัวสุดท้ายตอนปิดโมดัล (ใช้ ref เพราะ state ตอน unmount อ่านจาก closure ไม่ได้)
    const holder = previewRef;
    return () => {
      if (holder.current) URL.revokeObjectURL(holder.current);
    };
  }, []);

  const onPickFile = () => {
    const f = fileRef.current?.files?.[0] ?? null;
    setError(null);
    if (!f) {
      swapPreview(null);
      return;
    }
    if (f.size > maxRecordingBytes) {
      swapPreview(null);
      setError(`ไฟล์เสียงใหญ่เกิน ${mb(maxRecordingBytes)} MB — เลือกไฟล์ที่เล็กลง`);
      return;
    }
    const next = URL.createObjectURL(f);
    previewRef.current = next;
    swapPreview(next);
  };

  async function save() {
    setError(null);
    if (!outcome) {
      setError("เลือกผลสายก่อน");
      return;
    }
    if (nextTitle && !nextDue) {
      setError("งานถัดไปต้องมีวันครบกำหนด — เลือกวันจากปฏิทิน");
      return;
    }
    // 🔴 ระยะเวลา ("04:32"/"272") และวันเวลา (ค่าของ datetime-local ที่เป็นเวลาไทย) ส่งเป็น **ข้อความดิบ**
    //    ให้ฝั่งเซิร์ฟเวอร์แปลงด้วยตัวแปลงชุดเดียวของระบบ (`parseDurationText` · `thaiLocalInputToIso`)
    //    — ไม่ทำสำเนาสูตรเวลาไทยไว้ในหน้าจอ (ข้อเดียวที่เพี้ยนแล้วหาไม่เจอคือเวลา)
    const form = new FormData();
    if (target.contactId) form.set("contactId", target.contactId);
    if (target.dealId) form.set("dealId", target.dealId);
    if (target.companyId) form.set("companyId", target.companyId);
    form.set("direction", direction);
    form.set("outcome", outcome);
    if (duration.trim()) form.set("durationText", duration.trim());
    if (startAt) form.set("startAtLocal", startAt);
    if (note.trim()) form.set("body", note.trim());
    if (nextTitle.trim() && nextDue) {
      form.set("nextTaskTitle", nextTitle.trim());
      form.set("nextTaskDueLocal", nextDue);
    }
    const f = fileRef.current?.files?.[0] ?? null;
    if (f) form.set("recording", f);
    setBusy(true);
    const r = await logCallAction(systemId, form);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setActivityId(r.activityId);
    setSaved(true);
    if (!r.hasRecording) swapPreview(null);
  }

  async function transcribe() {
    if (!activityId) return;
    setAiError(null);
    setAiBusy(true);
    const r = await transcribeCallAction(systemId, activityId);
    setAiBusy(false);
    if (!r.ok) {
      setAiError(r.error);
      return;
    }
    setProposal(r.proposal);
  }

  async function acceptAi() {
    if (!proposal) return;
    setAiError(null);
    setAiBusy(true);
    const r = await acceptCallAiAction(systemId, proposal.proposalId, {
      transcript: proposal.transcript,
      aiSummary: proposal.aiSummary,
      aiNextStep: proposal.aiNextStep,
    });
    setAiBusy(false);
    if (!r.ok) {
      setAiError(r.error);
      return;
    }
    setProposal(null);
  }

  async function rejectAi() {
    if (!proposal) return;
    setAiBusy(true);
    const r = await rejectCallAiAction(systemId, proposal.proposalId);
    setAiBusy(false);
    if (!r.ok) {
      setAiError(r.error);
      return;
    }
    setProposal(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="บันทึกการโทร">
      <div className="card flex max-h-[92vh] w-full flex-col gap-3 overflow-y-auto rounded-t-2xl p-4 sm:max-w-lg sm:rounded-2xl" data-testid="crm-call-log-modal">
        <h2 className="text-base font-semibold">บันทึกการโทร</h2>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>ผลสาย</span>
          <select className={FIELD} value={outcome} onChange={(e) => setOutcome(e.target.value)} data-testid="crm-call-outcome" disabled={saved}>
            {list.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>ระยะเวลา</span>
            <input className={FIELD} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="04:32 หรือ 272" inputMode="numeric" data-testid="crm-call-duration" disabled={saved} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>ทิศทาง</span>
            <select className={FIELD} value={direction} onChange={(e) => setDirection(e.target.value === "IN" ? "IN" : "OUT")} data-testid="crm-call-direction" disabled={saved}>
              <option value="OUT">โทรออก (OUT)</option>
              <option value="IN">สายเข้า (IN)</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>เวลาที่คุย</span>
          <input className={FIELD} type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} data-testid="crm-call-start" disabled={saved} />
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>โน้ต</span>
          <textarea className={`${FIELD} min-h-[4.5rem]`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ลูกค้าสนใจแพ็กเกจกรุ๊ป ขอใบเสนอราคา" data-testid="crm-call-note" disabled={saved} />
        </label>

        <fieldset className="flex flex-col gap-2 rounded-lg border p-2">
          <legend className={`${LABEL} px-1`}>งานถัดไป</legend>
          <input className={FIELD} value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} placeholder="ส่งใบเสนอราคา" data-testid="crm-call-next-task" disabled={saved} />
          <input className={FIELD} type="datetime-local" value={nextDue} onChange={(e) => setNextDue(e.target.value)} aria-label="วันครบกำหนดของงานถัดไป" data-testid="crm-call-next-task-due" disabled={saved} />
        </fieldset>

        <fieldset className="flex flex-col gap-2 rounded-lg border p-2">
          <legend className={`${LABEL} px-1`}>ไฟล์เสียง</legend>
          <input ref={fileRef} className={FIELD} type="file" accept="audio/*" onChange={onPickFile} data-testid="crm-call-recording-input" disabled={saved} />
          {recordingUrl && <audio className="w-full" controls src={recordingUrl} data-testid="crm-call-recording-player" />}
          <span className="text-xs text-[color:var(--color-muted)]">ไฟล์เสียงเก็บแบบส่วนตัว เปิดฟังได้จากลิงก์ที่หมดอายุใน 15 นาที และผูกกับบัญชีของคุณ</span>
        </fieldset>

        {saved && (
          <fieldset className="flex flex-col gap-2 rounded-lg border p-2">
            <legend className={`${LABEL} px-1`}>ถอดเสียง</legend>
            {aiState === "READY" ? (
              <button type="button" className="btn btn-ghost text-sm" onClick={transcribe} disabled={aiBusy} data-testid="crm-call-ai-transcribe">
                {aiBusy ? "กำลังถอดเสียง…" : "ถอดเสียงและสรุปให้"}
              </button>
            ) : (
              <p className="rounded-lg border px-2 py-1.5 text-xs text-[color:var(--color-muted)]" role="status" data-testid="crm-call-ai-unavailable">
                {aiMessage || "ยังไม่ได้เชื่อมบริการถอดเสียง"}
              </p>
            )}
            {aiError && (
              <p className="text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="crm-call-ai-error">
                {aiError}
              </p>
            )}
            {proposal && (
              <div className="flex flex-col gap-2 rounded-lg border p-2" data-testid="crm-call-ai-card">
                {/* 🔴 B2: งานยังไม่เสร็จ = ยังไม่มีเนื้อให้ตรวจ ⇒ บอกให้รอ และไม่มีปุ่มรับให้กด (กดแล้วค่าว่างจะทับของเดิม) */}
                {proposal.working ? (
                  <p className="text-xs" role="status" data-testid="crm-call-ai-working">
                    {proposal.message || "กำลังถอดเสียงและสรุปสายนี้อยู่ — รอสักครู่แล้วกดดูผลอีกครั้ง"}
                  </p>
                ) : null}
                <span className="text-xs text-[color:var(--color-muted)]">ผู้ช่วย AI เสนอค่าด้านล่าง — แก้ได้ แล้วกด “บันทึกผลนี้” เพื่อเก็บลงกิจกรรม</span>
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>ข้อความถอดเสียง</span>
                  <textarea className={`${FIELD} min-h-[5rem]`} value={proposal.transcript} onChange={(e) => setProposal({ ...proposal, transcript: e.target.value })} data-testid="crm-call-ai-transcript" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>สรุป</span>
                  <textarea className={`${FIELD} min-h-[3.5rem]`} value={proposal.aiSummary} onChange={(e) => setProposal({ ...proposal, aiSummary: e.target.value })} data-testid="crm-call-ai-summary" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>สิ่งที่ควรทำต่อ</span>
                  <input className={FIELD} value={proposal.aiNextStep} onChange={(e) => setProposal({ ...proposal, aiNextStep: e.target.value })} data-testid="crm-call-ai-next-step" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary text-sm" onClick={acceptAi} disabled={aiBusy || proposal.working === true} data-testid="crm-call-ai-accept">
                    บันทึกผลนี้
                  </button>
                  <button type="button" className="btn btn-ghost text-sm" onClick={rejectAi} disabled={aiBusy || proposal.working === true} data-testid="crm-call-ai-reject">
                    ไม่ใช้ผลนี้
                  </button>
                </div>
              </div>
            )}
          </fieldset>
        )}

        {error && (
          <p className="text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="crm-call-error">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="text-xs" role="status" data-testid="crm-call-saved">
            บันทึกสายเรียบร้อยแล้ว
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={onClose} data-testid="crm-call-cancel">
            {saved ? "ปิด" : "ยกเลิก"}
          </button>
          <button type="button" className="btn btn-primary text-sm" onClick={save} disabled={busy || saved} data-testid="crm-call-save">
            {busy ? "กำลังบันทึก…" : "บันทึกสาย"}
          </button>
        </div>
      </div>
    </div>
  );
}
