// doc-settings.ts — อ่าน/เขียนตั้งค่าเอกสาร §9.2 + ทะเบียนแท็ก (WO 8.1)
//
// 🔴 ไม่ import prisma ตรง (fitness F5.1 เพดาน 45 ไฟล์) — ใช้ `tenantDb()` ซึ่งยัด tenantId/systemId
//    เข้าทุก query ให้เองอยู่แล้ว (defense-in-depth ชั้น 2) ⇒ IDOR ข้ามร้านเกิดไม่ได้แม้เขียน where ผิด
//
// แหล่งเก็บ:
//   · AccountSettings.docConfig.sequences   — เลขที่เอกสารต่อชนิด (คีย์เดิมตั้งแต่ V1)
//   · AccountSettings.docConfig.docSettings — ที่เหลือของ §9.2
//   · AccountSettings.defaultDueDays / defaultValidDays — คอลัมน์เดิมที่ฟอร์มเอกสารอ่านอยู่แล้ว
//     ⇒ "วันครบกำหนด" **ทับซ้อน** กับ JSON ไม่ได้ → อ่าน/เขียนคอลัมน์เป็นหลัก ใช้ JSON เฉพาะช่องใหม่
//       (PO กี่วัน · นับจากสิ้นเดือน) — แหล่งความจริงเดียวต่อค่าหนึ่งค่า
//   · AccountDocTag  — ทะเบียนแท็ก (ชื่อ/สี/ชนิดที่ใช้ได้) · การผูกกับเอกสารยังเป็น AccountDocument.tags[]
//   · AccountMapping key `DOC:<docType>` — บัญชีรายวันต่อชนิด (gl.resolveLine อ่านคีย์นี้อยู่แล้ว)
import { tenantDb } from "@/lib/core/db";
import type { AccountDocType, Prisma } from "@prisma/client";
import {
  DUE_BASIS_LABEL,
  NUMBERED_DOC_TYPES,
  applyDueColumns,
  TAG_COLORS,
  defaultDocSettings,
  fallbackPrefixOf,
  mergeDocSettings,
  parseDocSettings,
  type DocSettings,
  type DocSettingsPatch,
} from "./settings-schema";
export { TAG_COLORS, TAG_COLOR_LABEL, type TagColor } from "./settings-schema";
import { peekDocNo, resolveSeqConfig, findSeqGaps, setNextNo } from "./doc-numbering";

export type SettingsCtx = { tenantId: string; systemId: string };

type Db = ReturnType<typeof tenantDb>;
function dbOf(ctx: SettingsCtx): Db {
  return tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
}
/** client เดียวกัน แต่ในรูปที่ doc-numbering.ts รับ (มันขอแค่ความสามารถ query — ขอบเขตยังถูกยัดให้เหมือนเดิม) */
function numberingDb(ctx: SettingsCtx): Prisma.TransactionClient {
  return dbOf(ctx) as unknown as Prisma.TransactionClient;
}

// ─────────────────── อ่าน ───────────────────

/**
 * ตั้งค่าเอกสารทั้งก้อน (§9.2) — รวมค่าจาก docConfig + คอลัมน์เดิม + ค่าเริ่มต้น
 * ไม่มีแถว AccountSettings เลย = ร้านใหม่ → คืนค่าเริ่มต้นทั้งชุด (หน้าตั้งค่าเปิดได้ ไม่ต้อง seed ก่อน)
 */
export async function getDocSettings(ctx: SettingsCtx): Promise<DocSettings> {
  const row = await dbOf(ctx).accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { docConfig: true, defaultDueDays: true, defaultValidDays: true },
  });
  const s = parseDocSettings(row?.docConfig ?? null);
  return row ? applyDueColumns(s, row) : s;
}

/** ตั้งค่าเลขที่ของชนิดเอกสารหนึ่ง (รวมค่าเริ่มต้นแล้ว — พร้อมโชว์ในตาราง) */
export function seqOf(settings: DocSettings, docType: AccountDocType, branchCode?: string | null) {
  return resolveSeqConfig({
    configured: settings.sequences[docType] ?? null,
    fallbackPrefix: fallbackPrefixOf(docType),
    branchCode,
  });
}

