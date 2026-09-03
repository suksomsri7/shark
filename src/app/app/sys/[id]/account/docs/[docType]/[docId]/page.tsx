import { notFound, redirect } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { isVisibleDocType, getDraftMeta } from "@/lib/modules/account/service";
import { DocDetailPage } from "@/components/account-v2/DocDetailPage";

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

  return <DocDetailPage tenantId={tenantId} systemId={systemId} docId={docId} expectDocType={dt} tab={tab} err={err} msg={msg} />;
}
