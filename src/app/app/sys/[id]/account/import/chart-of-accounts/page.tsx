// WO 6.1 §11.1 — นำเข้าผังบัญชี (CSV) — dedupe ด้วยรหัสบัญชี · ใช้ตัวช่วยนำเข้ากลางของ WO 1.8
import { requireAccountPage } from "@/lib/modules/account/guard";
import { ImportWizard } from "@/components/account-v2/ImportWizard";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { systemId } = await requireAccountPage(id, "account.import");
  const base = `/app/sys/${id}/account`;

  return (
    <ImportWizard
      systemId={systemId}
      kind="chart_of_accounts"
      title="นำเข้าผังบัญชี"
      backHref={`${base}/accounts`}
      templateHref={`${base}/import/template?kind=chart_of_accounts`}
    />
  );
}
