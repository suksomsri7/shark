import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { listDormRepairs } from "@/lib/modules/dorm";
import DormRepairs from "@/components/dorm/DormRepairs";

// SVC D.16 ▸ รายการแจ้งซ่อมของหอ (ใบสั่ง ledger/svc-briefs/svc-brief-d.16.md §5.2 · ไม่มีภาพแบบ) — ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · listDormRepairs (dorm.repair.manage + ขอบเขตอาคาร #64) ไม่ผ่าน ⇒ 404
//   ?s=ACTIVE|DONE|ALL (ค่าเริ่ม ACTIVE = รับเรื่องแล้ว + กำลังซ่อม)
export const dynamic = "force-dynamic";

const STATUSES = ["ACTIVE", "DONE", "ALL"] as const;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function DormRepairsPage({
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
  const s = one(sp.s);
  const status = (STATUSES as readonly string[]).includes(s ?? "") ? (s as (typeof STATUSES)[number]) : "ACTIVE";
  const model = await listDormRepairs({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, status });
  if (!model.ok) notFound();
  return <DormRepairs model={model} basePath={`/app/u/${unitSlug}/dorm`} status={status} />;
}
