"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  findActiveNav,
  type AccountNavFlyoutItem,
  type AccountNavGroup,
  type AccountNavItem,
} from "@/lib/modules/account/nav";
import { AccountIcon } from "./AccountIcon";

// แถบเมนูบัญชี V2 — 9 หมวด + dropdown 2 ระดับ (เดสก์ท็อป) / bottom sheet 2 ชั้น (มือถือ)
// ตาม DESIGN-SPEC-V2.md §1 + mockup f2/f4 (เดสก์ท็อป) + f12/g18 (มือถือ)
// เดสก์ท็อป/มือถือใช้ "แถวปุ่มหมวดเดียวกัน" (เลื่อนแนวนอนได้) ต่างกันแค่พฤติกรรมเมื่อกด (dropdown vs sheet)
// เพื่อให้ data-testid="acc-menu-<groupKey>" มีอยู่ในหน้าครั้งเดียว (ไม่ใช่ desktop+mobile ซ้อนกันสองชุด)
export function AccountTabBar({
  groups,
  base,
  counts,
}: {
  groups: AccountNavGroup[];
  base: string;
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const active = findActiveNav(pathname, base, groups);
  const activeKey = active?.group.key ?? null;

  const [openKey, setOpenKey] = useState<string | null>(null); // dropdown ระดับ 1 (เดสก์ท็อป) ที่เปิดอยู่ — click เป็นตัวเปิด/ปิดหลัก
  const [flyoutIdx, setFlyoutIdx] = useState<number | null>(null); // ระดับ 2 (เดสก์ท็อป) — index ใน group.items
  const [mobileGroupKey, setMobileGroupKey] = useState<string | null>(null); // sheet ระดับ 1 (มือถือ)
  const [mobileItemIdx, setMobileItemIdx] = useState<number | null>(null); // sheet ระดับ 2 (มือถือ)

  const rootRef = useRef<HTMLElement>(null);

  // ปิดทุกอย่างเมื่อเปลี่ยนหน้า
  useEffect(() => {
    setOpenKey(null);
    setFlyoutIdx(null);
    setMobileGroupKey(null);
    setMobileItemIdx(null);
  }, [pathname]);

  // ปิด dropdown เมื่อคลิกนอกแถบเมนู หรือกด Esc (ชั้นนอกสุด — ชั้น flyout จัดการ Esc ของตัวเองก่อนแล้วใน onKeyDown ของ dropdown)
  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenKey(null);
        setFlyoutIdx(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openKey]);

  const isDesktop = () =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

  const openGroup = groups.find((g) => g.key === openKey) ?? null;
  const mobileGroup = groups.find((g) => g.key === mobileGroupKey) ?? null;
  const mobileItem = mobileGroup && mobileItemIdx !== null ? mobileGroup.items[mobileItemIdx] : null;

  const closeDesktop = () => {
    setOpenKey(null);
    setFlyoutIdx(null);
  };
  const closeMobile = () => {
    setMobileGroupKey(null);
    setMobileItemIdx(null);
  };

  return (
    // 🔴 ห้ามใส่ overflow-* บน <nav> นี้เอง — dropdown/flyout เป็นลูกของมันโดยตรง (absolute + top-full)
    // ถ้า <nav> มี overflow-x (แม้ตั้งใจแค่แกน x) เบราว์เซอร์จะคำนวณ overflow-y เป็น auto ไปด้วยเสมอ (สเปก CSS
    // overflow: ถ้าค่าหนึ่งไม่ใช่ visible อีกค่าที่เป็น visible จะกลายเป็น auto) → dropdown ที่ล้นลงล่างโดนตัดเงียบ ๆ
    // (Fable QC รอบ 2: menu-flyout-desktop.png เห็นแค่ก้นพาเนล) — ย้าย overflow-x-auto ไปไว้ที่ div ในสุดแทน
    <nav
      ref={rootRef}
      data-testid="acc-tabbar"
      aria-label="เมนูบัญชี"
      className="relative border-b border-[color:var(--color-line)]"
    >
      <div className="flex gap-0 overflow-x-auto">
      {groups.map((g) => {
        const isActive = g.key === activeKey;
        const hasItems = g.items.length > 0;
        return (
          <div key={g.key} className="relative shrink-0">
            {hasItems ? (
              <button
                type="button"
                data-testid={`acc-menu-${g.key}`}
                aria-haspopup="menu"
                aria-expanded={openKey === g.key}
                className={`flex min-w-[64px] flex-col items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2.5 text-[11px] sm:flex-row sm:gap-1.5 sm:px-3.5 sm:py-3 sm:text-sm ${
                  isActive
                    ? "border-[color:var(--color-accent)] font-semibold text-[color:var(--color-ink)]"
                    : "border-transparent text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
                }`}
                // hover เปลี่ยนหมวดได้ "เฉพาะตอนมีเมนูเปิดค้างอยู่แล้ว" (จากคลิกก่อนหน้า) — กันบั๊ก:
                // ถ้าเปิดด้วย hover เสมอ คลิกแรกจะไปเจอ openKey ที่ hover ตั้งไว้ก่อนแล้ว → toggle เข้าใจว่า "เปิดอยู่" แล้วปิดทันที
                onMouseEnter={() => {
                  if (isDesktop() && openKey !== null && openKey !== g.key) {
                    setOpenKey(g.key);
                    setFlyoutIdx(null);
                  }
                }}
                onClick={() => {
                  if (isDesktop()) {
                    setOpenKey((k) => (k === g.key ? null : g.key));
                    setFlyoutIdx(null);
                  } else {
                    setMobileGroupKey(g.key);
                    setMobileItemIdx(null);
                  }
                }}
              >
                <AccountIcon name={g.icon} className="h-[18px] w-[18px]" />
                <span>{g.label}</span>
                <span aria-hidden className="hidden text-[10px] text-[color:var(--color-muted)] sm:inline">
                  ▾
                </span>
              </button>
            ) : (
              <Link
                href={g.href}
                data-testid={`acc-menu-${g.key}`}
                className={`flex min-w-[64px] flex-col items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2.5 text-[11px] sm:flex-row sm:gap-1.5 sm:px-3.5 sm:py-3 sm:text-sm ${
                  isActive
                    ? "border-[color:var(--color-accent)] font-semibold text-[color:var(--color-ink)]"
                    : "border-transparent text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
                }`}
              >
                <AccountIcon name={g.icon} className="h-[18px] w-[18px]" />
                <span>{g.label}</span>
              </Link>
            )}
          </div>
        );
      })}
      </div>

      {openGroup && (
        <DesktopDropdown group={openGroup} flyoutIdx={flyoutIdx} setFlyoutIdx={setFlyoutIdx} onClose={closeDesktop} counts={counts} />
      )}

      {mobileGroup && !mobileItem && (
        <MobileSheet level={1} title={mobileGroup.label} icon={mobileGroup.icon} onBack={undefined} onClose={closeMobile}>
          {mobileGroup.items.map((it, i) => (
            <MobileRow
              key={it.label}
              item={it}
              onOpen={() => (it.flyout && it.flyout.length > 0 ? setMobileItemIdx(i) : closeMobile())}
            />
          ))}
        </MobileSheet>
      )}

      {mobileGroup && mobileItem && (
        <MobileSheet
          level={2}
          title={mobileItem.label}
          crumb={mobileGroup.label}
          onBack={() => setMobileItemIdx(null)}
          onClose={closeMobile}
        >
          {(mobileItem.flyout ?? []).map((f) => (
            <FlyoutRow
              key={f.label}
              f={f}
              n={f.countKey ? counts?.[f.countKey] : undefined}
              onClick={closeMobile}
              mobile
              sep={f.label === "ดูทั้งหมด"}
            />
          ))}
        </MobileSheet>
      )}
    </nav>
  );
}

