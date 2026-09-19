"use server";

// objects-actions.ts — server action ทั้งหมดของหน้า "วัตถุกำหนดเอง" (CRM v2 · ใบ C1.9 · พิมพ์เขียว §3.6 §11.2 · มติผู้คุมงาน C1.9 ข้อ 3)
//
// 🔴 ทุก action เดินลำดับเดียว: `requireTenant` → คีย์สิทธิ์ผ่าน `crm/access` (assertCanCrm) → ctx จาก tenant ของ session
//    (systemId จากหน้าเป็นแค่ "ตัวเลือก" — ต้องเป็นระบบ CRM ของร้านนี้จริง) → `await assertCrmV2(ctx)` → บริการ C1.2b (`objects.ts`)
//    หรือ engine ฟิลด์ตัวเดียว (member facade `fields` · C1.2a) — **ไม่แตะตาราง CustomObject/CustomRecord ผ่าน prisma ตรง**
// 🔴 "use server" = export ได้เฉพาะ async function (ชนิด/ค่าคงที่ของหน้า 'use client' อยู่ที่ `objects-shared.ts`)
// 🔴 ผลลัพธ์ `{ ok: true, data } | { ok: false, error, reason, code }` — code ∈ NOT_FOUND · VALIDATION · DUPLICATE · CONFIRM_REQUIRED ·
//    FORBIDDEN (ระบบ uiVersion 1 = FORBIDDEN ผ่าน CrmV2DisabledError) · ข้อความไทยที่ไม่โทษผู้ใช้ · ไม่ส่งรายละเอียดทางเทคนิคออกไป
// 🔴 ชุด action ของฟิลด์/ส่วน = payload ของ member `fields-actions` + `objectKey` (ตระกูลผลลัพธ์เดียวกัน) ⇒ FieldDesigner สลับชุดได้

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { fields, toMemberActor, type MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { assertCanCrm } from "./access";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import * as objects from "./objects";
import { objectKeyProblem, ObjectsError, OBJECT_PARENT_TYPES, type ObjectDto, type ObjectParentType, type RecordDto } from "./objects-shared";

type Code = "NOT_FOUND" | "VALIDATION" | "DUPLICATE" | "CONFIRM_REQUIRED" | "FORBIDDEN";
type Fail = { ok: false; error: string; reason: string; code: Code };
type Ok<T> = { ok: true; data: T };
type Result<T> = Promise<Ok<T> | Fail>;

type Ctx = { tenantId: string; systemId: string; actorUserId: string };

const fail = (code: Code, message: string): Fail => ({ ok: false, error: message, reason: message, code });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const settingsPath = (systemId: string) => `/app/sys/${systemId}/crm/settings/objects`;
const listPath = (systemId: string, key: string) => `/app/sys/${systemId}/crm/objects/${key}`;

/**
 * ด่านเดียวของทุก action — ลำดับตามสัญญา C1.9
 * AUDIT-CLASS X1: tenantId จาก session เสมอ · systemId ต้องเป็นระบบ CRM ของร้านนี้ (ร้านอื่น/ระบบชนิดอื่น = NOT_FOUND ไม่บอกว่ามีอยู่)
 * AUDIT-CLASS X2: คีย์สิทธิ์ผ่านตัวตัดสินเดียว `crm/access` (MANAGER ไม่ได้ crm.object.manage โดยปริยาย · STAFF ตามที่ได้รับ)
 */
async function gate(systemId: unknown, key: string): Promise<{ ctx: Ctx; actor: MemberActor }> {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  assertCanCrm(actor, key);
  const tenantId = auth.active.tenantId;
  const id = typeof systemId === "string" ? systemId.trim() : "";
  const sys = id ? await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" }, select: { id: true } }) : null;
  if (!sys) throw new ObjectsError("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  const ctx: Ctx = { tenantId, systemId: sys.id, actorUserId: auth.user.id };
  // CRM uiVersion gate ▸ ระบบที่ยังไม่เปิด CRM ใหม่ (uiVersion 1) = FORBIDDEN ทุก action ของหน้านี้ (R-E.14 · กติกาถาวร) ◂
  await assertCrmV2(ctx);
  return { ctx, actor };
}

/** error → ผลลัพธ์หน้าจอ (ข้อความไทยเสมอ · ไม่หลุด P2002/stack ดิบ) — redirect/notFound ของ Next โยนต่อ */
function failOf(e: unknown): Fail {
  const digest = isObj(e) && typeof (e as { digest?: unknown }).digest === "string" ? String((e as { digest: string }).digest) : "";
  if (digest.startsWith("NEXT_")) throw e;
  if (e instanceof CrmV2DisabledError) return fail("FORBIDDEN", e.message);
  if (e instanceof ObjectsError) return fail(e.code, e.message);
  if (e instanceof ForbiddenError) {
    return fail("FORBIDDEN", /[ก-๙]/.test(e.message) ? e.message : "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง");
  }
  // AUDIT-CLASS X3: key ซ้ำที่ชนกันพร้อมกัน — unique index ตัดสิน · ผู้แพ้ได้ข้อความไทย
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("DUPLICATE", "ชื่ออ้างอิงนี้ถูกใช้ไปแล้วในระบบ CRM นี้ — ตั้งชื่ออ้างอิงอื่น");
  const name = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : "";
  const thai = /[ก-๙]/.test(msg);
  // error ของ engine ฟิลด์ (โมดูลสมาชิก — ตัดสินจากชื่อคลาส เหมือน objects.ts#engineError)
  if (name === "MemberNotFoundError") return fail("NOT_FOUND", thai ? msg : "ไม่พบข้อมูลนี้ในระบบ CRM ที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  if (name === "MemberInputError") return fail("VALIDATION", thai ? msg : "ข้อมูลที่กรอกยังใช้ไม่ได้ — ตรวจช่องที่แจ้งแล้วลองใหม่");
  if (name === "MemberConflictError") return fail("DUPLICATE", thai ? msg : "มีข้อมูลนี้อยู่แล้ว — ตั้งชื่ออื่น");
  if (name === "MemberForbiddenError") return fail("FORBIDDEN", thai ? msg : "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้");
  // engine ใช้ Error ธรรมดา (ข้อความไทย) กับค่าที่กรอกผิดรูป/เกินเพดาน · นำเข้าที่หยุดกลางทางบอกจำนวนที่สร้างไปแล้ว
  if (e instanceof Error && thai && !(e instanceof Prisma.PrismaClientKnownRequestError)) return fail("VALIDATION", msg);
  console.error(`[crm.objects] action ล้มเหลว — ${name || "unknown"}`);
  return fail("VALIDATION", "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว — ลองใหม่อีกครั้ง");
}

// ═════════════════════════ วัตถุ (ออกแบบ — crm.object.manage) ═════════════════════════

export async function createObjectAction(
  systemId: string,
  input: { key: string; label: string; labelPlural?: string; parentType: string; titleFieldKey: string; showAsTab?: boolean; portalVisible?: boolean; templateKey?: string | null },
): Result<ObjectDto> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.object.manage");
    const inp = isObj(input) ? input : ({} as Record<string, unknown>);
    // AUDIT-CLASS X6: กติกา key ตัวเดียว (มติ C1.9 ข้อ 1) ตรวจก่อนแตะบริการ — รูปแบบผิด/key สงวน = VALIDATION ไม่มีแถว
    const problem = objectKeyProblem(inp.key);
    if (problem) return fail("VALIDATION", problem);
    const parentType = txt(inp.parentType) as ObjectParentType;
    if (!OBJECT_PARENT_TYPES.includes(parentType)) return fail("VALIDATION", "เลือกว่ารายการของวัตถุนี้เป็นของใคร: สมาชิก · ผู้ติดต่อ · บริษัท · ดีล · หรือไม่ผูกกับใคร");
    const obj = await objects.create(ctx, actor, {
      key: txt(inp.key).trim(),
      label: txt(inp.label),
      labelPlural: txt(inp.labelPlural).trim() ? txt(inp.labelPlural) : undefined,
      parentType,
      titleFieldKey: txt(inp.titleFieldKey),
      showAsTab: inp.showAsTab === undefined ? undefined : inp.showAsTab === true,
      portalVisible: inp.portalVisible === true,
      templateKey: txt(inp.templateKey).trim() || null,
    });
    revalidatePath(settingsPath(ctx.systemId));
    return { ok: true, data: obj };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateObjectAction(
  systemId: string,
  objectKey: string,
  patch: { key?: string; label?: string; labelPlural?: string; parentType?: string; titleFieldKey?: string; showAsTab?: boolean; portalVisible?: boolean },
): Result<ObjectDto> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.object.manage");
    const p = isObj(patch) ? patch : ({} as Record<string, unknown>);
    const clean: objects.UpdateObjectInput = {};
    if (p.key !== undefined && txt(p.key).trim() !== txt(objectKey).trim()) {
      // AUDIT-CLASS X6: เปลี่ยนชื่ออ้างอิง = กติกาเดียวกับตอนสร้าง (บริการตรวจต่อ: มีรายการแล้ว/มีฟิลด์ LOOKUP ชี้มา = ปฏิเสธ)
      const problem = objectKeyProblem(p.key);
      if (problem) return fail("VALIDATION", problem);
      clean.key = txt(p.key).trim();
    }
    if (p.label !== undefined) clean.label = txt(p.label);
    if (p.labelPlural !== undefined) clean.labelPlural = txt(p.labelPlural);
    if (p.parentType !== undefined) clean.parentType = txt(p.parentType) as ObjectParentType;
    if (p.titleFieldKey !== undefined) clean.titleFieldKey = txt(p.titleFieldKey);
    if (p.showAsTab !== undefined) clean.showAsTab = p.showAsTab === true;
    if (p.portalVisible !== undefined) clean.portalVisible = p.portalVisible === true;
    const obj = await objects.update(ctx, actor, txt(objectKey), clean);
    revalidatePath(settingsPath(ctx.systemId));
    return { ok: true, data: obj };
  } catch (e) {
    return failOf(e);
  }
}

/** AUDIT-CLASS X9: วัตถุที่มีรายการ = พิมพ์ key ยืนยัน + เหตุผล ≥ 5 ตัวอักษร (บริการตัดสิน — CONFIRM_REQUIRED) · วัตถุว่างเก็บได้เลย */
export async function archiveObjectAction(systemId: string, objectKey: string, opts: { confirmKey?: string; reason?: string }): Result<ObjectDto> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.object.manage");
    const o: Record<string, unknown> = isObj(opts) ? opts : {};
    const obj = await objects.archive(ctx, actor, txt(objectKey), { confirmKey: txt(o.confirmKey) || null, reason: txt(o.reason) || null });
    revalidatePath(settingsPath(ctx.systemId));
    return { ok: true, data: obj };
  } catch (e) {
    return failOf(e);
  }
}

