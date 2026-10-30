import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { resolvePublicUnit } from "@/lib/core/storefront";
import { loadOnlineBooking, type OnlineQuery } from "@/lib/modules/booking/online";
import PublicBooking from "@/components/public-booking";
import { makeT } from "@/lib/i18n";

// ประเภทกิจการที่มี storefront ของตัวเอง → landing เด้งเข้าหน้านั้น
// (ลูกค้าซื้อตั๋ว/จองเช่า/สมัครเรียน/ขอนัด ได้เองโดยไม่ต้องล็อกอิน)
const REDIRECT_BY_TYPE: Record<string, string> = {
  TICKET: "ticket",
  RENTAL: "rental",
  SCHOOL: "school",
  CLINIC: "clinic",
};

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" ? v : undefined);

// SVC B.7 ▸ มี who (ลิงก์ตัวตนจาก LINE · token อยู่ใน URL) ⇒ ไม่ส่ง referrer + ไม่ index ◂
export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  return one(sp?.who) ? { robots: { index: false, follow: false }, referrer: "no-referrer" } : {};
}

// หน้าจองสาธารณะของกิจการ (BOOKING) — /s/[tenantSlug]/[unitSlug]
// SVC B.7: จองออนไลน์ 3 ขั้น (ภาพ จอง 03) — ทุกขั้นอยู่ใน URL (?svc=&staff=&date=&time=&who=&lang=) · ทางเด้งประเภทอื่นคงเดิม
export default async function StoreBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<SP>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const query: OnlineQuery = {};
  for (const k of ["svc", "staff", "date", "time", "who", "lang"] as const) {
    const v = one(sp?.[k]);
    if (v) query[k] = v;
  }
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  // O5: loadOnlineBooking นับถังหน้าจองก่อนค้นฐาน · ไม่ใช่สาขา BOOKING ⇒ ทางเด้งประเภทอื่นเหมือนเดิม
  const r = await loadOnlineBooking({ tenantSlug, unitSlug }, query, { ip });
  if (!r.ok && r.code === "NOT_FOUND") {
    // คิวรีเดียว แล้วแตกทางตาม unit.type (ผลลัพธ์เหมือนเดิมทุกกรณี)
    const resolved = await resolvePublicUnit(tenantSlug, unitSlug);
    if (!resolved) notFound();
    const target = REDIRECT_BY_TYPE[resolved.unit.type];
    if (target) redirect(`/s/${tenantSlug}/${unitSlug}/${target}`);
    notFound();
  }
  if (!r.ok) {
    const t = makeT(query.lang === "en" ? "en" : "th");
    return (
      <main className="mx-auto w-full max-w-[420px] flex-1 px-5 py-16 text-center">
        <p className="text-[15px] text-[#525252]">{t("bk7.rateLimited")}</p>
      </main>
    );
  }
  const idempotencyKey = r.view.step === 3 ? randomUUID() : "";
  return (
    <main className="w-full flex-1 bg-white">
      <PublicBooking view={r.view} basePath={`/s/${tenantSlug}/${unitSlug}`} query={query} idempotencyKey={idempotencyKey} />
    </main>
  );
}
