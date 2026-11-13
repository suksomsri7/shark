"use server";

// ─────────────────────────────────────────────────────────────
// sales-tax-actions.ts — ตั้งค่า "วิธีลงใบกำกับภาษีอย่างย่อในรายงานภาษีขาย" จากหน้ารายงาน (ACC T1.1)
// ด่าน: loadAccountSystem → assertAccountCan("account.settings.manage") → setSettings (เครื่องยนต์ค่าตั้ง: zod + SettingChange + AuditLog)
// 🔴 ไฟล์ "use server": export async function เท่านั้น
// ─────────────────────────────────────────────────────────────
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setSettings } from "@/lib/core/settings";
import { ACCOUNT_SETTING_KEYS } from "@/lib/core/settings/defs/account";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, mc } from "./access";
import { isSalesTaxAbbMode } from "./sales-tax-shared";

export async function saveSalesTaxAbbModeAction(fd: FormData): Promise<void> {
  const systemId = String(fd.get("systemId") ?? "").slice(0, 40);
  const period = String(fd.get("period") ?? "").slice(0, 7);
  const mode = String(fd.get("abbMode") ?? "");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  const path = `/app/sys/${systemId}/account/reports/pp30`;
  const q = /^\d{4}-\d{2}$/.test(period) ? `period=${period}&` : "";
  if (!isSalesTaxAbbMode(mode)) redirect(`${path}?${q}err=${encodeURIComponent("ไม่รู้จักรูปแบบนี้")}`);
  const res = await setSettings({ ...mc(auth), userId }, { tenantId }, [
    { key: ACCOUNT_SETTING_KEYS.salesTaxAbbMode, scope: "ACCOUNT_BOOK", scopeId: systemId, value: mode },
  ]);
  revalidatePath(path);
  redirect(
    res.ok
      ? `${path}?${q}ok=${encodeURIComponent("บันทึกรูปแบบใบกำกับภาษีอย่างย่อในรายงานแล้ว")}`
      : `${path}?${q}err=${encodeURIComponent(res.issues.map((i) => i.messageTh).join(" · ") || "บันทึกไม่สำเร็จ")}`,
  );
}
