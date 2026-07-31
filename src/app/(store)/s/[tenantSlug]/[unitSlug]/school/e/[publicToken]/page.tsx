import Link from "next/link";
import { cookies } from "next/headers";
import {
  resolveSchoolUnit,
  getPublicEnrollment,
  promptpayForEnrollment,
} from "@/lib/modules/school/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { PromptPayQr } from "@/components/PromptPayQr";
import { getLocaleFromCookie, makeT, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// ฿ คงเดิมทั้งสองภาษา · ตัวเลข/วันที่จัดรูปตาม locale (en ใช้ en-GB)
const baht = (satang: number, locale: Locale) =>
  (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { minimumFractionDigits: 0 });

function fmtDate(d: Date, locale: Locale) {
  return d.toLocaleDateString(locale === "en" ? "en-GB" : "th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

// ป้ายสถานะการสมัคร (ผู้ปกครองเห็น) — คืน "คีย์" ให้หน้าเป็นคนแปล
function statusMeta(status: string) {
  if (status === "PAID") return { key: "school.st.PAID", tone: "done" as const };
  if (status === "CANCELLED") return { key: "school.st.CANCELLED", tone: "gone" as const };
  if (status === "REFUNDED") return { key: "school.st.REFUNDED", tone: "gone" as const };
  return { key: "school.st.ENROLLED", tone: "wait" as const }; // ENROLLED
}

// หน้าจ่ายค่าเรียน + สถานะการสมัคร (public จาก publicToken)
//   ENROLLED → PromptPayQr (ค่าเรียน) + "สแกนจ่ายแล้วรอร้านยืนยัน" + auto-refresh
//   PAID     → ยืนยันชำระแล้ว เรียนได้
//   CANCELLED/REFUNDED → แจ้งสถานะ
export default async function PublicSchoolEnrollmentPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/school`;
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

  // กัน cross-tenant: token ต้องเป็นของ unit นี้ (ไม่งั้น leak PII ผู้เรียนร้านอื่น)
  const en = await getPublicEnrollment(unit.id, publicToken);
  if (!en) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("school.e.notFound.title")}</div>
        <p className="text-sm text-[color:var(--color-muted)]">{t("school.e.notFound.desc")}</p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          {t("school.e.enrollCta")}
        </Link>
      </main>
    );
  }

  const meta = statusMeta(en.status);
  const awaitingPayment = en.status === "ENROLLED";
  const pp = awaitingPayment ? await promptpayForEnrollment(
    { tenantId: tenant.id, unitId: unit.id },
    en.id,
  ) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      {awaitingPayment && <AutoRefresh ms={15000} />}

      <header className="text-center">
        <div className="text-base font-semibold">{unit.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {/* สรุปการสมัคร */}
      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("school.e.title")}</span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              meta.tone === "wait"
                ? "bg-amber-100 text-amber-800"
                : meta.tone === "done"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-200 text-gray-700"
            }`}
          >
            {t(meta.key)}
          </span>
        </div>
        <div className="text-sm font-medium">{en.class.course.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {en.class.name}
          {en.class.startDate
            ? ` · ${t("school.startsOn", { date: fmtDate(en.class.startDate, locale) })}`
            : ""}
        </div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {t("school.e.student")}: {en.studentName}
        </div>
        <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("school.e.fee")}</span>
          <span className="font-semibold">฿{baht(en.priceSatang, locale)}</span>
        </div>
      </section>

      {/* จ่ายค่าเรียน (เฉพาะยังไม่จ่าย) */}
      {awaitingPayment && (
        <section className="card flex flex-col items-center gap-3">
          {pp ? (
            <>
              <div className="text-sm font-medium">{t("school.e.scanPay")}</div>
              <PromptPayQr payload={pp.payload} caption={`฿${baht(en.priceSatang, locale)}`} />
              {pp.displayName && (
                <div className="text-xs text-[color:var(--color-muted)]">{pp.displayName}</div>
              )}
              <p className="text-center text-sm text-[color:var(--color-muted)]">
                {t("school.e.afterScan")}
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-[color:var(--color-muted)]">
              {t("school.e.noPromptpay")}
            </p>
          )}
        </section>
      )}

      {en.status === "PAID" && (
        <p className="text-center text-sm text-green-700">
          {t("school.e.paid")}
        </p>
      )}
      {en.status === "CANCELLED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          {t("school.e.cancelled")}
        </p>
      )}
      {en.status === "REFUNDED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          {t("school.e.refunded")}
        </p>
      )}

      <div className="text-center">
        <Link href={base} className="text-sm underline">
          {t("school.e.back")}
        </Link>
      </div>
    </main>
  );
}
