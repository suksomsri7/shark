// ACC T5.11 (A7) — หลายสาขา: สถานประกอบการ · เลขที่เอกสารแยกสาขา · รายงานภาษีแยกสถานประกอบการ · design note ledger/wo-notes/T5.11.md
//
// skill common-vat-invoice: §14 ใบกำกับระบุ "สำนักงานใหญ่" / "สาขาที่ …" (ฉ.199) [V] · §18 รายงาน ม.87 ทำ **รายสถานประกอบการ** แม้ยื่น ภ.พ.30 รวม [V] ·
//   §19 หลายสาขาแยกยื่น เว้นได้รับอนุมัติยื่นรวม (ม.83 ว.สี่) [V] · โอนสต็อกระหว่างสาขา [U] (§21 — ไม่ทำในใบงานนี้)
// skill เงียบ → เลือก: เลขที่เอกสารของสาขาที่ไม่ใช่สาขาตั้งต้นของสมุดใช้ลำดับแยก (AccountDocSequence.periodKey "<งวด>@<สาขา>") และขึ้นต้นด้วยรหัสสาขาเมื่อรูปแบบไม่มี {สาขา}
//   แถวที่ไม่มีเอกสารต้นทาง (บิล POS · JV มือ) นับเป็นสาขาตั้งต้นของสมุด (ค่าตั้ง branchCode ของกิจการ)
import { tenantDb } from "@/lib/core/db";
import { resolveBookSettings, setSettings, type SettingsActor } from "@/lib/core/settings";
import { ACCOUNT_SETTING_KEYS, BRANCH_ROW_SCHEMA, VAT_FILING_MODES, type BranchRow, type VatFilingMode } from "@/lib/core/settings/defs/account";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { groupByRate } from "./sales-tax-shared";
import { buildChecks, salesTaxReport } from "./sales-tax-report";
import { purchaseTaxReport } from "./purchase-tax-report";

export type BranchCtx = { tenantId: string; systemId: string };
export const HQ = "00000";
export type BranchView = { code: string; name: string; address: string | null; isHome: boolean };
export type BranchSetup = { home: BranchView; branches: BranchView[]; all: BranchView[]; vatFilingMode: VatFilingMode; warnings: LegalWarning[] };

export function normBranch(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  return /^\d{5}$/.test(t) ? t : null;
}

/** สาขาตั้งต้นของสมุด (ค่าตั้งกิจการ) + รายชื่อสาขาที่ร้านตั้ง + วิธียื่น */
export async function loadBranches(ctx: BranchCtx): Promise<BranchSetup> {
  const [s, r] = await Promise.all([
    tenantDb(ctx).accountSettings.findFirst({ where: { systemId: ctx.systemId }, select: { branchCode: true, branchName: true, address: true } }),
    resolveBookSettings({ tenantId: ctx.tenantId }, [ACCOUNT_SETTING_KEYS.branches, ACCOUNT_SETTING_KEYS.vatFilingMode], ctx.systemId),
  ]);
  const homeCode = normBranch(s?.branchCode) ?? HQ;
  const home: BranchView = { code: homeCode, name: s?.branchName?.trim() || (homeCode === HQ ? "สำนักงานใหญ่" : `สาขา ${homeCode}`), address: s?.address ?? null, isHome: true };
  const raw = r[ACCOUNT_SETTING_KEYS.branches]?.value;
  const rows: BranchRow[] = Array.isArray(raw) ? (raw.map((x) => BRANCH_ROW_SCHEMA.safeParse(x)).filter((p) => p.success).map((p) => p.data!) as BranchRow[]) : [];
  const branches = rows.filter((b) => b.code !== homeCode).map((b) => ({ code: b.code, name: b.name, address: b.address ?? null, isHome: false }));
  const modeRaw = r[ACCOUNT_SETTING_KEYS.vatFilingMode]?.value;
  const vatFilingMode: VatFilingMode = (VAT_FILING_MODES as readonly string[]).includes(String(modeRaw)) ? (modeRaw as VatFilingMode) : "SEPARATE";
  const warnings = vatFilingMode === "COMBINED" && branches.length ? [legalWarning("BRANCH_COMBINED_FILING")] : [];
  return { home, branches, all: [home, ...branches], vatFilingMode, warnings };
}

export function branchLabelTh(b: { code: string; name: string } | null | undefined): string {
  if (!b) return "สำนักงานใหญ่";
  return b.code === HQ ? "สำนักงานใหญ่" : `สาขาที่ ${b.code}${b.name ? ` (${b.name})` : ""}`;
}

