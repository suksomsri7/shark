"use client";

// MobileCartSheet.tsx — แผ่นตะกร้าเต็ม บนมือถือ (C · ไม่มีภาพออกแบบ — สเปก §2.4 ประกอบจากแผงตะกร้าของภาพ 01 ในแพตเทิร์น .sheet ของ _base.part)
//   ติดล่าง มุมบน 16 · เงาขึ้น · ขีดจับ 38×4 · สูงสุด 85dvh · ม่านหมึก 30% · ปิด: ✕ / แตะม่าน / Esc (RegisterScreen)
//   ข้างในคือ CartPanel variant "sheet" ตัวเดียวกับเดสก์ท็อป (testid ไม่ซ้ำ: เมาท์แผงตะกร้าได้ทีละที่ — RegisterScreen ตัดสินด้วย media query)
// 🔴 ลากลงเพื่อปิด = ยังไม่ทำ (ปุ่ม ✕ ขนาด 44 + แตะม่าน แทน) — บันทึกเป็นส่วนต่างในโน้ต B2

import { RegisterDialog, SheetGrab } from "./RegisterDialog";

export function MobileCartSheet({ onClose, locked, children }: { onClose: () => void; locked: boolean; children: React.ReactNode }) {
  return (
    <RegisterDialog onDismiss={onClose} locked={locked}>
      <div
        data-testid="pos-reg-cart-sheet"
        className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--color-surface)] pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-8px_30px_color-mix(in_srgb,var(--color-ink)_20%,transparent)]"
        role="dialog"
        aria-modal="true"
      >
        <SheetGrab />
        {children}
      </div>
    </RegisterDialog>
  );
}
