// contact-merge.ts — หน้า "รวมผู้ติดต่อซ้ำ" (WO 3.4 · DESIGN-SPEC-V2 §7.3 · ภาพ g7-contact-merge.png)
//
// สิ่งที่ต้องรับประกัน (ใบสั่งงาน WO 3.4 B):
//   1) **ธุรกรรมเดียว** — ย้ายทุกแถวที่อ้างผู้ติดต่อตัวรอง หรือไม่ย้ายเลย (ล้มกลางทาง = ไม่มีอะไรขยับ)
//   2) **ครบทุกตาราง** — สำรวจจาก `grep -n "contactId" prisma/schema/*.prisma` แล้วได้ 4 ตารางที่อ้าง
//      AccountContact.id ตรง ๆ:
//        · AccountDocument.contactId          (เอกสารทุกชนิด รวมใบ WHT_CERT ซึ่งเป็น AccountDocument เอง)
//        · AccountJournalLine.contactId       (สมุดรายวัน — String ธรรมดา ไม่มี FK ⇒ ลืมง่ายที่สุด)
//        · AccountContactGroupMember.contactId (มี @@unique([groupId,contactId]) ⇒ ต้อง dedupe ก่อนย้าย)
//        · AccountRecurringRule.contactId     (เอกสารประจำ WO 1.9)
//      ตารางที่ "อ้างผ่านเอกสาร" (ย้ายตามเองอัตโนมัติ ไม่ต้องแตะ): AccountDocumentPayment ·
//      AccountDocumentLine · AccountDocumentRelation · AccountAttachment · AccountCheque (ผ่าน payment)
//   3) **ตัวตนกลาง** — AccountContact.mergedIntoId + archivedAt · Party.mergedIntoId · PartyMergeCandidate=MERGED
//   4) **idempotent** — เรียกซ้ำด้วยคู่เดิม = ปฏิเสธพร้อมเหตุผลไทย (ไม่ใช่ทำซ้ำเงียบ ๆ)
//   5) ทุก query ผ่าน `tenantDb` (auto-scope tenant+system · fail-closed) ⇒ id ของร้าน/ระบบอื่น = ไม่พบ ไม่ใช่ข้อมูลรั่ว

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import * as party from "@/lib/modules/party";
import * as memberSvc from "@/lib/modules/member/service";
import { writeAudit } from "./access";
import { formatPhoneTh, type Ctx } from "./contacts-list";
import { findLinkedSystemIds, normalizePhoneTh } from "./service";
// WO C4 — เหตุการณ์ "รวมผู้ติดต่อซ้ำ" ออกทาง webhook (ปลายทางต้องรู้ว่า id ตัวรองใช้ไม่ได้แล้ว)
import { emitContactMerged } from "./events";

// ─────────────────────────── ฟิลด์ที่เลือกได้ทีละช่อง (g7) ───────────────────────────

/** ฟิลด์ที่หน้าจอ g7 ให้เลือกซ้าย/ขวาได้ทีละช่อง (เรียงตามลำดับในเฟรม) */
export const MERGE_FIELDS = [
  { key: "name", label: "ชื่อ" },
  { key: "taxId", label: "เลขภาษี" },
  { key: "branchCode", label: "สาขา" },
  { key: "address", label: "ที่อยู่" },
  { key: "phone", label: "เบอร์" },
  { key: "email", label: "อีเมล" },
  { key: "creditTermDays", label: "เครดิตเทอม" },
  { key: "note", label: "หมายเหตุ" },
  { key: "partyId", label: "เชื่อมกับสมาชิก" },
] as const;

export type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"];
export type MergeSide = "primary" | "secondary";
export type MergeFieldChoices = Partial<Record<MergeFieldKey, MergeSide>>;

// ─────────────────────────── รายการคู่ที่สงสัย ───────────────────────────

export type MergeReason = "TAX_ID" | "PHONE" | "NAME_SIMILAR";

export const MERGE_REASON_LABEL: Record<MergeReason, string> = {
  TAX_ID: "เลขภาษีตรงกัน",
  PHONE: "เบอร์ตรงกัน",
  NAME_SIMILAR: "ชื่อคล้าย",
};

/** ป้ายเหตุผลบนการ์ดซ้ายของ g7 — ชื่อคล้ายมี % ต่อท้าย ("ชื่อคล้าย 94%") */
export function mergeReasonLabel(reason: MergeReason, similarity?: number | null): string {
  if (reason === "NAME_SIMILAR" && similarity != null)
    return `${MERGE_REASON_LABEL.NAME_SIMILAR} ${Math.round(similarity * 100)}%`;
  return MERGE_REASON_LABEL[reason];
}

