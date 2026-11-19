// components/book/BookSelect.tsx — เลือกคน · รับส่ง · รายการเสริม + สรุปราคา + ปุ่มถือที่ (ภาพ 01ข · 19) · RUN TRIPS W1.2a
// ทั้งเส้นใช้ได้โดยไม่มี JS: ปุ่ม − + = ปุ่มส่งของฟอร์ม GET (ฟอร์มละปุ่ม พาการเลือกทั้งหมดไปกับลิงก์) · รับส่ง/รายการเสริม = ฟอร์ม GET + ปุ่ม "คำนวณราคาใหม่"
// · ถือที่ = <form action={server action}> (nonce + ยอดที่เห็น) · ยอดทุกตัวจาก VM (บริการราคา) — ไฟล์นี้ไม่คิดเงิน
import { bookHref } from "@/lib/platform/trips-public-core";
import {
  selectionPeople,
  selectionQuery,
  selectionWithPax,
  type BookErrorCode,
  type BookFormField,
  type BookOptionsVM,
  type BookSelection,
  type BookShopInfo,
  type BookSummaryVM,
} from "@/lib/platform/trips-book-core";
import type { BookLocale } from "@/lib/platform/trips-public-core";
import { BookUntranslated, shopLang } from "./BookContent";
import { BookError, BookHidden, BookLines, bookContactText, bookReachText } from "./BookFlowParts";
import { bookMoney } from "./BookPrices";
import { bookT } from "./book-i18n";

export type BookSelectData = {
  options: BookOptionsVM;
  summary: BookSummaryVM | null;
  /** การเลือกปัจจุบัน (ตรวจรูปแล้ว) */
  state: BookSelection;
  /** nonce ของฟอร์มถือที่ (null = ไม่มีกุญแจเซิร์ฟเวอร์ ⇒ ไม่มีปุ่มถือ) */
  nonce: string | null;
  /** holdLimited = ถังถือ/ถังต่อรอบของเครื่องนี้เต็มจริง (`e=HOLD_LIMITED` · มติ Y5) */
  error: { code: BookErrorCode; fields: BookFormField[]; holdLimited?: true; wait?: number } | null;
  /** พารามิเตอร์ของหน้าที่ต้องพาไปทุกฟอร์ม (lang · m · d · t) */
  base: Record<string, string>;
  shop: string;
  /** ผู้ขาย (ชื่อ/เบอร์/LINE) — ข้อความถือถี่เกิน (มติ W2) */
  seller: BookShopInfo;
  productSlug: string;
  holdAction: (formData: FormData) => void | Promise<void>;
};

const STEP = "inline-flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-semibold disabled:cursor-not-allowed disabled:opacity-40";
const OPTION = "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 has-[:checked]:border-2 has-[:checked]:border-[color:var(--color-ink)]";
const CTA = "inline-flex min-h-12 items-center justify-center rounded-xl bg-[color:var(--color-accent)] px-5 text-base font-semibold text-[color:var(--color-accent-fg)]";

function ageText(t: ReturnType<typeof bookT>, min: number | null, max: number | null): string {
  if (min !== null && max !== null) return t("pax.ageRange", { min, max });
  if (max !== null) return t("pax.ageUnder", { max });
  if (min !== null && min > 0) return t("pax.ageFrom", { min });
  return "";
}

