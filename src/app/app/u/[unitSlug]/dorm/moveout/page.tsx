import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { moveOutAccess, moveOutModel } from "@/lib/modules/dorm";
import MoveOutScreen from "@/components/dorm/MoveOutScreen";
import { qcNowOf } from "@/components/booking/line-page";
import { sendMoveOutSummaryAction, settleMoveOutAction } from "./actions";

// SVC D.12 ▸ จอ "ย้ายออก · คืนเงินประกัน" — ภาพอ้างอิง ledger/design-dorm/07-moveout-deposit.png · ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น (ไม่แตะ prisma)
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · moveOutAccess(...).manage (dorm.moveout.manage) ไม่ผ่าน ⇒ 404 · สิทธิ์ปุ่ม/ขอบเขตอาคารตัดสินสดใน facade
//   ?room=<เลขห้อง> = ใบล่าสุดที่ไม่ยกเลิกของห้อง · ?id=<moveOutId> · ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1 (qcNowOf)
export const dynamic = "force-dynamic";

export default async function DormMoveOutPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams?: Promise<{ room?: string; id?: string; at?: string }>;
}) {
  const { unitSlug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!moveOutAccess(membership, unit.id).manage) notFound();
  const qc = qcNowOf(sp?.at, process.env.SVC_QC_CLOCK === "1");
  const room = typeof sp?.room === "string" && sp.room.trim() ? sp.room.trim().slice(0, 20) : undefined;
  const id = typeof sp?.id === "string" && sp.id.trim() ? sp.id.trim().slice(0, 64) : undefined;
  const model = await moveOutModel({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, ...(id ? { moveOutId: id } : room ? { roomNumber: room } : {}) }, { now: qc.now });
  if (!model) {
    return (
      <div className="p-6 text-sm text-[color:var(--color-ink-soft)]">
        {room ? `ห้อง ${room} ยังไม่มีการแจ้งย้ายออก — แจ้งย้ายออกได้จากหน้าสัญญาของผู้เช่า` : "เลือกห้องที่ต้องการดูการย้ายออกจากหน้าผู้เช่า/สัญญา"}
      </div>
    );
  }
  return (
    <MoveOutScreen
      unitSlug={unitSlug}
      model={model}
      actions={{
        send: sendMoveOutSummaryAction.bind(null, unitSlug),
        settle: settleMoveOutAction.bind(null, unitSlug),
      }}
    />
  );
}
