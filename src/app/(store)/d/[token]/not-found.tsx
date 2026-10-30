// SVC D.9 ▸ 404 ของพอร์ทัลผู้เช่า — เนื้อเดียวทุกกรณีล้ม (ลิงก์ผิด/หมดอายุ/สัญญาจบ/บิลไม่ใช่ของสัญญา · X7)
export default function DormPortalNotFound() {
  return (
    <main className="min-h-dvh bg-[#fafafa] px-4 py-10">
      <p className="mx-auto max-w-[480px] rounded-2xl border border-[#e5e5e5] bg-white p-5 text-center text-[15px] text-[#404040]">
        ไม่พบหน้านี้ หรือลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่จากหอทางแชท LINE
      </p>
    </main>
  );
}
