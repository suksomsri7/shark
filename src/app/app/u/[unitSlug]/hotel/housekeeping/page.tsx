import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { resolveSetting } from "@/lib/core/settings";
import { hkBoard } from "@/lib/modules/hotel";
import { hkFinishAction, hkInspectAction, hkSetStatusAction, hkStartAction, postMinibarAction, reportDefectAction } from "@/lib/modules/hotel/actions";
import HkBoard from "@/components/hotel/hk/HkBoard";
import { thShortDate } from "@/components/hotel/hk/hk-shared";

// SVC H.6 ▸ แม่บ้าน · งานวันนี้ (โรงแรม) /hotel/housekeeping (ใบสั่ง h.6 §4 ก · ภาพ 13 ก · มือถือ 390)
//   หน่วย "HOTEL" เท่านั้น · ดูได้เฉพาะ hotel.housekeeping (ไม่มี ⇒ notFound — ผู้ไม่มีสิทธิ์ไม่เห็นหน้า) · ร้าน/ผู้ใช้/สิทธิ์จาก session เท่านั้น
//   ข้อมูล = hkBoard (มุมมองคำนวณสด) + mine = userId ของผู้ดู · action ผูก unitSlug ฝั่งเซิร์ฟเวอร์แล้วส่งให้จอ
export default async function HousekeepingBoardPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
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
  const [b, cb] = await Promise.all([hkBoard(ctx, { unitId: unit.id, mine: auth.user.id }), resolveSetting(ctx, "rooms.hotel.hk.canBlock", { unitId: unit.id })]);
  if (!b.ok) notFound();
  const canBlock = can("hotel.booking.manage") || cb?.value === true;
  return (
    <HkBoard
      unitId={unit.id}
      base={`/app/u/${unitSlug}/hotel/housekeeping`}
      dateLabel={thShortDate(b.today)}
      unitName={unit.name}
      meId={auth.user.id}
      meName={(auth.user.name ?? "").trim().split(/\s+/)[0] || "ฉัน"}
      rows={b.rooms}
      counts={b.counts}
      inspectionRequired={b.inspectionRequired}
      canBlock={canBlock}
      defectAction={reportDefectAction.bind(null, unitSlug)}
      senders={{
        setStatus: hkSetStatusAction.bind(null, unitSlug),
        finish: hkFinishAction.bind(null, unitSlug),
        inspect: hkInspectAction.bind(null, unitSlug),
        minibar: postMinibarAction.bind(null, unitSlug),
        start: hkStartAction.bind(null, unitSlug),
      }}
    />
  );
}