export type DocNumberingRow = {
  docType: AccountDocType;
  label: string;
  prefix: string;
  /** รูปแบบที่ผู้ใช้ตั้งเอง ("" = ยังไม่ตั้ง → ใช้ placeholder) */
  pattern: string;
  /** รูปแบบที่ใช้จริง (ของผู้ใช้ หรือค่าเริ่มต้น) */
  effectivePattern: string;
  reset: DocSettings["sequences"][string]["reset"];
  /** เลขถัดไปที่จะได้ (ตัวอย่าง live) */
  example: string;
  /** ลำดับถัดไปเป็นตัวเลขล้วน (ช่อง "เลขถัดไป" แก้ได้) */
  nextNo: number;
};

/**
 * ตารางเลขที่เอกสารทั้ง 18 ชนิด พร้อม "ตัวอย่างเลขถัดไป" ที่คิดด้วยสูตรเดียวกับตอนออกเลขจริง
 * (ถ้าปล่อยให้หน้าตั้งค่าคิดสูตรเอง วันหนึ่งตัวอย่างกับเลขจริงจะไม่ตรงกัน แล้วไม่มีใครรู้ว่าอันไหนถูก)
 */
export async function docNumberingRows(
  ctx: SettingsCtx,
  labelOf: (dt: AccountDocType) => string,
  now: Date,
): Promise<DocNumberingRow[]> {
  // WO 9.3: เดิมอ่านแถว AccountSettings 2 ครั้ง (getDocSettings 1 + branchCode อีก 1) ทั้งที่เป็นแถวเดียวกัน
  //         ⇒ รวมเป็น findFirst เดียวแล้วแยกใช้ (ผลลัพธ์เท่าเดิมเป๊ะ — parse ชุดเดียวกับ getDocSettings)
  const row = await dbOf(ctx).accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { docConfig: true, defaultDueDays: true, defaultValidDays: true, branchCode: true },
  });
  const parsed = parseDocSettings(row?.docConfig ?? null);
  const settings = row ? applyDueColumns(parsed, row) : parsed;
  const db = numberingDb(ctx);
  const branchRow = row;
  const rows: DocNumberingRow[] = [];
  for (const docType of NUMBERED_DOC_TYPES) {
    const cfg = seqOf(settings, docType, branchRow?.branchCode ?? null);
    const example = await peekDocNo(db, {
      systemId: ctx.systemId,
      docType,
      fallbackPrefix: fallbackPrefixOf(docType),
      date: now,
    });
    // ลำดับตัวเลขล้วนของตัวอย่าง (ดึงเลขท้าย — ทุกรูปแบบลงท้ายด้วยลำดับ)
    const m = /(\d+)\s*$/.exec(example);
    rows.push({
      docType,
      label: labelOf(docType),
      prefix: cfg.prefix,
      pattern: cfg.pattern,
      effectivePattern: cfg.effectivePattern,
      reset: cfg.reset,
      example,
      nextNo: m ? Number.parseInt(m[1], 10) : 1,
    });
  }
  return rows;
}

// ─────────────────── เขียน ───────────────────

export type SaveResult = { ok: true } | { ok: false; reason: string };

/**
 * บันทึกตั้งค่าเอกสารทีละบล็อก (หน้าตั้งค่า 1 หน้า = 1 บล็อก)
 * 🔴 ด่านสิทธิ์ (`account.settings.manage`) อยู่ที่ server action ที่เรียกตัวนี้ — ที่นี่ตรวจ "ความถูกต้องของค่า"
 */
export async function saveDocSettings(ctx: SettingsCtx, patch: DocSettingsPatch): Promise<SaveResult> {
  const bad = validateDocSettingsPatch(patch);
  if (bad) return { ok: false, reason: bad };

  const db = dbOf(ctx);
  const existing = await db.accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { id: true, docConfig: true },
  });
  const docConfig = mergeDocSettings(existing?.docConfig ?? null, patch);
  // "วันครบกำหนด" 2 ค่าแรกอยู่ในคอลัมน์เดิม (ฟอร์มเอกสารอ่านจากตรงนั้น)
  const dueCols =
    patch.due === undefined
      ? {}
      : { defaultValidDays: patch.due.quotationValidDays, defaultDueDays: patch.due.invoiceCreditDays };

  if (existing) {
    await db.accountSettings.update({
      where: { id: existing.id },
      data: { ...dueCols, docConfig: docConfig as Prisma.InputJsonValue },
    });
  } else {
    await db.accountSettings.create({
      data: {
        orgName: "",
        ...dueCols,
        docConfig: docConfig as Prisma.InputJsonValue,
      } as Prisma.AccountSettingsUncheckedCreateInput,
    });
  }
  return { ok: true };
}

