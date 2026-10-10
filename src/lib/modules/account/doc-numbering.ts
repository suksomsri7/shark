// doc-numbering.ts — เครื่องออกเลขที่เอกสาร (WO 8.1 · §9.2 "เลขที่เอกสาร")
//
// ที่เดียวในระบบที่รู้ว่า "เลขที่เอกสารหน้าตาเป็นยังไง และตัวถัดไปคือเลขอะไร"
// ก่อนหน้านี้มี 2 สูตรที่คัดลอกกัน (service.ts ฝั่งรายรับ · expense.ts ฝั่งรายจ่าย) ซึ่ง
//   · ฝั่งรายจ่าย **ไม่อ่านตั้งค่าเลย** (ตั้งค่าใน docConfig ไม่มีผล)
//   · ฝั่งรายจ่ายใช้ `date.getFullYear()/getMonth()` = TZ ของเครื่อง ⇒ บน VPS (UTC) เอกสารที่ออก
//     คืนวันที่ 1 เวลาไทย จะได้เลขของเดือนก่อน (กับดัก getDay() เดียวกับที่เคยเจอ)
// ⇒ ยุบเหลือสูตรเดียวที่นี่ · ทั้ง 2 ฝั่งเรียกตัวนี้
//
// 🔴 ไฟล์นี้ไม่ import prisma (fitness F5.1 ล็อกไว้ 45 ไฟล์) — รับ client/tx เข้ามาเป็นพารามิเตอร์
//    ซึ่งจำเป็นอยู่แล้ว: การจองเลขต้องอยู่ใน transaction เดียวกับการ insert เอกสาร
import type { AccountDocType, Prisma } from "@prisma/client";
import { toSeqReset, type SeqConfig, type SeqReset } from "./settings-schema";

/**
 * client ที่ใช้ query ได้ — ผู้เรียกส่ง transaction client (ตอนออกเลขจริง) หรือ prisma/tenantDb (ตอนดูอย่างเดียว)
 * `Prisma.TransactionClient` = PrismaClient ที่ตัดคำสั่งระดับ connection ออก ⇒ ตัวเต็มก็ส่งเข้ามาได้
 */
export type NumberingDb = Prisma.TransactionClient;

// ─────────────────── วันที่ไทย ───────────────────

/** วันที่ตามเวลาไทย (Asia/Bangkok) → ปี/เดือน/วัน เป็นสตริง — ไม่พึ่ง TZ ของเครื่อง */
export function bkkParts(date: Date): { year: string; month: string; day: string } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return { year: s.slice(0, 4), month: s.slice(5, 7), day: s.slice(8, 10) };
}

// ─────────────────── ไวยากรณ์รูปแบบเลขที่ ───────────────────
//
// ตัวแปรที่ใช้ได้ (ไทยและอังกฤษเทียบเท่ากันทุกตัว — เจ้าของร้านพิมพ์ไทย นักบัญชีบางคนพิมพ์อังกฤษ):
//   {ปี}       {YYYY}   ปี ค.ศ. 4 หลัก (เวลาไทย)            → 2026
//   {ปีสั้น}   {YY}     ปี 2 หลักท้าย                        → 26
//   {เดือน}    {MM}     เดือน 2 หลัก                         → 10
//   {วัน}      {DD}     วัน 2 หลัก                           → 05
//   {0000}              ลำดับ เติมศูนย์ = จำนวน 0 ที่พิมพ์    → 0001 · {00000} → 00001
//   {สาขา}     {BR}     รหัสสาขาที่ออกเอกสาร                 → 00000
//   {คำนำหน้า} {PREFIX} คำนำหน้าของชนิดเอกสารนั้น            → IV
//   {SEQ}               (ของเดิม) = {0000}
// อะไรที่ไม่รู้จัก ปล่อยไว้ตามที่พิมพ์ — ผู้ใช้จะเห็นเองในช่อง "ตัวอย่างเลขถัดไป" ว่าพิมพ์ผิด

export type DocNoVars = {
  prefix: string;
  /** วันที่ของเอกสาร (ใช้หาปี/เดือนตามเวลาไทย) */
  date: Date;
  /** ลำดับที่ (1 = ใบแรกของงวด) */
  seq: number;
  /** รหัสสาขา — ว่าง = "00000" (สำนักงานใหญ่) */
  branchCode?: string | null;
};

/** รูปแบบเริ่มต้นเมื่อผู้ใช้ยังไม่ตั้งเอง — คงสูตรเดิมของระบบเป๊ะ (ห้ามเปลี่ยน: ร้านที่ใช้อยู่จะได้เลขคนละแบบกลางคัน) */
export function defaultPattern(prefix: string, reset: SeqReset): string {
  if (reset === "NONE") return `${prefix}-{0000}`;
  if (reset === "YEAR") return `${prefix}-{ปี}-{0000}`;
  return `${prefix}-{ปี}-{เดือน}-{0000}`;
}

