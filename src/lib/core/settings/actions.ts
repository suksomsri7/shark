"use server";

// ─────────────────────────────────────────────────────────────
// core/settings/actions.ts — server actions ของหน้าตั้งค่า (R0.4 ใช้) · SVC R0.3
// tenantId + ผู้กระทำ ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client
// ด่านสิทธิ์จริงอยู่ใน service (editPermission · ownerOnly/LEGAL · สาขาที่เข้าได้ · ชั้น TENANT) — ที่นี่แค่ประกอบ actor
// 🔴 ไฟล์ "use server": export async function เท่านั้น (ไม่มี type/const)
// ─────────────────────────────────────────────────────────────
import { requireTenant } from "@/lib/core/context";
import { applyTemplate, resetSetting, setSettings } from "./index";
import type { RemoveResult, SetResult, SettingChangeInput, SettingsActor, SettingsCtx } from "./types";

async function actorOf(): Promise<{ actor: SettingsActor; ctx: SettingsCtx }> {
  const auth = await requireTenant();
  return {
    ctx: { tenantId: auth.active.tenantId },
    actor: {
      role: auth.active.role,
      unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
      permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
      userId: auth.active.userId,
    },
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function changesFromClient(input: unknown): SettingChangeInput[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 200).map((raw) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    const eff = c.effectiveFrom;
    return {
      key: str(c.key),
      scope: str(c.scope),
      scopeId: str(c.scopeId),
      value: c.value,
      ...(eff !== undefined && eff !== null && eff !== "" ? { effectiveFrom: new Date(eff instanceof Date ? eff.getTime() : String(eff)) } : {}),
      ...(typeof c.reason === "string" ? { reason: c.reason } : {}),
    };
  });
}

export async function saveSettingsAction(changes: unknown, opts?: { ackLegalWarn?: boolean }): Promise<SetResult> {
  const { actor, ctx } = await actorOf();
  const list = changesFromClient(changes);
  if (Array.isArray(changes) && changes.length > 200) {
    return { ok: false, code: "VALIDATION", issues: [{ code: "TOO_MANY", messageTh: "บันทึกได้ครั้งละไม่เกิน 200 ค่า" }] };
  }
  return setSettings(actor, ctx, list, { ackLegalWarn: opts?.ackLegalWarn === true });
}

export async function resetSettingAction(target: { key: string; scope: string; scopeId: string }): Promise<RemoveResult> {
  const { actor, ctx } = await actorOf();
  return resetSetting(actor, ctx, { key: str(target?.key), scope: str(target?.scope), scopeId: str(target?.scopeId) });
}

export async function applyTemplateAction(input: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }): Promise<RemoveResult> {
  const { actor, ctx } = await actorOf();
  const overwrite = input?.overwrite === "RESET_ALL" ? "RESET_ALL" : "KEEP_CUSTOM";
  return applyTemplate(actor, ctx, { unitId: str(input?.unitId), domain: str(input?.domain), templateKey: str(input?.templateKey), overwrite });
}
