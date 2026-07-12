import Link from "next/link";
type Props = { tabs: { key: string; label: string; href: string }[]; active: string };
export function TabPills({ tabs, active }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className="rounded-full border px-3 py-1.5 text-sm"
          style={t.key === active ? { background: "var(--color-ink)", color: "var(--color-surface)" } : undefined}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
export default TabPills;
