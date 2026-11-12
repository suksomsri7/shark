// HR H3.5 ▸ ไฟล์โอนเงินเดือน — service (server เท่านั้น) · brief hr-brief-H3.5 R9–R13 · รูปร่าง wo-notes/hr-H3.5-oracle.md §2
//   ด่าน (R10): OWNER หรือ (permissions["hr.payroll.read"] และ permissions["hr.payroll.pay"] และทุกสาขา) — บทบาท MANAGER อย่างเดียวไม่ผ่าน ·
//     อ่านสมาชิกภาพจริงจากฐาน (ผู้ใช้ + ร้าน + บทบาทตรงกับที่ส่งมา) และต้องผ่านทั้งค่าในฐานและค่าที่ผู้เรียกส่งมา ·
//     ไม่ผ่าน / ไม่พบรอบ / ไฟล์ของระบบอื่น / ร้านอื่น = {ok:false, code:"NO", reason: BANK_TEXT.no} ไบต์เดียวกันทุกกรณี (ไม่บอกว่าเพราะอะไร)
//   ไม่เก็บไบต์ไฟล์ (Q2): สร้าง = ใบกำกับ HrBankFile (sha256 · จำนวน · ยอด · ตัวเลือกที่ใช้) · ดาวน์โหลด = สร้างใหม่ด้วยตัวเลือกเดิม + เวลาเดิม
//     แล้วเทียบ sha — ข้อมูลเปลี่ยน = CHANGED · หมดอายุ 7 วัน (Q13) · ไม่เปลี่ยนรอบจ่ายเลย (ไม่มีแถวรอบ/รายการ/รายการเพิ่ม-หัก/outbox — Q12)
//   อ่านรอบ + รายการ + พนักงานในธุรกรรมเดียว โดยถือแถวรอบแบบ FOR SHARE (กลับรายการพร้อมกัน = รออีกฝั่ง ไม่มีไฟล์ของรอบที่กลับแล้ว)
//   🔴 เลขบัญชี/ชื่อ/ไบต์ ไม่ลงประวัติ · log · outbox · ใบกำกับ · DTO ถึงเบราว์เซอร์มีเลขบัญชีแบบ •••4 ตัวท้ายเท่านั้น ◂
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { hrScopeOf, isAllBranches } from "../scope";
import {
  BANK_FORMATS,
  BANK_PRESETS,
  BANK_TEXT,
  bangkokParts,
  buildBankFile,
  isFixedFormat,
  refusalText,
  type BankFormat,
  type BankOptions,
  type BankPayee,
  type BankProfileInput,
  type BuildResult,
  type FixedFormat,
  type GenericSpec,
} from "./build";
import { AMOUNT_STYLES, CSV_ENCODINGS, DATE_STYLES, GENERIC_MAX_COLUMNS, columnProblem, genericSpecOf, isPresetKey } from "./generic";
import { BANK_CODES } from "./codes";
import { printableAscii } from "./encode";

type Ctx = { tenantId: string; systemId: string };
export type BankViewer = { role: string; unitAccess: unknown; permissions: unknown; userId?: string | null };
type Opts = { now?: Date };
type Db = Prisma.TransactionClient;
export type BankNo = { ok: false; code: "NO"; reason: string };
export type BankFail = { ok: false; code: string; reason: string; employees?: { employeeId: string; name: string }[]; notIncluded?: NotIncludedDto[] };

export type NotIncludedDto = { employeeId: string; name: string; cause: string; netSatang: number };
export type WarningDto = { employeeId: string | null; name: string | null; warning: string };
export type PreviewRowDto = { seq: number; employeeId: string; name: string; bankCode: string | null; accountMasked: string; amountSatang: number };
export type PreviewDto = { ok: true; itemCount: number; totalSatang: number; runNetSatang: number; rows: PreviewRowDto[]; notIncluded: NotIncludedDto[]; warnings: WarningDto[]; untested: boolean };
export type BankFileRowDto = { id: string; format: string; fileName: string; itemCount: number; totalSatang: number; excludedCount: number; createdAt: string; expiresAt: string; createdByName: string | null; downloads: number };
export type BankProfileDto = {
  debitBankCode: string;
  debitAccountMasked: string;
  debitBranchCode: string | null;
  companyNameEn: string | null;
  ktbCompanyId: string | null;
  formatsEnabled: FixedFormat[];
  debitAccountNo?: string;
};
export type BankPresetDto = { id: string; name: string; kind: "CSV" | "XLSX"; columns: [string, string][]; includeHeader: boolean; includeSummary: boolean; amountStyle: string; dateStyle: string; encoding: string };

