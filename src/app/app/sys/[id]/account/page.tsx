import { requireAccountPage } from "@/lib/modules/account/guard";
import { AccountContent } from "@/lib/modules/account/ui";

// หน้า hub ของโมดูลบัญชี (`/app/sys/<id>/account`) — เดิมไม่มี page.tsx (มีแต่ layout.tsx) จึงเปิดแล้ว 404
// (บั๊กที่บันทึกไว้ใน ledger/wo-notes/0.1.md ข้อ 8 · ส่งต่อให้ WO 0.4 แก้) · เนื้อหาเดียวกับที่
// `/app/sys/<id>/page.tsx` เคยเรนเดอร์ให้ระบบ ACCOUNT — ตอนนี้หน้านั้น redirect มาที่นี่แทน (hub เดียว)
//
// WO 2.2: หน้าหลัก V2 อ่าน query string หลายตัว (ปี/เดือน/ตัวกรอง/ย่อขยาย/สลับลูกหนี้-เจ้าหนี้/`?checklist=1`
// สำหรับบังคับโชว์เช็กลิสต์ตอนถ่ายภาพ QC) — ส่งทั้งก้อนต่อให้ dashboard-home.ts แปลงเอง (ที่เดียว)
export default async function AccountHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.doc.view");
  return <AccountContent systemId={systemId} tenantId={tenantId} searchParams={sp} />;
}
