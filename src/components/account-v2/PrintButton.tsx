"use client";

// ปุ่ม "พิมพ์รายงาน" ใช้ได้จริง (window.print()) — WO 3.2 รอบแก้ 2: Fable สั่งห้ามจางถ้าไม่มีปลายทาง
// ใช้พิมพ์หน้าปัจจุบันตามตัวกรอง/หน้าที่กำลังดูอยู่จริง แทนการรอหน้ารายงานเฉพาะที่ยังไม่มี
export function PrintButton({ className = "btn-sm", testId }: { className?: string; testId?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()} data-testid={testId ?? "btn-print-report"}>
      พิมพ์รายงาน
    </button>
  );
}

export default PrintButton;
