import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { resetSettingAction, saveSettingsAction } from "@/lib/core/settings/actions";
import { dormAccess, dormLawModel } from "@/lib/modules/dorm";
import UtilityLawSettings from "@/components/dorm/UtilityLawSettings";
import { acceptUtilityLegalAction, recordAuthorityBillAction, setDormLegalModeAction } from "./actions";

// ค่าน้ำไฟ · กฎหมาย · VAT (SVC D.7) — ภาพ ledger/design-dorm/10-settings-law.png · ข้อมูลผ่าน facade `@/lib/modules/dorm` (ไม่แตะ prisma)
//   หน่วยต้องเป็น DORM · ต้องดูข้อมูลหอได้ (dorm.view — คนจดมิเตอร์ไม่เห็นเงิน) · ไม่ผ่าน ⇒ 404
//   ?period=YYYY-MM (ไม่ส่ง = งวดล่าสุดที่มีบิล / เดือนก่อน) · ผู้กระทำ/ร้านมาจาก session เท่านั้น
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function DormUtilitySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!dormAccess(membership, unit.id).board) notFound();

  const asked = one(sp.period);
  const model = await dormLawModel(
    { ...membership, userId: auth.active.userId },
    { tenantId: auth.active.tenantId },
    { unitId: unit.id, ...(asked && PERIOD_RE.test(asked) ? { periodKey: asked } : {}) },
  );
  if (!model) notFound();

  return (
    <UtilityLawSettings
      model={model}
      unitSlug={unitSlug}
      actions={{
        save: saveSettingsAction,
        reset: resetSettingAction,
        setLegalMode: setDormLegalModeAction.bind(null, unitSlug),
        recordBill: recordAuthorityBillAction.bind(null, unitSlug),
        accept: acceptUtilityLegalAction.bind(null, unitSlug),
      }}
    />
  );
}
