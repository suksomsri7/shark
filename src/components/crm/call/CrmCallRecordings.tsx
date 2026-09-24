"use client";

// CrmCallRecordings — "ไฟล์เสียงของสายที่บันทึกไว้" บนหน้า 360 ของผู้ติดต่อและของดีล (CRM v2 · ใบ C2.4 รอบ 2 · ข้อ F4)
//
// 🔴 ทำไมต้องมีบล็อกนี้: รอบแรกมี `getRecording` / `removeRecording` / `hasRecording` ครบในบริการ แต่ **ไม่มีที่ไหนในหน้าจอเรียกเลย**
//    ⇒ ไฟล์เสียงที่พนักงานอัปไว้ตอนบันทึกสาย ฟังย้อนหลังไม่ได้และลบไม่ได้ (ต้องไปยุ่งกับฐานข้อมูล) — ของที่ "มีแต่ใช้ไม่ได้"
// 🔴 ลิงก์ฟังเป็นใบผ่าน **หมดอายุ 15 นาที ผูกกับบัญชีของผู้ดู** ที่ออกจากเซิร์ฟเวอร์ตอนกดเท่านั้น (AUDIT-CLASS X10)
//    — ไม่มี URL ถาวรฝังอยู่ในหน้า และไม่มีการเดา path ของไฟล์
// 🔴 ลบ = งานอันตราย (AUDIT-CLASS X9): ต้องติ๊กยืนยัน + เหตุผล ≥ 5 ตัวอักษร (ตัวจริงตรวจซ้ำในบริการ) · แจ้งผลแบบ inline เสมอ
// 🔴 ชุด testid แยกตามหน้า (`variant`): ทะเบียนปุ่ม (`scripts/crm-ui-inventory.json`) ต้องมีแถวของทั้งสองหน้า และด่าน F14.2
//    ของ fitness ห้าม testid ซ้ำสองแถว ⇒ หน้าผู้ติดต่อใช้ play/delete · หน้าดีลใช้ listen/remove (ปุ่มเดียวกัน คนละหน้า)
// 🔴 'use client' — เรียกงานผ่าน server action ใต้เส้นทางหน้า CRM เท่านั้น (ด่าน F2.3 ห้าม components แตะโมดูล CRM ตรง ๆ)

import { useState } from "react";
import { getRecordingAction, removeRecordingAction } from "@/app/app/sys/[id]/crm/_actions/calls";

export type CrmCallRecordingItem = {
  activityId: string;
  /** ป้ายที่คนอ่านรู้ว่าเป็นสายไหน (เวลา + หัวเรื่องของกิจกรรม) — ประกอบจากหน้าเซิร์ฟเวอร์ */
  label: string;
};

export type CrmCallRecordingsProps = {
  systemId: string;
  /** หน้าไหนเป็นคนแสดง — ตัดสิน testid ของปุ่ม (ดูหัวไฟล์) */
  variant: "contact" | "deal";
  items: CrmCallRecordingItem[];
  /** มีคีย์ `crm.activity.create` ไหม (บริการตรวจซ้ำอีกชั้น + เจ้าของสาย/ผู้จัดการเท่านั้นที่ลบได้) */
  canRemove: boolean;
};

const BTN = "btn btn-ghost text-sm";

