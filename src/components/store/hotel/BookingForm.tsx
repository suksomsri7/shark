"use client";
// SVC H.8 ▸ ฟอร์มยืนยันการจอง (ภาพ 16 ข · มือถือ) — ชื่อ/เบอร์/อีเมล · ติ๊กรับทราบเงื่อนไขยกเลิก · กันสแปม (_sd_hp ซ่อน · _sd_st ตั๋วเริ่มฟอร์มจากเซิร์ฟเวอร์)
//   idempotencyKey สุ่มครั้งเดียวต่อฟอร์ม (กดซ้ำ/เน็ตหลุด = ใบเดิม) · ส่งผ่าน server action ที่หน้าส่งมา (ไม่ import ฝั่งเซิร์ฟเวอร์)
import { useState } from "react";
import { useFormStatus } from "react-dom";

export type BookingFormLabels = { guestName: string; phone: string; email: string; policyAccept: string; submit: string; submitting: string };

function Submit({ label, pending }: { label: string; pending: string }) {
  const s = useFormStatus();
  return (
    <button type="submit" disabled={s.pending} className="btn btn-primary min-h-[52px] w-full rounded-2xl text-base font-bold disabled:opacity-60">
      {s.pending ? pending : label}
    </button>
  );
}

export function BookingForm(props: { action: (fd: FormData) => Promise<void>; hidden: Record<string, string>; formToken: string; labels: BookingFormLabels }) {
  const [idem] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`));
  const L = props.labels;
  const field = "flex flex-col gap-0.5 rounded-2xl border border-[color:var(--color-line)] px-3 py-2";
  const cap = "text-xs text-[color:var(--color-muted)]";
  const input = "w-full bg-transparent text-[15px] font-semibold outline-none";
  return (
    <form action={props.action} className="flex flex-col gap-3" data-hotel-book-form="">
      {Object.entries(props.hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="idempotencyKey" value={idem} />
      <input type="hidden" name="_sd_st" value={props.formToken} />
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input type="text" name="_sd_hp" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={field}>
          <span className={cap}>{L.guestName}</span>
          <input name="guestName" required maxLength={120} autoComplete="name" className={input} />
        </label>
        <label className={field}>
          <span className={cap}>{L.phone}</span>
          <input name="guestPhone" required inputMode="tel" maxLength={32} autoComplete="tel" className={input} />
        </label>
      </div>
      <label className={field}>
        <span className={cap}>{L.email}</span>
        <input name="guestEmail" type="email" maxLength={120} autoComplete="email" className={input} />
      </label>
      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input type="checkbox" name="acceptPolicy" required className="h-5 w-5" />
        <span>{L.policyAccept}</span>
      </label>
      <Submit label={L.submit} pending={L.submitting} />
    </form>
  );
}