export async function restoreObjectAction(systemId: string, objectKey: string): Result<ObjectDto> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.object.manage");
    const obj = await objects.restore(ctx, actor, txt(objectKey));
    revalidatePath(settingsPath(ctx.systemId));
    return { ok: true, data: obj };
  } catch (e) {
    return failOf(e);
  }
}

// ═════════════════════════ ส่วน/ฟิลด์ของวัตถุ (engine ตัวเดียว · ctx.objectKey — R-E.1) ═════════════════════════

type DesignIn = { systemId: string; objectKey: string };

/** ctx ของ engine: วัตถุ + actor เดินทางไปด้วยเสมอ (K1) — engine resolve วัตถุใหม่เอง (ของระบบอื่น/ถูกเก็บถาวร = ไม่พบ) */
async function designCtx(input: unknown): Promise<{ ctx: Ctx; fctx: fields.FieldCtx; objectKey: string }> {
  const i: Record<string, unknown> = isObj(input) ? input : {};
  const { ctx, actor } = await gate(i.systemId, "crm.object.manage");
  const objectKey = txt(i.objectKey).trim();
  // "customer" = ฟิลด์ของระบบสมาชิก (หน้าตั้งค่าสมาชิกเป็นเจ้าของ) — หน้านี้ออกแบบได้เฉพาะวัตถุของระบบ CRM
  if (!objectKey || objectKey === "customer") throw new ObjectsError("NOT_FOUND", "ไม่พบวัตถุนี้ในระบบ CRM ที่เปิดอยู่ — เลือกวัตถุจากรายการ");
  return { ctx, objectKey, fctx: { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId, objectKey, actor } };
}

