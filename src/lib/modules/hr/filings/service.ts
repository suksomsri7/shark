// HR H3.6 ▸ แบบยื่นภาษี/ประกันสังคม — service (server เท่านั้น) · brief hr-brief-H3.6 R8–R13 · รูปร่าง wo-notes/hr-H3.6-oracle.md §2
//   ด่าน (R9) = ด่านไฟล์โอนของ H3.5 (bankGateOf): OWNER หรือ hr.payroll.read + hr.payroll.pay + ทุกสาขา — MANAGER อย่างเดียวไม่ผ่าน ·
//     อ่านสมาชิกภาพจริงจากฐาน แล้วต้องผ่านทั้งค่าในฐานและค่าที่ผู้เรียกส่งมา · ไม่ผ่าน/ไม่พบ/ของระบบอื่น/ร้านอื่น = {ok:false, code:"NO", reason: no} ไบต์เดียวกัน
//   ตัวเลข = ค่าที่เก็บไว้เท่านั้น (figures.ts) · อ่านรอบ + รายการ + พนักงานในธุรกรรมเดียว โดยถือแถวรอบแบบ FOR SHARE · ไม่เขียนเงินเดือนเลย (รอบ/รายการ/รายการเพิ่ม-หัก/outbox)
//   รอบรุ่น 2 นับเฉพาะที่ปิดงานแล้ว (H3.4 stepsJson.finalized = true) — ยังไม่เสร็จ ⇒ ไม่อยู่ในไฟล์ + เตือน NOT_FINAL (ภ.ง.ด.) · ปฏิเสธ notFinal (สปส.)
//   ไฟล์ไม่เก็บไบต์ (R10): ใบกำกับ + sha256 · ดาวน์โหลด = สร้างใหม่ด้วยตัวเลือกเดิมแล้วเทียบ sha · 7 วัน
//   หนังสือรับรอง 50 ทวิ (R11) = เอกสารที่ออกแล้ว: เนื้อหาแช่แข็ง + sha · เลขที่จากเครื่องออกเลขของบัญชี (reserveSeq เป็นล็อกสุดท้ายของธุรกรรม)
//     ลำดับล็อกของการออก: advisory lock (ระบบ, พนักงาน, ปี) → แถวรอบของปี FOR SHARE → ตัวนับ AccountDocSequence (reserveSeq) → แทรกแถวหนังสือรับรองของตัวเอง
//   🔴 เลขประจำตัว/ชื่อ/ที่อยู่/ไบต์/เหตุผลการยกเลิก ไม่ลงประวัติ · log · outbox · ใบกำกับ · URL — DTO มีเลขประจำตัวแบบ •••4 ตัวท้ายเท่านั้น ◂
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { reserveSeq } from "@/lib/modules/account/doc-numbering";
import { bankGateOf, type BankViewer } from "../bank-files/service";
import { resolveSelf, type SelfActor } from "../self";
import {
  FILING_TEXT,
  buildPnd1,
  buildSso110,
  filingText,
  hasBase,
  itemFigures,
  taxCertContent,
  thaiIdOk,
  type FilingEmployer,
  type FilingItem,
  type FilingPerson,
  type FilingTextKey,
  type FilingWarning,
  type PndOk,
  type SsoOk,
  type TaxCertContent,
} from "./build";
import { renderTaxCertPdf } from "./cert-pdf";

type Ctx = { tenantId: string; systemId: string };
export type FilingViewer = BankViewer;
type Opts = { now?: Date };
type Db = Prisma.TransactionClient;
type TxRunner = { $transaction: <T>(fn: (tx: Db) => Promise<T>, o: typeof TX_OPTS) => Promise<T> };
export type FilingNo = { ok: false; code: "NO"; reason: string };
export type FilingFail = { ok: false; code: string; reason: string; fields?: string[]; notIncluded?: NotIncludedDto[]; periods?: string[] };

export type RowDto = { seq: number; employeeId: string; name: string; pinMasked: string; payDate: string | null; amountSatang: number; taxSatang: number };
export type NotIncludedDto = { employeeId: string; name: string; cause: string; fields: string[]; amountSatang: number; taxSatang: number };
export type WarningDto = { employeeId: string | null; name: string | null; warning: string; fields: string[] };
export type PreviewDto = { ok: true; kind: FilingKind; period: string; lineCount: number; totalSatang: number; taxSatang: number; rows: RowDto[]; notIncluded: NotIncludedDto[]; warnings: WarningDto[]; untested: boolean };
export type FileRowDto = { id: string; kind: string; period: string; fileName: string; lineCount: number; totalSatang: number; taxSatang: number; excludedCount: number; createdAt: string; expiresAt: string; createdByName: string | null; downloads: number };
export type CertRowDto = { id: string; employeeId: string; name: string; taxYear: number; kind: string; docNo: string; formSeq: number; issuedAt: string; voided: boolean; downloads: number; stale: boolean };
export type MyCertRowDto = { id: string; taxYear: number; kind: string; docNo: string; issuedAt: string };
export type ProfileDto = {
  taxId: string | null; branchNo: string; employerName: string | null; employerAddress: string | null; deptName: string | null; lto: boolean; branchType: string; rdUserId: string | null;
  rdFormFlag: number; ssoAccountNo: string | null; ssoBranchNo: string; ssoEncoding: string; ssoWageMode: string; rdSlashMode: string; signerName: string | null; certPrefix: string;
};
export type PersonDto = { title: string | null; firstName: string | null; lastName: string | null; ssoPrefix: string | null; building: string | null; room: string | null; floor: string | null; village: string | null; houseNo: string | null; moo: string | null; soi: string | null; street: string | null };
export type FilingKind = "PND1" | "PND1A" | "SSO110";

const T = FILING_TEXT;
const NO = (): FilingNo => ({ ok: false, code: "NO", reason: T.no });
const failOf = (code: string, key: FilingTextKey, fill: { fields?: string[]; runs?: string[]; docNo?: string } = {}): FilingFail => ({ ok: false, code, reason: filingText(key, fill), ...(fill.fields && (code === "PROFILE" || code === "PERSON" || code === "OPTIONS" || code === "CERT_INCOMPLETE") ? { fields: fill.fields } : {}) });
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const EXPIRY_MS = 7 * 86_400_000;
const nowOf = (o: Opts | undefined) => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? new Date(o.now.getTime()) : new Date());
const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
/** JSON คีย์เรียงทุกชั้น ไม่มีช่องว่าง (sha ของเนื้อหาหนังสือรับรอง) */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
/** •••4 ตัวท้าย (เลขประจำตัว — ไม่มีตัวอื่นออกจาก server) */
export const pinMasked = (v: string | null | undefined) => `•••${String(v ?? "").slice(-4)}`;
/** ชื่อไฟล์ที่แสดงในรายการ: เลข 13 หลักเหลือ •••4 ตัวท้าย (ชื่อไฟล์เต็มอยู่ในหัวดาวน์โหลดเท่านั้น) */
const maskedFileName = (n: string) => n.replace(/\d{13}/g, (m) => pinMasked(m));
/** วันที่ตามเวลาไทย "YYYY-MM-DD" */
const bkkDay = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
/** ต้นปี/ต้นเดือนเวลาไทย → UTC */
const bkkStart = (y: number, m0: number) => new Date(Date.UTC(y, m0, 1) - 7 * 3_600_000);
const runTx = <R,>(ctx: Ctx, fn: (tx: Db) => Promise<R>) => (tenantDb(ctx) as unknown as TxRunner).$transaction(fn, TX_OPTS);

