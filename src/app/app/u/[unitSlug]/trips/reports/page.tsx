import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { loadTripReportVM, reportQueryOf, tripsPageGate } from "@/lib/modules/trips";
import TripsForbidden from "@/components/trips/TripsForbidden";
import ReportScreen from "@/components/trips/ReportScreen";

/** ช่องของตัวกรองที่ผิด ⇒ ชื่อใน input ที่ต้องทิ้ง (§5.7 · range = ทิ้ง from + to) */
const DROP: Record<string, readonly string[]> = { range: ["from", "to"], basis: ["basis"], product: ["productId"], channel: ["channel"], tab: ["tab"], group: ["group"], page: ["page"] };

// TRIPS T1.7a2 ▸ รายงานทัวร์ตามช่วงเวลา ฝั่งร้าน (ใบสั่ง T1.7a2 §5) — หน้าบาง: ด่าน → ตัวกรองจาก URL → ตัวโหลด → คอมโพเนนต์ (ส่งเฉพาะ vm + error)
//   ทางเข้า = ลิงก์บนหัวปฏิทินรอบ (ไม่มีแท็บใหม่ · C2) · ตัวกรองเป็นฟอร์ม GET (ใช้ได้โดยไม่มี JavaScript) · ตัวโหลดใช้นาฬิกาจริง (หน้าไม่ส่งเวลา)
//   ตัวกรองผิด (D5 · D6): ทิ้งเฉพาะช่องที่ผิดแล้วโหลดใหม่ (ไม่เกิน 8 ครั้ง) ⇒ ค่าที่ถูกคงไว้ + กล่องข้อผิดพลาดของรหัสแรก · ไม่ notFound จากตัวกรอง
//   RANGE_TOO_LARGE ⇒ ทิ้งช่วง · REPORT_TOO_LARGE ⇒ ทิ้งช่วง + สินค้า · notFound เฉพาะหน่วย/ร้านที่ไม่ใช่ของผู้ใช้
export default async function TripsReportsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.user.id };
  const g = await tripsPageGate(ctx, { unitId: unit.id, page: "departures" });
  if (!g.ok) {
    if (g.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  const q: Record<string, unknown> = { ...reportQueryOf(sp) };
  let error: string | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await loadTripReportVM(ctx, { unitId: unit.id, ...q });
    if (r.ok) return <ReportScreen vm={r.vm} error={error} />;
    if (r.code === "FORBIDDEN") return <TripsForbidden />;
    const drop = r.code === "REPORT_TOO_LARGE" ? ["from", "to", "productId"] : (r.code === "INVALID_INPUT" || r.code === "RANGE_TOO_LARGE" || r.code === "NOT_FOUND") && r.field ? (DROP[r.field] ?? []) : [];
    if (!drop.some((k) => k in q)) break;
    error ??= r.code;
    for (const k of drop) delete q[k];
  }
  notFound();
}
