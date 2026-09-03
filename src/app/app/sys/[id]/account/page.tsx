import { requireAccountPage } from "@/lib/modules/account/guard";
import { AccountContent } from "@/lib/modules/account/ui";

// หน้า hub ของโมดูลบัญชี (`/app/sys/<id>/account`) — เดิมไม่มี page.tsx (มีแต่ layout.tsx) จึงเปิดแล้ว 404
// (บั๊กที่บันทึกไว้ใน ledger/wo-notes/0.1.md ข้อ 8 · ส่งต่อให้ WO 0.4 แก้) · เนื้อหาเดียวกับที่
// `/app/sys/<id>/page.tsx` เคยเรนเดอร์ให้ระบบ ACCOUNT — ตอนนี้หน้านั้น redirect มาที่นี่แทน (hub เดียว)
export default async function AccountHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, systemId } = await requireAccountPage(id, "account.doc.view");
  return <AccountContent systemId={systemId} tenantId={tenantId} />;
}
