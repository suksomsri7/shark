import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { listParcels, parcelRoomsFor, type ParcelStatus } from "@/lib/modules/dorm";
import DormParcels from "@/components/dorm/DormParcels";
import { pickupParcelAction, receiveParcelAction, returnParcelAction } from "./actions";

// SVC D.18 ▸ จอพัสดุของพนักงานหอ (ใบสั่ง ledger/svc-briefs/svc-brief-d.18.md §5.1 · ไม่มีภาพอนุมัติ) — ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · listParcels (dorm.parcel.manage + ขอบเขตอาคาร #64) ไม่ผ่าน ⇒ 404 · ห้องในฟอร์ม = ห้องในขอบเขตเท่านั้น
//   ?s=WAITING|PICKED_UP|RETURNED|ALL (ค่าเริ่ม WAITING)
export const dynamic = "force-dynamic";

const STATUSES = ["WAITING", "PICKED_UP", "RETURNED", "ALL"] as const;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function DormParcelsPage({
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
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.active.userId };
  const s = one(sp.s);
  const status = (STATUSES as readonly string[]).includes(s ?? "") ? (s as ParcelStatus | "ALL") : "WAITING";
  const model = await listParcels(ctx, { unitId: unit.id, status });
  if (!model.ok) notFound();
  const rooms = (await parcelRoomsFor(ctx, { unitId: unit.id })) ?? [];

  return (
    <DormParcels
      model={model}
      canReceive={true}
      rooms={rooms}
      status={status}
      actions={{
        receive: receiveParcelAction.bind(null, unitSlug),
        pickup: pickupParcelAction.bind(null, unitSlug),
        returnParcel: returnParcelAction.bind(null, unitSlug),
      }}
    />
  );
}
