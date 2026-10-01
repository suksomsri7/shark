"use client";

// SearchRow.tsx — แถวค้นหา/สแกน + ปุ่มรายการกำหนดเอง + ปุ่มสแกนกล้อง (สเปก §2.1 / §2.2 / §2.4 · §4.3)
//   D: ช่องสูง 48 มุม 13 px16 ตัว 15 + ป้าย F2 · ปุ่มผี 46 มุม 13 px20 ตัว 15 · padding 14 บน / 18 ข้าง · ช่องไฟ 16
//   T/M: ช่องสูง 44 ตัว 14 ไม่มี F2 · ปุ่มไอคอนล้วน 48×44 · padding 12/16 · ช่องไฟ 10
//   C: ช่องเต็มกว้าง สูง 48 · ปุ่มกล้องอยู่หัวจอมือถือ (RegisterTopContext) · ปุ่ม + อยู่ท้ายช่อง (แบบ 05ก ไม่ได้วาด — ส่วนต่างที่บันทึกไว้)
// 🔴 data-testid ขึ้นก่อน className ทุกแท็ก และคลาส ≥44px อยู่บนแท็กเดียวกับ testid (ข้อสอบ S5.9 · G4)
// 🔴 ไม่มีสิทธิ์ตั้งราคาเอง (pos.sale.priceOverride): ปุ่ม + จาง + aria-disabled · แตะแล้วขึ้นเหตุผล errors.needPriceOverride (RegisterScreen —
//    จุดต่อ P1.15 onNeedsApproval) — ไม่ใช้ disabled จริงเพราะปุ่ม disabled กดไม่ได้ = ไม่มีทางเห็นเหตุผลบนจอสัมผัส
// 🔴 ช่องค้นหา: ref มาจาก RegisterScreen (โฟกัส F2 / หลังเพิ่มสินค้า) · Enter ส่งกลับไปที่ addFromSearchEnter (P1.4 รับช่วง)

import { forwardRef } from "react";
import { useTranslations } from "next-intl";
import { RegisterIcon } from "./RegisterIcon";

type Props = {
  q: string;
  onQ: (q: string) => void;
  onEnter: () => void;
  /** ≥1280 = ป้าย F2 + placeholder ยาว + ปุ่มมีข้อความ */
  wide: boolean;
  /** < 768 = ปุ่มกล้องย้ายไปหัวจอมือถือ */
  compact: boolean;
  canCustom: boolean;
  onCustom: () => void;
  onCamera: () => void;
  disabled?: boolean;
};

export const SearchRow = forwardRef<HTMLInputElement, Props>(function SearchRow({ q, onQ, onEnter, wide, compact, canCustom, onCustom, onCamera, disabled }, ref) {
  const t = useTranslations("pos.register");
  const customTitle = canCustom ? t("search.customItem") : t("errors.needPriceOverride");
  return (
    <div className="flex items-center gap-2.5 md:px-4 md:pt-3 xl:gap-4 xl:px-[18px] xl:pt-[14px]">
      <label className="flex h-12 min-w-0 flex-1 items-center gap-[7px] rounded-[13px] border px-4 text-[color:var(--color-muted)] focus-within:border-[color:var(--color-ink)] md:h-11 xl:h-12">
        <RegisterIcon name="search" size={14} />
        <input
          data-testid="pos-reg-search"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-muted)] md:text-[14px] xl:text-[15px] [&::-webkit-search-cancel-button]:hidden"
          ref={ref}
          type="search"
          value={q}
          disabled={disabled}
          placeholder={wide ? t("search.placeholder") : t("search.placeholderShort")}
          aria-label={wide ? t("search.placeholder") : t("search.placeholderShort")}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onQ(e.target.value)}
          onKeyDown={(e) => {
            // Enter ของคีย์บอร์ดไทย (IME) ระหว่างประกอบคำ = ไม่ใช่คำสั่งเพิ่มสินค้า
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onEnter();
            }
          }}
        />
        {wide && (
          <kbd
            data-testid="pos-reg-search-kbd"
            aria-hidden
            className="grid h-5 min-w-6 shrink-0 place-items-center rounded-[5px] border bg-[color:var(--color-surface)] px-[5px] font-sans text-[11px] font-bold text-[color:var(--color-ink-soft)]"
          >
            F2
          </kbd>
        )}
      </label>
      <button
        data-testid="pos-reg-custom-item"
        className={`btn btn-ghost h-12 w-12 shrink-0 rounded-[13px] px-0 text-[15px] md:h-11 md:w-12 xl:h-[46px] xl:w-auto xl:gap-[9px] xl:px-5 ${canCustom ? "" : "text-[color:var(--color-muted)]"}`}
        type="button"
        disabled={disabled}
        aria-disabled={!canCustom}
        title={customTitle}
        aria-label={customTitle}
        onClick={onCustom}
      >
        <RegisterIcon name="plus" size={wide ? 14 : 18} />
        {wide && <span>{t("search.customItem")}</span>}
      </button>
      {!compact && (
        <button
          data-testid="pos-reg-scan-camera"
          className="btn btn-ghost hidden h-11 w-12 shrink-0 rounded-[13px] px-0 text-[15px] md:inline-flex xl:h-[46px] xl:w-auto xl:gap-[9px] xl:px-5"
          type="button"
          aria-disabled="true"
          title={t("soon")}
          aria-label={t("search.scanCamera")}
          onClick={onCamera}
        >
          <RegisterIcon name="cam" size={wide ? 14 : 18} />
          {wide && <span>{t("search.scanCamera")}</span>}
        </button>
      )}
    </div>
  );
});
