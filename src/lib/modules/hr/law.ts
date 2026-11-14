// HR H3.3 ▸ ตัวอ่านตารางกฎหมายเงินเดือน (HrLawTable) — ไฟล์เดียวในโค้ดร้านที่อ่านตารางนี้ · อ่านอย่างเดียว (เขียน = src/lib/platform/hr-law.ts)
//
// เลือกแถว (Q1 · Q2): วันมีผล = วันตามปฏิทินไทยของวันจ่ายเงินเดือน (lawDayOf) · เฉพาะแถว ACTIVE · effectiveFrom มากสุดที่ ≤ วันนั้น ·
//   DRAFT/RETIRED ไม่นับ · ไม่มีแถว = LAW_MISSING · สองแถวในวันเดียวกัน = LAW_AMBIGUOUS · ผลไม่ขึ้นกับลำดับที่ส่งเข้า
// 🔴 ขาดแถวใดแถวหนึ่ง = ปฏิเสธพร้อมรายชื่อชนิดที่ขาด — ไม่ถอยไปใช้ค่าคงที่ของรุ่น 1 เด็ดขาด (H3.4 ต้องหยุดงวดด้วย LAW_MSG)
// 🔴 ตารางกลาง (ไม่ผูกร้าน) — ไม่มีข้อมูลพนักงาน · หน้าแสดงไม่ส่ง approvedById / sourceKey / supersedesId ออกไป
import type { HrLawKind, HrLawStatus, Prisma } from "@prisma/client";
import { tenantDb, type TenantDb } from "@/lib/core/db";
import { thaiDateKey } from "@/lib/ui/date";
import type { LawSetV2 } from "./payroll-rules-v2";

export const LAW_KINDS_V2 = ["SSO", "TAX_BRACKET", "DEDUCTION"] as const satisfies readonly HrLawKind[];
export const LAW_VIEW_KINDS = ["SSO", "TAX_BRACKET", "DEDUCTION", "OT", "MIN_WAGE"] as const satisfies readonly HrLawKind[];

/** ข้อความไทยของรหัสปฏิเสธ (ผู้ใช้เห็น) — ไม่บอกรายละเอียดภายใน */
export const LAW_MSG = {
  LAW_MISSING: "ยังไม่มีตารางกฎหมายที่มีผล ณ วันจ่ายเงินเดือนนี้ — รอนักบัญชียืนยันตารางกฎหมายก่อน จึงคิดเงินเดือนแบบใหม่ได้",
  LAW_AMBIGUOUS: "ตารางกฎหมายมีผลซ้อนกันในวันเดียวกัน — แจ้งทีมงาน SHARK ให้ตรวจตารางกฎหมาย",
  LAW_BAD_DAY: "วันจ่ายเงินเดือนไม่ถูกต้อง",
  LAW_SHAPE: "ตารางกฎหมายมีรูปแบบที่ระบบยังไม่รองรับ — แจ้งทีมงาน SHARK",
  BAD_SATANG: "จำนวนเงินไม่ถูกต้อง",
  BAD_MONTH: "เดือนของงวดไม่ถูกต้อง",
  BAD_KIND: "มีรายการเพิ่ม/หักชนิดที่ระบบไม่รู้จัก",
  BAD_DEDUCTION: "ข้อมูลค่าลดหย่อนของพนักงานไม่ถูกต้อง",
  BAD_DAY: "วันที่ไม่ถูกต้อง",
} as const;
export type LawCode = keyof typeof LAW_MSG;

export type LawRowIn = { id: string; kind: HrLawKind | string; effectiveFrom: string | Date; status: HrLawStatus | string; json: unknown };
export type PickResult<R> = { ok: true; row: R } | { ok: false; code: "LAW_MISSING" | "LAW_AMBIGUOUS" | "LAW_BAD_DAY" };

/** "YYYY-MM-DD" ที่เป็นวันจริง (ไม่ใช้ Date ตัดสิน — กัน 2026-02-30 กลายเป็น 2 มี.ค.) */
export function isLawDay(day: unknown): day is string {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
  return d <= dim;
}
/** effectiveFrom (@db.Date = เที่ยงคืน UTC) → "YYYY-MM-DD" */
export const lawDayString = (v: string | Date): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** วันมีผลของงวด = วันตามปฏิทินไทย (Asia/Bangkok) ของวันจ่ายเงินเดือน (Q1)
 *  HR H3.3 r2 ▸ รับ Date เท่านั้น (HrPayrollRun.payDate) — สตริงไม่มีเขตเวลาจะถูกตีความตามเขตเวลาของเครื่อง ⇒ วันเพี้ยน (hunt N2) ⇒ LAW_BAD_DAY ◂ */
