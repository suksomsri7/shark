// /b/[slug]/login — เข้าสู่ระบบพอร์ทัลลูกค้าองค์กร (อีเมล + OTP · LINE) · ใบ C3.5 · ภาพ 12 (ก)
// 🔴 ไม่ใช้ session พนักงาน/สมาชิก — คุกกี้ `shark_portal` แยกของตัวเอง · ร้านที่ไม่มีพอร์ทัล = 404 (layout)
import { notFound } from "next/navigation";
import { portal, portalPath } from "@/lib/modules/crm";
import { PortalLoginForm } from "@/components/crm/portal/PortalLoginForm";
import { portalLineNonceAction, portalRequestOtpAction, portalVerifyOtpAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await portal.portalShopBySlug(slug);
  if (!shop) notFound();
  const settings = await portal.shopSettings(shop);
  return (
    <PortalLoginForm
      slug={slug}
      shopName={shop.name}
      liffId={process.env.LINE_LIFF_ID ?? ""}
      lineAuthUrl={portalPath(slug, "auth", "line")}
      allowEmail={settings.loginMethods.includes("EMAIL_OTP")}
      allowLine={settings.loginMethods.includes("LINE")}
      requestOtp={portalRequestOtpAction}
      verifyOtp={portalVerifyOtpAction}
      lineNonce={portalLineNonceAction}
    />
  );
}
