import { requireAccountPage } from "@/lib/modules/account/guard";
import { listLedgers } from "@/lib/modules/account/coa";
import { WHT_INCOME_LABEL } from "@/lib/modules/account/wht";
import { getRegularCustomerRule, regularCustomerContactIds } from "@/lib/modules/account/contacts-list";
import { fiscalYearOf, getPolicy } from "@/lib/modules/account/policy";
import {
  DEFAULT_POLICY_SUB,
  POLICY_SETTINGS_SUBS,
  policySubLabel,
} from "@/lib/modules/account/settings-nav";
import { savePolicyAction } from "@/lib/modules/account/policy-actions";
import { SettingsNav } from "@/components/account-v2/SettingsNav";
import { PolicyPanel, type WhtDefaultRow } from "@/components/account-v2/PolicyPanel";
import { formatDateTh } from "@/lib/ui/date";
import type { AccountWhtIncomeType } from "@prisma/client";

// หน้า "ตั้งค่า › นโยบายบัญชี" (SPEC §9.3 · WO 8.2)
// หัวข้อย่อยเลือกด้วย `?s=` — บนมือถือไม่มี `?s=` = เห็นรายการหัวข้อเต็มจอ (§13) เหมือนหน้า §9.2
export const dynamic = "force-dynamic";

const WHT_ORDER: AccountWhtIncomeType[] = ["M40_1", "M40_2", "M40_3", "M40_4", "M40_5", "M40_6", "M40_7", "M40_8"];

/** "YYYY-MM-DD" ตามเวลาไทยของ Date (ค่า ISO ที่ส่งให้ `DateInput`) */
const dateInputValue = (d: Date | null) => (d ? d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) : "");

export default async function AccountPolicySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { id } = await params;
  const { s: subRaw } = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.settings.manage");
  const base = `/app/sys/${id}/account`;
  const ctx = { tenantId, systemId };

  const hasSub = !!subRaw && POLICY_SETTINGS_SUBS.some((x) => x.key === subRaw);
  const sub = hasSub ? subRaw! : DEFAULT_POLICY_SUB;

  const [policy, ledgers] = await Promise.all([getPolicy(ctx), listLedgers(ctx)]);

  // "ลูกค้าประจำ" — โชว์จำนวนรายที่เข้าเกณฑ์ปัจจุบัน (ตัวเลขจริงจากข้อมูล ไม่ใช่คำอธิบายลอย ๆ)
  // อ่านเฉพาะตอนเปิดหัวข้อนี้ (query หนักกว่าหัวข้ออื่น — ไม่ควรจ่ายทุกครั้งที่เข้าหน้า)
  let regularCount = 0;
  if (sub === "regular") {
    const rule = await getRegularCustomerRule(ctx);
    regularCount = (await regularCustomerContactIds(ctx, rule)).size;
  }

  const active = ledgers.filter((l) => !l.archivedAt);
  const incomeLedgers = active.filter((l) => l.type === "INCOME").map((l) => ({ code: l.code, name: l.name }));
  const expenseLedgers = active
    .filter((l) => l.type === "EXPENSE" || l.type === "COGS")
    .map((l) => ({ code: l.code, name: l.name }));

  const whtByType = new Map(policy.whtDefaults.map((w) => [w.incomeType, w]));
  const whtRows: WhtDefaultRow[] = WHT_ORDER.map((t) => {
    const hit = whtByType.get(t);
    return {
      incomeType: t,
      label: WHT_INCOME_LABEL[t],
      enabled: !!hit,
      ratePct: hit ? String(hit.rateBp / 100) : "",
      accountCodes: hit ? hit.expenseAccountCodes.join(", ") : "",
    };
  });

  return (
    <PolicyPanel
      systemId={systemId}
      base={base}
      sub={sub}
      subLabel={policySubLabel(sub)}
      policy={{
        fiscalYearStartMonth: policy.fiscalYearStartMonth,
        periodCloseDay: policy.periodCloseDay,
        fiscalYearLabel: fiscalYearOf(new Date(), policy.fiscalYearStartMonth).label,
        vatRegistered: policy.vatRegistered,
        vatRatePct: String(policy.vatRateBp / 100),
        vatTiming: policy.vatTiming,
        defaultPriceMode: policy.defaultPriceMode ?? "",
        lockBeforeDate: dateInputValue(policy.lockBeforeDate),
        lockBeforeDateText: policy.lockBeforeDate ? formatDateTh(policy.lockBeforeDate) : "",
        dupContactPolicy: policy.dupContactPolicy,
        dupProductPolicy: policy.dupProductPolicy,
        defaultSalesAccountCode: policy.defaultSalesAccountCode ?? "",
        defaultPurchaseAccountCode: policy.defaultPurchaseAccountCode ?? "",
        defaultExpenseAccountCode: policy.defaultExpenseAccountCode ?? "",
        convertQtTo: policy.convertQtTo,
        convertPoTo: policy.convertPoTo,
        copyNotesOnConvert: policy.copyNotesOnConvert,
        copyTagsOnConvert: policy.copyTagsOnConvert,
        regularCustomer: {
          minPaidDocs: policy.regularCustomer.minPaidDocs,
          minPaidTotalBaht: String(policy.regularCustomer.minPaidTotalSatang / 100),
          periodMonths: policy.regularCustomer.periodMonths,
        },
        regularCustomerCount: regularCount,
        autoClosePeriods: policy.autoClosePeriods,
        autoCloseNotify: policy.autoCloseNotify,
        emailReportDaily: policy.emailReportDaily,
        emailReportWeekly: policy.emailReportWeekly,
        emailReportRecipients: policy.emailReportRecipients.join("\n"),
        whtRows,
      }}
      incomeLedgers={incomeLedgers}
      expenseLedgers={expenseLedgers}
      nav={<SettingsNav base={base} activeGroup="policy" activeSub={sub} />}
      mobileNav={<SettingsNav base={base} activeGroup="policy" activeSub={hasSub ? sub : ""} />}
      showMobileNavOnly={!hasSub}
      save={savePolicyAction}
    />
  );
}