async function designAudit(ctx: Ctx, action: string, targetType: string, targetId: string | undefined, after: unknown) {
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action, targetType, targetId, after });
  revalidatePath(settingsPath(ctx.systemId));
}

export async function createObjectSectionAction(input: DesignIn & fields.CreateSectionInput): Result<fields.SectionDef> {
  try {
    const { ctx, fctx, objectKey } = await designCtx(input);
    const { systemId: _s, objectKey: _o, ...rest } = input;
    void _s;
    void _o;
    const section = await fields.createSection(fctx, rest);
    await designAudit(ctx, "crm.object.section.create", "MemberSection", section.id, { objectKey, key: section.key });
    return { ok: true, data: section };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateObjectSectionAction(input: DesignIn & { id: string; patch: fields.UpdateSectionInput }): Result<fields.SectionDef> {
  try {
    const { ctx, fctx, objectKey } = await designCtx(input);
    const section = await fields.updateSection(fctx, txt(input.id), isObj(input.patch) ? input.patch : {});
    await designAudit(ctx, "crm.object.section.update", "MemberSection", section.id, { objectKey, patch: input.patch });
    return { ok: true, data: section };
  } catch (e) {
    return failOf(e);
  }
}

export async function reorderObjectSectionsAction(input: DesignIn & { ids: string[] }): Result<{ ok: true }> {
  try {
    const { ctx, fctx, objectKey } = await designCtx(input);
    const r = await fields.reorderSections(fctx, Array.isArray(input.ids) ? input.ids.map(String) : []);
    await designAudit(ctx, "crm.object.section.reorder", "CustomObject", undefined, { objectKey, ids: input.ids });
    return { ok: true, data: r };
  } catch (e) {
    return failOf(e);
  }
}

export async function deleteObjectSectionAction(input: DesignIn & { id: string }): Result<{ ok: true }> {
  try {
    const { ctx, fctx, objectKey } = await designCtx(input);
    const r = await fields.deleteSection(fctx, txt(input.id));
    await designAudit(ctx, "crm.object.section.delete", "MemberSection", txt(input.id), { objectKey });
    return { ok: true, data: r };
  } catch (e) {
    return failOf(e);
  }
}

export async function createObjectFieldAction(input: DesignIn & fields.CreateFieldInput): Result<fields.FieldDef> {
  try {
    const { ctx, fctx, objectKey } = await designCtx(input);
    const { systemId: _s, objectKey: _o, ...rest } = input;
    void _s;
    void _o;
    const field = await fields.createField(fctx, rest);
    await designAudit(ctx, "crm.object.field.create", "MemberField", field.id, { objectKey, key: field.key, type: field.type });
    return { ok: true, data: field };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateObjectFieldAction(input: DesignIn & { id: string; patch: fields.UpdateFieldInput }): Result<fields.FieldDef> {
  try {
    const { ctx, fctx, objectKey } = await designCtx(input);
    const field = await fields.updateField(fctx, txt(input.id), isObj(input.patch) ? input.patch : {});
    await designAudit(ctx, "crm.object.field.update", "MemberField", field.id, { objectKey, patch: input.patch });
    return { ok: true, data: field };
  } catch (e) {
    return failOf(e);
  }
}

export async function reorderObjectFieldsAction(input: DesignIn & { sectionId: string; ids: string[] }): Result<{ ok: true }> {
  try {
    const { ctx, fctx, objectKey } = await designCtx(input);
    const r = await fields.reorderFields(fctx, txt(input.sectionId), Array.isArray(input.ids) ? input.ids.map(String) : []);
    await designAudit(ctx, "crm.object.field.reorder", "MemberSection", txt(input.sectionId), { objectKey, ids: input.ids });
    return { ok: true, data: r };
  } catch (e) {
    return failOf(e);
  }
}

export async function archiveObjectFieldAction(input: DesignIn & { id: string }): Result<fields.FieldDef> {
  try {
    const { ctx, fctx, objectKey } = await designCtx(input);
    const field = await fields.archiveField(fctx, txt(input.id));
    await designAudit(ctx, "crm.object.field.archive", "MemberField", field.id, { objectKey });
    return { ok: true, data: field };
  } catch (e) {
    return failOf(e);
  }
}

export async function restoreObjectFieldAction(input: DesignIn & { id: string }): Result<fields.FieldDef> {
  try {
    const { ctx, fctx, objectKey } = await designCtx(input);
    const field = await fields.restoreField(fctx, txt(input.id));
    await designAudit(ctx, "crm.object.field.restore", "MemberField", field.id, { objectKey });
    return { ok: true, data: field };
  } catch (e) {
    return failOf(e);
  }
}

// ═════════════════════════ รายการ (crm.record.*) ═════════════════════════

const cleanValues = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {});

/** AUDIT-CLASS X1: แม่ต้องเป็นของระบบนี้และ "มองเห็นได้" (บริการ resolveParent + where ของแม่ — C1.7) · เจ้าของ/สาขาไม่รับจากหน้าจอ */
export async function createRecordAction(systemId: string, objectKey: string, input: { parentId?: string | null; title?: string | null; values?: Record<string, unknown> }): Result<RecordDto> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.record.create");
    const i: Record<string, unknown> = isObj(input) ? input : {};
    const rec = await objects.records.create(ctx, actor, txt(objectKey), {
      parentId: txt(i.parentId).trim() || null,
      title: txt(i.title).trim() || null,
      values: cleanValues(i.values),
    });
    revalidatePath(listPath(ctx.systemId, rec.objectKey));
    return { ok: true, data: rec };
  } catch (e) {
    return failOf(e);
  }
}

/**
 * AUDIT-CLASS X2 (มติ C1.7: การมองเห็นก่อนคีย์): ด่านหน้าตรวจคีย์อ่านรายการ · คีย์แก้ไข/ลบ บริการตรวจ **หลัง** หารายการที่มองเห็นเจอ
 * ⇒ รายการที่แม่มองไม่เห็น = NOT_FOUND เสมอ (ไม่บอกว่ามีอยู่ด้วยการตอบ FORBIDDEN) · มองเห็นแต่ไม่มีคีย์ = FORBIDDEN
 */
export async function updateRecordAction(systemId: string, objectKey: string, recordId: string, patch: { title?: string | null; values?: Record<string, unknown> }): Result<RecordDto> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.record.read");
    const p: Record<string, unknown> = isObj(patch) ? patch : {};
    const rec = await objects.records.update(ctx, actor, txt(objectKey), txt(recordId), {
      ...(p.title !== undefined && p.title !== null && txt(p.title).trim() ? { title: txt(p.title) } : {}),
      values: cleanValues(p.values),
    });
    revalidatePath(`${listPath(ctx.systemId, rec.objectKey)}/${rec.id}`);
    return { ok: true, data: rec };
  } catch (e) {
    return failOf(e);
  }
}

