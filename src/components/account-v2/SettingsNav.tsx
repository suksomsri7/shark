import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { settingsGroups } from "@/lib/modules/account/settings-nav";

// เมนูซ้ายของหน้าตั้งค่า (f10-settings.png): การ์ดเดียว w-280 · หัวข้อที่เปิดอยู่กาง sub-item ให้เห็น
// · หัวข้อย่อยที่เลือกอยู่ = แถบซ้ายสีเข้ม + พื้นเทาอ่อน + ตัวหนา · หัวข้อที่ยังไม่ทำ = จาง + "เร็ว ๆ นี้"
// เป็น server component ล้วน (ลิงก์ธรรมดา) — สถานะ "เปิดอยู่" มาจาก URL ไม่ใช่ state ในเบราว์เซอร์
export function SettingsNav({
  base,
  activeGroup,
  activeSub,
}: {
  base: string;
  /** คีย์หัวข้อหลักที่เปิดอยู่ ("org" | "doc" | …) */
  activeGroup: string;
  /** คีย์หัวข้อย่อยที่เลือกอยู่ */
  activeSub?: string;
}) {
  const groups = settingsGroups(base);
  return (
    <nav
      data-testid="settings-nav"
      className="card flex w-full shrink-0 flex-col divide-y p-0 md:w-[280px]"
      aria-label="หมวดตั้งค่า"
    >
      {groups.map((g) => {
        // f10: หมวดที่มีหัวข้อย่อย (ข้อมูลกิจการ · เอกสารและเลขที่) กางให้เห็นทั้งคู่เสมอ
        // — ผู้ใช้ต้องมองเห็นว่าตั้งค่าอะไรได้บ้างโดยไม่ต้องกดไล่ทีละหมวด
        // WO 8.2: "นโยบายบัญชี" มี 12 หัวข้อย่อย ⇒ กางเฉพาะตอนอยู่ในหมวดนั้น
        //          (ถ้ากางตลอดเวลา เมนูซ้ายจะยาวเกินจอและไม่ตรง f10 อีกต่อไป)
        const open = g.items.length > 0 && (g.key === "org" || g.key === "doc" || g.key === activeGroup);
        const head = (
          <span className="flex w-full items-center justify-between px-4 py-3.5">
            <span className="text-sm font-medium">{g.label}</span>
            <span className="flex items-center text-[color:var(--color-muted)]">
              <AccountIcon name={open ? "chevron-down" : "chevron-right"} className="h-4 w-4" />
            </span>
          </span>
        );
        return (
          <div key={g.key} data-testid={`settings-nav-${g.key}`}>
            {g.soon ? (
              // ยังไม่มีหน้า (WO 8.2/8.3) — แสดงเหมือน f10 (ตัวอักษรปกติ ไม่มีป้าย) แต่กดไม่ได้
              <span className="flex cursor-default" aria-disabled title="กำลังพัฒนา">
                {head}
              </span>
            ) : (
              <Link href={g.path} className="flex hover:bg-[color:var(--color-surface-2)]">
                {head}
              </Link>
            )}
            {open && (
              <div className="pb-2">
                {g.items.map((it) => {
                  const on = it.sub === activeSub;
                  // หัวข้อย่อยที่ยังไม่ทำ (Smart Insight 🕓) — จาง กดไม่ได้ + ป้าย "เร็ว ๆ นี้"
                  if (it.soon)
                    return (
                      <span
                        key={it.key}
                        data-testid={`settings-sub-${it.key}`}
                        aria-disabled
                        className="flex cursor-default items-center gap-2 border-l-2 border-transparent py-2.5 pl-6 pr-4 text-sm text-[color:var(--color-muted)] opacity-60"
                      >
                        {it.label}
                        <span className="rounded-md border px-1.5 py-0.5 text-[11px]">เร็ว ๆ นี้</span>
                      </span>
                    );
                  return (
                    <Link
                      key={it.key}
                      href={it.sub ? `${it.path}?s=${it.sub}` : it.path}
                      data-testid={`settings-sub-${it.key}`}
                      aria-current={on ? "page" : undefined}
                      className={`flex border-l-2 py-2.5 pl-6 pr-4 text-sm ${
                        on
                          ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] font-medium text-[color:var(--color-ink)]"
                          : "border-transparent text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
                      }`}
                    >
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default SettingsNav;
