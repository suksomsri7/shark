import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { loadTripsSettingsVM, tripsPageGate } from "@/lib/modules/trips";
import { resetTripsSettingAction, saveTripsSettingsAction } from "@/lib/modules/trips/screen-actions";
import TripsForbidden from "@/components/trips/TripsForbidden";
import TripsSettings from "@/components/trips/TripsSettings";
import { isTripsSettingsSection } from "@/components/trips/trips-shared";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

// TRIPS T1.1 ▸ จอค่าตั้งทัวร์ (ภาพ 17 · ใบสั่ง T1.1 §6) — ฟอร์มจากทะเบียนค่าตั้ง (SettingsForm กลาง) เท่านั้น
//   ?scope=PRODUCT&id=<productId> = ชั้นสินค้า (ต้องเป็นสินค้าของหน่วยนี้ ไม่งั้น notFound) · ไม่ส่ง scope = ชั้นหน่วย · &section=<หมวด> เปิดการ์ดหมวดนั้น
//   บันทึก/คืนค่า = action ของ trips ผูก unitSlug (ด่านสิทธิ์ต่อช่อง/กฎหมายอยู่ที่เครื่องยนต์)
export default async function TripsSettingsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.user.id };
  const g = await tripsPageGate(ctx, { unitId: unit.id, page: "settings" });
  if (!g.ok) {
    if (g.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  const productId = one(sp.scope) === "PRODUCT" ? one(sp.id) : undefined;
  const sectionRaw = one(sp.section);
  const section = isTripsSettingsSection(sectionRaw) ? sectionRaw : undefined;
  const r = await loadTripsSettingsVM(ctx, { unitId: unit.id, ...(productId ? { scope: "PRODUCT", productId } : {}), ...(section ? { section } : {}) });
  if (!r.ok) {
    if (r.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  return <TripsSettings vm={r.vm} unitSlug={unitSlug} actions={{ save: saveTripsSettingsAction.bind(null, unitSlug), reset: resetTripsSettingAction.bind(null, unitSlug) }} />;
}
