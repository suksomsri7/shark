"use client";
// SVC H.6 ▸ การ์ดห้องบนบอร์ดแม่บ้าน (ภาพ 13 ก) — เลขห้องใหญ่ · หัวข้อตามบริบท · บรรทัดรอง · ป้ายขวา (ด่วน/ตรวจ/ค้างต่อ) · ทั้งการ์ดกดได้ (≥ 64px)
import { cardText, type HkRow } from "./hk-shared";

export type HkRoomCardProps = { row: HkRow; href: string; inspectionRequired: boolean; meId: string | null };

export default function HkRoomCard({ row, href, inspectionRequired, meId }: HkRoomCardProps) {
  const t = cardText(row, { inspectionRequired, meId });
  const tone = t.urgent ? "border-[#dc2626] border-l-4" : "border-[#e4e4e7]";
  const bg = t.dim ? "bg-[#fafafa]" : "bg-white";
  return (
    <a
      href={href}
      data-hk-room={row.number}
      data-context={row.context}
      data-hk-status={row.hkStatus}
      data-mine={row.assignedTo && row.assignedTo === meId ? "true" : "false"}
      className={`flex min-h-16 items-center gap-3 rounded-[14px] border px-4 py-3 ${tone} ${bg}`}
    >
      <span className={`w-14 shrink-0 text-lg font-bold ${t.dim ? "text-[#71717a]" : "text-[#18181b]"}`}>{row.number}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-[15px] font-bold ${t.dim ? "text-[#52525b]" : "text-[#18181b]"}`}>{t.title}</span>
        {t.sub ? <span className="truncate text-[13px] text-[#71717a]">{t.sub}</span> : null}
      </span>
      {t.badge ? (
        <span
          data-hk-badge={t.badge}
          className={`shrink-0 rounded-lg border px-3 py-1 text-[13px] ${t.urgent ? "border-[#dc2626] font-semibold text-[#dc2626]" : "border-[#e4e4e7] text-[#52525b]"}`}
        >
          {t.badge}
        </span>
      ) : null}
    </a>
  );
}
