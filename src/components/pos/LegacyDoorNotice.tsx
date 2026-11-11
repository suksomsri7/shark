// POS P2.14 ▸ LEG-2/4 มติ 1: แถบแจ้งบนหน้า POS เมื่อมาจากหน้าเดิมของร้านอาหาร (redirect ?from=legacy) — ข้อความอย่างเดียว ไม่มีปุ่ม ◂
export function LegacyDoorNotice({ text }: { text: string }) {
  return (
    <div role="status" data-testid="pos-legacy-door-notice" className="card mx-4 mt-4 max-w-2xl text-sm sm:mx-6">
      {text}
    </div>
  );
}
