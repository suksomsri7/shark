// WO 3.4 — หน้าโปรไฟล์ผู้ติดต่อ 360° เต็มหน้าจอ (§7.1 · ภาพ g6-contact-360.png · มือถือ g19)
// แทนหน้ารายละเอียดย่อของ WO 3.2 · เนื้อหาเดียวกับแผงเลื่อนขวาในหน้ารายการ (component เดียวกัน)
import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { contactProfile } from "@/lib/modules/account/contact-profile";
import { crmViewerOfSession } from "@/lib/modules/account/contact-links";
import { ContactProfileFull } from "@/components/account-v2/ContactProfilePanel";

export default async function Page({ params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const { tenantId, systemId, userId, auth } = await loadAccountSystem(id, { can: "account.contact.manage" });
  const base = `/app/sys/${id}/account`;
  // C5.4 (L1-M3): การ์ด CRM แสดงตามสิทธิ์ CRM ของผู้ดู
  const profile = await contactProfile({ tenantId, systemId }, contactId, { base, crmViewer: crmViewerOfSession(userId, auth.active) });
  if (!profile) notFound();

  // breadcrumb "บัญชี › ผู้ติดต่อ › <ชื่อ>" มาจาก layout (AccountBreadcrumb อ่าน pathname เอง) — ไม่ซ้อนที่นี่
  return <ContactProfileFull systemId={id} initial={profile} />;
}
