// WO 5.1 — หน้าช่องทางการเงิน V2 (เขียนใหม่ทั้งหน้า แทนฟอร์มเดิม WO 0.1) — DESIGN-SPEC-V2 §10.1 · g9-finance-channels.png
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { FinancePage } from "@/lib/modules/account/finance-ui";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; edit?: string; transfer?: string; from?: string; err?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.finance.manage" });
  return <FinancePage tenantId={tenantId} systemId={systemId} id={id} searchParams={sp} />;
}
