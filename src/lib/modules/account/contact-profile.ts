// contact-profile.ts — ชั้นข้อมูลของ "โปรไฟล์ผู้ติดต่อ 360°" (WO 3.4 · DESIGN-SPEC-V2 §7.1)
// เฟรมอ้างอิง: g6-contact-360.png (หน้าเต็ม) · f5-contacts-menu.png (แผงเลื่อนขวา w-560) · g19 (มือถือ 390)
//
// หลักการ:
//   1) **ผลลัพธ์ต้อง serialize ได้** — ฟังก์ชันนี้ถูกเรียกทั้งจาก server component (หน้าเต็ม) และจาก
//      server action ที่ส่งค่ากลับไปให้ client component (แผงเลื่อน) ⇒ วันที่เป็นสตริง ISO ไม่ใช่ Date
//   2) **งบ query ≤ 12** ต่อการเปิด 1 ครั้ง — โหลดเฉพาะแท็บที่เปิดจริง (ดูตาราง "งบ query" ท้ายไฟล์)
//   3) ทุก query ผ่าน `tenantDb` (auto-scope tenant+system · fail-closed) — ไม่ import prisma ตรง (fitness F5.1)
//   4) ไม่ก๊อปสูตรอายุหนี้: เรียก `agingReport` ตัวเดิมโดยส่ง `contactId` (ตัวกรอง optional ที่ WO นี้เพิ่ม)
//   5) 🔴 **แชท**: ไม่มี facade ของโมดูลแชทให้อ่าน (chat/ ไม่มี index.ts) และใบสั่งงานห้ามแตะ `chat/**`
//      ⇒ การ์ด "แชท" เป็น "ยังไม่เชื่อม" เสมอ (ค่าจริง ไม่ใช่ค่าปลอม) — เหมือนที่ WO 3.3 ทำใน modal

import type { AccountContactKind, AccountDocStatus, AccountDocType, AccountLegalType } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import * as memberSvc from "@/lib/modules/member/service";
import * as crmSvc from "@/lib/modules/crm/service";
import { agingReport } from "./reports";
import { docTypeLabel, dayKeyBkk } from "./dashboard";
import { findLinkedSystemIds, listDocumentsPaged, STATUS_LABEL } from "./service";
import { accountTone } from "./ui";
import { editorDetailPath, editorListPath, editorNewPath } from "./doc-editor-config";
import {
  getRegularCustomerRule,
  formatPhoneTh,
  type Ctx,
  type QueryMeter,
  type RegularCustomerRule,
} from "./contacts-list";

export type { Ctx, QueryMeter };

// ─────────────────────────── ชนิดข้อมูลที่ UI ใช้ ───────────────────────────

export type ProfileTab = "info" | "docs" | "files" | "links";

export type ProfileChip = { label: string; tone: "kind" | "regular" | "group" | "archived" };

export type ProfileDocRow = {
  id: string;
  docType: AccountDocType;
  docTypeLabel: string;
  docNo: string | null;
  /** ISO (UTC) — UI แปลงเป็นวันไทยเอง */
  issueDate: string;
  dueDate: string | null;
  grandTotal: number;
  status: AccountDocStatus;
  /** ป้ายไทย + โทนสีของ chip — คิดฝั่ง server เพราะ `STATUS_LABEL` อยู่ใน service.ts (แตะ prisma → client import ไม่ได้) */
  statusLabel: string;
  statusTone: "muted" | "strong" | "danger";
  /** พ้นกำหนดจริงหรือไม่ (คิดฝั่ง server — UI ไม่คิดเอง) */
  overdue: boolean;
  href: string;
};

export type ProfileAgingBucket = { key: string; label: string; satang: number; danger: boolean };

export type ProfileConnection = {
  key: "member" | "crm" | "chat" | "pos";
  title: string;
  /** บรรทัดรายละเอียดใต้ชื่อ — null = ยังไม่เชื่อม */
  detail: string | null;
  linked: boolean;
  /** ป้ายปุ่มบนการ์ด (g6) — null = ไม่มีปุ่ม */
  actionLabel: string | null;
  actionHref: string | null;
  /** ระบบนี้เปิดใช้ในร้านนี้หรือไม่ (ปิด = การ์ดบอก "ร้านนี้ยังไม่ได้เปิดระบบ…") */
  available: boolean;
};

