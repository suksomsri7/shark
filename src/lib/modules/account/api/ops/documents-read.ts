// ops/documents-read.ts — READ ของงานเอกสาร/แดชบอร์ด/ภาพรวม (WO B1)
//
// ทุก op ที่นี่ `kind: "read"` + `action: "account.doc.view"` ⇒ ไม่กันซ้ำ ไม่เขียน audit ไม่แตะข้อมูล
// (รวม `POST /documents/parse` ด้วย — มันเป็น POST เพราะข้อความยาวเกินจะใส่ query string ไม่ใช่เพราะมันเขียนอะไร
//  dispatch ตัดสินจาก `op.kind` ไม่ใช่ method ⇒ ไม่ต้องมี Idempotency-Key)
//
// 🔴 ชั้นนี้ **ห้ามแตะ prisma ตรง ๆ** — เรียกผ่าน service เท่านั้น (fitness F5) และห้ามคืนแถวดิบ
//    ทุกก้อนต้องผ่าน `../serialize.ts` (ดูกติกา 3 ข้อในหัวไฟล์นั้น)
//
// เรื่องที่พลาดง่ายและถูกดักไว้ตรงนี้:
//   · query string เป็น "สตริงเสมอ" ⇒ ตัวเลขต้อง `z.coerce` ไม่งั้น `page=2` ไม่มีทางผ่าน schema
//   · `type` ผิด/`from` ผิดรูป ต้องเด้ง 422 พร้อมบอกช่อง ไม่ใช่คืนรายการว่างเงียบ ๆ (ผู้เรียกจะดีบักไม่ได้)
//   · `pageSize` เกิน 100 **ไม่ใช่** ความผิด — หนีบลงมาให้ (คนขอเยอะ ๆ คือคนอยากได้ครบ ไม่ใช่คนพิมพ์ผิด)

import { AccountDocStatus, AccountDocType } from "@prisma/client";
import { z } from "zod";
import { dayKeyBkk, dashboardSnapshot, monthEndExclusive, monthlySeries } from "../../dashboard";
import { issuableDocTypes } from "../../dashboard-home";
import { getDocDetailData } from "../../doc-detail";
import { sideOf } from "../../doc-editor-config";
import { ERR } from "../../errors";
import { LIST_TABS, tabToFilter } from "../../list-tabs";
import { listDocumentAttachmentFiles } from "../../attachment";
import { loadOverview } from "../../overview";
import { parseQuickCreateQuery } from "../../quick-create-parse";
import {
  computeListTabCounts,
  getDocFavorites,
  getDocRef,
  getRecurringRule,
  getSettings,
  listDocumentsPaged,
  listRecurringRules,
  listRecurringRuns,
  listUsedTags,
  searchContactPickerRows,
  type DocStatusFilter,
  type ListDocumentsInput,
} from "../../service";
import { defineOp, type ApiOp } from "../op";
import { paged } from "../respond";
import { attachmentView, docDetail, docRow, dashboardView, iso, overviewView, seriesView } from "../serialize";

