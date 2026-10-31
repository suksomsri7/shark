// SVC D.18 ▸ หน้า QR รับพัสดุของผู้เช่า (/dp/<token>) — สัญญา DOM ledger/svc-briefs/svc-brief-d.18.md §4.2
//   • อ่านอย่างเดียว: ผู้เช่าแสดง QR นี้ให้พนักงานสแกนตอนรับของ (ไม่มีปุ่มกดรับเอง · มติผู้คุม R4)
//   • ไม่มีรูปพัสดุ (ฉลากมีชื่อ/ที่อยู่/เบอร์ — R7) · ไม่มีชื่อ/เบอร์ · เลขพัสดุแสดง 4 ตัวท้ายเท่านั้น · ไม่ import โมดูลฝั่ง server (type เท่านั้น)
//   • มือถือ 390 ไม่ล้นแนวนอน
import type { ParcelPickupView } from "@/lib/modules/dorm";

export default function DormParcelPickup({ view }: { view: ParcelPickupView }) {
  return (
    <div data-parcel-pickup className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-6 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{`พัสดุห้อง ${view.roomNumber}`}</h1>
        <p className="text-sm text-[#52525b]">{view.unitName}</p>
      </div>
      <div className="w-full rounded-2xl border border-[#e4e4e7] bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-parcel-qr src={view.qrSvgDataUrl} alt="QR รับพัสดุ" className="mx-auto aspect-square w-full max-w-[280px]" />
        <p className="mt-3 text-base font-medium">แสดง QR นี้ให้พนักงานตอนรับพัสดุ</p>
      </div>
      <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-[#e4e4e7] bg-white p-4 text-left text-sm">
        <dt className="text-[#71717a]">ขนส่ง</dt>
        <dd className="break-words">{view.carrier ?? "พัสดุ"}</dd>
        {view.trackingLast4 ? (
          <>
            <dt className="text-[#71717a]">เลขพัสดุ</dt>
            <dd className="tabular-nums">{`…${view.trackingLast4}`}</dd>
          </>
        ) : null}
        <dt className="text-[#71717a]">วันที่หอรับไว้</dt>
        <dd>{view.receivedLabel}</dd>
        <dt className="text-[#71717a]">รอรับมาแล้ว</dt>
        <dd>{`${view.daysWaiting} วัน`}</dd>
      </dl>
      <p className="text-xs text-[#71717a]">ลิงก์นี้ใช้ได้ครั้งเดียว เมื่อพนักงานบันทึกว่ารับของแล้วลิงก์จะใช้ไม่ได้อีก</p>
    </div>
  );
}