/** ตรวจค่าที่ผู้ใช้กรอก — ข้อความเป็นภาษาคน บอกวิธีแก้ (ห้ามโทษผู้ใช้) */
export function validateDocSettingsPatch(patch: DocSettingsPatch): string | null {
  if (patch.sequences) {
    for (const [dt, v] of Object.entries(patch.sequences)) {
      const prefix = (v.prefix ?? "").trim();
      if (prefix.length > 12) return `คำนำหน้าของ ${dt} ยาวเกินไป (ไม่เกิน 12 ตัวอักษร)`;
      if (prefix && !/^[A-Za-z0-9ก-๙_-]+$/.test(prefix))
        return `คำนำหน้าของ ${dt} ใช้ได้เฉพาะตัวอักษร ตัวเลข ขีด (-) และขีดล่าง (_)`;
      const pattern = (v.pattern ?? "").trim();
      if (pattern.length > 60) return `รูปแบบเลขที่ของ ${dt} ยาวเกินไป (ไม่เกิน 60 ตัวอักษร)`;
      if (pattern && !/\{0+\}|\{SEQ\}/.test(pattern))
        return `รูปแบบเลขที่ของ ${dt} ต้องมีช่องลำดับ เช่น {0000} ไม่งั้นเอกสารทุกใบจะได้เลขเดียวกัน`;
    }
  }
  if (patch.due) {
    for (const [k, label] of [
      ["quotationValidDays", "ใบเสนอราคาใช้ได้กี่วัน"],
      ["invoiceCreditDays", "เครดิตเทอมของใบแจ้งหนี้"],
      ["purchaseOrderDueDays", "กำหนดส่งของใบสั่งซื้อ"],
    ] as const) {
      const n = patch.due[k];
      if (!Number.isInteger(n) || n < 0 || n > 3650) return `${label} ต้องเป็นจำนวนวัน 0–3650`;
    }
    if (patch.due.basis !== "ISSUE" && patch.due.basis !== "MONTH_END")
      return `วิธีนับวันครบกำหนดต้องเป็น "${DUE_BASIS_LABEL.ISSUE}" หรือ "${DUE_BASIS_LABEL.MONTH_END}"`;
  }
  // 🔴 WO 9.2 — ตัว patch เป็น "บางส่วน" ได้จริง (ผู้เรียกส่งมาแค่คีย์ที่แก้) แต่ชนิดของ TS
  //    ประกาศ sub-object เป็นก้อนเต็ม ⇒ ของเดิมอ่าน `.legalText.length` ตรง ๆ แล้ว **โยน TypeError**
  //    เมื่อคีย์นั้นไม่ได้ส่งมา (server action ตายพร้อมข้อความอังกฤษของ V8 แทนข้อความไทย)
  //    ⇒ อ่านแบบทนค่าว่างทุกจุด · ค่าที่ไม่ได้ส่ง = ไม่ต้องตรวจ
  const expiryDays = patch.publicView?.expiryDays;
  if (expiryDays !== undefined && (!Number.isFinite(expiryDays) || expiryDays < 0 || expiryDays > 3650))
    return "อายุลิงก์สาธารณะต้องอยู่ระหว่าง 0–3650 วัน (0 = ไม่หมดอายุ)";
  if ((patch.autoTaxInvoice?.legalText ?? "").length > 500)
    return "ข้อความตามกฎหมายยาวเกินไป (ไม่เกิน 500 ตัวอักษร)";
  if ((patch.taxRequest?.receiptText ?? "").length > 200)
    return "ข้อความบนใบเสร็จยาวเกินไป (ไม่เกิน 200 ตัวอักษร)";
  if (patch.notes) {
    for (const [dt, v] of Object.entries(patch.notes)) {
      if ((v.footer ?? "").length > 1000) return `ข้อความท้ายเอกสารของ ${dt} ยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)`;
      if ((v.terms ?? "").length > 500) return `เงื่อนไขการชำระของ ${dt} ยาวเกินไป (ไม่เกิน 500 ตัวอักษร)`;
    }
  }
  return null;
}