/** AUDIT-CLASS X2: เหมือน updateRecordAction — คีย์ crm.record.delete บริการตรวจหลังการมองเห็น (มองไม่เห็น = NOT_FOUND) */
export async function archiveRecordAction(systemId: string, objectKey: string, recordId: string): Result<RecordDto> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.record.read");
    const rec = await objects.records.archive(ctx, actor, txt(objectKey), txt(recordId));
    revalidatePath(listPath(ctx.systemId, rec.objectKey));
    return { ok: true, data: rec };
  } catch (e) {
    return failOf(e);
  }
}

/** AUDIT-CLASS X6: เพดาน OBJECT_IMPORT_MAX_ROWS / OBJECT_IMPORT_MAX_BYTES + คอลัมน์ที่ไม่รู้จัก = บริการปฏิเสธทั้งไฟล์ · แถวที่แม่มองไม่เห็น = ข้าม (X1) */
export async function importRecordsAction(systemId: string, objectKey: string, input: { csv: string }): Result<objects.ImportRecordsResult> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.record.create");
    const r = await objects.records.import(ctx, actor, txt(objectKey), { csv: txt(isObj(input) ? input.csv : "") });
    revalidatePath(listPath(ctx.systemId, txt(objectKey)));
    return { ok: true, data: r };
  } catch (e) {
    return failOf(e);
  }
}

