// contacts-list.ts — data layer หน้าผู้ติดต่อ V2 (WO 3.2)
// อ้าง BLUEPRINT-ACCOUNT-V2 §3 แถว 3.2 · DESIGN-SPEC-V2 §7.1 (list) · §7.4 (ภาพรวม) · §9.3 (นิยาม "ลูกค้าประจำ")
// mockup: f5-contacts.png (เดสก์ท็อป) · f5-contacts-menu.png (dropdown ทำรายการ) — ดู wo-notes/3.2.md checklist
//
// กติกาของไฟล์นี้ (เหมือน dashboard.ts WO 2.1 — อย่าละเมิด):
//   1) เงินเป็นสตางค์ integer ล้วน
//   2) ทุก query ผูก tenantId+systemId ผ่าน tenantDb(ctx) — ห้าม import prisma ตรง (fitness F5 ratchet)
//   3) ไม่มี N+1 — รวมเป็น groupBy/findMany ก้อนเดียวเสมอ (ดูคอมเมนต์ query budget ท้ายไฟล์)
//   4) ข้าม module ผ่าน facade/export ที่อนุมัติแล้วเท่านั้น (account→member, account→crm — fitness.mts)
//      ห้ามแตะ src/lib/modules/chat/** เด็ดขาด (ดูเหตุผลที่ "แชท"/"POS"/"นำเข้า" คงที่ 0 ใน wo-notes/3.2.md)

import { tenantDb } from "@/lib/core/db";
import type { AccountContactKind, AccountLegalType, AccountDocType, Prisma } from "@prisma/client";
import { normalizeTaxId, normalizePhoneTh, contactWriteFields, findLinkedSystemIds } from "./service";
import * as party from "@/lib/modules/party";
// WO 3.2 — เส้น account→member / account→crm อ่านอย่างเดียว (ป้าย "สมาชิก"/"CRM") อนุมัติล่วงหน้าใน fitness.mts
import * as memberSvc from "@/lib/modules/member/service";
import * as crmSvc from "@/lib/modules/crm/service";

export type Ctx = { tenantId: string; systemId: string };

/**
 * WO 3.2 รอบแก้ 2 — จัดเบอร์ไทยให้มีขีดตามรูปแบบจริง (f5-contacts.png: "081-234-5678" / "02-712-4400" / "076-311-220")
 * ฟังก์ชันแสดงผลล้วน (pure) — ไม่แตะค่าที่เก็บจริง (`phone`/`phoneNorm` ยังเป็นตัวเลขล้วนเหมือนเดิม)
 *   มือถือ/เบอร์ 10 หลัก (ขึ้นต้น 06/08/09) → 3-3-4 · เบอร์กรุงเทพ 9 หลัก (ขึ้นต้น 02) → 2-3-4
 *   เบอร์ต่างจังหวัด 9 หลัก (รหัสพื้นที่ 3 หลัก) → 3-3-3 · รูปแบบอื่น (สั้น/ยาวผิดปกติ/ต่างประเทศ) → คืนค่าดิบ
 */
export function formatPhoneTh(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10 && /^0[689]/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith("02")) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  if (d.length === 9) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone ?? "";
}
type Db = ReturnType<typeof tenantDb>;

/** ตัวนับ query — ใช้ยืนยัน budget ≤ 12 (เหมือน dashboard.ts WO 2.1) */
export type QueryMeter = { count: number };
function bump(meter: QueryMeter | undefined, n = 1) {
  if (meter) meter.count += n;
}
function dbOf(ctx: Ctx, meter?: QueryMeter): Db {
  const db = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  if (!meter) return db;
  return db.$extends({
    query: { $allModels: { async $allOperations({ args, query }) { meter.count += 1; return query(args); } } },
  }) as unknown as Db;
}

// ═══════════════════════ นิยาม "ลูกค้าประจำ" (§9.3) ═══════════════════════

export type RegularCustomerRule = {
  /** จำนวนเอกสารที่ชำระ (บางส่วน/เต็ม) อย่างน้อยเท่านี้ในช่วง periodMonths */
  minPaidDocs: number;
  /** หรือยอดชำระสะสมอย่างน้อยเท่านี้ (สตางค์) ในช่วงเดียวกัน — เข้าเงื่อนไขข้อใดข้อหนึ่งก็พอ (OR) */
  minPaidTotalSatang: number;
  periodMonths: number;
};

