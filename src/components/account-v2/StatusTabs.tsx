"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buildHref, type QueryLike } from "./url";

export type StatusTabTone = "muted" | "strong" | "danger";
export type StatusTabDef = {
  key: string;
  label: string;
  tone?: StatusTabTone;
  /** WO 7.1 round 2 (f9-documents.png): "pill" = ตัวเลขในวงกลมดำตัวหนังสือขาว (ไม่ขึ้นกับว่าแท็บ active อยู่ไหม)
   *  ไม่ส่ง = ตัวเลขธรรมดาต่อท้ายป้าย (พฤติกรรมเดิมทุกหน้า ไม่กระทบ) */
  badge?: "pill";
};
// นับต่อแท็บ — ยอมรับ record ทั่วไป (DocTabCounts เข้ากันได้ตรง ๆ เพราะเป็น Partial<Record<string, number>>)
export type TabCounts = Partial<Record<string, number>>;

// แถบสถานะเอกสาร (§1, §3 DESIGN-SPEC-V2)
// เดสก์ท็อป (f3): เลื่อนแนวนอนได้เมื่อยาว + ลูกศร › ท้ายแถบเมื่อล้น · active = ตัวหนา + ขีดล่าง accent 2px
// มือถือ (f13): pill ชิป เลื่อนแนวนอน · active = พื้นดำตัวหนังสือขาว (ไม่ใช่ขีดเส้นใต้)
export function StatusTabs({
  tabs,
  counts,
  active,
  paramKey = "tab",
  testId,
}: {
  tabs: StatusTabDef[];
  counts: TabCounts;
  active: string;
  paramKey?: string;
  testId?: string;
}) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const current: QueryLike = searchParams ?? new URLSearchParams();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  const hrefFor = (key: string) => buildHref(pathname, current, { [paramKey]: key, page: undefined });
  const countTestId = (key: string) => `tab-${key}-count`;

  return (
    // min-w-0: กัน overflow เมื่อ StatusTabs อยู่เป็น flex item ในแถวเดียวกับปุ่มอื่น (เช่น list/grid toggle
    // ของ WO 7.1) — ค่าเริ่มต้นของ flex item คือ min-width:auto (ไม่ยอมหดต่ำกว่าความกว้างเนื้อหา) ทำให้แถบเลื่อน
    // แนวนอนของแท็บ (มือถือ) ดัน parent ให้กว้างเกิน viewport แทนที่จะ scroll ในตัวเอง — WO 7.1 round 2
    <div className="min-w-0" data-testid={testId}>
      {/* เดสก์ท็อป (f3): ขีดเส้นใต้ */}
      <div className="relative hidden md:block">
        <div ref={scrollerRef} className="flex gap-4 overflow-x-auto pb-px" role="tablist">
          {tabs.map((t) => {
            const isActive = t.key === active;
            const count = counts[t.key];
            const color =
              t.tone === "danger" ? "var(--color-danger)" : isActive ? "var(--color-ink)" : "var(--color-muted)";
            return (
              <Link
                key={t.key}
                href={hrefFor(t.key)}
                role="tab"
                aria-selected={isActive}
                data-testid={testId ? `${testId}-${t.key}` : undefined}
                className="shrink-0 whitespace-nowrap pb-2 text-sm"
                style={{
                  color,
                  fontWeight: isActive ? 600 : 400,
                  borderBottom: isActive ? "2px solid var(--color-accent)" : "2px solid transparent",
                }}
              >
                {t.label}
                {typeof count === "number" &&
                  (t.badge === "pill" ? (
                    <span
                      className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold"
                      style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
                      data-testid={countTestId(t.key)}
                    >
                      {count}
                    </span>
                  ) : (
                    <span className="ml-1" data-testid={countTestId(t.key)}>
                      {count}
                    </span>
                  ))}
              </Link>
            );
          })}
        </div>
        {overflowing && (
          <button
            type="button"
            aria-label="เลื่อนดูแท็บถัดไป"
            className="absolute right-0 top-0 flex h-full items-center bg-gradient-to-l from-[color:var(--color-surface)] px-2 text-[color:var(--color-muted)]"
            onClick={() => scrollerRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
          >
            ›
          </button>
        )}
      </div>

      {/* มือถือ (f13): pill ชิป — active พื้นดำตัวหนังสือขาว */}
      <div className="flex gap-2 overflow-x-auto pb-1 md:hidden" role="tablist">
        {tabs.map((t) => {
          const isActive = t.key === active;
          const count = counts[t.key];
          return (
            <Link
              key={t.key}
              href={hrefFor(t.key)}
              role="tab"
              aria-selected={isActive}
              data-testid={testId ? `${testId}-${t.key}-m` : undefined}
              className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm"
              style={
                isActive
                  ? { background: "var(--color-ink)", color: "var(--color-surface)", borderColor: "var(--color-ink)" }
                  : {
                      color: t.tone === "danger" ? "var(--color-danger)" : "var(--color-ink)",
                      borderColor: t.tone === "danger" ? "var(--color-danger)" : "var(--color-line)",
                    }
              }
            >
              {t.label}
              {typeof count === "number" &&
                (t.badge === "pill" ? (
                  <span
                    className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold"
                    style={
                      isActive
                        ? { background: "var(--color-surface)", color: "var(--color-ink)" }
                        : { background: "var(--color-ink)", color: "var(--color-surface)" }
                    }
                    data-testid={`${countTestId(t.key)}-m`}
                  >
                    {count}
                  </span>
                ) : (
                  <span className="ml-1" data-testid={`${countTestId(t.key)}-m`}>
                    {count}
                  </span>
                ))}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default StatusTabs;