/**
 * แทนค่าตัวแปรในรูปแบบ → เลขที่เอกสาร
 * ตรรกะบริสุทธิ์ (ไม่แตะ DB) — เทสได้ตรง ๆ และ "ตัวอย่าง live" บนหน้าตั้งค่าใช้ตัวเดียวกับตอนออกเลขจริง
 */
export function formatDocNo(pattern: string, vars: DocNoVars): string {
  const { year, month, day } = bkkParts(vars.date);
  const branch = (vars.branchCode ?? "").trim() || "00000";
  return pattern.replace(/\{([^{}]*)\}/g, (whole, token: string) => {
    const t = token.trim();
    // {0000} — ความกว้าง = จำนวนศูนย์ที่พิมพ์
    if (/^0+$/.test(t)) return String(vars.seq).padStart(t.length, "0");
    switch (t) {
      case "ปี":
      case "YYYY":
        return year;
      case "ปีสั้น":
      case "YY":
        return year.slice(2);
      case "เดือน":
      case "MM":
        return month;
      case "วัน":
      case "DD":
        return day;
      case "สาขา":
      case "BR":
        return branch;
      case "คำนำหน้า":
      case "PREFIX":
        return vars.prefix;
      case "SEQ":
        return String(vars.seq).padStart(4, "0");
      default:
        return whole; // ไม่รู้จัก = ปล่อยตามที่พิมพ์
    }
  });
}

/** คีย์งวดที่คุมการรีเซ็ต — คงค่าเดิมของระบบ ("-" สำหรับไม่รีเซ็ต) ไม่งั้นแถวเลขรันเดิมกำพร้าแล้วเลขเริ่มใหม่ทับของเก่า */
export function periodKeyOf(reset: SeqReset, year: string, month: string): string {
  if (reset === "NONE") return "-";
  if (reset === "YEAR") return year;
  return `${year}-${month}`;
}

// ─────────────────── อ่านตั้งค่าของชนิดเอกสาร ───────────────────

export type ResolvedSeq = SeqConfig & { effectivePattern: string; branchCode: string };

/** รวมตั้งค่าที่ผู้ใช้ตั้ง + ค่าเริ่มต้นของระบบ ให้เป็นชุดที่ "พร้อมใช้ออกเลข" */
export function resolveSeqConfig(input: {
  configured?: Partial<SeqConfig> | null;
  fallbackPrefix: string;
  branchCode?: string | null;
}): ResolvedSeq {
  const prefix = (input.configured?.prefix ?? "").trim() || input.fallbackPrefix;
  const reset = toSeqReset(input.configured?.reset);
  const pattern = (input.configured?.pattern ?? "").trim();
  return {
    prefix,
    pattern,
    reset,
    effectivePattern: pattern || defaultPattern(prefix, reset),
    branchCode: (input.branchCode ?? "").trim() || "00000",
  };
}

/** อ่าน docConfig + รหัสสาขาของระบบบัญชี (1 query) */
export async function loadNumberingContext(
  db: NumberingDb,
  systemId: string,
  docType: AccountDocType,
  fallbackPrefix: string,
): Promise<ResolvedSeq> {
  const row = await db.accountSettings.findFirst({
    where: { systemId },
    select: { docConfig: true, branchCode: true },
  });
  const seqs = (row?.docConfig as Record<string, unknown> | null)?.sequences as
    | Record<string, Partial<SeqConfig>>
    | undefined;
  return resolveSeqConfig({
    configured: seqs?.[docType] ?? null,
    fallbackPrefix,
    branchCode: row?.branchCode ?? null,
  });
}

/**
 * ตัวอย่างเลขถัดไปแบบไม่แตะ DB — ตารางในหน้าตั้งค่า (ฝั่งเบราว์เซอร์) ใช้ตอนผู้ใช้กำลังพิมพ์
 * ใช้ `formatDocNo` ตัวเดียวกับตอนออกเลขจริง ⇒ ตัวอย่างกับเลขจริงจะไม่มีวันคิดคนละสูตร
 */
export function previewExample(input: {
  prefix: string;
  pattern: string;
  reset: SeqReset;
  nextNo: number;
  date: Date;
  branchCode?: string | null;
}): string {
  const cfg = resolveSeqConfig({
    configured: { prefix: input.prefix, pattern: input.pattern, reset: input.reset },
    fallbackPrefix: input.prefix || "DOC",
    branchCode: input.branchCode,
  });
  return formatDocNo(cfg.effectivePattern, {
    prefix: cfg.prefix,
    date: input.date,
    seq: input.nextNo,
    branchCode: cfg.branchCode,
  });
}

