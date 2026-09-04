"use server";

// server actions ของหน้า "ภาพรวมการเงิน" (WO 5.2 · DESIGN-SPEC-V2 §10.2 · เฟรม f7)
// อ่านล้วน — คลิกวันในปฏิทินเรียก action นี้จาก client component (แบบเดียวกับ saveContactAction ที่เรียกตรง
// ไม่ผ่าน <form action>) คืนรายการของวันนั้นให้ modal แสดง

import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { financeDayDetail, type FinanceDayDetail } from "@/lib/modules/account/finance-overview";

export async function financeDayDetailAction(systemId: string, dateIso: string): Promise<FinanceDayDetail> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  return financeDayDetail({ tenantId, systemId }, dateIso);
}