export type MergeCandidateContact = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  branchCode: string | null;
  address: string | null;
  phone: string | null;
  phoneDisplay: string | null;
  email: string | null;
  creditTermDays: number;
  note: string | null;
  partyId: string | null;
  memberLinkLabel: string | null;
  groupNames: string[];
  docCount: number;
  journalLineCount: number;
  recurringCount: number;
  createdAt: string;
};

export type MergeCandidate = {
  /** คีย์คู่ (id เรียงแล้ว) — ใช้เป็นค่าใน URL ของหน้าเทียบ */
  key: string;
  reason: MergeReason;
  similarity: number | null;
  reasonLabel: string;
  /** ค่าเริ่มต้น: ตัวที่เก่ากว่า/มีเอกสารมากกว่า = ตัวหลัก */
  a: MergeCandidateContact;
  b: MergeCandidateContact;
};

const pairKeyOf = (x: string, y: string) => (x < y ? `${x}__${y}` : `${y}__${x}`);

/** ถอดคีย์คู่กลับเป็น 2 id (คืน null ถ้ารูปแบบผิด) */
export function parsePairKey(key: string): [string, string] | null {
  const parts = key.split("__");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

type ContactLite = {
  id: string;
  code: string | null;
  name: string;
  taxId: string | null;
  branchCode: string | null;
  address: string | null;
  phone: string | null;
  phoneNorm: string | null;
  email: string | null;
  creditTermDays: number;
  note: string | null;
  partyId: string | null;
  createdAt: Date;
};

const CONTACT_LITE_SELECT = {
  id: true,
  code: true,
  name: true,
  taxId: true,
  branchCode: true,
  address: true,
  phone: true,
  phoneNorm: true,
  email: true,
  creditTermDays: true,
  note: true,
  partyId: true,
  createdAt: true,
} as const;

/**
 * คู่ผู้ติดต่อที่ระบบสงสัยว่าเป็นรายเดียวกัน (§7.3)
 * = **รวม 2 แหล่ง**
 *   (1) `PartyMergeCandidate` สถานะ OPEN ของ tenant นี้ (ผลสแกนระดับ Party จาก WO 3.1 — เห็นข้ามระบบ)
 *   (2) คู่ซ้ำที่เห็นได้ในระบบบัญชีนี้เอง (taxId+สาขาตรง · phoneNorm ตรง · ชื่อคล้าย ≥ 0.9)
 *       ใช้ `nameSimilarity` ตัวเดียวกับ party (ไม่ก๊อปสูตร)
 * ตัดคู่ที่เคย DISMISSED/MERGED ไปแล้วออก · ไม่รวมรายที่ปิดใช้งาน/ถูกรวมไปแล้ว
 */
export async function listMergeCandidates(ctx: Ctx): Promise<MergeCandidate[]> {
  const db = tenantDb(ctx);
  const contacts = (await db.accountContact.findMany({
    where: { archivedAt: null, mergedIntoId: null },
    select: CONTACT_LITE_SELECT,
    orderBy: { createdAt: "asc" },
  })) as ContactLite[];
  if (contacts.length < 2) return [];

  const byId = new Map(contacts.map((c) => [c.id, c]));
  const found = new Map<string, { a: string; b: string; reason: MergeReason; similarity: number | null }>();
  const add = (a: string, b: string, reason: MergeReason, similarity: number | null) => {
    const key = pairKeyOf(a, b);
    if (found.has(key)) return; // เหตุผลแรกชนะ (เรียงจากแรงไปอ่อน: taxId → เบอร์ → ชื่อ)
    found.set(key, { a, b, reason, similarity });
  };

  // (1) เลขภาษีตรงกัน — 🔴 จับกลุ่มด้วย **เลขภาษีอย่างเดียว ไม่รวม branchCode**
  //     เหตุผล: DB มี partial unique index `AccountContact_systemId_taxId_branchCode_active_key`
  //     (WHERE taxId IS NOT NULL AND archivedAt IS NULL) ⇒ ผู้ติดต่อที่ยังใช้งานอยู่ 2 ราย
  //     **เป็นไปไม่ได้เลย**ที่จะมี (taxId, branchCode) ซ้ำกัน ⇒ ถ้าจับกลุ่มด้วยทั้งคู่ เกณฑ์นี้จะไม่มีวันเจออะไร
  //     ของจริงที่เกิดในร้าน = เลขนิติบุคคลเดียวกันแต่คีย์สาขาต่างกัน/คีย์ผิด ⇒ ตรงกับ SPEC §7.3 "taxId เท่ากัน"
  //     (ต่างจาก `party.findDuplicateCandidates` ที่รวม branchCode ได้ เพราะตาราง Party ไม่มี unique ตัวนี้)
  const byTax = new Map<string, string[]>();
  for (const c of contacts) {
    if (!c.taxId) continue;
    const k = c.taxId.replace(/\D/g, "");
    if (!k) continue;
    byTax.set(k, [...(byTax.get(k) ?? []), c.id]);
  }
  for (const ids of byTax.values())
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i]!, ids[j]!, "TAX_ID", null);

  // (2) เบอร์ (phoneNorm — เติมสดจาก phone ถ้าแถวเก่ายังไม่มีค่า)
  const byPhone = new Map<string, string[]>();
  for (const c of contacts) {
    const p = c.phoneNorm || normalizePhoneTh(c.phone ?? "");
    if (!p) continue;
    byPhone.set(p, [...(byPhone.get(p) ?? []), c.id]);
  }
  for (const ids of byPhone.values())
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i]!, ids[j]!, "PHONE", null);

  // (3) ชื่อคล้าย ≥ 0.9 — O(n²) ยอมรับได้ที่ขนาด tenant ทั่วไป (เหมือน party.findDuplicateCandidates)
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i]!;
      const b = contacts[j]!;
      if (found.has(pairKeyOf(a.id, b.id))) continue;
      const sim = party.nameSimilarity(a.name, b.name);
      if (sim >= 0.9) add(a.id, b.id, "NAME_SIMILAR", sim);
    }
  }

  // (4) เติมคู่ที่มาจากผลสแกนระดับ Party (เห็นข้ามระบบ — เช่น ซ้ำเพราะอีเมลเดียวกันที่ระดับ Party)
  const partyCandidates = await db.partyMergeCandidate.findMany({
    where: { status: "OPEN" },
    select: { partyAId: true, partyBId: true, reason: true },
  });
  if (partyCandidates.length > 0) {
    const byParty = new Map<string, string[]>();
    for (const c of contacts) if (c.partyId) byParty.set(c.partyId, [...(byParty.get(c.partyId) ?? []), c.id]);
    for (const pc of partyCandidates) {
      const left = byParty.get(pc.partyAId) ?? [];
      const right = byParty.get(pc.partyBId) ?? [];
      for (const l of left) for (const r of right) if (l !== r) add(l, r, pc.reason as MergeReason, null);
    }
  }

  if (found.size === 0) return [];

  // ตัดคู่ที่ผู้ใช้เคยกด "ข้าม" (DISMISSED) หรือรวมไปแล้ว (MERGED) — เก็บสถานะที่ระดับ Party
  const closed = await db.partyMergeCandidate.findMany({
    where: { status: { in: ["DISMISSED", "MERGED"] } },
    select: { partyAId: true, partyBId: true },
  });
  const closedPartyPairs = new Set(closed.map((r) => pairKeyOf(r.partyAId, r.partyBId)));

  const ids = [...new Set([...found.values()].flatMap((p) => [p.a, p.b]))];
  const enriched = await enrichContacts(ctx, ids);

  const out: MergeCandidate[] = [];
  for (const p of found.values()) {
    const a = byId.get(p.a);
    const b = byId.get(p.b);
    if (!a || !b) continue;
    if (a.partyId && b.partyId && closedPartyPairs.has(pairKeyOf(a.partyId, b.partyId))) continue;
    const ea = enriched.get(p.a);
    const eb = enriched.get(p.b);
    if (!ea || !eb) continue;
    // ตัวหลักโดยปริยาย = เอกสารมากกว่า (เท่ากัน → สร้างก่อน) เพื่อให้ "ย้ายน้อยที่สุด"
    const aFirst = ea.docCount !== eb.docCount ? ea.docCount > eb.docCount : a.createdAt <= b.createdAt;
    out.push({
      key: pairKeyOf(p.a, p.b),
      reason: p.reason,
      similarity: p.similarity,
      reasonLabel: mergeReasonLabel(p.reason, p.similarity),
      a: aFirst ? ea : eb,
      b: aFirst ? eb : ea,
    });
  }
  return out.sort((x, y) => (x.reason === y.reason ? x.a.code.localeCompare(y.a.code) : REASON_ORDER[x.reason] - REASON_ORDER[y.reason]));
}

