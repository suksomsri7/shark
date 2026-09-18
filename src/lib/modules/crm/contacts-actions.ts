"use server";

// contacts-actions.ts — server actions ของหน้าผู้ติดต่อ (CRM v2 · ใบ C1.4)
// 🔴 "use server" = export ได้เฉพาะ async function (ชนิดข้อมูลอยู่ที่ contacts-shared.ts)
// 🔴 tenantId มาจาก session เสมอ · systemId จากหน้าเป็นแค่ "ตัวเลือก" — บริการ resolve ใหม่ (ต้องเป็นระบบ CRM ของร้านนี้)
// 🔴 F6: ทุก action ตรวจสิทธิ์ด้วย assertCan ก่อนลงมือ (convention crm.contact.<verb> — OWNER/MANAGER ผ่าน · STAFF ตามสิทธิ์)
// 🔴 actor สร้างด้วย `toMemberActor` เท่านั้น · ไม่โยน error ดิบถึงหน้าจอ — คืน { ok:false, error } ภาษาไทยที่ไม่โทษผู้ใช้

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import {
  archiveContact,
  assignContact,
  bulkAssign,
  companyOptions,
  contactOptions,
  convertContact,
  createContact,
  exportContacts,
  importContacts,
  mergeContacts,
  restoreContact,
  setLeadStatus,
  setLifecycle,
  setOptOut,
  setTags,
  updateContact,
  type ContactsCtx,
  type CreateContactInput,
  type UpdateContactPatch,
} from "./contacts";
import { set as setConsent } from "./consents";
import { CONTACT_IMPORT_INLINE_MAX_ROWS, CONTACT_IMPORT_MAX_BYTES, ContactsError, type ContactListInput, type ConvertInput, type DuplicateHit, type ImportContactsResult, type ImportDuplicateMode } from "./contacts-shared";

type Fail = { ok: false; error: string; code?: string; duplicates?: DuplicateHit[] };

async function session(systemId: string, action: string) {
  const auth = await requireTenant();
  assertCan(
    { role: auth.active.role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> },
    { module: "crm", action },
  );
  const ctx: ContactsCtx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  return { ctx, actor: toMemberActor(auth.user.id, auth.active) };
}

/** `multiStep` = งานที่ commit เป็นหลายช่วง (นำเข้า · รวม) — ล้มกลางทางแล้ว **ห้าม** บอกว่า "ข้อมูลไม่เปลี่ยน" */
function failOf(e: unknown, multiStep = false): Fail {
  if (e instanceof ContactsError) return { ok: false, error: e.message, code: e.code, ...(e.duplicates ? { duplicates: e.duplicates } : {}) };
  if (e instanceof ForbiddenError) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  // 🔴 ไม่ส่งรายละเอียดทางเทคนิค/ข้อมูลลูกค้าออกไป (log แค่ชนิด error)
  console.error(`[crm.contacts] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return multiStep
    ? { ok: false, error: "ทำรายการไม่สำเร็จครบทุกขั้น — บางส่วนอาจบันทึกไปแล้ว รีเฟรชหน้าเพื่อดูสถานะล่าสุดก่อนลองใหม่" }
    : { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const base = (systemId: string) => `/app/sys/${systemId}/crm/contacts`;

export async function createContactAction(
  systemId: string,
  input: CreateContactInput,
): Promise<{ ok: true; id: string; created: boolean; duplicates: DuplicateHit[]; warnings: string[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.create");
    const r = await createContact(ctx, actor, input);
    if (r.created) revalidatePath(base(systemId));
    return { ok: true, id: r.contact.id, created: r.created, duplicates: r.duplicates, warnings: r.warnings };
  } catch (e) {
    return failOf(e, true);
  }
}

export async function updateContactAction(systemId: string, contactId: string, patch: UpdateContactPatch): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.update");
    await updateContact(ctx, actor, contactId, patch);
    revalidatePath(`${base(systemId)}/${contactId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e, true);
  }
}