export function lawDayOf(payDate: Date): string {
  if (!(payDate instanceof Date) || Number.isNaN(payDate.getTime())) throw Object.assign(new Error("LAW_BAD_DAY: payDate must be a valid Date"), { code: "LAW_BAD_DAY" });
  return thaiDateKey(payDate);
}

// HR HF-SSO ▸ Q2: แถวประกันสังคมเลือกตาม "งวดค่าจ้าง" (T-HR-08) = วันแรกของงวด · ชนิดอื่นคงวันจ่าย (lawDayOf) · งวดผิดรูป = throw ◂
export function ssoLawDayOf(periodKey: string): string {
  if (typeof periodKey !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw Object.assign(new Error("LAW_BAD_DAY: periodKey must be YYYY-MM"), { code: "LAW_BAD_DAY" });
  return `${periodKey}-01`;
}
export type LawSetOpts = { ssoDay?: string }; // HR HF-SSO ◂

/** แถวที่มีผลของชนิดหนึ่ง ณ วันหนึ่ง */
export function pickLawRow<R extends LawRowIn>(rows: readonly R[], kind: HrLawKind | string, onDay: string): PickResult<R> {
  if (!isLawDay(onDay)) return { ok: false, code: "LAW_BAD_DAY" };
  let best: R[] = [];
  let bestDay = "";
  for (const r of rows) {
    if (r.kind !== kind || r.status !== "ACTIVE") continue;
    const day = lawDayString(r.effectiveFrom);
    if (day > onDay) continue;
    if (day > bestDay) {
      bestDay = day;
      best = [r];
    } else if (day === bestDay) best.push(r);
  }
  if (best.length === 0) return { ok: false, code: "LAW_MISSING" };
  if (best.length > 1) return { ok: false, code: "LAW_AMBIGUOUS" };
  return { ok: true, row: best[0]! };
}

export type LawSetResult<R> =
  | { ok: true; set: Record<(typeof LAW_KINDS_V2)[number], R> & LawSetV2; ids: string[] }
  | { ok: false; code: "LAW_MISSING" | "LAW_AMBIGUOUS" | "LAW_BAD_DAY"; kinds: string[] };

/** ชุดกฎหมายครบสำหรับเครื่องรุ่น 2 · ขาด/ซ้อน = ปฏิเสธพร้อมรายชื่อชนิด (ไม่มีค่าสำรอง) · ids เรียงตัวอักษร */
export function pickLawSet<R extends LawRowIn>(rows: readonly R[], onDay: string, kinds: readonly string[] = LAW_KINDS_V2, opts?: LawSetOpts): LawSetResult<R> { // HR HF-SSO ▸ + opts.ssoDay ◂
  if (!isLawDay(onDay)) return { ok: false, code: "LAW_BAD_DAY", kinds: [...kinds] };
  if (opts?.ssoDay !== undefined && !isLawDay(opts.ssoDay)) return { ok: false, code: "LAW_BAD_DAY", kinds: [...kinds] }; // HR HF-SSO ◂
  const set: Record<string, R> = {};
  const missing: string[] = [];
  const ambiguous: string[] = [];
  for (const k of kinds) {
    const p = pickLawRow(rows, k, k === "SSO" && opts?.ssoDay !== undefined ? opts.ssoDay : onDay); // HR HF-SSO ▸ SSO ตามงวด ◂
    if (p.ok) set[k] = p.row;
    else (p.code === "LAW_AMBIGUOUS" ? ambiguous : missing).push(k);
  }
  if (ambiguous.length) return { ok: false, code: "LAW_AMBIGUOUS", kinds: ambiguous };
  if (missing.length) return { ok: false, code: "LAW_MISSING", kinds: missing };
  return { ok: true, set: set as Record<(typeof LAW_KINDS_V2)[number], R> & LawSetV2, ids: Object.values(set).map((r) => r.id).sort() };
}

// ═════════════ อ่านจากฐาน ═════════════
/** db = prisma / tx ของ prisma / tenantDb(ctx) — ตารางกลางผ่าน tenantDb แบบไม่เติมตัวกรอง (อ่านอย่างเดียว · เขียนถูกกันที่ core/db.ts) */
export type LawDb = Pick<Prisma.TransactionClient, "hrLawTable"> | TenantDb;
// ไม่ import prisma ดิบ (ratchet F5.1) — ค่าปริยายเป็น tenantDb ของบริบทกลาง: HrLawTable เป็น global-scope จึงไม่ถูกเติม tenantId
const LAW_GLOBAL_CTX = { tenantId: "__shark_law_global__" };
const dbOf = (db?: LawDb) => (db ?? tenantDb(LAW_GLOBAL_CTX)) as unknown as Pick<Prisma.TransactionClient, "hrLawTable">;
const toUtcDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** ชุดกฎหมายที่มีผล ณ วัน (อ่านแถว ACTIVE ที่ effectiveFrom ≤ วัน) — ใช้ใน tx ของงวดได้ (H3.4) */
export async function loadLawSet(onDay: string, db?: LawDb, opts?: LawSetOpts) {
  if (!isLawDay(onDay) || (opts?.ssoDay !== undefined && !isLawDay(opts.ssoDay))) return { ok: false as const, code: "LAW_BAD_DAY" as const, kinds: [...LAW_KINDS_V2] as string[] }; // HR HF-SSO ▸ + ssoDay ◂
  const upTo = opts?.ssoDay !== undefined && opts.ssoDay > onDay ? opts.ssoDay : onDay; // HR HF-SSO ▸ อ่านถึงวันที่ช้ากว่า (งวดอาจหลังวันจ่าย) ◂
  const rows = await dbOf(db).hrLawTable.findMany({
    where: { status: "ACTIVE", kind: { in: [...LAW_KINDS_V2] }, effectiveFrom: { lte: toUtcDate(upTo) } }, // HR HF-SSO ◂
    orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
    select: { id: true, kind: true, effectiveFrom: true, status: true, json: true },
  });
  return pickLawSet(rows, onDay, LAW_KINDS_V2, opts); // HR HF-SSO ▸ ส่ง ssoDay ต่อ ◂
}

// ═════════════ หน้าแสดง (อ่านอย่างเดียว · ภาพ 08) ═════════════
export type LawViewRow = {
  key: string;
  effectiveFrom: string;
  status: HrLawStatus;
  inForce: boolean;
  values: Record<string, unknown>;
  approvedByName: string | null;
  approvedAt: string | null;
};
export type LawView = { onDay: string; pendingSignOff: boolean; groups: { kind: HrLawKind; rows: LawViewRow[] }[] };

/** ข้อมูลหน้าตารางกฎหมาย — ทุกแถวทุกสถานะ · แถวที่มีผล ณ วันนี้ติด inForce · pendingSignOff = ปสส./ภาษี/ลดหย่อน ยังไม่มีแถวที่มีผล */
export async function loadLawView(onDay: string, db?: LawDb): Promise<LawView> {
  if (!isLawDay(onDay)) throw Object.assign(new Error("LAW_BAD_DAY: onDay"), { code: "LAW_BAD_DAY" });
  const day = onDay;
  const rows = await dbOf(db).hrLawTable.findMany({
    orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
    select: { id: true, kind: true, effectiveFrom: true, status: true, json: true, approvedByName: true, approvedAt: true },
  });
  const inForce = new Set<string>();
  for (const k of LAW_VIEW_KINDS) {
    const p = pickLawRow(rows, k, day);
    if (p.ok) inForce.add(p.row.id);
  }
  const pendingSignOff = LAW_KINDS_V2.some((k) => !pickLawRow(rows, k, day).ok);
  const groups = LAW_VIEW_KINDS.map((kind) => ({
    kind,
    rows: rows
      .filter((r) => r.kind === kind)
      .map(
        (r, i): LawViewRow => ({
          key: `${kind}-${lawDayString(r.effectiveFrom)}-${i}`,
          effectiveFrom: lawDayString(r.effectiveFrom),
          status: r.status,
          inForce: inForce.has(r.id),
          values: (r.json && typeof r.json === "object" && !Array.isArray(r.json) ? r.json : {}) as Record<string, unknown>,
          approvedByName: r.approvedByName,
          approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
        }),
      ),
  }));
  return { onDay: day, pendingSignOff, groups };
}
// ◂ HR H3.3
// HR H2.9 ▸ ตัวอ่านแถวกฎหมาย OT (อ่านอย่างเดียว · มติผู้คุม 12 พ.ย.: law.ts ยังเป็นไฟล์เดียวที่อ่านตารางนี้) — แถว kind OT สถานะ ACTIVE ที่ effectiveFrom ≤ onDay
//   เรียงแน่นอน · ผู้เลือกแถว/ตรวจรูป = ot-rules.ts#otLawOf (ซ้อนวันเดียวกัน = LAW_AMBIGUOUS) · ผู้เรียก: hr/ot.ts (การจ่าย · ส่ง tx ของตัวเอง) · hr/payroll.ts (#18 เพดานอัตรา)
export type OtLawRowRead = { id: string; kind: string; effectiveFrom: Date; status: string; json: unknown };
export async function loadOtLawRows(onDay: string, db?: LawDb): Promise<OtLawRowRead[]> {
  if (!isLawDay(onDay)) return [];
  return dbOf(db).hrLawTable.findMany({
    where: { status: "ACTIVE", kind: "OT", effectiveFrom: { lte: toUtcDate(onDay) } },
    orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
    select: { id: true, kind: true, effectiveFrom: true, status: true, json: true },
    take: 200,
  });
}
// ◂ HR H2.9