const REASON_ORDER: Record<MergeReason, number> = { TAX_ID: 0, PHONE: 1, NAME_SIMILAR: 2 };

/** เติมข้อมูลที่ตารางเทียบของ g7 ต้องใช้ (กลุ่ม · จำนวนเอกสาร/JV/กฎประจำ · ป้ายสมาชิก) — 4 query รวมทุกราย */
async function enrichContacts(ctx: Ctx, ids: string[]): Promise<Map<string, MergeCandidateContact>> {
  const db = tenantDb(ctx);
  if (ids.length === 0) return new Map();
  const [rows, groupMembers, docGroups, jvGroups, recurringGroups, linked] = await Promise.all([
    db.accountContact.findMany({ where: { id: { in: ids } }, select: CONTACT_LITE_SELECT }) as Promise<ContactLite[]>,
    db.accountContactGroupMember.findMany({
      where: { contactId: { in: ids } },
      select: { contactId: true, group: { select: { name: true } } },
    }),
    db.accountDocument.groupBy({ by: ["contactId"], where: { contactId: { in: ids } }, _count: { _all: true } }),
    db.accountJournalLine.groupBy({ by: ["contactId"], where: { contactId: { in: ids } }, _count: { _all: true } }),
    db.accountRecurringRule.groupBy({ by: ["contactId"], where: { contactId: { in: ids } }, _count: { _all: true } }),
    findLinkedSystemIds(ctx.tenantId),
  ]);
  // ป้าย "เชื่อมกับสมาชิก" ของ g7 = รหัสสมาชิกจริง (#M-000xx) ไม่ใช่ id ภายใน
  const partyIds = [...new Set(rows.map((r) => r.partyId).filter((x): x is string => !!x))];
  const memberCodeOf = linked.memberSystemId
    ? await memberSvc.findMemberCodesByPartyIds(ctx.tenantId, linked.memberSystemId, partyIds)
    : new Map<string, string>();

  const groupsOf = new Map<string, string[]>();
  for (const m of groupMembers)
    groupsOf.set(m.contactId, [...(groupsOf.get(m.contactId) ?? []), m.group?.name ?? "—"]);
  const countMap = (g: { contactId: string | null; _count: { _all: number } }[]) =>
    new Map(g.filter((x) => x.contactId).map((x) => [x.contactId!, x._count._all]));
  const docCounts = countMap(docGroups);
  const jvCounts = countMap(jvGroups);
  const recCounts = countMap(recurringGroups);

  // เลขที่: ใช้คอลัมน์ `code` ถ้ามี (WO 3.3) · ไม่มี = "—" (หน้านี้ไม่จำเป็นต้องคำนวณลำดับสด)
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        code: r.code ?? "—",
        name: r.name,
        taxId: r.taxId,
        branchCode: r.branchCode,
        address: r.address,
        phone: r.phone,
        phoneDisplay: r.phone ? formatPhoneTh(r.phone) : null,
        email: r.email,
        creditTermDays: r.creditTermDays,
        note: r.note,
        partyId: r.partyId,
        memberLinkLabel: r.partyId ? (memberCodeOf.get(r.partyId) ? `#${memberCodeOf.get(r.partyId)}` : null) : null,
        groupNames: groupsOf.get(r.id) ?? [],
        docCount: docCounts.get(r.id) ?? 0,
        journalLineCount: jvCounts.get(r.id) ?? 0,
        recurringCount: recCounts.get(r.id) ?? 0,
        createdAt: r.createdAt.toISOString(),
      } satisfies MergeCandidateContact,
    ]),
  );
}