// ── เดสก์ท็อป: dropdown ระดับ 1 + flyout ระดับ 2 ──────────────────────────
function DesktopDropdown({
  group,
  flyoutIdx,
  setFlyoutIdx,
  onClose,
  counts,
}: {
  group: AccountNavGroup;
  flyoutIdx: number | null;
  setFlyoutIdx: (i: number | null) => void;
  onClose: () => void;
  counts?: Record<string, number>;
}) {
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => {
    itemRefs.current = [];
    setFocusIdx(0);
  }, [group.key]);

  const focusAt = (i: number) => {
    setFocusIdx(i);
    itemRefs.current[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = group.items.length;
    if (n === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusAt((focusIdx + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusAt((focusIdx - 1 + n) % n);
    } else if (e.key === "ArrowRight") {
      const it = group.items[focusIdx];
      if (it?.flyout && it.flyout.length > 0) {
        e.preventDefault();
        setFlyoutIdx(focusIdx);
      }
    } else if (e.key === "ArrowLeft") {
      if (flyoutIdx !== null) {
        e.preventDefault();
        setFlyoutIdx(null);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (flyoutIdx !== null) setFlyoutIdx(null);
      else onClose();
    }
  };

  const activeFlyout = flyoutIdx !== null ? group.items[flyoutIdx] : null;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- เมนูคีย์บอร์ดตาม SPEC §1 (↑↓→Esc)
    <div className="absolute left-0 top-full z-30 flex" onKeyDown={onKeyDown}>
      <div
        data-testid="acc-dropdown"
        role="menu"
        className="w-[264px] rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-1.5 shadow-[0_14px_34px_rgba(10,10,10,0.12)]"
      >
        {group.items.map((it, i) => (
          <div key={it.label}>
            {it.sep && <div className="my-1.5 h-px bg-[color:var(--color-line)]" />}
            <NavRow
              item={it}
              refCb={(el) => {
                itemRefs.current[i] = el;
              }}
              onMouseEnter={() => {
                if (it.flyout && it.flyout.length > 0) setFlyoutIdx(i);
                else setFlyoutIdx(null);
              }}
              onFocus={() => {
                setFocusIdx(i);
                if (it.flyout && it.flyout.length > 0) setFlyoutIdx(i);
                else setFlyoutIdx(null);
              }}
              onActivate={onClose}
            />
          </div>
        ))}
      </div>
      {activeFlyout && activeFlyout.flyout && activeFlyout.flyout.length > 0 && (
        <div
          data-testid="acc-flyout"
          className="ml-1.5 w-[240px] rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-1.5 shadow-[0_14px_34px_rgba(10,10,10,0.12)]"
        >
          {activeFlyout.flyout.map((f) => (
            <FlyoutRow
              key={f.label}
              f={f}
              n={f.countKey ? counts?.[f.countKey] : undefined}
              onClick={onClose}
              sep={f.label === "ดูทั้งหมด"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// แถวระดับ 1 — ไอคอนเส้นบาง + ลิงก์ไปหน้ารายการโดยตรง (มี flyout ก็ยังกดตรง ๆ ได้ ไม่ใช่แค่ hover) · soon = จาง + ป้าย "เร็ว ๆ นี้"
function NavRow({
  item,
  refCb,
  onMouseEnter,
  onFocus,
  onActivate,
}: {
  item: AccountNavItem;
  refCb: (el: HTMLElement | null) => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  onActivate: () => void;
}) {
  if (item.status === "soon") {
    return (
      <div
        data-testid={`acc-item-${item.testId}`}
        aria-disabled="true"
        className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm text-[color:var(--color-muted)] opacity-60"
      >
        <AccountIcon name={item.icon} className="h-4 w-4 text-[color:var(--color-muted)]" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="shrink-0 rounded-[5px] border border-[color:var(--color-line)] px-1.5 py-px text-[10.5px] text-[color:var(--color-muted)]">
          เร็ว ๆ นี้
        </span>
      </div>
    );
  }
  return (
    <Link
      ref={refCb as React.Ref<HTMLAnchorElement>}
      href={item.href}
      data-testid={`acc-item-${item.testId}`}
      role="menuitem"
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      onClick={onActivate}
      className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-[color:var(--color-surface-2)]"
    >
      <AccountIcon name={item.icon} className="h-4 w-4 text-[color:var(--color-muted)]" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.flyout && item.flyout.length > 0 && (
        <span aria-hidden className="shrink-0 text-[color:var(--color-muted)]">
          ›
        </span>
      )}
    </Link>
  );
}

// แถวระดับ 2 (flyout) — "+ สร้าง..." ขึ้นด้วย "+ " เรนเดอร์เป็นปุ่มดำ (ตาม SPEC §1) · ที่เหลือ = ลิงก์ปกติพร้อมตัวนับถ้ามี
function FlyoutRow({
  f,
  n,
  onClick,
  mobile,
  sep,
}: {
  f: AccountNavFlyoutItem;
  n?: number;
  onClick: () => void;
  mobile?: boolean;
  /** เส้นคั่นบาง ๆ เหนือแถวนี้ (g18: คั่นก่อน "ดูทั้งหมด") */
  sep?: boolean;
}) {
  const isCreate = f.label.startsWith("+ ");
  const isOverdue = f.label === "พ้นกำหนด";
  if (isCreate) {
    return (
      <Link
        href={f.href}
        onClick={onClick}
        className={`btn btn-primary mb-1 w-full text-sm ${mobile ? "h-11" : "h-9"}`}
      >
        {f.label}
      </Link>
    );
  }
  return (
    <>
      {sep && <div className="my-1 h-px bg-[color:var(--color-line)]" />}
      <Link
        href={f.href}
        onClick={onClick}
        className={`flex items-center gap-2 rounded-lg px-2.5 text-sm hover:bg-[color:var(--color-surface-2)] ${
          mobile ? "h-12" : "h-9"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{f.label}</span>
        {n !== undefined && (
          <span
            data-testid={f.countKey ? `acc-count-${f.countKey}` : undefined}
            className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs ${
              isOverdue
                ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]"
                : "border-[color:var(--color-line)] text-[color:var(--color-muted)]"
            }`}
          >
            {n}
          </span>
        )}
      </Link>
    </>
  );
}

// ── มือถือ: bottom sheet (ชั้น 1 = รายการในหมวด · ชั้น 2 = ทางลัดของรายการที่มี flyout) ──
function MobileSheet({
  level,
  title,
  icon,
  crumb,
  onBack,
  onClose,
  children,
}: {
  level: 1 | 2;
  title: string;
  icon?: string;
  crumb?: string;
  onBack?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={`acc-sheet-l${level}`} className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] pb-4 shadow-[0_-8px_30px_rgba(10,10,10,0.2)]">
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-[color:var(--color-line)]" />
        <div className="flex items-center gap-3 border-b border-[color:var(--color-line)] px-4 py-3">
          {level === 2 && onBack ? (
            <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className="text-lg text-[color:var(--color-muted)]">
              ‹
            </button>
          ) : icon ? (
            <AccountIcon name={icon} className="h-[22px] w-[22px]" />
          ) : null}
          <span className="flex-1 truncate text-base font-semibold">
            {crumb ? (
              <>
                <span className="font-normal text-[color:var(--color-muted)]">{crumb} · </span>
                {title}
              </>
            ) : (
              title
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดเมนู"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-0.5 px-2.5 py-2">{children}</div>
      </div>
    </div>
  );
}

// แถวระดับ 1 บน sheet มือถือ — สูง 48px ตาม SPEC §1 + ไอคอนเส้นบางเหมือนเดสก์ท็อป
function MobileRow({ item, onOpen }: { item: AccountNavItem; onOpen: () => void }) {
  if (item.status === "soon") {
    return (
      <div
        data-testid={`acc-item-${item.testId}`}
        aria-disabled="true"
        className="flex h-12 items-center gap-3 px-3 text-sm text-[color:var(--color-muted)] opacity-60"
      >
        <AccountIcon name={item.icon} className="h-[18px] w-[18px] text-[color:var(--color-muted)]" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="shrink-0 rounded-[5px] border border-[color:var(--color-line)] px-1.5 py-px text-[10.5px] text-[color:var(--color-muted)]">
          เร็ว ๆ นี้
        </span>
      </div>
    );
  }
  if (item.flyout && item.flyout.length > 0) {
    return (
      <button
        type="button"
        data-testid={`acc-item-${item.testId}`}
        onClick={onOpen}
        className="flex h-12 w-full items-center gap-3 px-3 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
      >
        <AccountIcon name={item.icon} className="h-[18px] w-[18px] text-[color:var(--color-muted)]" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span aria-hidden className="shrink-0 text-[color:var(--color-muted)]">
          ›
        </span>
      </button>
    );
  }
  return (
    <Link
      href={item.href}
      data-testid={`acc-item-${item.testId}`}
      onClick={onOpen}
      className="flex h-12 items-center gap-3 px-3 text-sm hover:bg-[color:var(--color-surface-2)]"
    >
      <AccountIcon name={item.icon} className="h-[18px] w-[18px] text-[color:var(--color-muted)]" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

export default AccountTabBar;
