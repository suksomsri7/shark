// party/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2.2 บังคับ)
// WO 3.1 — ดู service.ts สำหรับตรรกะเต็ม + wo-notes/3.1.md สำหรับเหตุผลการออกแบบ

import type { Prisma, PartyMergeReason } from "@prisma/client";
import {
  findOrCreate as findOrCreateInner,
  listBriefsByIds as listBriefsByIdsInner,
  getProfile as getProfileInner,
  searchByName as searchByNameInner,
  type PartyBrief,
  type PartyProfile,
  resolveCanonical as resolveCanonicalInner,
  findDuplicateCandidates as findDuplicateCandidatesInner,
  recordMergeCandidates as recordMergeCandidatesInner,
  recordMergeCandidatePair as recordMergeCandidatePairInner,
  mergeParties as mergePartiesInner,
  updateContactInfo as updateContactInfoInner,
  type UpdateContactInfoInput,
  type UpdateContactInfoResult,
  normalizePartyTaxId,
  normalizePartyPhone,
  nameSimilarity,
  type PartyFindOrCreateInput,
  type DuplicatePair,
} from "./service";

export { normalizePartyTaxId, normalizePartyPhone, nameSimilarity };
export type { PartyFindOrCreateInput, DuplicatePair, PartyBrief, PartyProfile, UpdateContactInfoInput, UpdateContactInfoResult };

/** หา/สร้าง Party ตามลำดับ taxId → phoneNorm → name+email (ดู service.ts) — อาจ throw ถ้า DB ผิดพลาดจริง */
export async function findOrCreate(
  tenantId: string,
  input: PartyFindOrCreateInput,
  client?: Prisma.TransactionClient,
): Promise<{ id: string; created: boolean }> {
  return findOrCreateInner(tenantId, input, client);
}

/**
 * เหมือน `findOrCreate` แต่**ไม่มีวันทำให้ผู้เรียก throw** (BLUEPRINT §1 / MAP §F.15: "ไม่เชื่อม = ไม่ post"
 * — ไม่มีโมดูลใดล้มเพราะ Party หาย) ล้มเหลว → log เหตุ (ไม่มีข้อมูลลูกค้าในข้อความ) แล้วคืน `null`
 * โมดูลผู้ผลิต (account/member/crm/hr/procurement) ควรเรียกตัวนี้ ไม่ใช่ `findOrCreate` ตรง ๆ
 */
export async function safeFindOrCreate(
  tenantId: string,
  input: PartyFindOrCreateInput,
  client?: Prisma.TransactionClient,
): Promise<string | null> {
  try {
    const res = await findOrCreateInner(tenantId, input, client);
    return res.id;
  } catch (e) {
    // 🔴 ห้าม log ข้อมูลลูกค้า — พิมพ์แค่ tenantId + ชนิด error ไม่พิมพ์ e.message/input ดิบ
    console.error(
      `[party] safeFindOrCreate ล้มเหลว (tenant=${tenantId}) — ${e instanceof Error ? e.name || "Error" : "unknown"}`,
    );
    return null;
  }
}

/** ตาม chain การรวม (mergedIntoId) จนสุดทาง — คืน id ปลายทางที่ยังไม่ถูกรวมต่อ */
export async function resolveCanonical(
  tenantId: string,
  partyId: string,
  client?: Prisma.TransactionClient,
): Promise<string> {
  return resolveCanonicalInner(tenantId, partyId, client);
}

/** คู่ Party ที่สงสัยว่าเป็นคนเดียวกัน (สำหรับหน้า "รวมผู้ติดต่อซ้ำ" — WO 3.4) */
export async function findDuplicateCandidates(
  tenantId: string,
  client?: Prisma.TransactionClient,
): Promise<DuplicatePair[]> {
  return findDuplicateCandidatesInner(tenantId, client);
}

