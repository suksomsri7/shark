// WO 1.8 §8.5 — นำเข้าเอกสาร (รายรับ/รายจ่าย) จาก CSV — ตัวช่วย ImportWizard กลาง (ดู import-shared.ts/import-actions.ts)
import { requireAccountPage } from "@/lib/modules/account/guard";
import { ImportWizard } from "@/components/account-v2/ImportWizard";
import { importKindOf } from "@/lib/modules/account/import-shared";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string }>;
}) {
  const { id } = await params;
  const { side } = await searchParams;
  const { systemId } = await requireAccountPage(id, "account.import");
  const base = `/app/sys/${id}/account`;
  const isExpense = side === "expense";
  const kind = importKindOf("documents", isExpense ? "expense" : "revenue");
  const backHref = isExpense ? `${base}/expense` : `${base}/docs/INVOICE`;

  return (
    <ImportWizard
      systemId={systemId}
      kind={kind}
      title={isExpense ? "นำเข้าเอกสารรายจ่าย" : "นำเข้าเอกสารรายรับ"}
      backHref={backHref}
      templateHref={`${base}/import/template?kind=${kind}`}
    />
  );
}