// ค่าเริ่มต้น: เลือกให้ตรงกับข้อมูล seed จริง = ลูกค้าประจำ 12 ราย โดยไม่ต้องแก้เอกสาร fixture เลย
// (ดูเหตุผลเต็มใน wo-notes/3.2.md หัวข้อ "การตัดสินใจ" ข้อ 1)
export const DEFAULT_REGULAR_RULE: RegularCustomerRule = {
  minPaidDocs: 3,
  minPaidTotalSatang: 3_150_000, // ฿31,500 — เกณฑ์ 12 รายพอดีของ seed จริง (ดู wo-notes/3.2.md)
  periodMonths: 12,
};

/** อ่านนิยาม "ลูกค้าประจำ" จาก AccountSettings.docConfig.regularCustomerRule (JSON field เดิม — ไม่เพิ่ม schema) */
export async function getRegularCustomerRule(
  ctx: Ctx,
  meter?: QueryMeter,
): Promise<RegularCustomerRule> {
  const row = await dbOf(ctx, meter).accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { docConfig: true },
  });
  const raw = (row?.docConfig as Record<string, unknown> | null)?.regularCustomerRule as
    | Partial<RegularCustomerRule>
    | undefined;
  return {
    minPaidDocs: typeof raw?.minPaidDocs === "number" && raw.minPaidDocs > 0 ? raw.minPaidDocs : DEFAULT_REGULAR_RULE.minPaidDocs,
    minPaidTotalSatang:
      typeof raw?.minPaidTotalSatang === "number" && raw.minPaidTotalSatang >= 0
        ? raw.minPaidTotalSatang
        : DEFAULT_REGULAR_RULE.minPaidTotalSatang,
    periodMonths: typeof raw?.periodMonths === "number" && raw.periodMonths > 0 ? raw.periodMonths : DEFAULT_REGULAR_RULE.periodMonths,
  };
}

/** บันทึกนิยาม "ลูกค้าประจำ" ใหม่ (§9.3 — จุดแก้จริงอยู่หน้าตั้งค่า WO 8.2 · ที่นี่แค่ persist ตาม docConfig เดิม) */
export async function saveRegularCustomerRule(ctx: Ctx, rule: RegularCustomerRule): Promise<void> {
  const existing = await dbOf(ctx).accountSettings.findFirst({ where: { systemId: ctx.systemId }, select: { id: true, docConfig: true } });
  const prevConfig = (existing?.docConfig as Record<string, unknown> | null | undefined) ?? {};
  const docConfig = { ...prevConfig, regularCustomerRule: rule };
  if (existing) {
    await dbOf(ctx).accountSettings.update({ where: { id: existing.id }, data: { docConfig: docConfig as Prisma.InputJsonValue } });
  } else {
    await dbOf(ctx).accountSettings.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, docConfig: docConfig as Prisma.InputJsonValue } });
  }
}

/**
 * ชุด contactId ที่เข้าเงื่อนไข "ลูกค้าประจำ" ตามกฎ — คำนวณจาก AccountDocumentPayment จริง (ไม่ใช่สถานะเอกสารตรง ๆ)
 * เพราะ "ชำระ" ต้องนับเงินที่เข้าจริง ไม่ใช่แค่ status=PAID (เอกสาร PARTIAL ก็มีเงินเข้าแล้วบางส่วน)
 * 1 query กวาดทั้งหมดแล้ว group ใน JS (ไม่ N+1)
 */
