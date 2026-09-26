// PortalFrame.tsx — เปลือกของหน้าพอร์ทัลที่ล็อกอินแล้ว (ใบ C3.5 · ภาพ 12 ข/ค) — คอมโพเนนต์ฝั่งเซิร์ฟเวอร์
//
// มือถือ (≤ 430px · ใช้ใน LINE): หัว = เมนู (☰ พับได้) + ชื่อบริษัท + ตัวสลับบริษัท + อักษรย่อผู้ใช้
// เดสก์ท็อป (lg): หัว = ชื่อบริษัท + "พอร์ทัล <ร้าน>" · เมนูซ้ายของพอร์ทัลเอง (หน้าแรก · ใบแจ้งหนี้ · ใบเสนอราคา · เอกสาร/สัญญา ·
//   แจ้งเรื่อง · ผู้ติดต่อบริษัท) — 🔴 ไม่มีรางไอคอน/เมนูของพนักงานเลย (หน้านี้เป็นของลูกค้า)
// 🔴 ที่อยู่ทุกลิงก์มาจาก `portalPath` (ค่าคงที่ PORTAL_BASE_PATH ตัวเดียว) · server action ส่งเข้ามาทาง props จากหน้า
import Link from "next/link";
import { portalPath } from "@/lib/modules/crm";
import { PortalCompanySwitcher, PortalLogoutButton } from "./PortalClientBits";

type R<T> = ({ ok: true } & T) | { ok: false; error: string };

export type PortalNavKey = "home" | "invoices" | "quotations" | "documents" | "requests" | "contacts";
const NAV: { key: PortalNavKey; label: string; sub: string[] }[] = [
  { key: "home", label: "หน้าแรก", sub: [] },
  { key: "invoices", label: "ใบแจ้งหนี้", sub: ["invoices"] },
  { key: "quotations", label: "ใบเสนอราคา", sub: ["quotations"] },
  { key: "documents", label: "เอกสาร/สัญญา", sub: ["documents"] },
  { key: "requests", label: "แจ้งเรื่อง", sub: ["requests"] },
  { key: "contacts", label: "ผู้ติดต่อบริษัท", sub: ["contacts"] },
];

export function PortalFrame(props: {
  slug: string;
  active: PortalNavKey;
  companyName: string;
  shopName: string;
  meName: string;
  companies: { id: string; name: string }[];
  currentCompanyId: string;
  switchAction: (slug: string, companyId: string) => Promise<R<{ next: string }>>;
  logoutAction: (slug: string) => Promise<R<{ next: string }>>;
  children: React.ReactNode;
}) {
  const initial = (props.meName || "?").trim().slice(0, 1);
  const links = NAV.map((n) => ({ ...n, href: portalPath(props.slug, ...n.sub) }));
  return (
    <div data-testid="portal-frame" className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col lg:max-w-[1180px] lg:py-4">
      <header className="flex items-center gap-2 border-b px-4 py-3 lg:rounded-t-xl lg:border lg:px-6" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
        <details className="relative lg:hidden">
          <summary data-testid="portal-menu" aria-label="เมนูพอร์ทัล" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-lg">
            ☰
          </summary>
          <nav className="absolute left-0 top-9 z-20 flex w-56 flex-col rounded-xl border p-1.5 shadow-sm" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
            {links.map((l) => (
              <Link key={l.key} href={l.href} data-testid={`portal-menu-${l.key}`} className="rounded-lg px-3 py-2 text-sm" style={l.key === props.active ? { background: "var(--color-surface-2)", fontWeight: 600 } : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
        </details>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-[14px] font-semibold lg:text-[15px]" data-testid="portal-company-name">
            {props.companyName}
          </h1>
          <span className="hidden text-xs lg:inline" style={{ color: "var(--color-muted)" }}>
            พอร์ทัล {props.shopName}
          </span>
        </div>
        <PortalCompanySwitcher slug={props.slug} current={props.currentCompanyId} companies={props.companies} action={props.switchAction} />
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }} title={props.meName}>
          {initial}
        </span>
        <PortalLogoutButton slug={props.slug} action={props.logoutAction} />
      </header>
      <div className="flex flex-1 lg:rounded-b-xl lg:border lg:border-t-0" style={{ borderColor: "var(--color-line)" }}>
        <nav className="hidden w-52 shrink-0 flex-col gap-0.5 border-r py-4 lg:flex" style={{ borderColor: "var(--color-line)" }} aria-label="เมนูพอร์ทัล">
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              data-testid={`portal-nav-${l.key}`}
              className="mx-2 rounded-lg px-3 py-2 text-sm"
              style={l.key === props.active ? { background: "var(--color-surface-2)", fontWeight: 600, boxShadow: "inset 2px 0 0 var(--color-accent)" } : { color: "var(--color-ink-soft)" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <main className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 lg:px-6" style={{ background: "var(--color-surface)" }}>
          {props.children}
        </main>
      </div>
    </div>
  );
}

/** ป้ายสถานะเล็ก (ค้างชำระ = แดง · ชำระแล้ว = สีร้าน · อื่น ๆ = เทา) */
export function PortalBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === "AWAITING_PAYMENT" || status === "PARTIAL"
      ? { color: "var(--color-danger)", borderColor: "var(--color-danger)" }
      : status === "PAID" || status === "ACCEPTED" || status === "APPROVED" || status === "DONE"
        ? { color: "var(--color-accent)", borderColor: "var(--color-accent)" }
        : { color: "var(--color-muted)", borderColor: "var(--color-line)" };
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px]" style={tone}>
      {label}
    </span>
  );
}

export function PortalSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PortalEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border px-4 py-6 text-center text-sm" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
      {text}
    </div>
  );
}
