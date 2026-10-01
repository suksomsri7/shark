"use server";

import { requireTenant } from "@/lib/core/context";
import { assertCan, canReadInventory, evaluate, ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import * as reports from "./service";
import type { ReportInput, ReportResult } from "./service";

// Report builder v1 (WO-0055) — server actions ผูก session ctx เอง ไม่รับ tenantId จากผู้เรียก
// สิทธิ์: reports.report.run (ดู/รันรายงาน) · reports.report.save (บันทึก/ลบนิยามรายงาน)

async function ctxWithCan(action: "run" | "save"): Promise<{ tenantId: string; m: MembershipCtx }> {
  const auth = await requireTenant();
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  assertCan(m, { module: "reports", action: `reports.report.${action}` });
  return { tenantId: auth.active.tenantId, m };
}

// 🔴 HF-INV-1 R3.7 (ต่อจาก HF-INV-0 S2b): สิทธิ์รันรายงานอย่างเดียวไม่พอ — ต้อง "อ่านข้อมูลของโมดูลเจ้าของชุดข้อมูล" ได้ด้วย
//    (เดิม STAFF ที่มีแค่ reports.report.run ส่งออกชื่อ+เบอร์สมาชิกทั้งร้าน และยอดขายทุกสาขาได้)
//    ตารางเดียว: ชุดข้อมูล → คีย์อ่านของโมดูลเจ้าของ · ชุดที่ไม่อยู่ในตาราง = ปฏิเสธ (เพิ่มชุดใหม่ต้องประกาศที่นี่)
//    ใช้กับจอ · CSV · การจัดกลุ่ม เหมือนกันหมด (ทุกทางผ่าน readScope ก่อน runReport)
const DATASET_READ: Record<string, { rule: "pos-sales" | "member" | "inventory"; key: string }> = {
  // กติกาหน้าประวัติบิล POS (hotfix/pos-page-authz · pos/access.ts posSalesScope): pos.sale.create + เห็นเฉพาะสาขาที่เข้าถึง
  sales: { rule: "pos-sales", key: "pos.sale.create" },
  // กติกาหน้าสมาชิก (member/access.ts canReadMember): OWNER/MANAGER · STAFF ที่มีคีย์ member.* ตัวใดก็ได้
  //   R3b: + ขอบเขตสาขาของหน้ารวมสมาชิก + เบอร์ปิดบัง เว้นแต่ผ่านด่าน exportMembers (คีย์ด้านล่าง)
  customers: { rule: "member", key: "member.customer.export" },
  // กติกาหน้าคลัง (rbac.canReadInventory) — มีต้นทุนสินค้า
  inventory: { rule: "inventory", key: "inventory.item.read" },
};

// เลียนกติกาของหน้า POS/สมาชิกด้วย helper rbac กลาง (ไม่ import ข้ามโมดูล — ไฟล์ต้นทางอยู่คนละ branch/โมดูล)
function allBranches(m: MembershipCtx): boolean {
  return m.role === "OWNER" || m.unitAccess.includes("*");
}

// ── HF-INV-1 R3b (B1): กติกาของโมดูลสมาชิก ก๊อปตรงตัว (fitness F2.1 ห้าม reports→member · ไม่แก้ fitness.mts ที่ CRM ถือ) ──
//    oracle qc-hf-reports-authz RP-5 เทียบผลรายงานกับ listMembers/exportMembers ของ actor เดียวกันทุกบทบาท ⇒ ลอยห่างเมื่อไหร่แดง
//    (คนจริงที่ล็อกอินเท่านั้น — รายงานไม่มีทางเข้าด้วยคีย์ API/ลูกค้า)
const memberPerms = (m: MembershipCtx) => (m.permissions ?? {}) as Record<string, unknown>;
/** = member/access.ts `canReadMember` (OWNER/MANAGER · STAFF มีคีย์ `member.*` ตัวใดก็ได้ รวม wildcard) */
function canReadMemberData(m: MembershipCtx): boolean {
  if (m.role === "OWNER" || m.role === "MANAGER") return true;
  const p = memberPerms(m);
  if (p["member.*"] === true) return true;
  return Object.entries(p).some(([k, v]) => v === true && k.startsWith("member.") && k !== "member.*");
}
/** = member/access.ts `MANAGER_EXCLUDED_KEYS` (4 คีย์ที่ MANAGER ไม่ได้โดยปริยาย) */
const MEMBER_MANAGER_EXCLUDED = new Set(["member.settings.manage", "member.privacy.manage", "member.api.manage", "member.giftcard.manage"]);
/** = member/access.ts `hasMemberPerm` — ด่านที่ `exportMembers` ใช้กับคีย์ member.customer.export */
function hasMemberPermLike(m: MembershipCtx, key: string): boolean {
  if (m.role === "OWNER") return true;
  if (m.role === "MANAGER" && !MEMBER_MANAGER_EXCLUDED.has(key)) return true;
  const p = memberPerms(m);
  return p[key] === true || p["member.*"] === true;
}
/** = member/access.ts `isUnitScoped` (OWNER / unitAccess ว่าง / "*" = ทั้งร้าน) */
function memberUnitScoped(m: MembershipCtx): boolean {
  if (m.role === "OWNER") return false;
  return m.unitAccess.length > 0 && !m.unitAccess.includes("*");
}

/**
 * ตรวจสิทธิ์อ่านชุดข้อมูล → ขอบเขตสาขาที่ต้องกรอง (ว่าง = ทุกสาขา) + คอลัมน์ที่ต้องปิดบัง · ไม่ผ่าน = โยนไทย ก่อนแตะฐานข้อมูล
 */
function readScope(m: MembershipCtx, dataset: unknown): { unitIds?: string[]; masked?: string[] } {
  const name = typeof dataset === "string" ? dataset : "";
  if (!name || !Object.hasOwn(DATASET_READ, name) || !Object.hasOwn(reports.DATASETS, name)) {
    throw new reports.ReportRefusal(`ไม่รู้จักชุดข้อมูล "${String(dataset).slice(0, 40)}"`);
  }
  const rule = DATASET_READ[name];
  if (rule.rule === "inventory") {
    if (!canReadInventory(m)) throw new reports.ReportRefusal("บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลคลังสินค้า — ขอสิทธิ์ “ดูรายการสินค้าในคลัง” จากเจ้าของร้านก่อนรันรายงานนี้");
    return {};
  }
  if (rule.rule === "member") {
    if (!canReadMemberData(m)) throw new reports.ReportRefusal("บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลสมาชิก — ขอสิทธิ์ “ดูข้อมูลสมาชิก” จากเจ้าของร้านก่อนรันรายงานนี้");
    // R3b: แถว = แถวของหน้ารวมสมาชิก (ขอบเขตสาขา) · คอลัมน์ที่หน้ารวมปิดบัง (เบอร์) เปิดเต็มเฉพาะคนที่ผ่านด่านส่งออกรายชื่อ
    const masked = hasMemberPermLike(m, rule.key) ? [] : Object.keys(reports.DATASETS[name].masks ?? {});
    return { ...(memberUnitScoped(m) ? { unitIds: [...m.unitAccess] } : {}), ...(masked.length ? { masked } : {}) };
  }
  const refuse = "บัญชีนี้ยังไม่มีสิทธิ์ดูยอดขายหน้าร้าน — ขอสิทธิ์ขายหน้าร้าน (POS) ของสาขาที่ต้องการจากเจ้าของร้านก่อนรันรายงานนี้";
  if (!evaluate(m, { module: "pos", action: rule.key })) throw new reports.ReportRefusal(refuse);
  if (allBranches(m)) return {};
  const unitIds = m.unitAccess.filter((u) => evaluate(m, { module: "pos", action: rule.key, unitId: u }));
  if (unitIds.length === 0) throw new reports.ReportRefusal(refuse);
  return { unitIds };
}

// 🔴 HF-INV-1 R3c (C4): Next แทนข้อความของ error ที่ throw จาก server action ด้วยข้อความกลางใน production
//    ⇒ การปฏิเสธที่ "คาดไว้" (ไม่มีสิทธิ์ · ตรวจค่าไม่ผ่าน · คอลัมน์ปิดบัง) คืนเป็นข้อมูล `{ error }` ให้หน้าจอแสดงไทยได้จริง
//    error อื่น (หา session ไม่ได้ · ฐานข้อมูลล่ม · redirect ของ requireTenant) ยัง throw ตามเดิม
function refusalOf(e: unknown): string | null {
  return e instanceof reports.ReportRefusal || e instanceof ForbiddenError ? e.message : null;
}

export async function runReportAction(input: ReportInput): Promise<ReportResult> {
  try {
    const { tenantId, m } = await ctxWithCan("run");
    const scope = readScope(m, input?.dataset);
    return await reports.runReport({ tenantId, ...scope }, input);
  } catch (e) {
    const error = refusalOf(e);
    if (error === null) throw e;
    return { columns: [], rows: [], error };
  }
}

export async function exportReportCsvAction(
  input: ReportInput,
): Promise<{ ok: true; csv: string } | { ok: false; error: string }> {
  try {
    const { tenantId, m } = await ctxWithCan("run");
    const scope = readScope(m, input?.dataset);
    // export ใช้เพดานสูง (EXPORT_CAP) แทน 500 ของจอ — CSV ได้ครบไม่ถูกตัดเงียบ (runReport ปัดเพดานซ้ำฝั่ง server)
    const take = input.take ?? reports.EXPORT_CAP;
    return { ok: true, csv: reports.toCsv(await reports.runReport({ tenantId, ...scope }, { ...input, take })) };
  } catch (e) {
    const error = refusalOf(e);
    if (error === null) throw e;
    return { ok: false, error };
  }
}

// 🔴 HF-INV-1 R3c (C3): รายงานที่บันทึกไว้แสดงเฉพาะที่ actor "รันได้ตอนนี้" — อ่านชุดข้อมูลได้ (readScope) และไม่ใช้คอลัมน์
//    ที่ถูกปิดบังสำหรับเขา (ตัวกรอง · จัดกลุ่ม · ตัวชี้วัด) — ตัวตรวจเดียวกับตอนรันจริง (checkReport)
//    เดิมคืนนิยามทุกใบให้ทุกคนที่มี reports.report.run ⇒ STAFF ที่ไม่มีคีย์สมาชิกอ่านค่าตัวกรองเบอร์ของเจ้าของได้
function canRunNow(m: MembershipCtx, config: ReportInput): boolean {
  try {
    reports.checkReport(readScope(m, config?.dataset), config);
    return true;
  } catch {
    return false;
  }
}

export async function listReportsAction(): Promise<
  { id: string; name: string; config: ReportInput; createdAt: string }[]
> {
  const ctx = await ctxWithCan("run");
  const rows = await reports.listReports(ctx);
  return rows.filter((r) => canRunNow(ctx.m, r.config)).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function saveReportAction(input: {
  name: string;
  config: ReportInput;
}): Promise<{ id?: string; error?: string }> {
  try {
    const ctx = await ctxWithCan("save");
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    if (!name) return { error: "กรุณาตั้งชื่อรายงาน" };
    return await reports.saveReport(ctx, { name, config: input.config });
  } catch (e) {
    const error = refusalOf(e);
    if (error === null) throw e;
    return { error };
  }
}

// ลบ: สิทธิ์เดิม (reports.report.save) · ผลไม่มีนิยามรายงาน
export async function deleteReportAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await ctxWithCan("save");
    await reports.deleteReport(ctx, id);
    return { ok: true };
  } catch (e) {
    const error = refusalOf(e);
    if (error === null) throw e;
    return { ok: false, error };
  }
}