/** โหลดคู่เดียวเพื่อแสดงตารางเทียบ (หน้า g7 ฝั่งขวา) — คืน null ถ้า id ไม่อยู่ในร้าน/ระบบนี้ */
export async function getMergePair(
  ctx: Ctx,
  primaryId: string,
  secondaryId: string,
): Promise<{ primary: MergeCandidateContact; secondary: MergeCandidateContact } | null> {
  if (primaryId === secondaryId) return null;
  const map = await enrichContacts(ctx, [primaryId, secondaryId]);
  const primary = map.get(primaryId);
  const secondary = map.get(secondaryId);
  if (!primary || !secondary) return null;
  return { primary, secondary };
}

// ─────────────────────────── การรวมจริง ───────────────────────────

export type MergeMovedCounts = {
  documents: number;
  journalLines: number;
  groupsMoved: number;
  groupsDeduped: number;
  recurringRules: number;
};

export type MergeResult =
  | { ok: true; primaryId: string; secondaryId: string; moved: MergeMovedCounts; partyMerged: boolean }
  | { ok: false; reason: string };

export type MergeContactsInput = {
  primaryId: string;
  secondaryId: string;
  fieldChoices?: MergeFieldChoices;
  actorId?: string | null;
  /** 🔬 ทดสอบเท่านั้น — โยน error หลังย้ายตารางที่ระบุ เพื่อพิสูจน์ว่าธุรกรรมย้อนกลับครบ (qc-acc-v2-contact-merge) */
  failAfter?: "documents" | "journalLines" | "groups" | "recurringRules";
};