const VIEW_NAME_MAX = 80;
const VIEW_FILTER_MAX = 30;
/** รีวิว S5: มุมมองที่บันทึกได้ต่อคน ต่อรายการวัตถุ 1 ตัว */
const VIEW_PER_USER_MAX = 50;

/**
 * มุมมองที่บันทึกไว้ของหน้ารายการวัตถุ → `MemberSavedView{ systemId, objectKey }` (ตารางเดียวกับมุมมองสมาชิก/ผู้ติดต่อ)
 * ตัวกรองถูกตรวจกับ engine ก่อนบันทึก (key ที่วัตถุไม่มี = VALIDATION — มุมมองที่ใช้ไม่ได้ไม่ถูกเก็บ)
 * scope TEAM (ทั้งร้าน) = เจ้าของร้าน/ผู้จัดการเท่านั้น (กติกาเดียวกับ member/views.ts)
 */
export async function saveObjectViewAction(
  systemId: string,
  objectKey: string,
  input: { name: string; filters: { f?: Record<string, string>; q?: string }; scope?: "PRIVATE" | "TEAM" },
): Result<{ id: string; name: string }> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.record.read");
    const i: Record<string, unknown> = isObj(input) ? input : {};
    const name = txt(i.name).trim();
    if (!name) return fail("VALIDATION", "ตั้งชื่อมุมมองก่อนจึงบันทึกได้");
    if (name.length > VIEW_NAME_MAX) return fail("VALIDATION", `ชื่อมุมมองยาวเกิน ${VIEW_NAME_MAX} ตัวอักษร — ตั้งให้สั้นลง`);
    const scope = i.scope === "TEAM" ? "TEAM" : "PRIVATE";
    if (scope === "TEAM" && actor.role !== "OWNER" && actor.role !== "MANAGER") {
      return fail("FORBIDDEN", 'บันทึกมุมมองแบบ "ทั้งร้าน" ได้เฉพาะเจ้าของร้านและผู้จัดการ — บันทึกเป็นมุมมองส่วนตัวแทนได้');
    }
    const rawF = isObj(i.filters) && isObj(i.filters.f) ? i.filters.f : {};
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawF).slice(0, VIEW_FILTER_MAX)) if (typeof v === "string" && v.trim()) f[k.slice(0, 64)] = v.trim().slice(0, 200);
    const q = isObj(i.filters) ? txt(i.filters.q).trim().slice(0, 100) : "";
    // ตรวจวัตถุ (ของระบบนี้ · ยังไม่เก็บถาวร) + ตัวกรองทั้งชุดด้วยบริการเอง — อ่านอย่างเดียว 1 แถว
    const probe = await objects.records.list(ctx, actor, txt(objectKey), { f, q: q || null, pageSize: 1 });
    void probe;
    // CRM C1.9 ▸ รีวิว S5: เพดานมุมมองต่อคนต่อวัตถุ (กันรายการมุมมองยาวจนหน้าใช้ไม่ได้) ◂
    const mine = await prisma.memberSavedView.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: txt(objectKey).trim(), ownerUserId: ctx.actorUserId } });
    if (mine >= VIEW_PER_USER_MAX) {
      return fail("VALIDATION", `บันทึกมุมมองของรายการนี้ครบ ${VIEW_PER_USER_MAX} มุมมองแล้ว — ลบมุมมองที่ไม่ใช้ก่อน แล้วบันทึกใหม่`);
    }
    const row = await prisma.memberSavedView.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        ownerUserId: ctx.actorUserId,
        scope,
        name,
        objectKey: txt(objectKey).trim(),
        filters: { f, ...(q ? { q } : {}) },
      },
      select: { id: true, name: true },
    });
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.object.view.create", targetType: "MemberSavedView", targetId: row.id, after: { objectKey, scope, filterKeys: Object.keys(f) } });
    revalidatePath(listPath(ctx.systemId, txt(objectKey)));
    return { ok: true, data: row };
  } catch (e) {
    return failOf(e);
  }
}

