import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { loadHotelSettings } from "@/lib/modules/hotel";
import { resetHotelSettingAction, saveHotelSettingsAction } from "@/lib/modules/hotel/actions";
import HotelSettings from "@/components/hotel/HotelSettings";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;

// SVC H.1 ▸ จอตั้งค่าโรงแรม (/hotel/settings · แบบหอ 17 · ใบสั่ง h.1 §6) — หน่วย HOTEL เท่านั้น
//   ฟอร์มจากเครื่องยนต์ค่าตั้ง (loadHotelSettings) · บันทึก/คืนค่าเริ่มต้น = action ของโรงแรม (ผูก unitSlug)
//   ผู้กระทำ/ร้าน/สิทธิ์มาจาก session — URL ใช้เลือกชั้น «ตั้งเฉพาะแผนราคา/ประเภทห้อง» เท่านั้น (ชั้นต้องเป็นของหน่วย ตรวจฝั่งเซิร์ฟเวอร์)
export default async function HotelSettingsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const ctx = { tenantId: auth.active.tenantId };
  const scope = sp.scope === "RATE_PLAN" || sp.scope === "ROOM_TYPE" ? sp.scope : "UNIT";
  const base = await loadHotelSettings(actor, ctx, { unitId: unit.id });
  if (!base) notFound();
  const pick = typeof sp.id === "string" ? sp.id : scope === "RATE_PLAN" ? base.ratePlans[0]?.id : scope === "ROOM_TYPE" ? base.roomTypes[0]?.id : undefined;
  const model = scope === "UNIT" || !pick ? base : ((await loadHotelSettings(actor, ctx, { unitId: unit.id, scope, scopeId: pick })) ?? base);
  return <HotelSettings model={model} unitSlug={unitSlug} actions={{ save: saveHotelSettingsAction.bind(null, unitSlug), reset: resetHotelSettingAction.bind(null, unitSlug) }} />;
}
