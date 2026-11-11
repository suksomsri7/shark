'use client';
// SVC D.16 ▸ รายการแจ้งซ่อมของหอ (จอพนักงาน · ไม่มีภาพแบบ) — สัญญา DOM ledger/svc-briefs/svc-brief-d.16.md §5.2
//   • ข้อมูลจาก listDormRepairs (import จาก lib ได้เฉพาะ type) · ไม่มีลิงก์ไฟล์ (จำนวนรูปเท่านั้น) · ชื่อแรกของผู้เช่าเท่านั้น
//   • แถวละลิงก์ไปมือถือช่าง <basePath>/repairs/<id> · งานที่ยังไม่มีการ์ดบอร์ดงานบอกวิธีตั้งบอร์ด · 390 ไม่ล้น · แตะได้ ≥ 44px
import type { RepairList } from "@/lib/modules/dorm";

export type DormRepairsProps = { model: RepairList; basePath: string; status?: "ACTIVE" | "DONE" | "ALL" };

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** ISO ⇒ "5 พ.ย." (วันไทย · อ่านจากสตริง ISO หลังบวก 7 ชั่วโมง) */
function thDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(new Date(t + 7 * 3_600_000).toISOString());
  return m ? `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? ""}` : "";
}
const STATUS_TH: Record<string, string> = { OPEN: "รับเรื่องแล้ว", IN_PROGRESS: "กำลังซ่อม", DONE: "ซ่อมเสร็จแล้ว", CANCELLED: "ยกเลิก" };
const STATUS_TONE: Record<string, string> = {
  OPEN: "border-[#e4e4e7] text-[#3f3f46]",
  IN_PROGRESS: "border-[#f59e0b] text-[#92400e]",
  DONE: "border-[#16a34a] text-[#166534]",
  CANCELLED: "border-[#e4e4e7] text-[#a1a1aa]",
};
const FILTERS: { key: "ACTIVE" | "DONE" | "ALL"; label: string }[] = [
  { key: "ACTIVE", label: "ยังไม่เสร็จ" },
  { key: "DONE", label: "เสร็จแล้ว" },
  { key: "ALL", label: "ทั้งหมด" },
];

export default function DormRepairs({ model, basePath, status = "ACTIVE" }: DormRepairsProps) {
  const c = model.counts;
  return (
    <div data-dorm-repairs="" className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 text-[#18181b]">
      <header className="flex flex-col gap-1">
        <div className="text-xs text-[#71717a]">{model.unitName}</div>
        <h1 className="text-xl font-bold">แจ้งซ่อม</h1>
        <p className="text-sm text-[#52525b]">
          รับเรื่อง {c.open} · กำลังซ่อม {c.inProgress} · เสร็จแล้ว {c.done}
        </p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="กรองสถานะ">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={`${basePath}/repairs?s=${f.key}`}
            aria-current={f.key === status ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-sm ${f.key === status ? "border-[#18181b] bg-[#18181b] text-white" : "border-[#e4e4e7] bg-white"}`}
          >
            {f.label}
          </a>
        ))}
      </nav>
      {model.rows.length === 0 ? (
        <p data-repairs-empty="" className="rounded-2xl border border-dashed border-[#d4d4d8] p-6 text-center text-sm text-[#71717a]">
          ไม่มีงานแจ้งซ่อมในรายการนี้
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {model.rows.map((r) => (
            <li key={r.repairId}>
              <a
                data-repair-row={r.repairId}
                href={`${basePath}/repairs/${r.repairId}`}
                data-status={r.status}
                className="flex min-h-11 min-w-0 flex-col gap-1 rounded-2xl border border-[#e4e4e7] bg-white p-4 hover:border-[#a1a1aa]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-base font-bold">{r.roomNumber}</span>
                  <span className="min-w-0 truncate text-sm font-medium">· {r.categoryLabel}</span>
                  <span className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[r.status] ?? ""}`}>{STATUS_TH[r.status] ?? r.status}</span>
                </div>
                <p className="line-clamp-2 break-words text-sm text-[#3f3f46]">{r.text}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#71717a]">
                  <span>{r.ticketNo}</span>
                  <span>แจ้ง {thDate(r.createdAt)}</span>
                  {r.tenantFirstName ? <span>ผู้เช่า {r.tenantFirstName}</span> : null}
                  <span data-repair-entry={r.allowEntry ? "ALLOW" : "DENY"}>{r.allowEntry ? "เข้าห้องได้ตอนไม่อยู่" : "ห้ามเข้าตอนไม่อยู่ — นัดก่อน"}</span>
                  {r.photoCount > 0 ? <span>รูป {r.photoCount}</span> : null}
                  {r.rating !== null ? <span>คะแนน {r.rating}/5</span> : null}
                </div>
                {!r.cardLinked ? (
                  <div data-repair-nocard="" className="text-xs text-[#b45309]">
                    ยังไม่มีการ์ดในบอร์ดงาน — ตั้งบอร์ดชื่อตามหมวดแจ้งซ่อม
                  </div>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
