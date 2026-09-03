// WO 3.2 — หน้าผู้ติดต่อ V2 (เขียนใหม่ทั้งหน้า แทนลิสต์เดิม WO 0.1/0.2) — DESIGN-SPEC-V2 §7.1 · f5-contacts.png
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { ContactsPage } from "@/lib/modules/account/contacts-ui";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    group?: string;
    page?: string;
    pageSize?: string;
    err?: string;
    bulkIds?: string;
    edit?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.contact.manage" });
  return <ContactsPage tenantId={tenantId} systemId={systemId} id={id} searchParams={sp} />;
}
