"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";

// drawer เมนูระบบ — เลื่อนออกจากซ้าย เปิดจากปุ่มแฮมเบอร์เกอร์บน topbar
// รวม "ระบบทั้งหมด" (grid เดิมที่ย้ายมาจากหน้า /app) + ระบบที่กำลังจะมา + เพิ่มระบบ + ออกจากระบบ
// nav item data ยังมาจาก layout (DB-driven) เหมือนเดิม — เปลี่ยนแค่การนำเสนอ

// group = หัวข้อคั่นก่อนรายการนี้ (ระบบที่เมนูยาวอย่างบัญชี จะได้ไม่เป็นลิสต์ยาวพืด)
export type NavChild = { href: string; label: string; group?: string };
export type NavItem = { key: string; href: string; icon: string; label: string; children?: NavChild[] };
export type SoonItem = { code: string; icon: string; label: string };
// กิจการ 1 แห่งใน account (สำหรับ dropdown สลับกิจการ)
export type TenantOption = { tenantId: string; name: string; role: string };

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

// ระบบที่แตกฟังก์ชันย่อย — หัวข้อกดพับ/กาง (accordion) + ลิงก์ฟังก์ชันย่อยใต้ระบบ
// auto-กาง เมื่ออยู่ในฟังก์ชันย่อยของระบบนั้น · ฟังก์ชัน active = เทียบ path ตรงตัว
function NavGroup({ item, onNavigate, badge = 0 }: { item: NavItem; onNavigate: () => void; badge?: number }) {
  const pathname = usePathname();
  const children = item.children ?? [];
  const anyActive = children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
  const [open, setOpen] = useState(anyActive);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
          anyActive ? "font-medium" : ""
        }`}
      >
        <NavIcon emoji={item.icon} />
        <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
        <NavBadge n={badge} />
        <span className="shrink-0 text-xs text-[color:var(--color-muted)]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="ml-3.5 flex flex-col gap-0.5 border-l pl-2">
          {children.map((c) => (
            <div key={c.href} className="flex flex-col">
              {c.group && (
                <span className="mt-1.5 px-2 py-1 text-[11px] font-medium text-[color:var(--color-muted)]">
                  {c.group}
                </span>
              )}
              <Link
                href={c.href}
                onClick={onNavigate}
                className={`rounded-lg px-2 py-2 text-sm hover:bg-[color:var(--color-surface-2)] ${
                  pathname === c.href ? "font-medium text-[color:var(--color-accent)]" : ""
                }`}
              >
                {c.label}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
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
  variant = "overlay",
}: {
  open: boolean;
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

  const pinned = variant === "pinned";
  if (!pinned && !open) return null;

  return (
    <div
      className={
        pinned
          ? // ปักซ้ายใต้ topbar — โผล่เฉพาะจอ ≥ lg (จอเล็กใช้ overlay เหมือนเดิม)
            "fixed bottom-0 left-0 top-14 z-30 hidden w-72 border-r border-[color:var(--color-border)] lg:block"
          : // overlay: จอใหญ่ไม่ต้องใช้แล้ว (มีแถบปักซ้ายอยู่) — กันเมนูซ้อนกัน 2 ชั้นตอนย่อ/ขยายจอ
            "fixed inset-0 z-50 lg:hidden"
      }
    >
      {/* ฉากหลังคลุมจอ แตะเพื่อปิด — โหมดปักซ้ายไม่มี */}
      {!pinned && <div className="absolute inset-0 bg-black/30" onClick={onClose} />}

      <aside
        className={
          pinned
            ? "flex h-full w-full flex-col overflow-y-auto bg-[color:var(--color-surface)]"
            : "absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col overflow-y-auto bg-[color:var(--color-surface)] shadow-[2px_0_12px_rgba(0,0,0,0.08)]"
        }
      >
        {/* หัว drawer — ชื่อกิจการ active + ปุ่ม ▾ เปิด dropdown สลับ/เพิ่มกิจการ (คำสั่งเจ้าของ) */}
        <div className="relative px-2 py-2">
          <button
            type="button"
            onClick={() => setTenantOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-3"
          >
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] text-[color:var(--color-muted)]">กิจการ</span>
              <span className="block truncate text-xl font-extrabold">{localNames[activeTenantId] ?? tenantName}</span>
            </span>
            <span className="shrink-0 text-lg font-bold text-[color:var(--color-accent)]">{tenantOpen ? "▴" : "▾"}</span>
          </button>
          {tenantOpen && (
            <>
              {/* คลุมหลัง dropdown แตะเพื่อปิด (ไม่ปิดทั้ง drawer) */}
              <div className="fixed inset-0 z-0" onClick={() => setTenantOpen(false)} />
              <div className="absolute left-2 right-2 z-10 mt-1 flex flex-col rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-lg">
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
                  href="/onboarding"
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
          <Link
            href="/app"
            onClick={onClose}
            className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
              pathname === "/app" ? "font-medium text-[color:var(--color-accent)]" : ""
            }`}
          >
            <NavIcon emoji="🏠" />
            <span className="truncate">หน้าหลัก</span>
          </Link>


          {items.length > 0 && (
            <div className="px-2 pb-1 pt-3 text-xs text-[color:var(--color-muted)]">ระบบทั้งหมด</div>
          )}
          {items.map((it) =>
            it.children && it.children.length > 0 ? (
              <NavGroup key={it.key} item={it} onNavigate={onClose} badge={badges?.[it.key] ?? 0} />
            ) : (
              <Link
                key={it.key}
                href={it.href}
                onClick={onClose}
                className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
                  isActive(it.href) ? "font-medium text-[color:var(--color-accent)]" : ""
                }`}
              >
                <NavIcon emoji={it.icon} />
                <span className="min-w-0 truncate">{it.label}</span>
                <NavBadge n={badges?.[it.key] ?? 0} />
              </Link>
            ),
          )}

          <div className="my-2 border-t" />
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
          >
            <span>ตั้งค่า</span>
            <span>{settingsOpen ? "▴" : "▾"}</span>
          </button>
          {settingsOpen && [
            { href: "/app/settings/credit", icon: "⚡", label: "เครดิต AI" },
            { href: "/app/marketplace", icon: "🧩", label: "ตลาดเทมเพลต" },
            { href: "/app/reports", icon: "📊", label: "รายงาน" },
            { href: "/app/forms", icon: "📝", label: "ฟอร์ม" },
            { href: "/app/notifications", icon: "🔔", label: "ศูนย์แจ้งเตือน" },
            { href: "/app/approvals", icon: "✅", label: "รออนุมัติของฉัน" },
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
          ].map((s) => (
            <Link
              key={s.href}
              href={s.href}
              onClick={onClose}
              className={`flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-[color:var(--color-surface-2)] ${
                isActive(s.href) ? "font-medium text-[color:var(--color-accent)]" : ""
              }`}
            >
              <NavIcon emoji={s.icon} />
              <span className="truncate">{s.label}</span>
            </Link>
          ))}

          {soon.length > 0 && (
            <>
              <div className="my-2 border-t" />
              <div className="px-2 pb-1 text-xs text-[color:var(--color-muted)]">กำลังจะมา</div>
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
          <div className="border-t pt-3">
            {/* เปิด Modal เพิ่มระบบกลางจอ (ไม่ navigate ไปหน้า settings — คง flow อยู่ในหน้าเดิม) */}
            <button
              type="button"
              onClick={onAddSystem}
              className="flex w-full items-center justify-center gap-1 rounded-lg bg-[color:var(--color-accent)] px-3 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              + เพิ่มระบบ
            </button>
          </div>
          {/* อีเมล + ออกจากระบบ — โชว์เสมอ (ฝั่งแอป native intercept logout เอง) */}
          <div className="flex items-center justify-between px-1">
            <span className="truncate text-xs text-[color:var(--color-muted)]">{userEmail}</span>
            <a href="/logout" className="text-xs underline">
              ออกจากระบบ
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}
