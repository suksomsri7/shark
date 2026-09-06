"use client";

import { useInApp } from "./use-in-app";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";

// drawer เมนูระบบ — เลื่อนออกจากซ้าย (จอเล็ก/แอป) หรือปักซ้ายถาวร (เว็บจอใหญ่)
// รวม "ระบบทั้งหมด" + ตั้งค่า + ระบบที่กำลังจะมา + เพิ่มระบบ + ออกจากระบบ
// nav item data ยังมาจาก layout (DB-driven) เหมือนเดิม — เปลี่ยนแค่การนำเสนอ
//
// B3 (T6/T7 · แบบ ledger/DESIGN-BRANDING.md §5, §7a):
//   · สีทั้งแถบมาจากโทเคนโทนแถบ `--nav-bg/--nav-fg/--nav-fg2/--nav-on` (โทน LIGHT = หน้าตาเดิม)
//   · หัวแถบ = โลโก้กิจการ + ชื่อกิจการ + ▾ (สลับ/แก้ชื่อ/เพิ่มกิจการ เหมือนเดิม)
//   · **รายการเมนู = 1 บรรทัดต่อระบบ** — ไม่มี accordion เมนูย่อยอีกแล้ว (เจ้าของ 6 ก.ย. รอบ 3:
//     แท็บย่อยอยู่ในหน้าหลักของระบบนั้นแล้ว · ทางลัดลึกใช้ค้นหา)
//     🔴 `NavItem.children` ยังถูกส่งมาจาก layout ต่อไปโดยตั้งใจ — มันคือ "ทะเบียนเส้นทางของระบบ"
//        ที่ `scripts/qc-nav-functions.mts` ใช้กันลิงก์ตาย (dead link) ทั้งแอป · ตัดทะเบียนทิ้ง =
//        ปิดตาข้อสอบตัวนั้นทันที ⇒ ตัดที่ "การนำเสนอ" ที่นี่ที่เดียว
//   · ปุ่ม ‹ ย่อแถบเป็นรางไอคอน (เฉพาะโหมดปักซ้าย) · ท้ายเมนูมี "แจ้งปัญหาการใช้งาน"

// group = หัวข้อคั่นก่อนรายการนี้ (ระบบที่เมนูยาวอย่างบัญชี จะได้ไม่เป็นลิสต์ยาวพืด)
export type NavChild = { href: string; label: string; group?: string };
export type NavItem = { key: string; href: string; icon: string; label: string; children?: NavChild[] };
export type SoonItem = { code: string; icon: string; label: string };
// กิจการ 1 แห่งใน account (สำหรับ dropdown สลับกิจการ)
export type TenantOption = { tenantId: string; name: string; role: string };