export type ContactProfile = {
  header: {
    id: string;
    code: string;
    name: string;
    avatarLetter: string;
    kind: AccountContactKind;
    kindLabel: string;
    legalType: AccountLegalType;
    legalTypeLabel: string;
    archived: boolean;
    /** ถูกรวมเข้ากับผู้ติดต่อรายอื่นแล้ว (แสดงแถบเตือน + ลิงก์ไปตัวหลัก) */
    mergedIntoId: string | null;
    chips: ProfileChip[];
  };
  info: {
    taxId: string | null;
    branchLabel: string;
    address: string | null;
    phone: string | null;
    phoneDisplay: string | null;
    email: string | null;
    website: string | null;
    lineId: string | null;
    fax: string | null;
    contactPerson: string | null;
    creditTermDays: number;
    priceModeLabel: string;
    whtLabel: string;
    note: string | null;
  };
  kpi: {
    /** ลูกค้า → ค้างรับ · ผู้ขาย → ค้างจ่าย (BOTH = ค้างรับ ตามมุมมองหลักของ §7.1) */
    outstandingLabel: string;
    outstandingSatang: number;
    outstandingDocs: number;
    overdueDocs: number;
    /** true = ยอดค้างต้องเป็นสีแดง (มีใบพ้นกำหนด) */
    outstandingDanger: boolean;
    /** ซื้อสะสมปีนี้ = เงินที่ชำระจริงในปีปฏิทินนี้ (ไม่ใช่ยอดหน้าเอกสาร) */
    paidThisYearSatang: number;
    /** จำนวนครั้ง = จำนวนเอกสารที่มีการชำระในปีนี้ */
    paidDocsThisYear: number;
    year: number;
    creditTermDays: number;
    /** การ์ดใบที่ 4 บนเดสก์ท็อป (g6): "กลุ่มมาตรฐาน" */
    standardGroupLabel: string;
    regularRuleLabel: string;
    isRegular: boolean;
  };
  aging: { buckets: ProfileAgingBucket[]; totalSatang: number; maxSatang: number };
  tabs: { docs: number; files: number };
  recentDocs: ProfileDocRow[];
  /** เติมเมื่อ tab = "docs" เท่านั้น */
  docsTab: {
    rows: ProfileDocRow[];
    total: number;
    page: number;
    pageCount: number;
    docType: AccountDocType | null;
    status: AccountDocStatus | null;
    /** ชนิดเอกสารที่ผู้ติดต่อรายนี้มีจริง (ตัวเลือกในตัวกรอง) */
    docTypeOptions: { value: AccountDocType; label: string; count: number }[];
    statusOptions: { value: AccountDocStatus; label: string; count: number }[];
  } | null;
  /** เติมเมื่อ tab = "files" เท่านั้น */
  filesTab: {
    rows: { id: string; fileName: string; fileUrl: string; sizeBytes: number; createdAt: string; docNo: string | null }[];
  } | null;
  /** เติมเมื่อ tab = "links" เท่านั้น */
  linksTab: { cards: ProfileConnection[] } | null;
  links: {
    contactsHref: string;
    fullPageHref: string;
    editHref: string;
    newInvoiceHref: string;
    remindHref: string;
    ledgerHref: string;
    allDocsHref: string;
  };
};

// ─────────────────────────── ป้ายไทย ───────────────────────────

const KIND_LABEL: Record<AccountContactKind, string> = {
  CUSTOMER: "ลูกค้า",
  VENDOR: "ผู้ขาย",
  BOTH: "ทั้งคู่",
};

const LEGAL_LABEL: Record<AccountLegalType, string> = {
  COMPANY: "นิติบุคคล",
  PERSON: "บุคคลธรรมดา",
};

const AGING_LABELS: { key: keyof typeof AGING_FIELD; label: string; danger: boolean }[] = [
  { key: "notDue", label: "ยังไม่ครบกำหนด", danger: false },
  { key: "d1_30", label: "1–30 วัน", danger: false },
  { key: "d31_60", label: "31–60 วัน", danger: false },
  { key: "d61_90", label: "61–90 วัน", danger: false },
  { key: "d90plus", label: "เกิน 90 วัน", danger: true },
];

const AGING_FIELD = {
  notDue: "notDueSatang",
  d1_30: "d1_30Satang",
  d31_60: "d31_60Satang",
  d61_90: "d61_90Satang",
  d90plus: "d90plusSatang",
} as const;

