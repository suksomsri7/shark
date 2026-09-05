// ops/import.ts — WRITE นำเข้า CSV (WO D3): ตรวจไฟล์ก่อนนำเข้า · นำเข้าจริง · เทมเพลตเปล่า
//                 + `reports.email` (ส่งรายงานสรุปทางอีเมลตามคำขอ — จัดไว้ไฟล์นี้เพราะเป็น op เดี่ยว
//                 ที่ไม่เข้าพวกกับ reconcile-write.ts/files-write.ts และ D3 ระบุให้มี 3 ไฟล์เท่านั้น)
//
// 🔴 กติกาของชั้นนี้:
//   1) `previewImportCore`/`runImportCore` อยู่ที่ `import-core.ts` (แยกออกจาก `import-actions.ts`
//      ใน WO D3) — เป็นฟังก์ชันอาร์กิวเมนต์ธรรมดา (รับ tenantId/systemId ตรง ๆ ไม่ใช่ FormData) เรียกตรง
//      ได้เลย ไม่ต้องมี wrapper เพิ่ม · **ห้าม import จาก `../../import-actions` แทน** — ไฟล์นั้นมี
//      `"use server"` + import `./guard` (`loadAccountSystem` → session/env ตอนโหลดโมดูล) ซึ่งทำให้
//      `pnpm fitness` พังทันทีที่ไม่มี `.env` (บทเรียนเดียวกับ B2: `contacts-read.ts`)
//   2) `import.run` ใช้เพดานอัตราเดิม "นำเข้า CSV 20/ชม./ระบบ" (`accountRateGuard("import", systemId)`)
//      ซ้อนบนเพดาน write ของ REST เอง (60/นาที/คีย์) — ชนแล้วตอบ 429 rate_limited ตรง ๆ
//   3) `import.template` kind="read" (ไม่ต้อง Idempotency-Key) คืน CSV ผ่านกลไก `op.csv` ของ dispatch.ts
//      เมื่อ `Accept: text/csv` — ปกติ (ไม่ส่ง header นั้น) คืน JSON ที่มีสตริง CSV เป็น `data`
//   4) `reports.email`: ไม่มี RESEND (`emailEnabled` เท็จ) หรือยังไม่ตั้งผู้รับ → `{sent:0,skipped:1,reason}`
//      ไทยเสมอ **ห้าม 500** · `emailEnabled`/`sendEmail` ต้อง lazy-import เท่านั้น (โหลด `@/lib/env` ที่ตรวจ
//      schema ตอนโหลดโมดูล — import ไว้หัวไฟล์จะพัง fitness F10.1/การ import โมดูลนี้เฉย ๆ ในที่ไม่มี .env)
//   5) userId ของ service ทุกจุด = `null`

import { z } from "zod";
import { previewImportCore, runImportCore } from "../../import-core";
import { buildTemplateCsv, type ColumnMapping, type ImportKind } from "../../import-shared";
import { accountRateGuard } from "../../rate-limit";
import { getPolicy, fiscalYearOf } from "../../policy";
import { getSettings } from "../../service";
import { dashboardSnapshot } from "../../dashboard";
import { composeAccountReport } from "../../email-report";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";

const importKindField = z.enum(["documents_revenue", "documents_expense", "contacts", "products", "chart_of_accounts"]);
const mappingField = z.record(z.string(), z.number().int()).optional().describe("Column index per field key. Omit to auto-match from the header row.");

function rateLimited(reason: string): never {
  throw new ApiError(429, "rate_limited", reason, "Rate limit exceeded.");
}

// ── import.preview ───────────────────────────────────────────────────────

const importPreviewInput = z
  .object({
    kind: importKindField,
    text: z.string().min(1).max(6_000_000).describe("Raw CSV content, UTF-8 (a leading BOM is fine)."),
    mapping: mappingField,
  })
  .strict();

const importPreview = defineOp({
  id: "import.preview",
  method: "POST",
  path: "/import/preview",
  kind: "write",
  action: "account.import",
  summary: "Check a CSV file before importing it: column mapping, per-row validation and a count of rows that would be created.",
  label: "ตรวจไฟล์ก่อนนำเข้า",
  input: importPreviewInput,
  test: "D3-R2.1",
  async handler({ actor, input }) {
    const res = await previewImportCore(actor.tenantId, actor.systemId, input.kind, input.text, input.mapping as ColumnMapping | undefined);
    if (!res.ok) throw new ApiError(422, "unprocessable", res.reason, "The file could not be read.");
    return {
      mapping: res.mapping,
      columns: res.headers,
      rows: res.previewRows.map((r) => ({ row: r.row, status: r.status, summary: r.summary, errors: r.reasons })),
      valid: res.counts.ok,
      invalid: res.counts.err,
      warnings: res.previewRows.filter((r) => r.status === "warn").flatMap((r) => r.reasons),
    };
  },
});

