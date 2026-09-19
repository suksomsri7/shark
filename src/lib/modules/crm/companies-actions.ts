"use server";

// companies-actions.ts — server actions ของหน้าบริษัท (CRM v2 · ใบ C1.3)
// 🔴 "use server" = export ได้เฉพาะ async function (ชนิดข้อมูลอยู่ที่ companies-shared.ts)
// 🔴 tenantId มาจาก session เสมอ · systemId จากหน้าเป็นแค่ "ตัวเลือก" — บริการ resolve ใหม่ (ต้องเป็นระบบ CRM ของร้านนี้)
// 🔴 F6: ทุก action ตรวจสิทธิ์ด้วย assertCan ก่อนลงมือ (convention crm.company.<verb> — OWNER/MANAGER ผ่าน · STAFF ตามสิทธิ์)
// 🔴 ไม่โยน error ดิบถึงหน้าจอ — คืน { ok:false, error } เป็นภาษาไทยที่ไม่โทษผู้ใช้

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { assertCanCrm } from "./access";
import { toMemberActor } from "@/lib/modules/member";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import {
  addContact,
  archiveCompany,
  companyOptions,
  contactOptions,
  createCompany,
  exportCompanies,
  importCompanies,
  mergeCompanies,
  removeContact,
  restoreCompany,
  setOwner,
  setParent,
  setPrimary,
  setRole,
  updateCompany,
  type CompaniesCtx,
  type CreateCompanyInput,
  type UpdateCompanyInput,
} from "./companies";
import { CompaniesError, type CompanyCandidate, type ImportCompaniesResult } from "./companies-shared";

type Fail = { ok: false; error: string; code?: string; duplicateOf?: string };

async function session(systemId: string, action: string) {
  const auth = await requireTenant();
  // CRM C1.7 ▸ มติผู้คุมงาน C1.7 ข้อ 3: ด่านคีย์ผ่าน `crm/access.ts` (MANAGER ปริยายไม่ได้ 5 คีย์ตั้งค่า · อ่านโดยนัยของคน) ◂
  const actor = toMemberActor(auth.user.id, auth.active);
  assertCanCrm(actor, action);
  const ctx: CompaniesCtx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  // CRM uiVersion gate ▸ action ของหน้า v2 ใช้ได้เฉพาะระบบที่เปิด CRM ใหม่ (settings.crm.uiVersion = 2) — action v1 (`actions.ts`) ไม่ผ่านที่นี่ ◂
  await assertCrmV2(ctx);
  return { ctx, actor };
}

/**
 * แปลง error เป็นข้อความหน้าจอ · `multiStep` = งานที่ commit เป็นหลายช่วง (นำเข้า · รวม) — ล้มกลางทางแล้ว **ห้าม** บอกว่า
 * "ข้อมูลไม่เปลี่ยน" เพราะช่วงก่อนหน้าอาจบันทึกไปแล้ว (รีวิว SF9)
 */
