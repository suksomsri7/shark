"use client";

// แถบบนสุดติดตายตลอด (fixed) — ใช้ทุกจอ + เหมาะกับ webview
// ซ้าย: แฮมเบอร์เกอร์ (เปิด drawer เมนูระบบ) + ชื่อกิจการ
// ขวา: ปุ่มวงกลม "?" เปิดศูนย์ช่วยเหลือ
// ไม่มีเส้นขีดใต้ topbar — ใช้เงาบาง (shadow) แทน border ตามวิชันเจ้าของ

export function Topbar({
  tenantName,
  onMenu,
  onHelp,
}: {
  tenantName: string;
  onMenu: () => void;
  onHelp: () => void;
}) {
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

        {/* ขวา: ศูนย์ช่วยเหลือ */}
        <button
          type="button"
          onClick={onHelp}
          aria-label="ศูนย์ช่วยเหลือ"
          title="ศูนย์ช่วยเหลือ"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)]"
        >
          {/* ไอคอนหูฟัง support (วิชันเจ้าของ) — บับเบิลแชท + หูฟัง + ไมค์ */}
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12a8 8 0 0 1 16 0" />
            <rect x="2.5" y="11" width="3.5" height="6" rx="1.6" fill="currentColor" stroke="none" />
            <rect x="18" y="11" width="3.5" height="6" rx="1.6" fill="currentColor" stroke="none" />
            <path d="M20 17v.6a2.4 2.4 0 0 1-2.4 2.4H14" />
            <circle cx="12.9" cy="20" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="9.2" cy="12.4" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12.4" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="14.8" cy="12.4" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>
    </header>
  );
}
