import Link from "next/link";
import { cookies } from "next/headers";
import {
  resolveHotelUnit,
  getPublicReservation,
  promptpayForDeposit,
} from "@/lib/modules/hotel/service";
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
    timeZone: "UTC",
  });
}

// ป้ายสถานะการจอง (ลูกค้าเห็น) — ผูกกับมัดจำ/สถานะห้อง · คืน "คีย์" ให้หน้าเป็นคนแปล
function statusMeta(status: string, depositRequired: boolean, depositPaid: boolean) {
  if (status === "CANCELLED") return { key: "hotel.st.CANCELLED", tone: "gone" as const };
  if (status === "REFUNDED") return { key: "hotel.st.REFUNDED", tone: "gone" as const };
  if (status === "CHECKED_OUT") return { key: "hotel.st.CHECKED_OUT", tone: "done" as const };
  if (status === "CHECKED_IN") return { key: "hotel.st.CHECKED_IN", tone: "done" as const };
  // BOOKED
  if (depositRequired && !depositPaid) return { key: "hotel.st.awaitDeposit", tone: "wait" as const };
  if (depositRequired && depositPaid) return { key: "hotel.st.confirmed", tone: "done" as const };
  return { key: "hotel.st.booked", tone: "done" as const };
}

// หน้าสถานะการจอง + จ่ายมัดจำ (public จาก publicToken) — auto-refresh ตอนยังรอยืนยัน
export default async function PublicReservationStatusPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/hotel`;
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  const resolved = await resolveHotelUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("hotel.notFound.title")}</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{t("hotel.notFound.desc")}</p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // กัน cross-tenant: token ต้องเป็นของ unit นี้ (ไม่งั้น leak PII แขกร้านอื่น)
  const rv = await getPublicReservation(unit.id, publicToken);
  if (!rv) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("hotel.rv.notFound.title")}</div>
        <p className="text-sm text-[color:var(--color-muted)]">{t("hotel.rv.notFound.desc")}</p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          {t("hotel.rv.bookCta")}
        </Link>
      </main>
    );
  }

  const depositRequired = rv.depositSatang > 0;
  const depositPaid = !!rv.depositPaidAt;
  const meta = statusMeta(rv.status, depositRequired, depositPaid);
  const awaitingDeposit = rv.status === "BOOKED" && depositRequired && !depositPaid;
  const pp = awaitingDeposit ? await promptpayForDeposit(tenant.id, unit.id, rv.id) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      {awaitingDeposit && <AutoRefresh ms={15000} />}

      <header className="text-center">
        <div className="text-base font-semibold">{unit.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {/* สรุปการจอง */}
      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("hotel.rv.title", { code: rv.code })}</span>
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
        <div className="text-sm">{rv.guestName}</div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {rv.roomType.name} · {fmtDate(rv.checkInDate, locale)}–{fmtDate(rv.checkOutDate, locale)} ·{" "}
          {t("hotel.nights", { n: rv.nights })}
        </div>
        <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("hotel.rv.roomTotal")}</span>
          <span className="font-semibold">฿{baht(rv.totalSatang, locale)}</span>
        </div>
        {depositRequired && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[color:var(--color-muted)]">{t("hotel.deposit")}</span>
            <span className="font-medium">฿{baht(rv.depositSatang, locale)}</span>
          </div>
        )}
      </section>

      {/* จ่ายมัดจำ (เฉพาะยังไม่จ่าย) */}
      {awaitingDeposit && (
        <section className="card flex flex-col items-center gap-3">
          {pp ? (
            <>
              <div className="text-sm font-medium">{t("hotel.rv.scanDeposit")}</div>
              <PromptPayQr payload={pp.payload} caption={`฿${baht(rv.depositSatang, locale)}`} />
              {pp.displayName && (
                <div className="text-xs text-[color:var(--color-muted)]">{pp.displayName}</div>
              )}
              <p className="text-center text-sm text-[color:var(--color-muted)]">
                {t("hotel.rv.afterScan")}
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-[color:var(--color-muted)]">
              {t("hotel.rv.noPromptpay")}
            </p>
          )}
        </section>
      )}

      {rv.status === "BOOKED" && depositRequired && depositPaid && (
        <p className="text-center text-sm text-green-700">
          {t("hotel.rv.depositPaid")}
        </p>
      )}
      {rv.status === "BOOKED" && !depositRequired && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          {t("hotel.rv.confirmed")}
        </p>
      )}

      <div className="text-center">
        <Link href={base} className="text-sm underline">
          {t("hotel.rv.back")}
        </Link>
      </div>
    </main>
  );
}
