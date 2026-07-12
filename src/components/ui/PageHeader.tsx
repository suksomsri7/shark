import Link from "next/link";
type Props = {
  title: string;
  back?: { href: string; label: string };
  desc?: string;
  actions?: React.ReactNode;
};
export function PageHeader({ title, back, desc, actions }: Props) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        {back && (
          <Link href={back.href} className="text-sm text-[color:var(--color-muted)]">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold">{title}</h1>
        {desc && <p className="text-sm text-[color:var(--color-muted)]">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export default PageHeader;
