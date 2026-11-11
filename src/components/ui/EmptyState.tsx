import Link from "next/link";
// POS P4.1 ▸ R5: data-testid (ไม่บังคับ) ส่งต่อไปที่ลิงก์ action — ทะเบียนปุ่ม POS (F15.3) นับ testid ที่จุดเรียก · แบบเดียวกับ ModuleTabs (P1.17 U) ◂
type Props = { text: string; action?: { href: string; label: string }; "data-testid"?: string };
export function EmptyState({ text, action, "data-testid": testId }: Props) {
  return (
    <div className="card py-8 text-center">
      <p className="text-sm text-[color:var(--color-muted)]">{text}</p>
      {action && (
        <Link href={action.href} className="btn btn-ghost mt-3 text-sm" data-testid={testId} /* POS P4.1 ▸ R5 ◂ */>
          {action.label}
        </Link>
      )}
    </div>
  );
}
export default EmptyState;
