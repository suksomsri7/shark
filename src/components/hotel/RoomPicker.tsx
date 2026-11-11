"use client";
// SVC H.4 ▸ เลือกห้องตอนเช็กอิน — ห้องของประเภทเดียวกับการจอง · พร้อม = เลือกได้ · ยังไม่พร้อม (แม่บ้าน/ไม่ผ่านตรวจ) = ผู้จัดการเลือกได้พร้อมเหตุผล
//   ห้องมีผู้เข้าพัก/ปิดซ่อม = เลือกไม่ได้ (ROOM_TAKEN/ROOM_INACTIVE)
import type { AssignableRoom } from "./checkin-shared";

type Props = { rooms: AssignableRoom[]; value: string; onChange: (roomId: string) => void; canForce: boolean; currentRoomId: string | null };

const HK_LABEL: Record<string, string> = { CLEAN: "สะอาด", INSPECTED: "ตรวจแล้ว", DIRTY: "รอทำความสะอาด", OUT_OF_ORDER: "ปิดซ่อม" };

export default function RoomPicker({ rooms, value, onChange, canForce, currentRoomId }: Props) {
  function forceable(r: AssignableRoom): boolean {
    if (r.sellable || !canForce || r.hkStatus === "OUT_OF_ORDER") return false;
    return !(r.reason ?? "").includes("ผู้เข้าพัก");
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-sm font-medium">ห้องที่เข้าพัก</legend>
      {rooms.length === 0 ? <p className="text-sm text-[color:var(--color-danger)]">ไม่มีห้องของประเภทนี้ที่ว่างทั้งช่วง — ย้ายห้อง/เปลี่ยนประเภทก่อน</p> : null}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="เลือกห้อง">
        {rooms.map((r) => {
          const disabled = !r.sellable && !forceable(r);
          const on = value === r.roomId;
          return (
            <button
              key={r.roomId}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              data-room-option={r.roomId}
              data-sellable={r.sellable ? "1" : "0"}
              onClick={() => onChange(r.roomId)}
              className={`flex min-h-11 flex-col items-start rounded-xl border px-3 py-2 text-left text-sm disabled:opacity-40 ${on ? "border-[color:var(--color-ink)] font-bold" : "border-[color:var(--color-line)]"} ${r.sellable ? "" : "border-dashed"}`}
            >
              <span>
                ห้อง {r.number}
                {currentRoomId === r.roomId ? " · ห้องที่ถือไว้" : ""}
              </span>
              <span className="text-xs text-[color:var(--color-muted)]">{r.sellable ? (HK_LABEL[r.hkStatus] ?? r.hkStatus) : (r.reason ?? "ยังไม่พร้อม")}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
