import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormAccess, getLease } from "@/lib/modules/dorm";
import DormLineCard from "@/components/dorm/DormLineCard";
import { issueDormLinkCodeAction, syncDormRichMenuAction } from "./actions";

// SVC D.9 ▸ จอพนักงาน "ผูก LINE ผู้เช่า" (ใบสั่ง §3.2): ออกรหัสผูกห้อง (QR พิมพ์ติดห้อง/แนบสัญญา) + ปุ่มตั้งเมนูล่าง LINE ของหอ
//   ด่าน: requireUnit · หน่วย DORM · dormAccess(...).lease (dorm.lease.manage) ไม่ผ่าน ⇒ 404 · facade ตรวจสิทธิ์สดซ้ำทุกครั้ง
export default async function DormLeaseLinePage({ params }: { params: Promise<{ unitSlug: string; leaseId: string }> }) {
  const { unitSlug, leaseId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const access = dormAccess(membership, unit.id);
  if (!access.lease) notFound();
  const lease = await getLease({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, leaseId });
  if (!lease) notFound();
  return (
    <div className="mx-auto flex w-full max-w-[640px] min-w-0 flex-col gap-4 p-4">
      <a href={`/app/u/${unitSlug}/dorm/tenants?lease=${leaseId}`} className="text-xs text-[color:var(--color-muted)]">← กลับหน้าผู้เช่า</a>
      <DormLineCard
        roomNumber={lease.roomNumber}
        leaseStatus={lease.status}
        canMenu={access.settings}
        issue={issueDormLinkCodeAction.bind(null, unitSlug, leaseId)}
        syncMenu={syncDormRichMenuAction.bind(null, unitSlug)}
      />
    </div>
  );
}
