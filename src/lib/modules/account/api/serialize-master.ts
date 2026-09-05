// serialize-master.ts — ตัวแปลง "ของภายใน" → "ของที่ส่งออกทาง REST" ของผู้ติดต่อ/สินค้า (WO B2)
//
// กติกาเหมือน `serialize.ts` ของ B1 เป๊ะ (อ่านหัวไฟล์นั้นก่อนแก้ที่นี่):
//   1) ห้าม spread แถว prisma — เขียนชื่อฟิลด์ทีละตัวเสมอ (ห้ามมี tenantId/systemId/partyId ที่ไม่จำเป็น/
//      href/base/keyHash หลุดออก — `partyId` ของผู้ติดต่อเองไม่ใช่ความลับ แต่ระบบภายในเป็น)
//   2) เงินลงท้าย `Satang` เสมอ (ชื่อภายในหลายตัวเป็น `salePrice`/`buyPrice`/`unitCost` เฉย ๆ)
//   3) วันที่ = วันไทย `YYYY-MM-DD` ผ่าน `ymd()` ตัวเดียวกับ B1 (คนละไฟล์แต่สูตรเดียวกันเป๊ะ)

import type { AccountProduct } from "@prisma/client";
import type { ContactRow } from "../contacts-list";
import type { ContactProfile } from "../contact-profile";
import type { MergeCandidate, MergeCandidateContact } from "../contact-merge";
import type { LinkSuggestion, LinkSuggestions } from "../contact-links";
import type {
  BundleComponentRow,
  listCategories,
  listOpeningLots,
  listUnits,
  productMovements,
} from "../product";
import type { ListDocumentsPage } from "../service";
import { docRow, ymd } from "./serialize";

// ── ผู้ติดต่อ: แถวในรายการ ──────────────────────────────────────────────────
export function contactRow(r: ContactRow) {
  const outstandingSatang = r.kind === "VENDOR" ? r.payableSatang : r.receivableSatang;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    legalType: r.legalType,
    taxId: r.taxId,
    phone: r.phone,
    email: r.email,
    archived: r.archivedAt !== null,
    partyId: r.partyId,
    receivableSatang: r.receivableSatang,
    payableSatang: r.payableSatang,
    outstandingSatang,
    lastDocument: r.lastDoc
      ? { id: r.lastDoc.docId, type: r.lastDoc.docType, docNo: r.lastDoc.docNo, issueDate: ymd(r.lastDoc.issueDate) }
      : null,
    badges: { member: r.badges.member, crm: r.badges.crm },
  };
}

// ── ผู้ติดต่อ: โปรไฟล์ 1 ราย ─────────────────────────────────────────────────
/**
 * `p` มาจาก `contactProfile(ctx, id, { tab: "links", base: "" })` เสมอ (เรียก tab "links" เพื่อให้
 * `linksTab.cards` มีค่า — header/info/kpi คำนวณไม่ขึ้นกับ tab อยู่แล้ว) · `docs` มาจาก `listDocumentsPaged`
 * แยกต่างหาก (ล่าสุด ≤10 ใบ รูปแบบ DocRow เดียวกับ B1 — ไม่ใช้ `p.recentDocs` ที่จำกัด 5 ใบและคนละ shape)
 */
export function contactProfileView(
  p: ContactProfile,
  groups: { id: string; name: string }[],
  docs: ListDocumentsPage["rows"],
) {
  const cardByKey = new Map((p.linksTab?.cards ?? []).map((c) => [c.key, c] as const));
  return {
    header: {
      id: p.header.id,
      code: p.header.code,
      name: p.header.name,
      kind: p.header.kind,
      legalType: p.header.legalType,
      archived: p.header.archived,
      mergedIntoId: p.header.mergedIntoId,
    },
    info: {
      taxId: p.info.taxId,
      branchCode: p.info.branchCode,
      branchLabel: p.info.branchLabel,
      address: p.info.address,
      phone: p.info.phone,
      email: p.info.email,
      website: p.info.website,
      lineId: p.info.lineId,
      fax: p.info.fax,
      contactPerson: p.info.contactPerson,
      creditTermDays: p.info.creditTermDays,
      note: p.info.note,
    },
    kpi: {
      outstandingSatang: p.kpi.outstandingSatang,
      outstandingDocs: p.kpi.outstandingDocs,
      overdueDocs: p.kpi.overdueDocs,
      paidThisYearSatang: p.kpi.paidThisYearSatang,
      paidDocsThisYear: p.kpi.paidDocsThisYear,
      year: p.kpi.year,
    },
    documents: docs.map(docRow),
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    links: {
      member: cardByKey.get("member")?.linked ?? false,
      crm: cardByKey.get("crm")?.linked ?? false,
      chat: cardByKey.get("chat")?.linked ?? false,
    },
  };
}

// ── ผู้ติดต่อ: คู่ซ้ำที่อาจรวมกัน ────────────────────────────────────────────
function mergeContactView(c: MergeCandidateContact) {
  return { id: c.id, name: c.name, code: c.code };
}

export function mergeCandidateView(m: MergeCandidate) {
  return {
    pairKey: m.key,
    a: mergeContactView(m.a),
    b: mergeContactView(m.b),
    reason: m.reason,
    similarity: m.similarity,
  };
}

// ── ผู้ติดต่อ: ข้อเสนอเชื่อมกับสมาชิก/CRM ────────────────────────────────────
function linkSuggestionView(s: LinkSuggestion) {
  return { id: s.id, label: s.label, reason: s.reason, linked: s.linked, partyId: s.partyId };
}