/** สถานะเอกสารที่ถือว่า "ยกเลิกเรียบร้อยแล้ว" — ใช้ตรวจว่ามีการยกเลิกค้างกลางทางไหม */
const VOID_DONE_STATUSES = ["CANCELLED", "VOIDED"] as const;

export async function mergeContacts(ctx: Ctx, input: MergeContactsInput): Promise<MergeResult> {
  const { primaryId, secondaryId } = input;
  if (!primaryId || !secondaryId) return { ok: false, reason: "ต้องเลือกผู้ติดต่อให้ครบทั้ง 2 ราย" };
  if (primaryId === secondaryId) return { ok: false, reason: "เลือกผู้ติดต่อรายเดียวกัน 2 ช่อง — เลือกคนละรายก่อน" };

  const db = tenantDb(ctx);

  // ตรวจก่อนเข้า transaction (คืนข้อความไทยที่บอกวิธีแก้ ไม่ใช่ throw)
  const [primary, secondary] = await Promise.all([
    db.accountContact.findFirst({ where: { id: primaryId }, select: CONTACT_LITE_SELECT_FULL }),
    db.accountContact.findFirst({ where: { id: secondaryId }, select: CONTACT_LITE_SELECT_FULL }),
  ]);
  if (!primary) return { ok: false, reason: "ไม่พบผู้ติดต่อที่เลือกเป็นตัวหลักในระบบบัญชีนี้" };
  if (!secondary) return { ok: false, reason: "ไม่พบผู้ติดต่อที่เลือกเป็นตัวรองในระบบบัญชีนี้" };
  if (primary.mergedIntoId)
    return { ok: false, reason: `“${primary.name}” ถูกรวมเข้ากับผู้ติดต่อรายอื่นไปแล้ว — เปิดรายที่เป็นตัวหลักแทน` };
  if (secondary.mergedIntoId)
    return { ok: false, reason: `“${secondary.name}” ถูกรวมไปแล้วก่อนหน้านี้ (รวมซ้ำไม่ได้)` };
  if (primary.archivedAt) return { ok: false, reason: `“${primary.name}” ถูกปิดใช้งานอยู่ — เปิดใช้งานก่อนจึงจะตั้งเป็นตัวหลักได้` };
  if (secondary.archivedAt) return { ok: false, reason: `“${secondary.name}” ถูกปิดใช้งานอยู่แล้ว (ไม่มีอะไรให้รวม)` };

  // ยกเลิกค้างกลางทาง = ย้ายไม่ได้ (เอกสารมี voidedAt แล้วแต่สถานะยังไม่ถูกปิด — GL อาจกำลังกลับรายการอยู่)
  const stuck = await db.accountDocument.count({
    where: { contactId: secondaryId, voidedAt: { not: null }, status: { notIn: [...VOID_DONE_STATUSES] } },
  });
  if (stuck > 0)
    return {
      ok: false,
      reason: `“${secondary.name}” มีเอกสารที่กำลังยกเลิกค้างอยู่ ${stuck} ใบ — รอให้การยกเลิกเสร็จ (สถานะเปลี่ยนเป็น “ยกเลิกแล้ว”) ก่อนจึงจะรวมได้`,
    };

  const choices = input.fieldChoices ?? {};
  const patch: Prisma.AccountContactUpdateInput = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const f of MERGE_FIELDS) {
    if (choices[f.key] !== "secondary") continue;
    const value = secondary[f.key];
    if (value === primary[f.key]) continue;
    before[f.key] = primary[f.key];
    after[f.key] = value;
    (patch as Record<string, unknown>)[f.key] = value;
  }
  // เขียน phone → ต้องเขียน phoneNorm คู่เสมอ (กติกาในสคีมา AccountContact.phoneNorm)
  if (choices.phone === "secondary") (patch as Record<string, unknown>).phoneNorm = secondary.phoneNorm ?? (normalizePhoneTh(secondary.phone ?? "") || null);

  const moved: MergeMovedCounts = { documents: 0, journalLines: 0, groupsMoved: 0, groupsDeduped: 0, recurringRules: 0 };
  const now = new Date();

  try {
    await db.$transaction(async (tx) => {
      // 1) เอกสารทุกชนิด (contactSnapshot = ภาพนิ่ง ณ วันออกเอกสาร — **ไม่แตะ** ตามเจตนาเดิมของฟิลด์)
      moved.documents = (await tx.accountDocument.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } })).count;
      if (input.failAfter === "documents") throw new Error("TEST_INJECTED_FAILURE");

      // 2) บรรทัดสมุดรายวัน (ไม่มี FK — ลืมง่ายที่สุด · รายงานแยกประเภทต่อคู่ค้าใช้ฟิลด์นี้)
      moved.journalLines = (await tx.accountJournalLine.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } })).count;
      if (input.failAfter === "journalLines") throw new Error("TEST_INJECTED_FAILURE");

      // 3) กลุ่มผู้ติดต่อ — @@unique([groupId,contactId]) ⇒ กลุ่มที่ตัวหลักอยู่แล้ว ต้อง "ลบทิ้ง" ไม่ใช่ย้าย
      const [primaryMemberships, secondaryMemberships] = await Promise.all([
        tx.accountContactGroupMember.findMany({ where: { contactId: primaryId }, select: { groupId: true } }),
        tx.accountContactGroupMember.findMany({ where: { contactId: secondaryId }, select: { id: true, groupId: true } }),
      ]);
      const primaryGroupIds = new Set(primaryMemberships.map((m) => m.groupId));
      const dupIds = secondaryMemberships.filter((m) => primaryGroupIds.has(m.groupId)).map((m) => m.id);
      const moveIds = secondaryMemberships.filter((m) => !primaryGroupIds.has(m.groupId)).map((m) => m.id);
      if (dupIds.length > 0) moved.groupsDeduped = (await tx.accountContactGroupMember.deleteMany({ where: { id: { in: dupIds } } })).count;
      if (moveIds.length > 0)
        moved.groupsMoved = (await tx.accountContactGroupMember.updateMany({ where: { id: { in: moveIds } }, data: { contactId: primaryId } })).count;
      if (input.failAfter === "groups") throw new Error("TEST_INJECTED_FAILURE");

      // 4) กฎเอกสารประจำ (WO 1.9)
      moved.recurringRules = (await tx.accountRecurringRule.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } })).count;
      if (input.failAfter === "recurringRules") throw new Error("TEST_INJECTED_FAILURE");

      // 5) ค่าที่ผู้ใช้เลือกเก็บไว้ที่ตัวหลัก
      if (Object.keys(patch).length > 0) await tx.accountContact.update({ where: { id: primaryId }, data: patch });

      // 6) ตัวรอง → ปิดใช้งาน + ชี้ไปตัวหลัก (ไม่ลบ — ประวัติ/ลิงก์เก่ายังตามได้)
      await tx.accountContact.update({ where: { id: secondaryId }, data: { archivedAt: now, mergedIntoId: primaryId } });

      // 7) Party (ตัวตนกลางระดับ tenant) — ตัวรองชี้ไปตัวหลัก + ปิดคู่ใน PartyMergeCandidate
      // cast: `tx` เป็น client ที่ผ่าน $extends ของ tenantDb แล้ว (ตัวกรอง tenant/system ยังทำงานตอนรัน)
      // TypeScript มองเป็นชนิดเฉพาะของ extended client — ประกาศพารามิเตอร์เป็น TransactionClient เพื่ออ่านง่าย
      await mergeParties(tx as unknown as Prisma.TransactionClient, ctx, {
        primaryPartyId: (patch as { partyId?: string | null }).partyId ?? primary.partyId,
        secondaryPartyId: secondary.partyId,
        keepSecondaryParty: choices.partyId === "secondary",
      });

      // WO C4 — ยิง webhook ใน tx เดียวกับการย้าย (ล้มกลางทาง = ไม่มีทั้งการย้ายและ event)
      //   cast เหตุผลเดียวกับ mergeParties ข้างบน (tx ผ่าน $extends ของ tenantDb แล้ว)
      //   🔴 `emitOutbox*` เขียน tenantId เอง ⇒ ต้องส่ง systemId ที่ ctx ถือมาไปด้วย (ตัวกรองของ tenantDb
      //      ไม่ได้เติม systemId ให้ OutboxEvent — มันเป็น axis tenant)
      await emitContactMerged(tx as unknown as Prisma.TransactionClient, ctx, {
        keepId: primaryId,
        mergedId: secondaryId,
        moved: {
          documents: moved.documents,
          journalLines: moved.journalLines,
          groups: moved.groupsMoved + moved.groupsDeduped,
          recurringRules: moved.recurringRules,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "TEST_INJECTED_FAILURE") return { ok: false, reason: "ทดสอบ: ธุรกรรมถูกยกเลิกกลางทาง (ไม่มีอะไรถูกย้าย)" };
    // 🔴 ห้าม log ข้อมูลลูกค้า — พิมพ์แค่ชนิด error
    console.error(`[account] mergeContacts ล้มเหลว — ${e instanceof Error ? e.name || "Error" : "unknown"}`);
    return { ok: false, reason: "รวมผู้ติดต่อไม่สำเร็จ ระบบยกเลิกการทำรายการทั้งหมดแล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
  }

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: input.actorId ?? null,
    action: "account.contact.merge",
    targetType: "AccountContact",
    targetId: primaryId,
    before: {
      primary: { id: primaryId, code: primary.code, fields: before },
      secondary: {
        id: secondaryId,
        code: secondary.code,
        documents: moved.documents,
        journalLines: moved.journalLines,
        groups: moved.groupsMoved + moved.groupsDeduped,
        recurringRules: moved.recurringRules,
      },
    },
    after: { primary: { id: primaryId, fields: after }, moved, secondaryArchived: true },
  });

  return {
    ok: true,
    primaryId,
    secondaryId,
    moved,
    partyMerged: !!(primary.partyId && secondary.partyId && primary.partyId !== secondary.partyId),
  };
}

