// policy-view.ts — นโยบายบัญชีของ REST + รอบบัญชีแรก (ACC T4.6) · GET และ PATCH /settings/policy ตอบรูปเดียวกัน
import { fiscalInfoOf, type AccountPolicy } from "../policy";
import { policyView } from "./serialize-gl";

export async function policyViewWithRules(ctx: { tenantId: string; systemId: string }, p: AccountPolicy) {
  const f = await fiscalInfoOf(ctx, p);
  return { ...policyView(p), firstPeriod: f.firstPeriod, firstPeriodMaxMonths: f.firstPeriodMaxMonths, warnings: f.warnings };
}
