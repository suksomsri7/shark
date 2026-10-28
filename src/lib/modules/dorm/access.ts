// SVC D.6 ▸ สิทธิ์เข้าหน้าหอ — "คนจดมิเตอร์เห็นแค่หน้าจด" (สัญญา ledger/svc-briefs/svc-brief-d.6.md §5)
//   pure · import ได้แค่ @/lib/core/rbac · board = ดูผังห้องและข้อมูลหอ (dorm.view) · meter = จดเลขมิเตอร์ (dorm.meter.read)
//   OWNER / MANAGER ที่คุมหน่วยได้ทั้งคู่ (evaluate) · STAFF ต้องมีคีย์ตรง หรือ dorm.* · ไม่คุมหน่วย/ไม่มีสมาชิก ⇒ false ทั้งคู่
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";

export function dormAccess(m: MembershipCtx | null, unitId: string): { board: boolean; meter: boolean } {
  return {
    board: evaluate(m, { module: "dorm", action: "dorm.view", unitId }),
    meter: evaluate(m, { module: "dorm", action: "dorm.meter.read", unitId }),
  };
}
