// components/book/BookPrices.tsx — ตารางราคาต่อหน่วยของรอบที่เลือก (อ่านอย่างเดียว) + ตารางยกเลิก · RUN TRIPS W1.1a
// แสดงผลเท่านั้น: ทุกยอดเป็นสตางค์จำนวนเต็มจาก VM (มาจากบริการราคา) จัดรูปด้วย formatBaht — ไฟล์นี้ไม่บวก/คูณ/ปัดเงิน
// ค่าธรรมเนียมบังคับ (เช่นค่าอุทยาน) แยกบรรทัดตั้งแต่หน้าแรก · ไม่มีปุ่มจำนวน/ช่องติ๊ก (ใบถัดไป)
import { formatBaht } from "@/components/trips/trips-shared";
import { cancelRowsOf, type BookLocale, type BookPriceVM } from "@/lib/platform/trips-public-core";
import { BookUntranslated, shopLang } from "./BookContent";
import { bookT, type BookT } from "./book-i18n";

const ROW = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3";
const AMOUNT = "shrink-0 text-base font-semibold tabular-nums";
const SUB = "text-sm text-[color:var(--color-muted)]";

/** ยอดเงินพร้อมสัญลักษณ์สกุลตามภาษา (0 ⇒ "ฟรี" เมื่อขอ) */
export function bookMoney(t: BookT, satang: number, freeWhenZero = false): string {
  if (freeWhenZero && satang === 0) return t("pax.free");
  return t("price.amount", { amount: formatBaht(satang) });
}

function ageText(t: BookT, min: number | null, max: number | null): string {
  if (min !== null && max !== null) return t("pax.ageRange", { min, max });
  if (max !== null) return t("pax.ageUnder", { max });
  if (min !== null && min > 0) return t("pax.ageFrom", { min });
  return "";
}
/** ข้อความของฐานคิดราคา — ฐานที่ไม่รู้จัก ⇒ ไม่แสดง (ไม่ปล่อยรหัสขึ้นจอ) */
function basisText(t: BookT, basis: string): string {
  const key = `basis.${basis}`;
  const s = t(key);
  return s === key ? "" : s;
}

export function BookPrices({ price, locale }: { price: BookPriceVM | null; locale: BookLocale }) {
  const t = bookT(locale);
  if (!price) {
    return (
      <section className="rounded-2xl border bg-[color:var(--color-surface)] p-5">
        <h2 className="text-lg font-semibold">{t("product.prices")}</h2>
        <p data-testid="book-price-unavailable" className="mt-3 text-base text-[color:var(--color-ink-soft)]">
          {t("price.unavailable")}
        </p>
      </section>
    );
  }
  const paxLabel = new Map(price.pax.map((p) => [p.code, p.label.text ?? ""]));
  return (
    <section className="rounded-2xl border bg-[color:var(--color-surface)] p-5">
      <h2 className="text-lg font-semibold">{t("product.prices")}</h2>
      <ul data-testid="book-prices" className="mt-1 divide-y">
        {price.pax.map((p) => {
          const age = ageText(t, p.ageMin, p.ageMax);
          return (
            <li key={p.code} data-testid={`book-price-${p.code}`} className={ROW}>
              <div className="min-w-0">
                <div lang={shopLang(p.label, locale)} className="break-words text-base font-medium">
                  {p.label.text}
                </div>
                <div className={SUB}>{[age, p.seat ? "" : t("pax.noSeat")].filter(Boolean).join(" · ")}</div>
                {p.label.fallback ? <BookUntranslated locale={locale} /> : null}
              </div>
              <div className={AMOUNT}>{bookMoney(t, p.unitSatang, true)}</div>
            </li>
          );
        })}
      </ul>
      {price.groupPricing ? (
        <p data-testid="book-group-note" className="mt-2 text-sm text-[color:var(--color-ink-soft)]">
          {t("price.group")}
        </p>
      ) : null}

      {price.fees.length ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold">{t("product.fees")}</h3>
          <ul data-testid="book-fees" className="divide-y">
            {price.fees.map((f, i) => (
              <li key={i} data-testid={`book-fee-${i}`} className={ROW}>
                <div className="min-w-0">
                  <div className="break-words text-base font-medium">
                    <span lang={shopLang(f.name, locale)}>{f.name.text}</span>
                    {f.paxCode && paxLabel.get(f.paxCode) ? <span>{` · ${paxLabel.get(f.paxCode)}`}</span> : null}
                  </div>
                  {f.passThrough ? <div className={SUB}>{t("price.passThrough")}</div> : null}
                  {f.name.text && f.name.fallback ? <BookUntranslated locale={locale} /> : null}
                </div>
                <div className={AMOUNT}>{bookMoney(t, f.unitSatang)}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {price.extras.length ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold">{t("product.extras")}</h3>
          <ul data-testid="book-extras" className="divide-y">
            {price.extras.map((x, i) => (
              <li key={i} data-testid={`book-extra-${i}`} className={ROW}>
                <div className="min-w-0">
                  <div lang={shopLang(x.name, locale)} className="break-words text-base font-medium">
                    {x.name.text}
                  </div>
                  {x.note.text ? (
                    <div lang={shopLang(x.note, locale)} className={`${SUB} break-words`}>
                      {x.note.text}
                    </div>
                  ) : null}
                  {(x.name.text && x.name.fallback) || (x.note.text && x.note.fallback) ? <BookUntranslated locale={locale} /> : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className={AMOUNT}>{bookMoney(t, x.unitSatang, true)}</div>
                  <div className={SUB}>{basisText(t, x.basis)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p data-testid="book-vat-note" className="mt-4 text-sm text-[color:var(--color-ink-soft)]">
        {t(`price.vat.${price.vatNote}`)}
      </p>
    </section>
  );
}

/**
 * ตารางยกเลิกแบบขั้นบันได (มาก→น้อยตามที่บริการราคาคืน) — บรรทัดตัดสินที่ cancelRowsOf (รวมบรรทัดปิดท้าย "หลังจากนั้นไม่คืนเงิน" เมื่อบันไดไม่มีขั้น 0 วัน)
 * ไฟล์นี้แค่แปลบรรทัดเป็นข้อความ
 */
export function BookCancel({ ladder, locale }: { ladder: BookPriceVM["cancelLadder"]; locale: BookLocale }) {
  const t = bookT(locale);
  const rows = cancelRowsOf(ladder);
  if (!rows.length) return null;
  return (
    <section data-testid="book-cancel">
      <h2 className="text-base font-semibold">{t("cancel.title")}</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[color:var(--color-ink-soft)]">
        {rows.map((r, i) => (
          <li key={i}>{r.kind === "FROM_DAYS" ? t("cancel.row", { days: r.days, pct: r.pct }) : r.kind === "LATER_PCT" ? t("cancel.rowLast", { pct: r.pct }) : t("cancel.noRefund")}</li>
        ))}
      </ul>
    </section>
  );
}