const PRICE_MODE_LABEL: Record<string, string> = {
  EXCLUDE_VAT: "แยก VAT",
  INCLUDE_VAT: "รวม VAT",
  NO_VAT: "ไม่มี VAT",
};

/** ป้ายกฎ "ลูกค้าประจำ" แบบสั้นสำหรับการ์ด KPI (g6: "ซื้อ ≥3 ครั้ง/ปี") */
export function regularRuleShortLabel(rule: RegularCustomerRule): string {
  const perYear = rule.periodMonths === 12 ? "/ปี" : `/${rule.periodMonths} เดือน`;
  return `ซื้อ ≥${rule.minPaidDocs} ครั้ง${perYear}`;
}

function bumpMeter(meter: QueryMeter | undefined, n = 1) {
  if (meter) meter.count += n;
}

function dbOf(ctx: Ctx, meter?: QueryMeter) {
  const db = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  if (!meter) return db;
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          meter.count += 1;
          return query(args);
        },
      },
    },
  }) as unknown as typeof db;
}

// ─────────────────────────── ตัวหลัก ───────────────────────────

export type ContactProfileInput = {
  tab?: ProfileTab;
  /** ตัวกรองของแท็บ "เอกสาร" */
  docType?: AccountDocType | null;
  status?: AccountDocStatus | null;
  page?: number;
  /** ฐาน URL ของโมดูลบัญชี "/app/sys/<id>/account" */
  base: string;
  asOf?: Date;
  meter?: QueryMeter;
};

const RECENT_DOCS_TAKE = 5;

