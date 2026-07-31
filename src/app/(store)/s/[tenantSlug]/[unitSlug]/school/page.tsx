import { cookies } from "next/headers";
import { resolveSchoolUnit, listPublicClasses } from "@/lib/modules/school/service";
import { createPublicEnrollmentAction } from "./actions";
import { getLocaleFromCookie, makeT, type Locale } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";

// ฿ คงเดิมทั้งสองภาษา · ตัวเลข/วันที่จัดรูปตาม locale (en ใช้ en-GB)
const baht = (satang: number, locale: Locale) =>
  (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { minimumFractionDigits: 0 });

// ?err= จาก action เป็นรหัส → หน้าเป็นคนแปล
const ERR_CODES = new Set(["rate", "shop", "class", "name", "phone", "failed"]);

function fmtDate(d: Date, locale: Locale) {
  return d.toLocaleDateString(locale === "en" ? "en-GB" : "th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

// หน้าสมัครเรียนออนไลน์ (public · ไม่ต้องล็อกอิน) — เลือกรอบเรียน → กรอกชื่อผู้เรียน/เบอร์ผู้ปกครอง → สมัคร
export default async function PublicSchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string; class?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  const resolved = await resolveSchoolUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("school.notFound.title")}</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{t("school.notFound.desc")}</p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  const classes = await listPublicClasses({ tenantId: tenant.id, unitId: unit.id });
  const hasClasses = classes.length > 0;

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
          {ERR_CODES.has(sp.err) ? t(`school.err.${sp.err}`) : t("err.general")}
        </div>
      )}

      {!hasClasses ? (
        <div className="rounded-xl border px-4 py-8 text-center text-sm text-[color:var(--color-muted)]">
          {t("school.noClasses")}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {classes.map((cl) => (
            <section key={cl.id} className="card flex flex-col gap-3">
              <div>
                <div className="text-base font-semibold">{cl.courseName}</div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {cl.className}
                  {cl.startDate ? ` · ${t("school.startsOn", { date: fmtDate(cl.startDate, locale) })}` : ""}
                </div>
                <div className="mt-1 text-sm font-medium">
                  ฿{baht(cl.priceSatang, locale)}
                  {cl.remaining !== null && !cl.full && cl.remaining <= 5 ? (
                    <span className="text-[color:var(--color-muted)]">
                      {t("school.seatsLeft", { n: cl.remaining })}
                    </span>
                  ) : null}
                </div>
                {cl.description && (
                  <p className="mt-1 text-sm text-[color:var(--color-muted)]">{cl.description}</p>
                )}
              </div>

              {cl.full ? (
                <div className="rounded-lg bg-[color:var(--color-surface-2,#f5f5f5)] px-3 py-2 text-center text-sm text-[color:var(--color-muted)]">
                  {t("school.classFull")}
                </div>
              ) : (
                <form action={createPublicEnrollmentAction} className="flex flex-col gap-2">
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="unitSlug" value={unitSlug} />
                  <input type="hidden" name="classId" value={cl.id} />
                  <input
                    name="studentName"
                    required
                    maxLength={120}
                    placeholder={t("school.form.student")}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                  <input
                    name="parentPhone"
                    required
                    inputMode="tel"
                    maxLength={32}
                    placeholder={t("school.form.parentPhone")}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                  <button className="btn btn-primary min-h-[44px] text-base">
                    {t("school.enroll", { price: baht(cl.priceSatang, locale) })}
                  </button>
                </form>
              )}
            </section>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        {t("school.footer")}
      </p>
    </main>
  );
}