// CRM C1.9 ▸ รีวิว S5: เปลี่ยนชื่อ/ลบมุมมองที่บันทึกไว้ — เจ้าของมุมมอง · มุมมองทั้งร้าน (TEAM) = เจ้าของร้าน/ผู้จัดการได้ด้วย · มี audit ทุกครั้ง

/**
 * AUDIT-CLASS X1: มุมมองของระบบนี้ + วัตถุนี้ + ที่ผู้ใช้มองเห็นได้ (ของตัวเอง หรือ TEAM) เท่านั้น — อื่น ๆ = NOT_FOUND
 * AUDIT-CLASS X2: เห็นแต่ไม่ใช่เจ้าของ (และไม่ใช่ TEAM + MANAGER ขึ้นไป) = FORBIDDEN
 */
async function editableView(ctx: Ctx, actor: MemberActor, objectKey: string, viewId: string) {
  const row = viewId
    ? await prisma.memberSavedView.findFirst({
        where: { id: viewId, tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: objectKey.trim(), OR: [{ ownerUserId: ctx.actorUserId }, { scope: "TEAM" }] },
        select: { id: true, name: true, scope: true, ownerUserId: true },
      })
    : null;
  if (!row) throw new ObjectsError("NOT_FOUND", "ไม่พบมุมมองนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่");
  const managerPlus = actor.role === "OWNER" || actor.role === "MANAGER";
  if (row.ownerUserId !== ctx.actorUserId && !(row.scope === "TEAM" && managerPlus)) {
    throw new ObjectsError("FORBIDDEN", "แก้ไขหรือลบมุมมองนี้ได้เฉพาะคนที่สร้าง หรือเจ้าของร้าน/ผู้จัดการสำหรับมุมมองทั้งร้าน");
  }
  return row;
}