export async function contactProfile(
  ctx: Ctx,
  contactId: string,
  input: ContactProfileInput,
): Promise<ContactProfile | null> {
  const meter = input.meter;
  const db = dbOf(ctx, meter);
  const base = input.base;
  const asOf = input.asOf ?? new Date();
  const tab: ProfileTab = input.tab ?? "info";

  // [1] ตัวผู้ติดต่อเอง — tenantDb กรอง tenant+system ให้อยู่แล้ว (id ของร้านอื่น = null ไม่ใช่ข้อมูลรั่ว)
  const c = await db.accountContact.findFirst({ where: { id: contactId } });
  if (!c) return null;

  const isCustomerView = c.kind !== "VENDOR";
  const direction = isCustomerView ? "OUT" : "IN";

  const rule = await getRegularCustomerRule(ctx, meter); // [2]

  const [code, groupRows, aging, paidWindows, typeGroups, filesTotal, recentRows] = await Promise.all([
    // [2] เลขที่ — WO 3.3 เก็บจริงในคอลัมน์ `code` · แถวเก่ายังไม่ backfill = คำนวณลำดับสด (1 count)
    resolveContactCode(ctx, { id: c.id, code: c.code, createdAt: c.createdAt }, meter),
    // [3] กลุ่มกำหนดเองที่รายนี้อยู่
    db.accountContactGroup.findMany({
      where: { members: { some: { contactId: c.id } } },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    // [4] อายุหนี้ของรายนี้ — สูตรเดียวกับรายงานอายุหนี้ทั้งระบบ (ไม่ก๊อป)
    (async () => {
      bumpMeter(meter);
      return agingReport(ctx, { direction, asOf, contactId: c.id });
    })(),
    // [5] เงินที่ชำระจริง — **query เดียว** ครอบทั้ง "ปีนี้" (KPI) และ "ช่วงกฎลูกค้าประจำ"
    //     (ดึงตั้งแต่วันที่เก่ากว่าของทั้งสองช่วง แล้วแยกนับใน JS — ไม่ยิง 2 รอบ)
    paidSummaries(ctx, c.id, direction, asOf, rule.periodMonths, meter),
    // [6] ตัวเลขแท็บ "เอกสาร n" + ตัวเลือกตัวกรองชนิด (groupBy เดียวได้ทั้งสองอย่าง — ไม่ต้อง count แยก)
    db.accountDocument.groupBy({ by: ["docType"], where: { contactId: c.id }, _count: { _all: true } }),
    // [7] ตัวเลขแท็บ "ไฟล์แนบ n" — ไฟล์ที่แนบกับเอกสารของผู้ติดต่อรายนี้
    db.accountAttachment.count({ where: { document: { is: { contactId: c.id } } } }),
    // [8] เอกสาร 5 รายการล่าสุด — ไม่โหลดตอนอยู่แท็บ "เอกสาร" (ตารางเต็มอยู่ตรงนั้นแล้ว การ์ดย่อจะซ้ำซ้อน
    //     และงบ query ของแท็บนั้นตึงสุด) ⇒ UI ซ่อนการ์ดนี้บนแท็บเอกสาร (จดเป็นความต่างจาก g6 ใน wo-notes)
    tab === "docs"
      ? Promise.resolve([] as DocRowRaw[])
      : db.accountDocument.findMany({
          where: { contactId: c.id },
          orderBy: [{ issueDate: "desc" }, { id: "desc" }],
          take: RECENT_DOCS_TAKE,
          select: DOC_ROW_SELECT,
        }),
  ]);

  const docsTotal = typeGroups.reduce((s, g) => s + g._count._all, 0);
  const isRegular =
    isCustomerView &&
    (paidWindows.rule.docs >= rule.minPaidDocs || paidWindows.rule.satang >= rule.minPaidTotalSatang);

  const agingRow = aging.rows.find((r) => r.contactId === c.id);
  const counts = aging.docCounts.get(c.id) ?? { docs: 0, overdueDocs: 0 };
  const buckets: ProfileAgingBucket[] = AGING_LABELS.map((b) => ({
    key: b.key,
    label: b.label,
    satang: agingRow ? agingRow[AGING_FIELD[b.key]] : 0,
    danger: b.danger,
  }));
  const maxSatang = buckets.reduce((m, b) => Math.max(m, b.satang), 0);

  const chips: ProfileChip[] = [
    { label: KIND_LABEL[c.kind], tone: "kind" as const },
    ...(isRegular ? [{ label: "ลูกค้าประจำ", tone: "regular" as const }] : []),
    ...groupRows.map((g) => ({ label: g.name, tone: "group" as const })),
    ...(c.archivedAt ? [{ label: "ปิดใช้งาน", tone: "archived" as const }] : []),
  ];

  const docHref = (d: { id: string; docType: AccountDocType }) => editorDetailPath(base, d.docType, d.id);

  const profile: ContactProfile = {
    header: {
      id: c.id,
      code,
      name: c.name,
      avatarLetter: avatarLetterOf(c.name),
      kind: c.kind,
      kindLabel: KIND_LABEL[c.kind],
      legalType: c.legalType,
      legalTypeLabel: LEGAL_LABEL[c.legalType],
      archived: c.archivedAt !== null,
      mergedIntoId: c.mergedIntoId,
      chips,
    },
    info: {
      taxId: c.taxId,
      branchLabel: branchLabelOf(c.officeType, c.branchCode, c.branchName),
      address: c.address,
      phone: c.phone,
      phoneDisplay: c.phone ? formatPhoneTh(c.phone) : null,
      email: c.email,
      website: c.website,
      lineId: c.lineId,
      fax: c.fax,
      contactPerson: c.contactPerson,
      creditTermDays: c.creditTermDays,
      priceModeLabel: c.defaultPriceMode ? PRICE_MODE_LABEL[c.defaultPriceMode] ?? c.defaultPriceMode : "ราคาปกติ",
      whtLabel: whtLabelOf(c.defaultWhtType, c.defaultWhtRateBp),
      note: c.note,
    },
    kpi: {
      outstandingLabel: isCustomerView ? "ค้างรับ" : "ค้างจ่าย",
      outstandingSatang: agingRow?.totalSatang ?? 0,
      outstandingDocs: counts.docs,
      overdueDocs: counts.overdueDocs,
      outstandingDanger: counts.overdueDocs > 0,
      paidThisYearSatang: paidWindows.year.satang,
      paidDocsThisYear: paidWindows.year.docs,
      year: Number(dayKeyBkk(asOf).slice(0, 4)),
      creditTermDays: c.creditTermDays,
      standardGroupLabel: isRegular ? "ลูกค้าประจำ" : KIND_LABEL[c.kind],
      regularRuleLabel: regularRuleShortLabel(rule),
      isRegular,
    },
    aging: { buckets, totalSatang: agingRow?.totalSatang ?? 0, maxSatang },
    tabs: { docs: docsTotal, files: filesTotal },
    recentDocs: recentRows.map((d) => toDocRow(d, asOf, docHref(d))),
    docsTab: null,
    filesTab: null,
    linksTab: null,
    links: {
      contactsHref: `${base}/contacts`,
      fullPageHref: `${base}/contacts/${c.id}`,
      editHref: `${base}/contacts?edit=${c.id}`,
      newInvoiceHref: `${editorNewPath(base, "INVOICE")}?contactId=${c.id}`,
      // WO 1.9 มี "ใบแจ้งเตือน/ตัวเตือน" ที่หน้าเอกสารประจำ — จนกว่าจะมีหน้าส่งเตือนต่อราย
      // ใช้ตัวกรองผู้ติดต่อบนหน้ารายการใบแจ้งหนี้ค้างชำระ (ปลายทางจริง ไม่ใช่ปุ่มตาย)
      remindHref: `${editorListPath(base, "INVOICE")}?contactId=${c.id}&tab=overdue&remind=1`,
      ledgerHref: `${base}/ledger?account=${isCustomerView ? "1100" : "2000"}&contactId=${c.id}`,
      allDocsHref: `${base}/contacts/${c.id}?tab=docs`,
    },
  };

  if (tab === "docs") {
    // [9..12] ตารางเอกสารทุกชนิด + ตัวกรอง (ใช้ listDocumentsPaged ตัวเดิม — WO นี้ขยายให้รับหลายชนิด)
    // listDocumentsPaged ยิง 4 SQL ในตัว (findMany + count + groupBy สถานะ + count พ้นกำหนด)
    // `slim` = ไม่ include contact/payments (รู้ผู้ติดต่ออยู่แล้ว) → ประหยัดอีก 2 SQL
    bumpMeter(meter, 4);
    const paged = await listDocumentsPaged(ctx.tenantId, ctx.systemId, {
      docType: input.docType ?? undefined,
      contactId: c.id,
      status: input.status ?? "ALL",
      page: input.page,
      pageSize: 10,
      sort: "issueDate",
      slim: true,
    });
    profile.docsTab = {
      rows: paged.rows.map((d) => toDocRow(d, asOf, docHref(d))),
      total: paged.total,
      page: paged.page,
      pageCount: paged.pageCount,
      docType: input.docType ?? null,
      status: input.status ?? null,
      docTypeOptions: typeGroups
        .map((g) => ({ value: g.docType, label: docTypeLabel(g.docType), count: g._count._all }))
        .sort((a, b) => b.count - a.count),
      statusOptions: Object.entries(paged.tabCounts)
        .filter(([k, v]) => k !== "ALL" && k !== "OVERDUE" && (v ?? 0) > 0)
        .map(([k, v]) => ({ value: k as AccountDocStatus, label: STATUS_LABEL[k as AccountDocStatus] ?? k, count: v ?? 0 })),
    };
  }

  if (tab === "files") {
    // [11] ไฟล์แนบทั้งหมดของเอกสารรายนี้
    const rows = await db.accountAttachment.findMany({
      where: { document: { is: { contactId: c.id } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        sizeBytes: true,
        createdAt: true,
        document: { select: { docNo: true } },
      },
    });
    profile.filesTab = {
      rows: rows.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        fileUrl: r.fileUrl,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt.toISOString(),
        docNo: r.document?.docNo ?? null,
      })),
    };
  }

  if (tab === "links") {
    profile.linksTab = { cards: await loadConnections(ctx, c, base, meter) };
  }

  return profile;
}

