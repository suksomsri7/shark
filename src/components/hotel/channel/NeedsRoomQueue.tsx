"use client";
// SVC H.10 ▸ คิว "ต้องจัดห้อง" (ใบสั่ง h.10 §0 · §4) — การจองจากช่องทางที่ลงปฏิทินไม่ได้ (ห้องเต็ม/ต้องจัดการเอง) · ไม่มีการจองซ้อน
//   (ก) ย้ายแขกอื่น/เปิดห้องที่ปฏิทินห้อง แล้วกด "ลองอีกครั้ง" · (ข) "ปฏิเสธ" พร้อมเหตุผล (แจ้งเจ้าของ · ช่องทางจริงส่งปฏิเสธกลับ = เฟสถัดไป)
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NeedsRoomItem } from "@/lib/modules/hotel/channel/inbound";
import { rejectInboundAction, retryInboundAction } from "@/lib/modules/hotel/actions";
import { BTN, BTN_PRIMARY, CARD, INPUT, thDay } from "./channel-shared";

type Props = { unitSlug: string; items: NeedsRoomItem[] };

export default function NeedsRoomQueue({ unitSlug, items }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState("");
  const [reason, setReason] = useState("");
  const retry = async (inboxId: string) => {
    if (busy) return;
    setBusy(inboxId);
    try {
      const r = await retryInboundAction(unitSlug, { inboxId });
      setMsg((m) => ({ ...m, [inboxId]: r.ok ? "ลงปฏิทินแล้ว" : r.reason || "ยังลงปฏิทินไม่ได้" }));
      router.refresh();
    } catch {
      setMsg((m) => ({ ...m, [inboxId]: "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" }));
    } finally {
      setBusy("");
    }
  };
  const reject = async (inboxId: string) => {
    if (busy || !reason.trim()) return;
    setBusy(inboxId);
    try {
      const r = await rejectInboundAction(unitSlug, { inboxId, reason: reason.trim() });
      setMsg((m) => ({ ...m, [inboxId]: r.ok ? "ปฏิเสธแล้ว" : r.reason || "ปฏิเสธไม่สำเร็จ" }));
      if (r.ok) {
        setRejecting("");
        setReason("");
        router.refresh();
      }
    } catch {
      setMsg((m) => ({ ...m, [inboxId]: "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" }));
    } finally {
      setBusy("");
    }
  };
  return (
    <section className={`${CARD} border-amber-300`} aria-label="ต้องจัดห้อง" data-needs-room-queue="">
      <header>
        <h2 className="text-base font-bold">ต้องจัดห้อง {items.length > 0 && <span className="text-amber-700">({items.length})</span>}</h2>
        <p className="text-sm text-[color:var(--color-muted)]">ห้องไม่พอสำหรับการจองจากช่องทางเหล่านี้ — ระบบไม่จองซ้อน · ย้ายแขก/เปิดห้องแล้วกดลองอีกครั้ง หรือปฏิเสธ</p>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ไม่มีรายการที่ต้องจัดห้อง</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[color:var(--color-line)]">
          {items.map((x) => (
            <li key={x.id} className="flex flex-col gap-2 py-3" data-needs-room={x.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {x.externalId} <span className="text-xs font-normal text-[color:var(--color-muted)]">ฉบับ {x.version} · {x.connectionLabel}</span>
                </span>
                <span className="text-sm">
                  {x.roomTypeName ?? x.externalRoomId ?? "-"} · {thDay(x.checkIn)} – {thDay(x.checkOut)} · {x.rooms} ห้อง
                </span>
              </div>
              <p className="text-sm">
                {x.guestName ?? "-"}
                {x.prepaid ? " · ชำระกับช่องทางแล้ว" : ""}
                {x.reasonTh ? <span className="block text-xs text-amber-800">{x.reasonTh}</span> : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} onClick={() => retry(x.id)}>
                  {busy === x.id ? "กำลังลอง…" : "ลองอีกครั้ง"}
                </button>
                <button type="button" className={BTN} disabled={busy !== ""} onClick={() => setRejecting(rejecting === x.id ? "" : x.id)}>
                  ปฏิเสธ
                </button>
                {x.checkIn && (
                  <Link className={BTN} href={`/app/u/${unitSlug}/hotel/calendar?from=${x.checkIn}`}>
                    เปิดปฏิทินห้อง ›
                  </Link>
                )}
              </div>
              {rejecting === x.id && (
                <div className="flex flex-wrap items-center gap-2">
                  <input className={`${INPUT} max-w-sm`} aria-label="เหตุผลที่ปฏิเสธ" placeholder="เหตุผล (เช่น ห้องเต็มทั้งคืน)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
                  <button type="button" className={BTN} disabled={busy !== "" || !reason.trim()} onClick={() => reject(x.id)}>
                    ยืนยันปฏิเสธ
                  </button>
                </div>
              )}
              {msg[x.id] && (
                <p role="status" className="text-xs text-[color:var(--color-muted)]">
                  {msg[x.id]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
