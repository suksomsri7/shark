// SVC D.12 ▸ สิทธิ์ย้ายออก · คืนประกัน · ย้ายห้อง/ต่อสัญญา (ใบสั่ง ledger/svc-briefs/svc-brief-d.12.md §1 §5)
//   pure · import ได้แค่ @/lib/core/rbac
//   manage  = dorm.moveout.manage (แจ้งย้ายออก · ตรวจห้อง · ส่งใบสรุป · ปิดประกัน)
//   approve = dorm.deposit.deduct.approve (มติผู้คุม R7: เจ้าของ หรือผู้ที่ "ถือคีย์นี้จริง" — ผู้จัดการไม่ได้สิทธิ์นี้เพียงเพราะคุมหน่วย)
//   lease   = dorm.lease.manage (ย้ายห้อง · ต่อสัญญา)
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";

/** เหตุผลเดียวของ "ไม่พบ/ไม่มีสิทธิ์" ทุกทางของใบ D.12 (X1 — ร้านอื่น · หน่วยผิด · id เดา · สิทธิ์ไม่พอ ให้คำตอบเหมือนกัน) */
export const MOVEOUT_NF_REASON = "ไม่พบสัญญา ใบย้ายออก ห้อง หรือไฟล์ที่ระบุในหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการ";

const APPROVE_KEY = "dorm.deposit.deduct.approve";

export function moveOutAccess(m: MembershipCtx | null, unitId: string): { manage: boolean; approve: boolean; lease: boolean } {
  const manage = evaluate(m, { module: "dorm", action: "dorm.moveout.manage", unitId });
  const lease = evaluate(m, { module: "dorm", action: "dorm.lease.manage", unitId });
  // R7: ผ่านขอบเขตหน่วยตาม evaluate แล้ว "ต้องถือคีย์ตรง" (เจ้าของถือทุกคีย์โดยบทบาท)
  const inUnit = evaluate(m, { module: "dorm", action: APPROVE_KEY, unitId });
  const approve = !!m && inUnit && (m.role === "OWNER" || m.permissions?.[APPROVE_KEY] === true);
  return { manage, approve, lease };
}