// ═════════════ ด่าน ═════════════
type Member = { role: string; unitAccess: unknown; permissions: unknown; userId: string };
async function memberOf(ctx: Ctx, viewer: FilingViewer | null | undefined): Promise<Member | null> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string" || !ID_RE.test(ctx.tenantId) || !ID_RE.test(ctx.systemId)) return null;
  const uid = typeof viewer?.userId === "string" ? viewer.userId : "";
  if (!uid || typeof viewer?.role !== "string") return null;
  const db = tenantDb({ tenantId: ctx.tenantId });
  const m = await db.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: uid, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m || String(m.role) !== viewer.role) return null;
  const sys = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true } });
  if (!sys) return null;
  return { role: String(m.role), unitAccess: m.unitAccess, permissions: m.permissions, userId: uid };
}
async function gate(ctx: Ctx, viewer: FilingViewer | null | undefined): Promise<Member | null> {
  const m = await memberOf(ctx, viewer);
  return m && bankGateOf(m) && bankGateOf(viewer) ? m : null;
}
/** ผู้ดูคนนี้ใช้ส่วนแบบยื่นได้ไหม (หน้าเรียกก่อนแสดงอะไรก็ตาม) */
export async function canUseFilings(ctx: Ctx, viewer: FilingViewer | null | undefined): Promise<boolean> {
  return !!(await gate(ctx, viewer));
}

// ═════════════ ข้อมูลผู้จ่ายเงิน (R1 · เจ้าของร้าน) ═════════════
const PROFILE_SELECT = {
  taxId: true, branchNo: true, employerName: true, employerAddress: true, deptName: true, lto: true, branchType: true, rdUserId: true, rdFormFlag: true,
  ssoAccountNo: true, ssoBranchNo: true, ssoEncoding: true, ssoWageMode: true, rdSlashMode: true, signerName: true, certPrefix: true,
} as const;
async function profileOf(db: Db, ctx: Ctx): Promise<ProfileDto | null> {
  return (await db.hrFilingProfile.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: PROFILE_SELECT })) as ProfileDto | null;
}
const employerOf = (p: ProfileDto | null): FilingEmployer =>
  p
    ? { ...p }
    : { taxId: null, branchNo: "000000", employerName: null, employerAddress: null, deptName: null, lto: false, branchType: "", rdUserId: null, rdFormFlag: 2, rdSlashMode: "DASH", ssoAccountNo: null, ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: null, certPrefix: "HR50" };

export async function getFilingProfile(ctx: Ctx, viewer: FilingViewer): Promise<{ ok: true; profile: ProfileDto | null } | FilingNo> {
  if (!(await gate(ctx, viewer))) return NO();
  return { ok: true, profile: await profileOf(tenantDb(ctx) as unknown as Db, ctx) };
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/; // fix r1 F5: + U+2028/U+2029
export type SaveProfileInput = Partial<Record<keyof ProfileDto, unknown>>;
export async function saveFilingProfile(ctx: Ctx, viewer: FilingViewer, input: SaveProfileInput, opts?: Opts): Promise<{ ok: true } | FilingFail> {
  void opts;
  const m = await gate(ctx, viewer);
  if (!m) return NO();
  if (m.role !== "OWNER" || viewer.role !== "OWNER") return failOf("PROFILE_OWNER", "profileOwner");
  const i = obj(input);
  const bad: string[] = [];
  const opt = (k: string, max: number, test?: (v: string) => boolean): string | null => {
    const raw = i[k];
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== "string") return (bad.push(k), null);
    const v = raw.trim();
    if (!v) return null;
    if (v.length > max || CONTROL.test(v) || (test && !test(v))) bad.push(k);
    return v;
  };
  const taxId = opt("taxId", 13, (v) => thaiIdOk(v));
  const branchNo = opt("branchNo", 6, (v) => /^\d{6}$/.test(v)) ?? "000000";
  const employerName = opt("employerName", 100, hasBase);
  const employerAddress = opt("employerAddress", 300, hasBase);
  const deptName = opt("deptName", 80, hasBase) ?? "สำนักงานใหญ่";
  const branchType = i.branchType === undefined || i.branchType === null ? "" : i.branchType;
  if (!["", "V", "S"].includes(branchType as string) && !bad.includes("branchNo")) bad.push("branchNo");
  const rdUserId = opt("rdUserId", 20, (v) => /^[A-Za-z0-9]{1,20}$/.test(v));
  const ssoAccountNo = opt("ssoAccountNo", 10, (v) => /^\d{10}$/.test(v));
  const ssoBranchNo = opt("ssoBranchNo", 6, (v) => /^\d{6}$/.test(v)) ?? "000000";
  const signerName = opt("signerName", 100, hasBase);
  const certPrefix = opt("certPrefix", 8, (v) => /^[A-Z0-9]{1,8}$/.test(v)) ?? "HR50";
  const flag = i.rdFormFlag === undefined || i.rdFormFlag === null || i.rdFormFlag === "" ? 2 : Number(i.rdFormFlag); // fix r1 F1: ค่าตั้งต้น = ยื่นอินเทอร์เน็ต
  if (flag !== 1 && flag !== 2) bad.push("formFlag");
  const en = (k: string, allowed: string[], dflt: string, label: string) => {
    const v = i[k] === undefined || i[k] === null || i[k] === "" ? dflt : i[k];
    if (!allowed.includes(v as string)) bad.push(label);
    return v as string;
  };
  const ssoEncoding = en("ssoEncoding", ["TIS620", "UTF8"], "TIS620", "encoding");
  const ssoWageMode = en("ssoWageMode", ["CLAMPED", "ACTUAL"], "CLAMPED", "wageMode");
  const rdSlashMode = en("rdSlashMode", ["DASH", "EXCLUDE"], "DASH", "slashMode");
  const lto = i.lto === true || i.lto === "on" || i.lto === "true";
  if (bad.length) return failOf("PROFILE", "profile", { fields: bad });
  const data = { taxId, branchNo, employerName, employerAddress, deptName, lto, branchType: branchType as string, rdUserId, rdFormFlag: flag, ssoAccountNo, ssoBranchNo, ssoEncoding, ssoWageMode, rdSlashMode, signerName, certPrefix, updatedById: m.userId };
  const db = tenantDb(ctx) as unknown as Db;
  const write = async () => {
    const ex = await db.hrFilingProfile.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } });
    if (ex) await db.hrFilingProfile.updateMany({ where: { id: ex.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data });
    else await db.hrFilingProfile.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...data } });
  };
  try {
    await write();
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") throw e;
    await write(); // แถวของระบบนี้ถูกสร้างพร้อมกัน — ครั้งที่สองเป็น update
  }
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.filing.profile", targetType: "AppSystem", targetId: ctx.systemId, after: { op: "save" } });
  return { ok: true };
}