// ─────────────────────────── ชิ้นส่วน ───────────────────────────

const DOC_ROW_SELECT = {
  id: true,
  docType: true,
  docNo: true,
  issueDate: true,
  dueDate: true,
  grandTotal: true,
  paidTotal: true,
  status: true,
  voidedAt: true,
} as const;

type DocRowRaw = {
  id: string;
  docType: AccountDocType;
  docNo: string | null;
  issueDate: Date;
  dueDate: Date | null;
  grandTotal: number;
  paidTotal: number;
  status: AccountDocStatus;
  voidedAt: Date | null;
};

const OVERDUE_STATUSES: AccountDocStatus[] = ["AWAITING_PAYMENT", "PARTIAL"];

function toDocRow(d: DocRowRaw, asOf: Date, href: string): ProfileDocRow {
  const due = d.dueDate ?? d.issueDate;
  const overdue =
    d.voidedAt === null &&
    OVERDUE_STATUSES.includes(d.status) &&
    d.grandTotal - d.paidTotal > 0 &&
    due.getTime() < asOf.getTime();
  return {
    id: d.id,
    docType: d.docType,
    docTypeLabel: docTypeLabel(d.docType),
    docNo: d.docNo,
    issueDate: d.issueDate.toISOString(),
    dueDate: d.dueDate ? d.dueDate.toISOString() : null,
    grandTotal: d.grandTotal,
    status: d.status,
    statusLabel: STATUS_LABEL[d.status] ?? d.status,
    statusTone: accountTone(d.status),
    overdue,
    href,
  };
}

