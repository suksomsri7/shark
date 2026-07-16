"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyAction } from "@/lib/dna/actions";

// ปุ่ม "ประกอบระบบให้เลย" — เรียก applyAction แล้วพาไปหน้าหลักเมื่อสำเร็จ
export function DnaApplyButton({ blueprintId }: { blueprintId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await applyAction(blueprintId);
      if (res.ok) {
        router.push("/app");
        router.refresh();
      } else {
        const failed = res.results.find((r) => !r.ok);
        setError(
          failed?.error
            ? `ประกอบไม่สำเร็จที่ขั้นตอนที่ ${failed.step + 1}: ${failed.error}`
            : "ประกอบระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="btn btn-primary min-h-[52px] w-full text-base disabled:opacity-50"
      >
        {pending ? "กำลังประกอบระบบ…" : "🚀 ประกอบระบบให้เลย"}
      </button>
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
    </div>
  );
}

export default DnaApplyButton;
