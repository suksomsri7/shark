"use client";
// SVC H.6 ▸ แจ้งของเสีย/ของหาย (ภาพ 13 ข ปุ่ม "แจ้งของเสีย/ของหาย (รูป → ช่าง)")
//   • รูป ≤ 3 (กล้องหลัง · JPEG/PNG/WebP ≤ 8 MB) + เล่าอาการ + เลือก: แจ้งช่าง (ใบซ่อม · ห้องยังขายตามสถานะ) หรือ ปิดห้องซ่อม N วัน
//   • ปิดห้องชนแขก/การจอง (ROOM_TAKEN) ⇒ บอกเหตุผล แล้วสลับเป็น "แจ้งช่าง" ให้ · ปิดห้องซ่อนเมื่อผู้ใช้ไม่มีสิทธิ์ (hk.canBlock ปิด)
//   • ต้องออนไลน์ (รูปไม่เข้าคิวออฟไลน์)
import { useState, useTransition, type FormEvent } from "react";
import { newIdempotencyKey, type HkDefectSend } from "./hk-shared";
import { isNetworkError } from "./HkOfflineQueue";

const MAX_PHOTOS = 3;
const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];
type Kind = "REPAIR" | "BLOCK";
type Msg = { ok: boolean; text: string } | null;
type Submit = FormEvent<HTMLFormElement>;
const FIRST_KIND: Kind = "REPAIR";
const NO_MSG: Msg = null;
const keyOnce = () => newIdempotencyKey("defect");

export type HkDefectDialogProps = {
  rooms?: { roomId: string; number: string }[];
  roomId?: string;
  roomNumber?: string;
  canBlock: boolean;
  action: HkDefectSend;
  onClose: () => void;
  onDone: () => void;
};

export default function HkDefectDialog({ rooms, roomId, roomNumber, canBlock, action, onClose, onDone }: HkDefectDialogProps) {
  const [kind, setKind] = useState(FIRST_KIND);
  const [msg, setMsg] = useState(NO_MSG);
  const [pending, start] = useTransition();
  const [key] = useState(keyOnce);

  const onSubmit = (e: Submit) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const files = fd.getAll("photos").filter((f): f is File => typeof f !== "string" && f.size > 0);
    if (files.length > MAX_PHOTOS) return setMsg({ ok: false, text: `แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูป` });
    if (files.some((f) => f.size > MAX_BYTES || !OK_TYPES.includes(f.type))) return setMsg({ ok: false, text: "แนบได้เฉพาะรูป JPEG, PNG หรือ WebP ไม่เกินรูปละ 8 MB" });
    fd.set("action", kind);
    fd.set("idempotencyKey", key);
    if (kind !== "BLOCK") fd.delete("blockDays");
    start(async () => {
      try {
        const r = await action(fd);
        if (r.ok) {
          setMsg({ ok: true, text: kind === "BLOCK" ? "ปิดห้องซ่อมแล้ว — หน้าเคาน์เตอร์เห็นในปฏิทินห้อง" : "แจ้งช่างแล้ว — ใบซ่อมเข้าบอร์ดงานช่าง" });
          onDone();
          return;
        }
        if (r.code === "ROOM_TAKEN") {
          setKind("REPAIR");
          setMsg({ ok: false, text: `${r.reason ?? "ห้องนี้มีแขกอยู่ในช่วงที่จะปิด"} — เปลี่ยนเป็น «แจ้งช่าง» ให้แล้ว กดส่งอีกครั้ง` });
          return;
        }
        setMsg({ ok: false, text: r.reason ?? "ส่งไม่สำเร็จ — ลองใหม่อีกครั้ง" });
      } catch (e) {
        setMsg({ ok: false, text: isNetworkError(e) ? "ไม่มีสัญญาณ — การแจ้งพร้อมรูปต้องออนไลน์ ลองใหม่เมื่อมีเน็ต" : "ระบบขัดข้อง ส่งไม่สำเร็จ — ลองใหม่อีกครั้ง" });
      }
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="แจ้งของเสีย/ของหาย" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <form data-hk-defect="" onSubmit={onSubmit} className="flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">แจ้งของเสีย/ของหาย{roomNumber ? ` · ${roomNumber}` : ""}</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-xl">
            ✕
          </button>
        </div>
        {roomId ? (
          <input type="hidden" name="roomId" value={roomId} />
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">ห้อง</span>
            <select name="roomId" required className="min-h-12 rounded-xl border border-[#e4e4e7] px-3 text-base">
              <option value="">เลือกห้อง</option>
              {(rooms ?? []).map((r) => (
                <option key={r.roomId} value={r.roomId}>
                  {r.number}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">อาการ/ของที่เสียหรือหาย</span>
          <textarea name="text" required maxLength={500} rows={3} placeholder="เช่น ก๊อกน้ำรั่ว · รีโมตทีวีหาย" className="rounded-xl border border-[#e4e4e7] px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">รูป (ไม่เกิน 3 รูป)</span>
          <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="min-h-12 text-sm" />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">ส่งต่อให้</legend>
          <label data-hk-defect-kind="REPAIR" className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 ${kind === "REPAIR" ? "border-[#0a0a0a]" : "border-[#e4e4e7]"}`}>
            <input type="radio" name="kind" value="REPAIR" checked={kind === "REPAIR"} onChange={() => setKind("REPAIR")} className="h-5 w-5" />
            <span className="text-[15px]">แจ้งช่าง — ห้องยังใช้/ขายได้ตามเดิม</span>
          </label>
          {canBlock ? (
            <label data-hk-defect-kind="BLOCK" className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 ${kind === "BLOCK" ? "border-[#0a0a0a]" : "border-[#e4e4e7]"}`}>
              <input type="radio" name="kind" value="BLOCK" checked={kind === "BLOCK"} onChange={() => setKind("BLOCK")} className="h-5 w-5" />
              <span className="text-[15px]">ปิดห้องซ่อม — งดขายห้องนี้</span>
            </label>
          ) : null}
        </fieldset>
        {kind === "BLOCK" ? (
          <label className="flex items-center gap-3 text-sm">
            <span className="font-medium">ปิดกี่วัน</span>
            <input type="number" name="blockDays" min={1} max={30} defaultValue={1} required className="min-h-12 w-24 rounded-xl border border-[#e4e4e7] px-3 text-base" />
          </label>
        ) : null}
        {msg ? <p className={`text-sm ${msg.ok ? "text-[#166534]" : "text-[#b91c1c]"}`}>{msg.text}</p> : null}
        <button type="submit" disabled={pending} className="inline-flex min-h-14 w-full items-center justify-center rounded-[14px] bg-[#0a0a0a] text-base font-bold text-white disabled:opacity-60">
          {pending ? "กำลังส่ง…" : kind === "BLOCK" ? "ปิดห้องซ่อม" : "แจ้งช่าง"}
        </button>
      </form>
    </div>
  );
}
