// HR H2.10 ▸ "เงินเดือน": สลิปของตัวเอง (รอบที่อนุมัติ/จ่ายแล้ว · ลิงก์ไปหน้าสลิปเดิม) · เบิกล่วงหน้า · ช่องหนังสือรับรอง (H3.8) ◂
import { requireTenant } from "@/lib/core/context";
import { myDocuments, selfActorOf } from "@/lib/modules/hr/self";
import { SelfEmpty, SelfPay } from "@/lib/modules/hr/self-ui";

export default async function MeHrPayPage() {
  const auth = await requireTenant();
  const docs = await myDocuments(selfActorOf(auth));
  if (!docs.ok) return <SelfEmpty />;
  return <SelfPay docs={docs} />;
}