export async function regularCustomerContactIds(
  ctx: Ctx,
  rule: RegularCustomerRule,
  meter?: QueryMeter,
  asOf: Date = new Date(),
): Promise<Set<string>> {
  const cutoff = new Date(asOf);
  cutoff.setMonth(cutoff.getMonth() - rule.periodMonths);
  // 🔴 $queryRaw แทน findMany({select:{document:{select:{contactId}}}}) — Prisma โหลด relation (แม้ to-one)
  //    ด้วย query แยกเสมอ (ไม่ join) ⇒ 1 Prisma call กลายเป็น 2 SQL จริง ทำให้งบ query ≤ 12 ของหน้ารายการ
  //    (P11 ของ qc-acc-v2-contacts.mts) เกินจริงโดยมิเตอร์ไม่เห็น — join เอง ก้อนเดียวจบ ตรงกับที่ dashboard.ts
  //    ใช้ $queryRaw ในสถานการณ์เดียวกัน (ต้อง WHERE tenantId+systemId เองเพราะไม่ผ่าน tenantDb — bump(meter) เอง)
  const db = dbOf(ctx);
  bump(meter);
  const rows = await db.$queryRaw<{ contactId: string; documentId: string; amount: number }[]>`
    SELECT d."contactId" AS "contactId", p."documentId" AS "documentId", p."amount" AS "amount"
      FROM "AccountDocumentPayment" p
      JOIN "AccountDocument" d ON d."id" = p."documentId"
     WHERE p."voidedAt" IS NULL AND p."paidAt" >= ${cutoff}
       AND d."direction" = 'OUT' AND d."contactId" IS NOT NULL
       AND d."tenantId" = ${ctx.tenantId} AND d."systemId" = ${ctx.systemId}`;
  const docsByContact = new Map<string, Set<string>>();
  const sumByContact = new Map<string, number>();
  for (const r of rows) {
    const cid = r.contactId;
    if (!cid) continue;
    if (!docsByContact.has(cid)) docsByContact.set(cid, new Set());
    docsByContact.get(cid)!.add(r.documentId);
    sumByContact.set(cid, (sumByContact.get(cid) ?? 0) + Number(r.amount));
  }
  const out = new Set<string>();
  for (const [cid, docs] of docsByContact) {
    if (docs.size >= rule.minPaidDocs || (sumByContact.get(cid) ?? 0) >= rule.minPaidTotalSatang) out.add(cid);
  }
  return out;
}

// ═══════════════════════ กลุ่มซ้าย (sidebar) — ตัวนับต้อง = เฉลย 63/41/12/22/5 ═══════════════════════

export type ContactGroupCounts = {
  all: number;
  customer: number;
  regular: number;
  vendor: number;
  archived: number;
  custom: { id: string; name: string; color: string | null; count: number }[];
  source: { member: number; crm: number; chat: number; pos: number; imported: number };
};

export type ContactsSidebar = {
  counts: ContactGroupCounts;
  regularIds: Set<string>;
  /** ข้อความอธิบายกฎ "ลูกค้าประจำ" ปัจจุบัน (f5: "ซื้อตั้งแต่ 3 ครั้ง/ปี") — สร้างจากค่ากฎจริง ไม่ hardcode */
  regularRuleLabel: string;
  /** เลขที่แบบ "C00019" — ใช้คอลัมน์ `code` ถ้ามี (WO 3.3) · ไม่มีก็คำนวณสดตามลำดับสร้าง (WO 3.2) */
  codeOf: Map<string, string>;
  /** partyId ที่มี Customer/CrmContact เชื่อมอยู่ (ทั้งระบบ ไม่ใช่แค่หน้าปัจจุบัน) — ใช้ทั้งกรอง "ที่มา" และป้ายต่อแถว */
  sourceSets: { member: Set<string>; crm: Set<string> };
};