/** สแกน + บันทึกคู่ซ้ำลง PartyMergeCandidate — idempotent เรียกซ้ำได้ (เช่นจาก cron) */
export async function recordMergeCandidates(
  tenantId: string,
  client?: Prisma.TransactionClient,
): Promise<{ scanned: number; recorded: number }> {
  return recordMergeCandidatesInner(tenantId, client);
}

/**
 * ชื่อของผู้ติดต่อหลายรายในร้านเดียว (K3.1 — บอร์ดงานแสดงชื่อของการ์ดที่ผูกกับผู้ติดต่อ)
 * 🔴 คืนแค่ `{ id, name }` — ห้ามเพิ่ม phone/email/taxId เข้ามาในผลลัพธ์ของ facade ตัวนี้
 *    (โมดูลที่เรียกไม่ได้ผ่านด่านสิทธิ์ของโมดูลผู้ติดต่อ — ให้ชื่อพอสำหรับ "รู้ว่าผูกกับใคร" เท่านั้น)
 */
export async function listBriefsByIds(
  tenantId: string,
  ids: readonly string[],
  client?: Prisma.TransactionClient,
): Promise<PartyBrief[]> {
  return listBriefsByIdsInner(tenantId, ids, client);
}

/**
 * โปรไฟล์เต็มของผู้ติดต่อ 1 ราย รวม**ข้อมูลติดต่อ** (K3.4 · D23 — หน้า `/app/party/{id}`)
 * 🔴 ผู้เรียกต้องผ่านด่านสิทธิ์ของตัวเองมาก่อน แล้วเลือกเองว่าจะโชว์ฟิลด์ไหนให้ใคร
 *    (คนที่มีแค่คีย์ `kanban.*` เห็นได้แค่ชื่อ — ดู `src/app/app/party/[partyId]/page.tsx`)
 * ไม่พบ / เป็นของร้านอื่น → `null` (หน้าเรียกต้องแปลงเป็น notFound เสมอ ห้ามบอกว่า "มีแต่ห้ามดู")
 */
export async function getProfile(
  tenantId: string,
  partyId: string,
  client?: Prisma.TransactionClient,
): Promise<PartyProfile | null> {
  return getProfileInner(tenantId, partyId, client);
}

/** ค้นผู้ติดต่อจากชื่อ (K3.1 — ช่อง "ผู้ติดต่อ" ของป๊อปอัป "เพิ่มการเชื่อม") */
export async function searchByName(
  tenantId: string,
  query: string,
  limit?: number,
  client?: Prisma.TransactionClient,
): Promise<PartyBrief[]> {
  return searchByNameInner(tenantId, query, limit, client);
}

/**
 * บันทึกคู่ "อาจเป็นคนเดียวกัน" เจาะจง 1 คู่ (M1.4 · D18 — id ช่องทางชนกับเบอร์ของอีกคน)
 * idempotent · id ที่ไม่ใช่ของร้านนี้ → คืน null เงียบ ๆ
 */
export async function recordMergeCandidatePair(
  tenantId: string,
  partyAId: string,
  partyBId: string,
  reason: PartyMergeReason,
  client?: Prisma.TransactionClient,
): Promise<{ id: string; created: boolean } | null> {
  return recordMergeCandidatePairInner(tenantId, partyAId, partyBId, reason, client);
}

/**
 * รวมตัวตนกลางสองราย (`mergeId` → `mergedIntoId` = `keepId`) — ไม่ลบแถว · idempotent
 * 🔴 ผู้เรียกต้องย้ายข้อมูลของโมดูลตัวเองใน transaction เดียวกัน (member.mergeMembers ทำแบบนี้)
 */
export async function mergeParties(
  tenantId: string,
  keepId: string,
  mergeId: string,
  client?: Prisma.TransactionClient,
): Promise<boolean> {
  return mergePartiesInner(tenantId, keepId, mergeId, client);
}

