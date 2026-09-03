// ตัวกรองมาตรฐานหน้ารายการ (DESIGN-SPEC-V2 §1, §5.2) — GET form กรองฝั่ง server ล้วน (ไม่มี client JS)
// ช่วงวันที่ preset (เดือนนี้/ไตรมาสนี้/ปีนี้/กำหนดเอง) · ผู้ติดต่อ · ค้นหา · "ค้นหาขั้นสูง" (เผยด้วย <details> ไม่ใช้ JS)
// "คืนค่าเริ่มต้น" = ลิงก์กลับไป pathname เปล่า

export type DateRangePreset = "this_month" | "this_quarter" | "this_year" | "custom";

export type ContactOption = { id: string; name: string };

export type ListFiltersValue = {
  preset?: DateRangePreset;
  from?: string; // ISO yyyy-mm-dd
  to?: string;
  contactId?: string;
  q?: string;
  tags?: string;
  creator?: string;
  amountMin?: string;
  amountMax?: string;
};

const PRESET_LABEL: Record<DateRangePreset, string> = {
  this_month: "เดือนนี้",
  this_quarter: "ไตรมาสนี้",
  this_year: "ปีนี้",
  custom: "กำหนดเอง",
};

export function ListFilters({
  action,
  value,
  contacts,
  resetHref,
  testId,
  hiddenFields,
}: {
  action: string; // GET target (pathname เดิม)
  value: ListFiltersValue;
  contacts: ContactOption[];
  resetHref: string;
  testId?: string;
  hiddenFields?: Record<string, string>;
}) {
  const preset = value.preset ?? "this_year";
  const advancedOpen = Boolean(value.tags || value.creator || value.amountMin || value.amountMax);

  return (
    <form action={action} method="GET" className="flex flex-col gap-2" data-testid={testId}>
      {hiddenFields &&
        Object.entries(hiddenFields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 rounded-lg border px-2 text-sm">
          <span aria-hidden>📅</span>
          <span className="sr-only">ช่วงวันที่</span>
          <select name="preset" defaultValue={preset} className="border-0 bg-transparent py-2 pr-1 outline-none" data-testid="filter-preset">
            {(Object.keys(PRESET_LABEL) as DateRangePreset[]).map((p) => (
              <option key={p} value={p}>
                {PRESET_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        {preset === "custom" && (
          <>
            <label className="flex items-center gap-1 text-sm">
              <span className="sr-only">วันที่เริ่ม</span>
              <input type="date" name="from" defaultValue={value.from} className="input w-auto" />
            </label>
            <label className="flex items-center gap-1 text-sm">
              <span className="sr-only">ถึงวันที่</span>
              <input type="date" name="to" defaultValue={value.to} className="input w-auto" />
            </label>
          </>
        )}

        <label className="flex items-center gap-1.5 rounded-lg border px-2 text-sm">
          <span aria-hidden>👤</span>
          <span className="sr-only">ผู้ติดต่อ</span>
          <select name="contactId" defaultValue={value.contactId ?? ""} className="border-0 bg-transparent py-2 pr-1 outline-none">
            <option value="">ผู้ติดต่อ: ทั้งหมด</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="relative min-w-[220px] flex-1">
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-muted)]">
            🔍
          </span>
          <input
            type="search"
            name="q"
            defaultValue={value.q}
            placeholder="ค้นหาด้วยชื่อ, เลขที่"
            className="input pl-8"
            data-testid="filter-search"
          />
        </div>

        <button type="submit" className="btn-sm">
          ค้นหา
        </button>

        <a href={resetHref} className="ml-auto text-sm underline text-[color:var(--color-muted)]">
          คืนค่าเริ่มต้น
        </a>
      </div>

      <details open={advancedOpen} className="text-sm">
        <summary className="btn-sm w-fit list-none">🔻 ค้นหาขั้นสูง</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            แท็ก
            <input name="tags" defaultValue={value.tags} className="input" placeholder="เช่น ทริปดำน้ำ" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ผู้สร้าง
            <input name="creator" defaultValue={value.creator} className="input" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ยอดตั้งแต่
            <input name="amountMin" defaultValue={value.amountMin} inputMode="decimal" className="input" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ถึงยอด
            <input name="amountMax" defaultValue={value.amountMax} inputMode="decimal" className="input" />
          </label>
        </div>
      </details>
    </form>
  );
}

export default ListFilters;
