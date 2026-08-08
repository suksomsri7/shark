"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyStepAction } from "@/lib/dna/actions";

// ปุ่ม "ประกอบระบบให้เลย" + แถบความคืบหน้าจริง
// เดินทีละขั้น (applyStepAction) แล้ววาดแถบตามจำนวนขั้นที่สำเร็จ — ไม่ใช่แถบหลอกที่วิ่งเอง
// ขั้นที่ทำสำเร็จแล้วถูกบันทึกฝั่งเซิร์ฟเวอร์ (idempotent) → เน็ตหลุดแล้วกดใหม่ = ทำต่อจากเดิม ไม่เริ่มใหม่
export function DnaApplyButton({
  blueprintId,
  stepLabels,
}: {
  blueprintId: string;
  stepLabels: string[];
}) {
  const router = useRouter();
  const total = stepLabels.length;
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setRunning(true);
    // กันวนไม่จบถ้าเซิร์ฟเวอร์คืนค่าเพี้ยน — อย่างมากก็เท่าจำนวนขั้น +2
    for (let guard = 0; guard <= total + 2; guard++) {
      let progress;
      try {
        progress = await applyStepAction(blueprintId);
      } catch {
        // เน็ตหลุด/สลับแอประหว่างรอ — ขั้นที่ผ่านแล้วถูกบันทึกไว้ กดอีกครั้งเพื่อทำต่อ
        setError("การเชื่อมต่อหลุดระหว่างประกอบ — กด “ประกอบต่อ” เพื่อทำต่อจากขั้นที่ค้าง");
        setRunning(false);
        return;
      }
      setDone(progress.done);
      setCurrent(progress.stepIndex >= 0 ? (stepLabels[progress.stepIndex] ?? null) : null);

      if (!progress.ok) {
        setError(
          progress.error
            ? `ประกอบไม่สำเร็จที่ขั้นตอนที่ ${progress.stepIndex + 1}: ${progress.error}`
            : "ประกอบระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
        );
        setRunning(false);
        return;
      }
      if (progress.finished) {
        router.push("/app");
        router.refresh();
        return;
      }
    }
    setRunning(false);
    setError("ประกอบระบบไม่จบตามคาด — กดอีกครั้งเพื่อทำต่อ");
  }

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const started = running || done > 0;

  return (
    <div className="flex flex-col gap-2">
      {started && (
        <div className="card flex flex-col gap-2 py-3" aria-live="polite">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium">
              {running ? (current ?? "กำลังเริ่ม…") : "หยุดไว้ที่ขั้นนี้"}
            </span>
            <span className="shrink-0 tabular-nums text-xs text-[color:var(--color-muted)]">
              {done}/{total} ขั้น
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-2)]"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="ความคืบหน้าการประกอบระบบ"
          >
            <div
              className="h-full rounded-full bg-[color:var(--color-accent)] transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={run}
        disabled={running}
        className="btn btn-primary min-h-[52px] w-full text-base disabled:opacity-50"
      >
        {running
          ? `กำลังประกอบระบบ… ${percent}%`
          : done > 0
            ? "▶ ประกอบต่อ"
            : "🚀 ประกอบระบบให้เลย"}
      </button>
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
    </div>
  );
}

export default DnaApplyButton;
