// การ์ดของหน้าหลัก V2 ที่ "ย่อ/ขยาย" คุมได้ (DashCollapseToggle.tsx) — <details> จริงของเบราว์เซอร์
// เหมือน SectionCard.tsx (ฟอร์มเอกสาร) แต่ไม่มีวงกลม ✓ ครบถ้วน (ไม่เกี่ยวกับฟอร์ม) — server component ล้วน
export function DashBlock({
  title,
  actions,
  children,
  defaultOpen,
  testId,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen: boolean;
  testId?: string;
}) {
  return (
    <details
      open={defaultOpen}
      data-dash-collapsible="1"
      data-testid={testId}
      className="group card flex min-w-0 flex-col gap-0 p-0"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="flex items-center gap-2">
          {actions}
          <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <div className="flex min-w-0 flex-col gap-3 px-5 pb-5">{children}</div>
    </details>
  );
}

export default DashBlock;
