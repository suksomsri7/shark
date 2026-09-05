// ops/settings-read.ts — READ ของประวัติการแก้ไข / ตั้งค่ากิจการ / นโยบาย / เอกสาร / การเชื่อมต่อ /
//                         คลังเอกสาร / กล่องขาเข้า / อภิธานศัพท์ (WO B4)
//
// ทุก op ที่นี่ `kind: "read"` — ห้ามแตะ prisma ตรง ๆ (fitness F5) เรียกผ่าน service เท่านั้น
// ทุกก้อนผ่าน `../serialize-gl.ts` เสมอ (ห้าม spread แถว service — อ่านกติกาในหัวไฟล์นั้น)
//
// สโคป: `audit.*` / `settings.policy` / `settings.documents` / `links.*` = `account.settings.manage`
// (เห็นนโยบาย/ระบบที่เชื่อม = ของหลังบ้าน) · `settings.get` = `account.doc.view` (ข้อมูลกิจการที่พิมพ์บน
// เอกสารอยู่แล้ว) · `files.*` / `inbox.*` = `account.document.manage`
//
// เรื่องที่พลาดง่ายและถูกดักไว้ตรงนี้:
//   · `settings.get` **ห้าม** ส่ง stampUrl/signatureUrl — ตราประทับกับลายเซ็นเจ้าของกิจการเป็นของที่เอาไป
//     ปั๊มเอกสารปลอมได้ ไม่ใช่ข้อมูลระดับ "อ่านเอกสาร" (serialize-gl.settingsView เขียนทีละฟิลด์กันพลาด)
//   · `audit.list` แบ่งหน้าแบบ cursor (ไม่ใช่ page/pageSize) — ประวัติเป็นสายเวลาที่งอกตลอด ⇒ ส่ง
//     `nextCursor` ระดับบนสุดผ่าน `withExtra()` ไม่ใช่ซอง `paged()`
//   · กล่องขาเข้าต้องรู้ "อีเมลของร้าน" ซึ่งมาจาก slug ของ tenant — REST ไม่มี session ⇒ ใช้
//     `inboxEmailAddressOf(ctx)` ที่ดึง slug ให้เอง (อย่าเดา slug จาก tenantId)

import { z } from "zod";
import { listAuditLogs } from "../../access";
import { listAttachmentsPaged, listFolders, type AttachmentTab } from "../../attachment";
import { buildConnectionCards } from "../../connections";
import { docTypeLabel } from "../../dashboard";
import { docNumberingRows, getDocSettings } from "../../doc-settings";
import { HELP_TEXTS } from "../../help-texts";
import { inboxEmailAddressOf, inboxStats } from "../../inbox";
import { getPolicy } from "../../policy";
import { getSettings } from "../../service";
import { defineOp, type ApiOp } from "../op";
import { paged, withExtra, type PagedInfo } from "../respond";
import {
  auditRowView,
  docSettingRowView,
  fileRowView,
  inboxItemView,
  linkCardView,
  policyView,
  settingsView,
} from "../serialize-gl";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymdField = (what: string) =>
  z.string().regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`).describe(`${what} (Thai calendar day, YYYY-MM-DD).`);
const dayStart = (d: string) => new Date(`${d}T00:00:00.000+07:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

function pageInfoFrom(total: number, page: number, pageSize: number): PagedInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, pageCount, total, hasMore: page < pageCount };
}

// ═══════════════ ประวัติการแก้ไข ═══════════════

const auditListInput = z
  .object({
    targetId: z.string().min(1).optional().describe("Only entries about this record id."),
    action: z.string().max(120).optional().describe("Action prefix, e.g. `account.doc` matches `account.doc.issue`."),
    from: ymdField("from").optional(),
    to: ymdField("to").optional(),
    take: z.coerce.number().int().min(1).optional().describe("1-200. Default 50."),
    cursor: z.string().min(1).optional().describe("`nextCursor` from the previous response."),
  })
  .strict();

const auditList = defineOp({
  id: "audit.list",
  method: "GET",
  path: "/audit",
  kind: "read",
  action: "account.settings.manage",
  summary: "Audit trail of this shop, newest first, with the before/after values that were recorded.",
  label: "ประวัติการแก้ไข",
  input: auditListInput,
  test: "B4-G6.1",
  async handler({ actor, input }) {
    const res = await listAuditLogs({
      tenantId: actor.tenantId,
      targetId: input.targetId,
      action: input.action,
      from: input.from ? dayStart(input.from) : undefined,
      to: input.to ? dayEnd(input.to) : undefined,
      take: input.take ? Math.min(input.take, 200) : undefined,
      cursor: input.cursor,
    });
    return withExtra(res.rows.map(auditRowView), { nextCursor: res.nextCursor });
  },
});

// ═══════════════ ตั้งค่ากิจการ / นโยบาย / เอกสาร ═══════════════

const settingsGet = defineOp({
  id: "settings.get",
  method: "GET",
  path: "/settings",
  kind: "read",
  action: "account.doc.view",
  summary: "Company details printed on documents: legal name, tax id, branch, address, VAT registration and fiscal year.",
  label: "ข้อมูลกิจการ",
  tool: { name: "account_settings", hint: "Use to check the legal name, tax id, branch and VAT registration of this business." },
  test: "B4-G6.4",
  async handler({ actor }) {
    const s = await getSettings(actor.tenantId, actor.systemId);
    return settingsView(s);
  },
});

