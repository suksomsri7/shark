import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { listBuildings, roomBoard } from "@/lib/modules/rooms";
import RoomBoard from "@/components/rooms/RoomBoard";
import { PageHeader } from "@/components/ui/PageHeader";

// ผังห้องหอ (SVC R0.9 · ขั้นต่ำ) — ภาพ ledger/design-dorm/01-floorplan.png ส่วนผัง
//   ข้อมูลผ่าน facade `@/lib/modules/rooms` เท่านั้น (ไม่แตะ prisma) · หน่วยต้องเป็น DORM (อื่น ⇒ notFound)
//   ยังไม่ส่งชื่อผู้เช่า/ป้ายการเงิน — D.13 เติม (KPI · ต้องทำวันนี้ · รอบบิล ขยายในไฟล์นี้)
export default async function DormFloorPlanPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();

  const ctx = { tenantId: auth.active.tenantId };
  const date = bkkYmd(new Date());
  const [cells, buildings] = await Promise.all([roomBoard(ctx, { unitId: unit.id, date }), listBuildings(ctx, { unitId: unit.id })]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <PageHeader title="ผังห้อง" back={{ href: `/app/u/${unitSlug}`, label: unit.name }} desc={`${unit.name} · ${cells.length} ห้อง`} />
      <RoomBoard cells={cells} date={date} buildings={buildings.map((b) => ({ id: b.id, name: b.name }))} />
    </div>
  );
}
