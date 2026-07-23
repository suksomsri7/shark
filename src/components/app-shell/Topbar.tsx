"use client";

// แถบบนสุดติดตายตลอด (fixed) — ใช้ทุกจอ + เหมาะกับ webview
// ซ้าย: แฮมเบอร์เกอร์ (เปิด drawer เมนูระบบ) + ชื่อกิจการ
// help-v2: เอาปุ่มศูนย์ช่วยเหลือออก — แจ้งปัญหาผ่านแชท AI แทน (ทีมงานตอบกลับในห้องเดิม)
// ไม่มีเส้นขีดใต้ topbar — ใช้เงาบาง (shadow) แทน border ตามวิชันเจ้าของ

export function Topbar({ tenantName, onMenu }: { tenantName: string; onMenu: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 h-14 bg-[color:var(--color-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex h-full items-center gap-2 px-3 sm:px-4">
        {/* ซ้าย: แฮมเบอร์เกอร์ + ชื่อกิจการ */}
        <button
          type="button"
          onClick={onMenu}
          aria-label="เมนูระบบ"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl leading-none hover:bg-[color:var(--color-surface-2)]"
        >
          ☰
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{tenantName}</div>
        </div>
      </div>
    </header>
  );
}
