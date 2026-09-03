// party/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2.2 บังคับ)
// WO 3.1 — ดู service.ts สำหรับตรรกะเต็ม + wo-notes/3.1.md สำหรับเหตุผลการออกแบบ

import type { Prisma } from "@prisma/client";
import {
  findOrCreate as findOrCreateInner,
  resolveCanonical as resolveCanonicalInner,
  findDuplicateCandidates as findDuplicateCandidatesInner,
  recordMergeCandidates as recordMergeCandidatesInner,
  normalizePartyTaxId,
  normalizePartyPhone,
  nameSimilarity,
  type PartyFindOrCreateInput,
  type DuplicatePair,
} from "./service";

export { normalizePartyTaxId, normalizePartyPhone, nameSimilarity };
export type { PartyFindOrCreateInput, DuplicatePair };

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
