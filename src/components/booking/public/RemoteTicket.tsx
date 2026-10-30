"use client";

// SVC B.9 — รับบัตรคิวจากมือถือ (ภาคผนวก ก #42) · มือถือแนวตั้ง 390 · สัญญา DOM: ใบสั่ง §4
//   ฟอร์ม (บริการ · ช่าง/ใครก็ได้ · เบอร์ · เวลารอโดยประมาณ) → ผล (เลขบัตร · เปิดหน้าบัตร · ผูก LINE เมื่อมี) / ข้อผิดพลาด
// 🔴 ไม่มีเบอร์ในผล/HTML นอกจากช่องกรอกของผู้ใช้เอง · import ค่าจาก lib ไม่ได้ (เฉพาะ import type)
import { useActionState } from "react";
import type { RemoteTicketForm } from "@/lib/platform/booking-remote";
import { waitLabel } from "./fmt";

type Ok = { ok: true; ticketNumber: string; waitMin: number | null; ticketUrl: string; lineLink: string | null };
type Fail = { ok: false; code: string; reason: string };
type Res = Ok | Fail;
type Props = { form: RemoteTicketForm; action: (prev: unknown, fd: FormData) => Promise<unknown>; initial?: Res };

const asRes = (x: unknown): Res | null => {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.ok === true && typeof o.ticketNumber === "string") {
    return {
      ok: true,
      ticketNumber: o.ticketNumber,
      waitMin: typeof o.waitMin === "number" ? o.waitMin : null,
      ticketUrl: typeof o.ticketUrl === "string" ? o.ticketUrl : "",
      lineLink: typeof o.lineLink === "string" && o.lineLink ? o.lineLink : null,
    };
  }
  if (o.ok === false) return { ok: false, code: typeof o.code === "string" ? o.code : "ERROR", reason: typeof o.reason === "string" ? o.reason : "ทำรายการไม่สำเร็จ" };
  return null;
};

const BTN_DARK = "inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-[#0a0a0a] px-5 text-[16px] font-bold text-white disabled:opacity-50";
const BTN_LINE = "inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-[#06c755] px-5 text-[16px] font-bold text-white";
const BTN_GHOST = "inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-[#d4d4d4] bg-white px-5 text-[16px] font-bold text-[#0a0a0a]";

export default function RemoteTicket({ form, action, initial }: Props) {
  const [state, run, pending] = useActionState(async (prev: unknown, fd: FormData) => (await action(prev, fd)) as unknown, (initial ?? null) as unknown);
  const res = asRes(state);
  const mark = form.unitName.replace(/\s+/g, "").slice(0, 2) || "Q";

  return (
    <div data-bq-remote className="mx-auto flex w-full max-w-[480px] flex-col overflow-hidden rounded-[24px] border border-[#e5e5e5] bg-white text-[#0a0a0a]">
      <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0a0a0a] text-[14px] font-bold text-white">{mark}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold">{form.unitName}</p>
          <p className="text-[13px] text-[#737373]">รับบัตรคิวทางมือถือ · ไม่ต้องรอที่ร้าน</p>
        </div>
      </div>

      {res?.ok ? (
        <div data-bq-remote-ticket={res.ticketNumber} className="flex flex-col items-center gap-4 p-6 text-center">
          <p className="text-[14px] text-[#737373]">บัตรคิวของคุณ</p>
          <p className="text-[56px] font-black leading-none tracking-tight">{res.ticketNumber}</p>
          <p className="text-[15px]">เวลารอโดยประมาณ <b>{waitLabel(res.waitMin)}</b></p>
          <p className="text-[13px] text-[#737373]">เปิดหน้าบัตรเพื่อดูคิวสด แล้วกลับมาที่ร้านก่อนถึงคิว</p>
          <div className="flex w-full flex-col gap-3">
            {res.ticketUrl ? (
              <a data-bq-remote-open href={res.ticketUrl} className={BTN_DARK}>
                เปิดหน้าบัตรคิว
              </a>
            ) : null}
            {res.lineLink ? (
              <a data-bq-remote-line href={res.lineLink} className={BTN_LINE} rel="noopener noreferrer">
                รับแจ้งเตือนทาง LINE
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <form data-bq-remote-form action={run} className="flex flex-col gap-5 p-5">
          <p className="rounded-2xl bg-[#f5f5f5] px-4 py-3 text-[14px]">
            เวลารอโดยประมาณตอนนี้ <b>{waitLabel(form.waitMin)}</b>
            {form.maxWaitMin !== null ? <span className="text-[#737373]"> · รับบัตรเมื่อรอไม่เกิน {form.maxWaitMin} นาที</span> : null}
          </p>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[14px] font-bold">เลือกบริการ</legend>
            {form.services.length === 0 ? <p className="text-[14px] text-[#737373]">ขณะนี้ยังไม่มีบริการที่รับบัตรคิว</p> : null}
            {form.services.map((s, i) => (
              <label key={s.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-2xl border border-[#e5e5e5] px-4 py-3 has-[:checked]:border-[#0a0a0a]">
                <input type="radio" name="serviceId" value={s.id} defaultChecked={i === 0} required className="h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1 break-words text-[15px]">{s.name}</span>
                <span className="shrink-0 text-[13px] text-[#737373]">{s.durationMin} นาที</span>
              </label>
            ))}
          </fieldset>

          {form.staff ? (
            <label className="flex flex-col gap-2">
              <span className="text-[14px] font-bold">ผู้ให้บริการ</span>
              <select name="staffId" defaultValue="" className="min-h-[48px] w-full rounded-2xl border border-[#d4d4d4] bg-white px-4 text-[15px]">
                <option value="">ใครก็ได้ (เร็วที่สุด)</option>
                {form.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-bold">เบอร์โทร</span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="08x-xxx-xxxx"
              className="min-h-[48px] w-full rounded-2xl border border-[#d4d4d4] px-4 text-[16px]"
            />
            <span className="text-[12px] text-[#737373]">ใช้เบอร์เดียวรับบัตรได้วันละ 1 ใบที่ยังรออยู่</span>
          </label>

          {res && !res.ok ? (
            <p data-bq-remote-error={res.code} role="alert" className="rounded-2xl bg-[#fef2f2] px-4 py-3 text-[14px] text-[#b91c1c]">
              {res.reason}
            </p>
          ) : null}

          <button type="submit" disabled={pending || form.services.length === 0} className={BTN_DARK}>
            {pending ? "กำลังออกบัตร…" : "รับบัตรคิว"}
          </button>
          <a href="." className={BTN_GHOST}>
            กลับหน้าร้าน
          </a>
        </form>
      )}
    </div>
  );
}
