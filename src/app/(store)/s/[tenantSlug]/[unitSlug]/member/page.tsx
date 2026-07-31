import Link from "next/link";
import { cookies } from "next/headers";
import { resolveMemberUnit } from "@/lib/modules/member/service";
import { registerMemberAction } from "./actions";
import { getLocaleFromCookie, makeT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";

// ?err= จาก action เป็นรหัส → หน้าเป็นคนแปล
const ERR_CODES = new Set(["rate", "shop", "identity", "phone", "email", "failed"]);

// หน้าสมัครสมาชิกออนไลน์ (public · ไม่ต้องล็อกอิน) — กรอกชื่อ/เบอร์/อีเมล + ยินยอมรับข่าวสาร (PDPA)
export default async function PublicMemberSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string; code?: string; name?: string; phone?: string; email?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  const resolved = await resolveMemberUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("member.notFound.title")}</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{t("member.notFound.desc")}</p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // หน้า "สมัครสำเร็จ" — แสดงรหัสสมาชิก
  if (sp.code) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-12 text-center">
        <div className="text-2xl font-semibold">{t("member.done.title")}</div>
        <p className="text-sm text-[color:var(--color-muted)]">
          {t("member.done.welcome", { shop: unit.name })}
        </p>
        <div className="rounded-2xl border p-5">
          <div className="text-xs text-[color:var(--color-muted)]">{t("member.done.codeLabel")}</div>
          <div className="mt-1 text-3xl font-bold tracking-widest">{sp.code}</div>
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">
          {t("member.done.saveHint")}
        </p>
        <Link
          href={`/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/member`}
          className="btn min-h-[44px] text-sm"
        >
          {t("member.done.again")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      <header className="flex items-start justify-between gap-3">
        <div className="flex-1 text-center">
          <div className="text-xl font-semibold">{t("member.title", { shop: unit.name })}</div>
          <div className="text-sm text-[color:var(--color-muted)]">{tenant.name}</div>
        </div>
        <LanguageSwitcher locale={locale} />
      </header>

      {sp.err && (
        <div className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-center text-sm text-[color:var(--color-danger)]">
          {ERR_CODES.has(sp.err) ? t(`member.err.${sp.err}`) : t("err.general")}
        </div>
      )}

      <form action={registerMemberAction} className="card flex flex-col gap-3">
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="unitSlug" value={unitSlug} />

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">{t("member.form.name")}</span>
          <input
            name="name"
            defaultValue={sp.name ?? ""}
            placeholder={t("member.ph.name")}
            className="input min-h-[44px]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">{t("member.form.phone")}</span>
          <input
            name="phone"
            inputMode="tel"
            defaultValue={sp.phone ?? ""}
            placeholder={t("member.ph.phone")}
            className="input min-h-[44px]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">{t("member.form.email")}</span>
          <input
            name="email"
            type="email"
            defaultValue={sp.email ?? ""}
            placeholder="name@example.com"
            className="input min-h-[44px]"
          />
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="marketingConsent" className="mt-0.5 h-5 w-5" />
          <span>{t("member.consent")}</span>
        </label>

        <p className="text-xs text-[color:var(--color-muted)]">
          {t("member.hint")}
        </p>

        <button className="btn btn-primary min-h-[44px] text-sm">{t("member.submit")}</button>
      </form>
    </main>
  );
}
