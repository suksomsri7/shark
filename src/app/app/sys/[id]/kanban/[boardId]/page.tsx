import { redirect } from "next/navigation";

// เส้นทางเดิมของหน้าบอร์ด (ก่อน K1.5) — ย้ายไป `/kanban/b/{boardId}` แล้ว
// 🔴 คงไฟล์นี้ไว้ตลอด: ลิงก์ในแจ้งเตือน/บุ๊กมาร์ก/ประวัติแชทของพนักงานชี้มาที่นี่ ถ้าลบทิ้ง = 404 เงียบ ๆ
//    (หน้าบอร์ดเดิมยังอยู่ที่ `KanbanBoardView` ใน `src/lib/modules/kanban/ui.tsx` เผื่ออ้างอิง แต่ไม่มี route ชี้แล้ว)
export default async function KanbanBoardLegacyRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; boardId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, boardId }, query] = await Promise.all([params, searchParams]);
  const card = typeof query.card === "string" ? `?card=${encodeURIComponent(query.card)}` : "";
  redirect(`/app/sys/${id}/kanban/b/${boardId}${card}`);
}
