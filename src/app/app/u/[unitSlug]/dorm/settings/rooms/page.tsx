import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormSetupModel } from "@/lib/modules/dorm";
import DormRoomsSetup from "@/components/dorm/DormRoomsSetup";
import {
  archiveDormRoomAction,
  archiveDormRoomTypeAction,
  removeDormBuildingAction,
  saveDormBuildingAction,
  saveDormRoomAction,
  saveDormRoomTypeAction,
} from "./actions";

// SVC D.15-K2 ▸ ตั้งค่า "อาคาร · ชั้น · ห้อง" + "ประเภทห้อง · ค่าเช่า" ของหอ — ข้อมูลผ่าน facade `@/lib/modules/dorm` (setup.ts · ไม่แตะ prisma)
//   หน่วยต้องเป็น DORM · ดู = dorm.view · แก้ = dorm.settings.edit · ถูกจำกัดอาคาร ⇒ เห็น/แก้ห้องเฉพาะอาคารตัวเอง (dormActorScope) · ไม่ผ่าน ⇒ 404
export default async function DormRoomsSetupPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const model = await dormSetupModel({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id });
  if (!model) notFound();
  return (
    <DormRoomsSetup
      model={model}
      unitSlug={unitSlug}
      actions={{
        saveBuilding: saveDormBuildingAction.bind(null, unitSlug),
        removeBuilding: removeDormBuildingAction.bind(null, unitSlug),
        saveRoomType: saveDormRoomTypeAction.bind(null, unitSlug),
        archiveRoomType: archiveDormRoomTypeAction.bind(null, unitSlug),
        saveRoom: saveDormRoomAction.bind(null, unitSlug),
        archiveRoom: archiveDormRoomAction.bind(null, unitSlug),
      }}
    />
  );
}