// ═════════════ ข้อมูลยื่นของพนักงาน (ชื่อ/ที่อยู่แยกช่อง) ═════════════
const PERSON_WIDTH = { title: 100, firstName: 100, lastName: 80, building: 40, room: 20, floor: 20, village: 100, houseNo: 40, moo: 20, soi: 100, street: 100 } as const;
const PERSON_KEYS = ["title", "firstName", "lastName", "ssoPrefix", "building", "room", "floor", "village", "houseNo", "moo", "soi", "street"] as const;
const PERSON_SELECT = Object.fromEntries(PERSON_KEYS.map((k) => [k, true])) as Record<(typeof PERSON_KEYS)[number], true>;
/** พนักงานของระบบนี้ (ร้าน + ระบบ) — null = ไม่พบ */
async function employeeIn(db: Db, ctx: Ctx, employeeId: string) {
  if (!ID_RE.test(employeeId)) return null;
  return db.hrEmployee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } });
}
export async function getFilingPerson(ctx: Ctx, viewer: FilingViewer, input: { employeeId: unknown }): Promise<{ ok: true; person: PersonDto | null } | FilingNo> {
  if (!(await gate(ctx, viewer))) return NO();
  const employeeId = str(obj(input).employeeId);
  const db = tenantDb(ctx) as unknown as Db;
  if (!(await employeeIn(db, ctx, employeeId))) return NO();
  const row = await db.hrFilingPerson.findFirst({ where: { employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: PERSON_SELECT });
  return { ok: true, person: (row as PersonDto | null) ?? null };
}
export async function saveFilingPerson(ctx: Ctx, viewer: FilingViewer, input: Record<string, unknown>): Promise<{ ok: true } | FilingFail> {
  const m = await gate(ctx, viewer);
  if (!m) return NO();
  const i = obj(input);
  const employeeId = str(i.employeeId);
  const db = tenantDb(ctx) as unknown as Db;
  if (!(await employeeIn(db, ctx, employeeId))) return NO();
  const bad: string[] = [];
  const data: Record<string, string | null> = {};
  for (const k of PERSON_KEYS) {
    const raw = i[k];
    const label = ["title", "firstName", "lastName", "ssoPrefix"].includes(k) ? k : `address.${k}`;
    if (raw === undefined || raw === null) {
      data[k] = null;
      continue;
    }
    if (typeof raw !== "string") {
      bad.push(label);
      continue;
    }
    const v = raw.trim();
    data[k] = v || null;
    if (!v) continue;
    if (k === "ssoPrefix") {
      if (!/^\d{3}$/.test(v)) bad.push(label);
      continue;
    }
    if (CONTROL.test(v)) bad.push(`${label}:char`);
    else if (v.length > PERSON_WIDTH[k]) bad.push(`${label}:long`);
  }
  if (bad.length) return failOf("PERSON", "person", { fields: bad });
  const write = async () => {
    const ex = await db.hrFilingPerson.findFirst({ where: { employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } });
    if (ex) await db.hrFilingPerson.updateMany({ where: { id: ex.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { ...data, updatedById: m.userId } });
    else await db.hrFilingPerson.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, ...data, updatedById: m.userId } });
  };
  try {
    await write();
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") throw e;
    await write();
  }
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.filing.person", targetType: "HrEmployee", targetId: employeeId, after: { employeeId } });
  return { ok: true };
}

// ═════════════ โหลดข้อมูลของงวด (ใน tx · รอบ FOR SHARE) ═════════════
type RunRow = { id: string; periodKey: string; payDate: Date; status: string; engineVersion: number; finalized: boolean };
type Loaded = { items: FilingItem[]; persons: FilingPerson[]; names: Map<string, string>; pins: Map<string, string | null>; notFinal: string[]; badRuns: string[]; employer: FilingEmployer };

/** รอบ APPROVED/PAID ของช่วงวันที่จ่าย (เวลาไทย) — ถือ FOR SHARE จนจบธุรกรรม */
async function runsIn(tx: Db, ctx: Ctx, from: Date, to: Date): Promise<RunRow[]> {
  return tx.$queryRaw<RunRow[]>`
    SELECT "id", "periodKey", "payDate", "status"::text AS "status", "engineVersion",
           COALESCE(("stepsJson"->>'finalized')::boolean, false) AS "finalized"
    FROM "HrPayrollRun"
    WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
      AND "status" IN ('APPROVED'::"PayrollRunStatus", 'PAID'::"PayrollRunStatus")
      AND "payDate" >= ${from} AND "payDate" < ${to}
    ORDER BY "payDate", "id"
    FOR SHARE`;
}
/** รอบรุ่น 2 นับเมื่อปิดงานแล้วเท่านั้น (H3.4) */
const counts = (r: RunRow) => r.engineVersion !== 2 || r.finalized === true;

