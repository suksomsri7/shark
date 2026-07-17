// หน้าโหลดระหว่างเปลี่ยนหน้าในแอป (Next.js loading.tsx) — โผล่ทันทีตอนคลิก จนหน้าใหม่พร้อม
// ช่วย perceived performance: user เห็น feedback ทันที ไม่รู้สึกว่าค้าง
// ใช้ AI orb (วงแหวนหมุน) ตัวเดียวกับปุ่มผู้ช่วย — brand สม่ำเสมอ
export default function AppLoading() {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[color:var(--color-surface)]/60 backdrop-blur-[1px]">
      <div className="ai-orb-breathe relative h-12 w-12">
        <span aria-hidden className="ai-orb" />
      </div>
      <span className="sr-only">กำลังโหลด…</span>
    </div>
  );
}
