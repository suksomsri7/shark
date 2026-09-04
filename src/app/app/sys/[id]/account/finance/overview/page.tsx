// WO 5.2 — หน้า "ดูภาพรวม" การเงิน V2 (DESIGN-SPEC-V2 §10.2 · เฟรม f7-finance-overview.png)
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { financeOverview, shiftMonthKey } from "@/lib/modules/account/finance-overview";
import { financeSubTabs } from "@/lib/modules/account/finance-ui";
import { periodKeyBkk, dayKeyBkk } from "@/lib/modules/account/dashboard";
import { FinanceOverviewPanel } from "@/components/account-v2/FinanceOverviewPanel";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; reconcileChannel?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.finance.manage" });

  const now = new Date();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : periodKeyBkk(now);

  const data = await financeOverview({ tenantId, systemId }, { month, now, reconcileChannelId: sp.reconcileChannel });

  const base = `/app/sys/${id}/account`;
  const financePath = `${base}/finance`;
  const overviewPath = `${financePath}/overview`;

  return (
    <FinanceOverviewPanel
      systemId={systemId}
      financePath={financePath}
      subTabs={financeSubTabs(base, "overview", data.chequeBadges)}
      data={data}
      monthPrevHref={`${overviewPath}?month=${shiftMonthKey(month, -1)}`}
      monthNextHref={`${overviewPath}?month=${shiftMonthKey(month, 1)}`}
      createHref={`${financePath}?new=1`}
      transferHref={`${financePath}?transfer=1`}
      todayIso={dayKeyBkk(now)}
    />
  );
}
