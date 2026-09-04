// WO 6.1 — หน้าผังบัญชี V2 (เขียนใหม่ทั้งหน้า แทนฟอร์มเดิม) — DESIGN-SPEC-V2 §11.1 · f8-chart-of-accounts.png
// การผูกบัญชีอัตโนมัติ (§7.10) ที่เคยอยู่ท้ายหน้านี้ ย้ายไป `accounts/mapping` (f8 ไม่มีบล็อกนั้น)
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { ChartOfAccountsPage } from "@/lib/modules/account/coa-ui";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; new?: string; edit?: string; q?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.chart.manage" });
  return <ChartOfAccountsPage tenantId={tenantId} systemId={systemId} id={id} searchParams={sp} />;
}