export function CrmCallRecordings({ systemId, variant, items, canRemove }: CrmCallRecordingsProps) {
  const [rows, setRows] = useState<CrmCallRecordingItem[]>(items);
  const [picked, setPicked] = useState<string>(items[0]?.activityId ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");

  if (rows.length === 0) return null;

  async function play() {
    setError(null);
    setDone(null);
    setUrl(null);
    if (!picked) return;
    setBusy(true);
    const r = await getRecordingAction(systemId, picked);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (!r.recording) {
      setError("สายนี้ไม่มีไฟล์เสียงแล้ว — รีเฟรชหน้าเพื่อดูรายการล่าสุด");
      return;
    }
    setUrl(r.recording.url);
    setExpires(r.recording.expiresAt);
  }

  async function remove() {
    setError(null);
    setDone(null);
    if (!picked) return;
    if (!confirm) {
      setError("ติ๊กยืนยันก่อน — ลบไฟล์เสียงแล้วกู้คืนไม่ได้");
      return;
    }
    if (reason.trim().length < 5) {
      setError("ใส่เหตุผลที่ลบอย่างน้อย 5 ตัวอักษร — เก็บไว้ในประวัติให้ตรวจย้อนหลังได้");
      return;
    }
    setBusy(true);
    const r = await removeRecordingAction(systemId, picked, { confirm: true, reason: reason.trim() });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const left = rows.filter((x) => x.activityId !== picked);
    setRows(left);
    setPicked(left[0]?.activityId ?? "");
    setUrl(null);
    setExpires(null);
    setConfirming(false);
    setConfirm(false);
    setReason("");
    setDone("ลบไฟล์เสียงของสายนี้แล้ว");
  }

  return (
    <section className="card flex min-w-0 flex-col gap-2 p-4" data-testid="crm-call-recordings">
      <h2 className="text-sm font-semibold">ไฟล์เสียงของสาย</h2>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold">เลือกสาย</span>
        <select
          className="w-full rounded-lg border px-2 py-1.5 text-sm"
          value={picked}
          onChange={(e) => {
            setPicked(e.target.value);
            setUrl(null);
            setExpires(null);
            setError(null);
            setDone(null);
          }}
          data-testid="crm-call-recording-pick"
        >
          {rows.map((r) => (
            <option key={r.activityId} value={r.activityId}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {variant === "deal" ? (
          <button type="button" className={BTN} onClick={play} disabled={busy || !picked} data-testid="crm-call-recording-listen">
            ▶ ฟังไฟล์เสียง
          </button>
        ) : (
          <button type="button" className={BTN} onClick={play} disabled={busy || !picked} data-testid="crm-call-recording-play">
            ▶ ฟังไฟล์เสียง
          </button>
        )}
        {canRemove &&
          (variant === "deal" ? (
            <button
              type="button"
              className={BTN}
              style={{ color: "var(--color-danger)" }}
              onClick={() => setConfirming(!confirming)}
              disabled={busy || !picked}
              data-testid="crm-call-recording-remove"
            >
              ลบไฟล์เสียง
            </button>
          ) : (
            <button
              type="button"
              className={BTN}
              style={{ color: "var(--color-danger)" }}
              onClick={() => setConfirming(!confirming)}
              disabled={busy || !picked}
              data-testid="crm-call-recording-delete"
            >
              ลบไฟล์เสียง
            </button>
          ))}
      </div>

      {url && (
        <div className="flex flex-col gap-1">
          {/* ใบผ่านของผู้ดูคนนี้ — หมดอายุแล้วกดฟังใหม่ได้ (ระบบออกใบใหม่ให้) */}
          <audio className="w-full" controls src={url} data-testid="crm-call-recording-audio" />
          {expires && <span className="text-xs text-[color:var(--color-muted)]">ลิงก์นี้ใช้ได้ถึง {new Date(expires).toLocaleTimeString("th-TH")} แล้วกดฟังใหม่ได้</span>}
        </div>
      )}

      {confirming && canRemove && (
        <div className="flex flex-col gap-2 rounded-lg border p-2" style={{ borderColor: "var(--color-danger)" }}>
          <span className="text-xs">ลบไฟล์เสียงแล้วกู้คืนไม่ได้ — ระบบเก็บเหตุผลไว้ในประวัติ</span>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="crm-call-recording-confirm" />
            ยืนยันว่าจะลบไฟล์เสียงของสายนี้
          </label>
          <input
            className="w-full rounded-lg border px-2 py-1.5 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผลที่ลบ (อย่างน้อย 5 ตัวอักษร)"
            aria-label="เหตุผลที่ลบไฟล์เสียง"
            data-testid="crm-call-recording-reason"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" onClick={remove} disabled={busy} data-testid="crm-call-recording-delete-go">
              ลบไฟล์เสียง
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => {
                setConfirming(false);
                setConfirm(false);
                setReason("");
                setError(null);
              }}
              disabled={busy}
              data-testid="crm-call-recording-delete-cancel"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="crm-call-recording-error">
          {error}
        </p>
      )}
      {done && (
        <p className="text-xs" role="status" data-testid="crm-call-recording-done">
          {done}
        </p>
      )}
    </section>
  );
}