/** รายการของรอบ → FilingItem (ค่าที่เก็บไว้) + คน (พนักงาน + ข้อมูลยื่น) */
async function loadItems(tx: Db, ctx: Ctx, runs: RunRow[], employeeFilter?: string): Promise<Loaded> {
  const use = runs.filter(counts);
  const notFinal = [...new Set(runs.filter((r) => !counts(r)).map((r) => r.periodKey))].sort();
  const byRun = new Map(use.map((r) => [r.id, r]));
  const rows = use.length
    ? await tx.hrPayrollItem.findMany({
        where: { runId: { in: use.map((r) => r.id) }, tenantId: ctx.tenantId, systemId: ctx.systemId, ...(employeeFilter ? { employeeId: employeeFilter } : {}) },
        select: { employeeId: true, runId: true, whtSatang: true, addSatang: true, ssoBaseSatang: true, ssoEmployeeSatang: true, ssoEmployerSatang: true, snapshotJson: true },
        orderBy: { id: "asc" },
      })
    : [];
  const items: FilingItem[] = [];
  const bad = new Set<string>();
  for (const it of rows) {
    const r = byRun.get(it.runId)!;
    const f = itemFigures({ engineVersion: r.engineVersion, whtSatang: it.whtSatang, addSatang: it.addSatang, ssoBaseSatang: it.ssoBaseSatang, ssoEmployeeSatang: it.ssoEmployeeSatang, ssoEmployerSatang: it.ssoEmployerSatang, snapshotJson: it.snapshotJson });
    if (!f.ok) {
      bad.add(r.periodKey);
      continue;
    }
    items.push({
      employeeId: it.employeeId, runId: r.id, engineVersion: r.engineVersion, runStatus: r.status, payDate: bkkDay(r.payDate),
      incomeSatang: f.incomeSatang, taxSatang: f.taxSatang, ssoWageActualSatang: f.ssoWageActualSatang, ssoWageClampedSatang: f.ssoWageClampedSatang, ssoEmployeeSatang: f.ssoEmployeeSatang, ssoEmployerSatang: f.ssoEmployerSatang,
    });
  }
  const ids = [...new Set(rows.map((r) => r.employeeId))];
  const { persons, names, pins } = await personsOf(tx, ctx, ids);
  return { items, persons, names, pins, notFinal, badRuns: [...bad].sort(), employer: employerOf(await profileOf(tx, ctx)) };
}
async function personsOf(tx: Db, ctx: Ctx, ids: string[]) {
  const emps = ids.length
    ? await tx.hrEmployee.findMany({
        where: { id: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId },
        select: { id: true, name: true, code: true, nationalId: true, addressLine: true, subdistrict: true, district: true, province: true, postcode: true },
      })
    : [];
  const fps = ids.length ? await tx.hrFilingPerson.findMany({ where: { employeeId: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { employeeId: true, ...PERSON_SELECT } }) : [];
  const fpOf = new Map(fps.map((p) => [p.employeeId, p]));
  const persons: FilingPerson[] = emps.map((e) => {
    const fp = fpOf.get(e.id);
    return {
      employeeId: e.id, name: e.name, code: e.code?.trim() ? e.code.trim() : null, nationalId: e.nationalId, title: fp?.title ?? null, firstName: fp?.firstName ?? null, lastName: fp?.lastName ?? null, ssoPrefix: fp?.ssoPrefix ?? null,
      address: {
        building: fp?.building ?? null, room: fp?.room ?? null, floor: fp?.floor ?? null, village: fp?.village ?? null, houseNo: fp?.houseNo ?? null, moo: fp?.moo ?? null, soi: fp?.soi ?? null, street: fp?.street ?? null,
        subdistrict: e.subdistrict, district: e.district, province: e.province, postcode: e.postcode, line: e.addressLine,
      },
    };
  });
  return { persons, names: new Map(emps.map((e) => [e.id, e.name])), pins: new Map(emps.map((e) => [e.id, e.nationalId])) };
}

// ═════════════ คำขอ → สร้างไฟล์ ═════════════
export type FilingRequest = { kind: unknown; period?: unknown; runId?: unknown; options?: unknown };
type Built = { kind: FilingKind; period: string; runId: string | null; r: PndOk | SsoOk; L: Loaded; options: Record<string, unknown> };
type Prepared = { st: "no" } | { st: "fail"; fail: FilingFail } | ({ st: "ok" } & Built);
const PND_OPTION_KEYS = ["formType", "seqNo", "formFlag", "slashMode"] as const;
const SSO_OPTION_KEYS = ["encoding", "wageMode", "paidDate", "rateBp", "lineEnd"] as const;
function pickOptions(raw: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (raw as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}
const toDtoWarnings = (L: Loaded, ws: FilingWarning[]): WarningDto[] => ws.map((w) => ({ employeeId: w.employeeId, name: w.employeeId ? (L.names.get(w.employeeId) ?? "") : null, warning: w.code, fields: [...w.fields] }));
function refusalOf(L: Loaded | null, r: { code: string; text: string; fields: string[]; notIncluded?: { employeeId: string; cause: string; fields: string[]; incomeSatang?: number; taxSatang?: number; wageSatang?: number; contributionSatang?: number }[] }): FilingFail {
  return {
    ok: false,
    code: r.code,
    reason: r.text,
    ...(r.code === "PROFILE" || r.code === "OPTIONS" ? { fields: r.fields } : {}),
    ...(r.notIncluded && L ? { notIncluded: niDto(L, r.notIncluded) } : {}),
  };
}
function niDto(L: Loaded, rows: { employeeId: string; cause: string; fields: string[]; incomeSatang?: number; taxSatang?: number; wageSatang?: number; contributionSatang?: number }[]): NotIncludedDto[] {
  return rows.map((x) => ({ employeeId: x.employeeId, name: L.names.get(x.employeeId) ?? "", cause: x.cause, fields: [...x.fields], amountSatang: x.incomeSatang ?? x.wageSatang ?? 0, taxSatang: x.taxSatang ?? x.contributionSatang ?? 0 }));
}

/** ตรวจคำขอ + (ใน tx ที่ถือรอบ FOR SHARE) โหลด → สร้าง · after = เขียนใบกำกับใน tx เดียวกัน */
async function prepare(ctx: Ctx, req: FilingRequest, after?: (tx: Db, b: Built) => Promise<string>): Promise<Prepared & { fileId?: string }> {
  const q = obj(req);
  const kind = q.kind;
  if (kind === "SSO110") {
    const runId = str(q.runId);
    if (!ID_RE.test(runId)) return { st: "no" };
    const options = pickOptions(q.options, SSO_OPTION_KEYS);
    return runTx(ctx, async (tx) => {
      const rows = await tx.$queryRaw<RunRow[]>`
        SELECT "id", "periodKey", "payDate", "status"::text AS "status", "engineVersion",
               COALESCE(("stepsJson"->>'finalized')::boolean, false) AS "finalized"
        FROM "HrPayrollRun"
        WHERE "id" = ${runId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
        FOR SHARE`;
      const run = rows[0];
      if (!run) return { st: "no" as const };
      if (run.status !== "APPROVED" && run.status !== "PAID") return { st: "fail" as const, fail: failOf("STATUS", "status") };
      if (!counts(run)) return { st: "fail" as const, fail: failOf("NOT_FINAL", "notFinal") };
      if (!options) return { st: "fail" as const, fail: failOf("OPTIONS", "options", { fields: ["encoding"] }) };
      const L = await loadItems(tx, ctx, [run]);
      const input = { run: { periodKey: run.periodKey, payDate: bkkDay(run.payDate), status: run.status }, employer: L.employer, persons: L.persons, options };
      if (L.badRuns.length) {
        const pre = buildSso110({ ...input, items: [] });
        if (!pre.ok && (pre.code === "PROFILE" || pre.code === "OPTIONS")) return { st: "fail" as const, fail: refusalOf(null, pre) };
        return { st: "fail" as const, fail: failOf("RUN_DATA", "runData", { runs: L.badRuns }) };
      }
      const r = buildSso110({ ...input, items: L.items });
      if (!r.ok) return { st: "fail" as const, fail: refusalOf(L, r) };
      const b: Built = { kind: "SSO110", period: run.periodKey, runId: run.id, r, L, options: { ...r.resolved } };
      return after ? { st: "ok" as const, ...b, fileId: await after(tx, b) } : { st: "ok" as const, ...b };
    });
  }
  if (kind !== "PND1" && kind !== "PND1A") return { st: "fail", fail: failOf("OPTIONS", "options", { fields: ["taxMonth"] }) };
  const period = str(q.period);
  const m = kind === "PND1" ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period) : /^(\d{4})$/.exec(period);
  const year = m ? Number(m[1]) : NaN;
  if (!m || year < 2000 || year > 2400) return { st: "fail", fail: failOf("OPTIONS", "options", { fields: [kind === "PND1" ? "taxMonth" : "taxYear"] }) };
  const month = kind === "PND1" ? Number(m[2]) : null;
  const options = pickOptions(q.options, PND_OPTION_KEYS);
  if (!options) return { st: "fail", fail: failOf("OPTIONS", "options", { fields: ["formType"] }) };
  return runTx(ctx, async (tx) => {
    const from = month === null ? bkkStart(year, 0) : bkkStart(year, month - 1);
    const to = month === null ? bkkStart(year + 1, 0) : bkkStart(year, month);
    const runs = await runsIn(tx, ctx, from, to);
    const L = await loadItems(tx, ctx, runs);
    const certs =
      kind === "PND1A"
        ? (await tx.hrTaxCertificate.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, taxYear: year, voidedAt: null }, select: { employeeId: true, docSeq: true, formSeq: true }, orderBy: { docSeq: "asc" } }))
        : [];
    const input = { kind, taxYear: year, taxMonth: month, employer: L.employer, persons: L.persons, certs, options } as const;
    if (L.badRuns.length) {
      const pre = buildPnd1({ ...input, items: [] });
      if (!pre.ok && (pre.code === "PROFILE" || pre.code === "OPTIONS")) return { st: "fail" as const, fail: refusalOf(null, pre) };
      return { st: "fail" as const, fail: failOf("RUN_DATA", "runData", { runs: L.badRuns }) };
    }
    const r = buildPnd1({ ...input, items: L.items });
    // fix r1 F7: ว่างเพราะรอบของงวดยังลงบัญชีไม่เสร็จ ⇒ EMPTY พร้อมเหตุ notFinal + งวด (ผู้ใช้รู้ว่าต้องปิดรอบก่อน)
    if (!r.ok && r.code === "EMPTY" && L.notFinal.length) return { st: "fail" as const, fail: { ...refusalOf(L, r), reason: `${T.notFinal} (${L.notFinal.join(", ")})`, periods: [...L.notFinal] } };
    if (!r.ok) return { st: "fail" as const, fail: refusalOf(L, r) };
    if (L.notFinal.length) r.warnings = [{ employeeId: null, code: "NOT_FINAL", fields: L.notFinal }, ...r.warnings];
    const b: Built = { kind, period, runId: null, r, L, options: { ...r.resolved } };
    return after ? { st: "ok" as const, ...b, fileId: await after(tx, b) } : { st: "ok" as const, ...b };
  });
}

