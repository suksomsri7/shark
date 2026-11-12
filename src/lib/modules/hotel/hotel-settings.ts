// SVC H.1 ▸ จอตั้งค่าโรงแรม (/hotel/settings) ฝั่งเซิร์ฟเวอร์ — ครอบเครื่องยนต์ค่าตั้ง (ใบสั่ง h.1 §6 · §6.1 · แบบ dorm/policy.ts)
//   • loadHotelSettings: หน่วย HOTEL ของร้าน → เข้าหน่วยได้ → ดูได้เมื่อมี hotel.settings.edit หรือ hotel.rates.read (อื่น ⇒ null)
//     ฟอร์ม = loadSettingsForm(domain rooms · กลุ่มโรงแรม/OTA + คีย์ร่วม · unitType HOTEL) ที่ชั้น UNIT หรือ «ตั้งเฉพาะ» RATE_PLAN/ROOM_TYPE
//   • saveHotelSettings / resetHotelSetting: เฉพาะคีย์ของจอนี้ · ชั้นต้องเป็นของหน่วย (ข้ามร้าน/หน่วย ⇒ NOT_FOUND) · ด่านสิทธิ์จริงอยู่ที่ setSettings/resetSetting
//   • อ่านผ่าน tenantDb (ไม่ import prisma)
import { tenantDb } from "@/lib/core/db";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import {
  getDef,
  isOwnerOnly,
  loadSettingsForm,
  resetSetting,
  setSettings,
  type RemoveResult,
  type SetFail,
  type SetResult,
  type SettingChangeInput,
  type SettingsActor,
} from "@/lib/core/settings";
import type { SettingsFormModel } from "@/components/settings/settings-shared";
import {
  HOTEL_READONLY_KEYS,
  HOTEL_SETTINGS_CARDS,
  HOTEL_SETTINGS_GROUPS,
  HOTEL_SETTINGS_KEYS,
  type HotelSettingsCardKey,
  type HotelSettingsScope,
} from "@/components/hotel/hotel-settings-shared";

export type HotelSettingsModel = {
  unitId: string;
  unitName: string;
  scope: HotelSettingsScope;
  scopeId: string;
  cards: { key: HotelSettingsCardKey; labelTh: string; fieldKeys: string[]; noteTh: string | null; planLinkTh: string | null }[];
  form: SettingsFormModel;
  canEdit: boolean;
  ratePlans: { id: string; code: string; name: string }[];
  roomTypes: { id: string; name: string }[];
};

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const KEYS = new Set(HOTEL_SETTINGS_KEYS);
const SCOPES: readonly HotelSettingsScope[] = ["UNIT", "RATE_PLAN", "ROOM_TYPE"];
const failSet = (code: SetFail["code"], messageTh: string, key?: string): SetFail => ({ ok: false, code, issues: [{ ...(key ? { key } : {}), code, messageTh }] });

function actorOf(a: unknown): SettingsActor | null {
  if (!isRec(a) || !isStr(a.role) || !isStr(a.userId)) return null;
  return {
    role: a.role as MembershipCtx["role"],
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
    permissions: isRec(a.permissions) ? a.permissions : {},
    userId: a.userId,
  };
}

/** หน่วยโรงแรมของร้านที่ผู้กระทำเข้าได้ */
async function hotelUnitFor(actor: SettingsActor, tenantId: string, unitId: unknown) {
  if (!isStr(unitId)) return null;
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true, name: true } });
  return unit && canAccessUnit(actor, unit.id) ? unit : null;
}

/** ชั้นที่ขอเป็นของหน่วยนี้จริง (UNIT = หน่วยเอง · RATE_PLAN/ROOM_TYPE = แถวของหน่วย) */
async function scopeOfUnit(tenantId: string, unitId: string, scope: unknown, scopeId: unknown): Promise<{ scope: HotelSettingsScope; scopeId: string } | null> {
  const s = (SCOPES as readonly unknown[]).includes(scope) ? (scope as HotelSettingsScope) : null;
  if (!s || !isStr(scopeId)) return null;
  if (s === "UNIT") return scopeId === unitId ? { scope: s, scopeId } : null;
  const db = tenantDb({ tenantId, unitId });
  const row = s === "RATE_PLAN" ? await db.hotelRatePlan.findFirst({ where: { id: scopeId }, select: { id: true } }) : await db.hotelRoomType.findFirst({ where: { id: scopeId }, select: { id: true } });
  return row ? { scope: s, scopeId } : null;
}