/** ตัวอักษรบน avatar (g6/g19: "ป") — ตัดคำนำหน้าไทยที่พบบ่อยออกก่อน */
export function avatarLetterOf(name: string): string {
  const cleaned = name
    .trim()
    .replace(/^(บริษัท|บจก\.|หจก\.|บมจ\.|ห้างหุ้นส่วนจำกัด|คุณ|นาย|นาง|นางสาว|น\.ส\.)\s*/u, "")
    .trim();
  return (cleaned || name.trim()).slice(0, 1) || "?";
}

function branchLabelOf(officeType: string | null, branchCode: string | null, branchName: string | null): string {
  if (officeType === "HQ") return "สำนักงานใหญ่";
  if (officeType === "BRANCH") return `สาขา ${branchCode ?? "—"}${branchName ? ` (${branchName})` : ""}`;
  if (branchCode && branchCode !== "00000") return `สาขา ${branchCode}`;
  return "—";
}

function whtLabelOf(type: string | null, rateBp: number | null): string {
  if (!type && !rateBp) return "ไม่มี";
  const pct = rateBp != null ? `${(rateBp / 100).toFixed(rateBp % 100 === 0 ? 0 : 2)}%` : null;
  return [type, pct].filter(Boolean).join(" · ") || "ไม่มี";
}

/** เลขที่ "C00019" — ใช้คอลัมน์จริงถ้ามี · ไม่มีก็นับลำดับ createdAt (1 count ไม่ใช่โหลดทั้งตาราง) */
async function resolveContactCode(
  ctx: Ctx,
  c: { id: string; code: string | null; createdAt: Date },
  meter?: QueryMeter,
): Promise<string> {
  if (c.code) return c.code;
  const before = await dbOf(ctx, meter).accountContact.count({ where: { createdAt: { lt: c.createdAt } } });
  return `C${String(before + 1).padStart(5, "0")}`;
}

export type PaidSummary = { satang: number; docs: number };

/** ต้นปีปฏิทิน **เวลาไทย** (กันเพี้ยนปีบนเครื่อง UTC — บทเรียน getDay() ของ dashboard) */
export function yearStartBkk(asOf: Date): Date {
  return new Date(`${dayKeyBkk(asOf).slice(0, 4)}-01-01T00:00:00+07:00`);
}

/**
 * เงินที่ชำระจริงของผู้ติดต่อรายนี้ 2 ช่วงในคราวเดียว (1 query):
 *   - `year` = ปีปฏิทินนี้ (KPI "ซื้อสะสมปีนี้" / "จำนวนครั้ง")
 *   - `rule` = ช่วงของกฎ "ลูกค้าประจำ" (ปกติ 12 เดือนล่าสุด)
 * นับ **เงินที่เข้าจริง** ไม่ใช่ยอดหน้าเอกสาร (เอกสาร PARTIAL ก็มีเงินเข้าแล้วบางส่วน)
 * — นิยามเดียวกับ `regularCustomerContactIds` ของหน้ารายการ (contacts-list.ts)
 */
async function paidSummaries(
  ctx: Ctx,
  contactId: string,
  direction: "OUT" | "IN",
  asOf: Date,
  ruleMonths: number,
  meter?: QueryMeter,
): Promise<{ year: PaidSummary; rule: PaidSummary }> {
  const yearFrom = yearStartBkk(asOf);
  const ruleFrom = new Date(asOf);
  ruleFrom.setMonth(ruleFrom.getMonth() - ruleMonths);
  const from = yearFrom < ruleFrom ? yearFrom : ruleFrom;

  const rows = await dbOf(ctx, meter).accountDocumentPayment.findMany({
    where: {
      voidedAt: null,
      paidAt: { gte: from },
      document: { is: { contactId, direction, voidedAt: null } },
    },
    select: { documentId: true, amount: true, paidAt: true },
  });

  const acc = (min: Date): PaidSummary => {
    const docs = new Set<string>();
    let satang = 0;
    for (const r of rows) {
      if (r.paidAt < min) continue;
      docs.add(r.documentId);
      satang += r.amount;
    }
    return { satang, docs: docs.size };
  };
  return { year: acc(yearFrom), rule: acc(ruleFrom) };
}

