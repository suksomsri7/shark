"use client";
// SVC H.10 ▸ แม็ปแผนราคา ↔ รหัสแผนของช่องทาง + markup % (ใบสั่ง h.10 §2 ข้อ 7 · §9.5) — markup ว่าง = ใช้ค่าตั้ง "ราคาส่ง OTA เพิ่มจากมาตรฐาน"
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChannelDetailDto } from "@/lib/modules/hotel/channel/mapping";
import { saveRateMapAction } from "@/lib/modules/hotel/actions";
import { BTN, CARD, INPUT } from "./channel-shared";

type Props = { unitSlug: string; connectionId: string; ratePlans: ChannelDetailDto["ratePlans"] };
type Row = { ext: string; pct: string };

export default function RateMapEditor({ unitSlug, connectionId, ratePlans }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(ratePlans.map((p) => [p.id, { ext: p.externalRateId ?? "", pct: p.markupBp === null ? "" : String(p.markupBp / 100) }])));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Record<string, string>>({});
  const save = async (ratePlanId: string) => {
    if (busy) return;
    const row = rows[ratePlanId] ?? { ext: "", pct: "" };
    const p = row.pct.trim();
    const n = p === "" ? null : Number(p);
    if (n !== null && !Number.isFinite(n)) {
      setMsg((m) => ({ ...m, [ratePlanId]: "ใส่เปอร์เซ็นต์เป็นตัวเลข (เช่น 15)" }));
      return;
    }
    setBusy(ratePlanId);
    try {
      const r = await saveRateMapAction(unitSlug, { connectionId, ratePlanId, externalRateId: row.ext.trim(), markupBp: n === null ? null : Math.round(n * 100) });
      setMsg((m) => ({ ...m, [ratePlanId]: r.ok ? "บันทึกแล้ว" : r.reason || "บันทึกไม่สำเร็จ" }));
      if (r.ok) router.refresh();
    } catch {
      setMsg((m) => ({ ...m, [ratePlanId]: "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" }));
    } finally {
      setBusy("");
    }
  };
  return (
    <section className={CARD} aria-label="แม็ปแผนราคา">
      <header>
        <h2 className="text-base font-bold">แผนราคาและ markup</h2>
        <p className="text-sm text-[color:var(--color-muted)]">ราคาส่งช่องทาง = ราคาแผน × (1 + markup) · เว้น markup ว่าง = ใช้ค่าตั้งของร้าน · เว้นรหัสว่าง = ไม่ส่งแผนนี้</p>
      </header>
      <ul className="flex flex-col divide-y divide-[color:var(--color-line)]">
        {ratePlans.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-32 flex-1 text-sm">
              <b>{p.name}</b> <span className="text-xs text-[color:var(--color-muted)]">{p.code}{p.otaVisible ? "" : " · ยังไม่เปิดให้ช่องทาง OTA เห็น"}</span>
            </span>
            <input
              className={`${INPUT} max-w-36`}
              aria-label={`รหัสแผนของช่องทาง ${p.name}`}
              value={rows[p.id]?.ext ?? ""}
              maxLength={64}
              placeholder="รหัสแผน"
              onChange={(e) => setRows((v) => ({ ...v, [p.id]: { ...(v[p.id] ?? { ext: "", pct: "" }), ext: e.target.value } }))}
            />
            <input
              className={`${INPUT} max-w-24`}
              aria-label={`markup % ${p.name}`}
              inputMode="decimal"
              value={rows[p.id]?.pct ?? ""}
              placeholder="ค่าตั้ง"
              onChange={(e) => setRows((v) => ({ ...v, [p.id]: { ...(v[p.id] ?? { ext: "", pct: "" }), pct: e.target.value } }))}
            />
            <span className="text-sm">%</span>
            <button type="button" className={BTN} disabled={busy !== ""} onClick={() => save(p.id)}>
              {busy === p.id ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            {msg[p.id] && <span className="w-full text-xs text-[color:var(--color-muted)]">{msg[p.id]}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
