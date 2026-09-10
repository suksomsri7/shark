import { redirect } from "next/navigation";

// เส้นทางเดิม "รายชื่อสมาชิก" (v1 — ก่อน M1.5) — หน้ารวมสมาชิกตัวจริงย้ายไป `/member/members` แล้ว
// 🔴 คงไฟล์นี้ไว้เสมอ: ลิงก์เก่า/บุ๊กมาร์ก/ประวัติแชทของพนักงานอาจชี้มาที่นี่ ถ้าลบทิ้ง = 404 เงียบ ๆ
//    (ไม่ทิ้ง 2 หน้ารายชื่อพร้อมกันตามสัญญา M1.5 §3.3 — ดู nav.ts / wo-notes/member-M1.5.md)
export default async function MemberCustomersLegacyRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/sys/${id}/member/members`);
}
