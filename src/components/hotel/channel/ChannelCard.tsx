"use client";
// SVC H.10 ▸ การ์ดตัวต่อช่องทาง OTA (หน้า /hotel/channels · ใบสั่ง h.10 §4) — สถานะ · ARI ล่าสุด · การจองเข้า 7 วัน · คิวต้องจัดห้อง · ปุ่มดึงการจองตอนนี้
//   รับ DTO ที่ไม่มีค่าลับผ่าน props เท่านั้น · ปุ่มเรียก server action (ตรวจ hotel.channel.manage ซ้ำฝั่งเซิร์ฟเวอร์)
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChannelConnectionDto } from "@/lib/modules/hotel/channel/mapping";
import { pullNowAction } from "@/lib/modules/hotel/actions";
import { BTN, CARD, CONN_STATUS_TH, JOB_STATUS_TH, thDay, thTime } from "./channel-shared";

type Props = { unitSlug: string; connection: ChannelConnectionDto };

export default function ChannelCard({ unitSlug, connection: c }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const pull = async () => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await pullNowAction(unitSlug);
      setMsg(r.ok ? `ดึงแล้ว · รับใหม่ ${r.received ?? 0} · ลงปฏิทิน ${r.applied ?? 0}` : r.reason || "ดึงการจองไม่สำเร็จ");
      router.refresh();
    } catch {
      setMsg("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  const bad = c.status === "ERROR";
  return (
    <article className={CARD} data-channel-card={c.id}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-base font-bold text-[color:var(--color-ink)]">{c.label}</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            {c.provider === "FAKE" ? "ผู้ให้บริการทดสอบ (FAKE)" : c.provider} · {c.allUnits ? "ทุกสาขา" : "สาขานี้"}
          </p>
        </div>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${bad ? "border-red-300 text-red-700" : ""}`}>{CONN_STATUS_TH[c.status] ?? c.status}</span>
      </header>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-[color:var(--color-muted)]">แม็ปห้อง / แผน</dt>
          <dd className="font-semibold">
            {c.mappedRooms} / {c.mappedRates}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[color:var(--color-muted)]">ส่ง ARI ล่าสุด</dt>
          <dd className="font-semibold">{c.lastAri ? `${JOB_STATUS_TH[c.lastAri.status] ?? c.lastAri.status} · ${thTime(c.lastAri.sentAt)}` : "ยังไม่เคยส่ง"}</dd>
          {c.lastAri && (
            <dd className="text-xs text-[color:var(--color-muted)]">
              {thDay(c.lastAri.dateFrom)} – {thDay(c.lastAri.dateTo)}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-xs text-[color:var(--color-muted)]">การจองเข้า 7 วัน</dt>
          <dd className="font-semibold">{c.inbound7d}</dd>
        </div>
        <div>
          <dt className="text-xs text-[color:var(--color-muted)]">ต้องจัดห้อง</dt>
          <dd className={`font-semibold ${c.needsRoom ? "text-amber-700" : ""}`}>{c.needsRoom}</dd>
        </div>
      </dl>
      {c.pendingJobs > 0 && <p className="text-xs text-[color:var(--color-muted)]">รอส่งราคา/ห้องว่าง {c.pendingJobs} งาน (ระบบส่งทุก 1 นาที)</p>}
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
      <footer className="flex flex-wrap gap-2">
        <Link href={`/app/u/${unitSlug}/hotel/channels/${c.id}`} className={BTN}>
          ตั้งค่าแม็ปห้อง/ราคา ›
        </Link>
        <button type="button" className={BTN} onClick={pull} disabled={busy || c.status === "DISABLED"}>
          {busy ? "กำลังดึง…" : "ดึงการจองตอนนี้"}
        </button>
      </footer>
    </article>
  );
}
