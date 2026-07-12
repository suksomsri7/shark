import Link from "next/link";
type Props = { text: string; action?: { href: string; label: string } };
export function EmptyState({ text, action }: Props) {
  return (
    <div className="card py-8 text-center">
      <p className="text-sm text-[color:var(--color-muted)]">{text}</p>
      {action && (
        <Link href={action.href} className="btn btn-ghost mt-3 text-sm">
          {action.label}
        </Link>
      )}
    </div>
  );
}
export default EmptyState;
