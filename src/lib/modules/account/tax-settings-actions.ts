"use server";

// ─────────────────────────────────────────────────────────────
// tax-settings-actions.ts — server actions ของ "ตั้งค่า › ข้อมูลกิจการ › อัตราภาษีและกำหนดยื่น" · ACC T0.2
//
// ด่าน: loadAccountSystem → assertAccountCan("account.settings.manage") → saveBookTax (เครื่องยนต์ค่าตั้ง:
//   สิทธิ์ editPermission · zod ของแถว · SettingChange + AuditLog + outbox) → revalidatePath
// ค่าที่ต่างจากค่าเริ่มต้นของระบบ = คำเตือน ไม่บล็อก (คืนกลับไปแสดงบนจอ)
// 🔴 ไฟล์ "use server": export async function เท่านั้น
// ─────────────────────────────────────────────────────────────
import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, mc } from "./access";
import { safeReason } from "./errors";
import { saveBookTax, type BookTaxPatch, type LegalWarning } from "./legal-values";

type Kind = "vat" | "wht" | "deadline";

export async function saveLegalRowsAction(
  systemId: string,
  kind: Kind,
  rows: unknown,
): Promise<{ ok: true; warnings: LegalWarning[] } | { ok: false; reason: string }> {
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(String(systemId ?? "").slice(0, 40));
    assertAccountCan(auth, "account.settings.manage");
    if (!Array.isArray(rows)) return { ok: false, reason: "ข้อมูลตารางไม่ถูกรูปแบบ" };
    const patch: BookTaxPatch =
      kind === "vat"
        ? { vatRows: rows as BookTaxPatch["vatRows"] }
        : kind === "wht"
          ? { whtRows: rows as BookTaxPatch["whtRows"] }
          : kind === "deadline"
            ? { deadlineRows: rows as BookTaxPatch["deadlineRows"] }
            : {};
    if (Object.keys(patch).length === 0) return { ok: false, reason: "ไม่รู้จักตารางนี้" };
    const res = await saveBookTax({ ...mc(auth), userId }, { tenantId, systemId }, patch);
    if (!res.ok) return { ok: false, reason: res.issues.map((i) => i.messageTh).join(" · ") || "บันทึกไม่สำเร็จ" };
    revalidatePath(`/app/sys/${systemId}/account/settings/tax`);
    return { ok: true, warnings: res.warnings };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกตารางค่ากฎหมายไม่สำเร็จ") };
  }
}
