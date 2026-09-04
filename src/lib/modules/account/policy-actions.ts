"use server";

// policy-actions.ts — server actions ของหน้า "ตั้งค่า › นโยบายบัญชี" (WO 8.2 · §9.3)
//
// ด่านเดียวกับ WO 8.1: loadAccountSystem → assertAccountCan("account.settings.manage") → savePolicy
//   → writeAudit (เก็บเฉพาะคีย์ที่เปลี่ยน · อีเมลผู้รับ mask เป็นจำนวนคน) → revalidatePath
//
// 🔴 กติกาข้อสำคัญ (บทเรียนจาก 8.1): **ส่งเฉพาะช่องที่ฟอร์มมีจริง**
//    หน้านี้แบ่งเป็นหัวข้อย่อย (?s=…) ฟอร์มแต่ละหัวข้อส่งมาไม่ครบทุกคีย์
//    ถ้าประกอบ patch เต็มก้อนทุกครั้ง ค่าของหัวข้ออื่นจะถูกล้างเงียบ ๆ

import { revalidatePath } from "next/cache";
import type { AccountPriceMode, AccountVatTiming, AccountWhtIncomeType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
import { listLedgers, setMapping } from "./coa";
import {
  getPolicy,
  policyAuditDiff,
  savePolicy,
  toDupPolicy,
  type PolicyPatch,
  type WhtDefault,
} from "./policy";

export type PolicyActionResult = { ok: true } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/account/settings/policy`;

const WHT_INCOME_TYPES: readonly AccountWhtIncomeType[] = [
  "M40_1",
  "M40_2",
  "M40_3",
  "M40_4",
  "M40_5",
  "M40_6",
  "M40_7",
  "M40_8",
];

async function gate(systemId: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  return { tenantId, systemId, userId };
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const has = (fd: FormData, k: string) => fd.get(k) !== null;
const on = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "1" || fd.get(k) === "true";
const int = (fd: FormData, k: string, dflt: number) => {
  const v = Number.parseInt(s(fd, k), 10);
  return Number.isFinite(v) ? v : dflt;
};
/** "7" หรือ "7.5" (เปอร์เซ็นต์บนหน้าจอ) → basis point จำนวนเต็ม */
const pctToBp = (raw: string, dflt: number) => {
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? Math.round(v * 100) : dflt;
};
/** "1234.50" บาท → สตางค์ (จำนวนเต็ม — เงินเป็น integer เสมอ) */
const bahtToSatang = (raw: string, dflt: number) => {
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? Math.round(v * 100) : dflt;
};

/**
 * "YYYY-MM-DD" (ช่องวันที่ของเบราว์เซอร์ = วันไทยที่ผู้ใช้เห็น) → Date เที่ยงคืนเวลาไทย
 * ว่าง = ไม่ล็อก (null)
 */
function parseLockDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, -7, 0, 0));
}

/** อ่านตาราง "หัก ณ ที่จ่ายเริ่มต้น" จากฟอร์ม — เก็บเฉพาะแถวที่ติ๊กเปิดไว้ */
function readWhtDefaults(fd: FormData): WhtDefault[] {
  const out: WhtDefault[] = [];
  for (const t of WHT_INCOME_TYPES) {
    if (!on(fd, `wht_${t}_on`)) continue;
    const rateBp = pctToBp(s(fd, `wht_${t}_rate`), 0);
    const codes = s(fd, `wht_${t}_accounts`)
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    out.push({ incomeType: t, rateBp, expenseAccountCodes: [...new Set(codes)] });
  }
  return out;
}

/** อ่านรายชื่ออีเมลผู้รับ (คั่นด้วยบรรทัด/จุลภาค/ช่องว่าง) */
function readRecipients(fd: FormData): string[] {
  return [
    ...new Set(
      s(fd, "emailReportRecipients")
        .split(/[\s,;]+/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/**
 * บันทึกนโยบายบัญชี — action เดียวใช้ได้ทุกหัวข้อย่อย
 * เก็บเฉพาะคีย์ที่ฟอร์มส่งมาจริง (`has()`) ⇒ หัวข้อที่ไม่ได้เปิดอยู่ไม่ถูกแตะ
 */
export async function savePolicyAction(formData: FormData): Promise<PolicyActionResult> {
  const systemId = s(formData, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const ctx = { tenantId, systemId };
  const before = await getPolicy(ctx);

  const patch: PolicyPatch = {};

  // ① ปีบัญชี
  if (has(formData, "fiscalYearStartMonth")) patch.fiscalYearStartMonth = int(formData, "fiscalYearStartMonth", 1);
  if (has(formData, "periodCloseDay")) {
    const raw = s(formData, "periodCloseDay");
    patch.periodCloseDay = raw === "" ? null : int(formData, "periodCloseDay", 1);
  }

  // ② VAT
  if (has(formData, "vatRegistered")) {
    patch.vatRegistered = s(formData, "vatRegistered") === "1";
    patch.vatRateBp = pctToBp(s(formData, "vatRatePct"), before.vatRateBp);
    patch.vatTiming = (s(formData, "vatTiming") === "ON_PAYMENT" ? "ON_PAYMENT" : "ON_ISSUE") as AccountVatTiming;
  }

  // ③ หัก ณ ที่จ่ายเริ่มต้น
  if (has(formData, "whtSection")) patch.whtDefaults = readWhtDefaults(formData);

  // ④ ประเภทราคาเริ่มต้น
  if (has(formData, "defaultPriceMode")) {
    const v = s(formData, "defaultPriceMode");
    patch.defaultPriceMode = (["EXCL_VAT", "INCL_VAT", "NO_VAT"].includes(v) ? v : null) as AccountPriceMode | null;
  }

  // ⑤ ล็อกข้อมูลก่อนวันที่
  if (has(formData, "lockBeforeDate")) patch.lockBeforeDate = parseLockDate(s(formData, "lockBeforeDate"));

  // ⑥ การสร้างชื่อซ้ำ
  if (has(formData, "dupContactPolicy")) patch.dupContactPolicy = toDupPolicy(s(formData, "dupContactPolicy"));
  if (has(formData, "dupProductPolicy")) patch.dupProductPolicy = toDupPolicy(s(formData, "dupProductPolicy"));

  // ⑦ บัญชีรายรับ/รายจ่ายเริ่มต้น
  const wantsAccounts = has(formData, "defaultSalesAccountCode");
  if (wantsAccounts) {
    patch.defaultSalesAccountCode = s(formData, "defaultSalesAccountCode") || null;
    patch.defaultPurchaseAccountCode = s(formData, "defaultPurchaseAccountCode") || null;
    patch.defaultExpenseAccountCode = s(formData, "defaultExpenseAccountCode") || null;
  }

  // ⑧ การออกเอกสารต่อ
  if (has(formData, "convertQtTo")) {
    patch.convertQtTo = s(formData, "convertQtTo") === "DEPOSIT_RECEIPT" ? "DEPOSIT_RECEIPT" : "INVOICE";
    patch.convertPoTo = s(formData, "convertPoTo") === "EXPENSE" ? "EXPENSE" : "PURCHASE";
    patch.copyNotesOnConvert = on(formData, "copyNotesOnConvert");
    patch.copyTagsOnConvert = on(formData, "copyTagsOnConvert");
  }

  // ⑨ ลูกค้าประจำ
  if (has(formData, "rcMinPaidDocs")) {
    patch.regularCustomer = {
      minPaidDocs: int(formData, "rcMinPaidDocs", before.regularCustomer.minPaidDocs),
      minPaidTotalSatang: bahtToSatang(s(formData, "rcMinPaidTotalBaht"), before.regularCustomer.minPaidTotalSatang),
      periodMonths: int(formData, "rcPeriodMonths", before.regularCustomer.periodMonths),
    };
  }

  // ⑩ ปิดงวดอัตโนมัติ
  if (has(formData, "autoCloseSection")) {
    patch.autoClosePeriods = on(formData, "autoClosePeriods");
    patch.autoCloseNotify = on(formData, "autoCloseNotify");
  }

  // ⑪ รายงานทางอีเมล
  if (has(formData, "emailReportSection")) {
    patch.emailReportDaily = on(formData, "emailReportDaily");
    patch.emailReportWeekly = on(formData, "emailReportWeekly");
    patch.emailReportRecipients = readRecipients(formData);
  }

  const saved = await savePolicy(ctx, patch);
  if (!saved.ok) return saved;

  // บัญชีเริ่มต้น = mapping key ที่ตัวโพสต์บัญชีใช้จริง — เขียนคู่กับคอลัมน์เสมอ
  // (คอลัมน์ไว้โชว์/ตรวจ · mapping คือของจริงที่ `gl.resolveLine` อ่าน)
  //
  // 🔴 "บัญชีขาย" ต้องเขียน **3 คีย์**: `gl.postDocument` ไม่ได้ใช้ `INCOME_DEFAULT` เลย —
  //    มันเลือก `INCOME_GOODS` (รับรู้ตอนออกเอกสาร) หรือ `INCOME_SERVICE` (รับรู้ตอนรับเงิน) ตามจุดรับรู้ VAT
  //    ถ้าเขียนแค่ INCOME_DEFAULT ตัวตั้งค่านี้จะไม่มีผลกับ JV จริงเลยสักใบ (เป็นช่องหลอกตา)
  //    ใครอยากแยกขายสินค้า/ขายบริการ ยังทำได้ผ่าน "บัญชีต่อชนิดเอกสาร" (§9.2) หรือบัญชีของสินค้าแต่ละตัว
  if (wantsAccounts) {
    const sales = patch.defaultSalesAccountCode ?? null;
    const mapped = await syncDefaultAccountMappings(ctx, {
      INCOME_DEFAULT: sales,
      INCOME_GOODS: sales,
      INCOME_SERVICE: sales,
      PURCHASE_DEFAULT: patch.defaultPurchaseAccountCode ?? null,
      EXPENSE_DEFAULT: patch.defaultExpenseAccountCode ?? null,
    });
    if (!mapped.ok) return mapped;
  }

  const after = await getPolicy(ctx);
  const diff = policyAuditDiff(before, after);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "AccountSettings",
    targetId: systemId,
    before: { section: "นโยบายบัญชี", ...diff.before },
    after: { section: "นโยบายบัญชี", changed: diff.changed, ...diff.after },
  });
  revalidatePath(PATH(systemId));
  return { ok: true };
}

/**
 * ผูก "รหัสบัญชีเริ่มต้น" เข้ากับ mapping key ที่ `gl.resolveLine` อ่านจริง
 * รหัสว่าง = ไม่แตะ mapping เดิม (ไม่ลบ — ลบแล้วจะตกไปบัญชีพัก 9999 โดยผู้ใช้ไม่ได้ตั้งใจ)
 */
async function syncDefaultAccountMappings(
  ctx: { tenantId: string; systemId: string },
  wanted: Record<string, string | null>,
): Promise<PolicyActionResult> {
  const codes = Object.values(wanted).filter((x): x is string => !!x);
  if (codes.length === 0) return { ok: true };
  const ledgers = await listLedgers(ctx);
  const byCode = new Map(ledgers.map((l) => [l.code, l.id]));
  for (const [key, code] of Object.entries(wanted)) {
    if (!code) continue;
    const id = byCode.get(code);
    if (!id) return { ok: false, reason: `ไม่พบบัญชีรหัส ${code} ในผังบัญชีของร้านนี้` };
    const r = await setMapping(ctx, key, id);
    if (!r.ok) return { ok: false, reason: r.reason ?? `ตั้งบัญชีเริ่มต้น ${key} ไม่สำเร็จ` };
  }
  return { ok: true };
}
