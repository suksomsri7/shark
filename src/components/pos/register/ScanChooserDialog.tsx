"use client";

// ScanChooserDialog.tsx — บาร์โค้ดเดียวตรงหลายสินค้า (registerScan match "choose") ⇒ กล่องเลือกจริง (POS P1.4 B4)
//   แทนการยึดกริดของ B2.2 · แถวสูง ≥44px (min-h-14) · แตะแถว = ใส่ตะกร้าทางเดียวกับแตะการ์ด (pick → cartAddProduct)
//   ลำดับแถว = ลำดับที่เซิร์ฟเวอร์คืน (ชื่อ · id) ไม่เรียงใหม่

import { useTranslations } from "next-intl";
import { displayName, moneyText, type RegisterProduct } from "@/lib/modules/pos/register-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";

export function ScanChooserDialog({ products, locale, onPick, onClose }: { products: RegisterProduct[]; locale: string; onPick: (p: RegisterProduct) => void; onClose: () => void }) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-scan-chooser" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("scan.chooseTitle")}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("scan.chooseTitle")}</h2>
        <ul className="flex flex-col gap-2">
          {products.map((p, i) => (
            <li key={p.id}>
              <button
                data-testid={`pos-reg-scan-choice-${p.id}`}
                className="flex min-h-14 w-full items-center gap-3 rounded-[13px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-2 text-left hover:bg-[color:var(--color-surface-2)]"
                type="button"
                autoFocus={i === 0}
                onClick={() => onPick(p)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{displayName(p, locale)}</span>
                  {(p.sku || p.barcode) && <span className="block truncate text-[13px] text-[color:var(--color-muted)]">{[p.sku, p.barcode].filter(Boolean).join(" · ")}</span>}
                </span>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums">{p.priceSatang === null ? "-" : moneyText(p.priceSatang)}</span>
              </button>
            </li>
          ))}
        </ul>
        <button data-testid="pos-reg-scan-chooser-cancel" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" onClick={onClose}>
          {tc("cancel")}
        </button>
      </div>
    </RegisterDialog>
  );
}
