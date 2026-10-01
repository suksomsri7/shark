"use server";

import { requireTenant } from "@/lib/core/context";
import { assertCan, canReadInventory, evaluate, type MembershipCtx } from "@/lib/core/rbac";
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
  customers: { rule: "member", key: "member.customer.read" },
  // กติกาหน้าคลัง (rbac.canReadInventory) — มีต้นทุนสินค้า
  inventory: { rule: "inventory", key: "inventory.item.read" },
};

// เลียนกติกาของหน้า POS/สมาชิกด้วย helper rbac กลาง (ไม่ import ข้ามโมดูล — ไฟล์ต้นทางอยู่คนละ branch/โมดูล)
function allBranches(m: MembershipCtx): boolean {
  return m.role === "OWNER" || m.unitAccess.includes("*");
}
function canReadMemberData(m: MembershipCtx, key: string): boolean {
  if (evaluate(m, { module: "member", action: key })) return true;
  if (m.role !== "STAFF") return false;
  return Object.entries(m.permissions ?? {}).some(([k, v]) => v === true && k.startsWith("member."));
}

/** ตรวจสิทธิ์อ่านชุดข้อมูล → ขอบเขตสาขาที่ต้องกรอง (ว่าง = ทุกสาขา) · ไม่ผ่าน = โยนไทย ก่อนแตะฐานข้อมูล */
function readScope(m: MembershipCtx, dataset: unknown): { unitIds?: string[] } {
  const name = typeof dataset === "string" ? dataset : "";
  if (!name || !Object.hasOwn(DATASET_READ, name) || !Object.hasOwn(reports.DATASETS, name)) {
    throw new Error(`ไม่รู้จักชุดข้อมูล "${String(dataset).slice(0, 40)}"`);
  }
  const rule = DATASET_READ[name];
  if (rule.rule === "inventory") {
    if (!canReadInventory(m)) throw new Error("บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลคลังสินค้า — ขอสิทธิ์ “ดูรายการสินค้าในคลัง” จากเจ้าของร้านก่อนรันรายงานนี้");
    return {};
  }
  if (rule.rule === "member") {
    if (!canReadMemberData(m, rule.key)) throw new Error("บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลสมาชิก — ขอสิทธิ์ “ดูข้อมูลสมาชิก” จากเจ้าของร้านก่อนรันรายงานนี้");
    return {};
  }
  const refuse = "บัญชีนี้ยังไม่มีสิทธิ์ดูยอดขายหน้าร้าน — ขอสิทธิ์ขายหน้าร้าน (POS) ของสาขาที่ต้องการจากเจ้าของร้านก่อนรันรายงานนี้";
  if (!evaluate(m, { module: "pos", action: rule.key })) throw new Error(refuse);
  if (allBranches(m)) return {};
  const unitIds = m.unitAccess.filter((u) => evaluate(m, { module: "pos", action: rule.key, unitId: u }));
  if (unitIds.length === 0) throw new Error(refuse);
  return { unitIds };
}

export async function runReportAction(input: ReportInput): Promise<ReportResult> {
  const { tenantId, m } = await ctxWithCan("run");
  const scope = readScope(m, input?.dataset);
  return reports.runReport({ tenantId, ...scope }, input);
}

export async function exportReportCsvAction(input: ReportInput): Promise<string> {
  const { tenantId, m } = await ctxWithCan("run");
  const scope = readScope(m, input?.dataset);
  // export ใช้เพดานสูง (EXPORT_CAP) แทน 500 ของจอ — CSV ได้ครบไม่ถูกตัดเงียบ (runReport ปัดเพดานซ้ำฝั่ง server)
  const take = input.take ?? reports.EXPORT_CAP;
  return reports.toCsv(await reports.runReport({ tenantId, ...scope }, { ...input, take }));
}

export async function listReportsAction(): Promise<
  { id: string; name: string; config: ReportInput; createdAt: string }[]
> {
  const ctx = await ctxWithCan("run");
  const rows = await reports.listReports(ctx);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function saveReportAction(input: {
  name: string;
  config: ReportInput;
}): Promise<{ id: string }> {
  const ctx = await ctxWithCan("save");
  const name = input.name.trim();
  if (!name) throw new Error("กรุณาตั้งชื่อรายงาน");
  return reports.saveReport(ctx, { name, config: input.config });
}

export async function deleteReportAction(id: string): Promise<{ ok: true }> {
  const ctx = await ctxWithCan("save");
  await reports.deleteReport(ctx, id);
  return { ok: true };
}