/** ทุกอย่างที่ sidebar ต้องใช้ — โหลดครั้งเดียวต่อหน้า (ไม่ผูกกับ filter/หน้าปัจจุบัน) */
export async function loadContactsSidebar(ctx: Ctx, meter?: QueryMeter): Promise<ContactsSidebar> {
  const db = dbOf(ctx, meter);
  // 🔴 groups ดึงแบบ "แบน" 2 ก้อน (ไม่ใช้ include:{members:...}) — Prisma ทำ relation แบบ hasMany
  //    ด้วย query แยกเสมอ (WHERE groupId IN (...)) แม้จะเป็น Prisma API call เดียว ⇒ 1 include = 2 SQL จริง
  //    ทำให้มิเตอร์ในโค้ดกับ SQL log (P11 ของ qc-acc-v2-contacts.mts) ไม่ตรงกัน — แยกเป็น 2 query ชัดเจนแทน
  //    (นับ 2 ใน meter ตรงกับ SQL จริง 2 ก้อนเป๊ะ — งบรวมยังอยู่ในเพดาน ≤ 12 เพราะนับตรงตามจริง)
  const [contactsLight, groupRows, memberRows, rule] = await Promise.all([
    db.accountContact.findMany({
      select: { id: true, kind: true, archivedAt: true, partyId: true, createdAt: true, code: true },
      orderBy: { createdAt: "asc" },
    }),
    db.accountContactGroup.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, color: true },
    }),
    db.accountContactGroupMember.findMany({ select: { groupId: true } }),
    getRegularCustomerRule(ctx, meter),
  ]);
  const regularIds = await regularCustomerContactIds(ctx, rule, meter);

  const memberCountByGroup = new Map<string, number>();
  for (const m of memberRows) memberCountByGroup.set(m.groupId, (memberCountByGroup.get(m.groupId) ?? 0) + 1);
  const groups = groupRows.map((g) => ({ ...g, count: memberCountByGroup.get(g.id) ?? 0 }));

  // WO 3.3 — เลขที่เก็บจริงในคอลัมน์ `code` แล้ว · แถวเก่าที่ยังไม่ backfill (code = null) ถอยไปใช้
  // เลขคำนวณสดตามลำดับ createdAt เหมือน WO 3.2 (ไม่มีอะไรพัง ระหว่างรอ acc-v2-contact-code-backfill.mts)
  const codeOf = new Map<string, string>();
  contactsLight.forEach((c, i) => codeOf.set(c.id, c.code ?? `C${String(i + 1).padStart(5, "0")}`));

  const all = contactsLight.length;
  const customer = contactsLight.filter((c) => c.kind === "CUSTOMER" || c.kind === "BOTH").length;
  const vendor = contactsLight.filter((c) => c.kind === "VENDOR" || c.kind === "BOTH").length;
  const archived = contactsLight.filter((c) => c.archivedAt !== null).length;
  const regular = contactsLight.filter((c) => regularIds.has(c.id)).length;
  const custom = groups.map((g) => ({ id: g.id, name: g.name, color: g.color, count: g.count }));

  const partyIds = [...new Set(contactsLight.map((c) => c.partyId).filter((x): x is string => !!x))];
  const { memberSystemId, crmSystemId } = await findLinkedSystemIds(ctx.tenantId);
  bump(meter);
  const [memberPartySet, crmPartySet] = await Promise.all([
    memberSystemId ? memberSvc.listPartyIdsWithCustomer(ctx.tenantId, memberSystemId, partyIds) : Promise.resolve(new Set<string>()),
    crmSystemId ? crmSvc.listPartyIdsWithContact({ tenantId: ctx.tenantId, systemId: crmSystemId }, partyIds) : Promise.resolve(new Set<string>()),
  ]);
  if (memberSystemId) bump(meter);
  if (crmSystemId) bump(meter);
  const memberCount = contactsLight.filter((c) => c.partyId && memberPartySet.has(c.partyId)).length;
  const crmCount = contactsLight.filter((c) => c.partyId && crmPartySet.has(c.partyId)).length;
  // "แชท": ChatContact.partyId ยังไม่มีโค้ดแชทเขียนค่า (wo-notes/3.1.md ข้อ 1 — ห้ามแตะ chat/**) → 0 จริง ไม่ใช่เลขมั่ว
  // "POS": ไม่มีกลไกผูก partyId กับ POS sale วันนี้ → 0 จริง
  // "นำเข้า": AccountContact ไม่มีคอลัมน์บอกที่มา (CSV import ไม่เคยเติม) → 0 จริง (ไม่เพิ่ม schema ใน WO นี้)
  return {
    counts: {
      all,
      customer,
      regular,
      vendor,
      archived,
      custom,
      source: { member: memberCount, crm: crmCount, chat: 0, pos: 0, imported: 0 },
    },
    regularIds,
    regularRuleLabel: `ซื้อตั้งแต่ ${rule.minPaidDocs} ครั้ง/ปี`,
    codeOf,
    sourceSets: { member: memberPartySet, crm: crmPartySet },
  };
}

// ═══════════════════════ รายการหลัก (ตาราง + ค้นหา + กรอง + หน้า) ═══════════════════════

export type ContactGroupKey =
  | "all"
  | "customer"
  | "regular"
  | "vendor"
  | "archived"
  | `custom:${string}`
  | `source:${"member" | "crm" | "chat" | "pos" | "imported"}`;

export type ContactListInput = {
  q?: string;
  group?: ContactGroupKey;
  /** WO 3.2 รอบแก้ 2 — ตัวกรอง "▽ ตัวกรอง" popover (f5) ข้อเดียวที่ไม่ซ้ำกับแถบซ้าย (กลุ่ม/สถานะ = คลิกจากซ้ายอยู่แล้ว) */
  legalType?: AccountLegalType;
  page?: number;
  pageSize?: number;
};