/** บันทึกรายชื่อสาขา + วิธียื่น (ทั้งชุด) · ยื่นรวม = คำเตือนที่ต้องยืนยัน (ไม่บล็อก — ack ส่งมาแล้วบันทึก) */
export async function saveBranches(
  actor: SettingsActor,
  ctx: BranchCtx,
  patch: { branches?: { code: string; name: string; address?: string | null }[]; vatFilingMode?: VatFilingMode },
  opts: { ack?: readonly string[]; reason?: string } = {},
): Promise<{ ok: true; warnings: LegalWarning[] } | { ok: false; reason: string; warnings?: LegalWarning[] }> {
  const changes: { key: string; scope: string; scopeId: string; value: unknown; reason?: string }[] = [];
  if (patch.branches !== undefined) {
    const parsed = patch.branches.map((b) => BRANCH_ROW_SCHEMA.safeParse({ code: String(b.code ?? "").trim(), name: String(b.name ?? "").trim(), address: b.address ?? null }));
    const bad = parsed.findIndex((p) => !p.success);
    if (bad >= 0) return { ok: false, reason: `สาขาแถวที่ ${bad + 1}: ${parsed[bad]!.error!.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง"}` };
    const codes = parsed.map((p) => p.data!.code);
    if (new Set(codes).size !== codes.length) return { ok: false, reason: "รหัสสาขาซ้ำกัน" };
    changes.push({ key: ACCOUNT_SETTING_KEYS.branches, scope: "ACCOUNT_BOOK", scopeId: ctx.systemId, value: parsed.map((p) => p.data!), ...(opts.reason ? { reason: opts.reason } : {}) });
  }
  const warnings: LegalWarning[] = [];
  if (patch.vatFilingMode !== undefined) {
    if (!(VAT_FILING_MODES as readonly string[]).includes(patch.vatFilingMode)) return { ok: false, reason: "วิธียื่นไม่ถูกต้อง" };
    if (patch.vatFilingMode === "COMBINED") {
      const w = legalWarning("BRANCH_COMBINED_FILING");
      // ยืนยันครั้งเดียวตอนเปลี่ยนเป็นยื่นรวม — ค่าที่เป็นยื่นรวมอยู่แล้ว (บันทึกรายชื่อสาขาซ้ำ) ไม่ต้องยืนยันอีก
      const already = (await loadBranches(ctx)).vatFilingMode === "COMBINED";
      if (!already && !(opts.ack ?? []).includes(w.code)) return { ok: false, reason: "LEGAL_ACK_REQUIRED", warnings: [w] };
      warnings.push(w);
    }
    changes.push({ key: ACCOUNT_SETTING_KEYS.vatFilingMode, scope: "ACCOUNT_BOOK", scopeId: ctx.systemId, value: patch.vatFilingMode, ...(opts.reason ? { reason: opts.reason } : {}) });
  }
  if (!changes.length) return { ok: true, warnings };
  const res = await setSettings(actor, { tenantId: ctx.tenantId }, changes);
  if (!res.ok) return { ok: false, reason: "reason" in res ? String((res as { reason?: unknown }).reason ?? "บันทึกไม่สำเร็จ") : "บันทึกไม่สำเร็จ" };
  return { ok: true, warnings };
}

/** สาขาของเอกสาร: ตรวจรหัส · ไม่อยู่ในรายชื่อ = คำเตือน (ไม่บล็อก) · สาขาตั้งต้น = null */
export async function resolveDocBranch(ctx: BranchCtx, code: unknown): Promise<{ branchCode: string | null; warnings: LegalWarning[] }> {
  const c = normBranch(code);
  if (!c) return { branchCode: null, warnings: [] };
  const setup = await loadBranches(ctx);
  if (c === setup.home.code) return { branchCode: null, warnings: [] };
  const known = setup.branches.some((b) => b.code === c);
  return { branchCode: c, warnings: known ? [] : [legalWarning("BRANCH_UNKNOWN_CODE", { branch: c })] };
}

