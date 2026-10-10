// grant-verdict.ts — CRM C5.5 ▸ H55-2 r1b (มติผู้คุมงาน): "ให้ของมีมูลค่าด้วยมือได้ทันทีไหม" ของประตูมือของโมดูลแต้ม/voucher
//   ให้โมดูลอื่น (กฎอัตโนมัติ CRM) ถามผ่าน facade สมาชิกเพียงทางเดียว — ตัวตัดสินจริงอยู่ที่ `point/adjust.ts` และ `voucher/service.ts`
//   (เพดาน/บทบาทไม่ถูกก๊อปมาไว้ที่นี่) · อ่านอย่างเดียว ◂
import { manualIssueVerdict } from "@/lib/modules/voucher";
import { manualAdjustVerdict } from "@/lib/modules/point";
import type { MemberActor } from "./access";

export type ManualGrant = { kind: "GIVE_POINTS"; points: number } | { kind: "ISSUE_VOUCHER"; templateId: string; count?: number };
/** DIRECT = ผู้นี้ให้ได้ทันทีด้วยมือ · APPROVAL = ต้องขออนุมัติ · REFUSED = ทำเองไม่ได้ · NOT_FOUND = ไม่พบแบบ voucher (หรือปิดใช้) */
export type ManualGrantVerdict = "DIRECT" | "APPROVAL" | "REFUSED" | "NOT_FOUND";

export async function manualGrantVerdict(tenantId: string, actor: MemberActor, grant: ManualGrant): Promise<ManualGrantVerdict> {
  if (grant.kind === "GIVE_POINTS") return manualAdjustVerdict(tenantId, actor, grant.points);
  return manualIssueVerdict(tenantId, actor, grant.templateId, grant.count ?? 1);
}
