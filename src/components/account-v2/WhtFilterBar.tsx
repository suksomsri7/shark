"use client";

// WhtFilterBar — แถวตัวกรองของหน้า WHT V2 (WO 5.4 · g11 ตรง ๆ)
// g11: [ปฏิทิน + วันที่ชำระ: ปีนี้ ▾] [🔍 ค้นหา…] [คืนค่าเริ่มต้น] — ไม่มีปุ่ม "ค้นหา" แยก
// (ไอคอนเส้นจาก AccountIcon เท่านั้น — ห้าม emoji ตาม UI_STANDARD/WO 0.4)
// select เปลี่ยนค่า = auto-submit ทันที (requestSubmit) · ช่องค้นหา = พิมพ์แล้วกด Enter (implicit submission
// ของฟอร์มที่มีช่อง text/search แค่ช่องเดียว — เบราว์เซอร์ submit ให้เองไม่ต้องมี JS เพิ่ม)
import { AccountIcon } from "./AccountIcon";

export function WhtFilterBar({
  pathname,
  tab,
  status,
  range,
  q,
  searchPlaceholder,
  resetHref,
}: {
  pathname: string;
  tab: string;
  status: string;
  range: string;
  q?: string;
  searchPlaceholder: string;
  resetHref: string;
}) {
  return (
    <form method="GET" action={pathname} className="flex flex-wrap items-center gap-2" data-testid="wht-filters">
      <input type="hidden" name="tab" value={tab} />
      {status !== "ALL" && <input type="hidden" name="status" value={status} />}
      <label className="flex items-center gap-1.5 rounded-lg border px-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
        <AccountIcon name="calendar" className="h-4 w-4 text-[color:var(--color-muted)]" />
        <span className="sr-only">วันที่ชำระ</span>
        <select
          name="range"
          defaultValue={range}
          className="border-0 bg-transparent py-2 pr-1 outline-none"
          data-testid="wht-range"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="this_year">วันที่ชำระ: ปีนี้</option>
          <option value="all">วันที่ชำระ: ทั้งหมด</option>
        </select>
      </label>
      <div className="relative w-[390px] max-w-full">
        <AccountIcon
          name="search"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]"
        />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={searchPlaceholder}
          className="input w-full pl-8"
          data-testid="wht-search"
        />
      </div>
      <a href={resetHref} className="text-sm underline" style={{ color: "var(--color-accent)" }} data-testid="wht-reset">
        คืนค่าเริ่มต้น
      </a>
    </form>
  );
}

export default WhtFilterBar;