/**
 * แก้ข้อมูลติดต่อ (ชื่อ/เบอร์/อีเมล) ของ Party หนึ่งราย — **เฉพาะช่องที่ส่งมา** (WO CRM v2 · C0.3 ส่วน E)
 * เบอร์ถูก normalize ด้วยกติกาเดียวกับ `findOrCreate` แล้วเขียน `phoneNorm` ให้เสมอ ·
 * ค่าที่ไปชนกับ Party รายอื่นของร้านเดียวกัน = **บันทึกคู่ "อาจเป็นคนเดียวกัน"** ไม่ใช่ล้มคำสั่ง ·
 * ส่ง `client` (tx) มาได้ = เข้าร่วมทรานแซกชันของผู้เรียกจริง ๆ (rollback แล้วไม่มีอะไรเปลี่ยน) ·
 * id ของร้านอื่น/ไม่มีอยู่ → `{ok:false}` พร้อมเหตุผลไทย ไม่ throw ไม่แตะแถวใด ·
 * **id ที่ถูกรวมไปแล้วจะถูกเด้งไปตัวปลายทางก่อนเขียน** (`resolveCanonical`) แล้วคืนแถวที่เขียนจริงใน `partyId`
 * — ผู้เรียกที่ถือ id เก่าจึงไม่เขียนลงแถวที่ไม่มีจอไหนอ่านอีกแล้ว (กดบันทึกผ่าน แต่ข้อมูลไม่เปลี่ยน)
 */
export async function updateContactInfo(
  tenantId: string,
  partyId: string,
  input: UpdateContactInfoInput,
  client?: Prisma.TransactionClient,
): Promise<UpdateContactInfoResult> {
  return updateContactInfoInner(tenantId, partyId, input, client);
}

