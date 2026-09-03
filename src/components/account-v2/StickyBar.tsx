// แถบปุ่มท้ายฟอร์ม sticky ล่างจอ (g17-invoice-form.png: "บันทึกร่าง" ghost · ปุ่มดำหลัก flex-1 · "⋯" สี่เหลี่ยมมน)
export function StickyBar({ secondary, primary, more, testId }: { secondary?: React.ReactNode; primary: React.ReactNode; more?: React.ReactNode; testId?: string }) {
  return (
    <div
      className="sticky bottom-0 left-0 right-0 flex items-center gap-2 border-t bg-[color:var(--color-surface)] px-4 py-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      data-testid={testId}
    >
      {secondary}
      <div className="flex-1">{primary}</div>
      {more}
    </div>
  );
}

export default StickyBar;
