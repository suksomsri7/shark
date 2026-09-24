// settings.ts — ตัวอ่าน `AppSystem.settings.crm` แบบมีชนิด + ค่าเริ่มต้น (CRM v2 · สร้างในใบ C1.1 · ใบ C1.5 ต่อยอด)
//
// 🔴 ค่าเริ่มต้นอยู่ "ในตัวอ่าน" — ระบบ CRM ที่ settings ว่าง (ทุกระบบบน prod วันนี้) ต้องได้ค่าที่ปลอดภัย:
//    `uiVersion: 1` (มติ C23 · R-E ข้อ 14 — v2 ปิดจนเจ้าของร้านเปิดเอง) · `bridgesEnabled: true` (สะพานเชื่อมโมดูลอื่นเปิด)
// 🔴 ไฟล์นี้อ่านอย่างเดียวในใบ C1.1 · การเขียนต้องใช้ `jsonb_set` คำสั่งเดียว (แบบ `writeMemberSettingsKey`)
//    ห้าม read-modify-write ทั้งก้อน `AppSystem.settings` (ช่องว่างเขียนทับกัน) — ใบ C1.5 เป็นคนเพิ่มตัวเขียน
// 🔴 AUDIT-CLASS X1: หา `AppSystem` ด้วย id + tenantId + type CRM เสมอ — ระบบของร้านอื่น/ชนิดอื่น = ไม่พบ
import { tenantDb } from "@/lib/core/db";
// CRM C1.5 ▸ ตัวเขียน jsonb_set ใช้ client ของโมดูล (F5.1) ◂
import { prisma as crmDb } from "./db";

export type CrmUiVersion = 1 | 2;

export type CrmSettings = {
  /** 1 = หน้า v1 เดิม (ค่าเริ่มต้น) · 2 = เปิด CRM v2 (op/งานเบื้องหลัง/สะพาน ของ v2 ทำงาน) */
  uiVersion: CrmUiVersion;
  /** สวิตช์ปิดสะพานเชื่อมโมดูลอื่นบน prod (ทางถอย) — ค่าเริ่มต้นเปิด */
  bridgesEnabled: boolean;
  // CRM C1.8 ▸ แชทจาก Party ที่ยังไม่มีผู้ติดต่อ → เปิด lead ใหม่ (source CHAT) · ค่าเริ่มต้น **ปิด** (ร้านเปิดเอง — ลูกค้าทักถามทางแชทไม่ใช่ lead ทุกคน) ◂
  chatToLead: boolean;
};

export const CRM_SETTINGS_DEFAULTS: Readonly<CrmSettings> = Object.freeze({ uiVersion: 1, bridgesEnabled: true, chatToLead: false });

type Json = unknown;
const isObj = (v: Json): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** แปลงค่าดิบจาก JSON → ชนิดที่ถูก (ค่าเพี้ยน = ค่าเริ่มต้น ไม่ throw) */
export function parseCrmSettings(raw: Json): CrmSettings {
  const crm = isObj(raw) && isObj(raw.crm) ? raw.crm : {};
  return {
    uiVersion: crm.uiVersion === 2 ? 2 : CRM_SETTINGS_DEFAULTS.uiVersion,
    bridgesEnabled: typeof crm.bridgesEnabled === "boolean" ? crm.bridgesEnabled : CRM_SETTINGS_DEFAULTS.bridgesEnabled,
    chatToLead: crm.chatToLead === true, // CRM C1.8 ▸ ค่าเพี้ยน/ไม่ได้ตั้ง = ปิด ◂
  };
}

export async function getCrmSettings(ctx: { tenantId: string; systemId: string }): Promise<CrmSettings> {
  const sys = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findFirst({
    where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" },
    select: { settings: true },
  });
  if (!sys) throw new Error("ไม่พบระบบ CRM นี้ในร้าน");
  return parseCrmSettings(sys.settings);
}

// CRM C1.5 ▸ ตัวเขียน `AppSystem.settings.crm.<key>` (RESOLUTIONS R-A — ใบอื่นเพิ่มหมวดของตัวเองผ่านบริการนี้เท่านั้น)
//   🔴 คำสั่งเดียว (`jsonb_set` แบบ `writeMemberSettingsKey`) — ไม่อ่านทั้งก้อนมาแก้แล้วเขียนทับ (ช่องว่างเขียนทับคีย์ของคนอื่น)
//   AUDIT-CLASS X1: เขียนเฉพาะแถว AppSystem ที่ id + tenantId + type CRM ตรงกัน · ไม่พบ = โยนข้อความไทย (ไม่เขียนอะไร)
export type CrmSettingsKey = keyof CrmSettings;