export function linkSuggestionsView(s: LinkSuggestions) {
  return {
    member: s.member.map(linkSuggestionView),
    crm: s.crm.map(linkSuggestionView),
    chat: s.chat,
    available: s.available,
  };
}

// ── สินค้า: แถวในรายการ ──────────────────────────────────────────────────────
export type ProductListRowLike = {
  id: string;
  code: string | null;
  sku: string | null;
  name: string;
  type: AccountProduct["type"];
  unitName: string | null;
  category: string | null;
  salePrice: number | null;
  buyPrice: number | null;
  stock: number;
  invItemId: string | null;
  archivedAt: Date | null;
};

export function productRow(p: ProductListRowLike) {
  return {
    id: p.id,
    code: p.code,
    sku: p.sku,
    name: p.name,
    type: p.type,
    unitName: p.unitName,
    category: p.category,
    salePriceSatang: p.salePrice,
    buyPriceSatang: p.buyPrice,
    onHand: p.stock,
    // ไม่มีคอลัมน์ `trackStock` แยก — "ติดตามสต็อกในคลัง" = ผูก InvItem แล้ว (ดูคอมเมนต์ schema account_gl.prisma)
    trackStock: p.invItemId !== null,
    archived: p.archivedAt !== null,
    invItemId: p.invItemId,
  };
}

// ── สินค้า: รายละเอียด 1 ตัว ─────────────────────────────────────────────────
type LedgerAccountLite = { id: string; code: string; name: string };

/** ก้อนที่ `productModalData` คืน (ตัด null ทิ้งก่อนเรียกทางนี้เสมอ — 404 อยู่ที่ handler) */
type ProductModalDataOk = {
  product: AccountProduct;
  bundleItems: BundleComponentRow[];
  openingLots: Awaited<ReturnType<typeof listOpeningLots>>;
  item: { id: string; sku: string; reorderPoint: number; costSatang: number; onHand: number; locationName: string | null } | null;
};

function bundleComponentView(b: BundleComponentRow) {
  return {
    component: { id: b.componentProductId, name: b.name, sku: b.sku, type: b.type },
    qty: b.qty,
    buyPriceSatang: b.buyPrice,
    salePriceSatang: b.salePrice,
  };
}

function openingLotView(l: ProductModalDataOk["openingLots"][number]) {
  return {
    id: l.id,
    seq: l.seq,
    qty: Number(l.qty),
    unitCostSatang: l.unitCost,
    date: ymd(l.lotDate),
    // schema `AccountProductOpeningLot` ไม่มีคอลัมน์ข้อความกำกับ lot — คงที่ null (ไม่ใช่ค่าที่หายไปเพราะบั๊ก)
    note: null as string | null,
  };
}

export function productDetailView(
  data: ProductModalDataOk,
  unitName: string | null,
  incomeAccounts: LedgerAccountLite[],
  expenseAccounts: LedgerAccountLite[],
) {
  const p = data.product;
  const income = p.incomeAccountId ? (incomeAccounts.find((a) => a.id === p.incomeAccountId) ?? null) : null;
  const expense = p.expenseAccountId ? (expenseAccounts.find((a) => a.id === p.expenseAccountId) ?? null) : null;
  return {
    product: {
      id: p.id,
      code: p.code,
      sku: p.sku,
      name: p.name,
      type: p.type,
      unitName,
      category: p.category,
      salePriceSatang: p.salePrice,
      buyPriceSatang: p.buyPrice,
      onHand: data.item ? data.item.onHand : Number(p.qtyOnHand),
      trackStock: p.invItemId !== null,
      archived: p.archivedAt !== null,
      invItemId: p.invItemId,
      description: p.description,
      vatRateBp: p.vatRateBp,
      incomeAccount: income ? { code: income.code, name: income.name } : null,
      expenseAccount: expense ? { code: expense.code, name: expense.name } : null,
    },
    bundleItems: data.bundleItems.map(bundleComponentView),
    openingLots: data.openingLots.map(openingLotView),
    inventory: {
      linked: !!data.item,
      item: data.item
        ? {
            id: data.item.id,
            sku: data.item.sku,
            onHand: data.item.onHand,
            reorderPoint: data.item.reorderPoint,
            costSatang: data.item.costSatang,
            locationName: data.item.locationName,
          }
        : null,
    },
  };
}

export function bundleItemsView(rows: BundleComponentRow[]) {
  return rows.map(bundleComponentView);
}

export function openingLotsView(rows: Awaited<ReturnType<typeof listOpeningLots>>) {
  return rows.map(openingLotView);
}

export function movementView(m: Awaited<ReturnType<typeof productMovements>>[number]) {
  return {
    documentId: m.documentId,
    docNo: m.docNo,
    type: m.docType,
    date: ymd(m.issueDate),
    qty: m.qty,
    unitCostSatang: m.unitCost,
  };
}

// ── หน่วย / กลุ่มจัดประเภท ────────────────────────────────────────────────────
export function unitView(u: Awaited<ReturnType<typeof listUnits>>[number]) {
  return { id: u.id, code: u.code, name: u.name, nameEn: u.nameEn, kind: u.kind, archived: u.archivedAt !== null };
}

export function categoryView(c: Awaited<ReturnType<typeof listCategories>>[number], appliesTo: string[]) {
  return { id: c.id, name: c.name, appliesTo, archived: c.archivedAt !== null };
}
