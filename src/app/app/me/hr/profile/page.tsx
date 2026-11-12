// HR H2.10 ▸ "ฉัน": ข้อมูลของตัวเอง (ชื่อ · ตำแหน่ง · สาขา · สถานะ) · วันลาคงเหลือ · บันทึกที่เปิดให้เห็น + รับทราบ (H4.4) ◂
import { requireTenant } from "@/lib/core/context";
import { myBalances, myDocuments, mySelf, selfActorOf } from "@/lib/modules/hr/self";
import { SelfEmpty, SelfProfile } from "@/lib/modules/hr/self-ui";

export default async function MeHrProfilePage() {
  const auth = await requireTenant();
  const a = selfActorOf(auth);
  const [self, docs, bal] = await Promise.all([mySelf(a), myDocuments(a), myBalances(a, {})]);
  if (!self.ok || !docs.ok) return <SelfEmpty />;
  return <SelfProfile self={self} docs={docs} balances={bal.ok ? bal.items : []} canWrite={self.active} />;
}