export async function setCrmSettingsKey<K extends CrmSettingsKey>(ctx: { tenantId: string; systemId: string }, key: K, value: CrmSettings[K]): Promise<CrmSettings> {
  if (key === "uiVersion" && value !== 1 && value !== 2) throw new Error("รุ่นหน้าจอ CRM ต้องเป็น 1 หรือ 2");
  if (key === "bridgesEnabled" && typeof value !== "boolean") throw new Error("สวิตช์สะพานเชื่อมต้องเป็นเปิดหรือปิด");
  if (key === "chatToLead" && typeof value !== "boolean") throw new Error("สวิตช์เปิด lead จากแชทต้องเป็นเปิดหรือปิด"); // CRM C1.8 ◂
  const json = JSON.stringify(value);
  const n = await crmDb.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object(${key}::text, ${json}::jsonb),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM'`;
  if (n === 0) throw new Error("ไม่พบระบบ CRM นี้ในร้าน");
  return getCrmSettings(ctx);
}
// ◂ CRM C1.5

// CRM C1.6 ▸ ทะเบียนผลลัพธ์ของกิจกรรม `settings.crm.activityOutcomes[type]` (พิมพ์เขียว §4.5 · มติผู้คุมงาน C1.6 S8)
//   ตัวอ่านแบบมีชนิด (อ่านอย่างเดียว — ตัวเขียนมากับหน้าตั้งค่ากิจกรรมในใบถัดไป ผ่าน jsonb_set คำสั่งเดียวแบบข้างบน)
//   🔴 `[]` ที่ตั้งไว้ชัด = "ชนิดนี้ไม่มีผลลัพธ์ให้เลือก" (ไม่ใช่กลับไปใช้ค่าตั้งต้น) · ไม่ได้ตั้ง = ค่าตั้งต้นพิมพ์เขียว · ค่าเพี้ยน = ค่าตั้งต้น
/** รายการผลลัพธ์ของชนิดกิจกรรม `type` — `null` = ชนิดนี้ไม่มีทะเบียน (ไม่รับผลลัพธ์) */
export function activityOutcomesOf(raw: Json, type: string, defaults: Readonly<Partial<Record<string, readonly string[]>>>): readonly string[] | null {
  const crm = isObj(raw) && isObj(raw.crm) ? raw.crm : null;
  const reg = crm && isObj(crm.activityOutcomes) ? crm.activityOutcomes : null;
  const own = reg ? reg[type] : undefined;
  if (Array.isArray(own)) {
    const list = [...new Set(own.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 60)))];
    return list;
  }
  return defaults[type] ?? null;
}
// ◂ CRM C1.6

// CRM C1.11 ▸ เทมเพลตกิจการที่ร้านเลือกแล้ว `settings.crm.businessTemplate = { key, appliedAt } | "none"` (ตัวอ่านบริสุทธิ์)
//   ตัวเขียนอยู่ใน `templates.ts` (jsonb_set คำสั่งเดียวใน tx ของการ apply) · ใบ C2.2/C2.8 อ่าน key นี้ไปหา sequences/scoreRules
export function crmBusinessTemplateOf(raw: Json): { key: string; appliedAt: string | null } | null {
  const crm = isObj(raw) && isObj(raw.crm) ? raw.crm : null;
  // SF-7: "none" = ร้านเลือก "ไม่ใช้เทมเพลต" (ตัวเลือกไม่ขึ้นอีก · ไม่มีเทมเพลตให้ C2.x อ่าน)
  if (crm && crm.businessTemplate === "none") return { key: "none", appliedAt: null };
  const bt = crm && isObj(crm.businessTemplate) ? crm.businessTemplate : null;
  if (!bt || typeof bt.key !== "string" || !bt.key) return null;
  return { key: bt.key, appliedAt: typeof bt.appliedAt === "string" ? bt.appliedAt : null };
}
// ◂ CRM C1.11

// CRM C2.2 ▸ ปฏิทินวันทำการของลำดับการติดตาม `settings.crm.businessDays` (0=อา … 6=ส) · `settings.crm.holidays` ({date,name}[])
//   🔴 ทุกตัวเขียน = คำสั่ง SQL เดียว (jsonb_set) — คีย์อื่นของ settings.crm ไม่ถูกแตะ · รวมวันหยุด/ลบวันหยุดคำนวณในคำสั่งเดียวกัน
//      (ไม่อ่านรายการมาแก้แล้วเขียนทับ = สองคนกดพร้อมกันไม่ทำรายการหาย · AUDIT-CLASS X3)
//   AUDIT-CLASS X1: เขียนเฉพาะแถว AppSystem ที่ id + tenantId + type CRM ตรงกัน · ไม่พบ = 0 แถว (ผู้เรียกแปลงเป็น NOT_FOUND)
//   🔴 รับ `db` เข้ามาได้ (ธุรกรรมของผู้เรียก) — ผู้เรียกเขียนแถว AuditLog ใน tx เดียวกับการเปลี่ยนค่าได้ ⇒ ไม่มีช่องที่ค่าเปลี่ยนแล้วไม่มีประวัติ
export type CrmSettingsDb = Pick<typeof crmDb, "$executeRaw">;