const NO = (): BankNo => ({ ok: false, code: "NO", reason: BANK_TEXT.no });
const failOf = (code: string, key: keyof typeof BANK_TEXT): BankFail => ({ ok: false, code, reason: String(BANK_TEXT[key]) });
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const EXPIRY_MS = 7 * 86_400_000;
const nowOf = (o: Opts | undefined) => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? new Date(o.now.getTime()) : new Date());
const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** •••ตัวท้าย 4 ตัว (ไม่มีตัวอื่นของเลขบัญชีออกจาก server) */
export const maskAccount = (digits: string | null | undefined) => `•••${String(digits ?? "").slice(-4)}`;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const FIXED: readonly FixedFormat[] = ["KBANK_PCT", "KTB_IPAY"];

// ═════════════ ด่าน ═════════════
type Member = { role: string; unitAccess: unknown; permissions: unknown; userId: string };
/** ผ่านด่านไฟล์โอน (pure) — เจ้าของร้าน หรือถือทั้งสองคีย์ + ทุกสาขา */
export function bankGateOf(v: { role: string; unitAccess: unknown; permissions: unknown } | null | undefined): boolean {
  if (!v) return false;
  if (v.role === "OWNER") return true;
  const p = obj(v.permissions);
  return p["hr.payroll.read"] === true && p["hr.payroll.pay"] === true && isAllBranches(hrScopeOf({ role: v.role as "STAFF", unitAccess: v.unitAccess }));
}
/** สมาชิกภาพจริงของผู้เรียกในร้านของ ctx + ระบบ HR ของร้าน — null = ไม่ผ่าน */
async function memberOf(ctx: Ctx, viewer: BankViewer | null | undefined): Promise<Member | null> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string" || !ctx.tenantId || !ctx.systemId) return null;
  const uid = typeof viewer?.userId === "string" ? viewer.userId : "";
  if (!uid || typeof viewer?.role !== "string") return null;
  const db = tenantDb({ tenantId: ctx.tenantId });
  const m = await db.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: uid, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m || String(m.role) !== viewer.role) return null;
  const sys = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true } });
  if (!sys) return null;
  return { role: String(m.role), unitAccess: m.unitAccess, permissions: m.permissions, userId: uid };
}
/** ด่านเต็ม: สมาชิกภาพจริง + ด่านทั้งค่าในฐานและค่าที่ผู้เรียกส่งมา */
async function gate(ctx: Ctx, viewer: BankViewer | null | undefined): Promise<Member | null> {
  const m = await memberOf(ctx, viewer);
  return m && bankGateOf(m) && bankGateOf(viewer) ? m : null;
}
/** ผู้ดูคนนี้ใช้ส่วนไฟล์โอนได้ไหม (หน้าเงินเดือน/ตั้งค่า เรียกก่อนแสดงอะไรก็ตาม) */
export async function canUseBankFiles(ctx: Ctx, viewer: BankViewer | null | undefined): Promise<boolean> {
  return !!(await gate(ctx, viewer));
}

// ═════════════ บัญชีต้นทาง (R10) ═════════════
async function profileRow(db: Db, ctx: Ctx) {
  return db.hrBankProfile.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
}
const formatsOf = (raw: unknown): FixedFormat[] => FIXED.filter((f) => Array.isArray(raw) && raw.includes(f));

export async function getBankProfile(ctx: Ctx, viewer: BankViewer): Promise<{ ok: true; profile: BankProfileDto | null } | BankNo> {
  const m = await gate(ctx, viewer);
  if (!m) return NO();
  const row = await profileRow(tenantDb(ctx) as unknown as Db, ctx);
  if (!row) return { ok: true, profile: null };
  const profile: BankProfileDto = {
    debitBankCode: row.debitBankCode,
    debitAccountMasked: maskAccount(row.debitAccountNo),
    debitBranchCode: row.debitBranchCode,
    companyNameEn: row.companyNameEn,
    ktbCompanyId: row.ktbCompanyId,
    formatsEnabled: formatsOf(row.formatsEnabled),
  };
  if (m.role === "OWNER") profile.debitAccountNo = row.debitAccountNo;
  return { ok: true, profile };
}

