"use server";

import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import * as reports from "./service";
import type { ReportInput, ReportResult } from "./service";

// Report builder v1 (WO-0055) — server actions ผูก session ctx เอง ไม่รับ tenantId จากผู้เรียก
// สิทธิ์: reports.report.run (ดู/รันรายงาน) · reports.report.save (บันทึก/ลบนิยามรายงาน)

async function ctxWithCan(action: "run" | "save"): Promise<{ tenantId: string }> {
  const auth = await requireTenant();
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  assertCan(m, { module: "reports", action: `reports.report.${action}` });
  return { tenantId: auth.active.tenantId };
}

export async function runReportAction(input: ReportInput): Promise<ReportResult> {
  const ctx = await ctxWithCan("run");
  return reports.runReport(ctx, input);
}

export async function exportReportCsvAction(input: ReportInput): Promise<string> {
  const ctx = await ctxWithCan("run");
  // export ใช้เพดานสูง (EXPORT_CAP) แทน 500 ของจอ — CSV ได้ครบไม่ถูกตัดเงียบ
  const take = input.take ?? reports.EXPORT_CAP;
  return reports.toCsv(await reports.runReport(ctx, { ...input, take }));
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