// ── import.run ───────────────────────────────────────────────────────────

const importRunInput = z
  .object({
    kind: importKindField,
    text: z.string().min(1).max(6_000_000),
    mapping: z.record(z.string(), z.number().int()),
    skipErrorRows: z.boolean().optional().describe("true creates the valid rows of a file that also has bad rows, instead of refusing the whole file."),
  })
  .strict();

const importRun = defineOp({
  id: "import.run",
  method: "POST",
  path: "/import/run",
  kind: "write",
  action: "account.import",
  summary: "Import a CSV file for real, using a mapping already checked with import.preview. Rate-limited to 20 imports per hour per accounting book.",
  label: "นำเข้าจริง",
  input: importRunInput,
  test: "D3-R2.2",
  async handler({ actor, input }) {
    const rate = await accountRateGuard("import", actor.systemId);
    if (!rate.ok) rateLimited(rate.reason);
    const res = await runImportCore(
      actor.tenantId,
      actor.systemId,
      null,
      input.kind,
      input.text,
      input.mapping as ColumnMapping,
      input.skipErrorRows ?? false,
    );
    if (!res.ok) throw new ApiError(422, "unprocessable", res.reason, "The import could not be completed.");
    return { created: res.created, skipped: res.skipped, errors: res.errors };
  },
});

// ── import.template ──────────────────────────────────────────────────────

const importTemplateInput = z.object({ kind: importKindField }).strict();

const importTemplate = defineOp({
  id: "import.template",
  method: "GET",
  path: "/import/template",
  kind: "read",
  action: "account.import",
  summary: "Download an empty CSV template with example rows for one import kind. Supports CSV.",
  label: "เทมเพลตนำเข้า CSV",
  input: importTemplateInput,
  test: "D3-R2.4",
  async handler({ input }) {
    return buildTemplateCsv((input as { kind: ImportKind }).kind);
  },
  csv(ctx) {
    return buildTemplateCsv((ctx.input as { kind: ImportKind }).kind);
  },
});

// ── reports.email ────────────────────────────────────────────────────────

const reportsEmailInput = z.object({ kind: z.enum(["daily", "weekly"]) }).strict();

const reportsEmail = defineOp({
  id: "reports.email",
  method: "POST",
  path: "/reports/email",
  kind: "write",
  action: "account.report.view",
  rate: "report",
  summary:
    "Send the daily or weekly summary report by email right now, to the recipients configured in accounting policy. Skipped (not an error) when no recipients are configured yet or outbound email is not set up on this server.",
  label: "ส่งรายงานสรุปทางอีเมลทันที",
  input: reportsEmailInput,
  test: "D3-R4.1",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const rate = await accountRateGuard("emailReport", actor.systemId);
    if (!rate.ok) rateLimited(rate.reason);

    const policy = await getPolicy(ctx);
    if (policy.emailReportRecipients.length === 0) {
      return { sent: 0, skipped: 1, reason: "ยังไม่ได้ตั้งค่าอีเมลผู้รับรายงาน — เพิ่มได้ที่ ตั้งค่า › นโยบายบัญชี" };
    }

    // lazy import — `@/lib/env` ตรวจ schema ตอนโหลดโมดูล (ต้องมี SESSION_SECRET/RESEND_*) · import ไว้หัวไฟล์
    // จะทำให้การ import ops/import.ts เฉย ๆ พังในสภาพแวดล้อมที่ไม่มี .env (บทเรียนเดียวกับ service.ts)
    const { emailEnabled } = await import("@/lib/env");
    if (!emailEnabled) {
      return { sent: 0, skipped: 1, reason: "เซิร์ฟเวอร์นี้ยังไม่ได้เปิดใช้งานการส่งอีเมล (RESEND) — ติดต่อผู้ดูแลระบบ" };
    }

    const now = new Date();
    const [settings, snap] = await Promise.all([getSettings(actor.tenantId, actor.systemId), dashboardSnapshot(ctx, { now })]);
    const { subject, text } = composeAccountReport({
      orgName: settings.orgName || "กิจการของคุณ",
      kind: input.kind === "daily" ? "DAILY" : "WEEKLY",
      now,
      kpi: snap.kpi,
      pending: {
        quotationAwaitingAccept: snap.pending.quotationAwaitingAccept,
        poAwaitingApproval: snap.pending.poAwaitingApproval,
        needsReview: snap.pending.needsReview,
        total: snap.pending.total,
      },
      fiscalYearLabel: fiscalYearOf(now, policy.fiscalYearStartMonth).label,
    });
    const { sendEmail } = await import("@/lib/core/email");
    for (const to of policy.emailReportRecipients) await sendEmail(to, subject, text);
    return { sent: policy.emailReportRecipients.length, skipped: 0 };
  },
});

export const IMPORT_OPS: ApiOp[] = [importPreview, importRun, importTemplate, reportsEmail];