const settingsPolicy = defineOp({
  id: "settings.policy",
  method: "GET",
  path: "/settings/policy",
  kind: "read",
  action: "account.settings.manage",
  summary: "Accounting policy: fiscal year, VAT timing, withholding tax defaults, date lock, duplicate rules and report emails.",
  label: "นโยบายบัญชี",
  test: "B4-G6.5",
  async handler({ actor }) {
    const p = await getPolicy({ tenantId: actor.tenantId, systemId: actor.systemId });
    return policyView(p);
  },
});

const settingsDocuments = defineOp({
  id: "settings.documents",
  method: "GET",
  path: "/settings/documents",
  kind: "read",
  action: "account.settings.manage",
  summary: "Per document type: number pattern and next number (with a live example), due days, notes, public link and print template.",
  label: "ตั้งค่าเอกสารและเลขที่",
  test: "B4-G6.7",
  async handler({ actor }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const now = new Date();
    // `docNumberingRows` คิดตัวอย่างเลขถัดไปด้วยสูตรเดียวกับตอนออกเลขจริง — ห้ามประกอบตัวอย่างเอง
    const [settings, rows] = await Promise.all([getDocSettings(ctx), docNumberingRows(ctx, docTypeLabel, now)]);
    return rows.map((r) => docSettingRowView(r, settings));
  },
});

const linksList = defineOp({
  id: "links.list",
  method: "GET",
  path: "/links",
  kind: "read",
  action: "account.settings.manage",
  summary: "Systems that post into accounting (POS, chat, bookings, ...): link status, options and this month's volume.",
  label: "การเชื่อมต่อกับระบบอื่น",
  test: "B4-G6.8",
  async handler({ actor }) {
    const cards = await buildConnectionCards({ tenantId: actor.tenantId, systemId: actor.systemId }, new Date());
    return cards.map(linkCardView);
  },
});

// ═══════════════ คลังเอกสาร / กล่องขาเข้า ═══════════════

const filesListInput = z
  .object({
    tab: z
      .enum(["all", "unlinked", "linked", "archived"])
      .optional()
      .describe('"all" (default), "unlinked", "linked" or "archived" (soft-deleted files).'),
    folder: z.string().max(120).optional(),
    q: z.string().max(200).optional().describe("Free text: file name or uploader name."),
    type: z.string().max(60).optional().describe("Document type hint stored on the file."),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().optional().describe("1-100. Default 20."),
  })
  .strict();

const filesList = defineOp({
  id: "files.list",
  method: "GET",
  path: "/files",
  kind: "read",
  action: "account.document.manage",
  paged: true,
  summary: "Document vault files with paging, plus the folder list and per-tab counters.",
  label: "คลังเอกสาร",
  input: filesListInput,
  test: "B4-G7.1",
  async handler({ actor, input }) {
    const page = input.page ?? 1;
    const pageSize = Math.min(Math.max(1, input.pageSize ?? 20), 100);
    const [res, folders] = await Promise.all([
      listAttachmentsPaged(actor.tenantId, actor.systemId, {
        tab: (input.tab ?? "all") as AttachmentTab,
        folder: input.folder,
        q: input.q,
        docTypeHint: input.type,
        page,
        pageSize,
      }),
      listFolders(actor.tenantId, actor.systemId),
    ]);
    return paged(res.rows.map(fileRowView), pageInfoFrom(res.total, res.page, res.pageSize), {
      folders: folders.map((f) => ({ name: f.folder, count: f.count })),
      tabCounts: { all: res.counts.all, unlinked: res.counts.unlinked, linked: res.counts.linked },
    });
  },
});

/** จำนวนไฟล์สูงสุดที่กล่องขาเข้าคืนต่อครั้ง (กล่องขาเข้าคือ "งานที่ค้าง" ไม่ใช่คลังทั้งหมด) */
const INBOX_ITEMS = 50;

const inboxGet = defineOp({
  id: "inbox.get",
  method: "GET",
  path: "/inbox",
  kind: "read",
  action: "account.document.manage",
  summary: "Inbox in one call: counters, the files still waiting to become documents (with AI-extracted fields) and the shop inbox email address.",
  label: "กล่องขาเข้า",
  test: "B4-G7.3",
  async handler({ actor }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const [stats, res, emailAddress] = await Promise.all([
      inboxStats(ctx),
      listAttachmentsPaged(actor.tenantId, actor.systemId, { tab: "unlinked", page: 1, pageSize: INBOX_ITEMS }),
      inboxEmailAddressOf(ctx),
    ]);
    const pending = res.counts.unlinked;
    return {
      stats: {
        pending,
        unread: stats.unreadCount,
        readByAi: Math.max(0, pending - stats.unreadCount),
        thisMonth: stats.docsThisMonth,
        savedHours: stats.savedHours,
      },
      items: res.rows.map(inboxItemView),
      emailAddress,
    };
  },
});

// ═══════════════ อภิธานศัพท์ ═══════════════

const helpGlossary = defineOp({
  id: "help.glossary",
  method: "GET",
  path: "/help/glossary",
  kind: "read",
  action: "account.doc.view",
  summary: "Plain-Thai explanations of the accounting terms used across this API (same text the UI shows in its tooltips).",
  label: "อภิธานศัพท์บัญชี",
  test: "B4-G7.4",
  async handler() {
    return Object.entries(HELP_TEXTS).map(([key, text]) => ({ key, text }));
  },
});

export const SETTINGS_READ_OPS: ApiOp[] = [
  auditList,
  settingsGet,
  settingsPolicy,
  settingsDocuments,
  linksList,
  filesList,
  inboxGet,
  helpGlossary,
];