/** แผงเลือก (คอลัมน์หลัก): จำนวนคน · รับส่ง · รายการเสริม */
export function BookSelectPanel({ data, locale }: { data: BookSelectData; locale: BookLocale }) {
  const t = bookT(locale);
  const o = data.options;
  const path = bookHref(data.shop, data.productSlug);
  const people = selectionPeople(data.state);
  const qtyOf = (code: string): number => data.state.pax.find((p) => p.code === code)?.qty ?? 0;
  const extraOn = (ref: string): boolean => data.state.extras.some((x) => x.ref === ref);
  const paxOnly: BookSelection = { pax: data.state.pax, extras: [], zone: null };
  return (
    <section data-testid="book-select" id="book-select" className="flex flex-col gap-5 rounded-2xl border bg-[color:var(--color-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("select.title")}</h2>
        <span className="text-sm text-[color:var(--color-ink-soft)]">
          {o.slot.timeText} · {t("select.left", { n: o.left })}
        </span>
      </div>
      {data.error?.code === "RATE_LIMITED" ? (
        // ถือไม่ได้ตอนนี้ — ลองใหม่ได้ภายหลัง + ทางติดต่อร้าน (มติ W2 · ไม่สัญญา "รอสักครู่")
        // "เครื่องนี้ถือหลายครั้งแล้ว" เฉพาะถังถือ/ถังต่อรอบเต็มจริง · ถังอ่านเต็ม/ด่านล่ม ⇒ ข้อความกลาง (มติ Y5)
        <div data-testid="book-error" data-code="RATE_LIMITED" data-hold-limited={data.error.holdLimited ? "true" : "false"} role="alert" className="rounded-xl border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
          <p>{t(data.error.holdLimited ? "select.holdLimited" : "select.holdUnavailable", { contact: bookContactText(data.seller) })}</p>
        </div>
      ) : data.error ? (
        <BookError code={data.error.code} fields={data.error.fields} locale={locale} wait={data.error.wait} contact={bookReachText(data.seller)} />
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{t("select.pax")}</h3>
        <ul className="flex flex-col divide-y rounded-xl border">
          {o.pax.map((p) => {
            const q = qtyOf(p.code);
            const label = p.label.text ?? p.code;
            return (
              <li key={p.code} data-testid={`book-pax-${p.code}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div lang={shopLang(p.label, locale)} className="break-words text-base font-medium">
                    {label}
                  </div>
                  <div className="text-sm text-[color:var(--color-muted)]">{[ageText(t, p.ageMin, p.ageMax), p.seat ? "" : t("pax.noSeat")].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-[color:var(--color-ink-soft)]">{p.unitSatang === 0 ? t("select.free") : bookMoney(t, p.unitSatang)}</span>
                  <form method="get" action={path}>
                    <BookHidden q={{ ...data.base, ...selectionQuery(selectionWithPax(data.state, p.code, q - 1)) }} />
                    <button type="submit" className={STEP} disabled={q <= 0} aria-label={t("select.minus", { label })}>
                      −
                    </button>
                  </form>
                  <span className="w-6 text-center text-base font-semibold tabular-nums" aria-live="polite">
                    {q}
                  </span>
                  <form method="get" action={path}>
                    <BookHidden q={{ ...data.base, ...selectionQuery(selectionWithPax(data.state, p.code, q + 1)) }} />
                    <button type="submit" className={STEP} disabled={people >= o.maxSeats} aria-label={t("select.plus", { label })}>
                      +
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-[color:var(--color-muted)]">{t("select.maxSeats", { n: o.maxSeats })}</p>
      </div>

      {o.zones.length || o.extras.length ? (
        <form method="get" action={path} className="flex flex-col gap-5">
          <BookHidden q={{ ...data.base, ...selectionQuery(paxOnly) }} />
          {o.zones.length ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-base font-semibold">{t("select.pickup")}</legend>
              <ul data-testid="book-zones" className="flex flex-col gap-2">
                <li>
                  <label className={OPTION}>
                    <input type="radio" name="z" value="" defaultChecked={data.state.zone === null} className="mt-1 h-4 w-4" />
                    <span className="text-base">{t("select.noPickup")}</span>
                  </label>
                </li>
                {o.zones.map((z, i) => (
                  <li key={z.ref}>
                    <label data-testid={`book-zone-${i}`} className={OPTION}>
                      <input type="radio" name="z" value={z.ref} defaultChecked={data.state.zone === z.ref} className="mt-1 h-4 w-4" />
                      <span className="min-w-0 flex-1">
                        <span lang={shopLang(z.name, locale)} className="block break-words text-base font-medium">
                          {z.name.text}
                        </span>
                        {z.areas.text ? (
                          <span lang={shopLang(z.areas, locale)} className="block break-words text-sm text-[color:var(--color-muted)]">
                            {z.areas.text}
                          </span>
                        ) : null}
                        {z.name.fallback ? <BookUntranslated locale={locale} /> : null}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">{z.surchargeSatang === 0 ? t("select.free") : t("select.surcharge", { amount: bookMoney(t, z.surchargeSatang) })}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}
          {o.extras.length ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-base font-semibold">{t("select.extras")}</legend>
              <ul className="flex flex-col gap-2">
                {o.extras.map((x, i) => (
                  <li key={x.ref}>
                    <label data-testid={`book-extra-pick-${i}`} className={OPTION}>
                      <input type="checkbox" name={`x.${x.ref}`} value="1" defaultChecked={extraOn(x.ref)} className="mt-1 h-4 w-4" />
                      <span className="min-w-0 flex-1">
                        <span lang={shopLang(x.name, locale)} className="block break-words text-base font-medium">
                          {x.name.text}
                        </span>
                        {x.note.text ? (
                          <span lang={shopLang(x.note, locale)} className="block break-words text-sm text-[color:var(--color-muted)]">
                            {x.note.text}
                          </span>
                        ) : null}
                        {x.name.fallback ? <BookUntranslated locale={locale} /> : null}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">{x.unitSatang === 0 ? t("select.free") : t("select.surcharge", { amount: bookMoney(t, x.unitSatang) })}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}
          <button type="submit" className="inline-flex min-h-11 w-fit items-center rounded-xl border px-4 text-sm font-semibold">
            {t("select.update")}
          </button>
        </form>
      ) : null}
    </section>
  );
}

/** ฟอร์มถือที่ (server action) — id ให้ปุ่มในแถบล่างของมือถืออ้างถึงได้ */
export const BOOK_HOLD_FORM_ID = "book-hold-form";

/** แผงสรุปราคา (ติดจอ 1440 · ในหน้าบนมือถือ) + ปุ่มถือที่ */
export function BookSummaryPanel({ data, locale }: { data: BookSelectData; locale: BookLocale }) {
  const t = bookT(locale);
  const s = data.summary;
  if (!s) {
    return (
      <div data-testid="book-summary" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("summary.title")}</h2>
        <p className="text-sm text-[color:var(--color-ink-soft)]">{t("select.choosePax")}</p>
      </div>
    );
  }
  return (
    <div data-testid="book-summary" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("summary.title")}</h2>
      <p className="text-sm text-[color:var(--color-ink-soft)]">
        {s.timeText} · {t("summary.seats", { n: s.seats })}
      </p>
      <BookLines lines={s.lines} locale={locale} />
      <div className="flex items-baseline justify-between gap-3 border-t pt-3">
        <span className="text-base font-semibold">{t("summary.total")}</span>
        <span data-testid="book-total" className="text-2xl font-semibold tabular-nums">
          {bookMoney(t, s.totalSatang)}
        </span>
      </div>
      {s.passThroughSatang > 0 ? <p className="text-sm text-[color:var(--color-ink-soft)]">{t("summary.passThrough", { amount: bookMoney(t, s.passThroughSatang) })}</p> : null}
      <p className="text-sm text-[color:var(--color-ink-soft)]">{t(`price.vat.${s.vatNote}`)}</p>
      {data.nonce ? (
        <form id={BOOK_HOLD_FORM_ID} action={data.holdAction} className="flex flex-col gap-2">
          <BookHidden q={{ ...data.base, ...selectionQuery(data.state), nonce: data.nonce, seen: String(s.totalSatang) }} />
          <button data-testid="book-continue" type="submit" className={`${CTA} w-full`}>
            {t("select.continue")}
          </button>
        </form>
      ) : (
        <BookError code="UNAVAILABLE" locale={locale} />
      )}
      <p data-testid="book-hold-note" className="text-sm text-[color:var(--color-muted)]">
        {t("summary.holdNote", { min: s.fillMinutes })}
      </p>
    </div>
  );
}

/** แถบล่างติดจอของมือถือ: ยอดรวม + ปุ่มถือที่ (ส่งฟอร์มเดียวกันด้วยแอตทริบิวต์ form — ไม่ต้องมี JS) */
export function BookSelectBottom({ data, locale }: { data: BookSelectData; locale: BookLocale }) {
  const t = bookT(locale);
  const s = data.summary;
  return (
    <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between gap-3">
      <div className="min-w-0">
        {s ? (
          <div className="flex flex-col">
            <span className="truncate text-sm text-[color:var(--color-ink-soft)]">{t("summary.seats", { n: s.seats })}</span>
            <span className="text-lg font-semibold tabular-nums">{bookMoney(t, s.totalSatang)}</span>
          </div>
        ) : (
          <span className="text-sm text-[color:var(--color-ink-soft)]">{t("select.choosePax")}</span>
        )}
      </div>
      {s && data.nonce ? (
        <button type="submit" form={BOOK_HOLD_FORM_ID} className={`${CTA} shrink-0`}>
          {t("select.continue")}
        </button>
      ) : (
        <a href="#book-select" className={`${CTA} shrink-0`}>
          {t("select.pax")}
        </a>
      )}
    </div>
  );
}
