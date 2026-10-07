"use client";

// RegisterDialog.tsx — โครงกล่องโต้ตอบของหน้าขายใหม่ (POS P1.3): ม่าน + ตำแหน่ง
//   จอ ≥ md = กล่องกลางจอ (กว้าง 420 · มุม 22 · padding 28 — สเปก §4.6) · จอ < md = แผ่นล่าง (มุมบน 16 · ขีดจับ — _base.part .sheet)
//   ตัวกล่อง (พร้อม data-testid ของมันเอง) เขียนในไฟล์ของแต่ละกล่อง แล้วส่งเป็น children — testid ต้องเป็นตัวอักษรตรงบนแท็ก (G1)
// 🔴 ปิดด้วย Esc อยู่ที่ตัวจับแป้นเดียวของ RegisterScreen (สเปก §3.6 — ปิดชั้นบนสุดก่อน) · ที่นี่ปิดได้แค่แตะม่าน
// 🔴 locked = กำลังส่งบิล/ผลยังไม่แน่ใจ — แตะม่านไม่ปิด (สเปก §3.4 ข้อ 3, 6)
// P1.2 U R2: bare = ม่านใส ไม่จัดกลาง (ป๊อปโอเวอร์ตัวเลือกวางตำแหน่งเองด้วย fixed — ภาพ 01 ไม่มีม่านทึบ) · แตะนอกกล่องยังปิดได้ · กักโฟกัสเหมือนเดิม

import { useEffect, useRef } from "react";

/** คลาสของตัวกล่อง — แผ่นล่างบนมือถือ / กลางจอบน md+ (ใช้ในทุกไฟล์กล่อง) */
export const REG_DIALOG_PANEL =
  "relative flex max-h-[88dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[color:var(--color-surface)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 shadow-xl md:w-[420px] md:max-w-[calc(100vw-32px)] md:rounded-[22px] md:p-7";

/** ขีดจับของแผ่นล่าง (มือถือเท่านั้น) — 38×4 มุม 2 */
export function SheetGrab() {
  return <span aria-hidden className="mx-auto mb-1 mt-0.5 block h-1 w-[38px] shrink-0 rounded-[2px] bg-[color:var(--color-line)] md:hidden" />;
}

// B2.2 S2: กล่องบนสุดกักโฟกัสไว้ข้างใน — ของหลังม่านในจอขาย inert (RegisterScreen) · ส่วนนอกจอขาย (แถบบน/ราง) กันด้วยตัวกักนี้
//   ชั้นที่ไม่ใช่บนสุดอยู่ใต้ [inert] ⇒ ตัวกักของมันหยุดทำงานเอง (ตัวบนสุดเป็นเจ้าของโฟกัสคนเดียว)
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function RegisterDialog({ onDismiss, locked = false, bare = false, children }: { onDismiss: () => void; locked?: boolean; bare?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const covered = () => !!el.closest("[inert]");
    const targets = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.getClientRects().length > 0);
    // ดึงกลับมาที่ตัวม่าน (ไม่ใช่ช่องกรอกตัวแรก) — จอสัมผัสจะได้ไม่เด้งคีย์บอร์ด · Tab ถัดไปเข้าปุ่ม/ช่องแรกของกล่อง
    const pull = () => el.focus({ preventScroll: true });
    // ลูกโฟกัสตัวเองแล้ว (autoFocus / ref.focus ใน effect ของลูกทำงานก่อนของพ่อ) = ไม่ยุ่ง
    if (!covered() && !el.contains(document.activeElement)) pull();
    const onFocusIn = (e: FocusEvent) => {
      if (!covered() && e.target instanceof Node && !el.contains(e.target)) pull();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || covered()) return;
      const list = targets();
      const active = document.activeElement;
      if (!list.length) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey ? active === first || active === el || !el.contains(active) : active === last || !el.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div
      ref={ref}
      data-testid="pos-reg-scrim"
      tabIndex={-1}
      className={bare ? "fixed inset-0 z-50 outline-none" : "fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/30 outline-none md:items-center md:p-4"}
      onClick={(e) => {
        // แตะที่ม่านเท่านั้น (ไม่ใช่ในกล่อง) — ไม่ต้อง stopPropagation ในกล่อง
        if (e.target === e.currentTarget && !locked) onDismiss();
      }}
    >
      {children}
    </div>
  );
}