/** คืนตั้งค่าเอกสารทั้งชุดกลับเป็นค่าเริ่มต้น (ปุ่ม "คืนค่าเริ่มต้น" ของ f10) — ไม่แตะเลขรันที่ออกไปแล้ว */
export async function resetDocSettings(ctx: SettingsCtx): Promise<SaveResult> {
  const d = defaultDocSettings();
  return saveDocSettings(ctx, {
    due: d.due,
    channels: d.channels,
    publicView: d.publicView,
    autoTaxInvoice: d.autoTaxInvoice,
    print: d.print,
    taxRequest: d.taxRequest,
    rules: d.rules,
  });
}

/** ตั้ง "เลขถัดไป" ของชนิดหนึ่ง (§9.2) */
export async function setDocNextNo(
  ctx: SettingsCtx,
  docType: AccountDocType,
  nextNo: number,
  now: Date,
): Promise<{ ok: true; nextNo: number } | { ok: false; reason: string }> {
  return setNextNo(numberingDb(ctx), {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    docType,
    fallbackPrefix: fallbackPrefixOf(docType),
    date: now,
    nextNo,
  });
}

/** ลำดับที่หายไปของงวดนี้ (แสดงคำเตือน "เลขที่เอกสารข้ามลำดับ" เมื่อเปิดกฎไว้) */
export async function docNoGapsFor(
  ctx: SettingsCtx,
  docType: AccountDocType,
  now: Date,
): Promise<number[]> {
  return findSeqGaps(numberingDb(ctx), {
    systemId: ctx.systemId,
    docType,
    fallbackPrefix: fallbackPrefixOf(docType),
    date: now,
  });
}

// ─────────────────── แท็กเอกสาร (§9.2) ───────────────────

export type DocTagView = {
  id: string;
  name: string;
  color: string;
  docTypes: string[]; // [] = ใช้ได้ทุกชนิด
  sortOrder: number;
  archivedAt: Date | null;
  /** จำนวนเอกสารที่ติดแท็กนี้อยู่ (นับจาก AccountDocument.tags[]) */
  usageCount?: number;
};