// ─────────────────── ตัวนับ (race-safe) ───────────────────

/**
 * ลำดับสูงสุดที่ "ใช้ไปแล้วจริง" ของงวดนี้ — อ่านจากเลขที่เอกสารที่ออกไปแล้ว
 *
 * 🔴 ทำไมต้องมี (ความเข้ากันได้ย้อนหลัง): ถ้าเจ้าของเปลี่ยนนโยบายรีเซ็ต (รายเดือน → รายปี) หรือมาจาก
 *    ระบบเดิมที่ยังไม่เคยมีแถวใน AccountDocSequence งวดใหม่จะเริ่มที่ 0001 แล้ว **ชนเลขที่ออกไปแล้ว**
 *    ⇒ ก่อนสร้างแถวใหม่ ให้ไปดูก่อนว่าเอกสารชนิดนี้ในงวดนี้ ใช้เลขไปถึงไหนแล้ว แล้วเริ่มต่อจากนั้น
 *    (ดึงเฉพาะเลขท้ายที่เป็นตัวเลข — ทุกรูปแบบที่ระบบออกให้ลงท้ายด้วยลำดับเสมอ)
 */
export async function legacyMaxSeq(
  db: NumberingDb,
  systemId: string,
  docType: AccountDocType,
  reset: SeqReset,
  year: string,
  month: string,
  /** CRM C5.4-N ▸ (N-1) นับเฉพาะเลขของ "ชุดเดียวกัน" — regex จาก `seriesMatcher` (กลุ่มที่ 1 = ลำดับ)
   *  เดิมนับทุกเอกสารชนิดเดียวกันในงวด ⇒ WHT_CERT ฝั่งลูกค้าหัก (WTI-…) ถูกนับเข้าเลข 50 ทวิ (WHT-…) ⇒ 50 ทวิ ใบแรกของเดือนได้เลข 21
   *  ไม่ส่ง = พฤติกรรมเดิม (ตัวเลขท้ายของทุกเลข) ◂ */
  series?: RegExp | null,
): Promise<number> {
  const where: Record<string, unknown> = { systemId, docType, docNo: { not: null } };
  if (reset !== "NONE") {
    // ขอบเขตงวดตามเวลาไทย → แปลงเป็นช่วง UTC (ไทย = UTC+7 ตลอดปี ไม่มี DST)
    const startY = Number.parseInt(year, 10);
    const startM = reset === "YEAR" ? 1 : Number.parseInt(month, 10);
    const endM = reset === "YEAR" ? 13 : startM + 1;
    where.issueDate = {
      gte: new Date(Date.UTC(startY, startM - 1, 1) - 7 * 3_600_000),
      lt: new Date(Date.UTC(startY, endM - 1, 1) - 7 * 3_600_000),
    };
  }
  const rows = await db.accountDocument.findMany({
    where: where as Prisma.AccountDocumentWhereInput,
    select: { docNo: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = (series ?? /(\d+)\s*$/).exec(r.docNo ?? "");
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max && n < 1_000_000) max = n;
  }
  return max;
}

const reEscape = (v: string) => v.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/**
 * CRM C5.4-N ▸ (N-1) regex ของ "ชุดเลข" ที่รูปแบบนี้ออกในงวดนี้ — ใช้กรองเลขเดิมตอนเริ่มตัวนับใหม่ (`legacyMaxSeq`)
 *   ตัวแปรที่ละเอียดกว่างวดรีเซ็ต (วัน · เดือนเมื่อรีเซ็ตรายปี · ปีเมื่อไม่รีเซ็ต) = ตัวเลขอะไรก็ได้ ⇒ ทุกเลขที่รูปแบบนี้ออกในงวดนี้ match เสมอ
 *   (ไม่มีทางพลาดเลขที่ชนได้) · ลำดับตัวแรก = กลุ่มที่ 1 · ไม่มีช่องลำดับในรูปแบบ = null (ใช้พฤติกรรมเดิม) ◂
 */
export function seriesMatcher(
  pattern: string,
  vars: { prefix: string; date: Date; branchCode?: string | null },
  reset: SeqReset,
): RegExp | null {
  const { year, month } = bkkParts(vars.date);
  const branch = (vars.branchCode ?? "").trim() || "00000";
  let out = "";
  let seq = false;
  let last = 0;
  const tok = /\{([^{}]*)\}/g;
  for (let m = tok.exec(pattern); m; m = tok.exec(pattern)) {
    out += reEscape(pattern.slice(last, m.index));
    last = m.index + m[0].length;
    const t = m[1].trim();
    if (/^0+$/.test(t) || t === "SEQ") {
      out += seq ? "\\d+" : "(\\d+)";
      seq = true;
      continue;
    }
    switch (t) {
      case "ปี":
      case "YYYY":
        out += reset === "NONE" ? "\\d{4}" : year;
        break;
      case "ปีสั้น":
      case "YY":
        out += reset === "NONE" ? "\\d{2}" : year.slice(2);
        break;
      case "เดือน":
      case "MM":
        out += reset === "MONTH" ? month : "\\d{2}";
        break;
      case "วัน":
      case "DD":
        out += "\\d{2}";
        break;
      case "สาขา":
      case "BR":
        out += reEscape(branch);
        break;
      case "คำนำหน้า":
      case "PREFIX":
        out += reEscape(vars.prefix);
        break;
      default:
        out += reEscape(m[0]);
    }
  }
  out += reEscape(pattern.slice(last));
  return seq ? new RegExp(`^${out}\\s*$`) : null;
}

const seriesOfCfg = (cfg: ResolvedSeq, date: Date) =>
  seriesMatcher(cfg.effectivePattern, { prefix: cfg.prefix, date, branchCode: cfg.branchCode }, cfg.reset);

/**
 * จองลำดับถัดไปของ (systemId, docType, periodKey) — **จบใน SQL คำสั่งเดียว**
 *
 * 🔴 ทำไมไม่ใช้ read-then-write หรือ Prisma upsert ธรรมดา: ตัวนับร่วมที่แยกเป็น 2 คำสั่ง
 *    จะนับพลาดเมื่อมีคนกดออกเอกสารพร้อมกัน (บทเรียนที่จดไว้: "ตัวนับร่วมต้องจบใน SQL คำสั่งเดียว")
 *    `INSERT … ON CONFLICT DO UPDATE SET lastNo = lastNo + 1 RETURNING lastNo` = atomic จริงระดับแถว
 *    · ผู้ชนะได้ startNo · ที่เหลือชน conflict แล้ว +1 ต่อกันไป ⇒ ไม่มีเลขซ้ำ ไม่มีเลขหาย
 */
export async function reserveSeq(
  db: NumberingDb,
  input: { tenantId: string; systemId: string; docType: AccountDocType; prefix: string; periodKey: string; startNo: number },
): Promise<number> {
  const id = `seq_${input.systemId.slice(-8)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const rows = (await db.$queryRawUnsafe(
    `INSERT INTO "AccountDocSequence" ("id","tenantId","systemId","docType","prefix","periodKey","lastNo","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4::"AccountDocType",$5,$6,$7,NOW(),NOW())
     ON CONFLICT ("systemId","docType","periodKey")
     DO UPDATE SET "lastNo" = "AccountDocSequence"."lastNo" + 1, "updatedAt" = NOW()
     RETURNING "lastNo"`,
    id,
    input.tenantId,
    input.systemId,
    input.docType,
    input.prefix,
    input.periodKey,
    input.startNo,
  )) as { lastNo: number }[];
  return Number(rows[0]?.lastNo ?? input.startNo);
}

/**
 * ออกเลขที่เอกสารตัวถัดไป (จองจริง — กินเลข) · ต้องเรียกใน transaction เดียวกับการ insert เอกสาร
 * `db` = transaction client เสมอ
 */
export async function issueDocNo(
  db: NumberingDb,
  input: {
    tenantId: string;
    systemId: string;
    docType: AccountDocType;
    fallbackPrefix: string;
    date: Date;
  },
): Promise<string> {
  const cfg = await loadNumberingContext(db, input.systemId, input.docType, input.fallbackPrefix);
  const { year, month } = bkkParts(input.date);
  const periodKey = periodKeyOf(cfg.reset, year, month);
  // ยังไม่มีแถวของงวดนี้ = งวดใหม่/เพิ่งเปลี่ยนนโยบาย → เริ่มต่อจากเลขที่ออกไปแล้วจริง
  const existing = await db.accountDocSequence.findUnique({
    where: { systemId_docType_periodKey: { systemId: input.systemId, docType: input.docType, periodKey } },
    select: { lastNo: true },
  });
  const startNo = existing
    ? existing.lastNo + 1
    : (await legacyMaxSeq(db, input.systemId, input.docType, cfg.reset, year, month, seriesOfCfg(cfg, input.date))) + 1;
  const seq = await reserveSeq(db, {
    tenantId: input.tenantId,
    systemId: input.systemId,
    docType: input.docType,
    prefix: cfg.prefix,
    periodKey,
    startNo,
  });
  return formatDocNo(cfg.effectivePattern, {
    prefix: cfg.prefix,
    date: input.date,
    seq,
    branchCode: cfg.branchCode,
  });
}

/**
 * เลขที่ "ถัดไป" แบบดูอย่างเดียว — สำหรับฟอร์มร่างและช่อง "ตัวอย่างเลขถัดไป" ในหน้าตั้งค่า
 * 🔴 ห้ามเขียนอะไรลง AccountDocSequence: ร่างต้องไม่กินเลข (เลขจริงจองตอนออกเอกสารเท่านั้น)
 *    ⇒ ค่านี้เป็น "คาดว่าจะได้" ถ้ามีคนอื่นออกเอกสารก่อน เลขจริงจะขยับ (จงใจ)
 */
export async function peekDocNo(
  db: NumberingDb,
  input: {
    systemId: string;
    docType: AccountDocType;
    fallbackPrefix: string;
    date: Date;
    /** ทับตั้งค่าที่บันทึกไว้ (หน้าตั้งค่าใช้ตอนผู้ใช้กำลังพิมพ์ ยังไม่กดบันทึก) */
    override?: Partial<SeqConfig> | null;
  },
): Promise<string> {
  const saved = await loadNumberingContext(db, input.systemId, input.docType, input.fallbackPrefix);
  const cfg = input.override
    ? resolveSeqConfig({
        configured: { prefix: saved.prefix, pattern: saved.pattern, reset: saved.reset, ...input.override },
        fallbackPrefix: input.fallbackPrefix,
        branchCode: saved.branchCode,
      })
    : saved;
  const { year, month } = bkkParts(input.date);
  const periodKey = periodKeyOf(cfg.reset, year, month);
  const existing = await db.accountDocSequence.findUnique({
    where: { systemId_docType_periodKey: { systemId: input.systemId, docType: input.docType, periodKey } },
    select: { lastNo: true },
  });
  const next = existing
    ? existing.lastNo + 1
    : (await legacyMaxSeq(db, input.systemId, input.docType, cfg.reset, year, month, seriesOfCfg(cfg, input.date))) + 1;
  return formatDocNo(cfg.effectivePattern, {
    prefix: cfg.prefix,
    date: input.date,
    seq: next,
    branchCode: cfg.branchCode,
  });
}

/**
 * ตั้ง "เลขถัดไป" เอง (§9.2 — ช่องเลขถัดไปแก้ได้)
 * ปฏิเสธถ้าเลขที่ขอ ≤ เลขที่ใช้ไปแล้วในงวดเดียวกัน — ย้อนกลับ = ออกเลขซ้ำกับเอกสารที่ยื่นภาษีไปแล้ว
 */
export async function setNextNo(
  db: NumberingDb,
  input: {
    tenantId: string;
    systemId: string;
    docType: AccountDocType;
    fallbackPrefix: string;
    date: Date;
    nextNo: number;
  },
): Promise<{ ok: true; nextNo: number } | { ok: false; reason: string }> {
  if (!Number.isInteger(input.nextNo) || input.nextNo < 1 || input.nextNo > 999_999)
    return { ok: false, reason: "เลขถัดไปต้องเป็นจำนวนเต็ม 1–999999" };
  const cfg = await loadNumberingContext(db, input.systemId, input.docType, input.fallbackPrefix);
  const { year, month } = bkkParts(input.date);
  const periodKey = periodKeyOf(cfg.reset, year, month);
  const existing = await db.accountDocSequence.findUnique({
    where: { systemId_docType_periodKey: { systemId: input.systemId, docType: input.docType, periodKey } },
    select: { lastNo: true },
  });
  const used = existing
    ? existing.lastNo
    : await legacyMaxSeq(db, input.systemId, input.docType, cfg.reset, year, month, seriesOfCfg(cfg, input.date));
  if (input.nextNo <= used)
    return {
      ok: false,
      reason: `งวดนี้ออกเลขไปถึง ${used} แล้ว — ตั้งเลขถัดไปได้ตั้งแต่ ${used + 1} ขึ้นไป (ย้อนกลับจะได้เลขซ้ำกับเอกสารที่ออกไปแล้ว)`,
    };
  // lastNo = "เลขล่าสุดที่ใช้ไป" ⇒ อยากให้ใบถัดไปได้ n ต้องตั้ง lastNo = n-1
  await db.$queryRawUnsafe(
    `INSERT INTO "AccountDocSequence" ("id","tenantId","systemId","docType","prefix","periodKey","lastNo","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4::"AccountDocType",$5,$6,$7,NOW(),NOW())
     ON CONFLICT ("systemId","docType","periodKey")
     DO UPDATE SET "lastNo" = $7, "updatedAt" = NOW()`,
    `seq_${input.systemId.slice(-8)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    input.tenantId,
    input.systemId,
    input.docType,
    cfg.prefix,
    periodKey,
    input.nextNo - 1,
  );
  return { ok: true, nextNo: input.nextNo };
}

/**
 * ตรวจ "ข้ามลำดับ" (§9.2 — เตือนเมื่อเลขที่เอกสารข้ามลำดับ)
 * คืนลำดับที่หายไปในงวดปัจจุบัน (สูงสุด 20 ตัว) — ว่าง = ไม่มีช่องว่าง
 */
export async function findSeqGaps(
  db: NumberingDb,
  input: { systemId: string; docType: AccountDocType; fallbackPrefix: string; date: Date },
): Promise<number[]> {
  const cfg = await loadNumberingContext(db, input.systemId, input.docType, input.fallbackPrefix);
  const { year, month } = bkkParts(input.date);
  const where: Record<string, unknown> = { systemId: input.systemId, docType: input.docType, docNo: { not: null } };
  if (cfg.reset !== "NONE") {
    const startY = Number.parseInt(year, 10);
    const startM = cfg.reset === "YEAR" ? 1 : Number.parseInt(month, 10);
    const endM = cfg.reset === "YEAR" ? 13 : startM + 1;
    where.issueDate = {
      gte: new Date(Date.UTC(startY, startM - 1, 1) - 7 * 3_600_000),
      lt: new Date(Date.UTC(startY, endM - 1, 1) - 7 * 3_600_000),
    };
  }
  const rows = await db.accountDocument.findMany({
    where: where as Prisma.AccountDocumentWhereInput,
    select: { docNo: true },
  });
  const seen = new Set<number>();
  let max = 0;
  for (const r of rows) {
    const m = /(\d+)\s*$/.exec(r.docNo ?? "");
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1 || n >= 1_000_000) continue;
    seen.add(n);
    if (n > max) max = n;
  }
  const gaps: number[] = [];
  for (let i = 1; i < max && gaps.length < 20; i++) if (!seen.has(i)) gaps.push(i);
  return gaps;
}

/** ชนิดของ transaction client ที่ service.ts/expense.ts ส่งเข้ามา (แปลงให้ตรงกับ NumberingDb) */
export type NumberingTx = Prisma.TransactionClient;

// ═══════════════════ CRM C5.4-N ▸ เลขเอกสารภาษี/ทางกฎหมาย จองที่ "ท้ายธุรกรรม" (LOCK ORDER ขั้น 7 · service.ts หัวไฟล์) ═══════════════════
//
// ทำไม: แถวตัวนับ AccountDocSequence = ล็อกแถวที่ถือจนธุรกรรม commit (ต้องเป็นอย่างนั้น — เลขต้องต่อเนื่อง ไม่หายเมื่อย้อนกลับ)
//   เดิมจองกลางธุรกรรมเงิน (ก่อน/ระหว่างลงบัญชี) ⇒ ชุดรับชำระ 40 ใบ (18 วินาที) ถือแถวตัวนับใบกำกับภาษีทั้ง 18 วินาที
//   ⇒ ทุกคนที่ออกใบกำกับภาษีของร้านรอ 16–18 วินาที (probe H · oracle N6) และล็อกนี้อยู่กลางลำดับล็อก (เสี่ยงวงจรรอกัน)
// วิธี: เอกสารที่สร้างในธุรกรรมเงิน (ใบกำกับภาษีอัตโนมัติ · WTI · 50 ทวิ · ใบกำกับภาษีซื้อรอรับ) สร้างด้วย docNo = null แล้ว
//   `deferDocNo` จดไว้ → ตัวห่อธุรกรรมเรียก `finalizeDocNos(tx)` เป็นคำสั่งสุดท้าย: จองทีละกลุ่ม (ชนิด, งวด) ตามลำดับคงที่
//   (ลำดับ enum AccountDocType แล้ว periodKey) กลุ่มละ 1 คำสั่ง แล้วประทับเลขตามลำดับที่สร้างด้วย UPDATE เดียว
//   ⇒ ถือแถวตัวนับแค่ช่วงท้าย (1 UPSERT + 1 UPDATE + commit) · เป็นล็อกสุดท้ายเสมอ ⇒ ไม่มีวงจรรอผ่านตัวนับ
// ด่าน: `deferDocNo` บนธุรกรรมที่ไม่ได้ `openDocNumbering` = throw (ลืมห่อ = ล้มดัง ๆ ไม่ใช่ใบกำกับภาษีไม่มีเลข)
// ยังไม่ย้าย (phase 2 · ใบติดตามใน ledger/wo-notes/crm-C5.4-N.md): เลขของตัวเอกสารเองใน issueDocument / issueExpenseDoc (ใช้ issueDocNo)

/** ชุดเลขของเอกสารที่รอเลข — "configured" = ตามตั้งค่าเลขที่เอกสาร (เหมือน issueDocNo) · "wti" = เอกสารภาษีถูกหัก ฝั่งขาย */
export type DeferredSeries =
  | { kind: "configured"; docType: AccountDocType; fallbackPrefix: string }
  | { kind: "wti" };

type PendingDocNo = { docId: string; tenantId: string; systemId: string; date: Date; series: DeferredSeries };

/** ลำดับล็อกของแถวตัวนับ = ลำดับ enum AccountDocType ใน schema (คอมไพล์ล้มถ้า enum มีชนิดใหม่ที่ไม่อยู่ในรายการ) */
const DOC_TYPE_LOCK_ORDER = [
  "QUOTATION", "INVOICE", "RECEIPT", "TAX_INVOICE", "TAX_INVOICE_ABB", "DEPOSIT_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE",
  "BILLING_NOTE", "PURCHASE", "EXPENSE", "PURCHASE_ORDER", "ASSET_PURCHASE_ORDER", "ASSET_PURCHASE", "PURCHASE_TAX_INVOICE",
  "DEPOSIT_PAYMENT", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED", "COMBINED_PAYMENT", "GOODS_ISSUE", "GOODS_ISSUE_RETURN",
  "COST_ADJUSTMENT", "WHT_CERT",
] as const satisfies readonly AccountDocType[];
type MissingFromLockOrder = Exclude<AccountDocType, (typeof DOC_TYPE_LOCK_ORDER)[number]>;
const lockOrderIsComplete: MissingFromLockOrder extends never ? true : false = true;
void lockOrderIsComplete;

const pendingByTx = new WeakMap<object, PendingDocNo[]>();

/** เปิด "ตัวออกเลขท้ายธุรกรรม" ให้ธุรกรรมนี้ — เรียกเป็นคำสั่งแรกของตัวห่อ (คู่กับ finalizeDocNos ท้ายสุด) */
export function openDocNumbering(tx: NumberingDb): void {
  if (!pendingByTx.has(tx)) pendingByTx.set(tx, []);
}

/** จดเอกสารที่เพิ่งสร้าง (docNo = null) ไว้ออกเลขตอนท้ายธุรกรรม */
export function deferDocNo(
  tx: NumberingDb,
  input: { docId: string; tenantId: string; systemId: string; date: Date; series: DeferredSeries },
): void {
  const list = pendingByTx.get(tx);
  if (!list)
    throw new Error("ระบบออกเลขเอกสารยังไม่พร้อมในรายการนี้ — ไม่มีอะไรถูกบันทึก กรุณาลองใหม่ (C5.4-N: deferDocNo without openDocNumbering)");
  list.push({ ...input });
}

type ResolvedPending = PendingDocNo & {
  docType: AccountDocType;
  periodKey: string;
  prefix: string;
  format: (n: number) => string;
  series: DeferredSeries;
  seriesRe: RegExp | null;
  reset: SeqReset;
  year: string;
  month: string;
};

/**
 * ออกเลขให้ทุกเอกสารที่ `deferDocNo` จดไว้ในธุรกรรมนี้ — **ต้องเป็นคำสั่งสุดท้ายของธุรกรรม** (หลังจากนี้แตะได้แค่แถวที่ธุรกรรมนี้สร้างเอง/outbox)
 * คืน docId → docNo (ให้ตัวห่อใส่ในผลลัพธ์ เช่น whtCertNo / certNos)
 */
export async function finalizeDocNos(tx: NumberingDb): Promise<Map<string, string>> {
  const list = pendingByTx.get(tx) ?? [];
  pendingByTx.set(tx, []);
  const out = new Map<string, string>();
  if (list.length === 0) return out;

  // 1) ชุดเลขของแต่ละใบ (อ่านตั้งค่าครั้งเดียวต่อชนิด) — ยังไม่ล็อกอะไร
  const cfgCache = new Map<string, ResolvedSeq>();
  const resolved: ResolvedPending[] = [];
  for (const p of list) {
    const { year, month } = bkkParts(p.date);
    if (p.series.kind === "wti") {
      // เอกสารภาษีถูกหัก ณ ที่จ่าย (ฝั่งขาย) — ตารางเลขรันร่วม คนละ periodKey ("WTI:YYYY-MM") ⇒ ไม่กินเลข 50 ทวิ (WHT-) · เดือนไทย
      const ym = `${year}${month}`;
      resolved.push({
        ...p, docType: "WHT_CERT", periodKey: `WTI:${year}-${month}`, prefix: "WTI",
        format: (n) => `WTI-${ym}-${String(n).padStart(4, "0")}`,
        seriesRe: new RegExp(`^WTI-${ym}-(\\d+)\\s*$`), reset: "MONTH", year, month,
      });
      continue;
    }
    const { docType, fallbackPrefix } = p.series;
    const ck = `${p.systemId}|${docType}`;
    let cfg = cfgCache.get(ck);
    if (!cfg) {
      cfg = await loadNumberingContext(tx, p.systemId, docType, fallbackPrefix);
      cfgCache.set(ck, cfg);
    }
    const c = cfg;
    resolved.push({
      ...p, docType, periodKey: periodKeyOf(c.reset, year, month), prefix: c.prefix,
      format: (n) => formatDocNo(c.effectivePattern, { prefix: c.prefix, date: p.date, seq: n, branchCode: c.branchCode }),
      seriesRe: seriesOfCfg(c, p.date), reset: c.reset, year, month,
    });
  }

  // 2) กลุ่ม (ระบบ, ชนิด, งวด) เรียงตามลำดับล็อกคงที่ — ลำดับในกลุ่ม = ลำดับที่สร้าง
  const groups = new Map<string, ResolvedPending[]>();
  for (const r of resolved) {
    const k = `${r.systemId}\u0000${r.docType}\u0000${r.periodKey}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const x = a[0], y = b[0];
    if (x.systemId !== y.systemId) return x.systemId < y.systemId ? -1 : 1;
    const dx = DOC_TYPE_LOCK_ORDER.indexOf(x.docType), dy = DOC_TYPE_LOCK_ORDER.indexOf(y.docType);
    if (dx !== dy) return dx - dy;
    return x.periodKey < y.periodKey ? -1 : x.periodKey > y.periodKey ? 1 : 0;
  });

  // 3) จองช่วงเลขกลุ่มละ 1 คำสั่ง (INSERT … ON CONFLICT DO UPDATE lastNo + k) แล้วประทับเลขทั้งหมดด้วย UPDATE เดียว
  const stamps: [string, string][] = [];
  for (const g of ordered) {
    const h = g[0];
    const k = g.length;
    // ยังไม่มีแถวของงวดนี้ = งวดใหม่ → เริ่มต่อจากเลขที่ออกไปแล้วจริง "ของชุดเดียวกัน" (N-1) · มีแถวแล้ว = ค่านี้ไม่ถูกใช้ (ON CONFLICT)
    const existing = await tx.accountDocSequence.findUnique({
      where: { systemId_docType_periodKey: { systemId: h.systemId, docType: h.docType, periodKey: h.periodKey } },
      select: { lastNo: true },
    });
    const startNo = existing ? 0 : (await legacyMaxSeq(tx, h.systemId, h.docType, h.reset, h.year, h.month, h.seriesRe)) + 1;
    const rows = (await tx.$queryRawUnsafe(
      `INSERT INTO "AccountDocSequence" ("id","tenantId","systemId","docType","prefix","periodKey","lastNo","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4::"AccountDocType",$5,$6,$7,NOW(),NOW())
       ON CONFLICT ("systemId","docType","periodKey")
       DO UPDATE SET "lastNo" = "AccountDocSequence"."lastNo" + $8, "updatedAt" = NOW()
       RETURNING "lastNo"`,
      `seq_${h.systemId.slice(-8)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      h.tenantId,
      h.systemId,
      h.docType,
      h.prefix,
      h.periodKey,
      Math.max(1, startNo) + k - 1,
      k,
    )) as { lastNo: number }[];
    const last = Number(rows[0]?.lastNo);
    if (!Number.isFinite(last)) throw new Error("จองเลขที่เอกสารไม่สำเร็จ");
    g.forEach((r, i) => {
      const no = r.format(last - k + 1 + i);
      stamps.push([r.docId, no]);
      out.set(r.docId, no);
    });
  }
  const params: string[] = [];
  const values = stamps.map(([id, no], i) => { params.push(id, no); return `($${2 * i + 1}, $${2 * i + 2})`; }).join(", ");
  const stamped = await tx.$executeRawUnsafe(
    `UPDATE "AccountDocument" AS d SET "docNo" = v.no, "updatedAt" = NOW() FROM (VALUES ${values}) AS v(id, no) WHERE d."id" = v.id AND d."docNo" IS NULL`,
    ...params,
  );
  // ใบที่จดไว้ต้องได้เลขครบทุกใบ — ไม่ครบ = ย้อนทั้งธุรกรรม (ไม่มีทางมีเอกสารภาษีออกแล้วแต่ไม่มีเลข / เลขถูกจองแต่ไม่ได้ใช้)
  if (Number(stamped) !== stamps.length) throw new Error("ออกเลขที่เอกสารไม่ครบ — ไม่มีอะไรถูกบันทึก กรุณาลองใหม่");
  return out;
}
