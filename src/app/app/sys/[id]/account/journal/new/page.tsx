import { redirect } from "next/navigation";
import { loadAccountSystem, accountPageGate } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";

// WO 6.2: การสร้าง JV ด้วยมือย้ายไปเป็น **modal** บนหน้าสมุดรายวัน (เฟรม g16-journal-modal.png)
// เส้นทางเดิม /journal/new ยังอยู่เพราะมีลิงก์ในเมนู (nav.ts) และบุ๊กมาร์กของผู้ใช้ — เด้งไปเปิด modal แทน
// ⚠️ ยังตรวจสิทธิ์ที่นี่ก่อนเด้ง (ด่านระดับ route ตาม guard.ts — ไม่ใช่แค่ซ่อนปุ่ม)
export default async function NewJvRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth } = await loadAccountSystem(id);
  accountPageGate(auth, "account.journal.adjust"); // SVC G2-F F2 ▸ ไม่มีสิทธิ์ ⇒ ไม่พบ (ไม่ใช่ 500) ◂
  assertAccountCan(auth, "account.journal.adjust");
  redirect(`/app/sys/${id}/account/journal?new=1`);
}
