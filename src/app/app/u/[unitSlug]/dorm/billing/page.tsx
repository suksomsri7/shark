import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { billRunModel, dormAccess } from "@/lib/modules/dorm";
import BillingRunScreen from "@/components/dorm/BillingRunScreen";
import {
  adjustSentBillAction,
  exportBillRunCsvAction,
  prepareBillRunAction,
  releaseHeldBillAction,
  scheduleBillRunAction,
  sendBillRunAction,
  setBillExtraLinesAction,
} from "./actions";

// SVC D.8 ▸ หอ 04 "ออกบิลรอบเดือน — ตรวจก่อนส่ง" — ภาพ ledger/design-dorm/04-billing-run.png · ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น (ไม่แตะ prisma)
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · dormAccess(...).board (dorm.view) ไม่ผ่าน ⇒ 404 · สิทธิ์เตรียม/ส่งตัดสินใน facade (canPrepare/canSend)
//   ?period=YYYY-MM (ไม่ส่ง = รอบล่าสุดของหน่วย · ไม่มีรอบ = เดือนถัดไป สถานะ NONE) · ?room=<เลขห้อง> = ตัวอย่างบิลของห้องนั้น
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function DormBillingPage({
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
  const room = (one(sp.room) ?? "").trim().slice(0, 20);
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.active.userId };
  const model = await billRunModel(ctx, {
    unitId: unit.id,
    ...(asked && PERIOD_RE.test(asked) ? { periodKey: asked } : {}),
    ...(room ? { previewRoom: room } : {}),
  });
  if (!model) notFound();

  return (
    <BillingRunScreen
      model={model}
      unitSlug={unitSlug}
      actions={{
        prepare: prepareBillRunAction.bind(null, unitSlug),
        extraLines: setBillExtraLinesAction.bind(null, unitSlug),
        release: releaseHeldBillAction.bind(null, unitSlug),
        schedule: scheduleBillRunAction.bind(null, unitSlug),
        send: sendBillRunAction.bind(null, unitSlug),
        adjust: adjustSentBillAction.bind(null, unitSlug),
        exportCsv: exportBillRunCsvAction.bind(null, unitSlug),
      }}
    />
  );
}