// ── ค่าที่รับได้ในตัวกรอง ───────────────────────────────────────────────────
const DOC_TYPES = new Set<string>(Object.values(AccountDocType));
const DOC_STATUSES = new Set<string>(Object.values(AccountDocStatus));
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const ymdField = (what: string) =>
  z.string().regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`).describe(`${what} (Thai calendar day, YYYY-MM-DD).`);

/** "INVOICE" หรือ "INVOICE,RECEIPT" → รายการชนิดเอกสาร (ตัวว่าง = ไม่กรอง) */
function splitTypes(raw: string | undefined): AccountDocType[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AccountDocType[];
}

/** `status` ของ query → ตัวกรองของ service ("ALL"/"OVERDUE"/สถานะเดี่ยว/หลายสถานะคั่นด้วย ,) */
function parseStatus(raw: string | undefined): DocStatusFilter | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1 && (parts[0] === "ALL" || parts[0] === "OVERDUE")) return parts[0];
  return (parts.length === 1 ? parts[0] : parts) as DocStatusFilter;
}

const listInput = z
  .object({
    type: z.string().max(400).optional().describe("Document type, or several separated by commas, for example `INVOICE,RECEIPT`. Omit for every type."),
    tab: z.string().max(40).optional().describe("Status tab of that document type, for example `paid` or `overdue`. Only valid together with exactly one `type`."),
    status: z.string().max(200).optional().describe("Filter by status instead of a tab: one status, several separated by commas, or `OVERDUE` / `ALL`."),
    q: z.string().max(200).optional().describe("Free text: document number or contact name."),
    contactId: z.string().max(40).optional().describe("Only documents of this contact."),
    refType: z.string().max(60).optional().describe("Source model name of documents that flowed in from another system, for example `PosSale`."),
    refId: z.string().max(60).optional().describe("Id of the source record inside that system. Use together with `refType`."),
    from: ymdField("from").optional(),
    to: ymdField("to").optional(),
    page: z.coerce.number().int().min(1).optional().describe("Page number, 1 based. Default 1."),
    pageSize: z.coerce.number().int().optional().describe("Rows per page. Default 20, maximum 100; a larger value is clamped, not rejected."),
    sort: z.enum(["recent", "issueDate", "docNo", "amount"]).optional().describe("Sort order. Default `recent` (last updated first)."),
  })
  .strict()
  .superRefine((v, ctx) => {
    const types = splitTypes(v.type);
    for (const t of types) {
      if (!DOC_TYPES.has(t)) {
        ctx.addIssue({ code: "custom", path: ["type"], message: `ไม่รู้จักชนิดเอกสาร "${t}"` });
      }
    }
    if (v.status) {
      for (const s of v.status.split(",").map((x) => x.trim()).filter(Boolean)) {
        if (s === "ALL" || s === "OVERDUE" || DOC_STATUSES.has(s)) continue;
        ctx.addIssue({ code: "custom", path: ["status"], message: `ไม่รู้จักสถานะ "${s}"` });
      }
    }
    if (v.tab === undefined) return;
    // แท็บผูกกับชุดสถานะของชนิดเอกสารหนึ่งชนิด ⇒ ถามหลายชนิดพร้อมกันแล้วขอแท็บ = คำถามที่ไม่มีคำตอบ
    if (types.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["tab"], message: "ใช้ tab ได้เมื่อระบุ type ชนิดเดียวเท่านั้น" });
      return;
    }
    const tabs = LIST_TABS[types[0]!] ?? [];
    if (!tabs.some((t) => t.key === v.tab)) {
      ctx.addIssue({
        code: "custom",
        path: ["tab"],
        message: `ไม่รู้จักแท็บ "${v.tab}" ของ ${types[0]} (ใช้ได้: ${tabs.map((t) => t.key).join(", ") || "ไม่มี"})`,
      });
    }
  });

const documentsList = defineOp({
  id: "documents.list",
  method: "GET",
  path: "/documents",
  kind: "read",
  action: "account.doc.view",
  paged: true,
  summary: "List documents of any type (sales and purchase side) with filters, paging and tab counters.",
  label: "รายการเอกสาร",
  tool: { name: "account_list_documents", hint: "Use for \"which invoices are unpaid or overdue\", \"quotations of this customer\", \"expenses this month\"." },
  input: listInput,
  test: "B1-D2.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    const types = splitTypes(input.type);
    const single = types.length === 1 ? types[0]! : undefined;
    const tab = single && input.tab ? tabToFilter(single, input.tab) : undefined;
    const filters = { q: input.q, contactId: input.contactId, from: input.from, to: input.to };

    const args: ListDocumentsInput = {
      docType: types.length === 0 ? undefined : types.length === 1 ? types[0]! : types,
      // แท็บชนะ `status` เมื่อส่งมาทั้งคู่ — แท็บคือสิ่งที่ผู้ใช้เห็นบนหน้าจอ
      status: tab ? tab.status : parseStatus(input.status),
      excludeOverdue: tab?.excludeOverdue,
      refType: input.refType,
      refId: input.refId,
      page: input.page,
      pageSize: input.pageSize,
      sort: input.sort,
      ...filters,
    };
    const [res, tabCounts] = await Promise.all([
      listDocumentsPaged(tenantId, systemId, args),
      single
        ? computeListTabCounts(tenantId, systemId, single, LIST_TABS[single] ?? [], filters)
        : Promise.resolve<Record<string, number>>({}),
    ]);
    return paged(
      res.rows.map(docRow),
      {
        page: res.page,
        pageSize: res.pageSize,
        pageCount: res.pageCount,
        total: res.total,
        hasMore: res.page < res.pageCount,
      },
      { tabCounts },
    );
  },
});

/**
 * op ที่ไม่รับ query เลย (มีแต่พารามิเตอร์ใน path) — ประกาศสคีมาว่างแบบปิดไว้ ไม่ใช่ปล่อยว่าง
 * ⇒ `?statuss=PAID` ที่พิมพ์ผิดเด้ง 422 บอกช่อง แทนที่จะถูกเมินเงียบ ๆ แล้วผู้เรียกเข้าใจว่ากรองแล้ว
 */
const noQuery = z.object({}).strict();

const documentsGet = defineOp({
  id: "documents.get",
  method: "GET",
  path: "/documents/{id}",
  kind: "read",
  action: "account.doc.view",
  summary: "One document in full: lines, payments, related documents, timeline, journal entries and attachments.",
  label: "เอกสาร 1 ใบ (รายละเอียดเต็ม)",
  tool: { name: "account_get_document", hint: "Read one document in full before answering about it or acting on it." },
  input: noQuery,
  test: "B1-D3.1",
  async handler({ actor, params }) {
    const d = await getDocDetailData(actor.tenantId, actor.systemId, params.id ?? "");
    // เอกสารของร้านอื่น = "ไม่มี" (404) ไม่ใช่ 403 — 403 จะยืนยันให้คนนอกรู้ว่า id นี้มีอยู่จริง
    if (!d) throw new Error(ERR.DOC_NOT_FOUND);
    return docDetail(d);
  },
});

const documentsAttachments = defineOp({
  id: "documents.attachments",
  method: "GET",
  path: "/documents/{id}/attachments",
  kind: "read",
  action: "account.doc.view",
  summary: "Files attached to one document.",
  label: "ไฟล์แนบของเอกสาร",
  input: noQuery,
  test: "B1-D4.3",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getDocRef(tenantId, systemId, id))) throw new Error(ERR.DOC_NOT_FOUND);
    const files = await listDocumentAttachmentFiles(tenantId, systemId, id);
    return files.map(attachmentView);
  },
});

const parseInput = z
  .object({
    text: z.string().min(1).max(200).describe("Free text in Thai or English, for example `invoice john 24900` or `ใบแจ้งหนี้ ณัฐพล 24900`."),
  })
  .strict();

const documentsParse = defineOp({
  id: "documents.parse",
  method: "POST",
  path: "/documents/parse",
  kind: "read",
  action: "account.doc.view",
  summary: "Turn one line of free text into a document draft intent: type, contact candidates and amount. Reads only.",
  label: "แปลข้อความเป็นคำสั่งสร้างเอกสาร",
  tool: { name: "account_parse_quick_create", hint: "Use to turn free text such as \"invoice John 24900\" into a draft intent, then call account_create_document with the ids it returns." },
  input: parseInput,
  test: "B1-D5.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    const settings = await getSettings(tenantId, systemId);
    // ชนิดที่ "ออกได้จริง" มาจากเมนูตัวเดียวกับหน้าจอ (base = "" เพราะ REST ไม่มี URL ของหน้าเว็บ)
    const defs = issuableDocTypes("", settings.vatRegistered).map((d) => ({
      docType: d.value,
      label: d.label,
      route: "",
      side: sideOf(d.value),
    }));
    const parsed = parseQuickCreateQuery(input.text, defs);
    if (!parsed) return null;
    const contacts = parsed.contactQuery
      ? (await searchContactPickerRows(tenantId, systemId, parsed.contactQuery, 5)).map((c) => ({
          id: c.id,
          name: c.name,
        }))
      : [];
    return {
      type: parsed.def.docType,
      label: parsed.def.label,
      contactQuery: parsed.contactQuery,
      amountSatang: parsed.amountSatang,
      contacts,
    };
  },
});

const tagsList = defineOp({
  id: "tags.list",
  method: "GET",
  path: "/tags",
  kind: "read",
  action: "account.doc.view",
  summary: "Tags already used on documents, sorted, for building a picker.",
  label: "แท็กที่เคยใช้",
  test: "B1-D4.1",
  async handler({ actor }) {
    return listUsedTags(actor.tenantId, actor.systemId);
  },
});

const favoritesList = defineOp({
  id: "favorites.list",
  method: "GET",
  path: "/favorites",
  kind: "read",
  action: "account.doc.view",
  summary: "Saved document templates (favourites) of this accounting book.",
  label: "แม่แบบเอกสารที่บันทึกไว้",
  test: "B1-D4.2",
  async handler({ actor }) {
    const rows = await getDocFavorites(actor.tenantId, actor.systemId);
    return rows.map((f) => ({ name: f.name, lines: f.lines }));
  },
});

const recurringList = defineOp({
  id: "recurring.list",
  method: "GET",
  path: "/recurring",
  kind: "read",
  action: "account.doc.view",
  summary: "Recurring document rules: schedule, next run and template summary.",
  label: "เอกสารประจำ (กฎทั้งหมด)",
  test: "B1-D6.1",
  async handler({ actor }) {
    const rows = await listRecurringRules(actor.tenantId, actor.systemId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      docType: r.docType,
      contact: r.contactId ? { id: r.contactId, name: r.contactName } : null,
      frequency: r.frequency,
      dayOfMonth: r.dayOfMonth,
      weekday: r.weekday,
      startDate: dayKeyBkk(r.startDate),
      endDate: r.endDate ? dayKeyBkk(r.endDate) : null,
      nextRunAt: iso(r.nextRunAt),
      lastRunAt: iso(r.lastRunAt),
      leadDays: r.leadDays,
      autoApprove: r.autoApprove,
      active: r.active,
      runCount: r.runCount,
      template: {
        priceMode: r.template.priceMode,
        lineCount: r.template.lines.length,
        subTotalSatang: r.template.lines.reduce(
          (s, l) => s + Math.round(l.qty * l.unitPriceSatang) - l.discountSatang,
          0,
        ),
        dueDays: r.template.dueDays,
        tags: [...r.template.tags],
      },
    }));
  },
});

const recurringRuns = defineOp({
  id: "recurring.runs",
  method: "GET",
  path: "/recurring/{id}/runs",
  kind: "read",
  action: "account.doc.view",
  summary: "Documents that one recurring rule has already produced, newest first.",
  label: "ประวัติการทำงานของเอกสารประจำ",
  input: noQuery,
  test: "B1-D6.2",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getRecurringRule(tenantId, systemId, id))) throw new Error(ERR.RECURRING_RULE_NOT_FOUND);
    const runs = await listRecurringRuns(tenantId, systemId, id);
    return runs.map((r) => ({
      id: r.id,
      ranAt: iso(r.createdAt),
      periodKey: r.periodKey,
      status: r.status,
      document: r.documentId ? { id: r.documentId, docNo: r.docNo } : null,
      // โมเดลปัจจุบันเก็บเฉพาะรอบที่สร้างเอกสารสำเร็จ ⇒ ยังไม่มีข้อความผิดพลาดให้รายงาน
      error: null,
    }));
  },
});

// ── แดชบอร์ด / ภาพรวม (rate "report" — หนักกว่าการอ่านรายการมาก) ──────────────
const yearField = z.coerce
  .number()
  .int()
  .min(MIN_YEAR)
  .max(MAX_YEAR)
  .describe(`Calendar year between ${MIN_YEAR} and ${MAX_YEAR}. Default: the current year in Thailand.`);

const dashboardInput = z
  .object({
    asOf: ymdField("asOf").optional().describe("Read the numbers as of this Thai calendar day (`YYYY-MM-DD`). Default: today in Thailand. Balances, receivable, payable and overdue are all computed at this date."),
    period: z.string().regex(YM, "period ต้องเป็นเดือนรูปแบบ YYYY-MM").optional().describe("Month `YYYY-MM` for the monthly blocks. Ignored when `asOf` is sent. Default: the month of `asOf`."),
    year: yearField.optional(),
  })
  .strict();

/**
 * "ณ วันที่" → instant ที่ใช้คิดยอด: **เที่ยงวันเวลาไทย** ของวันนั้น
 * (แนวเดียวกับ `financeBalances`/เฉลย seed — เที่ยงวันอยู่กลางวัน ⇒ ไม่มีทางตกไปวันข้างเคียง
 *  ไม่ว่านาฬิกาเครื่องจะเป็นโซนไหน · `dayKeyBkk` ของ instant นี้ = วันเดิมเสมอ)
 */
function bkkNoon(day: string): Date {
  return new Date(`${day}T12:00:00+07:00`);
}

const dashboardGet = defineOp({
  id: "dashboard.get",
  method: "GET",
  path: "/dashboard",
  kind: "read",
  action: "account.doc.view",
  rate: "report",
  summary: "Everything the accounting home screen shows in one call: KPI, receivable and payable, cash, categories, pending work and recent documents.",
  label: "แดชบอร์ดหน้าหลัก",
  tool: { name: "account_dashboard", hint: "Start here for open questions like \"how is the shop doing\" or \"how much do customers still owe me\"." },
  input: dashboardInput,
  test: "B1-D1.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    // ลำดับ: `asOf` ชนะทุกอย่าง (ผู้เรียกบอกวันมาเอง) → ไม่มีก็ใช้ `period` (สิ้นเดือนนั้น แต่ไม่ล้ำวันนี้)
    // → ไม่มีทั้งคู่ = วันนี้ตามเวลาไทย · ตัวเลขทุกช่อง (ยอดเงิน/ค้างรับ/ค้างจ่าย/พ้นกำหนด) คิด ณ วันเดียวกันนี้
    // ⚠️ `asOf` อนาคตทำได้ (ดูยอดที่คาดว่าจะเป็น) แต่ "พ้นกำหนด" จะนับใบที่ยังไม่ถึงกำหนดจริงในวันนี้ด้วย
    const now = input.asOf
      ? bkkNoon(input.asOf)
      : input.period
        ? new Date(Math.min(Date.now(), monthEndExclusive(input.period).getTime() - 1))
        : bkkNoon(dayKeyBkk(new Date()));
    const snap = await dashboardSnapshot({ tenantId, systemId }, { now, year: input.year });
    return dashboardView(snap);
  },
});

const seriesInput = z.object({ year: yearField.optional() }).strict();

const dashboardSeries = defineOp({
  id: "dashboard.series",
  method: "GET",
  path: "/dashboard/series",
  kind: "read",
  action: "account.doc.view",
  rate: "report",
  summary: "Income, expense and profit for the 12 months of one year, plus the previous year and the year on year change.",
  label: "รายรับ-รายจ่าย 12 เดือน",
  input: seriesInput,
  test: "B1-D1.7",
  async handler({ actor, input }) {
    const year = input.year ?? Number(dayKeyBkk(new Date()).slice(0, 4));
    return seriesView(await monthlySeries({ tenantId: actor.tenantId, systemId: actor.systemId }, year));
  },
});

const overviewInput = z
  .object({
    side: z.enum(["revenue", "expense"]).describe("Which side to look at: `revenue` (money in) or `expense` (money out)."),
    year: yearField.optional(),
    issuedRange: z.enum(["this-month", "last-month", "this-year"]).optional().describe("Period of the `issued` card. Default `this-month`."),
  })
  .strict();

const overviewGet = defineOp({
  id: "overview.get",
  method: "GET",
  path: "/overview",
  kind: "read",
  action: "account.doc.view",
  rate: "report",
  summary: "Revenue or expense overview: 12 month bars split by payment status, documents issued, top contacts, top products and top categories.",
  label: "ภาพรวมรายรับ/รายจ่าย",
  input: overviewInput,
  test: "B1-D1.9",
  async handler({ actor, input }) {
    const data = await loadOverview(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      input.side,
      { ...(input.year ? { year: String(input.year) } : {}), ...(input.issuedRange ? { dr: input.issuedRange } : {}) },
      { base: "" },
    );
    return overviewView(data);
  },
});

export const DOCUMENTS_READ_OPS: ApiOp[] = [
  documentsList,
  documentsGet,
  documentsAttachments,
  documentsParse,
  tagsList,
  favoritesList,
  recurringList,
  recurringRuns,
  dashboardGet,
  dashboardSeries,
  overviewGet,
];
