"use server";

// SVC D.13 ▸ action ของหน้า 17 — ใช้ชุดสิทธิ์ตามบทบาท (ผู้ดูแล/ช่าง/บัญชี) กับพนักงาน
//   ร้าน/ผู้กระทำ/สิทธิ์มาจาก session เท่านั้น (requireUnit) — ไม่รับ tenantId/role/permissions จาก client
//   ด่าน: หน่วย DORM → dorm.settings.edit → applyDormRolePreset (ตรวจ Membership สด + updateStaffAccess ห้ามยกระดับ) → refresh()
// 🔴 ไฟล์ "use server": export async function เท่านั้น
import { refresh } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { applyDormRolePreset } from "@/lib/modules/dorm";

const ROLES = ["CARETAKER", "TECH", "ACCOUNTANT"] as const;

export async function applyDormRolePresetAction(unitSlug: string, input: unknown): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "DORM") return { ok: false, reason: "ไม่พบหอพักนี้" };
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  if (!evaluate(actor, { module: "dorm", action: "dorm.settings.edit", unitId: unit.id })) return { ok: false, reason: "คุณไม่มีสิทธิ์แก้ค่าตั้งหอนี้" };
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const preset = ROLES.find((x) => x === raw.role);
  if (!preset) return { ok: false, reason: "เลือกชุดสิทธิ์ ผู้ดูแล ช่าง หรือบัญชี" };
  const membershipId = typeof raw.membershipId === "string" ? raw.membershipId : "";
  const r = await applyDormRolePreset(actor, { tenantId: auth.active.tenantId }, { unitId: unit.id, membershipId, role: preset });
  if (r.ok) refresh();
  return r;
}
