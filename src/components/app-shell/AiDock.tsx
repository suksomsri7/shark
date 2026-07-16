"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AiChat } from "./AiChat";

// ปุ่มผู้ช่วย AI วงกลม ติดมุมขวาล่าง (fixed) — กดแล้วเปิด bottom-sheet placeholder
// ไม่แสดงระหว่าง onboarding (/app/dna) — ยังไม่ถึงเวลาแนะนำผู้ช่วย
// จัดตำแหน่งไม่ให้บังเนื้อหา: main มี padding-bottom เผื่อไว้แล้ว

export function AiDock() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (pathname?.startsWith("/app/dna")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="ผู้ช่วย AI"
        className="ai-orb fixed bottom-4 right-4 z-40 h-14 w-14 transition-transform hover:scale-105"
      />{/* ลูกแก้วน้ำเงินเรืองแสงหายใจ — ไม่มีพื้นดำ ไม่หมุน (feedback เจ้าของรอบ 3) */}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-[0_-4px_20px_rgba(0,0,0,0.12)] sm:max-w-md sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">ผู้ช่วย AI</h2>
                <p className="text-xs text-[color:var(--color-muted)]">ผู้ช่วยอัจฉริยะประจำกิจการของคุณ</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิด"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none hover:bg-[color:var(--color-surface-2)]"
              >
                ✕
              </button>
            </div>
            <AiChat />
          </div>
        </div>
      )}
    </>
  );
}
