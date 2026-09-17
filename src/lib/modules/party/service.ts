// Party (WO 3.1) — service ชั้น DB — "กระดูกสันหลังตัวตนลูกค้า" ระดับ tenant
// อ้าง INTEGRATION-MAP §F.1–7 · DESIGN-SPEC-V2 §14.3 · BLUEPRINT §3 เฟส 3
//
// 🔴 ห้าม import raw `prisma` ที่นี่ (fitness F5 — baseline ratchet ห้ามเพิ่มไฟล์ใหม่ที่ import prisma ตรง)
//    ⇒ ใช้ `tenantDb(ctx)` เป็นค่าเริ่มต้น + รับ `Prisma.TransactionClient` เป็น client ทางเลือก (เหมือน
//    `member.findOrCreate`) — ทุก query ใส่ `tenantId` ตรง ๆ ใน where เสมอ (ไม่พึ่งแค่ tenantDb inject
//    เพราะ client ที่ผู้เรียกส่งมาอาจเป็น transaction client ดิบที่ไม่ได้ผ่าน tenantDb)
//
// scope: Party/PartyMergeCandidate axis "tenant" (ลงทะเบียนใน core/scope.ts) — มองเห็นข้ามทุก systemId
//    ของ tenant เดียวกัน (ตรงข้าม AccountContact ที่ scope ต่อ systemId)

import { tenantDb } from "@/lib/core/db";
import type { Prisma, PartyKind, PartyMergeReason } from "@prisma/client";

type Client = Prisma.TransactionClient;

const dbFor = (tenantId: string, client?: Prisma.TransactionClient): Client =>
  (client ?? tenantDb({ tenantId })) as Client;

// ─────────────────────── normalize (คัดลอกตรรกะจาก account/service.ts) ───────────────────────
// 🔴 ทำไม copy แทน import: account/service.ts อยู่คนละโมดูล — fitness F2 ห้าม import ข้ามโมดูลนอก facade
//    (`@/lib/modules/account`) และ account เองก็เรียก party (ทิศทาง account→party) ⇒ import กลับทาง
//    party→account จะวนเป็น cycle ตรรกะ pure ล้วน (ไม่แตะ DB) จึงคัดลอกไว้เป็นชุดของ party เอง —
//    ถ้าแก้กติกา normalize ต้องแก้ทั้งสองที่ (ดู wo-notes/3.1.md หัวข้อ "การตัดสินใจสำคัญ")

/** เลขผู้เสียภาษี → ตัวเลขล้วน (เหมือน account.normalizeTaxId) */
export function normalizePartyTaxId(taxId: string | null | undefined): string {
  return (taxId ?? "").replace(/\D/g, "");
}

/** เบอร์โทรไทยรูปแบบเดียว (เหมือน account.normalizePhoneTh) */
export function normalizePartyPhone(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0066")) d = d.slice(4);
  if (!d.startsWith("66")) return d;
  d = d.slice(2);
  return d.startsWith("0") ? d : "0" + d;
}

// ─────────────────────── ความคล้ายชื่อ (สำหรับหาคู่ซ้ำ — ไม่พึ่ง lib ภายนอก) ───────────────────────

function normalizeNameForCompare(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function bigrams(s: string): string[] {
  const n = normalizeNameForCompare(s);
  if (n.length < 2) return n ? [n] : [];
  const out: string[] = [];
  for (let i = 0; i < n.length - 1; i++) out.push(n.slice(i, i + 2));
  return out;
}

/** Dice coefficient จาก bigram — 1 = เหมือนกันทุกตัวอักษร · 0 = ไม่มีอะไรร่วมกันเลย */
export function nameSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 && B.length === 0) return normalizeNameForCompare(a) === normalizeNameForCompare(b) ? 1 : 0;
  if (A.length === 0 || B.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      counts.set(g, c - 1);
    }
  }
  return (2 * overlap) / (A.length + B.length);
}

// ─────────────────────── findOrCreate (MAP §F.4/§F.7) ───────────────────────

export type PartyFindOrCreateInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  branchCode?: string | null;
  kind?: PartyKind;
};

