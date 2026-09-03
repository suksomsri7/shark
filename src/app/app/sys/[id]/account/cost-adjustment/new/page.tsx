// สร้างใบปรับต้นทุนสินค้า CA (WO 4.3 · DESIGN-SPEC-V2 §8.4)
import { requireAccountPage } from "@/lib/modules/account/guard";
import PageHeader from "@/components/ui/PageHeader";
import { CostAdjustForm } from "@/components/account-v2/CostAdjustForm";
import {
  listProductsPaged,
  listExpenseAccounts,
  COST_ADJUST_REASONS,
  COST_ADJUST_DEFAULT_ACCOUNT,
} from "@/lib/modules/account/product";

function todayBkk(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function NewCostAdjustmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ product?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.product.manage");
  const base = `/app/sys/${id}/account`;

  const [goods, accounts] = await Promise.all([
    listProductsPaged(tenantId, systemId, { type: "GOODS", pageSize: 100 }),
    listExpenseAccounts(tenantId, systemId),
  ]);
  const ym = todayBkk().slice(0, 7).replace("-", "");

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="สร้างใบปรับต้นทุนสินค้า"
        desc={`CA-${ym}-#### · ร่าง`}
        back={{ href: `${base}/cost-adjustment`, label: "ใบปรับต้นทุนสินค้า" }}
      />
      <CostAdjustForm
        systemId={systemId}
        today={todayBkk()}
        docNoPreview={`CA-${ym}-####`}
        products={goods.rows.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          unitName: p.unitName,
          stock: p.stock,
          costSatang: p.buyPrice ?? 0,
          linked: !!p.invItemId,
        }))}
        reasons={COST_ADJUST_REASONS}
        accounts={accounts.map((a) => ({ code: a.code, name: a.name }))}
        defaultAccountCode={
          accounts.some((a) => a.code === COST_ADJUST_DEFAULT_ACCOUNT)
            ? COST_ADJUST_DEFAULT_ACCOUNT
            : (accounts[0]?.code ?? COST_ADJUST_DEFAULT_ACCOUNT)
        }
        cancelHref={`${base}/cost-adjustment`}
        presetProductId={sp.product}
      />
    </div>
  );
}