/** ตัวย่อ 2 ตัวอักษรจากชื่อกิจการ — ใช้เมื่อร้านยังไม่อัปตราสัญลักษณ์ (เหมือน Topbar) */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ป้ายตัวเลข "ยังไม่ได้อ่าน" ข้างชื่อระบบในเมนู — สีเดียวกับ badge ของปุ่มผู้ช่วย AI (AiDock)
// เจ้าของแจ้ง 29 ส.ค.: เดิมต้องเปิดเข้าหน้าแชทถึงจะรู้ว่ามีกี่ห้องค้าง (B9)
function NavBadge({ n }: { n: number }) {
  if (!n || n <= 0) return null;
  return (
    <span
      aria-label={`${n} รายการยังไม่ได้อ่าน`}
      className="ml-auto flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white"
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function NavDrawer({
  open,
  onClose,
  tenantName,
  userEmail,
  items,
  soon,
  onAddSystem,
  memberships,
  activeTenantId,
  badges,
  branding,
  navTone,
  onCollapse,
  onReportIssue,
  variant = "overlay",
  alwaysOverlay = false,
}: {
  open: boolean;
  /** ในแอปมือถือ (WebView UA SharkApp) ไม่มีแถบปักซ้ายให้ใช้ — overlay ต้องโผล่ทุกความกว้าง
   *  🔴 บั๊ก iPad แนวนอน (เจ้าของเจอ 6 ก.ย. build #24): จอกว้าง 1180 ≥ lg → `lg:hidden` ซ่อน overlay ทั้งที่ open=true
   *  กด ☰ แล้วไม่มีอะไรขึ้น */
  alwaysOverlay?: boolean;
  onClose: () => void;
  tenantName: string;
  userEmail: string;
  items: NavItem[];
  soon: SoonItem[];
  onAddSystem: () => void;
  memberships: TenantOption[];
  activeTenantId: string;
  /** ตัวเลขยังไม่ได้อ่านของแต่ละรายการเมนู — คีย์ = NavItem.key (เช่น `s-<systemId>` ของระบบแชท) */
  badges?: Record<string, number>;
  /** ตราสัญลักษณ์ + ชื่อที่แสดงของร้าน (จาก getBrandingTokens ผ่าน layout → AppShell) */
  branding: { displayName: string; logoUrl: string | null };
  /** โทนแถบเมนูที่ร้านเลือก — สีมาจาก CSS var ทั้งหมด · ใช้ตัดสินเฉพาะรูปแบบของ "รายการที่เลือก"/เส้นคั่น */
  navTone: "LIGHT" | "BRAND" | "DARK";
  /** ย่อแถบเต็มเป็นรางไอคอน (เฉพาะโหมดปักซ้าย — จำต่อผู้ใช้ที่ AppShell) */
  onCollapse?: () => void;
  /** เปิดแผ่น "แจ้งปัญหาการใช้งาน" — บนจอเล็กแถบบนไม่มีที่พอ จึงมาอยู่ท้ายเมนู (แบบ §5 ภาพ 04) */
  onReportIssue?: () => void;
  /**
   * overlay = เลื่อนออกมาทับจอ (มือถือ/แอป — เปิดจากปุ่มแฮมเบอร์เกอร์)
   * pinned  = ปักไว้ซ้ายจอถาวร ไม่มีฉากหลัง ไม่ปิดเมื่อกดลิงก์ (เว็บบนจอใหญ่ ≥ lg)
   */
  variant?: "overlay" | "pinned";
}) {
  const pathname = usePathname();
  // dropdown รายชื่อกิจการในหัว drawer — ปิดเมื่อกดสลับ/กดนอก
  const [tenantOpen, setTenantOpen] = useState(false);
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  // หมวดตั้งค่าพับเก็บได้ — เริ่มพับไว้ก่อน (คำสั่งเจ้าของ 24 ก.ค. — ลดความยาวเมนู)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // ชื่อที่เพิ่งแก้ (optimistic) — โชว์ทันทีไม่ต้องรอโหลดหน้าใหม่ · router.refresh ตามหลังเงียบ ๆ
  const [localNames, setLocalNames] = useState<Record<string, string>>({});
  const displayName = (t: TenantOption) => localNames[t.tenantId] ?? t.name;
  // ลิงก์ active = จุดเน้นด้วย --color-accent (ปุ่ม primary ยังเป็น ink)
  const isActive = (href: string) =>
    pathname === href || (href !== "/app" && pathname.startsWith(href + "/")) || pathname.startsWith(href);

  // ในแอปมือถือ: เมนูนี้เป็นเมนูเดียว (แอปปิดท่าสไลด์ของตัวเองแล้ว — เจ้าของสั่งรวมเมนู 6 ก.ย.)
  // ⇒ ต้องมีทางไป "ผู้ช่วย AI" (จอ native ของแอป) จากตรงนี้: ส่งสัญญาณ {ev:"open-ai"} ให้แอป
  const inApp = useInApp();
  const pinned = variant === "pinned";
  // แถวเมนู 1 ชุด — สีทั้งหมดมาจาก .nav-row/.nav-row-on ใน globals.css (โทนเปลี่ยน = แถวเปลี่ยนตาม)
  const row = (active: boolean) =>
    `nav-row flex items-center gap-2 rounded-lg px-2 py-2.5 ${active ? "nav-row-on" : ""}`;
  if (!pinned && !open) return null;

  return (
    <div
      className={
        pinned
          ? // ปักซ้ายใต้ topbar — โผล่เฉพาะจอ ≥ lg (จอเล็กใช้ overlay เหมือนเดิม)
            "fixed bottom-0 left-0 top-14 z-30 hidden w-72 lg:block"
          : // overlay: จอใหญ่ไม่ต้องใช้แล้ว (มีแถบปักซ้ายอยู่) — กันเมนูซ้อนกัน 2 ชั้นตอนย่อ/ขยายจอ
            // ยกเว้นในแอป (alwaysOverlay) ที่ไม่มีแถบปักซ้าย → ต้องโผล่แม้จอกว้าง (iPad แนวนอน)
            alwaysOverlay ? "fixed inset-0 z-50" : "fixed inset-0 z-50 lg:hidden"
      }
    >
      {/* ฉากหลังคลุมจอ แตะเพื่อปิด — โหมดปักซ้ายไม่มี */}
      {!pinned && <div className="absolute inset-0 bg-black/30" onClick={onClose} />}

      <aside
        /* จุดจับสำหรับ visual QC (WO-CV12 SH-8) = ตัวแผงเมนูเอง
           ⚠️ ทั้ง 2 โหมดใช้จุดจับเดียวกัน · ตัว overlay ถูกเรนเดอร์ก่อนใน AppShell และ
              **ไม่อยู่ในต้นไม้เลยเมื่อปิด** (`if (!pinned && !open) return null`)
              ⇒ ที่จอ < lg: ปิดอยู่ = เจอเฉพาะตัวปักซ้ายซึ่ง `hidden` · เปิดแล้ว = เจอ overlay เป็นตัวแรก */
        data-qc="app-drawer"
        data-nav-tone={navTone}
        className={
          pinned
            ? "flex h-full w-full flex-col overflow-y-auto"
            : "absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col overflow-y-auto shadow-[2px_0_12px_rgba(0,0,0,0.08)]"
        }
        style={{
          background: "var(--nav-bg)",
          color: "var(--nav-fg)",
          // เส้นคั่นเฉพาะโทนสว่าง — โทนสี/เข้มแยกตัวเองจากเนื้อหาด้วยสีอยู่แล้ว
          borderRight: navTone === "LIGHT" ? "1px solid var(--color-line)" : "none",
        }}
      >
        {/* หัว drawer — ชื่อกิจการ active + ปุ่ม ▾ เปิด dropdown สลับ/เพิ่มกิจการ (คำสั่งเจ้าของ) */}
        <div className="relative px-2 py-2">
          <button
            type="button"
            onClick={() => setTenantOpen((o) => !o)}
            className="nav-row flex w-full items-center gap-2.5 rounded-xl px-3 py-3"
          >
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- โลโก้อยู่บน CDN ของร้าน (โดเมนไม่คงที่)
              <img
                src={branding.logoUrl}
                alt=""
                width={34}
                height={34}
                className="h-[34px] w-[34px] shrink-0 rounded-lg object-contain"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg text-[12px] font-bold"
                // 🔴 โทน BRAND: พื้นแถบ = สีแบรนด์อยู่แล้ว ⇒ กล่องตัวย่อสีแบรนด์จะ "หายไปในพื้น"
                //    ใช้พื้นโปร่งของแถบ (--nav-on) แทน เพื่อให้เห็นกล่องทุกโทน
                style={
                  navTone === "BRAND"
                    ? { background: "var(--nav-on)", color: "var(--nav-fg)" }
                    : { background: "var(--color-accent)", color: "var(--color-accent-fg)" }
                }
              >
                {initialsOf(branding.displayName)}
              </span>
            )}
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[11px]" style={{ color: "var(--nav-fg2)" }}>
                กิจการ
              </span>
              <span className="block truncate text-base font-extrabold">
                {localNames[activeTenantId] ?? tenantName}
              </span>
            </span>
            <span className="shrink-0 text-lg font-bold">{tenantOpen ? "▴" : "▾"}</span>
          </button>
          {tenantOpen && (
            <>
              {/* คลุมหลัง dropdown แตะเพื่อปิด (ไม่ปิดทั้ง drawer) */}
              <div className="fixed inset-0 z-0" onClick={() => setTenantOpen(false)} />
              <div
                className="absolute left-2 right-2 z-10 mt-1 flex flex-col rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-lg"
                style={{ color: "var(--color-ink)" }}
              >
                {memberships.map((m) => {
                  const isCurrent = m.tenantId === activeTenantId;
                  // แถว active = โชว์ ✓ น้ำเงิน · กิจการอื่น = submit สลับกิจการ
                  return isCurrent ? (
                    <div key={m.tenantId} className="px-3 py-2 text-sm font-medium">
                      {renaming ? (
                        // แก้ชื่อกิจการ — GET /tenant/rename (pattern drawer: ห้าม server action)
                        <form
                          action="/tenant/rename"
                          method="get"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const input = e.currentTarget.elements.namedItem("name") as HTMLInputElement | null;
                            const newName = (input?.value ?? "").trim();
                            if (newName.length < 2) return;
                            setSaving(true);
                            // ยิงเบื้องหลัง — ไม่โหลดหน้าใหม่ (redirect: manual ไม่ตามไปโหลด /app)
                            fetch("/tenant/rename?to=" + m.tenantId + "&name=" + encodeURIComponent(newName), { redirect: "manual" })
                              .catch(() => {})
                              .finally(() => {
                                setLocalNames((p) => ({ ...p, [m.tenantId]: newName }));
                                setSaving(false);
                                setRenaming(false);
                                router.refresh(); // sync ชื่อจริงจาก server ตามหลังเงียบ ๆ
                              });
                          }}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="to" value={m.tenantId} />
                          <input
                            name="name"
                            defaultValue={displayName(m)}
                            minLength={2}
                            maxLength={80}
                            autoFocus
                            className="min-w-0 flex-1 rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-sm"
                          />
                          <button type="submit" disabled={saving} className="shrink-0 rounded-lg bg-[color:var(--color-accent)] px-2 py-1 text-xs text-white disabled:opacity-60">
                            {saving ? "กำลังบันทึก…" : "บันทึก"}
                          </button>
                          <button type="button" onClick={() => setRenaming(false)} className="shrink-0 text-xs text-[color:var(--color-muted)]">
                            ยกเลิก
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">{displayName(m)}</span>
                          {m.role === "OWNER" && (
                            <button
                              type="button"
                              onClick={() => setRenaming(true)}
                              aria-label="แก้ไขชื่อกิจการ"
                              title="แก้ไขชื่อกิจการ"
                              className="shrink-0 text-[color:var(--color-muted)] hover:text-[color:var(--color-accent)]"
                            >
                              ✎
                            </button>
                          )}
                          <span className="shrink-0 text-[color:var(--color-accent)]">✓</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <a
                      key={m.tenantId}
                      href={"/tenant/switch?to=" + m.tenantId}
                      className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                    >
                      <span className="min-w-0 flex-1 truncate">{displayName(m)}</span>
                    </a>
                  );
                })}
                <div className="my-1 border-t" />
                <Link
                  href="/onboarding?add=1"
                  onClick={() => {
                    setTenantOpen(false);
                    onClose();
                  }}
                  className="px-3 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)]"
                >
                  + เพิ่มกิจการ
                </Link>
              </div>
            </>
          )}
        </div>

        <nav className="flex flex-col gap-0.5 px-2 text-sm">
          <Link href="/app" onClick={onClose} className={row(pathname === "/app")}>
            <NavIcon emoji="🏠" />
            <span className="truncate">หน้าหลัก</span>
          </Link>

          {items.length > 0 && (
            <div className="px-2 pb-1 pt-3 text-xs" style={{ color: "var(--nav-fg2)" }}>
              ระบบทั้งหมด
            </div>
          )}
          {/* 1 บรรทัดต่อระบบ — `it.children` (ทะเบียนเส้นทางของ qc-nav-functions) ไม่ถูกนำมาแสดงอีกแล้ว */}
          {items.map((it) => (
            <Link key={it.key} href={it.href} onClick={onClose} className={row(isActive(it.href))}>
              <NavIcon emoji={it.icon} />
              <span className="min-w-0 truncate">{it.label}</span>
              <NavBadge n={badges?.[it.key] ?? 0} />
            </Link>
          ))}

          {inApp && (
            <button
              type="button"
              onClick={() => {
                onClose();
                (window as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView?.postMessage(
                  JSON.stringify({ ev: "open-ai" }),
                );
              }}
              className={`${row(false)} w-full text-left`}
            >
              <span className="grid h-6 w-6 place-items-center text-base leading-none">✨</span>
              <span className="min-w-0 truncate">ผู้ช่วย AI</span>
            </button>
          )}

          <div className="my-2 h-px" style={{ background: "var(--nav-fg2)", opacity: 0.25 }} />
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="nav-row flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs"
            style={{ color: "var(--nav-fg2)" }}
          >
            <span>ตั้งค่า</span>
            <span>{settingsOpen ? "▴" : "▾"}</span>
          </button>
          {settingsOpen && [
            // B2 (ledger/BRANDING-RUN.md) — เดิมเป็นหน้ากำพร้าไม่มีลิงก์ในเมนูเลย (แพตเทิร์นเดียวกับ webhooks/staff ที่เคยพลาด)
            { href: "/app/settings/branding", icon: "🎨", label: "ตราสินค้าและธีม" },
            { href: "/app/settings/credit", icon: "⚡", label: "เครดิต AI" },
            { href: "/app/marketplace", icon: "🧩", label: "ตลาดเทมเพลต" },
            { href: "/app/reports", icon: "📊", label: "รายงาน" },
            { href: "/app/forms", icon: "📝", label: "ฟอร์ม" },
            { href: "/app/notifications", icon: "🔔", label: "ศูนย์แจ้งเตือน" },
            { href: "/app/approvals", icon: "✅", label: "รออนุมัติของฉัน" },
            // 31 ส.ค. — เจ้าของบอกว่า "ขาดฟังก์ชันลบระบบ ลบกิจการ" · ของอยู่หน้านี้ แต่เมนูไม่เคยชี้มา
            { href: "/app/settings/systems", icon: "🧱", label: "จัดการระบบ (เพิ่ม/เอาออก)" },
            // 31 ส.ค. — WO-CW2: หน้าจัดการผู้ใช้งานหน้าแรกของระบบ · ต้องมีลิงก์ตั้งแต่วันแรก
            // (บทเรียน 29 ส.ค.: /app/settings/webhooks เป็นหน้ากำพร้าอยู่หลายเดือนเพราะไม่มีลิงก์)
            { href: "/app/settings/staff", icon: "👥", label: "ผู้ใช้งานและสิทธิ์" },
            { href: "/app/settings/connections", icon: "🔗", label: "สาขาและการเชื่อมระบบ" },
            { href: "/app/settings/approval", icon: "🧾", label: "สายอนุมัติ" },
            { href: "/app/settings/automation", icon: "⚙️", label: "ระบบอัตโนมัติ" },
            { href: "/app/settings/payment", icon: "💳", label: "ช่องรับเงิน" },
            { href: "/app/settings/domain", icon: "🌐", label: "โดเมนของร้าน" },
            { href: "/app/settings/api", icon: "🔑", label: "API สำหรับนักพัฒนา" },
            // 29 ส.ค. 2026 — หน้านี้มีมาตั้งแต่ WO-0062 แต่ **ไม่เคยมีลิงก์ในเมนูเลย** เป็นหน้ากำพร้า
            // เจ้าของหาไม่เจอตอนจะตั้ง webhook ให้ SiamDive รับ "ทีมตอบแล้ว" (WO-C6)
            { href: "/app/settings/webhooks", icon: "🪝", label: "Webhooks (แจ้งระบบอื่น)" },
            { href: "/app/settings/billing", icon: "🧾", label: "บิลจากแพลตฟอร์ม" },
            { href: "/app/audit", icon: "🕓", label: "ประวัติการแก้ไข" },
            { href: "/app/settings/privacy", icon: "🔒", label: "ความเป็นส่วนตัว (PDPA)" },
            // K1.14 — ค่าที่เป็นของ "คน" ไม่ใช่ของ "ร้าน" (ปุ่มลัดคีย์บอร์ดของบอร์ดงาน)
            { href: "/app/settings/preferences", icon: "🎛️", label: "การตั้งค่าส่วนตัว" },
          ].map((s) => (
            <Link key={s.href} href={s.href} onClick={onClose} className={row(isActive(s.href))}>
              <NavIcon emoji={s.icon} />
              <span className="truncate">{s.label}</span>
            </Link>
          ))}

          {soon.length > 0 && (
            <>
              <div className="my-2 h-px" style={{ background: "var(--nav-fg2)", opacity: 0.25 }} />
              <div className="px-2 pb-1 text-xs" style={{ color: "var(--nav-fg2)" }}>
                กำลังจะมา
              </div>
              {soon.map((s) => (
                <div
                  key={s.code}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs opacity-45"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <NavIcon emoji={s.icon} className="h-4 w-4" /> {s.label}
                  </span>
                  <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]">เร็วๆ นี้</span>
                </div>
              ))}
            </>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-4 pb-4 pt-3">
          {/* แจ้งปัญหาการใช้งาน — บนจอเล็ก/ในแอปไม่มีที่บนแถบบน (T7) ⇒ อยู่ท้ายเมนู (แบบ ภาพ 04) */}
          {onReportIssue && !pinned && (
            <button
              type="button"
              data-testid="nav-report-issue"
              onClick={() => {
                onClose();
                onReportIssue();
              }}
              className="nav-row -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm"
            >
              <span className="grid h-6 w-6 place-items-center text-base leading-none">🛠️</span>
              <span className="min-w-0 truncate">แจ้งปัญหาการใช้งาน</span>
            </button>
          )}
          <div className="mb-1 h-px" style={{ background: "var(--nav-fg2)", opacity: 0.25 }} />
          <div className="pt-1">
            {/* เปิด Modal เพิ่มระบบกลางจอ (ไม่ navigate ไปหน้า settings — คง flow อยู่ในหน้าเดิม)
                🔴 ปุ่ม "กลับสี" ตามแบบ §5: โทนสี/เข้ม = พื้นเป็นสีตัวอักษรของแถบ (ขาว) ตัวอักษรเป็นสีแถบ ·
                   โทนสว่าง = สีแบรนด์บนพื้นสว่างเหมือนเดิม (ปุ่มขาวบนพื้นขาวจะหายไป) */}
            <button
              type="button"
              onClick={onAddSystem}
              className="flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2.5 text-sm font-medium hover:opacity-90"
              style={
                navTone === "LIGHT"
                  ? { background: "var(--color-accent)", color: "var(--color-accent-fg)" }
                  : { background: "var(--nav-fg)", color: "var(--nav-bg)" }
              }
            >
              + เพิ่มระบบ
            </button>
          </div>
          {/* อีเมล + ออกจากระบบ — โชว์เสมอ (ฝั่งแอป native intercept logout เอง) */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="min-w-0 truncate text-xs" style={{ color: "var(--nav-fg2)" }}>
              {userEmail}
            </span>
            <a href="/logout" className="shrink-0 text-xs underline" style={{ color: "var(--nav-fg2)" }}>
              ออกจากระบบ
            </a>
            {/* ‹ ย่อแถบเต็มเป็นรางไอคอน 56px — จำต่อผู้ใช้ (preferences.navCollapsed) */}
            {pinned && onCollapse && (
              <button
                type="button"
                data-testid="nav-collapse"
                onClick={onCollapse}
                title="ย่อแถบเมนู"
                aria-label="ย่อแถบเมนู"
                className="nav-row grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                style={{ color: "var(--nav-fg2)" }}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m14.5 5-7 7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
