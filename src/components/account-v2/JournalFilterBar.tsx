"use client";

// JournalFilterBar — แถวตัวกรองของหน้าบัญชีรายวัน (WO 6.2 · เฟรม g16-journal.png)
//
// g16: [📅 ช่วงวันที่: เดือนนี้ ▾] [▤ สมุด: ทั้งหมด ▾] [🔍 ค้นหาเลขที่ JV, คำอธิบาย] — บรรทัดเดียวที่ 1440
// (ไอคอนเส้นจาก AccountIcon เท่านั้น — ห้าม emoji ตาม UI_STANDARD/WO 0.4)
//
// 🔴 ไม่มีปุ่ม "แสดง" — เปลี่ยนค่าอะไรก็ยิงฟอร์มทันที (`requestSubmit`) เหมือน WhtFilterBar ของ WO 5.4
//    ปุ่มแยกทำให้แถวตกไปบรรทัดที่ 2 ซึ่งไม่ตรงเฟรม
// 🔴 ปุ่ม submit ที่ซ่อนไว้ (sr-only) มีไว้ให้ "พิมพ์ในช่องค้นหาแล้วกด Enter" ใช้ได้ —
//    implicit submission ของเบราว์เซอร์ทำงานเฉพาะตอนฟอร์มมีปุ่ม submit หรือมีช่อง text ช่องเดียว
//    (โหมด "กำหนดเอง" มีช่องวันที่เป็น text อีก 2 ช่อง ⇒ ถ้าไม่มีปุ่มนี้ Enter จะเงียบ)
// 🔴 สถานะทั้งหมดอยู่ใน URL (ฟอร์ม GET) — แชร์ลิงก์/refresh/กดย้อนกลับได้เหมือนเดิม
import { useEffect, useRef, useState } from "react";
import { AccountIcon } from "./AccountIcon";
import { DateInput } from "./DateInput";
// 🔴 ห้าม import จาก `@/lib/modules/account/journal-v2` ตรง ๆ ในไฟล์ "use client" —
//    โมดูลนั้นลาก `@/lib/core/db` (pg/prisma) เข้ามาฝั่งเบราว์เซอร์ → build ตาย (module-not-found)
//    ⇒ รายการ preset ส่งมาเป็น prop จากหน้า (server) แทน

export function JournalFilterBar({
  pathname,
  range,
  presets,
  from,
  to,
  tab,
  books,
  q,
  review,
  pageSize,
}: {
  pathname: string;
  /** preset ที่ตรงกับ from/to ปัจจุบัน — "custom" = โชว์ช่องวันที่ 2 ช่อง */
  range: string;
  /** ตัวเลือกช่วงวันที่สำเร็จรูป (มาจาก JOURNAL_RANGE_PRESETS ฝั่ง server) */
  presets: readonly { key: string; label: string }[];
  from: string;
  to: string;
  tab: string;
  books: readonly { key: string; label: string }[];
  q: string;
  review: boolean;
  /** ขนาดหน้าที่ผู้ใช้เลือกไว้ — พกต่อไปกับตัวกรอง (ไม่งั้นเปลี่ยนตัวกรองแล้วเด้งกลับ 20 แถว) */
  pageSize?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [sel, setSel] = useState<string>(range);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  // ยิงฟอร์มหลังรีเรนเดอร์เสร็จเท่านั้น — ตอนเลือก preset ช่องวันที่จะถูกถอดออกจาก DOM ก่อน
  // (ไม่งั้น from/to เก่าจะติดไปใน URL ทั้งที่ผู้ใช้เลือก "เดือนนี้" แล้ว)
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    formRef.current?.requestSubmit();
  }, [sel, f, t]);

  const fire = () => {
    pending.current = true;
  };

  return (
    <form
      ref={formRef}
      method="GET"
      action={pathname}
      className="flex flex-wrap items-center gap-2"
      data-testid="journal-filters"
    >
      {pageSize && <input type="hidden" name="size" value={pageSize} />}

      {/* ช่วงวันที่ — preset สั้น ๆ ตามเฟรม · "กำหนดเอง" ค่อยกางช่องวันที่ 2 ช่องต่อท้ายในบรรทัดเดียวกัน */}
      <label
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm"
        style={{ borderColor: "var(--color-line)" }}
      >
        <AccountIcon name="calendar" className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
        <span className="text-[color:var(--color-muted)]">ช่วงวันที่:</span>
        <select
          name="range"
          value={sel}
          className="border-0 bg-transparent py-2 pr-1 text-sm font-medium outline-none"
          aria-label="ช่วงวันที่"
          data-testid="journal-range"
          onChange={(e) => {
            const v = e.currentTarget.value;
            setSel(v);
            // "กำหนดเอง" = รอผู้ใช้เลือกวันเองก่อน ยังไม่ยิง
            if (v !== "custom") fire();
          }}
        >
          {presets.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value="custom">กำหนดเอง</option>
        </select>
      </label>

      {sel === "custom" && (
        <div className="flex items-center gap-1.5" data-testid="journal-range-custom">
          {/* DateInput โชว์ไทย (1 ก.ย. 2026) แต่ส่งค่า ISO ไปกับฟอร์มผ่าน hidden input */}
          <DateInput
            name="from"
            value={f}
            onChange={(iso) => {
              fire();
              setF(iso);
            }}
            testId="journal-from"
          />
          <span className="text-[color:var(--color-muted)]">–</span>
          <DateInput
            name="to"
            value={t}
            onChange={(iso) => {
              fire();
              setT(iso);
            }}
            testId="journal-to"
          />
        </div>
      )}

      {/* สมุด */}
      <label
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm"
        style={{ borderColor: "var(--color-line)" }}
      >
        <AccountIcon name="book" className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
        <span className="text-[color:var(--color-muted)]">สมุด:</span>
        <select
          name="tab"
          defaultValue={tab}
          className="border-0 bg-transparent py-2 pr-1 text-sm font-medium outline-none"
          aria-label="สมุด"
          data-testid="journal-book-select"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {books.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      {/* ค้นหา — กว้างสุดในแถวตามเฟรม */}
      <div className="relative min-w-[200px] flex-1">
        <AccountIcon
          name="search"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]"
        />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="ค้นหาเลขที่ JV, คำอธิบาย"
          className="input w-full pl-8"
          aria-label="ค้นหาเลขที่ JV, คำอธิบาย"
          data-testid="journal-search"
        />
      </div>

      <label className="flex items-center gap-1.5 whitespace-nowrap px-1 text-sm">
        <input
          type="checkbox"
          name="review"
          value="1"
          defaultChecked={review}
          data-testid="journal-review-only"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        เฉพาะ <AccountIcon name="flag" className="h-3.5 w-3.5 text-[color:var(--color-danger)]" /> ต้องตรวจ
      </label>

      <button type="submit" className="sr-only">
        แสดง
      </button>
    </form>
  );
}

export default JournalFilterBar;
