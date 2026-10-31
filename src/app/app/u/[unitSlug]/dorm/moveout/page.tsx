import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { leaseChangeModel, moveOutAccess, moveOutModel } from "@/lib/modules/dorm";
import MoveOutScreen, { MoveOutStart } from "@/components/dorm/MoveOutScreen";
import { qcNowOf } from "@/components/booking/line-page";
import {
  addMoveOutFilesAction,
  cancelMoveOutAction,
  giveMoveOutNoticeAction,
  recordMoveOutInspectionAction,
  renewLeaseAction,
  reopenMoveOutSummaryAction,
  sendMoveOutSummaryAction,
  settleMoveOutAction,
  transferRoomAction,
} from "./actions";

// SVC D.12 ▸ จอ "ย้ายออก · คืนเงินประกัน" — ภาพอ้างอิง ledger/design-dorm/07-moveout-deposit.png · ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น (ไม่แตะ prisma)
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · moveOutAccess(...).manage (dorm.moveout.manage) ไม่ผ่าน ⇒ 404 · สิทธิ์ปุ่ม/ขอบเขตอาคารตัดสินสดใน facade
//   ?room=<เลขห้อง> = ใบล่าสุดที่ไม่ยกเลิกของห้อง · ?id=<moveOutId> · ?lease=<leaseId> (จากหน้าสัญญา) · ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1 (qcNowOf)
export const dynamic = "force-dynamic";

export default async function DormMoveOutPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams?: Promise<{ room?: string; id?: string; lease?: string; at?: string }>;
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
  const access = moveOutAccess(membership, unit.id);
  const leaseParam = typeof sp?.lease === "string" && sp.lease.trim() ? sp.lease.trim().slice(0, 64) : undefined;
  // SVC D.12 (Y25) ▸ จอเริ่ม (?lease=) เปิดได้ด้วย dorm.lease.manage (ต่อสัญญา/ย้ายห้อง) · จอย้ายออกต้อง .manage (dorm.moveout.manage) ◂
  if (!access.manage && !(leaseParam && access.lease)) notFound();
  const qc = qcNowOf(sp?.at, process.env.SVC_QC_CLOCK === "1");
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.active.userId };
  const room = typeof sp?.room === "string" && sp.room.trim() ? sp.room.trim().slice(0, 20) : undefined;
  let id = typeof sp?.id === "string" && sp.id.trim() ? sp.id.trim().slice(0, 64) : undefined;
  const leaseId = typeof sp?.lease === "string" && sp.lease.trim() ? sp.lease.trim().slice(0, 64) : undefined;
  // SVC D.12 (Y2) ▸ ?lease=<id> จากหน้าสัญญา: มีใบย้ายออกแล้ว ⇒ จอ 07 · ยังไม่มี ⇒ จอเริ่ม (แจ้งย้ายออก · ต่อสัญญา · ย้ายห้อง) ◂
  if (!id && !room && leaseId) {
    const lease = await leaseChangeModel(ctx, { unitId: unit.id, leaseId }, { now: qc.now });
    if (!lease) notFound();
    if (!lease.moveOutId || !access.manage)
      return (
        <MoveOutStart
          unitSlug={unitSlug}
          lease={lease}
          actions={{
            notice: giveMoveOutNoticeAction.bind(null, unitSlug),
            renew: renewLeaseAction.bind(null, unitSlug),
            transfer: transferRoomAction.bind(null, unitSlug),
          }}
        />
      );
    id = lease.moveOutId;
  }
  if (!access.manage) notFound();
  const model = await moveOutModel(ctx, { unitId: unit.id, ...(id ? { moveOutId: id } : room ? { roomNumber: room } : {}) }, { now: qc.now });
  if (!model) {
    return (
      <div className="p-6 text-sm text-[color:var(--color-ink-soft)]">
        {room ? `ห้อง ${room} ยังไม่มีการแจ้งย้ายออก — แจ้งย้ายออกได้จากหน้าสัญญาของผู้เช่า (ปุ่ม "แจ้งย้ายออก")` : "ยังไม่ได้เลือกห้อง — เปิดหน้าผู้เช่า/สัญญา แล้วกด \"แจ้งย้ายออก\" ที่สัญญานั้น"}
        <a href={`/app/u/${unitSlug}/dorm/tenants`} className="ml-2 underline">
          ไปหน้าผู้เช่า
        </a>
      </div>
    );
  }
  return (
    <MoveOutScreen
      unitSlug={unitSlug}
      model={model}
      actions={{
        save: recordMoveOutInspectionAction.bind(null, unitSlug),
        files: addMoveOutFilesAction.bind(null, unitSlug),
        send: sendMoveOutSummaryAction.bind(null, unitSlug),
        settle: settleMoveOutAction.bind(null, unitSlug),
        reopen: reopenMoveOutSummaryAction.bind(null, unitSlug),
        cancel: cancelMoveOutAction.bind(null, unitSlug),
      }}
    />
  );
}
