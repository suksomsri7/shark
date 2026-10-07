"use client";

// ProductGrid.tsx — กริดสินค้า + สถานะว่าง/ไม่พบ + โหลดเพิ่ม (สเปก §2.1–§2.4 · §3.5 · §5 · ภาพ 01 / 20A / 05ก / 19ก)
//   D: 4 คอลัมน์ ช่องไฟ 22 · padding 24/30 · เลื่อนในพื้นที่ตัวเอง
//   T: 3 คอลัมน์ ช่องไฟ 12 · padding 14/16 · M (768–1023): 2 คอลัมน์ · C: 3 คอลัมน์ ช่องไฟ 14 · padding 16/0 · เลื่อนกับหน้า
//   กำลังโหลด (ค้นหา/เปลี่ยนหมวด) = กริดเดิมจาง 60% + aria-busy (ไม่มีโครงกระดูก — หน้าแรกเรนเดอร์จากเซิร์ฟเวอร์)
//   ว่างทั้งร้าน (19ก): ไอคอน 76 มุม 22 · หัวข้อ 20 หนา · คำอธิบาย 14.5 muted กว้างสุด 380 · ปุ่มหลัก "+ เพิ่มสินค้า" 46
//     "นำเข้า CSV" · "ชุดตัวอย่างคาเฟ่" · ชิป "+ หมวด" = ซ่อน (ยังไม่มีใบงานเจ้าของ — มติ Q15)
//   โหลดเพิ่ม: ปุ่ม "แสดงเพิ่ม" + IntersectionObserver ที่ตัวปุ่ม (เลื่อนถึง = โหลดเอง · ปุ่มคือทางสำรอง)

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RegisterProduct } from "@/lib/modules/pos/register-shared";
import { ProductCard, type PickAnchor } from "./ProductCard";
import { RegisterIcon } from "./RegisterIcon";

type Props = {
  products: RegisterProduct[];
  inCart: ReadonlyMap<string, number>;
  pending: boolean;
  q: string;
  categoryId: string | null;
  /** ร้านนี้ยังไม่มีสินค้าขายที่สาขานี้เลย (ไม่ค้น · ไม่เลือกหมวด · ได้ 0) */
  catalogueEmpty: boolean;
  hasMore: boolean;
  productsHref: string;
  /** P1.2 U R2: anchor = กรอบการ์ดที่แตะ (ป๊อปโอเวอร์ตัวเลือกยึดกับการ์ด — ภาพ 01) */
  onPick: (p: RegisterProduct, anchor?: PickAnchor) => void;
  /** P1.2 U R2: การ์ดที่ป๊อปโอเวอร์ตัวเลือกเปิดอยู่ (ขอบไฮไลต์ · ภาพ 01 .pitem.sel) */
  selectedId?: string | null;
  onMore: () => void;
  onClearSearch: () => void;
};

export function ProductGrid({ products, inCart, pending, q, categoryId, catalogueEmpty, hasMore, productsHref, onPick, selectedId = null, onMore, onClearSearch }: Props) {
  const t = useTranslations("pos.register");
  const moreRef = useRef<HTMLButtonElement>(null);
  // เลื่อนถึงปุ่ม "แสดงเพิ่ม" = โหลดหน้าถัดไปเอง (ครั้งเดียวต่อการเห็น — ระหว่างโหลดไม่ยิงซ้ำ)
  useEffect(() => {
    const el = moreRef.current;
    if (!el || !hasMore || pending || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, pending, onMore]);

  if (catalogueEmpty) {
    return (
      <div data-testid="pos-reg-empty" className="flex flex-1 flex-col items-center justify-center gap-3 px-7 pb-[38px] pt-[34px] text-center">
        <span className="mb-1.5 grid size-[76px] place-items-center rounded-[22px] border bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]">
          <RegisterIcon name="box" size={32} strokeWidth={1.5} />
        </span>
        <h2 className="text-[20px] font-bold tracking-[-0.01em]">{t("empty.title")}</h2>
        <p className="max-w-[380px] text-[14.5px] leading-[1.6] text-[color:var(--color-muted)]">{t("empty.body")}</p>
        <Link
          data-testid="pos-reg-empty-add-product"
          className="btn btn-primary mt-2 h-[46px] gap-[9px] rounded-[13px] px-5 text-[15px]"
          href={productsHref}
        >
          <RegisterIcon name="plus" size={14} />
          {t("empty.addProduct")}
        </Link>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div
        data-testid="pos-reg-search-empty"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center text-[15px] text-[color:var(--color-muted)]"
        role="status"
      >
        <p className="max-w-[420px] break-words [overflow-wrap:anywhere]">{q.trim() ? t("search.noResult", { q: q.trim() }) : t("search.noResultCategory")}</p>
        {q.trim() && (
          <button data-testid="pos-reg-search-clear" className="btn btn-ghost h-11 rounded-[13px] px-5 text-[15px]" type="button" onClick={onClearSearch}>
            {t("search.clear")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-0 md:flex-1 md:overflow-y-auto">
      <div
        data-testid="pos-reg-grid"
        className={`grid grid-cols-3 gap-[14px] py-4 transition-opacity md:grid-cols-2 md:gap-3 md:px-4 md:py-[14px] lg:grid-cols-3 xl:grid-cols-4 xl:gap-[22px] xl:px-[30px] xl:py-6 ${pending ? "opacity-60" : ""}`}
        aria-busy={pending}
        aria-label={categoryId ? undefined : t("category.all")}
      >
        {products.map((p) => (
          <ProductCard key={p.id} product={p} inCartQty={inCart.get(p.id) ?? 0} selected={selectedId === p.id} onPick={onPick} />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center pb-6 md:px-4 xl:px-[30px]">
          <button ref={moreRef} data-testid="pos-reg-grid-more" className="btn btn-ghost h-11 rounded-[13px] px-5 text-[15px]" type="button" disabled={pending} onClick={onMore}>
            {t("search.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
