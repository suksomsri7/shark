"use client";

// RegisterDialog.tsx — โครงกล่องโต้ตอบของหน้าขายใหม่ (POS P1.3): ม่าน + ตำแหน่ง
//   จอ ≥ md = กล่องกลางจอ (กว้าง 420 · มุม 22 · padding 28 — สเปก §4.6) · จอ < md = แผ่นล่าง (มุมบน 16 · ขีดจับ — _base.part .sheet)
//   ตัวกล่อง (พร้อม data-testid ของมันเอง) เขียนในไฟล์ของแต่ละกล่อง แล้วส่งเป็น children — testid ต้องเป็นตัวอักษรตรงบนแท็ก (G1)
// 🔴 ปิดด้วย Esc อยู่ที่ตัวจับแป้นเดียวของ RegisterScreen (สเปก §3.6 — ปิดชั้นบนสุดก่อน) · ที่นี่ปิดได้แค่แตะม่าน
// 🔴 locked = กำลังส่งบิล/ผลยังไม่แน่ใจ — แตะม่านไม่ปิด (สเปก §3.4 ข้อ 3, 6)

/** คลาสของตัวกล่อง — แผ่นล่างบนมือถือ / กลางจอบน md+ (ใช้ในทุกไฟล์กล่อง) */
export const REG_DIALOG_PANEL =
  "relative flex max-h-[88dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[color:var(--color-surface)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 shadow-xl md:w-[420px] md:max-w-[calc(100vw-32px)] md:rounded-[22px] md:p-7";

/** ขีดจับของแผ่นล่าง (มือถือเท่านั้น) — 38×4 มุม 2 */
export function SheetGrab() {
  return <span aria-hidden className="mx-auto mb-1 mt-0.5 block h-1 w-[38px] shrink-0 rounded-[2px] bg-[color:var(--color-line)] md:hidden" />;
}

export function RegisterDialog({ onDismiss, locked = false, children }: { onDismiss: () => void; locked?: boolean; children: React.ReactNode }) {
  return (
    <div
      data-testid="pos-reg-scrim"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/30 md:items-center md:p-4"
      onClick={(e) => {
        // แตะที่ม่านเท่านั้น (ไม่ใช่ในกล่อง) — ไม่ต้อง stopPropagation ในกล่อง
        if (e.target === e.currentTarget && !locked) onDismiss();
      }}
    >
      {children}
    </div>
  );
}