export async function renameObjectViewAction(systemId: string, objectKey: string, viewId: string, input: { name: string }): Result<{ id: string; name: string }> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.record.read");
    const row = await editableView(ctx, actor, txt(objectKey), txt(viewId));
    const name = txt(isObj(input) ? input.name : "").trim();
    if (!name) return fail("VALIDATION", "ตั้งชื่อมุมมองก่อนจึงบันทึกได้");
    if (name.length > VIEW_NAME_MAX) return fail("VALIDATION", `ชื่อมุมมองยาวเกิน ${VIEW_NAME_MAX} ตัวอักษร — ตั้งให้สั้นลง`);
    const out = await prisma.memberSavedView.update({ where: { id: row.id }, data: { name }, select: { id: true, name: true } });
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.object.view.rename", targetType: "MemberSavedView", targetId: row.id, before: { name: row.name }, after: { name } });
    revalidatePath(listPath(ctx.systemId, txt(objectKey)));
    return { ok: true, data: out };
  } catch (e) {
    return failOf(e);
  }
}

export async function deleteObjectViewAction(systemId: string, objectKey: string, viewId: string): Result<{ id: string }> {
  try {
    const { ctx, actor } = await gate(systemId, "crm.record.read");
    const row = await editableView(ctx, actor, txt(objectKey), txt(viewId));
    await prisma.memberSavedView.delete({ where: { id: row.id } });
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.object.view.delete", targetType: "MemberSavedView", targetId: row.id, before: { name: row.name, scope: row.scope, objectKey } });
    revalidatePath(listPath(ctx.systemId, txt(objectKey)));
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return failOf(e);
  }
}
// ◂ CRM C1.9
