import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormPaymentsModel } from "@/lib/platform/dorm-pay";
import DormPayments from "@/components/dorm/DormPayments";
import { attachChatAction, dismissChatAction, recordCashAction, resolveHeldAction, reviewSlipAction, voidReceiptAction } from "./actions";

// SVC D.10 ▸ จอ "รับเงิน" — ภาพอ้างอิง ledger/design-dorm/06-slip-payments.png · สัญญา ledger/svc-briefs/svc-brief-d.10.md §4 §5
//   ด่าน: requireUnit · หน่วย DORM · dormPaymentsModel ตรวจสิทธิ์สด (dorm.slip.review หรือ dorm.payment.manual) ไม่ผ่าน ⇒ 404
export const dynamic = "force-dynamic";

export default async function DormPaymentsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: Promise<{ period?: string; slip?: string; room?: string }> }) {
  const { unitSlug } = await params;
  const q = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const model = await dormPaymentsModel({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, periodKey: q.period ?? null });
  if (!model) notFound();
  const selected = q.slip ?? model.review.find((r) => r.roomNumber === q.room)?.slipId ?? null;
  return (
    <DormPayments
      model={model}
      unitSlug={unitSlug}
      selected={selected}
      actions={{
        review: reviewSlipAction.bind(null, unitSlug),
        resolve: resolveHeldAction.bind(null, unitSlug),
        cash: recordCashAction.bind(null, unitSlug),
        voidReceipt: voidReceiptAction.bind(null, unitSlug),
        attachChat: attachChatAction.bind(null, unitSlug),
        dismissChat: dismissChatAction.bind(null, unitSlug),
      }}
    />
  );
}
