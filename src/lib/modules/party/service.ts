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
