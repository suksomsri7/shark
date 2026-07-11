import { getTranslations } from "next-intl/server";
import Link from "next/link";

// Landing — shark.in.th (marketing). B&W minimal.
export default async function LandingPage() {
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="text-sm font-semibold tracking-widest text-[color:var(--color-muted)]">
        {tApp("name")}
      </div>
      <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">{t("headline")}</h1>
      <p className="max-w-xl text-lg text-[color:var(--color-muted)]">{t("sub")}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/signup" className="btn btn-primary">
          {t("ctaSignup")}
        </Link>
        <Link href="/login" className="btn btn-ghost">
          {t("ctaLogin")}
        </Link>
      </div>
    </main>
  );
}
