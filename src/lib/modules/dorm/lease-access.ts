// SVC D.5 ▸ สิทธิ์ผู้เช่า/สัญญา (ใบสั่ง ledger/svc-briefs/svc-brief-d.5.md §5)
//   pure · import ได้แค่ @/lib/core/rbac
//   manage = dorm.lease.manage (ทำสัญญา · รับเงิน · ไฟล์ · ลงชื่อ · เข้าอยู่ · ยกเลิก · ลิงก์ไฟล์ส่วนตัว)
//   view   = manage หรือ dorm.view (อ่านรายการ/รายละเอียด/ข้อความสัญญา) · OWNER/MANAGER ที่คุมหน่วยผ่านทั้งคู่ (evaluate)
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";

export function leaseAccess(m: MembershipCtx | null, unitId: string): { view: boolean; manage: boolean } {
  const manage = evaluate(m, { module: "dorm", action: "dorm.lease.manage", unitId });
  return { view: manage || evaluate(m, { module: "dorm", action: "dorm.view", unitId }), manage };
}
