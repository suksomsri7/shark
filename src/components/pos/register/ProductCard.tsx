"use client";

// ProductCard.tsx — การ์ดสินค้าในกริด (สเปก §2.1 / §2.2 / §2.4 · §5 สถานะ · ภาพ 01 / 20A / 05ก / 19ฉ)
//   D: ขอบ 1px มุม 18 padding 16 สูงขั้นต่ำ 170 · รูป 104 มุม 8 พื้น stage mb 8 · ชื่อ 16/1.35 หนา 600 สองบรรทัด · ราคา 16 ink-soft mt 6
//   T: มุม 15 padding 11 · รูป 84 mb 6 · ชื่อ 15 · ราคา 15 mt 2 · C: มุม 18 padding 12 สูงขั้นต่ำ 120 · รูป 80
//   ป้ายขวา 12.5 muted ("สต็อก N" / "บริการ") · ใกล้หมด "เหลือ N" ink-soft หนา · หมด = จาง 45% + " · หมด" สีอันตรายต่อท้ายชื่อ
//   มือถือ (05ก): การ์ดที่อยู่ในตะกร้า = ขอบหมึก 1px + inset 1px + ป้ายจำนวนมุมขวาบน (ภาพ 01 ไม่วาดป้ายนี้ ⇒ < md เท่านั้น)
// P1.2 U: มีตัวแปร = ป้าย "N แบบ" · ขายตามน้ำหนัก = ราคาต่อ กก. (ราคาใน priceSatang คือราคาต่อกิโลกรัม — R9)
// 🔴 การแตะทุกแบบไปตัดสินที่ RegisterScreen.pick (ปิดขาย = เตือน · ตัวเลือกบังคับ = เตือน · ไม่มีราคา = ราคาเปิด/เตือน) — จุดต่อ P1.2 (onPick)
// 🔴 ชื่อสินค้าเป็นข้อมูล (อังกฤษ = nameEn ถ้ามี) · เงินผ่าน moneyText เท่านั้น (ห้ามพิมพ์สัญลักษณ์บาทในไฟล์นี้ — ข้อสอบ S5.3)
// POS P2.2U ▸ มติ 5: ราคาบนการ์ด = ราคาหน้าร้านที่ใช้จริง (priceSatang) · โปรราคา (priceSource RULE) = ชิปสีเน้นชื่อโปร + ราคาปกติขีดฆ่า ·
//   notSold (แถว STORE ที่ชนะ = ไม่ขาย) = "ไม่ขายหน้าร้าน" แทนราคา · จาง · เพิ่มลงตะกร้าไม่ได้ (RegisterScreen.pick ไม่เปิดกล่องราคาเปิด) ◂

import { useLocale, useTranslations } from "next-intl";
import { displayName, moneyText, REGISTER_LOW_STOCK, type RegisterProduct } from "@/lib/modules/pos/register-shared";

/** P1.2 U R2: กรอบการ์ดที่แตะ (พิกัด viewport) — ป๊อปโอเวอร์ตัวเลือกยึดกับกรอบนี้ */
export type PickAnchor = { left: number; top: number; right: number; bottom: number };