/**
 * หา/สร้าง Party — ลำดับจับคู่ (MAP §F.4/§F.7 เหมือน findOrCreateCustomerContact):
 *   1) เลขผู้เสียภาษี + รหัสสาขา
 *   2) เบอร์โทร normalize (+66… = 0…)
 *   3) ชื่อ **และ** อีเมล ตรงกันทั้งคู่ — ห้ามจับด้วยชื่อเปล่า
 *   ไม่เข้าเงื่อนไขไหนเลย → สร้างใหม่
 * ทุกการจับคู่กรอง `mergedIntoId: null` เสมอ (ตัวที่ถูกรวมแล้วไม่ใช่ปลายทางที่ถูกต้องอีกต่อไป)
 * ไม่ throw เพราะ "ไม่พบ" — throw ได้เฉพาะข้อผิดพลาดจริง (DB ล่ม ฯลฯ) ผู้เรียกที่ต้องการความทนทาน
 * ให้ใช้ `party.safeFindOrCreate` (facade `index.ts`) แทน
 */
export async function findOrCreate(
  tenantId: string,
  input: PartyFindOrCreateInput,
  client?: Prisma.TransactionClient,
): Promise<{ id: string; created: boolean }> {
  const db = dbFor(tenantId, client);
  const name = input.name.trim();
  if (!name) throw new Error("party.findOrCreate: ต้องมีชื่อ");

  // (1) เลขผู้เสียภาษี + สาขา
  const taxId = normalizePartyTaxId(input.taxId);
  const branchCode = input.branchCode?.trim() || "00000";
  if (taxId) {
    const byTax = await db.party.findFirst({
      where: { tenantId, taxId, branchCode, mergedIntoId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (byTax) return { id: byTax.id, created: false };
  }

  // (2) เบอร์โทร normalize
  const phoneNorm = normalizePartyPhone(input.phone);
  if (phoneNorm && phoneNorm.length >= 8) {
    const byPhone = await db.party.findFirst({
      where: { tenantId, phoneNorm, mergedIntoId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (byPhone) return { id: byPhone.id, created: false };
  }

  // (3) ชื่อ + อีเมล ต้องตรงทั้งคู่
  const email = input.email?.trim() || "";
  if (email) {
    const byNameEmail = await db.party.findFirst({
      where: { tenantId, name, email, mergedIntoId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (byNameEmail) return { id: byNameEmail.id, created: false };
  }

  const created = await db.party.create({
    data: {
      tenantId,
      kind: input.kind ?? "PERSON",
      name,
      phone: input.phone?.trim() || null,
      phoneNorm: phoneNorm || null,
      email: input.email?.trim() || null,
      taxId: taxId || null,
      // ไม่มีเลขภาษี → ปล่อย branchCode ใช้ default ของ schema ("00000") แทนการยัดค่าซ้ำ
      ...(taxId || input.branchCode ? { branchCode } : {}),
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

// ─────────────────────── resolveCanonical ───────────────────────

const MAX_MERGE_CHAIN_DEPTH = 20;

/** ตาม chain `mergedIntoId` จนสุดทาง (กันวนลูปด้วยความลึก + set ที่เจอแล้ว) */
export async function resolveCanonical(
  tenantId: string,
  partyId: string,
  client?: Prisma.TransactionClient,
): Promise<string> {
  const db = dbFor(tenantId, client);
  let current = partyId;
  const seen = new Set<string>([current]);
  for (let i = 0; i < MAX_MERGE_CHAIN_DEPTH; i++) {
    const row = await db.party.findFirst({
      where: { tenantId, id: current },
      select: { mergedIntoId: true },
    });
    if (!row || !row.mergedIntoId || seen.has(row.mergedIntoId)) return current;
    current = row.mergedIntoId;
    seen.add(current);
  }
  return current;
}

// ─────────────────────── อ่านแบบย่อ (ชื่ออย่างเดียว) — WO K3.1 ───────────────────────
// 🔴 คืน **ชื่อเท่านั้น**: โมดูลที่มาขอ (บอร์ดงาน) แสดงแค่ "ผูกกับผู้ติดต่อคนนี้" ไม่ใช่หน้าผู้ติดต่อ
//    ⇒ ไม่ส่ง phone/email/taxId/address ออกไปเลย (ข้อมูลติดต่อของลูกค้าอยู่ในโมดูลที่มีสิทธิ์ของมันเอง)

export type PartyBrief = { id: string; name: string };

/** ชื่อของ Party หลายรายในร้านเดียว (id ที่ไม่ใช่ของร้านนี้จะไม่ถูกคืน) */
export async function listBriefsByIds(
  tenantId: string,
  ids: readonly string[],
  client?: Prisma.TransactionClient,
): Promise<PartyBrief[]> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return [];
  const db = dbFor(tenantId, client);
  const rows = await db.party.findMany({
    where: { tenantId, id: { in: uniq } },
    select: { id: true, name: true },
  });
  return rows;
}

/**
 * โปรไฟล์เต็มของผู้ติดต่อ 1 ราย (K3.4 · D23 — หน้า `/app/party/{id}`)
 *
 * 🔴 ต่างจาก `listBriefsByIds` โดยตั้งใจ: ตัวนี้คืน **ข้อมูลติดต่อ** ด้วย ⇒ ผู้เรียกต้องเป็นหน้าจอ/เส้นทาง
 *    ที่ผ่านด่านสิทธิ์ของตัวเองมาแล้ว และเป็นคนตัดสินใจว่าจะโชว์ฟิลด์ไหนให้ใคร (โมดูลนี้ไม่รู้จัก RBAC)
 *    ห้ามเอาไปเสียบใน resolver ของโมดูลอื่นแทน `listBriefsByIds` เด็ดขาด
 * 🔴 `id` ที่ไม่ใช่ของร้านนี้ → `null` เสมอ (where ผูก tenantId ตรง ไม่พึ่งแค่ tenantDb)
 */
export type PartyProfile = {
  id: string;
  kind: PartyKind;
  name: string;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  branchCode: string | null;
  address: string | null;
  mergedIntoId: string | null;
  createdAt: Date;
};

export async function getProfile(
  tenantId: string,
  partyId: string,
  client?: Prisma.TransactionClient,
): Promise<PartyProfile | null> {
  const id = (partyId ?? "").trim();
  if (!id) return null;
  const db = dbFor(tenantId, client);
  const row = await db.party.findFirst({
    where: { tenantId, id },
    select: {
      id: true,
      kind: true,
      name: true,
      phone: true,
      email: true,
      taxId: true,
      branchCode: true,
      address: true,
      mergedIntoId: true,
      createdAt: true,
    },
  });
  return row ?? null;
}

/** ค้นผู้ติดต่อจาก "ชื่อ" อย่างเดียว (ช่องค้นหาในหน้าอื่น) — ไม่ค้นด้วยเบอร์/อีเมล/เลขภาษี */
export async function searchByName(
  tenantId: string,
  query: string,
  limit = 10,
  client?: Prisma.TransactionClient,
): Promise<PartyBrief[]> {
  const q = query.trim();
  if (!q) return [];
  const db = dbFor(tenantId, client);
  const rows = await db.party.findMany({
    where: { tenantId, mergedIntoId: null, name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: Math.min(Math.max(1, limit), 25),
  });
  return rows;
}

// ─────────────────────── หาคู่ซ้ำ + บันทึกลง PartyMergeCandidate (สำหรับหน้า 3.4) ───────────────────────

export type DuplicatePair = { partyAId: string; partyBId: string; reason: PartyMergeReason };

const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** คู่ Party ที่สงสัยว่าเป็นคนเดียวกัน: taxId+branchCode ตรง · phoneNorm ตรง · ชื่อคล้าย ≥ 0.9 */
export async function findDuplicateCandidates(
  tenantId: string,
  client?: Prisma.TransactionClient,
): Promise<DuplicatePair[]> {
  const db = dbFor(tenantId, client);
  const rows = await db.party.findMany({
    where: { tenantId, mergedIntoId: null },
    select: { id: true, name: true, taxId: true, branchCode: true, phoneNorm: true },
    orderBy: { createdAt: "asc" },
  });

  const found = new Map<string, DuplicatePair>();
  const add = (a: string, b: string, reason: PartyMergeReason) => {
    const [x, y] = pairKey(a, b);
    const key = `${x}#${y}`;
    if (!found.has(key)) found.set(key, { partyAId: x, partyBId: y, reason });
  };

  const byTax = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.taxId) continue;
    const k = `${r.taxId}#${r.branchCode ?? "00000"}`;
    byTax.set(k, [...(byTax.get(k) ?? []), r.id]);
  }
  for (const ids of byTax.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) add(ids[i]!, ids[j]!, "TAX_ID");
  }

  const byPhone = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.phoneNorm) continue;
    byPhone.set(r.phoneNorm, [...(byPhone.get(r.phoneNorm) ?? []), r.id]);
  }
  for (const ids of byPhone.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) add(ids[i]!, ids[j]!, "PHONE");
  }

  // ชื่อคล้าย ≥ 0.9 — O(n²) ยอมรับได้ที่ขนาด tenant ทั่วไป (หลักร้อย-พันราย ไม่ใช่ล้าน)
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      const key = pairKey(a.id, b.id).join("#");
      if (found.has(key)) continue; // มีเหตุผลแรงกว่าบันทึกไว้แล้ว
      if (nameSimilarity(a.name, b.name) >= 0.9) add(a.id, b.id, "NAME_SIMILAR");
    }
  }

  return [...found.values()];
}

/** บันทึกคู่ซ้ำลง PartyMergeCandidate — idempotent (มีแถวอยู่แล้ว ไม่แตะสถานะเดิม เช่น DISMISSED/MERGED) */
export async function recordMergeCandidates(
  tenantId: string,
  client?: Prisma.TransactionClient,
): Promise<{ scanned: number; recorded: number }> {
  const db = dbFor(tenantId, client);
  const pairs = await findDuplicateCandidates(tenantId, db);
  let recorded = 0;
  for (const p of pairs) {
    const existing = await db.partyMergeCandidate.findFirst({
      where: { tenantId, partyAId: p.partyAId, partyBId: p.partyBId },
      select: { id: true },
    });
    if (existing) continue;
    await db.partyMergeCandidate.create({
      data: { tenantId, partyAId: p.partyAId, partyBId: p.partyBId, reason: p.reason, status: "OPEN" },
    });
    recorded++;
  }
  return { scanned: pairs.length, recorded };
}

// ─────────────────────── บันทึกคู่เจาะจง + รวม Party (WO M1.4 ระบบสมาชิก v2) ───────────────────────

/**
 * บันทึก "คู่ที่อาจเป็นคนเดียวกัน" **เจาะจง 1 คู่** (ต่างจาก `recordMergeCandidates` ที่สแกนทั้งร้าน)
 *
 * 🔴 ทำไมต้องมี: ตัวสแกนหาคู่จาก taxId/เบอร์/ชื่อคล้าย ซึ่ง "ไม่เห็น" หลักฐานที่เกิดนอกตาราง Party
 *    เช่น D18 — id ช่องทางแชทอันเดียวกันผูกกับสมาชิก A อยู่ แต่เบอร์ที่ส่งมาชี้สมาชิก B
 *    นั่นเป็นหลักฐานว่าสองคนนี้อาจเป็นคนเดียวกัน แต่ข้อมูลใน Party ไม่มีอะไรตรงกันเลย
 * idempotent: มีแถวคู่นี้อยู่แล้ว (สถานะใดก็ตาม) → ไม่แตะ คืน id เดิม
 */
export async function recordMergeCandidatePair(
  tenantId: string,
  partyAId: string,
  partyBId: string,
  reason: PartyMergeReason,
  client?: Prisma.TransactionClient,
): Promise<{ id: string; created: boolean } | null> {
  if (!partyAId || !partyBId || partyAId === partyBId) return null;
  const db = dbFor(tenantId, client);
  const [x, y] = pairKey(partyAId, partyBId);
  const both = await db.party.count({ where: { tenantId, id: { in: [x, y] } } });
  if (both < 2) return null; // id ของร้านอื่น/ถูกลบ — ไม่บันทึก (เงียบ ไม่ throw)
  const existing = await db.partyMergeCandidate.findFirst({ where: { tenantId, partyAId: x, partyBId: y }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const row = await db.partyMergeCandidate.create({
    data: { tenantId, partyAId: x, partyBId: y, reason, status: "OPEN" },
  });
  return { id: row.id, created: true };
}

/**
 * รวม Party สองราย: `mergeId` ชี้ไป `keepId` (`mergedIntoId`) — **ไม่ลบแถว**
 * ทุกจุดที่ตาม chain ด้วย `resolveCanonical` จะได้ปลายทางเดียวกันทันที
 * 🔴 ไม่ย้ายข้อมูลของโมดูลอื่น (สมาชิก/บัญชี/CRM) — โมดูลเจ้าของข้อมูลย้ายของตัวเองใน tx เดียวกัน
 * idempotent: รวมซ้ำคู่เดิม = ไม่มีอะไรเปลี่ยน · กันรวมตัวเอง/รวมย้อนกลับเป็นวง
 */
export async function mergeParties(
  tenantId: string,
  keepId: string,
  mergeId: string,
  client?: Prisma.TransactionClient,
): Promise<boolean> {
  if (!keepId || !mergeId || keepId === mergeId) return false;
  const db = dbFor(tenantId, client);
  const canonicalKeep = await resolveCanonical(tenantId, keepId, db);
  if (canonicalKeep === mergeId) return false; // ปลายทางวนกลับมาที่ตัวที่จะรวม = ไม่ทำ
  const res = await db.party.updateMany({
    where: { tenantId, id: mergeId, mergedIntoId: null },
    data: { mergedIntoId: canonicalKeep },
  });
  const [x, y] = pairKey(canonicalKeep, mergeId);
  await db.partyMergeCandidate.updateMany({
    where: { tenantId, partyAId: x, partyBId: y },
    data: { status: "MERGED" },
  });
  return res.count > 0;
}

// ─────────────────────── แก้ข้อมูลติดต่อของ Party (WO CRM v2 · C0.3 ส่วน E) ───────────────────────

/**
 * แก้ **เฉพาะช่องที่ส่งมา** ของ Party หนึ่งราย (ชื่อ/เบอร์/อีเมล) — ใช้จากฟอร์มแก้ผู้ติดต่อของ CRM
 *
 * 🔴 กติกาที่ห้ามพลาด (ใบสั่ง C0.3 ส่วน E):
 *  1) **partial ต้องไม่ล้างช่องอื่น** — ช่องที่เป็น `undefined` = ไม่แตะเลย (ไม่ใช่ "เขียนทับด้วย null")
 *     ส่ง `null`/`""` มาตรง ๆ = ตั้งใจล้างช่องนั้น (เบอร์ถูกล้าง → `phoneNorm` ถูกล้างตามในคำสั่งเดียวกัน
 *     ไม่งั้นจะเหลือกุญแจจับคู่ค้างชี้เบอร์ที่ไม่มีอยู่แล้ว)
 *  2) เบอร์ต้อง normalize ด้วย `normalizePartyPhone` ตัวเดียวกับ `findOrCreate` แล้วเขียน `phoneNorm`
 *     — `phoneNorm` คือกุญแจที่ทุกตัวหาคู่ซ้ำใช้ · ลืมเขียน = คนซ้ำหลุดจากจอ "รวมผู้ติดต่อซ้ำ" เงียบ ๆ
 *  3) เบอร์/อีเมลใหม่ไป**ชนกับ Party รายอื่นของร้านเดียวกัน** = ห้ามล้มคำสั่ง (ฟอร์มแก้ผู้ติดต่อของ CRM
 *     จะแก้อะไรไม่ได้เลยทั้งที่ผู้ใช้กรอกถูก) ⇒ เขียนค่าใหม่ตามที่สั่ง แล้ว**บันทึกคู่ "อาจเป็นคนเดียวกัน"**
 *     ลง `PartyMergeCandidate` ให้ร้านไปตัดสินที่หน้ารวมผู้ติดต่อซ้ำแทน
 *  4) `client` (tx) ที่ส่งมาต้องถูกใช้จริง — ผู้เรียกผูกการแก้นี้ไว้ใน transaction ของตัวเอง
 *     (rollback แล้วต้องไม่มีอะไรเปลี่ยน · รวมถึงแถว merge candidate ที่บันทึกในคำสั่งเดียวกัน)
 *  5) id ของร้านอื่น/ไม่มีอยู่ → ไม่แตะแถวใด ๆ แล้วคืนเหตุผลไทย (ไม่ throw · ไม่บอกว่ามีอยู่แต่ห้ามแก้)
 *  6) **id ที่ถูกรวมไปแล้วต้องเด้งไปตัวปลายทางก่อนเขียนเสมอ** (`resolveCanonical`) — ไม่ใช่ปฏิเสธ:
 *     ผู้เรียก (ฟอร์มแก้ผู้ติดต่อของ CRM / ตัวเชื่อมของโมดูลอื่น) ถือ id ที่ตัวเองเก็บไว้ ซึ่งอาจถูกรวมทีหลัง
 *     โดยไม่มีใครไปไล่แก้ id ที่เก็บไว้ทุกที่ · เขียนลงแถวที่ถูกรวมไปแล้ว = เขียนลง "ป้ายหลุมศพ" ที่ไม่มีใคร
 *     อ่านอีกแล้ว (ทุกจอตาม `mergedIntoId` ไปตัวปลายทาง) ⇒ ผู้ใช้เห็นว่ากดบันทึกสำเร็จ แต่ข้อมูลไม่เปลี่ยน
 *     เลือก "เด้งไปตัวปลายทาง" แทน "ปฏิเสธ" เพราะนั่นคือสิ่งที่ผู้ใช้ตั้งใจจริง ๆ (แก้เบอร์ของ *คนคนนี้*)
 *     และเป็นพฤติกรรมเดียวกับที่ `mergeParties` ใช้อยู่แล้ว · แถวที่ถูกเขียนจริงคืนกลับไปที่ `partyId`
 *
 * 🔴 ไม่ log ข้อมูลติดต่อ (PDPA · กลุ่ม X8) — ทั้งไฟล์นี้ไม่พิมพ์เบอร์/อีเมลลง console
 */
export type UpdateContactInfoInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type UpdateContactInfoResult = {
  ok: boolean;
  reason?: string;
  /** แถวที่ถูกเขียนจริง — ต่างจาก `partyId` ที่ส่งเข้ามาเมื่อ id นั้นถูกรวมไปแล้ว (ดูข้อ 6) */
  partyId?: string;
  /** ช่องที่ถูกเขียนจริง (ค่าเดิมเท่ากับค่าใหม่ = ไม่นับ ไม่เขียน) */
  changed: ("name" | "phone" | "email")[];
  /** แถว PartyMergeCandidate ที่บันทึกเพราะค่าที่ใหม่ไปชนกับรายอื่น */
  mergeCandidateIds: string[];
};

export async function updateContactInfo(
  tenantId: string,
  partyId: string,
  input: UpdateContactInfoInput,
  client?: Prisma.TransactionClient,
): Promise<UpdateContactInfoResult> {
  const empty: UpdateContactInfoResult = { ok: false, changed: [], mergeCandidateIds: [] };
  const asked = (partyId ?? "").trim();
  if (!tenantId || !asked) return { ...empty, reason: "ไม่พบผู้ติดต่อรายนี้" };
  const db = dbFor(tenantId, client);

  // ข้อ 6: ตามสาย `mergedIntoId` ให้สุดก่อนเขียน — id ที่ถูกรวมไปแล้วคือแถวที่ไม่มีจอไหนอ่านอีกแล้ว
  // (`resolveCanonical` ผูก `tenantId` ในทุก query และคืน id เดิมเมื่อไม่พบ/ไม่ใช่ของร้านนี้ ⇒ ด่านร้านยังอยู่ครบ)
  const id = await resolveCanonical(tenantId, asked, db);

  // where ผูก tenantId ตรง ๆ (ไม่พึ่งแค่ tenantDb inject — client ที่ผู้เรียกส่งมาอาจเป็น tx ดิบ)
  const current = await db.party.findFirst({
    where: { tenantId, id },
    select: { id: true, name: true, phone: true, phoneNorm: true, email: true },
  });
  if (!current) return { ...empty, reason: "ไม่พบผู้ติดต่อรายนี้" };

  const data: { name?: string; phone?: string | null; phoneNorm?: string | null; email?: string | null } = {};
  const changed: ("name" | "phone" | "email")[] = [];

  if (input.name !== undefined) {
    const name = (input.name ?? "").trim();
    // ชื่อว่าง = ไม่มีอะไรให้เขียน (Party.name ห้ามว่าง) — เงียบ ไม่ throw ไม่ล้างชื่อเดิมทิ้ง
    if (name && name !== current.name) {
      data.name = name;
      changed.push("name");
    }
  }

  // 🔴 `newPhoneNorm`/`newEmail` = "ค่าที่ **เปลี่ยน** ไปเป็น" ไม่ใช่ "ค่าที่ผู้เรียกพิมพ์มาด้วย" — ต้องตั้ง
  //    ข้างใน if ที่ push `changed` เท่านั้น: ฟอร์มส่งทุกช่องกลับมาทุกครั้ง (ผู้ใช้แก้แค่ชื่อ เบอร์เดิมก็ติดมา
  //    ด้วย) ถ้าตั้งไว้ข้างนอก ทุกครั้งที่กดบันทึกจะไปสแกนหาคู่ชนของ "เบอร์เดิม" แล้วบันทึก
  //    PartyMergeCandidate ใหม่ทั้งที่ไม่มีอะไรเปลี่ยนเลย ⇒ จอ "รวมผู้ติดต่อซ้ำ" ถูกถมด้วยคู่ที่ร้านเคย
  //    ตัดสินไปแล้ว (แถว REJECTED ถูกปลุกกลับมา) จนของจริงจมหาย
  let newPhoneNorm: string | null = null;
  if (input.phone !== undefined) {
    const raw = (input.phone ?? "").trim();
    const norm = normalizePartyPhone(raw) || null;
    if (raw !== (current.phone ?? "") || norm !== current.phoneNorm) {
      data.phone = raw || null;
      data.phoneNorm = norm; // ล้างเบอร์ = ล้างกุญแจจับคู่ในคำสั่งเดียวกัน
      changed.push("phone");
      newPhoneNorm = norm;
    }
  }

  let newEmail: string | null = null;
  if (input.email !== undefined) {
    const email = (input.email ?? "").trim() || null;
    if (email !== current.email) {
      data.email = email;
      changed.push("email");
      newEmail = email;
    }
  }

  if (changed.length > 0) {
    // updateMany + where ที่มี tenantId = แก้ข้ามร้านไม่ได้แม้ผู้เรียกส่ง client ดิบมา
    await db.party.updateMany({ where: { tenantId, id }, data });
  }

  // ── ค่าที่ชนกับรายอื่น → บันทึกคู่ ไม่ใช่ล้มคำสั่ง (ข้อ 3) ──
  const mergeCandidateIds: string[] = [];
  const seen = new Set<string>();
  const noteCandidate = async (otherId: string, reason: PartyMergeReason) => {
    if (!otherId || otherId === id || seen.has(otherId)) return;
    seen.add(otherId);
    const row = await recordMergeCandidatePair(tenantId, id, otherId, reason, db);
    if (row) mergeCandidateIds.push(row.id);
  };

  if (newPhoneNorm && newPhoneNorm.length >= 8) {
    const clash = await db.party.findMany({
      where: { tenantId, phoneNorm: newPhoneNorm, mergedIntoId: null, id: { not: id } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    for (const c of clash) await noteCandidate(c.id, "PHONE");
  }
  if (newEmail) {
    const clash = await db.party.findMany({
      where: { tenantId, email: newEmail, mergedIntoId: null, id: { not: id } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    // 🔴 `PartyMergeReason` ไม่มีค่า EMAIL (เพิ่มไม่ได้ในใบนี้ — ห้าม migration) ⇒ ใช้ `NAME_SIMILAR`
    //    เป็นเหตุผล "หลักฐานอ่อน ๆ อย่างอื่น" แบบเดียวกับที่ member/profile.ts:1471 ใช้อยู่แล้ว
    for (const c of clash) await noteCandidate(c.id, "NAME_SIMILAR");
  }

  return { ok: true, partyId: id, changed, mergeCandidateIds };
}
