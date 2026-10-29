import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { dormAccess, dormHomeModel } from "@/lib/modules/dorm";
import { roomBoard } from "@/lib/modules/rooms";
import RoomBoard from "@/components/rooms/RoomBoard";
import DormHome from "@/components/dorm/DormHome";

// หอ 01 ผังห้อง + KPI (SVC R0.9 ผัง · D.13 KPI/ต้องทำวันนี้/รอบบิล) — ภาพ ledger/design-dorm/01-floorplan.png
//   ข้อมูลผ่าน facade `@/lib/modules/rooms` + `@/lib/modules/dorm` เท่านั้น (ไม่แตะ prisma) · หน่วยต้องเป็น DORM (อื่น ⇒ notFound)
//   ผัง = roomBoard (แกนห้อง) → dormHomeModel ตัดขอบเขตอาคาร (#64) + เติมชื่อแรก/ป้ายเงิน (เฉพาะผู้เห็นเงิน) · actor จาก auth.active
export default async function DormFloorPlanPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  // SVC D.6 ▸ คนจดมิเตอร์ (มีแค่ dorm.meter.read) เห็นแค่หน้าจด — ผังต้องมี dorm.view
  if (!dormAccess(actor, unit.id).board) notFound();

  const ctx = { tenantId: auth.active.tenantId };
  const date = bkkYmd(new Date());
  const cells = await roomBoard(ctx, { unitId: unit.id, date });
  const home = await dormHomeModel(actor, ctx, { unitId: unit.id, date, cells });
  if (!home) notFound();

  return (
    <DormHome model={home} unitSlug={unitSlug}>
      <RoomBoard cells={home.cells} date={home.date} buildings={home.buildings} occupantLabels={home.occupantLabels} finance={home.finance} />
    </DormHome>
  );
}
