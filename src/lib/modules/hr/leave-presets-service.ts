// HR H2.12 ▸ F1 — เพิ่มประเภทการลาตามกฎหมาย 1 รายการที่ผู้ตั้งค่าเลือก (ไม่สร้างให้อัตโนมัติ) ·
//   สิทธิ์ = ด่านเดียวกับ "ประเภทการลา" วันนี้ (createLeavePolicy: OWNER หรือ hr.employee.create · ประเภททั้งร้าน ⇒ ผู้ดูแลทุกสาขา) ·
//   ไม่ซ้ำ: มีประเภทที่ตรงชนิดอยู่แล้ว ⇒ ปฏิเสธด้วยข้อความคงที่ (ชื่อซ้ำ = unique index เดิมกันอีกชั้น) ·
//   ค่าที่ส่งมาแทนค่าตั้งต้นได้ทุกช่อง (ร้านปรับได้) — หมวดมาจากชุดตั้งต้นเสมอ · ไม่มี migration ◂
import { canManageHrSettings, createLeavePolicy, listLeavePolicies, SETTINGS_TEXT, type SettingsResult, type SettingsViewer } from "./settings";
import { hrScopeOf } from "./scope";
import { LEAVE_PRESET_TEXT, leavePresetOf, leavePresetRows } from "./leave-presets";

type Ctx = { tenantId: string; systemId: string };
export type LeavePresetInput = { key: unknown; name?: unknown; quotaDays?: unknown; paid?: unknown; minServiceDays?: unknown; attachmentAfterDays?: unknown };

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k) && (o as Record<string, unknown>)[k] !== undefined;

export async function addLeavePreset(ctx: Ctx, v: SettingsViewer, input: LeavePresetInput): Promise<SettingsResult> {
  if (!canManageHrSettings(v)) return { ok: false, reason: SETTINGS_TEXT.noPermission };
  const pr = leavePresetOf(input?.key);
  if (!pr) return { ok: false, reason: LEAVE_PRESET_TEXT.unknown };
  if (!pr.supported) return { ok: false, reason: LEAVE_PRESET_TEXT.unsupported };
  const policies = await listLeavePolicies(ctx, { scope: hrScopeOf(v) });
  if (leavePresetRows(policies).find((r) => r.key === pr.key)?.existing) return { ok: false, reason: LEAVE_PRESET_TEXT.exists };
  const i = (input ?? {}) as Record<string, unknown>;
  const name = typeof i.name === "string" ? i.name : "";
  return createLeavePolicy(ctx, v, {
    unitId: null,
    category: pr.category,
    name,
    paid: has(i, "paid") ? i.paid === true || i.paid === "true" : pr.paid,
    quotaDays: has(i, "quotaDays") ? (i.quotaDays as string | number | null) : pr.quotaDays,
    minServiceDays: has(i, "minServiceDays") ? (i.minServiceDays as number) : pr.minServiceDays,
    attachmentAfterDays: has(i, "attachmentAfterDays") ? (i.attachmentAfterDays === "" ? null : (i.attachmentAfterDays as number | null)) : pr.attachmentAfterDays,
  });
}
// ◂ HR H2.12
