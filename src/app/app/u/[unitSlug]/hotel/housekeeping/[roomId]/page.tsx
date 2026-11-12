import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { resolveSetting } from "@/lib/core/settings";
import { hkRoom } from "@/lib/modules/hotel";
import {
  hkFinishAction,
  hkInspectAction,
  hkReleaseAction,
  hkSetStatusAction,
  hkStartAction,
  postMinibarAction,
  reportDefectAction,
} from "@/lib/modules/hotel/actions";
import HkRoomSheet from "@/components/hotel/hk/HkRoomSheet";

// SVC H.6 ▸ ทำห้อง /hotel/housekeeping/[roomId] (ใบสั่ง h.6 §4 ข · ภาพ 13 ข · มือถือ 390)
//   หน่วย "HOTEL" · สิทธิ์ hotel.housekeeping (ไม่มี ⇒ notFound) · ห้องต้องอยู่หน่วยนี้ (hkRoom ⇒ NOT_FOUND ⇒ notFound)
//   เช็กลิสต์ตามประเภทห้อง (ค่าตั้ง housekeepingChecklist #74) + รายการ minibar (#75) มาจาก hkRoom ฝั่งเซิร์ฟเวอร์
export default async function HousekeepingRoomPage({ params }: { params: Promise<{ unitSlug: string; roomId: string }> }) {
  const { unitSlug, roomId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const can = (action: string) => evaluate(m, { module: "hotel", action, unitId: unit.id });
  if (!can("hotel.housekeeping")) notFound();
  const ctx = { tenantId: auth.active.tenantId };
  const [v, cb] = await Promise.all([hkRoom(ctx, { unitId: unit.id, roomId }), resolveSetting(ctx, "rooms.hotel.hk.canBlock", { unitId: unit.id })]);
  if (!v.ok) notFound();
  return (
    <HkRoomSheet
      backHref={`/app/u/${unitSlug}/hotel/housekeeping`}
      meId={auth.user.id}
      row={v.room}
      checklist={v.checklist}
      minibar={v.minibar}
      inHouse={v.inHouse}
      inspectionRequired={v.inspectionRequired}
      canInspect={can("hotel.housekeeping.inspect")}
      canBlock={can("hotel.booking.manage") || cb?.value === true}
      today={v.today}
      defectAction={reportDefectAction.bind(null, unitSlug)}
      senders={{
        setStatus: hkSetStatusAction.bind(null, unitSlug),
        start: hkStartAction.bind(null, unitSlug),
        release: hkReleaseAction.bind(null, unitSlug),
        finish: hkFinishAction.bind(null, unitSlug),
        inspect: hkInspectAction.bind(null, unitSlug),
        minibar: postMinibarAction.bind(null, unitSlug),
      }}
    />
  );
}
