import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { tripsPageGate } from "@/lib/modules/trips";
import TripsForbidden from "@/components/trips/TripsForbidden";
import TripsNotYet from "@/components/trips/TripsNotYet";

// TRIPS T1.1 ▸ แท็บ "agents" ยังไม่สร้าง (ใบ A1.2) — ลิงก์จริงในแถบ ⇒ หน้า "ยังไม่เปิดใช้" ผ่านด่าน tripsPageGate (สิทธิ์ตามตารางใบสั่ง §3)
export default async function TripsAgentsPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const g = await tripsPageGate({ tenantId: auth.active.tenantId, actorUserId: auth.user.id }, { unitId: unit.id, page: "agents" });
  if (!g.ok) {
    if (g.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  return <TripsNotYet wo="A1.2" titleKey="nav.agents" />;
}
