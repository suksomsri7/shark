import type { AccountDocType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import {
  dashboardSnapshot,
  categoryBreakdownFromRows,
  incomeCategoriesFromRows,
  periodKeyBkk,
  type DashCtx,
  type DashboardSnapshot,
  type QueryMeter,
  type CategoryBreakdown,
  type CategorySlice,
} from "./dashboard";
import { getSettings } from "./service";
import { ACCOUNT_NAV, type AccountNavGroup } from "./nav";

// ─────────────────────────────────────────────────────────────
// dashboard-home.ts — "data function" ของหน้าหลัก V2 (WO 2.2)
// แยกจาก ui.tsx (React) โดยตั้งใจ เพื่อให้ scripts/qc-acc-v2-home.mts import ตรง ๆ ได้
// (เหมือน qc-acc-v2-dashboard.mts import dashboard.ts ตรง ๆ — ไม่ต้องเปิดเบราว์เซอร์)
//
// กติกางบ query (BLUEPRINT §3 WO 2.2): เรียก `dashboardSnapshot` ครั้งเดียว ≤12 query
// ตัวเลือกเดือนของโดนัท (im/em) ไม่ยิง query เพิ่มเมื่ออยู่ในช่วง glRows ที่ snapshot คืนมาแล้ว (year-1..year)
// เช็กลิสต์เริ่มต้น (§0.3 ข้อ 2) เป็นฟีเจอร์แยก ใช้ query เพิ่มของตัวเอง (นอกงบ 12 ของ dashboardSnapshot)
// ─────────────────────────────────────────────────────────────

export type ChartPeriod = "month" | "quarter";
export type ArApSide = "receivable" | "payable";

export type HomeParams = {
  year: number;
  chartPeriod: ChartPeriod;
  side: ArApSide;
  incomeMonth: string;
  expenseMonth: string;
  issuedDocType: AccountDocType;
  forceChecklist: boolean;
};

export type ChecklistStep = { key: string; label: string; done: boolean; href: string };
export type ChecklistResult = { steps: ChecklistStep[]; allDone: boolean };

export type CreateDocItem = { label: string; href: string; icon: string; testId: string };
export type CreateDocMenu = { revenue: CreateDocItem[]; expense: CreateDocItem[] };

export type LedgerPinCandidate = { id: string; code: string; name: string; pinned: boolean };

export type DashboardHome = {
  now: Date;
  base: string;
  vatRegistered: boolean;
  snapshot: DashboardSnapshot;
  income: CategoryBreakdown;
  expense: CategoryBreakdown;
  /** "รายได้อะไรมากที่สุด" (§4 ข้อ 8) ของทั้งปีที่เลือก — สรุปจาก glRows เดิม ไม่ query เพิ่ม */
  topIncomeCategories: { total: number; rows: CategorySlice[] };
  checklist: ChecklistResult;
  createMenu: CreateDocMenu;
  /** ตัวเลือกปักหมุด "บัญชีที่ติดตาม" (ผังบัญชี) — คนละก้อนกับ snapshot.cash.accounts (บัญชีเงิน) */
  ledgerAccounts: LedgerPinCandidate[];
  params: HomeParams;
  /** งบ query ของ dashboardSnapshot เพียงก้อนเดียว (ไม่รวมเช็กลิสต์/ตัวเลือกปักหมุด) — ข้อสอบเทียบ ≤ 12 */
  snapshotQueryCount: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseYear(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : fallback;
}

function parsePeriodKey(v: string | undefined, fallback: string): string {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : fallback;
}

/** ชนิดเอกสารที่เลือกได้ในการ์ด "เอกสารที่ออก" (§4 ข้อ 6) — ตรงกับรายการ "doc" ที่พร้อมใช้งานจริงใน nav.ts
 * (single source of truth เดียวกับเมนู — ไม่พิมพ์ enum ซ้ำเอง) */
export function issuableDocTypes(base: string, vatRegistered: boolean): { value: AccountDocType; label: string }[] {
  const groups = ACCOUNT_NAV(base, vatRegistered);
  const out: { value: AccountDocType; label: string }[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    if (g.key !== "revenue" && g.key !== "expense") continue;
    for (const it of g.items) {
      if (it.kind !== "doc" || it.status !== "ready") continue;
      if (seen.has(it.testId)) continue;
      seen.add(it.testId);
      out.push({ value: it.testId as AccountDocType, label: it.label });
    }
  }
  return out;
}

function normalizeParams(base: string, vatRegistered: boolean, raw: RawParams, currentYear: number, currentPeriod: string): HomeParams {
  const validDocTypes = new Set(issuableDocTypes(base, vatRegistered).map((d) => d.value));
  const dt = one(raw.dt);
  return {
    year: parseYear(one(raw.year), currentYear),
    chartPeriod: one(raw.chartPeriod) === "quarter" ? "quarter" : "month",
    side: one(raw.side) === "payable" ? "payable" : "receivable",
    incomeMonth: parsePeriodKey(one(raw.im), currentPeriod),
    expenseMonth: parsePeriodKey(one(raw.em), currentPeriod),
    // ค่าเริ่มต้น = ใบแจ้งหนี้ (มีข้อมูลจริงใน seed ทุกกรณี) — ใบเสนอราคายังไม่มีข้อมูลใน tenant QC วันนี้
    // เลยโชว์การ์ดว่างเปล่าตั้งแต่เปิดหน้ามา (Fable QC ภาพจริง 2.2 ขอปรับ)
    issuedDocType: (dt && validDocTypes.has(dt as AccountDocType) ? dt : "INVOICE") as AccountDocType,
    forceChecklist: one(raw.checklist) === "1",
  };
}

// ─────────────────── เช็กลิสต์เริ่มต้น 5 ขั้น (BLUEPRINT §0.3 ข้อ 2) ───────────────────

export type ChecklistInput = {
  hasOrgName: boolean;
  hasFinance: boolean;
  hasContactOrProduct: boolean;
  hasIssuedDoc: boolean;
  hasSystemLink: boolean;
};

/** ฟังก์ชันบริสุทธิ์ — รับธงที่คำนวณแล้ว คืนขั้นตอน 5 ข้อ + allDone (unit test ได้โดยไม่ต้องมี DB) */
export function computeChecklist(input: ChecklistInput, base: string): ChecklistResult {
  const steps: ChecklistStep[] = [
    { key: "org", label: "ตั้งค่ากิจการ", done: input.hasOrgName, href: `${base}/settings` },
    { key: "finance", label: "เพิ่มช่องทางเงิน", done: input.hasFinance, href: `${base}/finance` },
    { key: "contact", label: "เพิ่มลูกค้า/สินค้า", done: input.hasContactOrProduct, href: `${base}/contacts` },
    { key: "doc", label: "ออกเอกสารใบแรก", done: input.hasIssuedDoc, href: `${base}/docs/QUOTATION/new` },
    { key: "link", label: "เชื่อมระบบ", done: input.hasSystemLink, href: `${base}/settings` },
  ];
  return { steps, allDone: steps.every((s) => s.done) };
}

async function loadChecklist(ctx: DashCtx, base: string, hasOrgName: boolean): Promise<ChecklistResult> {
  const [financeCount, contactCount, productCount, issuedDocCount, systemLinkCount] = await Promise.all([
    prisma.accountFinance.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null } }),
    prisma.accountContact.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null } }),
    prisma.accountProduct.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null } }),
    prisma.accountDocument.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: { notIn: ["DRAFT"] } } }),
    prisma.accountSystemLink.count({ where: { systemId: ctx.systemId, archivedAt: null } }),
  ]);
  return computeChecklist(
    {
      hasOrgName,
      hasFinance: financeCount > 0,
      hasContactOrProduct: contactCount > 0 || productCount > 0,
      hasIssuedDoc: issuedDocCount > 0,
      hasSystemLink: systemLinkCount > 0,
    },
    base,
  );
}

