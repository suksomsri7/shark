import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormAccess, overdueModel } from "@/lib/modules/dorm";
import OverdueScreen from "@/components/dorm/OverdueScreen";
import { sendDunningNowAction, setPaymentPromiseAction, waiveLateFeeAction } from "./actions";

// SVC D.11 ▸ จอ "ค้างชำระ · ทวง · ค่าปรับ" — ภาพอ้างอิง ledger/design-dorm/06-slip-payments.png · ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น (ไม่แตะ prisma)
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · dormAccess(...) ต้องเห็นผังห้อง (board) และเห็นเงิน (money) ไม่งั้น 404 · สิทธิ์ปุ่มตัดสินใน facade (model.can)
export default async function DormOverduePage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const access = dormAccess(membership, unit.id);
  if (!access.board || !access.money) notFound();
  const model = await overdueModel({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id });
  if (!model) notFound();

  return (
    <OverdueScreen
      model={model}
      unitSlug={unitSlug}
      actions={{
        dun: sendDunningNowAction.bind(null, unitSlug),
        waive: waiveLateFeeAction.bind(null, unitSlug),
        promise: setPaymentPromiseAction.bind(null, unitSlug),
      }}
    />
  );
}
