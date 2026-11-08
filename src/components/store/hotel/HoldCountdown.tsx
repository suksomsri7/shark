"use client";
// SVC H.8 ▸ นับถอยหลังถือห้อง (ภาพ 16 ข "ถือห้องไว้ 14:32") — หมดเวลาแล้วรีเฟรชหน้า (เซิร์ฟเวอร์ตัดสินสถานะจริง)
//   r4 (hydration #418): HTML จากเซิร์ฟเวอร์ = ป้ายคงที่ที่เซิร์ฟเวอร์คำนวณ ("ถือห้องไว้ถึง 14:32" · props.untilLabel) — ไม่อ่านนาฬิกาตอนเรนเดอร์
//   นาฬิกาอ่านเฉพาะใน useEffect หลัง mount ⇒ เรนเดอร์แรกฝั่งไคลเอนต์ตรงกับเซิร์ฟเวอร์ทุกไบต์ แล้วค่อยเปลี่ยนเป็นนับถอยหลัง
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
};

export function HoldCountdown(props: { expiresAt: string; untilLabel: string; template: string; expiredLabel: string }) {
  const router = useRouter();
  const end = Date.parse(props.expiresAt);
  /** null = ยังไม่ mount (เรนเดอร์ป้ายคงที่จากเซิร์ฟเวอร์) */
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const l = end - Date.now();
      setLeft(l);
      return l;
    };
    if (tick() <= 0) {
      router.refresh();
      return;
    }
    const t = setInterval(() => {
      if (tick() <= 0) {
        clearInterval(t);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [end, router]);
  const label = left === null ? props.untilLabel : left > 0 ? props.template.replace("{time}", fmt(left)) : props.expiredLabel;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[color:var(--color-accent)]" data-hold-countdown="">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {label}
    </span>
  );
}