// CRM C1.3 ▸ ชื่อ/เลขภาษีของตัวตนกลางชนิดบริษัท (มติผู้คุมงาน C1.3 ข้อ 4) — `crm/companies.ts` เรียกใน tx เดียวกับการแก้บริษัท
//   • เขียน **เฉพาะช่องที่ส่งมา** (`undefined` = ไม่แตะ) · id ที่ถูกรวมไปแล้วเด้งไปตัวปลายทางก่อนเขียน (กติกาเดียวกับ updateContactInfo)
//   • เลขภาษี normalize เป็นตัวเลขล้วน (`normalizePartyTaxId`) · ว่าง/null = ล้าง · branchCode ว่าง = "00000"
//   • เลขภาษี+สาขาไปชนกับ Party รายอื่นของร้าน = **บันทึกคู่ "อาจเป็นรายเดียวกัน" (TAX_ID)** ไม่ใช่ล้มคำสั่ง
//   • `client` บังคับ (tx ของผู้เรียก) — rollback แล้วไม่มีอะไรเปลี่ยน · where ผูก tenantId ทุกคำสั่ง
//   • ไม่ log ข้อมูลใด ๆ (PDPA X8)
export async function updateCompanyIdentity(
  tenantId: string,
  partyId: string,
  input: { name?: string | null; taxId?: string | null; branchCode?: string | null },
  client: Prisma.TransactionClient,
): Promise<{ ok: boolean; partyId?: string; changed: ("name" | "taxId" | "branchCode")[] }> {
  // ok:false = ไม่พบ / ไม่ใช่ Party ชนิดบริษัท (ผู้เรียกต้องไม่แก้ตัวตนนั้น — ย้ายไปใช้ Party บริษัทของตัวเองแทน)
  const asked = (partyId ?? "").trim();
  if (!tenantId || !asked) return { ok: false, changed: [] };
  const id = await resolveCanonicalInner(tenantId, asked, client);
  const current = await client.party.findFirst({ where: { tenantId, id }, select: { id: true, kind: true, name: true, taxId: true, branchCode: true } });
  if (!current) return { ok: false, changed: [] };
  // 🔴 B1 (รีวิว C1.3): ตัวตนของ "คน" (PERSON — เช่น เลขบัตรประชาชนของเจ้าของกิจการคนเดียวใช้เป็นเลขภาษี) ห้ามถูกแก้จากฝั่งบริษัท
  if (current.kind !== "COMPANY") return { ok: false, partyId: id, changed: [] };
  const data: { name?: string; taxId?: string | null; branchCode?: string } = {};
  const changed: ("name" | "taxId" | "branchCode")[] = [];
  if (input.name !== undefined) {
    const name = (input.name ?? "").trim();
    if (name && name !== current.name) {
      data.name = name;
      changed.push("name");
    }
  }
  if (input.taxId !== undefined) {
    const taxId = normalizePartyTaxId(input.taxId) || null;
    if (taxId !== current.taxId) {
      data.taxId = taxId;
      changed.push("taxId");
    }
  }
  if (input.branchCode !== undefined) {
    const branchCode = (input.branchCode ?? "").trim() || "00000";
    if (branchCode !== (current.branchCode ?? "00000")) {
      data.branchCode = branchCode;
      changed.push("branchCode");
    }
  }
  if (changed.length === 0) return { ok: true, partyId: id, changed };
  await client.party.updateMany({ where: { tenantId, id }, data });
  const taxAfter = data.taxId !== undefined ? data.taxId : current.taxId;
  if (taxAfter && (changed.includes("taxId") || changed.includes("branchCode"))) {
    const branchAfter = data.branchCode ?? current.branchCode ?? "00000";
    const clash = await client.party.findMany({
      where: { tenantId, taxId: taxAfter, branchCode: branchAfter, mergedIntoId: null, id: { not: id } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    for (const c of clash) await recordMergeCandidatePairInner(tenantId, id, c.id, "TAX_ID", client);
  }
  return { ok: true, partyId: id, changed };
}
// ◂ CRM C1.3

// CRM C1.3 ▸ หา/สร้าง Party **ชนิดบริษัทเท่านั้น** (B1 รีวิว C1.3) — `findOrCreate` เดิมไม่กรองชนิดและจับเบอร์ก่อนชื่อ
//   ⇒ บริษัทอาจไปผูกกับตัวตนของ "คน" (เลขบัตรประชาชนของเจ้าของกิจการคนเดียว = เลขภาษี) แล้วการเปลี่ยนชื่อ/รวมบริษัท
//   จะไปแก้/รวมตัวตนของคนคนนั้นทั้งร้าน · ตัวนี้จับคู่ได้ทางเดียว: เลขภาษี + สาขา + kind COMPANY + ยังไม่ถูกรวม
//   ไม่มีเลขภาษี / ไม่พบ = สร้าง Party บริษัทใหม่ (ไม่จับด้วยชื่อ/เบอร์/อีเมล) · `client` บังคับ (tx ของผู้เรียก — ผู้เรียกถือล็อกเลขภาษี)
export async function findOrCreateCompany(
  tenantId: string,
  input: { name: string; taxId?: string | null; branchCode?: string | null },
  client: Prisma.TransactionClient,
): Promise<{ id: string; created: boolean }> {
  const name = (input.name ?? "").trim();
  if (!tenantId || !name) throw new Error("party.findOrCreateCompany: ต้องมีร้านและชื่อบริษัท");
  const taxId = normalizePartyTaxId(input.taxId);
  const branchCode = (input.branchCode ?? "").trim() || "00000";
  if (taxId) {
    const hit = await client.party.findFirst({
      where: { tenantId, taxId, branchCode, kind: "COMPANY", mergedIntoId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (hit) return { id: hit.id, created: false };
  }
  const row = await client.party.create({
    data: { tenantId, kind: "COMPANY", name, taxId: taxId || null, ...(taxId || input.branchCode ? { branchCode } : {}) },
    select: { id: true },
  });
  return { id: row.id, created: true };
}
// ◂ CRM C1.3
