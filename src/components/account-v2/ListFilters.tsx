"use client";

// ตัวกรองมาตรฐานหน้ารายการ (DESIGN-SPEC-V2 §1, §5.2) — GET form กรองฝั่ง server
// เดสก์ท็อป (f3): แถวเดียว [ช่วงวันที่][ผู้ติดต่อ][ค้นหา][ค้นหา ปุ่ม] …… [▽ ตัวกรองเพิ่มเติม][คืนค่าเริ่มต้น]
//   (ไอคอนเส้นจาก AccountIcon แทน emoji — ห้ามใช้ 📅👤🔍 ตาม UI_STANDARD)
// มือถือ (f13): แถวเดียว [ช่องค้นหา][ปุ่มกรวยเปิด sheet] — ช่วงวันที่/ผู้ติดต่อ/ตัวกรองเพิ่มเติมย้ายเข้า bottom sheet
// "use client" เพราะต้องสลับ layout ตามความกว้างจอ (isMobile) + เปิด/ปิด sheet — ฟอร์มยังเป็น GET ธรรมดา
// (ค่าที่กรอกในทั้งสอง layout ไม่ชนกัน เพราะ render แค่ชุดเดียวต่อครั้ง ไม่ใช่ซ่อนด้วย CSS — กัน input ชื่อซ้ำส่งค่าซ้อนกัน)
import { useEffect, useState } from "react";
import { AccountIcon } from "./AccountIcon";
import { SlideOver } from "./SlideOver";

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

  const [isMobile, setIsMobile] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const presetField = (
    <label className="flex items-center gap-1.5 rounded-lg border px-2 text-sm">
      <AccountIcon name="calendar" className="h-4 w-4 text-[color:var(--color-muted)]" />
      <span className="sr-only">ช่วงวันที่</span>
      <select
        name="preset"
        defaultValue={preset}
        className="border-0 bg-transparent py-2 pr-1 outline-none"
        data-testid="filter-preset"
      >
        {(Object.keys(PRESET_LABEL) as DateRangePreset[]).map((p) => (
          <option key={p} value={p}>
            {PRESET_LABEL[p]}
          </option>
        ))}
      </select>
    </label>
  );

  const customDateFields = preset === "custom" && (
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
  );

  const contactField = (
    <label className="flex items-center gap-1.5 rounded-lg border px-2 text-sm">
      <AccountIcon name="user" className="h-4 w-4 text-[color:var(--color-muted)]" />
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
  );

  const advancedInner = (
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
  );

  return (
    <form action={action} method="GET" className="flex flex-col gap-2" data-testid={testId}>
      {hiddenFields &&
        Object.entries(hiddenFields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}

      {isMobile ? (
        // มือถือ (f13): ช่องค้นหา + ปุ่มกรวยเปิด sheet — ตัวกรองอื่นทั้งหมดอยู่ใน sheet
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <AccountIcon
              name="search"
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]"
            />
            <input
              type="search"
              name="q"
              defaultValue={value.q}
              placeholder="ค้นหาเลขที่ หรือชื่อลูกค้า"
              className="input pl-8"
              data-testid="filter-search"
            />
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="ตัวกรอง"
            data-testid="filter-open-sheet"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border"
            style={{ borderColor: "var(--color-line)" }}
          >
            <AccountIcon name="filter" className="h-4 w-4" />
          </button>

          <SlideOver
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="ตัวกรอง"
            testId="filter-sheet"
            actions={
              <button type="submit" className="btn btn-primary w-full" onClick={() => setSheetOpen(false)}>
                ใช้ตัวกรอง
              </button>
            }
          >
            <div className="flex flex-col gap-3">
              {presetField}
              {customDateFields}
              {contactField}
              <details open={advancedOpen} className="text-sm">
                <summary className="btn-sm w-fit list-none">▽ ตัวกรองเพิ่มเติม</summary>
                {advancedInner}
              </details>
              <a href={resetHref} className="text-sm underline text-[color:var(--color-muted)]">
                คืนค่าเริ่มต้น
              </a>
            </div>
          </SlideOver>
        </div>
      ) : (
        // เดสก์ท็อป (f3): แถวเดียว
        <div className="flex flex-wrap items-center gap-2">
          {presetField}
          {customDateFields}
          {contactField}

          <div className="relative min-w-[220px] flex-1">
            <AccountIcon
              name="search"
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]"
            />
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

          <details open={advancedOpen} className="ml-auto text-sm [&[open]]:basis-full">
            <summary className="btn-sm w-fit list-none">▽ ตัวกรองเพิ่มเติม</summary>
            {advancedInner}
          </details>

          <a href={resetHref} className="text-sm underline text-[color:var(--color-muted)]">
            คืนค่าเริ่มต้น
          </a>
        </div>
      )}
    </form>
  );
}

export default ListFilters;
