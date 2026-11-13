import { notFound, redirect } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { tripsPageGate } from "@/lib/modules/trips";
import TripsForbidden from "@/components/trips/TripsForbidden";

// TRIPS T1.1 ▸ /trips → แท็บแรกที่ผู้ใช้เห็น (สินค้า · ไม่เห็นสินค้าแต่ตั้งค่าได้ ⇒ ตั้งค่า) — ด่าน tripsPageGate
export default async function TripsIndexPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.user.id };
  const g = await tripsPageGate(ctx, { unitId: unit.id, page: "products" });
  if (g.ok) redirect(`/app/u/${unitSlug}/trips/products`);
  if (g.code !== "FORBIDDEN") notFound();
  const s = await tripsPageGate(ctx, { unitId: unit.id, page: "settings" });
  if (s.ok) redirect(`/app/u/${unitSlug}/trips/settings`);
  return <TripsForbidden />;
}