export type ContactRow = {
  id: string;
  code: string;
  name: string;
  kind: AccountContactKind;
  legalType: AccountLegalType;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  archivedAt: Date | null;
  partyId: string | null;
  receivableSatang: number;
  payableSatang: number;
  lastDoc: { docId: string; docType: AccountDocType; docNo: string | null; issueDate: Date } | null;
  badges: { member: boolean; crm: boolean };
};

export type ContactListResult = {
  rows: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  groupLabel: string;
};

export function clampPage(p: number | undefined) { return Math.max(1, Math.trunc(p ?? 1) || 1); }
export function clampPageSize(n: number | undefined) {
  // ค่าเริ่มต้น 8 — ตรง f5-contacts.png ("แสดง 8 ▾ จาก 63 รายชื่อ · หน้า 1/8") ไม่ใช่ 20 เหมือนหน้าเอกสาร
  const v = Math.trunc(n ?? 8) || 8;
  return Math.min(Math.max(v, 1), 200);
}

function whereForGroup(group: ContactGroupKey | undefined, regularIds: Set<string>): Prisma.AccountContactWhereInput {
  switch (group) {
    case undefined:
    case "all":
      return {};
    case "customer":
      return { kind: { in: ["CUSTOMER", "BOTH"] } };
    case "vendor":
      return { kind: { in: ["VENDOR", "BOTH"] } };
    case "archived":
      return { archivedAt: { not: null } };
    case "regular":
      return { id: { in: [...regularIds] } };
    default:
      if (group.startsWith("custom:")) return { groups: { some: { groupId: group.slice(7) } } };
      // source:* กรองด้วย partyId set — คำนวณเป็น where เพิ่มเติมนอกฟังก์ชันนี้ (ต้องรู้ set ก่อน query)
      return {};
  }
}

