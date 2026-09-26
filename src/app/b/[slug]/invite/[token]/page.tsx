// /b/[slug]/invite/[token] — รับคำเชิญเข้าพอร์ทัล (ลิงก์ใช้ครั้งเดียว 7 วัน) · ใบ C3.5
// 🔴 เปิดหน้านี้ **ไม่** ใช้ลิงก์ไปเอง (ตัวสแกนลิงก์ของอีเมล/แอปแชทชอบเปิดลิงก์ล่วงหน้า) — ลูกค้าต้องกดปุ่มยืนยัน
// 🔴 หน้านี้ไม่อ่าน/ไม่แสดงอะไรจาก token (ไม่บอกว่าลิงก์ยังใช้ได้ไหม · เป็นของใคร) — บริการตัดสินตอนกดเท่านั้น (X7.3)
import { notFound } from "next/navigation";
import { portal } from "@/lib/modules/crm";
import { PortalInviteAccept } from "@/components/crm/portal/PortalClientBits";
import { portalAcceptInviteAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PortalInvitePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const shop = await portal.portalShopBySlug(slug);
  if (!shop) notFound();
  return (
    <div data-testid="portal-invite" className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center gap-5 px-5 py-10">
      <div className="text-center">
        <div className="text-[15px] font-semibold">{shop.name}</div>
        <div className="mt-1.5 text-xs" style={{ color: "var(--color-muted)" }}>พอร์ทัลลูกค้าองค์กร</div>
      </div>
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
        คุณได้รับคำเชิญให้เข้าใช้พอร์ทัลลูกค้าของ {shop.name} — ดู/ตอบรับใบเสนอราคา ชำระใบแจ้งหนี้ และแจ้งเรื่องได้ในที่เดียว
        <div className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>ลิงก์นี้ใช้ได้ครั้งเดียว และหมดอายุภายใน 7 วันนับจากวันที่ร้านส่ง</div>
      </div>
      <PortalInviteAccept slug={slug} inviteToken={token} action={portalAcceptInviteAction} />
    </div>
  );
}
