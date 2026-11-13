import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUnit } from "@/lib/core/context";
import { loadTripsNav } from "@/lib/modules/trips";
import TripsNav from "@/components/trips/TripsNav";
import TripsForbidden from "@/components/trips/TripsForbidden";
import TripsCatch from "@/components/trips/TripsCatch";

// TRIPS T1.1 ▸ โครงโมดูลทัวร์ (ภาพ 11/16/17/18 แถบบน · ใบสั่ง T1.1 §3 · แบบ hotel/layout.tsx)
//   หน่วยต้องเป็น "TRIPS" (อื่น ⇒ notFound) · แท็บ 6 ตัวจาก loadTripsNav (การเห็นตามสิทธิ์) · ไม่มีสิทธิ์ trips เลย ⇒ <TripsForbidden> แทนเนื้อหา
//   ส่วนที่โหลดข้อมูล (แถบ + หน้า) อยู่ใน <TripsShell> ใต้ <TripsCatch> — error.tsx ของ segment ไม่ครอบ layout ของตัวเอง (Next 16.2)
//   layout ไม่ใช่ด่านเดียว — ทุก page.tsx ผ่าน tripsPageGate ของตัวเอง (ตัวด่านหน่วยใช้ React.cache ⇒ อ่านสมาชิกภาพครั้งเดียวต่อคำขอ)
export default async function TripsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "TRIPS") notFound();
  return (
    <TripsCatch>
      <TripsShell ctx={{ tenantId: auth.active.tenantId, actorUserId: auth.user.id }} unitId={unit.id}>
        {children}
      </TripsShell>
    </TripsCatch>
  );
}

async function TripsShell({ ctx, unitId, children }: { ctx: { tenantId: string; actorUserId: string }; unitId: string; children: React.ReactNode }) {
  const r = await loadTripsNav(ctx, { unitId });
  if (!r.ok) {
    if (r.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  const t = await getTranslations("trips");
  const entries = r.nav.entries
    .filter((e) => e.visible)
    .map((e) => ({ key: e.key, href: e.href, available: e.available, label: t(`nav.${e.key}`), soon: e.available ? null : t("nav.soon") }));
  return (
    <div data-trips="" className="flex w-full min-w-0 flex-col gap-5">
      <TripsNav unitName={r.nav.unitName} entries={entries} ariaLabel={t("nav.aria")} />
      {children}
    </div>
  );
}
