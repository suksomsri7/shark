// สร้างใบเบิกสินค้า PRR (WO 4.3 · DESIGN-SPEC-V2 §8.4 · เฟรม g12-goods-issue-form.png)
import { requireAccountPage } from "@/lib/modules/account/guard";
import PageHeader from "@/components/ui/PageHeader";
import { GoodsIssueForm } from "@/components/account-v2/GoodsIssueForm";
import { storageEnabled } from "@/lib/storage/service";
import {
  listProductsPaged,
  listWarehouses,
  listExpenseAccounts,
  GOODS_ISSUE_REASONS,
  GOODS_ISSUE_DEFAULT_ACCOUNT,
} from "@/lib/modules/account/product";

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — ห้ามใช้ toISOString ของเครื่อง (UTC ทำให้เพี้ยน 1 วัน) */
function todayBkk(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function NewGoodsIssuePage({
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

  const [goods, warehouses, expenseAccounts] = await Promise.all([
    listProductsPaged(tenantId, systemId, { type: "GOODS", pageSize: 100 }),
    listWarehouses(tenantId),
    listExpenseAccounts(tenantId, systemId),
  ]);
  const defaultWarehouse = warehouses.find((w) => w.isDefault)?.name ?? null;
  const ym = todayBkk().slice(0, 7).replace("-", "");

  // breadcrumb "บัญชี › สินค้า › ใบเบิกสินค้า › สร้าง" มาจาก layout (AccountBreadcrumb อ่าน pathname เอง)
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="สร้างใบเบิกสินค้า"
        desc={`PRR-${ym}-#### · ร่าง`}
        back={{ href: `${base}/goods-issue`, label: "ใบเบิกสินค้า" }}
      />
      <GoodsIssueForm
        systemId={systemId}
        docType="GOODS_ISSUE"
        docNoPreview={`PRR-${ym}-####`}
        today={todayBkk()}
        reasons={GOODS_ISSUE_REASONS}
        products={goods.rows.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          sku: p.sku,
          unitName: p.unitName,
          stock: p.stock,
          costSatang: p.buyPrice ?? 0,
          warehouseName: warehouses.find((w) => w.id === p.warehouseId)?.name ?? defaultWarehouse,
          linked: !!p.invItemId,
        }))}
        warehouses={warehouses}
        expenseAccounts={expenseAccounts.map((a) => ({ code: a.code, name: a.name }))}
        defaultAccountCode={
          expenseAccounts.some((a) => a.code === GOODS_ISSUE_DEFAULT_ACCOUNT)
            ? GOODS_ISSUE_DEFAULT_ACCOUNT
            : (expenseAccounts[0]?.code ?? GOODS_ISSUE_DEFAULT_ACCOUNT)
        }
        cancelHref={`${base}/goods-issue`}
        storageEnabled={storageEnabled()}
        presetProductId={sp.product}
      />
    </div>
  );
}
