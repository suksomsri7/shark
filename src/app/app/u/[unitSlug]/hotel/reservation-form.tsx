"use client";

import { useActionState } from "react";
import {
  createReservationAction,
  type ReservationFormState,
} from "@/lib/modules/hotel/actions";
import { formatBaht } from "@/lib/ui/money";

const initial: ReservationFormState = { status: "idle" };

type RoomTypeOpt = { id: string; name: string; baseRateSatang: number };

export function ReservationForm({
  unitSlug,
  roomTypes,
  today,
  tomorrow,
}: {
  unitSlug: string;
  roomTypes: RoomTypeOpt[];
  today: string;
  tomorrow: string;
}) {
  const [state, action, pending] = useActionState(createReservationAction, initial);

  if (roomTypes.length === 0) {
    return (
      <div className="card text-sm text-[color:var(--color-muted)]">
        ยังไม่มีประเภทห้อง — ไปที่ &quot;ตั้งค่า&quot; เพื่อเพิ่มประเภทห้องและห้องพักก่อน
      </div>
    );
  }

  return (
    <form action={action} className="card flex flex-col gap-3">
      <div className="text-sm font-medium">รับจองใหม่</div>
      <input type="hidden" name="unitSlug" value={unitSlug} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ประเภทห้อง</span>
          <select name="roomTypeId" required className="rounded-lg border px-3 py-2 text-sm">
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {formatBaht(t.baseRateSatang)}/คืน
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ชื่อผู้เข้าพัก</span>
          <input
            name="guestName"
            required
            placeholder="ชื่อ-นามสกุล"
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">วันเข้าพัก</span>
          <input
            name="checkInDate"
            type="date"
            required
            defaultValue={today}
            min={today}
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">วันออก</span>
          <input
            name="checkOutDate"
            type="date"
            required
            defaultValue={tomorrow}
            min={tomorrow}
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">เบอร์โทร</span>
          <input name="guestPhone" placeholder="08x-xxx-xxxx" className="rounded-lg border px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ผู้ใหญ่</span>
          <input
            name="adults"
            type="number"
            min={1}
            defaultValue={2}
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </label>
      </div>

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && (
        <p className="text-sm text-[color:var(--color-ink)]">
          บันทึกการจองแล้ว · รหัส {state.code}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary text-sm">
        {pending ? "กำลังบันทึก..." : "บันทึกการจอง"}
      </button>
    </form>
  );
}