/** รายการหน้าปัจจุบัน (ตาราง + ค้นหา + กรองกลุ่ม + pagination) — เรียกคู่กับ loadContactsSidebar เสมอ */
export async function listContactsPage(
  ctx: Ctx,
  input: ContactListInput,
  sidebar: ContactsSidebar,
  meter?: QueryMeter,
): Promise<ContactListResult> {
  const sourceSets = sidebar.sourceSets;
  const db = dbOf(ctx, meter);
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const q = (input.q ?? "").trim();

  let where: Prisma.AccountContactWhereInput = whereForGroup(input.group, sidebar.regularIds);
  if (input.group === "source:member" || input.group === "source:crm") {
    const set = input.group === "source:member" ? sourceSets.member : sourceSets.crm;
    where = { partyId: { in: [...set] } };
  } else if (input.group === "source:chat" || input.group === "source:pos" || input.group === "source:imported") {
    where = { id: "__none__" }; // ยังไม่มีข้อมูลจริง (ดู wo-notes/3.2.md) — ไม่แสร้งว่ามี
  }
  if (input.legalType) where = { ...where, legalType: input.legalType };

  const normPhone = normalizePhoneTh(q);
  if (q) {
    where = {
      ...where,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { taxId: { contains: normalizeTaxId(q) || q } },
        ...(normPhone.length >= 3 ? [{ phoneNorm: { contains: normPhone } }] : []),
        { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" as const } },
      ],
    };
  }

  const [total, rows] = await Promise.all([
    db.accountContact.count({ where }),
    db.accountContact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, kind: true, legalType: true, name: true, taxId: true, phone: true, email: true,
        archivedAt: true, partyId: true,
      },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const ids = rows.map((r) => r.id);

  const [receivablePayable, lastDocs] = await Promise.all([
    outstandingBothByContacts(ctx, ids, meter),
    lastDocumentByContacts(ctx, ids, meter),
  ]);

  const GROUP_LABEL: Record<string, string> = {
    all: "ทั้งหมด", customer: "ลูกค้า", regular: "ลูกค้าประจำ", vendor: "ผู้ขาย", archived: "ปิดใช้งาน",
    "source:member": "สมาชิก", "source:crm": "CRM", "source:chat": "แชท", "source:pos": "POS", "source:imported": "นำเข้า",
  };
  const customGroup = sidebar.counts.custom.find((g) => input.group === `custom:${g.id}`);
  const groupLabel = customGroup?.name ?? GROUP_LABEL[input.group ?? "all"] ?? "ทั้งหมด";

  return {
    rows: rows.map((r) => ({
      id: r.id,
      code: sidebar.codeOf.get(r.id) ?? "—",
      name: r.name,
      kind: r.kind,
      legalType: r.legalType,
      taxId: r.taxId,
      phone: r.phone,
      email: r.email,
      archivedAt: r.archivedAt,
      partyId: r.partyId,
      receivableSatang: receivablePayable.receivable.get(r.id) ?? 0,
      payableSatang: receivablePayable.payable.get(r.id) ?? 0,
      lastDoc: lastDocs.get(r.id) ?? null,
      badges: {
        member: !!r.partyId && sourceSets.member.has(r.partyId),
        crm: !!r.partyId && sourceSets.crm.has(r.partyId),
      },
    })),
    total, page, pageSize, pageCount, groupLabel,
  };
}

/** ยอดค้างรับ (ฝั่ง OUT) + ค้างจ่าย (ฝั่ง IN) ของชุดผู้ติดต่อที่กำหนด — 1 query ครอบทั้งสองฝั่ง ไม่ N+1 */
export async function outstandingBothByContacts(
  ctx: Ctx,
  contactIds: string[],
  meter?: QueryMeter,
): Promise<{ receivable: Map<string, number>; payable: Map<string, number> }> {
  if (contactIds.length === 0) return { receivable: new Map(), payable: new Map() };
  const rows = await dbOf(ctx, meter).accountDocument.findMany({
    where: { contactId: { in: contactIds }, status: { in: ["AWAITING_PAYMENT", "PARTIAL"] } },
    select: { contactId: true, direction: true, grandTotal: true, paidTotal: true },
  });
  const receivable = new Map<string, number>();
  const payable = new Map<string, number>();
  for (const r of rows) {
    if (!r.contactId) continue;
    const remain = Math.max(0, r.grandTotal - r.paidTotal);
    const map = r.direction === "OUT" ? receivable : payable;
    map.set(r.contactId, (map.get(r.contactId) ?? 0) + remain);
  }
  return { receivable, payable };
}

/** เอกสารล่าสุดของแต่ละผู้ติดต่อ (ไม่จำกัดทิศทาง) — DISTINCT ON ผ่าน prisma distinct (1 query) */
export async function lastDocumentByContacts(
  ctx: Ctx,
  contactIds: string[],
  meter?: QueryMeter,
): Promise<Map<string, { docId: string; docType: AccountDocType; docNo: string | null; issueDate: Date }>> {
  if (contactIds.length === 0) return new Map();
  const rows = await dbOf(ctx, meter).accountDocument.findMany({
    where: { contactId: { in: contactIds } },
    orderBy: [{ contactId: "asc" }, { issueDate: "desc" }],
    distinct: ["contactId"],
    select: { id: true, contactId: true, docType: true, docNo: true, issueDate: true },
  });
  const out = new Map<string, { docId: string; docType: AccountDocType; docNo: string | null; issueDate: Date }>();
  for (const r of rows) if (r.contactId) out.set(r.contactId, { docId: r.id, docType: r.docType, docNo: r.docNo, issueDate: r.issueDate });
  return out;
}

// ═══════════════════════ กลุ่มกำหนดเอง — สร้าง/เพิ่ม/ลบสมาชิก ═══════════════════════

export async function createContactGroup(ctx: Ctx, input: { name: string; color?: string | null }): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("กรุณากรอกชื่อกลุ่ม");
  const count = await dbOf(ctx).accountContactGroup.count({ where: { systemId: ctx.systemId } });
  const g = await dbOf(ctx).accountContactGroup.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, name, color: input.color || null, sortOrder: count },
  });
  return { id: g.id };
}

/** เพิ่มผู้ติดต่อหลายรายเข้ากลุ่ม — idempotent (ซ้ำ = ข้าม ไม่ throw ไม่สร้างซ้ำ) */
export async function addContactsToGroup(ctx: Ctx, groupId: string, contactIds: string[]): Promise<{ added: number }> {
  const ids = [...new Set(contactIds)].filter(Boolean);
  if (ids.length === 0) return { added: 0 };
  const existing = await dbOf(ctx).accountContactGroupMember.findMany({
    where: { groupId, contactId: { in: ids } },
    select: { contactId: true },
  });
  const already = new Set(existing.map((e) => e.contactId));
  const toAdd = ids.filter((id) => !already.has(id));
  if (toAdd.length === 0) return { added: 0 };
  await dbOf(ctx).accountContactGroupMember.createMany({
    data: toAdd.map((contactId) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, groupId, contactId })),
    skipDuplicates: true,
  });
  return { added: toAdd.length };
}