export type SaveProfileInput = { debitBankCode: unknown; debitAccountNo: unknown; debitBranchCode?: unknown; companyNameEn?: unknown; ktbCompanyId?: unknown; formatsEnabled: unknown; acknowledgeUntested?: unknown };
export async function saveBankProfile(ctx: Ctx, viewer: BankViewer, input: SaveProfileInput, opts?: Opts): Promise<{ ok: true } | BankFail> {
  void opts;
  const m = await memberOf(ctx, viewer);
  if (!m) return NO();
  if (m.role !== "OWNER" || viewer.role !== "OWNER") return failOf("PROFILE_OWNER", "profileOwner");
  const i = obj(input);
  const bank = str(i.debitBankCode).trim();
  const acct = str(i.debitAccountNo).replace(/[\s-]/g, "");
  const optional = (v: unknown) => (v === null || v === undefined ? null : typeof v === "string" ? v.trim() || null : undefined);
  const branch = optional(i.debitBranchCode);
  const company = optional(i.companyNameEn);
  const ktbId = optional(i.ktbCompanyId);
  const fmts = Array.isArray(i.formatsEnabled) ? i.formatsEnabled : null;
  const valid =
    (BANK_CODES as readonly string[]).includes(bank) &&
    /^\d{10}$/.test(acct) &&
    branch !== undefined &&
    (branch === null || /^\d{4}$/.test(branch)) &&
    company !== undefined &&
    (company === null || (company.length <= 50 && printableAscii(company))) &&
    ktbId !== undefined &&
    (ktbId === null || (ktbId.length <= 16 && printableAscii(ktbId))) &&
    !!fmts &&
    fmts.every((f) => FIXED.includes(f as FixedFormat));
  if (!valid) return failOf("PROFILE_INPUT", "profileInput");
  const formatsEnabled = formatsOf(fmts);
  const db = tenantDb(ctx) as unknown as Db;
  const cur = await profileRow(db, ctx);
  const before = formatsOf(cur?.formatsEnabled);
  if (formatsEnabled.some((f) => !before.includes(f)) && i.acknowledgeUntested !== true) return failOf("ACK_UNTESTED", "ackUntested");
  const data = { debitBankCode: bank, debitAccountNo: acct, debitBranchCode: branch, companyNameEn: company, ktbCompanyId: ktbId, formatsEnabled, updatedById: m.userId };
  const write = async () => {
    const ex = await profileRow(db, ctx);
    if (ex) await db.hrBankProfile.updateMany({ where: { id: ex.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data });
    else await db.hrBankProfile.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...data } });
  };
  try {
    await write();
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") throw e;
    await write(); // แถวของระบบนี้ถูกสร้างพร้อมกัน — ครั้งที่สองเป็น update
  }
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.bankfile.profile", targetType: "AppSystem", targetId: ctx.systemId, after: { formatsEnabled } });
  return { ok: true };
}

// ═════════════ ชุดคอลัมน์ของร้าน (R8) ═════════════
function presetDto(r: { id: string; name: string; kind: string; columnsJson: unknown; includeHeader: boolean; includeSummary: boolean; amountStyle: string; dateStyle: string; encoding: string }): BankPresetDto {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind === "XLSX" ? "XLSX" : "CSV",
    columns: (Array.isArray(r.columnsJson) ? r.columnsJson : []).map((c) => [str((c as unknown[])[0]), str((c as unknown[])[1])] as [string, string]),
    includeHeader: r.includeHeader,
    includeSummary: r.includeSummary,
    amountStyle: r.amountStyle,
    dateStyle: r.dateStyle,
    encoding: r.encoding,
  };
}
const PRESET_SELECT = { id: true, name: true, kind: true, columnsJson: true, includeHeader: true, includeSummary: true, amountStyle: true, dateStyle: true, encoding: true } as const;

export async function listBankPresets(ctx: Ctx, viewer: BankViewer): Promise<{ ok: true; items: BankPresetDto[] } | BankNo> {
  if (!(await gate(ctx, viewer))) return NO();
  const rows = await (tenantDb(ctx) as unknown as Db).hrBankExportPreset.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: [{ name: "asc" }, { id: "asc" }], select: PRESET_SELECT, take: 100 });
  return { ok: true, items: rows.map(presetDto) };
}