// ─────────────────── "+ สร้างเอกสาร ▾" 2 คอลัมน์ (f2) ───────────────────

/** ชื่อ testId ที่ไม่ใช่ "ชนิดเอกสารที่สร้างได้" (ภาพรวม/เอกสารประจำ/ลิงก์ QR/AI ยังไม่มีฟอร์ม) — ตัดออกจากเมนูสร้างด่วน */
const NOT_CREATABLE = /_OVERVIEW$|_RECURRING$|_QR_LINK$|_AI_SCAN$/;

function pickCreateItems(groups: AccountNavGroup[], key: "revenue" | "expense"): CreateDocItem[] {
  const g = groups.find((x) => x.key === key);
  if (!g) return [];
  return g.items
    .filter((it) => it.status === "ready" && !NOT_CREATABLE.test(it.testId))
    .map((it) => {
      if (it.kind === "page") return { label: it.label, href: it.href, icon: it.icon, testId: it.testId };
      const createFlyout = it.flyout?.find((f) => f.label.startsWith("+ "));
      return {
        label: createFlyout ? createFlyout.label.replace(/^\+\s*/, "") : it.label,
        href: createFlyout ? createFlyout.href : `${it.href}/new`,
        icon: it.icon,
        testId: it.testId,
      };
    });
}

