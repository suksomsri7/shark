import { notFound, redirect } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { isVisibleDocType, getDraftMeta } from "@/lib/modules/account/service";
import { DocDetailPage } from "@/components/account-v2/DocDetailPage";
// CRM C2.7 ▸ บล็อก "ดีล" ของเอกสารใบนี้ (โหลดผ่าน `crm.payments.dealForDoc(tenantId, docId, actor)` ในทางเข้าคอมโพเนนต์ `crm/ui`)
//   เอกสารที่ไม่ได้ผูกดีล / ผู้ดูมองดีลนั้นไม่เห็น / ระบบ CRM ยังเป็นรุ่นเดิม ⇒ ไม่เรนเดอร์อะไรเลย (หน้าเดิมทุกตัวอักษร) ◂
import { AccountDocCrmDealBlock } from "@/lib/modules/crm/ui";

// WO 1.5 — หน้าเอกสาร V2 (§5.3) ฝั่งรายรับ · เนื้อหาจริงอยู่ที่ DocDetailPage (ใช้ร่วมกับฝั่งรายจ่ายทั้งหมด)
// `?edit=1` ของลิงก์เก่า (ก่อน WO 1.3 มีฟอร์มเต็มหน้า) ยังต้องพาไปหน้า `/edit` ได้เมื่อยังเป็นร่างอยู่
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docType: string; docId: string }>;
  searchParams: Promise<{ err?: string; edit?: string; tab?: string; msg?: string }>;
}) {
  const { id, docType, docId } = await params;
  const { err, edit, tab, msg } = await searchParams;
  if (!isVisibleDocType(docType as AccountDocType)) notFound();
  const dt = docType as AccountDocType;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.doc.view" });

  if (edit === "1") {
    const meta = await getDraftMeta(tenantId, systemId, docId, dt);
    if (meta && meta.status === "DRAFT") {
      redirect(`/app/sys/${id}/account/docs/${dt}/${docId}/edit`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DocDetailPage tenantId={tenantId} systemId={systemId} docId={docId} expectDocType={dt} tab={tab} err={err} msg={msg} />
      {/* CRM C2.7 ▸ ดีลที่ผูกเอกสารใบนี้ ◂ */}
      <AccountDocCrmDealBlock docId={docId} />
    </div>
  );
}