export type SavePresetInput = { id?: unknown; name: unknown; kind: unknown; columns: unknown; includeHeader: unknown; includeSummary: unknown; amountStyle: unknown; dateStyle: unknown; encoding: unknown };
export async function saveBankPreset(ctx: Ctx, viewer: BankViewer, input: SavePresetInput): Promise<{ ok: true; id: string } | BankFail> {
  const m = await gate(ctx, viewer);
  if (!m) return NO();
  const i = obj(input);
  const name = str(i.name).trim();
  if (name.length < 1 || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) return failOf("PRESET_NAME", "presetName");
  const encoding = i.encoding === undefined ? "UTF8_BOM" : i.encoding;
  if (!(CSV_ENCODINGS as readonly unknown[]).includes(encoding)) return failOf("OPTIONS", "options");
  const cols = Array.isArray(i.columns) ? i.columns : null;
  if (!cols || cols.length < 1 || cols.length > GENERIC_MAX_COLUMNS || cols.some((c) => columnProblem(c, encoding as GenericSpec["encoding"]) !== null)) return failOf("PRESET_COLUMNS", "presetColumns");
  if (
    (i.kind !== "CSV" && i.kind !== "XLSX") ||
    typeof i.includeHeader !== "boolean" ||
    typeof i.includeSummary !== "boolean" ||
    !(AMOUNT_STYLES as readonly unknown[]).includes(i.amountStyle) ||
    !(DATE_STYLES as readonly unknown[]).includes(i.dateStyle)
  )
    return failOf("OPTIONS", "options");
  const db = tenantDb(ctx) as unknown as Db;
  const data = {
    name,
    kind: i.kind as string,
    columnsJson: (cols as [string, string][]).map(([f, h]) => [f, h]) as Prisma.InputJsonValue,
    includeHeader: i.includeHeader,
    includeSummary: i.includeSummary,
    amountStyle: i.amountStyle as string,
    dateStyle: i.dateStyle as string,
    encoding: encoding as string,
  };
  const id = typeof i.id === "string" && i.id ? i.id : null;
  const dup = await db.hrBankExportPreset.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, name, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (dup) return failOf("PRESET_NAME", "presetName");
  let savedId: string;
  try {
    if (id) {
      if (!ID_RE.test(id)) return NO();
      const u = await db.hrBankExportPreset.updateMany({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data });
      if (u.count !== 1) return NO();
      savedId = id;
    } else {
      savedId = (await db.hrBankExportPreset.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, createdById: m.userId, ...data }, select: { id: true } })).id;
    }
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return failOf("PRESET_NAME", "presetName");
    throw e;
  }
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.bankfile.preset", targetType: "HrBankExportPreset", targetId: savedId, after: { presetId: savedId, op: "save" } });
  return { ok: true, id: savedId };
}