/** เมนู "+ สร้างเอกสาร ▾" 2 คอลัมน์ (รายรับ|รายจ่าย) — สร้างจาก nav.ts แหล่งเดียว (ไม่พิมพ์รายการซ้ำเอง)
 * ตามภาพ f2 (ไอคอน/ป้ายไทยชุดเดียวกับ dropdown เมนู) + WO 2.2: "items without a form yet link to lists"
 * — ในทางปฏิบัติกรอง status !== "ready" ออกไปเลย (ยังไม่มีฟอร์ม = ไม่อยู่ในเมนูสร้างด่วน) */
export function createDocMenuItems(base: string, vatRegistered: boolean): CreateDocMenu {
  const groups = ACCOUNT_NAV(base, vatRegistered);
  return { revenue: pickCreateItems(groups, "revenue"), expense: pickCreateItems(groups, "expense") };
}

// ─────────────────── ก้อนข้อมูลรวมของหน้าหลัก ───────────────────

export async function loadDashboardHome(
  ctx: DashCtx,
  raw: RawParams,
  opts: { now?: Date; base: string } ,
): Promise<DashboardHome> {
  const now = opts.now ?? new Date();
  const base = opts.base;
  const currentPeriod = periodKeyBkk(now);
  const currentYear = Number(currentPeriod.slice(0, 4));

  const settings = await getSettings(ctx.tenantId, ctx.systemId);
  const params = normalizeParams(base, settings.vatRegistered, raw, currentYear, currentPeriod);

  const meter: QueryMeter = { count: 0 };
  const snapshot = await dashboardSnapshot(ctx, {
    now,
    year: params.year,
    issuedDocType: params.issuedDocType,
    meter,
  });

  // เดือนของโดนัท: ถ้าตรงกับ periodKey ของ snapshot ใช้ค่าที่คำนวณไว้แล้วตรง ๆ (0 query เพิ่ม)
  // ไม่ตรง → derive จาก glRows ที่ snapshot คืนมาอยู่แล้ว (ครอบ year-1..year เสมอ — ยังคง 0 query เพิ่ม)
  const income =
    params.incomeMonth === snapshot.periodKey
      ? snapshot.income
      : categoryBreakdownFromRows(snapshot.glRows, params.incomeMonth, "income", 5);
  const expense =
    params.expenseMonth === snapshot.periodKey
      ? snapshot.expense
      : categoryBreakdownFromRows(snapshot.glRows, params.expenseMonth, "expense", 5);

  const topIncomeCategories = incomeCategoriesFromRows(
    snapshot.glRows.filter((r) => r.periodKey.startsWith(`${params.year}-`)),
    5,
  );

  const checklist = await loadChecklist(ctx, base, Boolean(settings.orgName));
  const createMenu = createDocMenuItems(base, settings.vatRegistered);
  const ledgerAccounts: LedgerPinCandidate[] = (
    await prisma.accountLedger.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null },
      select: { id: true, code: true, name: true, pinned: true },
      orderBy: { code: "asc" },
    })
  ).map((l) => ({ id: l.id, code: l.code, name: l.name, pinned: l.pinned }));

  return {
    now,
    base,
    vatRegistered: settings.vatRegistered,
    snapshot,
    income,
    expense,
    topIncomeCategories,
    checklist,
    createMenu,
    ledgerAccounts,
    params,
    snapshotQueryCount: meter.count,
  };
}