const CONTACT_LITE_SELECT_FULL = {
  ...CONTACT_LITE_SELECT,
  archivedAt: true,
  mergedIntoId: true,
} as const;

/** ผูก Party ของตัวรองเข้ากับตัวหลัก + ปิดคู่ใน PartyMergeCandidate (ในธุรกรรมเดียวกับการย้ายแถว) */
async function mergeParties(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  p: { primaryPartyId: string | null; secondaryPartyId: string | null; keepSecondaryParty: boolean },
): Promise<void> {
  const keepId = p.keepSecondaryParty ? p.secondaryPartyId : p.primaryPartyId;
  const dropId = p.keepSecondaryParty ? p.primaryPartyId : p.secondaryPartyId;
  if (!p.primaryPartyId || !p.secondaryPartyId || p.primaryPartyId === p.secondaryPartyId) {
    // ไม่มี Party ทั้งคู่/มีตัวเดียว → ไม่มีอะไรให้รวมที่ระดับ Party (แต่ยังปิดคู่ที่ค้างอยู่ถ้ามี)
    if (p.primaryPartyId && p.secondaryPartyId)
      await closeCandidate(tx, ctx, p.primaryPartyId, p.secondaryPartyId, "MERGED");
    return;
  }
  if (!keepId || !dropId) return;
  await tx.party.updateMany({ where: { id: dropId, tenantId: ctx.tenantId }, data: { mergedIntoId: keepId } });
  await closeCandidate(tx, ctx, p.primaryPartyId, p.secondaryPartyId, "MERGED");
}

