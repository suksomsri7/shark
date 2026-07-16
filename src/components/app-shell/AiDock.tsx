"use client";

import { useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";

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
        className="fixed bottom-4 right-4 z-40 h-14 w-14 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.2)] transition-transform hover:scale-105"
      >
        <Image src="/ai-orb.png" alt="" width={56} height={56} className="h-14 w-14" />
      </button>

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
            <div className="card text-center">
              <div className="text-sm font-medium">เร็ว ๆ นี้</div>
              <p className="mt-1 text-xs text-[color:var(--color-muted)]">
                ผู้ช่วย AI จะช่วยตอบลูกค้าและจัดการงานแทนคุณ กำลังจะเปิดให้ใช้เร็ว ๆ นี้
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
