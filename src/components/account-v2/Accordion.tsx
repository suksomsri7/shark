// Accordion มือถือ (g17-invoice-form.png): แถวหัวข้อ + ✓/เลขจำนวน + chevron ▾ กดยุบ/ขยาย — ใช้ <details> ล้วน ไม่ง้อ JS
export type AccordionItem = { key: string; title: React.ReactNode; badge?: React.ReactNode; content: React.ReactNode; defaultOpen?: boolean };

export function Accordion({ items, testId }: { items: AccordionItem[]; testId?: string }) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {items.map((it) => (
        <details key={it.key} open={it.defaultOpen} className="group rounded-lg border" data-testid={testId ? `${testId}-${it.key}` : undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-medium">
            <span className="flex items-center gap-2">
              {it.title}
              {it.badge}
            </span>
            <span className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t px-3 py-3">{it.content}</div>
        </details>
      ))}
    </div>
  );
}

export default Accordion;
