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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)]"
        >
          {/* ไอคอนหูฟัง support ตาม ref เจ้าของ: บับเบิลแชททึบ 3 จุดขาว + คาดหูฟัง + ก้านไมค์ — สีดำ ไม่มีวงกรอบ */}
          <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.2 12.5a7.8 7.8 0 0 1 15.6 0" />
            <rect x="1.8" y="11.2" width="3.6" height="6.4" rx="1.8" fill="currentColor" stroke="none" />
            <rect x="18.6" y="11.2" width="3.6" height="6.4" rx="1.8" fill="currentColor" stroke="none" />
            <path
              d="M12 6.6c-3.1 0-5.6 2.2-5.6 4.9 0 1.5.75 2.85 1.95 3.75l-.55 2.35 2.6-1.15c.5.1 1.05.15 1.6.15 3.1 0 5.6-2.2 5.6-5S15.1 6.6 12 6.6z"
              fill="currentColor"
              stroke="none"
            />
            <circle cx="9.4" cy="11.5" r="0.95" fill="var(--color-surface)" stroke="none" />
            <circle cx="12" cy="11.5" r="0.95" fill="var(--color-surface)" stroke="none" />
            <circle cx="14.6" cy="11.5" r="0.95" fill="var(--color-surface)" stroke="none" />
            <path d="M20.4 17.6v.3a2.5 2.5 0 0 1-2.5 2.5h-2.4" />
            <circle cx="14.4" cy="20.4" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>
    </header>
  );
}
