"use client";
// SVC H.10 ▸ แม็ปประเภทห้อง ↔ รหัสห้องของช่องทาง (ใบสั่ง h.10 §2 ข้อ 7 · §4) — ประเภทห้อง active ทุกตัว · ว่าง = ไม่ขายผ่านช่องนี้
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChannelDetailDto } from "@/lib/modules/hotel/channel/mapping";
import { saveRoomMapAction } from "@/lib/modules/hotel/actions";
import { BTN, CARD, INPUT } from "./channel-shared";

type Props = { unitSlug: string; connectionId: string; roomTypes: ChannelDetailDto["roomTypes"] };

export default function RoomMapEditor({ unitSlug, connectionId, roomTypes }: Props) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(roomTypes.map((t) => [t.id, t.externalRoomId ?? ""])));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Record<string, string>>({});
  const save = async (roomTypeId: string) => {
    if (busy) return;
    setBusy(roomTypeId);
    try {
      const r = await saveRoomMapAction(unitSlug, { connectionId, roomTypeId, externalRoomId: (vals[roomTypeId] ?? "").trim() });
      setMsg((m) => ({ ...m, [roomTypeId]: r.ok ? "บันทึกแล้ว" : r.reason || "บันทึกไม่สำเร็จ" }));
      if (r.ok) router.refresh();
    } catch {
      setMsg((m) => ({ ...m, [roomTypeId]: "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" }));
    } finally {
      setBusy("");
    }
  };
  return (
    <section className={CARD} aria-label="แม็ปห้อง">
      <header>
        <h2 className="text-base font-bold">แม็ปห้อง</h2>
        <p className="text-sm text-[color:var(--color-muted)]">ใส่รหัสห้องตามที่ช่องทางกำหนด · เว้นว่าง = ไม่ขายประเภทนี้ผ่านช่องทางนี้</p>
      </header>
      <ul className="flex flex-col divide-y divide-[color:var(--color-line)]">
        {roomTypes.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-32 flex-1 text-sm font-medium">{t.name}</span>
            <input
              className={`${INPUT} max-w-48`}
              aria-label={`รหัสห้องของช่องทาง ${t.name}`}
              value={vals[t.id] ?? ""}
              maxLength={64}
              placeholder="ไม่ขายผ่านช่องนี้"
              onChange={(e) => setVals((v) => ({ ...v, [t.id]: e.target.value }))}
            />
            <button type="button" className={BTN} disabled={busy !== ""} onClick={() => save(t.id)}>
              {busy === t.id ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            {msg[t.id] && <span className="w-full text-xs text-[color:var(--color-muted)]">{msg[t.id]}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
