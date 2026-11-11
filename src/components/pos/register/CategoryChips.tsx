"use client";

// CategoryChips.tsx — ชิปหมวดสินค้า แถวเดียวเลื่อนแนวนอน (สเปก §2.1 / §2.2 / §2.4 · §4.3)
//   D: padding 22 บน / 30 ข้าง · ช่องไฟ 12 · ชิปสูง 44 px20 มุม 13 ตัว 15
//   T/M: padding 12/16 · ช่องไฟ 8 · ชิปสูง 44 (แบบ 38 — กติกา ≥44px ชนะ · Q14) px14 มุม 11 ตัว 14
//   C: ตรงแนวช่องค้นหา (มติ Q20) · ชิป 44 px20 ตัว 15 ช่องไฟ 12
//   active = พื้นหมึก ตัวขาว หนา · ชื่อหมวดเป็นข้อมูล (อังกฤษใช้ nameEn ถ้ามี) ไม่ตัดคำ แถวเลื่อนได้

import { useLocale, useTranslations } from "next-intl";
import { displayName, type RegisterCategory } from "@/lib/modules/pos/register-shared";

export function CategoryChips({ categories, active, onPick }: { categories: RegisterCategory[]; active: string | null; onPick: (id: string | null) => void }) {
  const t = useTranslations("pos.register");
  const locale = useLocale();
  const chip = (on: boolean) =>
    `inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-[13px] border px-5 text-[15px] md:rounded-[11px] md:px-[14px] md:text-[14px] xl:rounded-[13px] xl:px-5 xl:text-[15px] ${
      on
        ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]"
        : "bg-[color:var(--color-surface)] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
    }`;
  return (
    <div
      role="tablist"
      aria-label={t("category.label")}
      className="-mx-[22px] flex shrink-0 gap-3 overflow-x-auto px-[22px] pt-4 [scrollbar-width:none] md:mx-0 md:gap-2 md:px-4 md:pt-3 xl:gap-3 xl:px-[30px] xl:pt-[22px] [&::-webkit-scrollbar]:hidden"
    >
      <button
        data-testid="pos-reg-category-all"
        className={`${chip(active === null)} h-11`}
        type="button"
        role="tab"
        aria-selected={active === null}
        onClick={() => onPick(null)}
      >
        {t("category.all")}
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          data-testid={`pos-reg-category-${c.id}`}
          className={`${chip(active === c.id)} h-11`}
          type="button"
          role="tab"
          aria-selected={active === c.id}
          onClick={() => onPick(c.id)}
        >
          {displayName(c, locale)}
        </button>
      ))}
    </div>
  );
}
