import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { loadDepartureCostsVM, tripsPageGate } from "@/lib/modules/trips";
import TripsForbidden from "@/components/trips/TripsForbidden";
import CostScreen from "@/components/trips/CostScreen";

const CTL_RE = /[\u0000-\u001f\u007f]/;

// TRIPS T1.7a1 ▸ ต้นทุนและกำไรของรอบ ฝั่งร้าน (ใบสั่ง T1.7 §1 §5.2) — หน้าบาง: ด่าน → ตัวโหลด → คอมโพเนนต์ (ส่งเฉพาะ vm)
//   ทางเข้า = ปุ่มในแผงรอบของปฏิทิน (ไม่มีแท็บใหม่ · C2) · สิทธิ์ต้นทุนแคบ (ตัวโหลดตัดสิน) · ตัวโหลดใช้นาฬิกาจริง (หน้าไม่ส่งเวลา)
//   departureId มีอักขระควบคุม/ยาวเกิน 128/ไม่มี/ของหน่วยอื่น ⇒ notFound() · ไม่มีสิทธิ์ ⇒ <TripsForbidden>
export default async function TripsDepartureCostsPage({ params }: { params: Promise<{ unitSlug: string; departureId: string }> }) {
  const { unitSlug, departureId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.user.id };
  const g = await tripsPageGate(ctx, { unitId: unit.id, page: "departures" });
  if (!g.ok) {
    if (g.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  if (departureId.length < 1 || departureId.length > 128 || CTL_RE.test(departureId)) notFound();
  const r = await loadDepartureCostsVM(ctx, { unitId: unit.id, departureId });
  if (!r.ok) {
    if (r.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  return <CostScreen vm={r.vm} />;
}
