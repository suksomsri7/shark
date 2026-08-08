"use client";

import { useState, useTransition } from "react";
import { setWeeklyReportAction } from "@/lib/ai/credit-actions";

// สวิตช์ของ "งานที่ระบบทำเองแล้วหักเครดิต"
// กติกา: ปิดไว้ก่อนเสมอ + บอกราคาโดยประมาณข้าง ๆ สวิตช์ ไม่ให้เจ้าของร้านเซอร์ไพรส์กับบิล
export function AiAutoSettings({
  weeklyReportEnabled,
  isOwner,
}: {
  weeklyReportEnabled: boolean;
  isOwner: boolean;
}) {
  const [on, setOn] = useState(weeklyReportEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setError(null);
    setOn(next); // optimistic — ล้มแล้วค่อยดีดกลับ
    startTransition(async () => {
      const res = await setWeeklyReportAction(next);
      if (!res.ok) {
        setOn(!next);
        setError(res.message);
      }
    });
  }

  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">งานที่ระบบทำให้อัตโนมัติ</h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          งานพวกนี้ใช้เครดิตเหมือนการคุยกับผู้ช่วย — ปิดไว้ให้ตั้งแต่แรก เปิดเมื่อคุณต้องการเท่านั้น
        </p>
      </div>

      <div className="flex items-start justify-between gap-3 border-t pt-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">รายงานธุรกิจรายสัปดาห์</span>
          <span className="text-xs text-[color:var(--color-muted)]">
            ทุกเช้าวันจันทร์ ผู้ช่วยสรุปยอดขาย แนวโน้ม จุดเสี่ยง และคำแนะนำ ส่งเข้าศูนย์แจ้งเตือน
          </span>
          <span className="text-xs text-[color:var(--color-muted)]">
            ประมาณ <span className="tabular-nums">$0.01–0.02</span> ต่อครั้ง (~2 บาท/เดือน)
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="รายงานธุรกิจรายสัปดาห์"
          disabled={pending || !isOwner}
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            on ? "bg-[color:var(--color-accent)]" : "bg-[color:var(--color-border)]"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
              on ? "left-6" : "left-1"
            }`}
          />
        </button>
      </div>

      {!isOwner && (
        <p className="text-xs text-[color:var(--color-muted)]">เฉพาะเจ้าของกิจการเท่านั้นที่เปลี่ยนได้</p>
      )}
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
    </section>
  );
}

export default AiAutoSettings;