export function ProductCard({
  product,
  inCartQty,
  selected = false,
  onPick,
}: {
  product: RegisterProduct;
  inCartQty: number;
  selected?: boolean;
  onPick: (p: RegisterProduct, anchor?: PickAnchor) => void;
}) {
  const t = useTranslations("pos.register");
  const tp = useTranslations("pos.price");
  const locale = useLocale();
  const name = displayName(product, locale);
  const out = product.soldOut;
  const low = product.stockLeft !== null && product.stockLeft > 0 && product.stockLeft <= REGISTER_LOW_STOCK;
  const side =
    product.variantCount > 0
      ? t("product.variants", { count: product.variantCount })
      : product.stockLeft !== null && product.stockLeft > 0
      ? low
        ? t("product.left", { count: product.stockLeft })
        : t("product.stock", { count: product.stockLeft })
      : product.kind === "SERVICE" && product.stockLeft === null
        ? t("product.service")
        : null;
  const price = product.priceSatang === null ? null : product.soldByWeight ? t("weigh.perKg", { price: moneyText(product.priceSatang) }) : moneyText(product.priceSatang);
  // POS P2.2U ▸ มติ 5 ◂
  const notSold = product.notSold === true;
  const rule = product.priceSource === "RULE" && product.priceRule ? product.priceRule : null;
  const listStruck = rule && typeof product.listPriceSatang === "number" && product.listPriceSatang !== product.priceSatang ? moneyText(product.listPriceSatang) : null;
  const label = [name, rule ? tp("rule.label", { name: rule.name }) : null, notSold ? t("product.notSoldStore") : (price ?? t("product.noPrice")), out ? t("product.soldOut") : null].filter(Boolean).join(" · ");
  const inCart = inCartQty > 0;
  return (
    <button
      data-testid={`pos-reg-product-${product.id}`}
      className={`relative flex min-h-[120px] min-w-0 flex-col justify-between rounded-[18px] border bg-[color:var(--color-surface)] p-3 text-left transition-colors hover:border-[color:var(--color-ink-soft)] md:min-h-0 md:rounded-[15px] md:p-[11px] xl:min-h-[170px] xl:rounded-[18px] xl:p-4 ${
        out || notSold ? "opacity-45" : ""
      } ${inCart ? "max-md:border-[color:var(--color-ink)] max-md:shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""} ${
        selected ? "md:border-[color:var(--color-accent)] md:shadow-[inset_0_0_0_1px_var(--color-accent)]" : ""
      }`}
      type="button"
      title={name}
      aria-label={label}
      aria-disabled={product.soldOutReason === "UNAVAILABLE" || notSold ? true : undefined}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPick(product, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      }}
    >
      {inCart && (
        <span className="absolute right-1.5 top-1.5 z-[1] grid h-[22px] min-w-[22px] place-items-center rounded-[7px] bg-[color:var(--color-ink)] px-1.5 text-[11.5px] font-bold text-[color:var(--color-surface)] md:hidden">
          {inCartQty.toLocaleString("th-TH")}
        </span>
      )}
      <span className="mb-2 block h-20 w-full shrink-0 overflow-hidden rounded-[8px] bg-[color:var(--color-stage)] md:mb-1.5 md:h-[84px] xl:mb-2 xl:h-[104px]">
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- รูปสินค้ามาจาก CDN ของร้าน (โดเมนไม่คงที่)
          <img src={product.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="line-clamp-2 break-words text-[16px] font-semibold leading-[1.35] [overflow-wrap:anywhere] md:text-[15px] xl:text-[16px]">
        {name}
        {out && <span className="font-semibold text-[color:var(--color-danger)]">{` · ${t("product.soldOut")}`}</span>}
      </span>
      {rule && (
        <span
          data-testid={`pos-reg-tile-rule-${product.id}`}
          className="mt-1 inline-flex max-w-full self-start truncate rounded-[6px] border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-1.5 py-px text-[11px] font-bold text-[color:var(--color-accent)]"
        >
          {rule.name}
        </span>
      )}
      <span className="mt-1.5 flex items-baseline justify-between gap-2 text-[16px] tabular-nums text-[color:var(--color-ink-soft)] md:mt-0.5 md:text-[15px] xl:mt-1.5 xl:text-[16px]">
        {notSold ? (
          <span data-testid={`pos-reg-tile-notsold-${product.id}`} className="text-[13.5px] font-semibold text-[color:var(--color-muted)]">
            {t("product.notSoldStore")}
          </span>
        ) : price !== null ? (
          <span className="whitespace-nowrap">
            {price}
            {listStruck && <s className="ml-1.5 text-[12.5px] text-[color:var(--color-muted)]">{listStruck}</s>}
          </span>
        ) : (
          <span className="text-[13.5px] text-[color:var(--color-muted)]">{t("product.noPrice")}</span>
        )}
        {side && (
          <span className={`whitespace-nowrap text-[12.5px] ${low ? "font-bold text-[color:var(--color-ink-soft)]" : "text-[color:var(--color-muted)]"}`}>{side}</span>
        )}
      </span>
    </button>
  );
}
