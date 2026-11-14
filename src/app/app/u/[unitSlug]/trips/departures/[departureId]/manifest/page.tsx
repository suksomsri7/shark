import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { DEPARTURE_SELL_CHANNELS, MANIFEST_VIEWS, loadManifestVM, tripsPageGate } from "@/lib/modules/trips";
import TripsForbidden from "@/components/trips/TripsForbidden";
import ManifestScreen from "@/components/trips/ManifestScreen";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const CTL_RE = /[\u0000-\u001f\u007f]/;

// TRIPS T1.4 ▸ ใบรายชื่อรายวันของรอบ ฝั่งร้าน (ภาพ 12 ส่วนจอใหญ่ · ใบสั่ง T1.4 ส่วน a §2) — หน้าบาง: ด่าน → ตัวโหลด → คอมโพเนนต์
//   query: ?view=pickup|booking (อ่านไม่ได้ ⇒ ทิ้ง ใช้ค่าปริยาย "pickup" · ไม่ 404)
//   departureId มีอักขระควบคุม/ยาวเกิน 128/ไม่มี/ของหน่วยอื่น ⇒ notFound() · ไม่มีสิทธิ์ ⇒ <TripsForbidden> · ตัวโหลดใช้นาฬิกาจริง (หน้าไม่ส่งเวลา)
export default async function TripsManifestPage({ params, searchParams }: { params: Promise<{ unitSlug: string; departureId: string }>; searchParams: SearchP }) {
  const { unitSlug, departureId } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.user.id };
  const g = await tripsPageGate(ctx, { unitId: unit.id, page: "departures" });
  if (!g.ok) {
    if (g.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  if (departureId.length < 1 || departureId.length > 128 || CTL_RE.test(departureId)) notFound();
  const view = MANIFEST_VIEWS.find((v) => v === one(sp.view));
  const r = await loadManifestVM(ctx, { unitId: unit.id, departureId, ...(view ? { view } : {}) });
  if (!r.ok) {
    if (r.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  const channels: readonly string[] = DEPARTURE_SELL_CHANNELS;
  return <ManifestScreen unitSlug={unitSlug} vm={r.vm} channels={channels} printedBy={auth.user.name?.trim() || auth.user.email} />;
}