export async function setCrmBusinessDays(ctx: { tenantId: string; systemId: string }, days: readonly number[], db: CrmSettingsDb = crmDb): Promise<number> {
  const json = JSON.stringify([...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort());
  return db.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object('businessDays', ${json}::jsonb),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM'`;
}

/** รวมวันหยุดเข้ารายการเดิม (วันที่ซ้ำ = คงของเดิม) · ของเดิมที่เป็นสตริงเปล่าถูกแปลงเป็น {date,name:""} · เรียงตามวันที่ */
export async function mergeCrmHolidays(ctx: { tenantId: string; systemId: string }, items: readonly { date: string; name: string }[], db: CrmSettingsDb = crmDb): Promise<number> {
  const add = JSON.stringify(items.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date)).map((h) => ({ date: h.date, name: String(h.name ?? "").slice(0, 120) })));
  return db.$executeRaw`
    UPDATE "AppSystem" a
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof(a."settings") = 'object' THEN a."settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof(a."settings"->'crm') = 'object' THEN a."settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object('holidays', (
          SELECT COALESCE(jsonb_agg(x.item ORDER BY x.d), '[]'::jsonb) FROM (
            SELECT DISTINCT ON (u.d) u.d, u.item FROM (
              SELECT 0 AS pri, (CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e->>'date' END) AS d,
                     (CASE WHEN jsonb_typeof(e) = 'string' THEN jsonb_build_object('date', e #>> '{}', 'name', '') ELSE e END) AS item
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a."settings"->'crm'->'holidays') = 'array' THEN a."settings"->'crm'->'holidays' ELSE '[]'::jsonb END) e
              UNION ALL
              SELECT 1 AS pri, n->>'date' AS d, n AS item FROM jsonb_array_elements(${add}::jsonb) n
            ) u WHERE u.d ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' ORDER BY u.d, u.pri
          ) x)),
      true)
    WHERE a."id" = ${ctx.systemId} AND a."tenantId" = ${ctx.tenantId} AND a."type" = 'CRM'`;
}

/** ลบวันหยุดตามวันที่ (คำสั่งเดียว) */
export async function removeCrmHoliday(ctx: { tenantId: string; systemId: string }, date: string, db: CrmSettingsDb = crmDb): Promise<number> {
  return db.$executeRaw`
    UPDATE "AppSystem" a
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof(a."settings") = 'object' THEN a."settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof(a."settings"->'crm') = 'object' THEN a."settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object('holidays', (
          SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a."settings"->'crm'->'holidays') = 'array' THEN a."settings"->'crm'->'holidays' ELSE '[]'::jsonb END) e
           WHERE (CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e->>'date' END) IS DISTINCT FROM ${date})),
      true)
    WHERE a."id" = ${ctx.systemId} AND a."tenantId" = ${ctx.tenantId} AND a."type" = 'CRM'`;
}
// ◂ CRM C2.2

// CRM C2.3 ▸ มอบหมายอัตโนมัติ `settings.crm.assignment = { fallbackUserId }` (มติ R10 · notifyChannel มากับ C2.10)
//   ตัวอ่านบริสุทธิ์ (ค่าเพี้ยน = null) + ตัวเขียนคำสั่งเดียว: jsonb ซ้อนสองชั้น (crm → assignment → key) ใน UPDATE เดียว
//   ⇒ คีย์อื่นของ crm (uiVersion · bridgesEnabled …) และคีย์อื่นของ assignment รอดเสมอ (ไม่มี read-modify-write)
//   🔴 ไม่เพิ่มช่องใน `CrmSettings` (ชนิดนั้นถูกเทียบรูปทั้งก้อนในข้อสอบเก่า) — ผู้ใช้อ่านผ่าน `crmAssignmentSettingsOf`
export type CrmAssignmentSettings = { fallbackUserId: string | null };

export function crmAssignmentSettingsOf(raw: Json): CrmAssignmentSettings {
  const crm = isObj(raw) && isObj(raw.crm) ? raw.crm : null;
  const a = crm && isObj(crm.assignment) ? crm.assignment : null;
  const fb = a && typeof a.fallbackUserId === "string" && a.fallbackUserId.trim() ? a.fallbackUserId.trim() : null;
  return { fallbackUserId: fb };
}

export async function setCrmAssignmentKey<K extends keyof CrmAssignmentSettings>(
  ctx: { tenantId: string; systemId: string },
  key: K,
  value: CrmAssignmentSettings[K],
  /** tx ของผู้เรียก — ให้ค่าใน settings กับแถวประวัติ (AuditLog) commit พร้อมกัน (รอบ 3 · S5) · ไม่ส่ง = client ของโมดูล */
  db: { $executeRaw: typeof crmDb.$executeRaw } = crmDb,
): Promise<void> {
  if (key === "fallbackUserId" && value !== null && typeof value !== "string") throw new Error("ผู้รับสำรองต้องเป็นรหัสพนักงานหรือว่าง");
  const json = JSON.stringify(value ?? null);
  const n = await db.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object('assignment',
             (CASE WHEN jsonb_typeof("settings"->'crm'->'assignment') = 'object' THEN "settings"->'crm'->'assignment' ELSE '{}'::jsonb END)
               || jsonb_build_object(${key}::text, ${json}::jsonb)),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM'`;
  if (n === 0) throw new Error("ไม่พบระบบ CRM นี้ในร้าน");
}
// ◂ CRM C2.3
