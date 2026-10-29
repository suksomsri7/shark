"use client";

// SVC B.6 — หน้าบัตรคิวของลูกค้าบนมือถือ (ภาพ จอง 06 ส่วน ก · 390 px) · สัญญา DOM: ใบสั่ง §4
//   บัตรดำเลขใหญ่ + เวลาโดยประมาณ + แถบตำแหน่ง + รายการข้างหน้า + ปุ่ม "ขอเลื่อนไปคิวหลัง" / "ยกเลิกบัตร" (เฉพาะที่ทำได้)
// 🔴 ไม่มีชื่อ/เบอร์ลูกค้า (X8 — นัดข้างหน้าแสดงเป็น "คิวนัดหมาย") · at (นาฬิกา QC) ⇒ hidden ทุกฟอร์ม
import type { TicketView } from "@/lib/modules/booking/public-line";
import { hhmm } from "./fmt";

type Props = { view: TicketView; token: string; actions: { defer: (fd: FormData) => Promise<void>; cancel: (fd: FormData) => Promise<void> }; at?: string };

const STATUS_TH: Record<TicketView["status"], string> = {
  WAITING: "รอคิว", CALLED: "ถึงคิวแล้ว — เชิญที่เก้าอี้", SERVING: "กำลังรับบริการ", DONE: "รับบริการเสร็จแล้ว",
  SKIPPED: "เรียกแล้วไม่พบ — ติดต่อพนักงาน", CANCELLED: "ยกเลิกบัตรแล้ว", NO_SHOW: "บัตรหมดอายุ",
};
const TAG = {
  NOW: { t: "ทำอยู่", c: "bg-[#0a0a0a] text-white" },
  WAIT: { t: "รอ", c: "bg-[#e5e5e5] text-[#0a0a0a]" },
  BOOKED: { t: "นัด", c: "border border-[#0a0a0a] text-[#0a0a0a]" },
  ME: { t: "คุณ", c: "bg-[#e8eefc] text-[color:var(--color-accent,#1d4ed8)]" },
} as const;

export default function TicketCard({ view, actions, at }: Props) {
  const active = view.status === "WAITING" || view.status === "CALLED";
  const bars = view.ahead.filter((a) => a.kind !== "NOW");
  const AtField = () => (at ? <input type="hidden" name="at" value={at} /> : null);
  return (
    <div data-ticket-card="" data-ticket={view.ticketNumber} className="mx-auto flex w-full max-w-[420px] flex-col gap-4 px-4 py-6 text-[#0a0a0a]">
      <div>
        <p className="text-[13px] text-[#737373]">{view.unitName}</p>
        <h1 className="text-[22px] font-bold">บัตรคิวของคุณ</h1>
      </div>

      <div className="flex flex-col gap-2 rounded-[24px] bg-[#0a0a0a] p-6 text-white">
        <p className="text-[14px] text-white/80">
          {view.serviceName} · รับบัตร {hhmm(view.issuedAtMs)}
          {view.bookedStartMs !== null ? ` · นัด ${hhmm(view.bookedStartMs)}` : ""}
        </p>
        <p className="text-[64px] font-black leading-none tracking-tight">{view.ticketNumber}</p>
        {active && view.plannedStartMs !== null ? (
          <>
            <p className="text-[20px] font-bold">
              ประมาณ {hhmm(view.plannedStartMs)}
              {view.staffName ? ` · ${view.staffName}` : view.seat !== null ? ` · เก้าอี้ ${view.seat}` : ""}
            </p>
            <p className="text-[13px] text-white/80">
              ข้างหน้าอีก {view.aheadCount ?? 0} คิว{view.returnByMs !== null ? ` · กลับถึงร้านก่อน ${hhmm(view.returnByMs)}` : ""}
            </p>
          </>
        ) : (
          <p className="text-[18px] font-bold">{STATUS_TH[view.status]}</p>
        )}
        {active && bars.length > 0 ? (
          <div className="mt-2 flex gap-2" aria-hidden>
            {bars.map((b, i) => (
              <span key={i} className={`h-2 flex-1 rounded-full ${b.kind === "ME" ? "bg-[color:var(--color-accent,#2563eb)]" : i < 2 ? "bg-white" : "bg-white/30"}`} />
            ))}
          </div>
        ) : null}
      </div>

      {view.ahead.length > 0 ? (
        <ul className="flex flex-col rounded-2xl border border-[#e5e5e5] px-4">
          {view.ahead.map((a, i) => (
            <li
              key={`${a.kind}-${a.ticketNumber ?? i}`}
              data-ticket-ahead={a.kind}
              {...(a.ticketNumber ? { "data-ticket": a.ticketNumber } : {})}
              className="flex min-h-[48px] items-center gap-3 border-b border-[#f0f0f0] py-2 last:border-b-0"
            >
              <span className={`rounded-md px-2 py-0.5 text-[12px] font-bold ${TAG[a.kind].c}`}>{TAG[a.kind].t}</span>
              <span className={`flex-1 text-[15px] ${a.kind === "ME" ? "font-bold" : ""}`}>{a.ticketNumber ?? "คิวนัดหมาย"}</span>
              <span className={`text-[13px] ${a.kind === "ME" ? "font-bold text-[color:var(--color-accent,#1d4ed8)]" : "text-[#737373]"}`}>
                {a.kind === "NOW" ? (a.seat !== null ? `เก้าอี้ ${a.seat}` : "") : a.startMs !== null ? `~${hhmm(a.startMs)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {active ? (
        <p className="rounded-2xl bg-[#e8eefc] px-4 py-3 text-[13px] text-[color:var(--color-accent,#1d4ed8)]">
          เวลาอาจขยับ ±10 นาทีตามงานจริงของช่าง · เปิดหน้านี้ค้างไว้เพื่อดูคิวสด
        </p>
      ) : null}

      {view.canDefer || view.canCancel ? (
        <div className="grid grid-cols-2 gap-3">
          {view.canDefer ? (
            <form action={actions.defer} className="contents">
              <AtField />
              <button type="submit" data-ticket-defer="" className="min-h-[52px] rounded-2xl border border-[#e5e5e5] bg-white text-[15px] font-bold">
                ขอเลื่อนไปคิวหลัง
              </button>
            </form>
          ) : null}
          {view.canCancel ? (
            <form
              action={actions.cancel}
              className="contents"
              onSubmit={(e) => {
                if (!window.confirm("ยกเลิกบัตรคิวนี้? ต้องรับบัตรใหม่ถ้าจะกลับมา")) e.preventDefault();
              }}
            >
              <AtField />
              <button type="submit" data-ticket-cancel="" className="min-h-[52px] rounded-2xl border border-[#e5e5e5] bg-white text-[15px] font-bold text-[color:var(--color-danger,#dc2626)]">
                ยกเลิกบัตร
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
