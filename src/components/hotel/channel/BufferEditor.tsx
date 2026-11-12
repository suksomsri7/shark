"use client";
// SVC H.10 ▸ กันห้องไม่ส่งช่องทาง (buffer ต่อประเภท · ใบสั่ง h.10 §0 · §9.5) — ARI ห้องว่าง = ว่างจริง − buffer · ไม่กระทบการขายหน้าร้าน
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChannelDetailDto } from "@/lib/modules/hotel/channel/mapping";
import { saveBufferAction } from "@/lib/modules/hotel/actions";
import { BTN, CARD, INPUT } from "./channel-shared";

type Props = { unitSlug: string; connectionId: string; roomTypes: ChannelDetailDto["roomTypes"] };

export default function BufferEditor({ unitSlug, connectionId, roomTypes }: Props) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(roomTypes.map((t) => [t.id, String(t.bufferRooms ?? 0)])));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Record<string, string>>({});
  const save = async (roomTypeId: string) => {
    if (busy) return;
    const n = Number((vals[roomTypeId] ?? "").trim());
    if (!Number.isInteger(n) || n < 0) {
      setMsg((m) => ({ ...m, [roomTypeId]: "ใส่จำนวนห้องเป็นจำนวนเต็ม 0 ขึ้นไป" }));
      return;
    }
    setBusy(roomTypeId);
    try {
      const r = await saveBufferAction(unitSlug, { connectionId, roomTypeId, rooms: n });
      setMsg((m) => ({ ...m, [roomTypeId]: r.ok ? "บันทึกแล้ว" : r.reason || "บันทึกไม่สำเร็จ" }));
      if (r.ok) router.refresh();
    } catch {
      setMsg((m) => ({ ...m, [roomTypeId]: "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" }));
    } finally {
      setBusy("");
    }
  };
  return (
    <section className={CARD} aria-label="กันห้อง">
      <header>
        <h2 className="text-base font-bold">กันห้องไม่ส่งช่องทาง</h2>
        <p className="text-sm text-[color:var(--color-muted)]">ช่องทางเห็นห้องว่างน้อยกว่าจริงตามจำนวนนี้ (ไว้ขายหน้าร้าน) · 0 = ส่งเท่าที่ว่างจริง</p>
      </header>
      <ul className="flex flex-col divide-y divide-[color:var(--color-line)]">
        {roomTypes.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-32 flex-1 text-sm font-medium">{t.name}</span>
            <input className={`${INPUT} max-w-24`} inputMode="numeric" aria-label={`กันห้อง ${t.name}`} value={vals[t.id] ?? "0"} onChange={(e) => setVals((v) => ({ ...v, [t.id]: e.target.value }))} />
            <span className="text-sm">ห้อง</span>
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
