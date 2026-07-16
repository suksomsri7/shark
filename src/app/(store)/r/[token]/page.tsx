import { cookies } from "next/headers";
import { getPublicTaxContext } from "@/lib/modules/account/service";
import { requestTaxInvoiceAction } from "./actions";
import { formatThaiDateLong } from "@/lib/ui/date";
import { getLocaleFromCookie, makeT, type Locale } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";


// ฿ คงเดิมทั้งสองภาษา · ตัวเลขจัดกลุ่มตาม locale (en ใช้ en-GB)
const baht = (satang: number, locale: Locale) =>
  (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", {
    minimumFractionDigits: 2,
  });

// วันที่: ไทย = พ.ศ.เต็ม (helper กลาง) · en = en-GB (ค.ศ.) โซนไทย
const fmtDate = (d: Date | string, locale: Locale) =>
  locale === "en"
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Bangkok",
      })
    : formatThaiDateLong(d);

const labelCls = "flex flex-col gap-1 text-xs text-[color:var(--color-muted)]";
const inputCls = "rounded-lg border px-3 py-2 text-sm text-[color:var(--color-ink)]";

// §5.6 ลิงก์สาธารณะขอใบกำกับภาษี — ลูกค้าเปิดจาก QR/ลิงก์บนใบเสร็จ (ไม่ต้องล็อกอิน)
export default async function PublicTaxInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ err?: string; issued?: string; requested?: string }>;
}) {
  const { token } = await params;
  const { err, issued, requested } = await searchParams;
  const ctx = await getPublicTaxContext(token);

  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  if (!ctx) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[color:var(--color-surface-2)] p-6 text-center">
        <div className="text-xl font-semibold">{t("receipt.invalid.title")}</div>
        <div className="text-sm text-[color:var(--color-muted)]">{t("receipt.invalid.desc")}</div>
      </main>
    );
  }

  const alreadyNo = issued || ctx.existingTaxInvoiceNo;
  const isPending = !alreadyNo && (requested === "1" || ctx.pendingRequest);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-[color:var(--color-surface-2)] p-6">
      <header className="relative text-center">
        <div className="absolute right-0 top-0">
          <LanguageSwitcher locale={locale} />
        </div>
        <div className="text-lg font-bold">{ctx.orgName || t("receipt.title")}</div>
        <div className="mt-1 text-sm text-[color:var(--color-muted)]">{t("receipt.subtitle")}</div>
      </header>

      <div className="rounded-xl border bg-[color:var(--color-surface)] p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-[color:var(--color-muted)]">{t("receipt.field.docNo")}</span>
          <span className="font-medium">{ctx.docNo ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[color:var(--color-muted)]">{t("receipt.field.date")}</span>
          <span>{fmtDate(ctx.issueDate, locale)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[color:var(--color-muted)]">{t("receipt.field.total")}</span>
          <span className="font-semibold">฿{baht(ctx.grandTotal, locale)}</span>
        </div>
      </div>

      {!ctx.vatRegistered && (
        <div className="rounded-lg border bg-[color:var(--color-surface-2)] p-3 text-sm text-[color:var(--color-danger)]">
          {t("receipt.notVat")}
        </div>
      )}

      {alreadyNo ? (
        <div className="rounded-xl border bg-[color:var(--color-surface-2)] p-4 text-center text-sm">
          <div className="text-base font-semibold text-[color:var(--color-ink)]">{t("receipt.issued.title")}</div>
          <div className="mt-1 text-[color:var(--color-ink-soft)]">{t("receipt.issued.no", { no: alreadyNo })}</div>
          <div className="mt-2 text-[color:var(--color-muted)]">{t("receipt.issued.deliver")}</div>
        </div>
      ) : isPending ? (
        <div className="rounded-xl border bg-[color:var(--color-surface-2)] p-4 text-center text-sm">
          <div className="text-base font-semibold text-[color:var(--color-ink)]">{t("receipt.pending.title")}</div>
          <div className="mt-2 text-[color:var(--color-muted)]">{t("receipt.pending.desc")}</div>
        </div>
      ) : (
        ctx.vatRegistered && (
          <form action={requestTaxInvoiceAction} className="flex flex-col gap-3 rounded-xl border bg-[color:var(--color-surface)] p-4">
            <input type="hidden" name="token" value={token} />
            {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
            <label className={labelCls}>
              {t("receipt.form.name")}
              <input name="name" required className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("receipt.form.taxId")}
              <input
                name="taxId"
                required
                inputMode="numeric"
                pattern="[0-9]{13}"
                maxLength={13}
                placeholder="0000000000000"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              {t("receipt.form.branch")}
              <input name="branchCode" defaultValue="00000" className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("receipt.form.address")}
              <textarea name="address" rows={3} className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("receipt.form.phone")}
              <input name="phone" className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("receipt.form.email")}
              <input name="email" type="email" className={inputCls} />
            </label>
            <button className="mt-1 rounded-lg bg-[color:var(--color-ink)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-surface)]">
              {t("receipt.form.submit")}
            </button>
          </form>
        )
      )}

      <p className="text-center text-[11px] text-[color:var(--color-muted)]">
        {t("receipt.footer")}
      </p>
    </main>
  );
}