export async function deleteBankPreset(ctx: Ctx, viewer: BankViewer, input: { id: unknown }): Promise<{ ok: true } | BankNo> {
  const m = await gate(ctx, viewer);
  const id = str(obj(input).id);
  if (!m || !ID_RE.test(id)) return NO();
  const d = await (tenantDb(ctx) as unknown as Db).hrBankExportPreset.deleteMany({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (d.count !== 1) return NO();
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.bankfile.preset", targetType: "HrBankExportPreset", targetId: id, after: { presetId: id, op: "delete" } });
  return { ok: true };
}

// ═════════════ สร้าง / ตัวอย่าง (R9 R3–R8) ═════════════
export type BankFileRequest = { runId: unknown; format: unknown; presetId?: unknown; options?: unknown };
/** ตัวเลือกที่แก้ค่าตั้งต้นแล้ว (ลงใบกำกับ — ไม่มีเลขบัญชี/ชื่อ) */
type ResolvedOptions = BankOptions & { format: BankFormat; presetId?: string; generic?: GenericSpec };
type Loaded = { run: { id: string; periodKey: string; payDate: Date; status: string; totalNetSatang: number }; payees: BankPayee[]; names: Map<string, string>; missing: Set<string>; profile: BankProfileInput; formatsEnabled: FixedFormat[] };

const OPTION_KEYS = ["effectiveDate", "encoding", "batchRef", "ktbMode", "ktbDateEra", "ktbReceivingBranch"] as const;

/** คำขอ → ตัวเลือกดิบ (ยังไม่แก้ค่าตั้งต้นที่ขึ้นกับรอบ) · null = ตัวเลือกผิด · "NO" = ชุดคอลัมน์ไม่ใช่ของระบบนี้ */
async function requestOptions(ctx: Ctx, req: BankFileRequest): Promise<{ format: BankFormat; raw: Record<string, string>; presetId?: string; generic?: GenericSpec } | null | "NO"> {
  const format = req.format;
  if (!(BANK_FORMATS as readonly unknown[]).includes(format)) return null;
  const o = req.options === undefined || req.options === null ? {} : req.options;
  if (typeof o !== "object" || Array.isArray(o)) return null;
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (!(OPTION_KEYS as readonly string[]).includes(k) || v === undefined || v === null || v === "") continue;
    if (typeof v !== "string") return null;
    raw[k] = v;
  }
  if (!isFixedFormat(format)) {
    const pid = req.presetId === undefined || req.presetId === null || req.presetId === "" ? "GENERIC" : req.presetId;
    if (typeof pid !== "string") return null;
    if (isPresetKey(pid)) return { format: format as BankFormat, raw, presetId: pid, generic: BANK_PRESETS[pid] };
    if (!ID_RE.test(pid)) return "NO";
    const row = await (tenantDb(ctx) as unknown as Db).hrBankExportPreset.findFirst({ where: { id: pid, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: PRESET_SELECT });
    if (!row) return "NO";
    const d = presetDto(row);
    const spec = genericSpecOf({ columns: d.columns, includeHeader: d.includeHeader, includeSummary: d.includeSummary, amountStyle: d.amountStyle, dateStyle: d.dateStyle, encoding: d.encoding });
    if (!spec) return null;
    return { format: format as BankFormat, raw, presetId: pid, generic: spec };
  }
  return { format: format as BankFormat, raw };
}

/** ค่าตั้งต้นที่ขึ้นกับรอบ/รูปแบบ → ตัวเลือกครบ (ลงใบกำกับแบบนี้ ดาวน์โหลดใช้ชุดนี้ซ้ำ) */
function resolveOptions(base: { format: BankFormat; raw: Record<string, string>; presetId?: string; generic?: GenericSpec }, run: Loaded["run"]): ResolvedOptions {
  const eff = base.raw.effectiveDate ?? bangkokParts(run.payDate).day;
  if (base.format === "KBANK_PCT") return { format: base.format, effectiveDate: eff, encoding: base.raw.encoding ?? "TIS620", batchRef: base.raw.batchRef ?? `HR${run.periodKey.replace("-", "")}` };
  if (base.format === "KTB_IPAY")
    return { format: base.format, effectiveDate: eff, encoding: base.raw.encoding ?? "TIS620", ktbMode: base.raw.ktbMode ?? "STANDARD", ktbDateEra: base.raw.ktbDateEra ?? "CE", ktbReceivingBranch: base.raw.ktbReceivingBranch ?? "SPACES" };
  return { format: base.format, effectiveDate: eff, presetId: base.presetId, generic: base.generic };
}

/** แถวรอบ (FOR SHARE) + รายการ + พนักงาน + บัญชีต้นทาง — ในธุรกรรมของผู้เรียก */
async function loadRun(tx: Db, ctx: Ctx, runId: string): Promise<Loaded | null> {
  const rows = await tx.$queryRaw<{ id: string; periodKey: string; payDate: Date; status: string; totalNetSatang: number }[]>`
    SELECT "id", "periodKey", "payDate", "status"::text AS "status", "totalNetSatang"
    FROM "HrPayrollRun"
    WHERE "id" = ${runId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
    FOR SHARE`;
  const r = rows[0];
  if (!r) return null;
  const items = await tx.hrPayrollItem.findMany({ where: { runId: r.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { employeeId: true, netSatang: true }, orderBy: { id: "asc" } });
  const ids = [...new Set(items.map((i) => i.employeeId))];
  const emps = ids.length
    ? await tx.hrEmployee.findMany({ where: { id: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, name: true, code: true, bankName: true, bankAccountNo: true, bankAccountName: true } })
    : [];
  const byId = new Map(emps.map((e) => [e.id, e]));
  const missing = new Set(ids.filter((id) => !byId.has(id)));
  const payees: BankPayee[] = items.map((it) => {
    const e = byId.get(it.employeeId);
    return { employeeId: it.employeeId, name: e?.name ?? "", code: e?.code ?? null, bankName: e?.bankName ?? null, accountNo: e?.bankAccountNo ?? null, accountName: e?.bankAccountName ?? null, netSatang: it.netSatang };
  });
  // ลำดับในไฟล์ (R9): รหัสพนักงาน (ว่างไว้ท้าย) → ชื่อ → id · เทียบแบบ code unit ของ JS
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  payees.sort((a, b) => (a.code === null ? 1 : 0) - (b.code === null ? 1 : 0) || cmp(a.code ?? "", b.code ?? "") || cmp(a.name, b.name) || cmp(a.employeeId, b.employeeId));
  const prof = await profileRow(tx, ctx);
  return {
    run: { ...r, totalNetSatang: Number(r.totalNetSatang) },
    payees,
    names: new Map(payees.map((p) => [p.employeeId, p.name])),
    missing,
    profile: prof ? { debitBankCode: prof.debitBankCode, debitAccountNo: prof.debitAccountNo, debitBranchCode: prof.debitBranchCode, companyNameEn: prof.companyNameEn, ktbCompanyId: prof.ktbCompanyId } : null,
    formatsEnabled: formatsOf(prof?.formatsEnabled),
  };
}

function build(L: Loaded, o: ResolvedOptions, now: Date): BuildResult {
  return buildBankFile({
    run: { runId: L.run.id, periodKey: L.run.periodKey, payDate: bangkokParts(L.run.payDate).day, status: L.run.status, totalNetSatang: L.run.totalNetSatang },
    payees: L.payees,
    profile: L.profile,
    options: { format: o.format, effectiveDate: o.effectiveDate, encoding: o.encoding, batchRef: o.batchRef, ktbMode: o.ktbMode, ktbDateEra: o.ktbDateEra, ktbReceivingBranch: o.ktbReceivingBranch, generic: o.generic },
    now,
  });
}
const niDto = (L: Loaded, rows: { employeeId: string; cause: string; netSatang: number }[]): NotIncludedDto[] =>
  rows.map((x) => ({ employeeId: x.employeeId, name: L.names.get(x.employeeId) ?? "", cause: L.missing.has(x.employeeId) ? "NO_EMPLOYEE" : x.cause, netSatang: x.netSatang }));
const warnDto = (L: Loaded, rows: { employeeId: string | null; code: string }[]): WarningDto[] =>
  rows.map((w) => ({ employeeId: w.employeeId, name: w.employeeId ? (L.names.get(w.employeeId) ?? "") : null, warning: w.code }));
function refusalOf(L: Loaded, r: Extract<BuildResult, { ok: false }>): BankFail {
  return {
    ok: false,
    code: r.code,
    reason: refusalText(r.code, r.employees.map((e) => e.name)),
    ...(r.code === "ENCODING" || r.code === "FORMULA" ? { employees: r.employees } : {}),
    ...(r.notIncluded ? { notIncluded: niDto(L, r.notIncluded) } : {}),
  };
}

type Prepared = { kind: "no" } | { kind: "fail"; fail: BankFail } | { kind: "ok"; L: Loaded; o: ResolvedOptions; r: Extract<BuildResult, { ok: true }> };
/** ด่าน → คำขอ → (ใน tx ที่ถือแถวรอบ FOR SHARE) โหลด → สร้าง · after = งานเขียนใบกำกับใน tx เดียวกัน (generate) */
async function prepare(ctx: Ctx, req: BankFileRequest, now: Date, after?: (tx: Db, p: Extract<Prepared, { kind: "ok" }>) => Promise<string>): Promise<Prepared & { fileId?: string }> {
  const r0 = obj(req);
  const runId = str(r0.runId);
  if (!ID_RE.test(runId)) return { kind: "no" };
  const ro = await requestOptions(ctx, r0 as BankFileRequest);
  if (ro === "NO") return { kind: "no" };
  return (tenantDb(ctx) as unknown as { $transaction: <T>(fn: (tx: Db) => Promise<T>, o: typeof TX_OPTS) => Promise<T> }).$transaction(async (tx) => {
    const L = await loadRun(tx, ctx, runId);
    if (!L) return { kind: "no" as const };
    if (!ro || (isFixedFormat(ro.format) && !L.formatsEnabled.includes(ro.format))) {
      // ลำดับ R3 คงเดิม: ให้ตัวสร้างตัดสิน STATUS → NEGATIVE → MISMATCH ก่อน (รูปแบบปลอม ⇒ ผ่านสามข้อแรกแล้วได้ OPTIONS) ·
      //   ตัวเลือกถูกแต่รูปแบบธนาคารยังไม่เปิด ⇒ FORMAT_OFF แทน OPTIONS
      const pre = build(L, { format: "-" as BankFormat }, now);
      if (!pre.ok && pre.code !== "OPTIONS") return { kind: "fail" as const, fail: refusalOf(L, pre) };
      return { kind: "fail" as const, fail: ro ? failOf("FORMAT_OFF", "formatOff") : failOf("OPTIONS", "options") };
    }
    const o = resolveOptions(ro, L.run);
    const r = build(L, o, now);
    if (!r.ok) return { kind: "fail" as const, fail: refusalOf(L, r) };
    const p = { kind: "ok" as const, L, o, r };
    return after ? { ...p, fileId: await after(tx, p) } : p;
  }, TX_OPTS);
}

export async function previewBankFile(ctx: Ctx, viewer: BankViewer, req: BankFileRequest, opts?: Opts): Promise<PreviewDto | BankFail> {
  if (!(await gate(ctx, viewer))) return NO();
  const p = await prepare(ctx, req, nowOf(opts));
  if (p.kind === "no") return NO();
  if (p.kind === "fail") return p.fail;
  const { L, r, o } = p;
  return {
    ok: true,
    itemCount: r.itemCount,
    totalSatang: r.totalSatang,
    runNetSatang: L.run.totalNetSatang,
    rows: r.rows.map((x) => ({ seq: x.seq, employeeId: x.employeeId, name: L.names.get(x.employeeId) ?? "", bankCode: x.bankCode, accountMasked: maskAccount(x.accountNo), amountSatang: x.amountSatang })),
    notIncluded: niDto(L, r.notIncluded),
    warnings: warnDto(L, r.warnings),
    untested: isFixedFormat(o.format),
  };
}

export type GenerateOk = { ok: true; fileId: string; fileName: string; contentType: string; bytes: Uint8Array; itemCount: number; totalSatang: number; notIncluded: NotIncludedDto[]; warnings: WarningDto[]; untested: boolean };
export async function generateBankFile(ctx: Ctx, viewer: BankViewer, req: BankFileRequest, opts?: Opts): Promise<GenerateOk | BankFail> {
  const m = await gate(ctx, viewer);
  if (!m) return NO();
  const now = nowOf(opts);
  const p = await prepare(ctx, req, now, async (tx, q) => {
    const row = await tx.hrBankFile.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        runId: q.L.run.id,
        format: q.o.format,
        optionsJson: JSON.parse(JSON.stringify(q.o)) as Prisma.InputJsonValue,
        fileName: q.r.fileName,
        byteLength: q.r.bytes.length,
        sha256: sha256(q.r.bytes),
        itemCount: q.r.itemCount,
        totalSatang: q.r.totalSatang,
        excludedCount: q.r.notIncluded.length,
        createdById: m.userId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + EXPIRY_MS),
      },
      select: { id: true },
    });
    return row.id;
  });
  if (p.kind === "no") return NO();
  if (p.kind === "fail") return p.fail;
  const fileId = p.fileId!;
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: m.userId,
    action: "hr.bankfile.generate",
    targetType: "HrPayrollRun",
    targetId: p.L.run.id,
    after: { fileId, format: p.o.format, itemCount: p.r.itemCount, totalSatang: p.r.totalSatang, excludedCount: p.r.notIncluded.length },
  });
  return {
    ok: true,
    fileId,
    fileName: p.r.fileName,
    contentType: p.r.contentType,
    bytes: p.r.bytes,
    itemCount: p.r.itemCount,
    totalSatang: p.r.totalSatang,
    notIncluded: niDto(p.L, p.r.notIncluded),
    warnings: warnDto(p.L, p.r.warnings),
    untested: isFixedFormat(p.o.format),
  };
}