async function closeCandidate(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  partyAId: string,
  partyBId: string,
  status: "MERGED" | "DISMISSED",
): Promise<void> {
  const [a, b] = partyAId < partyBId ? [partyAId, partyBId] : [partyBId, partyAId];
  const existing = await tx.partyMergeCandidate.findFirst({ where: { tenantId: ctx.tenantId, partyAId: a, partyBId: b }, select: { id: true } });
  if (existing) {
    await tx.partyMergeCandidate.update({ where: { id: existing.id }, data: { status } });
    return;
  }
  await tx.partyMergeCandidate.create({ data: { tenantId: ctx.tenantId, partyAId: a, partyBId: b, reason: "NAME_SIMILAR", status } });
}

// ─────────────────────────── "ไม่ใช่คนเดียวกัน" (ปุ่ม ข้าม ใน g7) ───────────────────────────

export type DismissResult = { ok: true } | { ok: false; reason: string };

/**
 * บันทึกว่า "คู่นี้ไม่ใช่คนเดียวกัน" → ไม่โผล่ในรายการอีก
 * เก็บสถานะที่ `PartyMergeCandidate` (ตารางเดิม ไม่เพิ่ม schema) ⇒ ผู้ติดต่อทั้งคู่ต้องมี Party
 * ถ้ายังไม่มี ให้สร้าง/หาให้ก่อนด้วย facade เดิม (`safeFindOrCreate` — ไม่มีวัน throw)
 */
