import Link from "next/link";
import { EmptyState } from "./EmptyState";

// รายการมาตรฐาน (แถว rounded border) — ใช้ทั่วแอปแทน markup ก๊อป
type Item = {
  key: string;
  href?: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
};

const rowCls =
  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm";

export function DataList({ items, empty }: { items: Item[]; empty: string }) {
  if (items.length === 0) return <EmptyState text={empty} />;
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => {
        const body = (
          <>
            <div className="min-w-0">
              <div className="truncate">{it.primary}</div>
              {it.secondary && (
                <div className="truncate text-xs text-[color:var(--color-muted)]">{it.secondary}</div>
              )}
            </div>
            {it.trailing && (
              <div className="flex shrink-0 items-center gap-2 text-right">{it.trailing}</div>
            )}
          </>
        );
        return it.href ? (
          <Link key={it.key} href={it.href} className={`${rowCls} hover:bg-[color:var(--color-surface-2)]`}>
            {body}
          </Link>
        ) : (
          <div key={it.key} className={rowCls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

// ตารางคอลัมน์จริง (ledger/รายงาน) — ห่อ overflow-x-auto เสมอ
type Col<T> = { key: string; header: string; align?: "left" | "right"; render: (row: T) => React.ReactNode };
export function DataTable<T>({
  cols,
  rows,
  minWidth = 560,
  empty,
  rowKey,
}: {
  cols: Col<T>[];
  rows: T[];
  minWidth?: number;
  empty: string;
  rowKey: (row: T, i: number) => string;
}) {
  if (rows.length === 0) return <EmptyState text={empty} />;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`border-b px-3 pb-2 pt-2 text-xs font-medium text-[color:var(--color-muted)] ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`border-b border-[color:var(--color-line)] px-3 py-2 text-sm ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataList;
