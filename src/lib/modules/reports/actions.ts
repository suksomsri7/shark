"use server";

import { requireTenant } from "@/lib/core/context";
import { assertCan, canReadInventory, type MembershipCtx } from "@/lib/core/rbac";
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

// HF-INV-0 (S2b): ชุดข้อมูลของโมดูลที่มีด่านอ่านของตัวเอง ต้องผ่านด่านนั้นด้วย (ไม่ใช่แค่สิทธิ์รันรายงาน)
//   INVENTORY มีต้นทุนสินค้า ⇒ ต้องดูคลังได้ (กฎเดียวกับหน้าคลัง) · ประเภทอื่นยังไม่มีด่านเพิ่ม (ดู ledger/wo-notes/HF-INV-0.md)
function assertDatasetReadable(m: MembershipCtx, dataset: string): void {
  if (reports.DATASETS[dataset]?.systemType === "INVENTORY" && !canReadInventory(m)) {
    throw new Error("บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลคลังสินค้า — ขอสิทธิ์ “ดูรายการสินค้าในคลัง” จากเจ้าของร้านก่อนรันรายงานนี้");
  }
}

export async function runReportAction(input: ReportInput): Promise<ReportResult> {
  const { tenantId, m } = await ctxWithCan("run");
  assertDatasetReadable(m, input.dataset);
  return reports.runReport({ tenantId }, input);
}

export async function exportReportCsvAction(input: ReportInput): Promise<string> {
  const { tenantId, m } = await ctxWithCan("run");
  assertDatasetReadable(m, input.dataset);
  // export ใช้เพดานสูง (EXPORT_CAP) แทน 500 ของจอ — CSV ได้ครบไม่ถูกตัดเงียบ (runReport ปัดเพดานซ้ำฝั่ง server)
  const take = input.take ?? reports.EXPORT_CAP;
  return reports.toCsv(await reports.runReport({ tenantId }, { ...input, take }));
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
