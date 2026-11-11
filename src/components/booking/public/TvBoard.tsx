// SVC B.6 — จอทีวีเรียกคิวหน้าร้าน (ภาพ จอง 05 · 1920×1080) · สัญญา DOM: ใบสั่ง §4
// 🔴 เลข + เวลา + เก้าอี้ (+ ชื่อช่างเมื่อร้านตั้ง) เท่านั้น — ไม่มีชื่อ/เบอร์ลูกค้า (X8) · ไม่มีปุ่ม/ฟอร์ม · ไม่มี state (render บน server)
import type { TvView } from "@/lib/modules/booking/public-line";
import { dayLabel, hhmm, waitLabel } from "./fmt";

const STATE_TH = { BUSY: "กำลังทำ", CALLING: "กำลังเรียก", FREE: "ว่าง" } as const;

export default function TvBoard({ view }: { view: TvView }) {
  const [shop, ...branch] = view.unitName.split(" · ");
  const seatLabel = (seat: number | null, staff: string | null) => [seat !== null ? `เก้าอี้ ${seat}` : null, staff].filter(Boolean).join(" · ");
  return (
    <div data-tv-board="" className="grid min-h-screen w-full grid-cols-1 bg-[#0a0a0a] text-white lg:grid-cols-[1fr_440px]">
      {/* ═════ ซ้าย: เรียก · เก้าอี้ · เวลารอ ═════ */}
      <div className="flex min-w-0 flex-col gap-6 p-6 lg:p-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[28px] font-bold tracking-tight">
            {shop}
            {branch.length ? <span className="ml-3 text-[20px] font-normal text-white/70">{branch.join(" · ")}</span> : null}
          </p>
          <p className="text-[22px] text-white/80">
            {dayLabel(view.dayStr)} · {hhmm(view.nowMs)}
          </p>
        </div>

        {view.calling ? (
          <div data-tv-calling="" data-ticket={view.calling.ticketNumber} className="flex flex-wrap items-center gap-x-10 gap-y-2 rounded-[28px] bg-white px-10 py-8 text-[#0a0a0a]">
            <div>
              <p className="text-[22px] font-semibold text-[#737373]">เชิญหมายเลข</p>
              <p className="text-[120px] font-black leading-none tracking-tight lg:text-[150px]">{view.calling.ticketNumber}</p>
            </div>
            <div>
              {view.calling.seat !== null ? <p className="text-[48px] font-bold">เก้าอี้ {view.calling.seat}</p> : null}
              <p className="text-[24px] text-[#737373]">{[view.calling.staffName, view.calling.serviceName].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center rounded-[28px] bg-white/10 px-10 py-12">
            <p className="text-[40px] font-bold text-white/80">รอเรียกคิวถัดไป</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {view.chairs.map((c) => (
            <div
              key={c.seat}
              data-tv-chair={String(c.seat)}
              data-state={c.state}
              className={`flex min-h-[150px] flex-col justify-between rounded-[20px] border px-6 py-5 ${c.state === "CALLING" ? "border-[color:var(--color-accent,#1d4ed8)] bg-[color:var(--color-accent,#1d4ed8)]" : "border-white/20 bg-[#0a0a0a]"}`}
            >
              <p className="text-[18px] text-white/75">{seatLabel(c.seat, c.staffName)}</p>
              <p className="text-[44px] font-black leading-tight">{c.state === "FREE" ? "ว่าง" : c.ticketNumber}</p>
              <p className="text-[18px] text-white/80">
                {c.state === "FREE" && c.nextTicketNumber ? `เตรียมรับ ${c.nextTicketNumber}` : STATE_TH[c.state]}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-auto grid grid-cols-1 gap-4 md:grid-cols-2">
          <div data-tv-wait="" className="rounded-[20px] bg-white/20 px-7 py-6">
            <p className="text-[36px] font-bold">{view.walkInWaitMin === null ? "ปิดรับ walk-in" : waitLabel(view.walkInWaitMin)}</p>
            <p className="text-[20px] text-white/80">{view.walkInWaitMin === null ? "จองเวลาล่วงหน้าได้ทาง LINE" : "เวลารอ walk-in ตอนนี้ · ถ้ารับบัตรเดี๋ยวนี้"}</p>
          </div>
          <div className="rounded-[20px] bg-white/20 px-7 py-6">
            <p className="text-[36px] font-bold">จองไว้ = ได้ตามเวลา</p>
            <p className="text-[20px] text-white/80">มีนัดแล้ว สแกน QR จาก LINE ที่ตู้ เพื่อเช็กอิน</p>
          </div>
        </div>
      </div>

      {/* ═════ ขวา: คิวถัดไป ═════ */}
      <div className="flex min-w-0 flex-col bg-white p-6 text-[#0a0a0a] lg:p-10">
        <p className="text-[30px] font-bold">คิวถัดไป</p>
        <ul className="mt-4 flex flex-col">
          {view.next.map((n) => (
            <li key={n.ticketNumber} data-tv-next={n.ticketNumber} className="flex items-center gap-8 border-b border-[#e5e5e5] py-6 last:border-b-0">
              <span className="w-[160px] text-[48px] font-black leading-none">{n.ticketNumber}</span>
              <span className="flex flex-col">
                <span className="text-[22px]">~{hhmm(n.startMs)}</span>
                <span className="text-[18px] text-[#737373]">{[seatLabel(n.seat, n.staffName), n.booked ? "นัดไว้" : null].filter(Boolean).join(" · ")}</span>
              </span>
            </li>
          ))}
          {view.next.length === 0 ? <li className="py-6 text-[22px] text-[#737373]">ยังไม่มีคิวรอ</li> : null}
        </ul>
        <div className="mt-auto border-t border-[#e5e5e5] pt-6">
          <p className="text-[18px] font-bold">รับบัตรคิวจากมือถือ</p>
          <p className="text-[15px] text-[#737373]">รับบัตรที่ตู้แล้วสแกน QR บนบัตร — ดูคิวสดได้ ออกไปทำธุระได้ · มีนัดแล้ว เช็กอินที่ตู้</p>
        </div>
      </div>
    </div>
  );
}
