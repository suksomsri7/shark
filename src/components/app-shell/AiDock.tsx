"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AiChat } from "./AiChat";

// แผงผู้ช่วย AI (bottom-sheet) — B3: **ไม่มีปุ่มลอยมุมขวาล่างแล้ว**
//
// เจ้าของเคาะ 6 ก.ย. (T7 · แบบ §5): orb ของ SHARK AI ย้ายขึ้นไปอยู่มุมขวาบนคู่กับ "แจ้งปัญหาการใช้งาน"
// ⇒ มุมล่างขวาว่างสนิท (เดิม orb `fixed` ทับปุ่มส่งของกล่องพิมพ์แชท จนต้องมี hideOnMobile คอยหลบ)
//
// 🔴 สัญญาข้ามคอมโพเนนต์: Topbar ยิง CustomEvent `app:ai-open` → แผงนี้เปิด
//    (ไม่ยก state ขึ้น AppShell เพราะแผงนี้ไม่มีใครอื่นต้องรู้ว่าเปิดอยู่ · แพตเทิร์นเดียวกับ `app:drawer-open`)
// ไม่แสดงระหว่าง onboarding (/app/dna) — ยังไม่ถึงเวลาแนะนำผู้ช่วย
export function AiDock() {
  const [open, setOpen] = useState(false);
  // POS P3.9U ▸ CD-P39U-2: ข้อความตั้งต้น (ไม่บังคับ) จาก detail.prompt ของ app:ai-open — ไม่มี detail = null (ล้างค่าที่ค้างจากครั้งก่อน) = พฤติกรรมเดิมทุกประการ ◂
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const onOpen = (e: Event) => {
      // POS P3.9U ▸ CD-P39U-2: อ่าน detail.prompt (สตริงไม่ว่าง ≤ 4000 ตัว) — n เพิ่มทุกครั้งให้แผงที่เปิดอยู่แล้วรับข้อความใหม่ได้ ◂
      const p = (e as CustomEvent<{ prompt?: unknown } | null>).detail?.prompt;
      setSeed((s) => (typeof p === "string" && p.trim() ? { text: p.trim().slice(0, 4000), n: (s?.n ?? 0) + 1 } : null));
      setOpen(true);
    };
    window.addEventListener("app:ai-open", onOpen);
    return () => window.removeEventListener("app:ai-open", onOpen);
  }, []);

  if (pathname?.startsWith("/app/dna")) return null;
  if (!open) return null;

  return (
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
        <AiChat seed={seed} /* POS P3.9U ▸ CD-P39U-2 ◂ */ />
      </div>
    </div>
  );
}
