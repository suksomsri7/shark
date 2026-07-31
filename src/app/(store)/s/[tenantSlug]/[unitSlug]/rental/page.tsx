import { cookies } from "next/headers";
import { resolveRentalUnit, listPublicRentalAssets } from "@/lib/modules/rental/service";
import { createPublicRentalAction } from "./actions";
import { getLocaleFromCookie, makeT, type Locale } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";

// ฿ คงเดิมทั้งสองภาษา · ตัวเลขจัดกลุ่มตาม locale (en ใช้ en-GB)
const baht = (satang: number, locale: Locale) =>
  (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { minimumFractionDigits: 0 });

// ?err= จาก action เป็นรหัส → หน้าเป็นคนแปล
const ERR_CODES = new Set(["rate", "shop", "dates", "past", "asset", "name", "phone", "failed"]);

// date helpers — วันเช่าเก็บเป็น @db.Date (เที่ยงคืน UTC) · UI ใช้ string "YYYY-MM-DD"
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const todayBkk = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const parseDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const addDaysStr = (s: string, d: number) =>
  new Date(parseDate(s).getTime() + d * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);

// หน้าจองเช่าออนไลน์ (public · ไม่ต้องล็อกอิน) — เลือกช่วงวัน → ดูสินทรัพย์ว่าง → จอง → จ่ายมัดจำ
export default async function PublicRentalBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string; err?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  const resolved = await resolveRentalUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("rental.notFound.title")}</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{t("rental.notFound.desc")}</p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // ช่วงวันเช่า: default วันนี้ → พรุ่งนี้ · วันในอดีต/ช่วงพลิก → ปรับให้ถูกต้อง
  const today = todayBkk();
  let from = sp.from && RE_DATE.test(sp.from) ? sp.from : today;
  if (from < today) from = today;
  let to = sp.to && RE_DATE.test(sp.to) ? sp.to : addDaysStr(from, 1);
  if (daysBetween(from, to) < 1) to = addDaysStr(from, 1);
  const days = daysBetween(from, to);

  const ctx = { tenantId: tenant.id, unitId: unit.id };
  const assets = await listPublicRentalAssets(ctx, { from: parseDate(from), to: parseDate(to) });
  const hasAssets = assets.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      <header className="flex items-start justify-between gap-3">
        <div className="flex-1 text-center">
          <div className="text-xl font-semibold">{unit.name}</div>
          <div className="text-sm text-[color:var(--color-muted)]">{tenant.name}</div>
        </div>
        <LanguageSwitcher locale={locale} />
      </header>

      {sp.err && (
        <div className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-center text-sm text-[color:var(--color-danger)]">
          {ERR_CODES.has(sp.err) ? t(`rental.err.${sp.err}`) : t("err.general")}
        </div>
      )}

      {/* เลือกช่วงวันที่ (GET — โหลดสินทรัพย์ว่างใหม่) */}
      <form method="get" className="card flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">{t("rental.pickup")}</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              min={today}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">{t("rental.return")}</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              min={addDaysStr(from, 1)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button className="btn btn-primary min-h-[44px] text-base">{t("rental.search")}</button>
      </form>

      <div className="text-center text-sm text-[color:var(--color-muted)]">
        {t("rental.range", { days, from, to })}
      </div>

      {/* รายการสินทรัพย์ */}
      {!hasAssets ? (
        <div className="rounded-xl border px-4 py-8 text-center text-sm text-[color:var(--color-muted)]">
          {t("rental.noAssets")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {assets.map((a) => {
            const total = a.dailyRateSatang * days;
            return (
              <div key={a.id} className="card flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      ฿{baht(a.dailyRateSatang, locale)}
                      {t("rental.perDay")}
                      {a.depositSatang > 0
                        ? ` · ${t("rental.depositAmount", { amount: baht(a.depositSatang, locale) })}`
                        : ""}
                      {a.code ? ` · ${a.code}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-semibold">฿{baht(total, locale)}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">{t("rental.days", { n: days })}</div>
                  </div>
                </div>

                {!a.available ? (
                  <div className="rounded-lg bg-[color:var(--color-surface-2,#f5f5f5)] px-3 py-2 text-center text-sm text-[color:var(--color-muted)]">
                    {t("rental.taken")}
                  </div>
                ) : (
                  <form action={createPublicRentalAction} className="flex flex-col gap-2">
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <input type="hidden" name="unitSlug" value={unitSlug} />
                    <input type="hidden" name="assetId" value={a.id} />
                    <input type="hidden" name="from" value={from} />
                    <input type="hidden" name="to" value={to} />
                    <input
                      name="customerName"
                      required
                      maxLength={120}
                      placeholder={t("rental.form.name")}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <input
                      name="customerPhone"
                      required
                      inputMode="tel"
                      maxLength={32}
                      placeholder={t("rental.form.phone")}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <button className="btn btn-primary min-h-[44px] text-base">
                      {t("rental.book")}
                      {a.depositSatang > 0
                        ? ` · ${t("rental.depositAmount", { amount: baht(a.depositSatang, locale) })}`
                        : ""}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        {t("rental.footer")}
      </p>
    </main>
  );
}