// ═════════════ ดาวน์โหลด (R11) ═════════════
export type DownloadOk = { ok: true; fileName: string; contentType: string; bytes: Uint8Array; untested: boolean };
export async function downloadBankFile(ctx: Ctx, viewer: BankViewer, input: { fileId: unknown }, opts?: Opts): Promise<DownloadOk | BankFail> {
  const m = await gate(ctx, viewer);
  const fileId = str(obj(input).fileId);
  if (!m || !ID_RE.test(fileId)) return NO();
  const now = nowOf(opts);
  type Out = { kind: "no" } | { kind: "fail"; fail: BankFail } | { kind: "ok"; out: DownloadOk; runId: string; format: string; itemCount: number; totalSatang: number; excludedCount: number };
  const res = await (tenantDb(ctx) as unknown as { $transaction: <T>(fn: (tx: Db) => Promise<T>, o: typeof TX_OPTS) => Promise<T> }).$transaction(async (tx): Promise<Out> => {
    const f = await tx.hrBankFile.findFirst({ where: { id: fileId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
    if (!f) return { kind: "no" };
    const L = await loadRun(tx, ctx, f.runId);
    if (!L) return { kind: "no" };
    if (L.run.status !== "APPROVED" && L.run.status !== "PAID") return { kind: "fail", fail: failOf("STATUS", "status") };
    if (now.getTime() >= f.expiresAt.getTime()) return { kind: "fail", fail: failOf("EXPIRED", "expired") };
    const o = obj(f.optionsJson) as ResolvedOptions;
    const r = build(L, o, f.createdAt);
    if (!r.ok || r.bytes.length !== f.byteLength || sha256(r.bytes) !== f.sha256) return { kind: "fail", fail: failOf("CHANGED", "changed") };
    await tx.hrBankFile.updateMany({ where: { id: f.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { downloads: { increment: 1 } } });
    return { kind: "ok", out: { ok: true, fileName: f.fileName, contentType: r.contentType, bytes: r.bytes, untested: isFixedFormat(f.format) }, runId: f.runId, format: f.format, itemCount: f.itemCount, totalSatang: f.totalSatang, excludedCount: f.excludedCount };
  }, TX_OPTS);
  if (res.kind === "no") return NO();
  if (res.kind === "fail") return res.fail;
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: m.userId,
    action: "hr.bankfile.download",
    targetType: "HrPayrollRun",
    targetId: res.runId,
    after: { fileId, format: res.format, itemCount: res.itemCount, totalSatang: res.totalSatang, excludedCount: res.excludedCount },
  });
  return res.out;
}

// ═════════════ รายการไฟล์ของรอบ (R13) ═════════════
export async function listBankFiles(ctx: Ctx, viewer: BankViewer, input: { runId: unknown }): Promise<{ ok: true; items: BankFileRowDto[] } | BankNo> {
  if (!(await gate(ctx, viewer))) return NO();
  const runId = str(obj(input).runId);
  if (!ID_RE.test(runId)) return NO();
  const db = tenantDb(ctx) as unknown as Db;
  const run = await db.hrPayrollRun.findFirst({ where: { id: runId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } });
  if (!run) return NO();
  const rows = await db.hrBankFile.findMany({
    where: { runId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { id: true, format: true, fileName: true, itemCount: true, totalSatang: true, excludedCount: true, createdAt: true, expiresAt: true, createdById: true, downloads: true },
  });
  const uids = [...new Set(rows.map((r) => r.createdById))];
  const users = new Map(uids.length ? (await tenantDb({ tenantId: ctx.tenantId }).user.findMany({ where: { id: { in: uids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : []);
  return {
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      format: r.format,
      fileName: r.fileName,
      itemCount: r.itemCount,
      totalSatang: r.totalSatang,
      excludedCount: r.excludedCount,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      createdByName: users.get(r.createdById) ?? null,
      downloads: r.downloads,
    })),
  };
}

/** รอบที่สร้างไฟล์ได้ (APPROVED/PAID) ล่าสุด — สำหรับส่วนไฟล์โอนบนหน้าเงินเดือน (ผ่านด่านเท่านั้น) */
export async function listBankRuns(ctx: Ctx, viewer: BankViewer, take = 12): Promise<{ ok: true; items: { id: string; periodKey: string; status: string; totalNetSatang: number; payDay: string }[] } | BankNo> {
  if (!(await gate(ctx, viewer))) return NO();
  const rows = await (tenantDb(ctx) as unknown as Db).hrPayrollRun.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: { in: ["APPROVED", "PAID"] } },
    orderBy: [{ periodKey: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(1, take), 50),
    select: { id: true, periodKey: true, status: true, totalNetSatang: true, payDate: true },
  });
  return { ok: true, items: rows.map((r) => ({ id: r.id, periodKey: r.periodKey, status: String(r.status), totalNetSatang: r.totalNetSatang, payDay: bangkokParts(r.payDate).day })) };
}
