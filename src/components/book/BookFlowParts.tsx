// components/book/BookFlowParts.tsx — ชิ้นส่วนร่วมของเส้นจอง (ขั้นตอน · ผู้ขาย · บรรทัดราคา · กล่องผิดพลาด · ช่องซ่อนของฟอร์ม) · RUN TRIPS W1.2a
// แสดงผลเท่านั้น: ทุกยอดเป็นสตางค์จำนวนเต็มจาก VM (บริการราคา/snapshot) จัดรูปด้วย formatBaht ผ่าน bookMoney — ไฟล์นี้ไม่บวก/คูณ/ปัดเงิน
import type { BookErrorCode, BookFormField, BookLineVM, BookShopInfo } from "@/lib/platform/trips-book-core";
import type { BookLocale } from "@/lib/platform/trips-public-core";
import { shopLang } from "./BookContent";
import { bookMoney } from "./BookPrices";
import { bookT } from "./book-i18n";

export const BOOK_STEP_KEYS = ["select", "details", "pay", "done"] as const;
export type BookStepKey = (typeof BOOK_STEP_KEYS)[number];

/** แถบขั้นตอน 4 ขั้น (ภาพ 01) — ขั้นปัจจุบันมี aria-current */
export function BookSteps({ current, locale }: { current: BookStepKey; locale: BookLocale }) {
  const t = bookT(locale);
  const at = BOOK_STEP_KEYS.indexOf(current);
  return (
    <nav data-testid="book-steps" aria-label={t("steps.label")}>
      <ol className="grid grid-cols-4 gap-1.5">
        {BOOK_STEP_KEYS.map((k, i) => (
          <li key={k} aria-current={i === at ? "step" : undefined} className="flex flex-col gap-1">
            <span className={`h-1 rounded-full ${i <= at ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-surface-3,#e5e7eb)]"}`} />
            <span className={`truncate text-xs ${i === at ? "font-semibold" : "text-[color:var(--color-muted)]"}`}>{t(`steps.${k}`)}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** ผู้ขาย (มติ R13): ชื่อร้าน + ช่องทางติดต่อที่ร้านตั้ง (ว่าง = ไม่แสดง) + เลขใบอนุญาต (ถ้ามี) */
export function BookShopBox({ shop, licenseNo, locale }: { shop: BookShopInfo; licenseNo?: string | null; locale: BookLocale }) {
  const t = bookT(locale);
  return (
    <section data-testid="book-shop" className="rounded-2xl border bg-[color:var(--color-surface)] p-4 text-sm">
      <h2 className="text-sm font-semibold text-[color:var(--color-ink-soft)]">{t("shop.title")}</h2>
      <p className="mt-1 break-words text-base font-semibold">{shop.name}</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-[color:var(--color-ink-soft)]">
        {shop.contact.phone ? <li className="break-words">{t("shop.phone", { v: shop.contact.phone })}</li> : null}
        {shop.contact.line ? <li className="break-words">{t("shop.line", { v: shop.contact.line })}</li> : null}
        {shop.address ? <li className="break-words">{t("shop.address", { v: shop.address })}</li> : null}
        {licenseNo ? <li className="break-words">{t("checkout.license", { no: licenseNo })}</li> : null}
      </ul>
    </section>
  );
}

/** ข้อความติดต่อร้านบรรทัดเดียว (ชื่อ · เบอร์ · LINE) */
export function bookContactText(shop: BookShopInfo): string {
  return [shop.name, shop.contact.phone, shop.contact.line ? `LINE ${shop.contact.line}` : null].filter((x): x is string => typeof x === "string" && x !== "").join(" · ");
}

/** บรรทัดราคา (ใบเสนอราคา/snapshot) — บรรทัด VAT ใช้ป้ายจากไฟล์ภาษา · เงินเก็บแทนมีป้ายกำกับ */
export function BookLines({ lines, locale }: { lines: BookLineVM[]; locale: BookLocale }) {
  const t = bookT(locale);
  return (
    <ul className="flex flex-col divide-y">
      {lines.map((l, i) => (
        <li key={i} data-testid={`book-summary-line-${i}`} data-kind={l.kind} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <span lang={l.kind === "VAT" ? locale : shopLang(l.label, locale)} className="break-words">
              {l.kind === "VAT" ? t("summary.vat") : (l.label.text ?? "")}
            </span>
            {l.kind !== "VAT" && l.qty > 1 ? <span className="ml-1 text-[color:var(--color-muted)] tabular-nums">{t("summary.lineQty", { qty: l.qty, unit: bookMoney(t, l.unitSatang) })}</span> : null}
            {l.passThrough ? <div className="text-xs text-[color:var(--color-muted)]">{t("price.passThrough")}</div> : null}
          </div>
          <span className="shrink-0 font-medium tabular-nums">{l.amountSatang === 0 ? t("pax.free") : bookMoney(t, l.amountSatang)}</span>
        </li>
      ))}
    </ul>
  );
}

/** กล่องผิดพลาด (รหัสในรายการเท่านั้น · ข้อความจากไฟล์ภาษา · ไม่มีรหัสดิบบนจอ) */
export function BookError({ code, fields, locale, wait, contact }: { code: BookErrorCode; fields?: readonly BookFormField[]; locale: BookLocale; wait?: number; contact?: string }) {
  const t = bookT(locale);
  // T0.4d D1: SLOT_BUSY = นาทีที่รอ (พารามิเตอร์ r ที่ตรวจแล้ว · ไม่มี ⇒ ข้อความไม่มีนาที) + ทางติดต่อร้าน
  const msg = code === "DONE" ? t("err.BUSY") : code === "SLOT_BUSY" ? t(wait ? "err.SLOT_BUSY" : "err.slotBusyLater", { minutes: wait ?? "", contact: contact ?? "" }) : t(`err.${code}`);
  return (
    <div data-testid="book-error" data-code={code} role="alert" className="rounded-xl border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
      <p>{msg}</p>
      {fields && fields.length ? <p className="mt-1 font-medium">{fields.map((f) => t(`field.${f}`)).join(" · ")}</p> : null}
    </div>
  );
}

/** ช่องซ่อนของฟอร์ม (ค่าที่ตรวจรูปแล้วจาก VM/พารามิเตอร์ของหน้า) */
export function BookHidden({ q }: { q: Record<string, string> }) {
  return (
    <>
      {Object.entries(q).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}
