// WO 1.8 §8.5 / §8 — นำเข้าสินค้า/บริการจาก CSV — dedupe รหัสสินค้า (SKU)
import { requireAccountPage } from "@/lib/modules/account/guard";
import { ImportWizard } from "@/components/account-v2/ImportWizard";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { systemId } = await requireAccountPage(id, "account.import");
  const base = `/app/sys/${id}/account`;

  return (
    <ImportWizard
      systemId={systemId}
      kind="products"
      title="นำเข้าสินค้า/บริการ"
      backHref={`${base}/products`}
      templateHref={`${base}/import/template?kind=products`}
    />
  );
}