/** ตั้งสาขาของเอกสารร่าง (เอกสารที่ออกเลขแล้วเปลี่ยนสาขาไม่ได้ — เลขที่ผูกสาขาแล้ว) */
export async function setDocumentBranch(ctx: BranchCtx, documentId: string, code: string | null): Promise<{ ok: true; branchCode: string | null; warnings: LegalWarning[] } | { ok: false; reason: string }> {
  const d = await tenantDb(ctx).accountDocument.findFirst({ where: { id: documentId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, status: true, docNo: true } });
  if (!d) return { ok: false, reason: "ไม่พบเอกสารนี้" };
  if (d.status !== "DRAFT" || d.docNo) return { ok: false, reason: "เอกสารที่ออกเลขที่แล้วเปลี่ยนสาขาไม่ได้ — ยกเลิกแล้วออกใหม่ที่สาขาที่ถูกต้อง" };
  if (code !== null && !normBranch(code)) return { ok: false, reason: "รหัสสาขาต้องเป็นตัวเลข 5 หลัก" };
  const r = await resolveDocBranch(ctx, code);
  await tenantDb(ctx).accountDocument.updateMany({ where: { id: d.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "DRAFT" }, data: { branchCode: r.branchCode } });
  return { ok: true, branchCode: r.branchCode, warnings: r.warnings };
}

async function branchOfDocs(ctx: BranchCtx, ids: string[]): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map();
  const rows = await tenantDb(ctx).accountDocument.findMany({ where: { id: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, branchCode: true } });
  return new Map(rows.map((r) => [r.id, r.branchCode]));
}

/**
 * รายงานภาษีขายของสถานประกอบการหนึ่ง (จากรายงานทั้งสมุด กรองแถวตามสาขาของเอกสาร · แถวไม่มีเอกสาร = สาขาตั้งต้น)
 *   หัวรายงาน = สาขานั้น · ข้อตรวจ "ตรงกับบัญชีภาษีขาย" ใช้ไม่ได้ต่อสาขา (บัญชีรวมทั้งสมุด) ⇒ เทียบกับผลรวมของแถวเอง + คำเตือน BRANCH_REPORT_PER_PLACE
 */
export async function salesTaxReportForBranch(ctx: BranchCtx, periodKey: string, branch: string) {
  const setup = await loadBranches(ctx);
  const b = setup.all.find((x) => x.code === branch) ?? { code: branch, name: "", address: null, isHome: false };
  const full = await salesTaxReport(ctx, periodKey);
  const docIds = [...new Set(full.rows.flatMap((r) => [r.docId, ...((r as { bills?: { docId?: string }[] }).bills ?? []).map((x) => x.docId)]).filter(Boolean))] as string[];
  const map = await branchOfDocs(ctx, docIds);
  const rowBranch = (docId?: string) => (docId && map.get(docId)) || setup.home.code;
  const rows = full.rows.filter((r) => rowBranch(r.docId) === b.code);
  const { groups } = groupByRate(rows, full.stdRateBp);
  const total = { base: groups.reduce((n, g) => n + g.base, 0), vat: groups.reduce((n, g) => n + g.vat, 0) };
  return {
    ...full,
    header: { ...full.header, branchCode: b.code, branchLabel: branchLabelTh(b) },
    rows,
    groups,
    total,
    glVat: total.vat,
    checks: buildChecks(rows, total.vat, total.vat, null, full.outputLedger).filter((c) => c.key !== "GL_2200" && c.key !== "PP30"),
    branch: b,
    branchWarnings: [legalWarning("BRANCH_REPORT_PER_PLACE", { branch: branchLabelTh(b) }), ...setup.warnings],
  };
}

/** รายงานภาษีซื้อของสถานประกอบการหนึ่ง (กรองแถวตามสาขาของเอกสารรับ) */
export async function purchaseTaxReportForBranch(ctx: BranchCtx, periodKey: string, branch: string) {
  const setup = await loadBranches(ctx);
  const b = setup.all.find((x) => x.code === branch) ?? { code: branch, name: "", address: null, isHome: false };
  const full = await purchaseTaxReport(ctx, periodKey);
  const docIds = [...new Set(full.rows.map((r) => r.docId).filter(Boolean))] as string[];
  const map = await branchOfDocs(ctx, docIds);
  const rows = full.rows.filter((r) => ((r.docId && map.get(r.docId)) || setup.home.code) === b.code);
  return {
    ...full,
    header: { ...full.header, branchCode: b.code, branchLabel: branchLabelTh(b) },
    rows,
    branchTotal: { base: rows.reduce((n, r) => n + r.base, 0), vat: rows.reduce((n, r) => n + r.vat, 0) },
    branch: b,
    branchWarnings: [legalWarning("BRANCH_REPORT_PER_PLACE", { branch: branchLabelTh(b) }), ...setup.warnings],
  };
}
