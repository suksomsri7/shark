import { redirect } from "next/navigation";

// หน้าเดิม "นำเข้า CSV" (v1) — M1.6 แทนที่ด้วยตัวนำเข้า 3 ขั้นที่ `/member/members/import`
// (mapping รวมฟิลด์กำหนดเอง · ตรวจแถวก่อนนำเข้า · ตัวเลือกซ้ำ 3 โหมด) → ส่งต่อไปที่นั่นเสมอ
// 🔴 ไม่ลบ `ui.tsx#MemberImportSection` / `import-actions.ts#importCustomersAction` เดิม — เผื่อโค้ดอื่นยังอ้างอยู่
//    (ดู wo-notes/member-M1.6.md หัวข้อ "ข้อตัดสิน")
export default async function MemberImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/sys/${id}/member/members/import`);
}
