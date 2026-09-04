// WO 5.2 — หน้า "สำรองรับ/จ่าย" V2 (DESIGN-SPEC-V2 §10.3)
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { pettyCashList } from "@/lib/modules/account/finance-overview";
import { financeSubTabs } from "@/lib/modules/account/finance-ui";
import { listFinanceAccounts } from "@/lib/modules/account/finance";
import { listTenantMembers } from "@/lib/modules/account/service";
import { chequeSummary } from "@/lib/modules/account/cheque";
import { formatDateTh } from "@/lib/ui/date";
import { PettyCashPanel, type PettyCashCard, type SourceOpt } from "@/components/account-v2/PettyCashPanel";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ topup?: string; reimburse?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.finance.manage" });

  const [members, allFinance, chq] = await Promise.all([
    listTenantMembers(tenantId),
    listFinanceAccounts(tenantId, systemId),
    chequeSummary(tenantId, systemId),
  ]);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const holderNames = memberName;
  const boxes = await pettyCashList({ tenantId, systemId }, holderNames);

  const base = `/app/sys/${id}/account`;
  const financePath = `${base}/finance`;

  const rows: PettyCashCard[] = boxes.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    holderName: b.holderName,
    limitSatang: b.limitSatang,
    balanceSatang: b.balanceSatang,
    lastTopUpText: b.lastTopUpAt
      ? `${formatDateTh(b.lastTopUpAt)} · ${b.lastTopUpAmountSatang != null ? "+" + (b.lastTopUpAmountSatang / 100).toLocaleString("th-TH") : ""}`
      : "ยังไม่เคยเติม",
  }));

  const sources: SourceOpt[] = allFinance
    .filter((a) => a.type !== "PETTY_CASH")
    .map((a) => ({ id: a.id, label: a.code ? `${a.name} (${a.code})` : a.name }));

  return (
    <PettyCashPanel
      systemId={systemId}
      financePath={financePath}
      subTabs={financeSubTabs(base, "petty", chq)}
      rows={rows}
      sources={sources}
      newExpenseHref={`${base}/expense/new`}
      initialTopUpId={sp.topup}
      initialReimburseId={sp.reimburse}
    />
  );
}
