// WO 1.2 — หน้ารายการใบสั่งซื้อสินทรัพย์ (APO)
// route ราคาถูก: ใช้ตัว render ร่วมของฝั่งรายจ่าย (ExpenseListPage) ตัวเดียวกับ /po, /asset-buy
// docType ตายตัวต่อ route (ไม่ต้องพึ่ง ?docType= อีก) · แท็บ/ฟอร์ม/ตัวลงบัญชี = ของเดิมทั้งหมด
import { requireAccountPage } from "@/lib/modules/account/guard";
import { ExpenseListPage } from "@/lib/modules/account/expense-page";
import { variantFor } from "@/lib/modules/account/expense";

const DOC_TYPE = "ASSET_PURCHASE_ORDER" as const;

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
  await requireAccountPage(id, "account.doc.view"); // WO 0.2/0.3: หน้าอ่านอย่างเดียว = doc.view (doc.create ครอบให้อยู่แล้ว)
  return <ExpenseListPage systemId={id} docType={DOC_TYPE} variant={variantFor(DOC_TYPE)} searchParams={sp} err={sp.err} />;
}