function readDocTypes(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function listDocTags(
  ctx: SettingsCtx,
  opts?: { includeArchived?: boolean; withUsage?: boolean },
): Promise<DocTagView[]> {
  const db = dbOf(ctx);
  const rows = await db.accountDocTag.findMany({
    where: opts?.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const views: DocTagView[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    docTypes: readDocTypes(r.docTypes),
    sortOrder: r.sortOrder,
    archivedAt: r.archivedAt,
  }));
  if (opts?.withUsage && views.length) {
    // นับการใช้งานจริงจาก tags[] ของเอกสาร (1 query ต่อแท็ก แต่ตารางแท็กมีไม่กี่แถวต่อร้าน)
    for (const v of views) {
      v.usageCount = await db.accountDocument.count({ where: { tags: { has: v.name } } });
    }
  }
  return views;
}

/** แท็กที่ใช้ได้กับชนิดเอกสารหนึ่ง (docTypes ว่าง = ทุกชนิด) */
export async function tagsForDocType(ctx: SettingsCtx, docType: AccountDocType): Promise<DocTagView[]> {
  const all = await listDocTags(ctx);
  return all.filter((t) => t.docTypes.length === 0 || t.docTypes.includes(docType));
}

/** สีแท็ก = สวอตช์ 6 สีจากโทเคนดีไซน์เท่านั้น (Fable D4 ตรวจรับ: ถอด HEX ที่ builder เปิดให้ REST ออก —
 *  ข้อสอบ qc-acc-v2-doc-settings T10b.4 "สีนอกรายการต้องถูกปฏิเสธ" คือสัญญาของหน้าจอ · REST จำกัดที่ zod enum ให้ตรงกัน) */
function isValidTagColor(color: string): boolean {
  return (TAG_COLORS as readonly string[]).includes(color);
}

function validateTag(input: { name: string; color: string; docTypes: string[] }): string | null {
  const name = input.name.trim();
  if (!name) return "ตั้งชื่อแท็กก่อนบันทึก";
  if (name.length > 40) return "ชื่อแท็กยาวเกินไป (ไม่เกิน 40 ตัวอักษร)";
  if (!isValidTagColor(input.color)) return "เลือกสีจากรายการที่มีให้";
  for (const dt of input.docTypes)
    if (!(NUMBERED_DOC_TYPES as readonly string[]).includes(dt)) return `ชนิดเอกสาร ${dt} ไม่มีในระบบ`;
  return null;
}

export async function createDocTag(
  ctx: SettingsCtx,
  input: { name: string; color: string; docTypes: string[] },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const bad = validateTag(input);
  if (bad) return { ok: false, reason: bad };
  const db = dbOf(ctx);
  const name = input.name.trim();
  const dup = await db.accountDocTag.findFirst({ where: { name } });
  if (dup) return { ok: false, reason: `มีแท็กชื่อ "${name}" อยู่แล้ว` };
  const count = await db.accountDocTag.count({});
  const row = await db.accountDocTag.create({
    data: {
      name,
      color: input.color,
      docTypes: input.docTypes as Prisma.InputJsonValue,
      sortOrder: count,
    } as Prisma.AccountDocTagUncheckedCreateInput,
  });
  return { ok: true, id: row.id };
}

export async function updateDocTag(
  ctx: SettingsCtx,
  id: string,
  input: { name: string; color: string; docTypes: string[] },
): Promise<SaveResult> {
  const bad = validateTag(input);
  if (bad) return { ok: false, reason: bad };
  const db = dbOf(ctx);
  const row = await db.accountDocTag.findFirst({ where: { id } });
  if (!row) return { ok: false, reason: "ไม่พบแท็กนี้" };
  const name = input.name.trim();
  const dup = await db.accountDocTag.findFirst({ where: { name, id: { not: id } } });
  if (dup) return { ok: false, reason: `มีแท็กชื่อ "${name}" อยู่แล้ว` };
  // เปลี่ยนชื่อแท็ก = ต้องตามไปแก้ tags[] ของเอกสารที่ติดอยู่ ไม่งั้นแท็กเดิมกลายเป็นแท็กกำพร้า
  if (name !== row.name) {
    const docs = await db.accountDocument.findMany({
      where: { tags: { has: row.name } },
      select: { id: true, tags: true },
    });
    for (const d of docs) {
      const next = Array.from(new Set(d.tags.map((t) => (t === row.name ? name : t))));
      await db.accountDocument.update({ where: { id: d.id }, data: { tags: next } });
    }
  }
  await db.accountDocTag.update({
    where: { id },
    data: { name, color: input.color, docTypes: input.docTypes as Prisma.InputJsonValue },
  });
  return { ok: true };
}

/** เก็บแท็กเข้ากรุ (ไม่ลบ) — เอกสารเก่าที่ติดแท็กนี้ยังแสดงชื่อเดิมได้ */
export async function archiveDocTag(ctx: SettingsCtx, id: string, archived = true): Promise<SaveResult> {
  const db = dbOf(ctx);
  const row = await db.accountDocTag.findFirst({ where: { id } });
  if (!row) return { ok: false, reason: "ไม่พบแท็กนี้" };
  await db.accountDocTag.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  return { ok: true };
}

// ─────────────────── ช่องทางรับชำระบนเอกสาร (§9.2) ───────────────────

export type DocChannelView = {
  id: string;
  name: string;
  bankName: string | null;
  accountNo: string | null;
  accountName: string | null;
  promptpayId: string | null;
  type: string;
};

/**
 * ช่องทางที่พิมพ์บนเอกสาร = ช่องทางที่ติ๊ก `showOnDocuments` (§10.1) เรียงตามลำดับที่ตั้งไว้ที่นี่
 * ช่องทางที่เพิ่งเพิ่มและยังไม่อยู่ในลำดับ → ต่อท้าย (ไม่หายไปเงียบ ๆ)
 */
export async function documentPaymentChannels(ctx: SettingsCtx): Promise<DocChannelView[]> {
  const [settings, rows] = await Promise.all([
    getDocSettings(ctx),
    dbOf(ctx).accountFinance.findMany({
      where: { showOnDocuments: true, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        bankName: true,
        accountNo: true,
        accountName: true,
        promptpayId: true,
        type: true,
      },
    }),
  ]);
  const order = settings.channels.order;
  const rank = new Map(order.map((id, i) => [id, i]));
  return rows
    .map((r) => ({ ...r, type: String(r.type) }))
    .sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
}

// ─────────────────── บัญชีรายวันของเอกสาร: override ต่อชนิด (§9.2) ───────────────────

export type DocTypeAccountRow = { docType: AccountDocType; accountId: string | null; code: string | null; name: string | null };

/** อ่าน override ปัจจุบันของทุกชนิด (คีย์ `DOC:<docType>` ใน AccountMapping — ตัวที่ gl.resolveLine อ่าน) */
export async function listDocTypeAccounts(ctx: SettingsCtx): Promise<DocTypeAccountRow[]> {
  // 🔴 WO 9.3: เดิมใช้ include ของ relation `account` (nullable) — Prisma ยิง query ของ relation เสมอ
  //    แม้ไม่มีแถว/ไม่มี accountId เลย → `WHERE id IN (NULL)` เปล่า ๆ 1 คำสั่งทุกครั้งที่เปิดหน้าตั้งค่าเอกสาร
  const rows = await dbOf(ctx).accountMapping.findMany({
    where: { key: { startsWith: "DOC:" } },
    select: { key: true, accountId: true },
  });
  const accountIds = [...new Set(rows.map((r) => r.accountId).filter((x): x is string => !!x))];
  const accounts = accountIds.length
    ? await dbOf(ctx).accountLedger.findMany({ where: { id: { in: accountIds } }, select: { id: true, code: true, name: true } })
    : [];
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const byType = new Map(rows.map((r) => [r.key.slice(4), r]));
  return NUMBERED_DOC_TYPES.map((docType) => {
    const hit = byType.get(docType);
    const acc = hit?.accountId ? accountById.get(hit.accountId) : undefined;
    return {
      docType,
      accountId: hit?.accountId ?? null,
      code: acc?.code ?? null,
      name: acc?.name ?? null,
    };
  });
}

/**
 * ตั้ง/ล้างบัญชีที่ใช้ลงรายการของชนิดเอกสารหนึ่ง
 * accountId = null → ลบ override (กลับไปใช้ mapping key กลาง เช่น INCOME_DEFAULT/EXPENSE_DEFAULT)
 */
export async function setDocTypeAccount(
  ctx: SettingsCtx,
  docType: AccountDocType,
  accountId: string | null,
): Promise<SaveResult> {
  if (!(NUMBERED_DOC_TYPES as readonly string[]).includes(docType))
    return { ok: false, reason: "ชนิดเอกสารนี้ตั้งบัญชีแยกไม่ได้" };
  const db = dbOf(ctx);
  const key = `DOC:${docType}`;
  if (!accountId) {
    await db.accountMapping.deleteMany({ where: { key } });
    return { ok: true };
  }
  const acct = await db.accountLedger.findFirst({ where: { id: accountId }, select: { id: true, archivedAt: true } });
  if (!acct) return { ok: false, reason: "ไม่พบบัญชีปลายทางในผังบัญชีของร้านนี้" };
  if (acct.archivedAt) return { ok: false, reason: "บัญชีนี้ถูกปิดใช้งานอยู่ — เลือกบัญชีอื่นหรือเปิดใช้งานก่อน" };
  // findFirst→update/create แทน upsert: tenantDb ยัดตัวกรองขอบเขตเข้า where ทุกคำสั่ง ซึ่งกับ upsert
  // จะกลายเป็น where แบบ AND ที่ไม่ใช่ unique input — ท่านี้ตรงไปตรงมาและปลอดภัยกว่า
  const cur = await db.accountMapping.findFirst({ where: { key }, select: { id: true } });
  if (cur) await db.accountMapping.update({ where: { id: cur.id }, data: { accountId } });
  else await db.accountMapping.create({ data: { key, accountId } as Prisma.AccountMappingUncheckedCreateInput });
  return { ok: true };
}
