"use client";
// HR H2.4 ▸ การ์ดลงเวลาด้วยมือถือ (R8) — ยังไม่ติดตั้งบนหน้าใด (Q5: H2.10 วางในหน้า "ของฉัน" พร้อมภาพหน้าจอ 390)
//   อ่านตำแหน่งจากเครื่องเฉพาะตอนกดปุ่ม แล้วส่งให้ server action ตรวจ (ไม่เก็บ/ไม่แสดงพิกัดบนจอ) · บรรทัดแจ้งเรื่องการเก็บตำแหน่ง (Q11) ·
//   ข้อความทั้งหมดมาจาก src/messages hr.mobileClock ผ่าน prop `labels` (ผู้ติดตั้งส่งจาก getTranslations) ◂
import { useState, useTransition } from "react";
import { mobileClockAction } from "./clock-actions";

export type MobileClockLabels = {
  title: string;
  in: string;
  out: string;
  breakStart: string;
  breakEnd: string;
  locating: string;
  saving: string;
  done: string;
  notice: string;
  noGps: string;
  distance: string;
};
type Next = "IN" | "OUT" | "BREAK_END";

export default function MobileClock({ next, canBreak, labels }: { next: Next; canBreak: boolean; labels: MobileClockLabels }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mainLabel = next === "OUT" ? labels.out : next === "BREAK_END" ? labels.breakEnd : labels.in;

  const send = (kind: "NEXT" | "BREAK_START") => {
    setMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMsg({ ok: false, text: labels.noGps });
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("latitude", String(pos.coords.latitude));
        fd.set("longitude", String(pos.coords.longitude));
        fd.set("accuracy", String(Math.round(pos.coords.accuracy)));
        start(async () => {
          const r = await mobileClockAction(fd);
          setMsg(r.ok ? { ok: true, text: labels.done } : { ok: false, text: r.distanceM !== undefined ? `${r.reason} (${labels.distance} ${r.distanceM})` : r.reason });
        });
      },
      () => {
        setBusy(false);
        setMsg({ ok: false, text: labels.noGps });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const waiting = busy || pending;
  return (
    <div className="card flex flex-col gap-3 p-4" data-testid="hr-mobile-clock">
      <div className="text-base font-semibold">{labels.title}</div>
      <button type="button" disabled={waiting} onClick={() => send("NEXT")} className="btn btn-primary min-h-[52px] text-base disabled:opacity-50" data-testid="hr-mobile-clock-next">
        {busy ? labels.locating : pending ? labels.saving : mainLabel}
      </button>
      {canBreak && (
        <button type="button" disabled={waiting} onClick={() => send("BREAK_START")} className="btn btn-ghost min-h-[44px] text-sm disabled:opacity-50" data-testid="hr-mobile-clock-break">
          {labels.breakStart}
        </button>
      )}
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "" : "text-[color:var(--color-danger)]"}`} data-testid="hr-mobile-clock-message">
          {msg.text}
        </p>
      )}
      <p className="text-xs text-[color:var(--color-muted)]" data-testid="hr-mobile-clock-notice">
        {labels.notice}
      </p>
    </div>
  );
}
