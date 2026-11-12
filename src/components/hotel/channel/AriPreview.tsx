"use client";
// SVC H.10 ▸ ทดสอบส่ง ARI 7 วัน (dry-run · ใบสั่ง h.10 §2 ข้อ 7) — แสดง payload ที่จะส่ง: ห้องว่าง (หลังกันห้อง) · ราคาส่งช่องทาง · ปิดขาย
//   ไม่เรียกตัวต่อ · มือถือ 390: ตารางอยู่ในกรอบเลื่อนแนวนอน (data-scroll-hint)
import { useState } from "react";
import type { AriPayload } from "@/lib/modules/hotel/channel/types";
import { previewAriAction } from "@/lib/modules/hotel/actions";
import { BTN_PRIMARY, CARD, baht, thDay } from "./channel-shared";

type Props = { unitSlug: string; connectionId: string };

export default function AriPreview({ unitSlug, connectionId }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ari, setAri] = useState<AriPayload | null>(null);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await previewAriAction(unitSlug, { connectionId });
      if (r.ok && r.payload) setAri(r.payload);
      else setErr(r.reason || "สร้างตัวอย่างไม่สำเร็จ");
    } catch {
      setErr("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  const dates = ari ? Object.keys(ari.byDate).sort() : [];
  const rooms = ari ? [...new Set(dates.flatMap((d) => Object.keys(ari.byDate[d] ?? {})))].sort() : [];
  return (
    <section className={CARD} aria-label="ทดสอบส่ง ARI">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">ทดสอบส่ง ARI 7 วัน</h2>
          <p className="text-sm text-[color:var(--color-muted)]">ดูราคา/ห้องว่างที่ระบบจะส่งให้ช่องทาง (ยังไม่ส่งจริง) · ระบบส่งเองเมื่อราคา/การจองเปลี่ยน</p>
        </div>
        <button type="button" className={BTN_PRIMARY} onClick={run} disabled={busy}>
          {busy ? "กำลังคำนวณ…" : "ทดสอบส่ง ARI 7 วัน"}
        </button>
      </header>
      {err && (
        <p role="alert" className="text-sm text-red-700">
          {err}
        </p>
      )}
      {ari && (rooms.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีห้องที่แม็ปกับช่องทางนี้</p>
      ) : (
        <div className="overflow-x-auto" data-scroll-hint="เลื่อนซ้ายขวาเพื่อดูทั้งตาราง">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="px-2 py-1">ห้อง (ช่องทาง)</th>
                {dates.map((d) => (
                  <th key={d} className="px-2 py-1 whitespace-nowrap">
                    {thDay(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((ext) => (
                <tr key={ext} className="border-t border-[color:var(--color-line)] align-top">
                  <td className="px-2 py-1 font-semibold">{ext}</td>
                  {dates.map((d) => {
                    const c = ari.byDate[d]?.[ext];
                    if (!c) return <td key={d} className="px-2 py-1 text-[color:var(--color-muted)]">-</td>;
                    return (
                      <td key={d} className="px-2 py-1 whitespace-nowrap" data-ari-cell={`${d}|${ext}`}>
                        <div className={c.stopSell ? "text-red-700" : ""}>{c.stopSell ? "ปิดขาย" : `ว่าง ${c.available}`}</div>
                        {Object.entries(c.rates).map(([rate, v]) => (
                          <div key={rate} className="text-xs text-[color:var(--color-muted)]">
                            {rate} ฿{baht(v.priceSatang)}
                            {v.minNights ? ` · ขั้นต่ำ ${v.minNights} คืน` : ""}
                            {v.closedToArrival ? " · ปิดรับเช็กอิน" : ""}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