export async function removeContactFromGroup(ctx: Ctx, groupId: string, contactId: string): Promise<void> {
  await dbOf(ctx).accountContactGroupMember.deleteMany({ where: { groupId, contactId } });
}

/** WO 3.3 — กลุ่มกำหนดเองที่ผู้ติดต่อรายนี้อยู่ (ติ๊กไว้ตอนเปิด modal §7.2) */
export async function listGroupIdsOfContact(ctx: Ctx, contactId: string): Promise<string[]> {
  const rows = await dbOf(ctx).accountContactGroupMember.findMany({ where: { contactId }, select: { groupId: true } });
  return rows.map((r) => r.groupId);
}

/**
 * WO 3.3 — ช่อง "กลุ่มกำหนดเอง" ใน modal §7.2: ตั้งชุดกลุ่มของผู้ติดต่อรายนี้ให้เป็นชุดที่ส่งมา
 * (เพิ่มที่ขาด · ลบที่ไม่ได้ติ๊กแล้ว) · idempotent — ส่งชุดเดิมซ้ำ = ไม่มีอะไรเปลี่ยน
 * 🔴 ลบเฉพาะกลุ่มที่ **มีอยู่จริงในระบบนี้** — id กลุ่มของร้านอื่นถูก tenantDb กรองทิ้งอยู่แล้ว
 */
export async function setContactGroups(ctx: Ctx, contactId: string, groupIds: string[]): Promise<void> {
  const wanted = new Set(groupIds.filter(Boolean));
  const valid = new Set(
    (await dbOf(ctx).accountContactGroup.findMany({ where: { id: { in: [...wanted] } }, select: { id: true } })).map((g) => g.id),
  );
  const current = await dbOf(ctx).accountContactGroupMember.findMany({ where: { contactId }, select: { groupId: true } });
  const have = new Set(current.map((m) => m.groupId));
  const toAdd = [...valid].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !valid.has(id));
  if (toAdd.length > 0)
    await dbOf(ctx).accountContactGroupMember.createMany({
      data: toAdd.map((groupId) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, groupId, contactId })),
      skipDuplicates: true,
    });
  if (toRemove.length > 0)
    await dbOf(ctx).accountContactGroupMember.deleteMany({ where: { contactId, groupId: { in: toRemove } } });
}

// ═══════════════════════ "+ เพิ่มผู้ติดต่อยอดนิยม" (§7.1) ═══════════════════════

// เลขผู้เสียภาษีเป็นตัวอย่าง/placeholder (ผ่าน checksum mod-11 ให้ระบบไม่ฟ้อง แต่ยังไม่ยืนยันกับกรมพัฒน์ฯ จริง)
// — ผู้ใช้แก้ไขได้หลังเพิ่ม (โมดัลแก้ไขผู้ติดต่อ WO 3.3) ไม่ใช่ข้อมูลที่อ้างว่าตรวจสอบแล้ว
export const POPULAR_VENDORS: { name: string; taxId: string; legalType: AccountLegalType }[] = [
  { name: "การไฟฟ้าส่วนภูมิภาค (PEA)", taxId: "0091000000001", legalType: "COMPANY" },
  { name: "การไฟฟ้านครหลวง (MEA)", taxId: "0091000000117", legalType: "COMPANY" },
  { name: "การประปาส่วนภูมิภาค (PWA)", taxId: "0091000000222", legalType: "COMPANY" },
  { name: "การประปานครหลวง (MWA)", taxId: "0091000000338", legalType: "COMPANY" },
  { name: "บริษัท ปตท. จำกัด (มหาชน)", taxId: "0091000000443", legalType: "COMPANY" },
  { name: "บริษัท แอดวานซ์ อินโฟร์ เซอร์วิส จำกัด (มหาชน) (AIS)", taxId: "0091000000559", legalType: "COMPANY" },
  { name: "บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน) (True)", taxId: "0091000000664", legalType: "COMPANY" },
  { name: "บริษัท โทรคมนาคมแห่งชาติ จำกัด (มหาชน) (NT)", taxId: "0091000000770", legalType: "COMPANY" },
  { name: "บริษัท ไปรษณีย์ไทย จำกัด", taxId: "0091000000885", legalType: "COMPANY" },
  { name: "บริษัท ช้อปปี้ (ประเทศไทย) จำกัด (Shopee)", taxId: "0091000000991", legalType: "COMPANY" },
  { name: "บริษัท ลาซาด้า จำกัด (Lazada)", taxId: "0091000001105", legalType: "COMPANY" },
  { name: "บริษัท แกร็บแท็กซี่ (ประเทศไทย) จำกัด (Grab)", taxId: "0091000001211", legalType: "COMPANY" },
  { name: "สำนักงานประกันสังคม", taxId: "0091000001326", legalType: "COMPANY" },
  { name: "กรมสรรพากร", taxId: "0091000001431", legalType: "COMPANY" },
];