function rowsOf(b: Built): RowDto[] {
  if (b.kind === "SSO110") {
    const r = b.r as SsoOk;
    return r.included.map((x) => ({ seq: x.seq, employeeId: x.employeeId, name: b.L.names.get(x.employeeId) ?? "", pinMasked: pinMasked(b.L.pins.get(x.employeeId)), payDate: null, amountSatang: x.wageSatang, taxSatang: x.employeeSatang }));
  }
  const r = b.r as PndOk;
  return r.included.map((x) => ({ seq: x.seq, employeeId: x.employeeId, name: b.L.names.get(x.employeeId) ?? "", pinMasked: pinMasked(b.L.pins.get(x.employeeId)), payDate: x.payDate, amountSatang: x.incomeSatang, taxSatang: x.taxSatang }));
}

export async function previewFiling(ctx: Ctx, viewer: FilingViewer, req: FilingRequest, opts?: Opts): Promise<PreviewDto | FilingFail> {
  void opts;
  if (!(await gate(ctx, viewer))) return NO();
  const p = await prepare(ctx, req);
  if (p.st === "no") return NO();
  if (p.st === "fail") return p.fail;
  return {
    ok: true,
    kind: p.kind,
    period: p.period,
    lineCount: p.r.lineCount,
    totalSatang: p.r.totalSatang,
    taxSatang: p.r.taxSatang,
    rows: rowsOf(p),
    notIncluded: niDto(p.L, p.r.notIncluded),
    warnings: toDtoWarnings(p.L, p.r.warnings),
    untested: p.kind === "SSO110",
  };
}

export type GenerateOk = { ok: true; fileId: string; fileName: string; contentType: string; bytes: Uint8Array; lineCount: number; totalSatang: number; taxSatang: number; notIncluded: NotIncludedDto[]; warnings: WarningDto[] };
export async function generateFiling(ctx: Ctx, viewer: FilingViewer, req: FilingRequest, opts?: Opts): Promise<GenerateOk | FilingFail> {
  const m = await gate(ctx, viewer);
  if (!m) return NO();
  const now = nowOf(opts);
  const p = await prepare(ctx, req, async (tx, b) => {
    const row = await tx.hrFilingFile.create({
      data: {
        tenantId: ctx.tenantId, systemId: ctx.systemId, kind: b.kind, period: b.period, runId: b.runId, optionsJson: b.options as Prisma.InputJsonValue,
        fileName: b.r.fileName, byteLength: b.r.bytes.length, sha256: sha256(b.r.bytes), lineCount: b.r.lineCount, totalSatang: b.r.totalSatang, taxSatang: b.r.taxSatang,
        excludedCount: b.r.notIncluded.length, createdById: m.userId, createdAt: now, expiresAt: new Date(now.getTime() + EXPIRY_MS),
      },
      select: { id: true },
    });
    return row.id;
  });
  if (p.st === "no") return NO();
  if (p.st === "fail") return p.fail;
  const fileId = p.fileId!;
  await writeAudit({
    tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.filing.generate", targetType: "HrFilingFile", targetId: fileId,
    after: { fileId, kind: p.kind, period: p.period, lineCount: p.r.lineCount, totalSatang: p.r.totalSatang, taxSatang: p.r.taxSatang, excludedCount: p.r.notIncluded.length },
  });
  return { ok: true, fileId, fileName: p.r.fileName, contentType: p.r.contentType, bytes: p.r.bytes, lineCount: p.r.lineCount, totalSatang: p.r.totalSatang, taxSatang: p.r.taxSatang, notIncluded: niDto(p.L, p.r.notIncluded), warnings: toDtoWarnings(p.L, p.r.warnings) };
}

