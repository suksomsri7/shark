// ─────────────────────────────────────────────────────────────
// trips/trips-settings.ts — บันทึก/คืนค่าตั้งโดเมน trips จากจอค่าตั้ง (ภาพ 17 · ใบสั่ง T1.1 §6)
// ด่าน: สมาชิกภาพสด → หน่วย TRIPS ที่เข้าได้ → trips.settings.edit|money → ทุก change ต้องเป็นคีย์โดเมน trips
//   และชั้น UNIT ของหน่วยนี้ หรือ PRODUCT ของสินค้าในหน่วยนี้ (อื่น ⇒ ปฏิเสธทั้งชุด) → setSettings/resetSetting ของเครื่องยนต์ (สิทธิ์ต่อช่อง/กฎหมายอยู่ที่นั่น)
// 🔴 ไม่ส่งออบเจกต์ของผู้เรียกเข้าเครื่องยนต์ตรง: เลือกฟิลด์ key/scope/scopeId/value/effectiveFrom/reason เอง · scopeId ตรวจกับฐาน
// ─────────────────────────────────────────────────────────────
import { getDef, resetSetting, setSettings, type RemoveResult, type SetFail, type SetResult, type SettingChangeInput } from "@/lib/core/settings";
import { tripsUnitGate, type TripsScreenCtx, type TripsUnitGate } from "./pickup";
import { settingsActorOf } from "./screens";

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const failSet = (code: SetFail["code"], messageTh: string, key?: string): SetFail => ({ ok: false, code, issues: [{ ...(key ? { key } : {}), code, messageTh }] });
const SETTINGS_ANY = ["trips.settings.edit", "trips.settings.money"] as const;
const MAX_CHANGES = 200;

/** ด่านร่วม: หน่วย TRIPS ที่เข้าได้ + สิทธิ์ตั้งค่า trips อย่างน้อยหนึ่งตัว */
async function settingsGate(ctx: unknown, unitId: unknown): Promise<TripsUnitGate | SetFail> {
  const g = await tripsUnitGate(ctx, { unitId });
  if (!("db" in g)) return g.code === "UNIT_NOT_TRIPS" ? failSet("NOT_FOUND", "หน่วยนี้ไม่ใช่หน่วยทัวร์") : failSet(g.code === "INVALID_INPUT" ? "VALIDATION" : "NOT_FOUND", g.message);
  if (!g.canAny(SETTINGS_ANY)) return failSet("PERMISSION", "บัญชีนี้ยังไม่ได้รับสิทธิ์ตั้งค่าทัวร์ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์");
  return g;
}

/** ชั้นที่ขอเป็นของหน่วยนี้จริง: UNIT = หน่วยเอง · PRODUCT = สินค้าของหน่วย (ร้าน/หน่วยอื่น ⇒ null) */
async function scopeOfUnit(g: TripsUnitGate, scope: unknown, scopeId: unknown): Promise<{ scope: "UNIT" | "PRODUCT"; scopeId: string } | null> {
  if (!isStr(scopeId)) return null;
  if (scope === "UNIT") return scopeId === g.unitId ? { scope, scopeId } : null;
  if (scope !== "PRODUCT") return null;
  const row = await g.db.tripProduct.findFirst({ where: { id: scopeId, tenantId: g.tenantId, unitId: g.unitId }, select: { id: true } });
  return row ? { scope, scopeId: row.id } : null;
}
function keyIssue(key: unknown): SetFail | null {
  if (!isStr(key) || !key.startsWith("trips.")) return failSet("VALIDATION", "ค่าตั้งนี้ไม่ได้ตั้งจากหน้าตั้งค่าทัวร์", isStr(key) ? key : undefined);
  const def = getDef(key);
  if (!def || def.domain !== "trips") return failSet("VALIDATION", "ไม่รู้จักค่าตั้งนี้", key);
  return null;
}
const dateOf = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/** บันทึกค่าตั้ง trips ของหน่วยนี้ (ชั้น UNIT / PRODUCT) — ผล = ผลของ setSettings (NEEDS_APPROVAL ⇒ ต้องรับทราบคำเตือน) */
export async function saveTripsSettings(ctx: TripsScreenCtx, input: unknown): Promise<SetResult> {
  if (!isRec(input)) return failSet("VALIDATION", "ข้อมูลค่าตั้งไม่ถูกต้อง");
  const g = await settingsGate(ctx, input.unitId);
  if (!("db" in g)) return g;
  const changes = Array.isArray(input.changes) ? (input.changes as unknown[]) : null;
  if (!changes || changes.length === 0 || changes.length > MAX_CHANGES) return failSet("VALIDATION", `ไม่มีค่าที่จะบันทึก (หรือมากเกิน ${MAX_CHANGES} ค่า)`);
  const list: SettingChangeInput[] = [];
  const cache = new Map<string, { scope: "UNIT" | "PRODUCT"; scopeId: string } | null>();
  for (const c of changes) {
    if (!isRec(c)) return failSet("VALIDATION", "ข้อมูลค่าตั้งไม่ถูกต้อง");
    const issue = keyIssue(c.key);
    if (issue) return issue;
    const sig = `${String(c.scope)}|${String(c.scopeId)}`;
    if (!cache.has(sig)) cache.set(sig, await scopeOfUnit(g, c.scope, c.scopeId));
    const sc = cache.get(sig);
    if (!sc) return failSet("NOT_FOUND", "ไม่พบหน่วยหรือสินค้าที่จะตั้งค่าในหน่วยทัวร์นี้", String(c.key));
    const eff = c.effectiveFrom === undefined || c.effectiveFrom === null ? null : dateOf(c.effectiveFrom);
    if (c.effectiveFrom !== undefined && c.effectiveFrom !== null && !eff) return failSet("VALIDATION", "วันที่มีผลอ่านไม่ได้", String(c.key));
    list.push({
      key: String(c.key),
      scope: sc.scope,
      scopeId: sc.scopeId,
      value: c.value,
      ...(eff ? { effectiveFrom: eff } : {}),
      ...(typeof c.reason === "string" ? { reason: c.reason.slice(0, 500) } : {}),
    });
  }
  return setSettings(settingsActorOf(g), { tenantId: g.tenantId }, list, { ackLegalWarn: input.ackLegalWarn === true });
}

/** คืนค่าตามชั้นบน (ลบค่าที่ตั้งไว้ที่ชั้นนี้) — คีย์ trips · ชั้นของหน่วยนี้เท่านั้น */
export async function resetTripsSetting(ctx: TripsScreenCtx, input: unknown): Promise<RemoveResult> {
  if (!isRec(input)) return failSet("VALIDATION", "ข้อมูลค่าตั้งไม่ถูกต้อง");
  const g = await settingsGate(ctx, input.unitId);
  if (!("db" in g)) return g;
  const issue = keyIssue(input.key);
  if (issue) return issue;
  const sc = await scopeOfUnit(g, input.scope, input.scopeId);
  if (!sc) return failSet("NOT_FOUND", "ไม่พบหน่วยหรือสินค้าที่จะตั้งค่าในหน่วยทัวร์นี้", String(input.key));
  return resetSetting(settingsActorOf(g), { tenantId: g.tenantId }, { key: String(input.key), scope: sc.scope, scopeId: sc.scopeId });
}
