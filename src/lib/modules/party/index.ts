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
  normalizePartyTaxId,
  normalizePartyPhone,
  nameSimilarity,
  type PartyFindOrCreateInput,
  type DuplicatePair,
} from "./service";

export { normalizePartyTaxId, normalizePartyPhone, nameSimilarity };
export type { PartyFindOrCreateInput, DuplicatePair, PartyBrief, PartyProfile };

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
