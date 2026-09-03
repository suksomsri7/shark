// WO 3.2 — "ดูภาพรวม" ผู้ติดต่อ (DESIGN-SPEC-V2 §7.4)
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { ContactsOverviewPage } from "@/lib/modules/account/contacts-overview-ui";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.contact.manage" });
  return <ContactsOverviewPage tenantId={tenantId} systemId={systemId} id={id} />;
}
