"use client";

// SVC B.14 — ฟอร์ม "จองให้ลูกค้า" (คลิกช่องว่าง / ปุ่ม + จองให้ลูกค้า) → bookForCustomerAction (bookAppointment ช่อง STAFF)
// 🔴 prefill คอลัมน์/เวลา แต่ server ตัดสินว่าง/เต็ม · idempotencyKey สร้างตอนเปิดฟอร์ม (ส่งซ้ำ = นัดเดิม)
// 🔴 ไม่ import ค่าจาก @/lib/modules/* (ยกเว้น pure) · @/lib/actions/* — action มาทาง props
import { useEffect, useRef } from "react";
import type { CalendarView } from "@/lib/modules/booking/calendar";
import { dayLabel } from "../line-parts";
import { HiddenFields, hm, timeOptions, viewFields, type CalActions } from "./cal-utils";

export type BookAt = { staffId: string | null; dateStr: string; startMin: number; key: string };

export default function BookDialog({ view, at, actions, bookAt, onClose }: { view: CalendarView; at?: string; actions: CalActions; bookAt: BookAt; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const times = timeOptions(view);
  if (!times.includes(bookAt.startMin)) {
    times.push(bookAt.startMin);
    times.sort((a, b) => a - b);
  }
  const lbl = "flex flex-col gap-1 text-xs text-[color:var(--color-muted)]";
  return (
    <dialog
      ref={ref}
      data-cal-book-dialog=""
      onClose={onClose}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border bg-[color:var(--color-surface)] p-0 text-[color:var(--color-ink)] backdrop:bg-black/30"
    >
      <form action={actions.book} className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">จองให้ลูกค้า · {dayLabel(bookAt.dateStr)}</h2>
          <button type="button" onClick={() => ref.current?.close()} className="btn-sm min-h-[36px]" aria-label="ปิด">
            ปิด
          </button>
        </div>
        <HiddenFields fields={{ idempotencyKey: bookAt.key, dateStr: bookAt.dateStr, ...viewFields(view, at) }} />
        <label className={lbl}>
          บริการ
          <select name="serviceId" className="input" required defaultValue={view.options.services[0]?.id ?? ""}>
            {view.options.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.durationMin} นาที
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={lbl}>
            {view.providerLabel}
            <select name="staffId" className="input" defaultValue={bookAt.staffId ?? ""}>
              <option value="">ใครก็ได้ (ระบบเลือก)</option>
              {view.options.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl}>
            เวลา
            <select name="startMin" className="input" defaultValue={String(bookAt.startMin)}>
              {times.map((t) => (
                <option key={t} value={t}>
                  {hm(t)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={lbl}>
          ชื่อลูกค้า
          <input name="customerName" className="input" required maxLength={120} autoComplete="off" />
        </label>
        <label className={lbl}>
          เบอร์โทรลูกค้า
          <input name="customerPhone" className="input" required inputMode="tel" maxLength={40} autoComplete="off" />
        </label>
        <label className={lbl}>
          หมายเหตุ (ไม่บังคับ)
          <input name="note" className="input" maxLength={500} autoComplete="off" />
        </label>
        <p className="text-xs text-[color:var(--color-muted)]">ห้อง/เตียงระบบเลือกให้ตามที่ว่าง · ถ้าช่วงนี้ไม่ว่างจะแจ้งเหตุผลกลับมา</p>
        <button type="submit" data-cal-book-submit="" className="btn btn-primary min-h-[44px]">
          จองนัด
        </button>
      </form>
    </dialog>
  );
}