// ═════════════ ดาวน์โหลดไฟล์ (R10) ═════════════
export type DownloadOk = { ok: true; fileName: string; contentType: string; bytes: Uint8Array };
export async function downloadFiling(ctx: Ctx, viewer: FilingViewer, input: { fileId: unknown }, opts?: Opts): Promise<DownloadOk | FilingFail> {
  const m = await gate(ctx, viewer);
  const fileId = str(obj(input).fileId);
  if (!m || !ID_RE.test(fileId)) return NO();
  const now = nowOf(opts);
  const db = tenantDb(ctx) as unknown as Db;
  const f = await db.hrFilingFile.findFirst({ where: { id: fileId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!f) return NO();
  if (f.kind === "SSO110") {
    const run = f.runId ? await db.hrPayrollRun.findFirst({ where: { id: f.runId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { status: true } }) : null;
    if (!run) return NO();
    if (run.status !== "APPROVED" && run.status !== "PAID") return failOf("STATUS", "status");
  }
  if (now.getTime() >= f.expiresAt.getTime()) return failOf("EXPIRED", "expired");
  const req: FilingRequest = { kind: f.kind, period: f.kind === "SSO110" ? undefined : f.period, runId: f.runId ?? undefined, options: obj(f.optionsJson) };
  // สร้างใหม่ด้วยตัวเลือกเดิมในธุรกรรมเดียวกับการนับดาวน์โหลด · ไบต์ไม่ตรง = โยนเพื่อย้อนการนับ
  const CHANGED = Symbol("changed");
  let p: Awaited<ReturnType<typeof prepare>>;
  try {
    p = await prepare(ctx, req, async (tx, b) => {
      if (b.r.bytes.length !== f.byteLength || sha256(b.r.bytes) !== f.sha256) throw CHANGED;
      await tx.hrFilingFile.updateMany({ where: { id: f.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { downloads: { increment: 1 } } });
      return f.id;
    });
  } catch (e) {
    if (e === CHANGED) return failOf("CHANGED", "changed");
    throw e;
  }
  if (p.st === "fail" && p.fail.code === "STATUS") return failOf("STATUS", "status");
  // สร้างใหม่ไม่ได้ (รอบของงวดถูกกลับหมด ฯลฯ) = ข้อมูลเปลี่ยน
  if (p.st !== "ok") return p.st === "no" ? NO() : failOf("CHANGED", "changed");
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.filing.download", targetType: "HrFilingFile", targetId: f.id, after: { fileId: f.id, kind: f.kind } });
  return { ok: true, fileName: f.fileName, contentType: p.r.contentType, bytes: p.r.bytes };
}

export async function listFilingFiles(ctx: Ctx, viewer: FilingViewer, input: { kind?: unknown; period?: unknown } = {}): Promise<{ ok: true; items: FileRowDto[] } | FilingNo> {
  if (!(await gate(ctx, viewer))) return NO();
  const i = obj(input);
  const kind = ["PND1", "PND1A", "SSO110"].includes(i.kind as string) ? (i.kind as string) : undefined;
  const period = typeof i.period === "string" && /^\d{4}(-\d{2})?$/.test(i.period) ? i.period : undefined;
  const db = tenantDb(ctx) as unknown as Db;
  const rows = await db.hrFilingFile.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...(kind ? { kind } : {}), ...(period ? { period } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { id: true, kind: true, period: true, fileName: true, lineCount: true, totalSatang: true, taxSatang: true, excludedCount: true, createdAt: true, expiresAt: true, createdById: true, downloads: true },
  });
  const uids = [...new Set(rows.map((r) => r.createdById))];
  const users = new Map(uids.length ? (await tenantDb({ tenantId: ctx.tenantId }).user.findMany({ where: { id: { in: uids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : []);
  return {
    ok: true,
    items: rows.map((r) => ({
      id: r.id, kind: r.kind, period: r.period, fileName: maskedFileName(r.fileName), lineCount: r.lineCount, totalSatang: Number(r.totalSatang), taxSatang: Number(r.taxSatang), excludedCount: r.excludedCount,
      createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString(), createdByName: users.get(r.createdById) ?? null, downloads: r.downloads,
    })),
  };
}

// ═════════════ หนังสือรับรอง 50 ทวิ (R11) ═════════════
type CertFigures = { incomeSatang: number; taxSatang: number; ssoSatang: number };
/** ยอดของพนักงานในปีภาษี (รอบ APPROVED/PAID ที่นับได้ · ถือรอบ FOR SHARE) — null = ข้อมูลรอบเสีย (งวด) */
async function yearFigures(tx: Db, ctx: Ctx, year: number, employeeId?: string): Promise<{ by: Map<string, CertFigures>; badRuns: string[]; order: string[]; L: Loaded }> {
  const runs = await runsIn(tx, ctx, bkkStart(year, 0), bkkStart(year + 1, 0));
  const L = await loadItems(tx, ctx, runs, employeeId);
  const by = new Map<string, CertFigures>();
  for (const i of L.items) {
    const c = by.get(i.employeeId) ?? { incomeSatang: 0, taxSatang: 0, ssoSatang: 0 };
    by.set(i.employeeId, { incomeSatang: c.incomeSatang + i.incomeSatang, taxSatang: c.taxSatang + i.taxSatang, ssoSatang: c.ssoSatang + i.ssoEmployeeSatang });
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const order = [...L.persons]
    .sort((a, b) => (a.code === null ? 1 : 0) - (b.code === null ? 1 : 0) || cmp(a.code ?? "", b.code ?? "") || cmp(a.name, b.name) || cmp(a.employeeId, b.employeeId))
    .map((p) => p.employeeId);
  return { by, badRuns: L.badRuns, order, L };
}
/** ช่องที่ขาดสำหรับหนังสือรับรอง (ลำดับคงที่) */
function certPersonFields(p: FilingPerson | undefined): string[] {
  const f: string[] = [];
  if (!p || !thaiIdOk(p.nationalId)) f.push("nationalId");
  if (!p || !hasBase(String(p.firstName ?? "").trim())) f.push("firstName");
  if (!p || !hasBase(String(p.lastName ?? "").trim())) f.push("lastName");
  if (!p || !hasBase(String(p.address?.district ?? "").trim())) f.push("address.district");
  if (!p || !hasBase(String(p.address?.province ?? "").trim())) f.push("address.province");
  if (!p || !/^\d{5}$/.test(String(p.address?.postcode ?? "").trim())) f.push("address.postcode");
  return f;
}
function certProfileFields(e: FilingEmployer): string[] {
  const f: string[] = [];
  if (!thaiIdOk(e.taxId)) f.push("taxId");
  if (!/^\d{6}$/.test(String(e.branchNo ?? ""))) f.push("branchNo");
  if (!hasBase(String(e.employerName ?? "").trim())) f.push("employerName");
  if (!hasBase(String(e.employerAddress ?? "").trim())) f.push("employerAddress");
  if (!hasBase(String(e.signerName ?? "").trim())) f.push("signerName");
  if (!/^[A-Z0-9]{1,8}$/.test(String(e.certPrefix ?? ""))) f.push("certPrefix");
  return f;
}

type IssueOut = { ok: true; certId: string; docNo: string; formSeq: number } | FilingFail | FilingNo;
/** ออก 1 ใบ ในธุรกรรมของตัวเอง (ผู้เรียกผ่านด่านแล้ว) */
async function issueOne(ctx: Ctx, actorId: string, employeeId: string, taxYear: number, kind: "ANNUAL" | "LEAVER", now: Date): Promise<IssueOut> {
  const existing = async () => (await (tenantDb(ctx) as unknown as Db).hrTaxCertificate.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, taxYear, voidedAt: null }, select: { docNo: true } }))?.docNo ?? null;
  try {
    const out = await runTx(ctx, async (tx): Promise<IssueOut> => {
      // 1) คิวต่อ (ระบบ, พนักงาน, ปี) — ผู้แพ้รอแล้วเห็นใบของผู้ชนะ (certExists) ไม่กินเลข
      await tx.$queryRaw`SELECT 1 AS "x" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`hr50:${ctx.systemId}:${employeeId}:${taxYear}`}, 36))) AS "l"`;
      const emp = await tx.hrEmployee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, endDate: true } });
      if (!emp) return NO();
      // fix r1 F6: LEAVER = วันสิ้นสุดการจ้างอยู่ในปีภาษีและผ่านมาแล้ว (ออกได้ระหว่างปี — ม.50 ทวิ ภายใน 1 เดือนหลังออก) · ANNUAL = หลังสิ้นปีภาษี (เวลาไทย)
      if (kind === "LEAVER" && !(emp.endDate && emp.endDate.getUTCFullYear() === taxYear && emp.endDate.toISOString().slice(0, 10) <= bkkDay(now))) return failOf("CERT_NOT_LEFT", "certNotLeft");
      if (kind === "ANNUAL" && now.getTime() < bkkStart(taxYear + 1, 0).getTime()) return failOf("CERT_TOO_EARLY", "certTooEarly");
      const live = await tx.hrTaxCertificate.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, taxYear, voidedAt: null }, select: { docNo: true } });
      if (live) return failOf("CERT_EXISTS", "certExists", { docNo: live.docNo });
      // 2) ยอดของปี (รอบ FOR SHARE) — ค่าที่เก็บไว้เท่านั้น
      const Y = await yearFigures(tx, ctx, taxYear, employeeId);
      if (Y.badRuns.length) return failOf("RUN_DATA", "runData", { runs: Y.badRuns });
      const fig = Y.by.get(employeeId);
      if (!fig || (fig.incomeSatang === 0 && fig.taxSatang === 0)) return failOf("CERT_NONE", "certNone");
      const pf = certProfileFields(Y.L.employer);
      if (pf.length) return failOf("PROFILE", "profile", { fields: pf });
      const person = Y.L.persons.find((p) => p.employeeId === employeeId);
      const missing = certPersonFields(person);
      if (missing.length) return failOf("CERT_INCOMPLETE", "certIncomplete", { fields: missing });
      // 3) เลขที่ — ตัวนับของเครื่องออกเลข = ล็อกสุดท้าย (หลังจากนี้เขียนแถวหนังสือรับรองของตัวเองเท่านั้น)
      const prefix = String(Y.L.employer.certPrefix);
      const seq = await reserveSeq(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "WHT_CERT", prefix, periodKey: `HR50:${taxYear}`, startNo: 1 });
      const lower = await tx.hrTaxCertificate.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, taxYear, voidedAt: null, docSeq: { lt: seq } } });
      const formSeq = lower + 1;
      const content = taxCertContent({ kind, taxYear, seq, formSeq, issueDate: bkkDay(now), employer: Y.L.employer, person: person!, figures: fig });
      const row = await tx.hrTaxCertificate.create({
        data: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, taxYear, kind, docSeq: seq, docNo: content.docNo, formSeq, contentJson: content as unknown as Prisma.InputJsonValue, contentSha256: sha256(canon(content)), issuedAt: now, issuedById: actorId },
        select: { id: true },
      });
      return { ok: true, certId: row.id, docNo: content.docNo, formSeq };
    });
    if (out.ok) await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId, action: "hr.taxcert.issue", targetType: "HrTaxCertificate", targetId: out.certId, after: { certId: out.certId, docNo: out.docNo, kind, taxYear } });
    return out;
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") throw e;
    const docNo = await existing();
    return docNo ? failOf("CERT_EXISTS", "certExists", { docNo }) : failOf("CHANGED", "changed");
  }
}
const yearOk = (y: unknown): y is number => typeof y === "number" && Number.isInteger(y) && y >= 2000 && y <= 2400;

