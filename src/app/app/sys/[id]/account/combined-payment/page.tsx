// WO 1.7 — หน้ารายการใบรวมจ่าย (CP · §3 แถว "ใบรวมจ่าย")
// ใช้ตัว render ร่วมของฝั่งรายจ่าย (ExpenseListPage) เหมือน route ราคาถูกของ WO 1.2
// ปุ่ม "+ สร้างใบรวมจ่าย" ชี้ฟอร์มพิเศษ §5.2 K (`combined-payment/new`) ไม่ใช่ DocEditorV2 ปกติ
import { requireAccountPage } from "@/lib/modules/account/guard";
import { ExpenseListPage } from "@/lib/modules/account/expense-page";
import { variantFor } from "@/lib/modules/account/expense";

const DOC_TYPE = "COMBINED_PAYMENT" as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    q?: string;
    page?: string;
    size?: string;
    contact?: string;
    preset?: string;
    from?: string;
    to?: string;
    sort?: string;
    err?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireAccountPage(id, "account.doc.view");
  return <ExpenseListPage systemId={id} docType={DOC_TYPE} variant={variantFor(DOC_TYPE)} searchParams={sp} err={sp.err} />;
}
