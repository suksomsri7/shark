import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { loadRatesScreen } from "@/lib/modules/hotel";
import {
  archiveRatePlanAction,
  archiveSeasonAction,
  clearOverrideAction,
  removeHolidayAction,
  saveCancelRulesAction,
  saveHolidaysAction,
  saveRatePlanAction,
  saveRatesAction,
  saveSeasonAction,
  setOverrideAction,
} from "@/lib/modules/hotel/actions";
import RatesScreen from "@/components/hotel/RatesScreen";
import { ratesTabOf } from "@/components/hotel/rates-shared";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;

// SVC H.1 ▸ จอราคาโรงแรม (ภาพ 15 · ใบสั่ง h.1 §5) — หน่วย HOTEL เท่านั้น · ดูได้ ⇔ hotel.rates.read · ปุ่มเขียน ⇔ hotel.rates.write
//   ผู้กระทำ/ร้าน/สิทธิ์มาจาก session (auth.active) — URL ใช้เลือกแท็บย่อย/วันเริ่มเท่านั้น
export default async function HotelRatesPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
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
  const canWrite = evaluate(actor, { module: "hotel", action: "hotel.rates.write", unitId: unit.id });
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const plan = typeof sp.plan === "string" ? sp.plan : undefined; // M2 ▸ แผนที่ดู (ตรวจเป็นแผนของหน่วยฝั่งเซิร์ฟเวอร์) ◂
  const model = await loadRatesScreen(actor, { tenantId: auth.active.tenantId }, { unitId: unit.id, ...(from ? { from } : {}), ...(plan ? { ratePlanId: plan } : {}) });
  if (!model) notFound();
  return (
    <RatesScreen
      model={model}
      unitSlug={unitSlug}
      tab={ratesTabOf(sp.tab)}
      canWrite={canWrite && model.canWrite}
      actions={{
        saveRatePlan: saveRatePlanAction.bind(null, unitSlug),
        archiveRatePlan: archiveRatePlanAction.bind(null, unitSlug),
        saveCancelRules: saveCancelRulesAction.bind(null, unitSlug),
        saveSeason: saveSeasonAction.bind(null, unitSlug),
        archiveSeason: archiveSeasonAction.bind(null, unitSlug),
        saveHolidays: saveHolidaysAction.bind(null, unitSlug),
        removeHoliday: removeHolidayAction.bind(null, unitSlug),
        saveRates: saveRatesAction.bind(null, unitSlug),
        setOverride: setOverrideAction.bind(null, unitSlug),
        clearOverride: clearOverrideAction.bind(null, unitSlug),
      }}
    />
  );
}
