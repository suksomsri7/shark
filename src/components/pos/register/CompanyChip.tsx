"use client";

// CompanyChip.tsx — ชิป "บริษัทของบิล" ใต้การ์ดสมาชิกในตะกร้า (POS P3.6U ▸ CD-P36U-3 · CD-P36U-11 ◂)
//   ว่าง = ปุ่ม "เลือกบริษัท" (pos-reg-company-pick) เปิดแผ่นเลือกบริษัท · มีบริษัท = ชื่อ · เลขภาษี · สาขา + "ถอดบริษัท" (pos-reg-company-clear)
//   error = คีย์ข้อความใต้ pos.register (เช่น credit.errors.customerInvalid หลัง submit ปฏิเสธ CUSTOMER_INVALID)
// 🔴 แสดงเฉพาะชื่อ/เลขภาษี/สาขาที่เซิร์ฟเวอร์ให้ — ไม่มีผู้ติดต่อ/เบอร์/อีเมลของบริษัท (R14) · ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px

import { useTranslations } from "next-intl";
import type { CompanyOption } from "@/lib/modules/pos/crm-link";
import { RegisterIcon } from "./RegisterIcon";

export type BillCompany = Pick<CompanyOption, "partyId" | "name" | "taxId" | "branchCode">;

/** "เลขภาษี … · สำนักงานใหญ่/สาขา …" (ส่วนที่ไม่มีตัดทิ้ง) */
export function companySubText(c: BillCompany, t: (k: string, v?: Record<string, string | number>) => string): string {
  const parts: string[] = [];
  if (c.taxId) parts.push(t("credit.taxId", { taxId: c.taxId }));
  if (c.branchCode) parts.push(c.branchCode === "00000" ? t("credit.headOffice") : t("credit.branchNo", { code: c.branchCode }));
  return parts.join(" · ");
}

export function CompanyChip(p: { company: BillCompany | null; frozen: boolean; error: string | null; onPick: () => void; onClear: () => void }) {
  const t = useTranslations("pos.register");
  const c = p.company;
  return (
    <div className="flex flex-col gap-1">
      {!c ? (
        <button
          data-testid="pos-reg-company-pick"
          className="flex min-h-12 w-full items-center gap-3 rounded-[18px] border bg-[color:var(--color-surface-2)] px-3 py-[9px] text-left text-[15px] text-[color:var(--color-ink-soft)] disabled:opacity-60 xl:px-4"
          type="button"
          disabled={p.frozen}
          onClick={p.onPick}
        >
          <RegisterIcon name="shop" size={18} className="text-[color:var(--color-muted)]" />
          <span className="flex-1">{t("credit.pickCompany")}</span>
        </button>
      ) : (
        <div data-testid="pos-reg-company-chip" className="flex min-h-12 items-center gap-3 rounded-[18px] border bg-[color:var(--color-surface-2)] px-3 py-[7px] xl:px-4">
          <button data-testid="pos-reg-company-open" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60" type="button" disabled={p.frozen} aria-label={t("credit.company")} onClick={p.onPick}>
            <RegisterIcon name="shop" size={18} className="shrink-0 text-[color:var(--color-muted)]" />
            <span className="flex min-w-0 flex-col">
              <span data-testid="pos-reg-company-name" className="truncate text-[14.5px] font-bold text-[color:var(--color-ink)]">
                {c.name}
              </span>
              {companySubText(c, t) && <span className="truncate text-[12px] text-[color:var(--color-muted)]">{companySubText(c, t)}</span>}
            </span>
          </button>
          <button data-testid="pos-reg-company-clear" className="h-11 shrink-0 px-1 text-[12.5px] text-[color:var(--color-muted)] underline underline-offset-2 disabled:opacity-50" type="button" disabled={p.frozen} onClick={p.onClear}>
            {t("credit.clear")}
          </button>
        </div>
      )}
      {p.error && (
        <p data-testid="pos-reg-company-error" role="alert" className="px-1 text-[12.5px] font-semibold text-[color:var(--color-danger)]">
          {t(p.error)}
        </p>
      )}
    </div>
  );
}