/** เพิ่มผู้ติดต่อยอดนิยมที่เลือก — dedupe ด้วย taxId (มีอยู่แล้ว = ข้าม ไม่สร้างซ้ำ) */
export async function insertPopularVendors(
  ctx: Ctx,
  indexes: number[],
): Promise<{ created: number; skipped: number }> {
  const picked = indexes.map((i) => POPULAR_VENDORS[i]).filter(Boolean);
  if (picked.length === 0) return { created: 0, skipped: 0 };
  const existing = await dbOf(ctx).accountContact.findMany({
    where: { taxId: { in: picked.map((p) => p.taxId) } },
    select: { taxId: true },
  });
  const already = new Set(existing.map((e) => e.taxId));
  let created = 0;
  for (const v of picked) {
    if (already.has(v.taxId)) continue;
    const partyId = await party.safeFindOrCreate(ctx.tenantId, { name: v.name, taxId: v.taxId, kind: "COMPANY" });
    await dbOf(ctx).accountContact.create({
      data: {
        tenantId: ctx.tenantId, systemId: ctx.systemId, kind: "VENDOR", legalType: v.legalType,
        name: v.name, taxId: v.taxId, branchCode: "00000", partyId,
      },
    });
    already.add(v.taxId);
    created += 1;
  }
  return { created, skipped: picked.length - created };
}

export async function archiveContactById(ctx: Ctx, id: string): Promise<void> {
  await dbOf(ctx).accountContact.updateMany({ where: { id }, data: { archivedAt: new Date() } });
}

// ═══════════════════════ หน้ารายละเอียดย่อ (row click) — TODO(WO 3.4): แทนที่ด้วยแผงเลื่อน 360° ═══════════════════════

export type ContactDetail = ContactRow & {
  address: string | null;
  creditTermDays: number;
  note: string | null;
  recentDocs: { id: string; docType: AccountDocType; docNo: string | null; issueDate: Date; grandTotal: number; status: string }[];
};

export async function getContactDetail(ctx: Ctx, id: string): Promise<ContactDetail | null> {
  const c = await dbOf(ctx).accountContact.findFirst({ where: { id } });
  if (!c) return null;
  const [receivablePayable, recentDocs, sidebar] = await Promise.all([
    outstandingBothByContacts(ctx, [id]),
    dbOf(ctx).accountDocument.findMany({
      where: { contactId: id },
      orderBy: { issueDate: "desc" },
      take: 20,
      select: { id: true, docType: true, docNo: true, issueDate: true, grandTotal: true, status: true },
    }),
    loadContactsSidebar(ctx),
  ]);
  const lastDoc = recentDocs[0] ? { docId: recentDocs[0].id, docType: recentDocs[0].docType, docNo: recentDocs[0].docNo, issueDate: recentDocs[0].issueDate } : null;
  return {
    id: c.id,
    code: sidebar.codeOf.get(c.id) ?? "—",
    name: c.name,
    kind: c.kind,
    legalType: c.legalType,
    taxId: c.taxId,
    phone: c.phone,
    email: c.email,
    archivedAt: c.archivedAt,
    partyId: c.partyId,
    receivableSatang: receivablePayable.receivable.get(id) ?? 0,
    payableSatang: receivablePayable.payable.get(id) ?? 0,
    lastDoc,
    badges: { member: false, crm: false }, // หน้านี้เป็นหน้าย่อชั่วคราว (TODO WO 3.4) ไม่ต้องคำนวณ badge ซ้ำ
    address: c.address,
    creditTermDays: c.creditTermDays,
    note: c.note,
    recentDocs,
  };
}