function failOf(e: unknown, multiStep = false): Fail {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof CompaniesError) return { ok: false, error: e.message, code: e.code, ...(e.duplicateOf ? { duplicateOf: e.duplicateOf } : {}) };
  if (e instanceof ForbiddenError) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  // 🔴 ไม่ส่งรายละเอียดทางเทคนิค/ข้อมูลลูกค้าออกไป (log แค่ชนิด error)
  console.error(`[crm.companies] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return multiStep
    ? { ok: false, error: "ทำรายการไม่สำเร็จครบทุกขั้น — บางส่วนอาจบันทึกไปแล้ว รีเฟรชหน้าเพื่อดูสถานะล่าสุดก่อนลองใหม่" }
    : { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const base = (systemId: string) => `/app/sys/${systemId}/crm/companies`;

export async function createCompanyAction(
  systemId: string,
  input: CreateCompanyInput,
): Promise<{ ok: true; id: string; created: boolean; duplicateOf: string | null; duplicateArchived: boolean; candidates: CompanyCandidate[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.create");
    const r = await createCompany(ctx, actor, input);
    if (r.created) revalidatePath(base(systemId));
    return { ok: true, id: r.company.id, created: r.created, duplicateOf: r.duplicateOf, duplicateArchived: !!r.duplicateArchived, candidates: r.candidates };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateCompanyAction(systemId: string, companyId: string, patch: UpdateCompanyInput): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.update");
    await updateCompany(ctx, actor, companyId, patch);
    revalidatePath(`${base(systemId)}/${companyId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function archiveCompanyAction(systemId: string, companyId: string, confirm: boolean, reason: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.archive");
    await archiveCompany(ctx, actor, companyId, { confirm, reason });
    revalidatePath(base(systemId));
    revalidatePath(`${base(systemId)}/${companyId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setOwnerAction(systemId: string, companyId: string, userId: string | null): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.update");
    await setOwner(ctx, actor, companyId, userId || null);
    revalidatePath(`${base(systemId)}/${companyId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setParentAction(systemId: string, companyId: string, parentId: string | null): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.update");
    await setParent(ctx, actor, companyId, parentId || null);
    revalidatePath(`${base(systemId)}/${companyId}`);
    if (parentId) revalidatePath(`${base(systemId)}/${parentId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function addContactAction(
  systemId: string,
  companyId: string,
  input: { contactId: string; role?: string | null; jobTitle?: string | null; isPrimary?: boolean },
): Promise<{ ok: true; created: boolean } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.update");
    const r = await addContact(ctx, actor, companyId, input);
    revalidatePath(`${base(systemId)}/${companyId}`);
    return { ok: true, created: r.created };
  } catch (e) {
    return failOf(e);
  }
}

export async function removeContactAction(systemId: string, companyId: string, contactId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.update");
    await removeContact(ctx, actor, companyId, contactId);
    revalidatePath(`${base(systemId)}/${companyId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setPrimaryAction(systemId: string, companyId: string, contactId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.update");
    await setPrimary(ctx, actor, companyId, contactId);
    revalidatePath(`${base(systemId)}/${companyId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setRoleAction(systemId: string, companyId: string, contactId: string, role: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.update");
    await setRole(ctx, actor, companyId, contactId, role);
    revalidatePath(`${base(systemId)}/${companyId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function mergeCompaniesAction(
  systemId: string,
  input: { keepId: string; mergeId: string; confirm: boolean; reason: string },
): Promise<{ ok: true; keptId: string; accountMergeFailed: string | null; accountMergeSkipped: "NO_PERMISSION" | null; warnings: string[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.merge");
    const r = await mergeCompanies(ctx, actor, input);
    revalidatePath(base(systemId));
    revalidatePath(`${base(systemId)}/${r.keptId}`);
    return {
      ok: true,
      keptId: r.keptId,
      accountMergeFailed: r.accountMerge && !r.accountMerge.ok ? (r.accountMerge.reason ?? "ย้ายเอกสารบัญชีไม่สำเร็จ") : null,
      accountMergeSkipped: r.accountMergeSkipped,
      warnings: r.warnings,
    };
  } catch (e) {
    return failOf(e, true);
  }
}

export async function restoreCompanyAction(systemId: string, companyId: string, confirm: boolean, reason: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.archive");
    await restoreCompany(ctx, actor, companyId, { confirm, reason });
    revalidatePath(base(systemId));
    revalidatePath(`${base(systemId)}/${companyId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ช่องเลือกผู้ติดต่อ (ค้นฝั่งเซิร์ฟเวอร์ — รีวิว SF11) · อ่านอย่างเดียว แต่ใช้ในกล่องแก้บริษัท ⇒ สิทธิ์เดียวกับการแก้ */
export async function searchContactOptionsAction(systemId: string, companyId: string, q: string): Promise<{ ok: true; items: { id: string; name: string }[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.update");
    return { ok: true, items: await contactOptions(ctx, actor, companyId, q) };
  } catch (e) {
    return failOf(e);
  }
}

/** ช่องเลือกบริษัท (บริษัทแม่ · คู่รวม) — ค้นฝั่งเซิร์ฟเวอร์ */
export async function searchCompanyOptionsAction(systemId: string, excludeId: string | null, q: string): Promise<{ ok: true; items: { id: string; name: string }[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.update");
    return { ok: true, items: await companyOptions(ctx, actor, { excludeId, q }) };
  } catch (e) {
    return failOf(e);
  }
}

export async function importCompaniesAction(systemId: string, csv: string): Promise<({ ok: true } & ImportCompaniesResult) | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.import");
    const r = await importCompanies(ctx, actor, { csv });
    revalidatePath(base(systemId));
    return { ok: true, ...r };
  } catch (e) {
    revalidatePath(base(systemId));
    return failOf(e, true);
  }
}

export async function exportCompaniesAction(
  systemId: string,
  filters: { q?: string | null; industry?: string | null; size?: string | null; owner?: string | null; hasOpenDeals?: boolean | null; includeArchived?: boolean | null },
): Promise<{ ok: true; csv: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.company.export");
    const csv = await exportCompanies(ctx, actor, filters);
    return { ok: true, csv };
  } catch (e) {
    return failOf(e);
  }
}