export async function issueTaxCertificate(ctx: Ctx, viewer: FilingViewer, input: { employeeId: unknown; taxYear: unknown; kind: unknown }, opts?: Opts): Promise<{ ok: true; certId: string; docNo: string; formSeq: number } | FilingFail> {
  const m = await gate(ctx, viewer);
  if (!m) return NO();
  const i = obj(input);
  const employeeId = str(i.employeeId);
  if (!ID_RE.test(employeeId)) return NO();
  const taxYear = typeof i.taxYear === "string" && /^\d{4}$/.test(i.taxYear) ? Number(i.taxYear) : i.taxYear;
  if (!yearOk(taxYear)) return failOf("OPTIONS", "options", { fields: ["taxYear"] });
  if (i.kind !== "ANNUAL" && i.kind !== "LEAVER") return failOf("OPTIONS", "options", { fields: ["taxYear"] });
  return issueOne(ctx, m.userId, employeeId, taxYear, i.kind, nowOf(opts));
}

export type BulkOk = {
  ok: true;
  issued: { employeeId: string; certId: string; docNo: string }[];
  skipped: { employeeId: string; cause: "ALREADY" | "INCOMPLETE" | "NO_INCOME" | "GONE"; fields: string[] }[];
  /** fix r1 F4: ปัญหาที่ต้องหยุดทั้งชุดกลางทาง (เช่น ข้อมูลผู้จ่ายเงินถูกแก้ระหว่างออก) — ใบที่ออกไปแล้วอยู่ใน issued เสมอ */
  stopped?: { code: string; reason: string; fields?: string[] };
};
/** opts.__afterIssue = ตะขอทดสอบเท่านั้น (ข้อสอบ S3.17 จำลองการแก้ข้อมูลผู้จ่ายเงินกลางชุด) — action ไม่ส่ง */
export async function issueTaxCertificatesBulk(ctx: Ctx, viewer: FilingViewer, input: { taxYear: unknown }, opts?: Opts & { __afterIssue?: (n: number) => Promise<void> }): Promise<BulkOk | FilingFail> {
  const m = await gate(ctx, viewer);
  if (!m) return NO();
  const raw = obj(input).taxYear;
  const taxYear = typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : raw;
  if (!yearOk(taxYear)) return failOf("OPTIONS", "options", { fields: ["taxYear"] });
  const now = nowOf(opts);
  if (now.getTime() < bkkStart(taxYear + 1, 0).getTime()) return failOf("CERT_TOO_EARLY", "certTooEarly"); // fix r1 F6
  // รายชื่อ = ทุกคนที่มีรายการในปี (ลำดับคน) — อ่านอย่างเดียว · แต่ละคนออกในธุรกรรมของตัวเอง
  const pre = await runTx(ctx, async (tx) => {
    const Y = await yearFigures(tx, ctx, taxYear);
    const live = await tx.hrTaxCertificate.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, taxYear, voidedAt: null }, select: { employeeId: true } });
    return { Y, live: new Set(live.map((x) => x.employeeId)) };
  });
  if (pre.Y.badRuns.length) return failOf("RUN_DATA", "runData", { runs: pre.Y.badRuns });
  const pf = certProfileFields(pre.Y.L.employer);
  if (pf.length) return failOf("PROFILE", "profile", { fields: pf });
  const issued: BulkOk["issued"] = [];
  const skipped: BulkOk["skipped"] = [];
  for (const employeeId of pre.Y.order) {
    if (pre.live.has(employeeId)) {
      skipped.push({ employeeId, cause: "ALREADY", fields: [] });
      continue;
    }
    const r = await issueOne(ctx, m.userId, employeeId, taxYear, "ANNUAL", now);
    if (r.ok) {
      issued.push({ employeeId, certId: r.certId, docNo: r.docNo });
      if (typeof opts?.__afterIssue === "function") await opts.__afterIssue(issued.length);
    }
    else if (r.code === "CERT_EXISTS") skipped.push({ employeeId, cause: "ALREADY", fields: [] });
    else if (r.code === "CERT_NONE") skipped.push({ employeeId, cause: "NO_INCOME", fields: [] });
    else if (r.code === "CERT_INCOMPLETE") skipped.push({ employeeId, cause: "INCOMPLETE", fields: (r as FilingFail).fields ?? [] });
    else if (r.code === "NO") skipped.push({ employeeId, cause: "GONE", fields: [] }); // พนักงานหายจากระบบระหว่างออก
    else {
      // fix r1 F4: ห้ามคืนคำปฏิเสธเปล่าหลังออกไปแล้วบางใบ — หยุดชุด แล้วคืนสิ่งที่ออกไปแล้ว + เหตุที่หยุด
      const f = r as FilingFail;
      return { ok: true, issued, skipped, stopped: { code: f.code, reason: f.reason, ...(f.fields ? { fields: f.fields } : {}) } };
    }
  }
  return { ok: true, issued, skipped };
}

export async function voidTaxCertificate(ctx: Ctx, viewer: FilingViewer, input: { certId: unknown; reason: unknown }, opts?: Opts): Promise<{ ok: true } | FilingFail> {
  const m = await gate(ctx, viewer);
  const i = obj(input);
  const certId = str(i.certId);
  if (!m || !ID_RE.test(certId)) return NO();
  if (m.role !== "OWNER" || viewer.role !== "OWNER") return failOf("VOID_OWNER", "certVoidOwner");
  const reason = str(i.reason).trim();
  if (reason.length < 1 || reason.length > 200 || !hasBase(reason) || CONTROL.test(reason)) return failOf("VOID_REASON", "voidReason");
  const now = nowOf(opts);
  const db = tenantDb(ctx) as unknown as Db;
  const c = await db.hrTaxCertificate.findFirst({ where: { id: certId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, docNo: true, voidedAt: true } });
  if (!c) return NO();
  if (c.voidedAt) return failOf("VOIDED", "voided");
  const u = await db.hrTaxCertificate.updateMany({ where: { id: c.id, tenantId: ctx.tenantId, systemId: ctx.systemId, voidedAt: null }, data: { voidedAt: now, voidedById: m.userId, voidReason: reason } });
  if (u.count !== 1) return failOf("VOIDED", "voided");
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.taxcert.void", targetType: "HrTaxCertificate", targetId: c.id, after: { certId: c.id, docNo: c.docNo } });
  return { ok: true };
}

export async function listTaxCertificates(ctx: Ctx, viewer: FilingViewer, input: { taxYear: unknown }): Promise<{ ok: true; items: CertRowDto[] } | FilingFail> {
  if (!(await gate(ctx, viewer))) return NO();
  const raw = obj(input).taxYear;
  const taxYear = typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : raw;
  if (!yearOk(taxYear)) return failOf("OPTIONS", "options", { fields: ["taxYear"] });
  const { rows, Y } = await runTx(ctx, async (tx) => ({
    rows: await tx.hrTaxCertificate.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, taxYear },
      orderBy: [{ docSeq: "asc" }, { id: "asc" }],
      take: 500,
      select: { id: true, employeeId: true, taxYear: true, kind: true, docNo: true, formSeq: true, issuedAt: true, voidedAt: true, downloads: true, contentJson: true },
    }),
    Y: await yearFigures(tx, ctx, taxYear),
  }));
  const names = new Map((await (tenantDb(ctx) as unknown as Db).hrEmployee.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.employeeId))] }, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  return {
    ok: true,
    items: rows.map((r) => {
      const c = obj(r.contentJson) as Partial<TaxCertContent>;
      const now = Y.by.get(r.employeeId) ?? { incomeSatang: 0, taxSatang: 0, ssoSatang: 0 };
      const stale = !r.voidedAt && (c.totalSatang !== now.incomeSatang || c.totalTaxSatang !== now.taxSatang || c.funds?.ssoSatang !== now.ssoSatang);
      return { id: r.id, employeeId: r.employeeId, name: names.get(r.employeeId) ?? "", taxYear: r.taxYear, kind: r.kind, docNo: r.docNo, formSeq: r.formSeq, issuedAt: r.issuedAt.toISOString(), voided: !!r.voidedAt, downloads: r.downloads, stale };
    }),
  };
}

