// HR H2.10 ▸ "ฉัน": ข้อมูลของตัวเอง (ชื่อ · ตำแหน่ง · สาขา · สถานะ) · วันลาคงเหลือ · บันทึกที่เปิดให้เห็น + รับทราบ (H4.4) ◂
import { requireTenant } from "@/lib/core/context";
import { myBalances, myDocuments, mySelf, selfActorOf } from "@/lib/modules/hr/self";
import { SelfEmpty, SelfProfile } from "@/lib/modules/hr/self-ui";
import { unlinkMyLineAction } from "@/lib/modules/hr/line-actions"; // HR H4.5 ◂
import { LineSelfCard } from "@/lib/modules/hr/line-ui"; // HR H4.5 ◂
import { issueMyLineCodeAction, myLineStatusAction } from "@/lib/platform/hr-line-actions"; // HR H4.5 ▸ ออกรหัสผูก (กาวแพลตฟอร์ม · ส่งเป็น prop — HR ไม่ import แพลตฟอร์ม) ◂

export default async function MeHrProfilePage() {
  const auth = await requireTenant();
  const a = selfActorOf(auth);
  const [self, docs, bal, line] = await Promise.all([mySelf(a), myDocuments(a), myBalances(a, {}), myLineStatusAction()]); // HR H4.5 ▸ + line (สถานะ + ชื่อ LINE ของตัวเอง จากกาวแพลตฟอร์ม · ตัวตนจาก session) ◂
  if (!self.ok || !docs.ok) return <SelfEmpty />;
  return (
    <>
      <SelfProfile self={self} docs={docs} balances={bal.ok ? bal.items : []} canWrite={self.active} />
      {line.ok && <LineSelfCard status={{ state: line.state, linkedAt: line.linkedAt, displayName: line.displayName, shopEnabled: line.shopEnabled }} canWrite={self.active} issueAction={issueMyLineCodeAction} unlinkAction={unlinkMyLineAction} />} {/* HR H4.5 ◂ */}
    </>
  );
}
