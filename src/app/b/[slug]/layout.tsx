// /b/[slug]/* — เปลือกพอร์ทัลลูกค้าองค์กร (ใบ C3.5 · มติ C7/C15 · ภาพ 12) — `/p/[slug]` เป็นของโมดูล PAGES จึงอยู่ที่ `/b`
//
// 🔴 ร้านที่ไม่มีพอร์ทัลใช้งานจริง (CRM uiVersion 1 · ปิด `portal.enabled` · slug ไม่มีจริง) = 404 ทั้งกิ่ง (`portalShopBySlug`)
// 🔴 ธีมของร้าน (branding tokens) ตั้งเป็น CSS var ที่รากของกิ่งนี้ — ปุ่ม/ป้าย/ลิงก์เน้นใช้สีของร้าน
// 🔴 mobile-first (เปิดใน LINE · กรอบ 430px) — ขยายเป็นเลย์เอาต์เดสก์ท็อปที่ lg · ไม่มีเมนู/รางของพนักงานในกิ่งนี้เลย
import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { getBrandingTokens } from "@/lib/branding/service";
import { portal } from "@/lib/modules/crm";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const safe = (v: string | null | undefined, fallback: string) => (typeof v === "string" && (HEX.test(v) || /^rgba?\([\d.,\s]+\)$/.test(v)) ? v : fallback);

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await portal.portalShopBySlug(slug);
  if (!shop) notFound();
  const tokens = await getBrandingTokens(shop.tenantId).catch(() => null);
  const style = {
    "--color-accent": safe(tokens?.accent, "#1d4ed8"),
    "--color-accent-fg": safe(tokens?.accentFg, "#ffffff"),
    "--color-accent-soft": safe(tokens?.accentSoft, "#eef2fd"),
    background: "var(--color-surface-2)",
  } as React.CSSProperties;
  return (
    <div data-testid="portal-shell" data-portal-shop={shop.slug} className="min-h-dvh w-full overflow-x-hidden" style={style}>
      {children}
    </div>
  );
}
