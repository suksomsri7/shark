"use client";
// SVC H.2 ▸ ไดอะล็อกยืนยันการลาก (ใบสั่ง h.2 §2 มติ 2 · S:795 ยืนยันก่อนบันทึกเสมอ)
//   แสดง ห้องเดิม → ใหม่ · วันเดิม → ใหม่ · ราคาใหม่ (คืนเดิมคงราคา · คืนใหม่ตามราคาปัจจุบัน) · ย้ายข้ามประเภทไม่คิดส่วนต่าง
//   ยืนยัน ⇒ moveBookingAction (ย้าย/เลื่อน tx เดียวของ H.3) หรือ resizeBookingAction (ยืด/ย่นคืน) · ล้ม ⇒ แสดงเหตุผล ไม่มีอะไรเปลี่ยน (แถบเด้งกลับ)
//   โหมดแก้เอง (มือถือ 390 · ไม่ลาก) = เลือกห้อง/วันในไดอะล็อกนี้แทน
import { useEffect, useState } from "react";
import { moveBookingAction, previewMoveAction, resizeBookingAction } from "@/lib/modules/hotel/actions";
import { SOURCE_TH, baht, canShiftDates, dayMonthTh, diffDays, isYmd, type TapeBarDto } from "./tape-shared";

export type RoomOption = { roomId: string; number: string; roomTypeId: string; typeName: string };
export type MoveRequest = { bar: TapeBarDto; mode: "move" | "resize" | "edit"; roomId: string | null; checkIn: string; checkOut: string };
type Props = { unitSlug: string; req: MoveRequest; rooms: RoomOption[]; onClose: () => void; onDone: (ok: boolean, message: string) => void };

const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-4 py-2 text-sm";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-ink)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const INPUT = "min-h-11 rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";

export default function MoveConfirmDialog({ unitSlug, req, rooms, onClose, onDone }: Props) {
  const bar = req.bar;
  const [roomId, setRoomId] = useState(req.roomId ?? "");
  const [checkIn, setCheckIn] = useState(req.checkIn);
  const [checkOut, setCheckOut] = useState(req.checkOut);
  const [price, setPrice] = useState({ loading: true, total: 0, added: 0, nights: 0, ok: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = req.mode === "edit";
  const oldRoom = rooms.find((r) => r.roomId === bar.roomId) ?? null;
  const newRoom = rooms.find((r) => r.roomId === roomId) ?? null;
  const typeChange = !!newRoom && newRoom.roomTypeId !== bar.roomTypeId;
  const datesChanged = checkIn !== bar.from || checkOut !== bar.to;
  const validDates = isYmd(checkIn) && isYmd(checkOut) && diffDays(checkIn, checkOut) >= 1;

  useEffect(() => {
    let live = true;
    if (!validDates) return;
    previewMoveAction(unitSlug, { id: bar.refId, checkIn, checkOut })
      .then((r) => {
        if (!live) return;
        if (r.ok) setPrice({ loading: false, total: r.totalSatang, added: r.addedSatang, nights: r.nights, ok: true });
        else setPrice({ loading: false, total: 0, added: 0, nights: 0, ok: false });
      })
      .catch(() => live && setPrice({ loading: false, total: 0, added: 0, nights: 0, ok: false }));
    return () => {
      live = false;
    };
  }, [unitSlug, bar.refId, checkIn, checkOut, validDates]);

  const submit = async () => {
    if (busy || !validDates) return;
    setBusy(true);
    setError("");
    try {
      const r =
        req.mode === "resize"
          ? await resizeBookingAction(unitSlug, { id: bar.refId, newCheckOut: checkOut })
          : await moveBookingAction(unitSlug, {
              id: bar.refId,
              ...(roomId && roomId !== bar.roomId ? { roomId } : {}),
              ...(checkIn !== bar.from ? { checkIn } : {}),
              ...(checkOut !== bar.to ? { checkOut } : {}),
            });
      if (!r.ok) {
        setError(r.reason || "บันทึกไม่สำเร็จ — การจองคงเดิม");
        onDone(false, r.reason || "บันทึกไม่สำเร็จ");
        return;
      }
      onDone(true, "บันทึกแล้ว");
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง — การจองคงเดิม");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="ยืนยันการย้ายหรือเลื่อนการจอง" data-move-dialog="" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-[color:var(--color-surface)] p-5 shadow-xl">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-[color:var(--color-ink)]">{req.mode === "resize" ? "ยืด/ย่นคืน" : "ย้ายห้อง/เลื่อนวัน"} · {bar.guestName ?? bar.code}</h2>
          <p className="text-sm text-[color:var(--color-muted)]">{bar.code} · {SOURCE_TH[bar.source ?? ""] ?? ""}</p>
        </header>

        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-[color:var(--color-muted)]">ห้องเดิม</dt>
          <dd>{oldRoom ? `${oldRoom.number} · ${oldRoom.typeName}` : "ยังไม่กำหนดห้อง"}</dd>
          <dt className="text-[color:var(--color-muted)]">ห้องใหม่</dt>
          <dd>
            {editable ? (
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={INPUT} aria-label="เลือกห้องใหม่">
                <option value="">ห้องเดิม</option>
                {rooms.map((r) => (
                  <option key={r.roomId} value={r.roomId}>
                    {r.number} · {r.typeName}
                  </option>
                ))}
              </select>
            ) : newRoom ? (
              `${newRoom.number} · ${newRoom.typeName}`
            ) : (
              "ห้องเดิม"
            )}
          </dd>
          <dt className="text-[color:var(--color-muted)]">วันเดิม</dt>
          <dd>
            {dayMonthTh(bar.from)} – {dayMonthTh(bar.to)} ({diffDays(bar.from, bar.to)} คืน)
          </dd>
          <dt className="text-[color:var(--color-muted)]">วันใหม่</dt>
          <dd>
            {editable ? (
              <span className="flex flex-wrap items-center gap-2">
                <input type="date" value={checkIn} disabled={!canShiftDates(bar.kind)} onChange={(e) => setCheckIn(e.target.value)} className={INPUT} aria-label="วันเข้าใหม่" />
                <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={INPUT} aria-label="วันออกใหม่" />
              </span>
            ) : validDates ? (
              `${dayMonthTh(checkIn)} – ${dayMonthTh(checkOut)} (${diffDays(checkIn, checkOut)} คืน)`
            ) : (
              "วันไม่ถูกต้อง"
            )}
          </dd>
          <dt className="text-[color:var(--color-muted)]">ราคาใหม่</dt>
          <dd data-move-price="">
            {price.loading ? "กำลังคิดราคา…" : price.ok ? `฿${baht(price.total)} (${price.nights} คืน${datesChanged ? ` · คืนที่เพิ่ม ฿${baht(price.added)}` : ""})` : "คิดราคาไม่ได้ — ระบบจะใช้ราคาปัจจุบันตอนบันทึก"}
          </dd>
        </dl>
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-[color:var(--color-muted)]">
          {typeChange ? "ย้ายต่างประเภทห้อง: " : ""}ไม่คิดส่วนต่างเมื่อย้ายประเภท · คืนเดิมคงราคาเดิม · คืนที่เพิ่มคิดราคาปัจจุบัน
        </p>
        {error ? (
          <p role="alert" className="text-sm text-[color:var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <footer className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BTN} disabled={busy}>
            ยกเลิก
          </button>
          <button type="button" onClick={submit} className={BTN_PRIMARY} disabled={busy || !validDates} data-move-confirm="">
            {busy ? "กำลังบันทึก…" : "ยืนยัน"}
          </button>
        </footer>
      </div>
    </div>
  );
}
