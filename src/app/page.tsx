import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { hostEntryPath } from "@/lib/domain/service";

// Root "/" — WO-0065 Host-routing gate + Landing (marketing) เดิม
// proxy (src/proxy.ts) ตั้ง header "x-shark-host" ให้เมื่อเข้าจาก custom domain ของร้าน (ไม่ใช่ root host)
// อ่าน header ที่ชั้น app (RSC, Node เต็ม DB ตาม ADR A6 ทาง ก) → หา path หน้าร้าน → redirect
// ไม่มี header / โดเมนยังไม่พร้อม → landing เดิมทุกประการ
// การอ่าน headers() ทำให้หน้านี้ dynamic (docs: headers.md §Good to know) — ยอมรับได้:
// landing เป็นหน้าเดียว เนื้อหาคงที่ต่อคำขอ ไม่มี ISR/static ที่ต้องรักษา
export default async function RootPage() {
  const host = (await headers()).get("x-shark-host");
  if (host) {
    const path = await hostEntryPath(host);
    if (path) redirect(path); // throw NEXT_REDIRECT — เรียกนอก try/catch (docs: redirect.md)
  }

  // ── Landing เดิม (ย้ายมาจาก (marketing)/page.tsx ไม่เปลี่ยน markup) ──
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
