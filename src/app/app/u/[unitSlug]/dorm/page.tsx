import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { evaluate } from "@/lib/core/rbac";
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
  // SVC D.17 ▸ ปุ่ม "ประกาศ" เฉพาะผู้ถือ dorm.announce (จอประกาศตรวจสิทธิ์+ขอบเขตอาคารสดซ้ำเอง) ◂
  const canAnnounce = evaluate(actor, { module: "dorm", action: "dorm.announce", unitId: unit.id });
  // SVC D.15-K3 ▸ รอบบิล = ผู้เห็นเงิน (หน้า /dorm/billing ตรวจ dorm.view + สิทธิ์ส่งเอง) · นำเข้า = dorm.import (หน้าตรวจซ้ำ) ◂
  const showBilling = dormAccess(actor, unit.id).money;
  const canImport = evaluate(actor, { module: "dorm", action: "dorm.import", unitId: unit.id });

  return (
    <DormHome model={home} unitSlug={unitSlug} announceHref={canAnnounce ? `/app/u/${unitSlug}/dorm/announce` : null}
      billingHref={showBilling ? `/app/u/${unitSlug}/dorm/billing` : null}
      importHref={canImport ? `/app/u/${unitSlug}/dorm/tenants/import` : null}
    >
      <RoomBoard cells={home.cells} date={home.date} buildings={home.buildings} occupantLabels={home.occupantLabels} finance={home.finance} />
    </DormHome>
  );
}
