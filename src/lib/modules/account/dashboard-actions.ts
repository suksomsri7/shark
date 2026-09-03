"use server";

import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "./guard";
import { assertAccountCan } from "./access";
import { setPinnedFinanceAccounts } from "./finance";
import { setPinnedLedgerAccounts } from "./coa";

// ─────────────────────────────────────────────────────────────
// dashboard-actions.ts — server actions ของหน้าหลัก V2 (WO 2.2)
// เฉพาะ "ปักหมุดบัญชีที่ติดตาม" (§4 ข้อ 9) — ด่านความปลอดภัยตามแบบเดียวกับไฟล์ *-actions.ts อื่น (actions.ts /
// recurring-actions.ts ฯลฯ): loadAccountSystem ผูก tenant ก่อน แล้ว assertAccountCan(auth, action) ตรงในไฟล์นี้เอง
// (เรียก assertAccountCan ตรง ๆ แทนที่จะพึ่ง requireAccountPage — F6 fitness ตรวจ "มีด่านสิทธิ์จริงไหม" จากซอร์ส
// ของไฟล์ action เอง/ที่ import มาลึก 1 ชั้น ไม่ตามรอยลึกกว่านั้น)
// ทุก query ผูก tenantId+systemId ใน finance.ts/coa.ts เอง (id จาก client เป็นแค่ "คำขอ" ไม่ใช่ความจริง)
// สิทธิ์ที่ใช้: บัญชีเงิน → account.finance.manage · ผังบัญชี → account.chart.manage (มีอยู่แล้ว ไม่เพิ่ม key ใหม่)
// ─────────────────────────────────────────────────────────────

export type PinActionResult = { ok: true } | { ok: false; reason: string };

export async function pinFinanceAccountsAction(systemId: string, ids: string[]): Promise<PinActionResult> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const res = await setPinnedFinanceAccounts(tenantId, systemId, ids);
  if (res.ok) revalidatePath(`/app/sys/${systemId}/account`);
  return res;
}

export async function pinLedgerAccountsAction(systemId: string, ids: string[]): Promise<PinActionResult> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.chart.manage");
  const res = await setPinnedLedgerAccounts({ tenantId, systemId }, ids);
  if (res.ok) revalidatePath(`/app/sys/${systemId}/account`);
  return res;
}
