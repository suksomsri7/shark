"use client";
// SVC H.2 ▸ ไดอะล็อกปิดห้อง (BLOCK · ใบสั่ง h.2 §2 มติ 3) — ห้อง · วันเริ่ม/วันจบ · เหตุผล (บังคับ · ลงประวัติ)
//   ชนการจองที่ถือห้องแล้ว ⇒ แสดงรายชื่อ (ไม่ทับ) · ปิดจนประเภทขาด ⇒ เตือน "เกินจอง N คืน" (ไม่ยกเลิกการจองให้อัตโนมัติ)
import { useState } from "react";
import { blockRoomAction } from "@/lib/modules/hotel/actions";
import { addDays, diffDays, isYmd } from "./tape-shared";
import type { RoomOption } from "./MoveConfirmDialog";

type Props = { unitSlug: string; rooms: RoomOption[]; today: string; initialRoomId?: string; onClose: () => void; onDone: () => void };

const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-4 py-2 text-sm";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-ink)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const INPUT = "min-h-11 w-full rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";

export default function BlockDialog({ unitSlug, rooms, today, initialRoomId, onClose, onDone }: Props) {
  const [roomId, setRoomId] = useState(initialRoomId ?? rooms[0]?.roomId ?? "");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 1));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState([] as { code: string; guestName: string }[]);
  const [warning, setWarning] = useState("");
  const valid = !!roomId && isYmd(from) && isYmd(to) && diffDays(from, to) >= 1 && reason.trim().length >= 1;

  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setError("");
    setConflicts([]);
    try {
      const r = await blockRoomAction(unitSlug, { roomId, from, to, reason: reason.trim() });
      if (!r.ok) {
        setError(r.reason || "ปิดห้องไม่สำเร็จ");
        if ("conflicts" in r && Array.isArray(r.conflicts)) setConflicts(r.conflicts);
        return;
      }
      if ("warning" in r && r.warning) {
        setWarning(`${r.warning.message} — การจองยังอยู่ครบ ตรวจและย้ายห้องหรือติดต่อแขกเอง`);
        return;
      }
      onDone();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="ปิดห้อง" data-block-dialog="" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-[color:var(--color-surface)] p-5 shadow-xl">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-[color:var(--color-ink)]">ปิดห้อง (ปิดซ่อม)</h2>
          <p className="text-sm text-[color:var(--color-muted)]">ห้องที่ปิดจะไม่ถูกขายในช่วงนี้ · ถ้าครอบวันนี้ ห้องจะขึ้นสถานะปิดซ่อมทันที</p>
        </header>
        {warning ? (
          <>
            <p role="status" data-overbook-warning="" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              ปิดห้องแล้ว · {warning}
            </p>
            <footer className="flex justify-end">
              <button type="button" onClick={onDone} className={BTN_PRIMARY}>
                รับทราบ
              </button>
            </footer>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span>ห้อง</span>
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={INPUT}>
                {rooms.map((r) => (
                  <option key={r.roomId} value={r.roomId}>
                    {r.number} · {r.typeName}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>วันเริ่ม</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>วันจบ (เปิดขายวันนี้)</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={INPUT} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span>เหตุผล</span>
              <textarea name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} className={INPUT} placeholder="เช่น แอร์เสีย รอช่าง" />
            </label>
            <p className="text-xs text-[color:var(--color-muted)]">ถ้าปิดจนห้องประเภทนี้ไม่พอกับที่จองไว้ ระบบจะเตือน «เกินจอง» แต่ไม่ยกเลิกการจองให้</p>
            {error ? (
              <div role="alert" className="flex flex-col gap-1 text-sm text-[color:var(--color-danger)]">
                <p>{error}</p>
                {conflicts.length ? (
                  <ul className="list-disc pl-5">
                    {conflicts.map((c) => (
                      <li key={c.code}>
                        {c.code} · {c.guestName}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <footer className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={BTN} disabled={busy}>
                ยกเลิก
              </button>
              <button type="button" onClick={submit} className={BTN_PRIMARY} disabled={busy || !valid}>
                {busy ? "กำลังปิดห้อง…" : "ปิดห้อง"}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
