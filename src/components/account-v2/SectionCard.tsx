// การ์ด section ของฟอร์มเอกสาร (g1-invoice-form.png): หัวการ์ด "ชื่อ" + วงกลม ✓ ดำเมื่อครบ + action เสริม
// ยุบ/ขยายได้บนมือถือผ่าน <details> (g17-invoice-form.png) — desktop แสดงเปิดอยู่เสมอ ไม่โชว์ chevron
export function SectionCard({
  title,
  complete,
  actions,
  children,
  defaultOpen = true,
  testId,
}: {
  title: React.ReactNode;
  complete?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  return (
    <details open={defaultOpen} className="group card flex flex-col gap-0 p-0" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
        <span className="text-sm font-medium">{title}</span>
        <span className="flex items-center gap-3">
          {actions}
          {complete && (
            <span
              aria-label="ครบถ้วน"
              className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
              style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
            >
              ✓
            </span>
          )}
          <span className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180 md:hidden">▾</span>
        </span>
      </summary>
      <div className="flex flex-col gap-4 px-5 pb-5">{children}</div>
    </details>
  );
}

export default SectionCard;
