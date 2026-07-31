import { cookies } from "next/headers";
import { resolveUnit, listPublicEvents } from "@/lib/modules/ticket/service";
import { createPublicTicketOrderAction } from "./actions";
import { getLocaleFromCookie, makeT, type Locale } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";

// ฿ คงเดิมทั้งสองภาษา · ตัวเลข/วันที่จัดรูปตาม locale (en ใช้ en-GB)
const baht = (satang: number, locale: Locale) =>
  (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { minimumFractionDigits: 0 });

// ?err= จาก action เป็นรหัส → หน้าเป็นคนแปล (รหัสแปลกปลอม = ข้อความกลาง)
const ERR_CODES = new Set(["rate", "shop", "event", "eventClosed", "name", "phone", "max", "qty", "failed"]);

function fmtEvent(d: Date, locale: Locale) {
  return d.toLocaleString(locale === "en" ? "en-GB" : "th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

// หน้าซื้อตั๋วออนไลน์ (public · ไม่ต้องล็อกอิน) — เลือกงาน → เลือกประเภท+จำนวน → กรอกชื่อ/เบอร์ → ซื้อ
export default async function PublicTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string; event?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("ticket.notFound.title")}</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{t("ticket.notFound.desc")}</p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  const events = await listPublicEvents(tenant.id, unit.id);
  const hasEvents = events.length > 0;

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
          {ERR_CODES.has(sp.err) ? t(`ticket.err.${sp.err}`) : t("err.general")}
        </div>
      )}

      {!hasEvents ? (
        <div className="rounded-xl border px-4 py-8 text-center text-sm text-[color:var(--color-muted)]">
          {t("ticket.noEvents")}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((ev) => {
            const allSoldOut = ev.types.length > 0 && ev.types.every((tt) => tt.remaining < 1);
            const noTypes = ev.types.length === 0;
            return (
              <section key={ev.id} className="card flex flex-col gap-3">
                <div>
                  <div className="text-base font-semibold">{ev.name}</div>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    {fmtEvent(ev.startAt, locale)}
                    {ev.venue ? ` · ${ev.venue}` : ""}
                  </div>
                  {ev.description && (
                    <p className="mt-1 text-sm text-[color:var(--color-muted)]">{ev.description}</p>
                  )}
                </div>

                {noTypes ? (
                  <div className="rounded-lg bg-[color:var(--color-surface-2,#f5f5f5)] px-3 py-2 text-center text-sm text-[color:var(--color-muted)]">
                    {t("ticket.noTypes")}
                  </div>
                ) : allSoldOut ? (
                  <div className="rounded-lg bg-[color:var(--color-surface-2,#f5f5f5)] px-3 py-2 text-center text-sm text-[color:var(--color-muted)]">
                    {t("ticket.allSoldOut")}
                  </div>
                ) : (
                  <form action={createPublicTicketOrderAction} className="flex flex-col gap-3">
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <input type="hidden" name="unitSlug" value={unitSlug} />
                    <input type="hidden" name="eventId" value={ev.id} />

                    <div className="flex flex-col gap-2">
                      {ev.types.map((tt) => {
                        const soldOut = tt.remaining < 1;
                        return (
                          <div
                            key={tt.id}
                            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{tt.name}</div>
                              <div className="text-xs text-[color:var(--color-muted)]">
                                ฿{baht(tt.priceSatang, locale)}
                                {soldOut
                                  ? ` · ${t("ticket.soldOut")}`
                                  : tt.remaining <= 10
                                    ? ` · ${t("ticket.left", { n: tt.remaining })}`
                                    : ""}
                              </div>
                              {tt.description && (
                                <div className="text-xs text-[color:var(--color-muted)]">
                                  {tt.description}
                                </div>
                              )}
                            </div>
                            <input
                              type="number"
                              name={`qty:${tt.id}`}
                              defaultValue={0}
                              min={0}
                              max={Math.min(50, tt.remaining)}
                              disabled={soldOut}
                              inputMode="numeric"
                              aria-label={t("ticket.qtyLabel", { name: tt.name })}
                              className="w-16 shrink-0 rounded-lg border px-2 py-2 text-center text-sm disabled:opacity-40"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <input
                      name="buyerName"
                      required
                      maxLength={120}
                      placeholder={t("ticket.form.name")}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <input
                      name="buyerPhone"
                      required
                      inputMode="tel"
                      maxLength={32}
                      placeholder={t("ticket.form.phone")}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <button className="btn btn-primary min-h-[44px] text-base">{t("ticket.buy")}</button>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        {t("ticket.footer")}
      </p>
    </main>
  );
}