export async function setStatusAction(systemId: string, contactId: string, input: { leadStatus?: string; lifecycleStage?: string }): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.update");
    if (input.leadStatus) await setLeadStatus(ctx, actor, contactId, input.leadStatus);
    if (input.lifecycleStage) await setLifecycle(ctx, actor, contactId, input.lifecycleStage);
    revalidatePath(`${base(systemId)}/${contactId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e, true);
  }
}

export async function setTagsAction(systemId: string, contactId: string, tags: string[]): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.update");
    await setTags(ctx, actor, contactId, tags);
    revalidatePath(`${base(systemId)}/${contactId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setOptOutAction(systemId: string, contactId: string, optOut: boolean): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.update");
    await setOptOut(ctx, actor, contactId, { optOut, source: "STAFF" });
    revalidatePath(`${base(systemId)}/${contactId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setConsentAction(systemId: string, contactId: string, channel: string, granted: boolean): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.update");
    await setConsent(ctx, actor, contactId, { channel, granted, source: "STAFF" });
    revalidatePath(`${base(systemId)}/${contactId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function assignContactAction(systemId: string, contactId: string, userId: string | null): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.assign");
    await assignContact(ctx, actor, contactId, { userId: userId || null });
    revalidatePath(`${base(systemId)}/${contactId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function bulkAssignAction(systemId: string, input: { ids: string[]; userId: string | null; confirm: boolean; reason: string }): Promise<{ ok: true; updated: number } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.assign");
    const r = await bulkAssign(ctx, actor, input);
    revalidatePath(base(systemId));
    return { ok: true, updated: r.updated };
  } catch (e) {
    return failOf(e);
  }
}

export async function archiveContactAction(systemId: string, contactId: string, confirm: boolean, reason: string, restore = false): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.archive");
    if (restore) await restoreContact(ctx, actor, contactId, { confirm, reason });
    else await archiveContact(ctx, actor, contactId, { confirm, reason });
    revalidatePath(base(systemId));
    revalidatePath(`${base(systemId)}/${contactId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function convertContactAction(
  systemId: string,
  contactId: string,
  input: ConvertInput,
): Promise<{ ok: true; customerId: string | null; companyId: string | null; dealId: string | null } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.convert");
    const r = await convertContact(ctx, actor, contactId, input);
    revalidatePath(`${base(systemId)}/${contactId}`);
    return { ok: true, customerId: r.customerId, companyId: r.companyId, dealId: r.dealId };
  } catch (e) {
    return failOf(e, true);
  }
}

export async function mergeContactsAction(systemId: string, input: { keepId: string; mergeId: string; confirm: boolean; reason: string }): Promise<{ ok: true; keptId: string; warnings: string[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.merge");
    const r = await mergeContacts(ctx, actor, input);
    revalidatePath(base(systemId));
    revalidatePath(`${base(systemId)}/${r.keptId}`);
    return { ok: true, keptId: r.keptId, warnings: r.warnings };
  } catch (e) {
    return failOf(e, true);
  }
}

/**
 * นำเข้า (รีวิว C1.4 S4): หน้าจอส่ง `{headers, rows: string[][]}` — ขนาดที่ตรวจ = ไบต์ UTF-8 ของ `JSON.stringify({headers, rows})`
 * **ตัวเดียวกับที่หน้าจอวัดก่อนส่ง** (ไม่ใช่ขนาดไฟล์) · เพดานแถวแบบตอบทันที CONTACT_IMPORT_INLINE_MAX_ROWS · บริการตรวจซ้ำอีกชั้น
 */
export async function importContactsAction(
  systemId: string,
  input: { headers: string[]; rows: string[][]; mapping: Record<string, string>; onDuplicate: ImportDuplicateMode },
): Promise<({ ok: true; jobId: string } & ImportContactsResult) | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.import");
    const headers = Array.isArray(input?.headers) ? input.headers.map((h) => String(h ?? "")) : [];
    const rows = Array.isArray(input?.rows) ? input.rows : [];
    if (Buffer.byteLength(JSON.stringify({ headers, rows }), "utf8") > CONTACT_IMPORT_MAX_BYTES) {
      return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB — แบ่งไฟล์แล้วนำเข้าทีละส่วน", code: "VALIDATION" };
    }
    if (rows.length > CONTACT_IMPORT_INLINE_MAX_ROWS) {
      return { ok: false, error: `ตอนนี้นำเข้าได้ครั้งละไม่เกิน ${CONTACT_IMPORT_INLINE_MAX_ROWS.toLocaleString("th-TH")} แถว — แบ่งไฟล์เป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`, code: "VALIDATION" };
    }
    const records = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, String((Array.isArray(r) ? r[i] : "") ?? "")])));
    const r = await importContacts(ctx, actor, { rows: records, mapping: input.mapping, options: { onDuplicate: input.onDuplicate, source: "IMPORT" } });
    revalidatePath(base(systemId));
    return { ok: true, jobId: r.jobId, ...r.result };
  } catch (e) {
    revalidatePath(base(systemId));
    return failOf(e, true);
  }
}

export async function exportContactsAction(systemId: string, filters: ContactListInput, confirm: boolean, reason: string): Promise<{ ok: true; csv: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.export");
    const csv = await exportContacts(ctx, actor, { ...filters, cursor: null, pageSize: null, confirm, reason });
    return { ok: true, csv };
  } catch (e) {
    return failOf(e);
  }
}

/** ช่องเลือกผู้ติดต่อ (ค้นฝั่งเซิร์ฟเวอร์) — ใช้ในกล่องรวมผู้ติดต่อ ⇒ สิทธิ์เดียวกับการรวม */
export async function searchContactsAction(systemId: string, excludeId: string | null, q: string): Promise<{ ok: true; items: { id: string; name: string }[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.merge");
    return { ok: true, items: await contactOptions(ctx, actor, { q, excludeId }) };
  } catch (e) {
    return failOf(e);
  }
}

/** ช่องเลือกบริษัท (ค้นฝั่งเซิร์ฟเวอร์) — ใช้ตอนเพิ่มผู้ติดต่อ/แก้ไข/แปลง */
export async function searchCompaniesAction(systemId: string, q: string): Promise<{ ok: true; items: { id: string; name: string }[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.update");
    return { ok: true, items: await companyOptions(ctx, actor, q) };
  } catch (e) {
    return failOf(e);
  }
}
