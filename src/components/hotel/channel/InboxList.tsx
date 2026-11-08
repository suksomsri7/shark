// SVC H.10 ▸ inbox การจองจากช่องทาง ทุกสถานะ (อ่านอย่างเดียว · ใบสั่ง h.10 §4) — ไม่มีอีเมล/เบอร์/ข้อมูลดิบ
//   มือถือ 390: การ์ดต่อแถว (เหตุผลตัดบรรทัด ไม่ล้นขอบ · รอบ 5) · จอกว้าง: ตารางในกรอบเลื่อนแนวนอน (data-scroll-hint) · ไม่มี directive (เรนเดอร์ฝั่งเซิร์ฟเวอร์ได้)
import Link from "next/link";
import type { InboxItem } from "@/lib/modules/hotel/channel/inbound";
import { CARD, INBOX_STATUS_TH, thDay, thTime } from "./channel-shared";

type Props = { unitSlug: string; items: InboxItem[] };

export default function InboxList({ unitSlug, items }: Props) {
  return (
    <section className={CARD} aria-label="การจองจากช่องทางทั้งหมด">
      <header>
        <h2 className="text-base font-bold">การจองจากช่องทางทั้งหมด</h2>
        <p className="text-sm text-[color:var(--color-muted)]">ฉบับใหม่ของการจองเดิม (แก้ไข/ยกเลิก) ขึ้นเป็นแถวใหม่ · แถวเก่าคงสถานะเดิม</p>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีการจองจากช่องทาง</p>
      ) : (
        <>
        {/* SVC H.10 r5 ▸ มือถือ: การ์ดต่อแถว — ข้อความเหตุผลตัดบรรทัดในกรอบ (เดิมตารางตัดขอบขวา) ◂ */}
        <ul className="flex flex-col divide-y divide-[color:var(--color-line)] md:hidden">
          {items.map((x) => (
            <li key={x.id} className="flex flex-col gap-1 py-3 text-sm" data-inbox-card={x.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-semibold">
                  {x.externalId} <span className="text-xs font-normal text-[color:var(--color-muted)]">ฉบับ {x.version}</span>
                </span>
                <span className={x.status === "NEEDS_ROOM" ? "font-semibold text-amber-700" : x.status === "REJECTED" ? "text-red-700" : ""}>{INBOX_STATUS_TH[x.status] ?? x.status}</span>
              </div>
              {x.reasonTh && <p className="break-words text-xs text-[color:var(--color-muted)]">{x.reasonTh}</p>}
              <p className="break-words">
                {x.roomTypeName ?? x.externalRoomId ?? "-"} · {thDay(x.checkIn)} – {thDay(x.checkOut)}
              </p>
              <p className="break-words text-[color:var(--color-muted)]">{x.guestName ?? "-"}</p>
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-[color:var(--color-muted)]">
                <span>รับเมื่อ {thTime(x.receivedAt)}</span>
                {x.status === "APPLIED" && x.reservationId && (
                  <Link className="underline" href={`/app/u/${unitSlug}/hotel/reservations/${x.reservationId}`}>
                    ดูการจอง
                  </Link>
                )}
              </p>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block" data-scroll-hint="เลื่อนซ้ายขวาเพื่อดูทั้งตาราง">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="px-2 py-1">เลขการจอง (ช่องทาง)</th>
                <th className="px-2 py-1">ฉบับ</th>
                <th className="px-2 py-1">สถานะ</th>
                <th className="px-2 py-1">ห้อง</th>
                <th className="px-2 py-1">เข้า–ออก</th>
                <th className="px-2 py-1">ผู้เข้าพัก</th>
                <th className="px-2 py-1">รับเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id} className="border-t border-[color:var(--color-line)]" data-inbox-row={x.id}>
                  <td className="px-2 py-1 font-semibold whitespace-nowrap">{x.externalId}</td>
                  <td className="px-2 py-1">{x.version}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <span className={x.status === "NEEDS_ROOM" ? "font-semibold text-amber-700" : x.status === "REJECTED" ? "text-red-700" : ""}>{INBOX_STATUS_TH[x.status] ?? x.status}</span>
                    {x.reasonTh && <div className="min-w-[14rem] whitespace-normal text-xs text-[color:var(--color-muted)]">{x.reasonTh}</div>}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">{x.roomTypeName ?? x.externalRoomId ?? "-"}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {thDay(x.checkIn)} – {thDay(x.checkOut)}
                  </td>
                  <td className="px-2 py-1">{x.guestName ?? "-"}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {thTime(x.receivedAt)}
                    {x.status === "APPLIED" && x.reservationId && (
                      <div>
                        <Link className="text-xs underline" href={`/app/u/${unitSlug}/hotel/reservations/${x.reservationId}`}>
                          ดูการจอง
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  );
}