export async function loadHotelSettings(actorIn: unknown, ctx: unknown, input: unknown): Promise<HotelSettingsModel | null> {
  const actor = actorOf(actorIn);
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!actor || !isStr(tenantId) || !isRec(input)) return null;
  const unit = await hotelUnitFor(actor, tenantId, input.unitId);
  if (!unit) return null;
  const can = (action: string) => evaluate(actor, { module: "hotel", action, unitId: unit.id });
  const canEdit = can("hotel.settings.edit");
  if (!canEdit && !can("hotel.rates.read")) return null;
  const want = input.scope === undefined || input.scope === "UNIT" ? { scope: "UNIT", scopeId: unit.id } : await scopeOfUnit(tenantId, unit.id, input.scope, input.scopeId);
  if (!want) return null;
  const db = tenantDb({ tenantId, unitId: unit.id });
  const [raw, plans, types] = await Promise.all([
    loadSettingsForm(actor, { tenantId }, { domains: ["rooms"], groups: HOTEL_SETTINGS_GROUPS, unitId: unit.id, unitType: "HOTEL", scope: want.scope as HotelSettingsScope, ...(want.scope === "UNIT" ? {} : { scopeId: want.scopeId }) }),
    db.hotelRatePlan.findMany({ where: { status: "ACTIVE" }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, code: true, name: true } }),
    db.hotelRoomType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  if (!raw) return null;
  const groups = raw.groups
    .map((g) => ({
      ...g,
      fields: g.fields
        .filter((f) => KEYS.has(f.key))
        .map((f) => (HOTEL_READONLY_KEYS[f.key] ? { ...f, editable: false, lockedReasonTh: HOTEL_READONLY_KEYS[f.key] } : f)),
    }))
    .filter((g) => g.fields.length > 0);
  const fields = groups.flatMap((g) => g.fields);
  const form: SettingsFormModel = {
    ...raw,
    groups,
    differsCount: fields.filter((f) => f.differsFromTemplate).length,
    history: raw.history.filter((h) => KEYS.has(h.key)),
  };
  return {
    unitId: unit.id,
    unitName: unit.name,
    scope: want.scope as HotelSettingsScope,
    scopeId: want.scopeId,
    cards: HOTEL_SETTINGS_CARDS.map((c) => ({ key: c.key, labelTh: c.labelTh, fieldKeys: [...c.fieldKeys], noteTh: c.noteTh, planLinkTh: c.planLinkTh ?? null })),
    form,
    canEdit,
    ratePlans: plans,
    roomTypes: types,
  };
}

/** คีย์ที่บันทึกผ่านจอนี้ไม่ได้ ⇒ PERMISSION (ค่าเฉพาะเจ้าของ · ผู้กระทำไม่ใช่เจ้าของ) หรือ VALIDATION */
function keyIssue(actor: SettingsActor, key: string): SetFail | null {
  const def = getDef(key);
  if (!def) return failSet("VALIDATION", "ไม่รู้จักค่าตั้งนี้", key);
  if (KEYS.has(key) && !HOTEL_READONLY_KEYS[key]) return null;
  if (isOwnerOnly(def) && actor.role !== "OWNER") return failSet("PERMISSION", `«${def.labelTh}» แก้ได้เฉพาะเจ้าของกิจการ`, key);
  return failSet("VALIDATION", HOTEL_READONLY_KEYS[key] ?? `«${def.labelTh}» ไม่ได้ตั้งจากหน้านี้`, key);
}

/** บันทึกค่าตั้งโรงแรม (ชั้น UNIT หรือ «ตั้งเฉพาะ» RATE_PLAN/ROOM_TYPE ของหน่วยนี้) — ผล = ผลของ setSettings */
export async function saveHotelSettings(actorIn: unknown, ctx: unknown, input: unknown): Promise<SetResult> {
  const actor = actorOf(actorIn);
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!actor || !isStr(tenantId) || !isRec(input)) return failSet("NOT_FOUND", "ไม่พบโรงแรมนี้");
  const unit = await hotelUnitFor(actor, tenantId, input.unitId);
  if (!unit) return failSet("NOT_FOUND", "ไม่พบโรงแรมนี้ (หรืออยู่นอกสาขาที่คุณดูแล)");
  const changes = Array.isArray(input.changes) ? (input.changes as unknown[]) : null;
  if (!changes || changes.length === 0 || changes.length > 200) return failSet("VALIDATION", "ไม่มีค่าที่จะบันทึก (หรือมากเกิน 200 ค่า)");
  const list: SettingChangeInput[] = [];
  const seen = new Map<string, { scope: HotelSettingsScope; scopeId: string } | null>();
  for (const c of changes) {
    if (!isRec(c) || !isStr(c.key)) return failSet("VALIDATION", "ข้อมูลค่าตั้งไม่ถูกต้อง");
    const issue = keyIssue(actor, c.key);
    if (issue) return issue;
    const sig = `${String(c.scope)}|${String(c.scopeId)}`;
    if (!seen.has(sig)) seen.set(sig, await scopeOfUnit(tenantId, unit.id, c.scope, c.scopeId));
    const sc = seen.get(sig);
    if (!sc) return failSet("NOT_FOUND", "ไม่พบรายการที่จะตั้งค่าในโรงแรมนี้", c.key);
    list.push({
      key: c.key,
      scope: sc.scope,
      scopeId: sc.scopeId,
      value: c.value,
      ...(c.effectiveFrom instanceof Date ? { effectiveFrom: c.effectiveFrom } : {}),
      ...(typeof c.reason === "string" ? { reason: c.reason } : {}),
    });
  }
  return setSettings(actor, { tenantId }, list, { ackLegalWarn: input.ackLegalWarn === true });
}

/** คืนค่าเริ่มต้น (ลบค่าที่ตั้งไว้ที่ชั้นนี้ ⇒ ใช้ชั้นบน/แม่แบบ) */
export async function resetHotelSetting(actorIn: unknown, ctx: unknown, input: unknown): Promise<RemoveResult> {
  const actor = actorOf(actorIn);
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!actor || !isStr(tenantId) || !isRec(input) || !isStr(input.key)) return failSet("NOT_FOUND", "ไม่พบโรงแรมนี้");
  const unit = await hotelUnitFor(actor, tenantId, input.unitId);
  if (!unit) return failSet("NOT_FOUND", "ไม่พบโรงแรมนี้ (หรืออยู่นอกสาขาที่คุณดูแล)");
  const issue = keyIssue(actor, input.key);
  if (issue) return issue;
  const sc = await scopeOfUnit(tenantId, unit.id, input.scope, input.scopeId);
  if (!sc) return failSet("NOT_FOUND", "ไม่พบรายการที่จะตั้งค่าในโรงแรมนี้", input.key);
  return resetSetting(actor, { tenantId }, { key: input.key, scope: sc.scope, scopeId: sc.scopeId });
}
