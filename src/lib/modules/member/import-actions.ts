"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { parseCsv, type ImportSummary } from "@/lib/core/csv";
import { importCustomers } from "./service";

// ── นำเข้าลูกค้าจาก CSV (WO Wave6-A) — ใช้กับ useActionState ในหน้าระบบสมาชิก ──
// STAFF ต้องมี permission "member.customer.import" (OWNER/MANAGER ผ่านตามปกติ)
export async function importCustomersAction(
  systemId: string,
  _prev: ImportSummary | null,
  formData: FormData,
): Promise<ImportSummary | null> {
  const auth = await requireTenant();
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "member", action: "member.customer.import" },
  );
  const csv = String(formData.get("csv") ?? "");
  if (!systemId || !csv.trim()) return null;
  const table = parseCsv(csv);
  if (table.rows.length === 0) {
    return { created: 0, skipped: 0, errors: [{ row: 0, reason: "ไม่พบข้อมูล — ต้องมีบรรทัดหัวคอลัมน์ + อย่างน้อย 1 แถว" }] };
  }
  const summary = await importCustomers({ tenantId: auth.active.tenantId, systemId }, table);
  revalidatePath(`/app/sys/${systemId}`);
  return summary;
}
