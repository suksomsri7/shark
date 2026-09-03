// WO 1.8 §8.5 / §7.1 — นำเข้าผู้ติดต่อจาก CSV — dedupe เลขผู้เสียภาษี(+สาขา)/เบอร์โทร
import { requireAccountPage } from "@/lib/modules/account/guard";
import { ImportWizard } from "@/components/account-v2/ImportWizard";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { systemId } = await requireAccountPage(id, "account.import");
  const base = `/app/sys/${id}/account`;

  return (
    <ImportWizard
      systemId={systemId}
      kind="contacts"
      title="นำเข้าผู้ติดต่อ"
      backHref={`${base}/contacts`}
      templateHref={`${base}/import/template?kind=contacts`}
    />
  );
}