/** แท็บ "การเชื่อมต่อ" (g6) — สมาชิก · CRM · แชท · POS · ≤4 query */
async function loadConnections(
  ctx: Ctx,
  c: { id: string; partyId: string | null },
  base: string,
  meter?: QueryMeter,
): Promise<ProfileConnection[]> {
  bumpMeter(meter);
  const { memberSystemId, crmSystemId } = await findLinkedSystemIds(ctx.tenantId);
  const partyId = c.partyId;

  const [customer, crmContact] = await Promise.all([
    memberSystemId && partyId
      ? (bumpMeter(meter), memberSvc.findCustomerByPartyId(ctx.tenantId, memberSystemId, partyId))
      : Promise.resolve(null),
    crmSystemId && partyId
      ? (bumpMeter(meter), crmSvc.findContactByPartyId({ tenantId: ctx.tenantId, systemId: crmSystemId }, partyId))
      : Promise.resolve(null),
  ]);

  const deal =
    crmSystemId && crmContact
      ? (bumpMeter(meter), await crmSvc.findLatestDealForContact({ tenantId: ctx.tenantId, systemId: crmSystemId }, crmContact.id))
      : null;

  const baht = (satang: number) =>
    `฿${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return [
    {
      key: "member",
      title: "สมาชิก",
      detail: customer
        ? `#${customer.memberCode ?? customer.id.slice(-6)} · ระดับ ${customer.tier}`
        : null,
      linked: !!customer,
      actionLabel: customer ? "แยก" : null,
      actionHref: customer ? `${base}/contacts?edit=${c.id}#links` : null,
      available: !!memberSystemId,
    },
    {
      key: "crm",
      title: "CRM",
      detail: deal ? `ดีล “${deal.title}” · ขั้น ${deal.stageName}` : crmContact ? "เชื่อมแล้ว · ยังไม่มีดีล" : null,
      linked: !!crmContact,
      actionLabel: deal ? "เปิดดีล" : null,
      actionHref: deal && crmSystemId ? `/app/sys/${crmSystemId}/crm/deals/${deal.id}` : null,
      available: !!crmSystemId,
    },
    {
      // 🔴 ยังไม่เชื่อม "จริง": โมดูลแชทไม่มี facade ให้อ่าน + ใบสั่งงานห้ามแตะ chat/**
      //    (ChatContact.partyId มีคอลัมน์แล้วตั้งแต่ WO 3.1 แต่ยังไม่มีโค้ดฝั่งแชทเขียนค่า)
      key: "chat",
      title: "แชท",
      detail: null,
      linked: false,
      actionLabel: null,
      actionHref: null,
      available: false,
    },
    {
      key: "pos",
      title: "POS",
      // ยอด/จำนวนครั้งหน้าร้านสะสมอยู่บนแถวสมาชิก (member.recordSpend ถูกเรียกโดย pos.createSale)
      detail: customer ? `ซื้อหน้าร้าน ${customer.visitCount} ครั้ง · ${baht(customer.totalSpentSatang)}` : null,
      linked: !!customer && customer.visitCount > 0,
      actionLabel: null,
      actionHref: null,
      available: !!memberSystemId,
    },
  ];
}

// ─────────────────────────── งบ query (ยืนยันด้วย qc-acc-v2-contact-profile.mts P-budget) ───────────────────────────
// ฐาน (ทุกแท็บ): contact 1 · rule 1 · code 0–1 (0 เมื่อคอลัมน์ `code` มีค่า = หลัง backfill) · groups 1
//                · aging 1 · payments 1 · groupBy ชนิด 1 · files count 1 · recent 1 = **8** (9 ถ้าไม่มี code)
//   + แท็บ ข้อมูล      : +0 → 8
//   + แท็บ เอกสาร      : +4 (listDocumentsPaged) → 12
//   + แท็บ ไฟล์แนบ     : +1 → 9
//   + แท็บ การเชื่อมต่อ : +≤4 (systems · member · crm contact · crm deal) → ≤12
// เพดานของใบสั่งงาน = 12 ⇒ ผ่านทุกแท็บ
