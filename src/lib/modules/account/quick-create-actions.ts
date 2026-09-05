"use server";

// quick-create-actions.ts — server action ของแผง "สร้างด่วน" (⌘K, WO 9.4 §0.3 ข้อ 3)
// เฉพาะส่วนที่ต้องอ่าน DB (เอกสารล่าสุด) — ตัวแปลข้อความ+ค้นหาผู้ติดต่อ (searchContactsAction มีอยู่แล้วจาก
// editor-actions.ts WO 1.3/7.2) ไม่ต้องเขียนซ้ำ · เรียกแบบ on-demand ตอนเปิดแผงเท่านั้น (ไม่กระทบงบ query
// ของหน้าอื่นที่ตรวจอยู่แล้วใน qc-acc-v2-perf — ดู WO 9.3)
import { loadAccountSystem } from "./guard";
import { assertAccountCan } from "./access";
import { recentDocuments } from "./dashboard";

export type QuickCreateRecentDoc = {
  id: string;
  docType: string;
  docTypeLabel: string;
  docNo: string | null;
  contactName: string;
  grandTotal: number;
  statusLabel: string;
};

/** เอกสารล่าสุด 5 ใบ (ทั้ง 2 ฝั่ง) — สิทธิ์เดียวกับหน้าหลัก/หน้ารายการ (account.doc.view — อ่านอย่างเดียว) */
export async function quickCreateRecentDocsAction(systemId: string): Promise<QuickCreateRecentDoc[]> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.view");
  const rows = await recentDocuments({ tenantId, systemId }, 5);
  return rows.map((r) => ({
    id: r.id,
    docType: r.docType,
    docTypeLabel: r.docTypeLabel,
    docNo: r.docNo,
    contactName: r.contactName,
    grandTotal: r.grandTotal,
    statusLabel: r.statusLabel,
  }));
}
