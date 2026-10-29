import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { dormAccess, leaseAccess } from "@/lib/modules/dorm";
import DormTabs from "@/components/dorm/DormTabs";
import { dormTabsFor } from "@/components/dorm/dorm-home-shared";

// SVC D.13 ▸ แท็บโมดูลหอ (ภาพ หอ 01/17 แถบบน) — ใบสั่ง ledger/svc-briefs/svc-brief-d.13.md §8
//   หน่วยต้องเป็น "DORM" (อื่น ⇒ notFound) · แท็บตามสิทธิ์: ผังห้อง/ตั้งค่า ⇔ dorm.view · ผู้เช่า ⇔ ดูสัญญาได้ · จดมิเตอร์ ⇔ dorm.meter.read
//   แถบแท็บ print:hidden (หน้าพิมพ์สัญญาไม่มีแท็บ) · แต่ละหน้ายังตรวจสิทธิ์ของตัวเอง (layout ไม่ใช่ด่าน)
export default async function DormLayout({ children, params }: { children: React.ReactNode; params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const acc = dormAccess(m, unit.id);
  const tabs = dormTabsFor({ board: acc.board, meter: acc.meter, leaseView: leaseAccess(m, unit.id).view }, `/app/u/${unitSlug}`);
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <DormTabs tabs={tabs} />
      {children}
    </div>
  );
}