/** ใบที่ผ่านการตรวจ → PDF (ตรวจ sha ของเนื้อหาที่แช่แข็งก่อน) · นับดาวน์โหลด */
async function certPdf(ctx: Ctx, where: { id: string; employeeId?: string }, liveOnly: boolean): Promise<{ ok: true; fileName: string; contentType: string; bytes: Uint8Array; certId: string } | FilingFail | FilingNo> {
  const db = tenantDb(ctx) as unknown as Db;
  const c = await db.hrTaxCertificate.findFirst({ where: { ...where, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, docNo: true, voidedAt: true, contentJson: true, contentSha256: true } });
  if (!c || (liveOnly && c.voidedAt)) return NO();
  if (c.voidedAt) return failOf("VOIDED", "voided");
  if (sha256(canon(c.contentJson)) !== c.contentSha256) return failOf("CERT_CHANGED", "certChanged");
  const bytes = await renderTaxCertPdf(c.contentJson as unknown as TaxCertContent);
  await db.hrTaxCertificate.updateMany({ where: { id: c.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { downloads: { increment: 1 } } });
  return { ok: true, fileName: `${c.docNo}.pdf`, contentType: "application/pdf", bytes, certId: c.id };
}

export async function downloadTaxCertificate(ctx: Ctx, viewer: FilingViewer, input: { certId: unknown }, opts?: Opts): Promise<DownloadOk | FilingFail> {
  void opts;
  const m = await gate(ctx, viewer);
  const certId = str(obj(input).certId);
  if (!m || !ID_RE.test(certId)) return NO();
  const r = await certPdf(ctx, { id: certId }, false);
  if (!r.ok) return r;
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.taxcert.download", targetType: "HrTaxCertificate", targetId: r.certId, after: { certId: r.certId, by: "GATE" } });
  return { ok: true, fileName: r.fileName, contentType: r.contentType, bytes: r.bytes };
}

// ═════════════ ของฉัน (H2.10 self — ใบของตัวเองที่ยังไม่ยกเลิกเท่านั้น) ═════════════
export async function listMyTaxCertificates(actor: SelfActor): Promise<{ ok: true; items: MyCertRowDto[] } | FilingNo> {
  const me = await resolveSelf(actor);
  if (!me) return NO();
  const rows = await (tenantDb(me.ctx) as unknown as Db).hrTaxCertificate.findMany({
    where: { tenantId: me.ctx.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, voidedAt: null },
    orderBy: [{ taxYear: "desc" }, { docSeq: "desc" }],
    take: 50,
    select: { id: true, taxYear: true, kind: true, docNo: true, issuedAt: true },
  });
  return { ok: true, items: rows.map((r) => ({ id: r.id, taxYear: r.taxYear, kind: r.kind, docNo: r.docNo, issuedAt: r.issuedAt.toISOString() })) };
}
export async function downloadMyTaxCertificate(actor: SelfActor, input: { certId: unknown }): Promise<DownloadOk | FilingFail> {
  const me = await resolveSelf(actor);
  const certId = str(obj(input).certId);
  if (!me || !ID_RE.test(certId)) return NO();
  const r = await certPdf(me.ctx, { id: certId, employeeId: me.employeeId }, true);
  if (!r.ok) return r;
  await writeAudit({ tenantId: me.ctx.tenantId, actorType: "USER", actorId: me.userId, action: "hr.taxcert.download", targetType: "HrTaxCertificate", targetId: r.certId, after: { certId: r.certId, by: "SELF" } });
  return { ok: true, fileName: r.fileName, contentType: r.contentType, bytes: r.bytes };
}

// ═════════════ รายชื่อสำหรับหน้าจอ (ผู้ผ่านด่าน) ═════════════
export type CandidateDto = { employeeId: string; name: string; leaver: boolean; certified: boolean };
/** คนที่มีรายการในปีภาษี (ลำดับคน) + ออกแบบออกจากงานได้ไหม + มีใบที่ยังไม่ยกเลิกแล้วหรือยัง */
export async function listCertCandidates(ctx: Ctx, viewer: FilingViewer, input: { taxYear: unknown }): Promise<{ ok: true; items: CandidateDto[] } | FilingFail> {
  if (!(await gate(ctx, viewer))) return NO();
  const raw = obj(input).taxYear;
  const taxYear = typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : raw;
  if (!yearOk(taxYear)) return failOf("OPTIONS", "options", { fields: ["taxYear"] });
  const { Y, live, ends } = await runTx(ctx, async (tx) => {
    const Y = await yearFigures(tx, ctx, taxYear);
    const live = await tx.hrTaxCertificate.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, taxYear, voidedAt: null }, select: { employeeId: true } });
    const ends = Y.order.length ? await tx.hrEmployee.findMany({ where: { id: { in: Y.order }, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, endDate: true } }) : [];
    return { Y, live: new Set(live.map((x) => x.employeeId)), ends: new Map(ends.map((e) => [e.id, e.endDate])) };
  });
  return {
    ok: true,
    items: Y.order.map((id) => { const e = ends.get(id); return { employeeId: id, name: Y.L.names.get(id) ?? "", leaver: !!e && e.getUTCFullYear() === taxYear && e.toISOString().slice(0, 10) <= bkkDay(new Date()), certified: live.has(id) }; }), // fix r1 F6
  };
}
export type FilingEmployeeDto = { employeeId: string; name: string; code: string | null };
/** พนักงานของระบบ (ตัวเลือกของตัวแก้ข้อมูลยื่น) — ชื่อ + รหัสเท่านั้น */
export async function listFilingEmployees(ctx: Ctx, viewer: FilingViewer): Promise<{ ok: true; items: FilingEmployeeDto[] } | FilingNo> {
  if (!(await gate(ctx, viewer))) return NO();
  const rows = await (tenantDb(ctx) as unknown as Db).hrEmployee.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, name: true, code: true }, orderBy: [{ code: "asc" }, { name: "asc" }, { id: "asc" }], take: 500 });
  return { ok: true, items: rows.map((e) => ({ employeeId: e.id, name: e.name, code: e.code })) };
}
/** รอบที่สร้าง สปส.1-10 ได้ (APPROVED/PAID) ล่าสุด */
export async function listFilingRuns(ctx: Ctx, viewer: FilingViewer): Promise<{ ok: true; items: { id: string; periodKey: string; status: string }[] } | FilingNo> {
  if (!(await gate(ctx, viewer))) return NO();
  const rows = await (tenantDb(ctx) as unknown as Db).hrPayrollRun.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: { in: ["APPROVED", "PAID"] } },
    orderBy: [{ periodKey: "desc" }, { createdAt: "desc" }],
    take: 12,
    select: { id: true, periodKey: true, status: true },
  });
  return { ok: true, items: rows.map((r) => ({ id: r.id, periodKey: r.periodKey, status: String(r.status) })) };
}
