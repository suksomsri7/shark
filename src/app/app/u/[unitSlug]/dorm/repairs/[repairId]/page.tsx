import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormRepairJob } from "@/lib/modules/dorm";
import DormRepairJob from "@/components/dorm/DormRepairJob";
import { completeRepairAction } from "../actions";

// SVC D.16 ▸ มือถือช่าง: งานซ่อม 1 รายการ (ภาพ หอ 13ค · 390 PARITY · ใบสั่ง §5.3) — ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · dormRepairJob (dorm.repair.manage + ขอบเขตอาคาร #64) ไม่ผ่าน ⇒ 404 (ไม่บอกว่ามีงานอยู่)
//   รูปผู้เช่า/หลังซ่อม = ลิงก์ /api/files ผูกผู้ดู หมดอายุ ≤ 15 นาที
export const dynamic = "force-dynamic";

export default async function DormRepairJobPage({ params }: { params: Promise<{ unitSlug: string; repairId: string }> }) {
  const { unitSlug, repairId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const r = await dormRepairJob({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, repairId });
  if (!r.ok) notFound();
  return <DormRepairJob job={r.job} completeAction={completeRepairAction.bind(null, unitSlug, r.job.repairId)} backHref={`/app/u/${unitSlug}/dorm/repairs`} />;
}