export async function dismissMergeCandidate(ctx: Ctx, aId: string, bId: string): Promise<DismissResult> {
  if (aId === bId) return { ok: false, reason: "เลือกผู้ติดต่อรายเดียวกัน 2 ช่อง" };
  const db = tenantDb(ctx);
  const rows = await db.accountContact.findMany({ where: { id: { in: [aId, bId] } }, select: CONTACT_LITE_SELECT });
  if (rows.length !== 2) return { ok: false, reason: "ไม่พบผู้ติดต่อคู่นี้ในระบบบัญชีนี้" };

  const partyIds: string[] = [];
  for (const r of rows as ContactLite[]) {
    let pid = r.partyId;
    if (!pid) {
      pid = await party.safeFindOrCreate(ctx.tenantId, {
        name: r.name,
        phone: r.phone,
        email: r.email,
        taxId: r.taxId,
        branchCode: r.branchCode || undefined,
      });
      if (pid) await db.accountContact.updateMany({ where: { id: r.id }, data: { partyId: pid } });
    }
    if (!pid) return { ok: false, reason: "บันทึกไม่สำเร็จ: สร้างตัวตนกลางของผู้ติดต่อไม่ได้ — ลองใหม่อีกครั้ง" };
    partyIds.push(pid);
  }
  if (partyIds[0] === partyIds[1])
    return { ok: false, reason: "ผู้ติดต่อ 2 รายนี้ผูกอยู่กับตัวตนเดียวกันแล้ว — แยกตัวตนก่อนจึงจะทำเครื่องหมาย “ไม่ใช่คนเดียวกัน” ได้" };

  await db.$transaction(async (tx) => {
    await closeCandidate(tx as unknown as Prisma.TransactionClient, ctx, partyIds[0]!, partyIds[1]!, "DISMISSED");
  });
  return { ok: true };
}

/**
 * ตัวนับ badge "รวมผู้ติดต่อซ้ำ" บนแถบซ้ายของหน้ารายการ — **1 query** (ห้ามให้หน้ารายการแพงขึ้น)
 * นับเฉพาะคู่ที่บันทึกไว้แล้วสถานะ OPEN (ผลสแกน Party จาก WO 3.1 / cron) ไม่ใช่การสแกนสดทั้งตาราง
 * ⇒ ตัวเลขนี้เป็น "ค่าต่ำสุดที่การันตี" · หน้ารวมจริงสแกนสดอีกทีและอาจเจอมากกว่านี้ (จดไว้ใน wo-notes)
 */
export async function countOpenMergeCandidates(ctx: Ctx): Promise<number> {
  const rows = await tenantDb(ctx).$queryRaw<{ n: bigint }[]>`
    SELECT (
      (SELECT COUNT(*) FROM "PartyMergeCandidate" WHERE "tenantId" = ${ctx.tenantId} AND "status" = 'OPEN')
      +
      -- คู่ซ้ำ "แข็ง" ที่เห็นได้ในระบบบัญชีนี้เอง: เลขภาษีเดียวกัน / เบอร์ normalize เดียวกัน
      -- (นับเป็นจำนวน "คู่" ต่อกลุ่ม = n*(n-1)/2 · ไม่รวมเกณฑ์ชื่อคล้ายเพราะต้องสแกน O(n²))
      (SELECT COALESCE(SUM(c * (c - 1) / 2), 0) FROM (
         SELECT COUNT(*) AS c FROM "AccountContact"
          WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
            AND "archivedAt" IS NULL AND "mergedIntoId" IS NULL AND "taxId" IS NOT NULL
          GROUP BY regexp_replace("taxId", '\D', '', 'g') HAVING COUNT(*) > 1) t)
      +
      (SELECT COALESCE(SUM(c * (c - 1) / 2), 0) FROM (
         SELECT COUNT(*) AS c FROM "AccountContact"
          WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
            AND "archivedAt" IS NULL AND "mergedIntoId" IS NULL AND "phoneNorm" IS NOT NULL AND "phoneNorm" <> ''
          GROUP BY "phoneNorm" HAVING COUNT(*) > 1) t)
    )::bigint AS n`;
  return Number(rows[0]?.n ?? 0);
}
