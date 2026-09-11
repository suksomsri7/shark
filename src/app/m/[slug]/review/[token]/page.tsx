// /m/[slug]/review/[token] — ลูกค้าเขียนรีวิวจากลิงก์ที่ร้านส่งทาง LINE (M3.4 · LIFF)
//
// 🔴 ไม่ต้องล็อกอิน: token ในลิงก์คือสิทธิ์ของรีวิว 1 ใบ (ใช้ครั้งเดียว · เก็บเฉพาะ hash) — เปิดจากไลน์แล้วเขียนได้ทันที
//    ห้ามเรียกด่านพนักงาน/ด่าน session ลูกค้าในหน้านี้ (คนที่กดลิงก์จากไลน์ส่วนใหญ่ยังไม่เคยล็อกอินหน้าสมาชิก)
// 🔴 ลิงก์ที่ใช้แล้ว → "รีวิวไปแล้ว" (m-review-done) · ลิงก์มั่ว/คนละร้าน → ข้อความไทย (m-review-invalid) ไม่ใช่หน้าพัง
import { reviewLiffView } from "@/lib/modules/member/reviews";
import { ReviewLiffForm, ReviewLiffMessage } from "@/components/member/ReviewLiff";

export const dynamic = "force-dynamic";

export default async function MemberReviewPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const view = await reviewLiffView(slug, token);
  if (view.state === "invalid") return <ReviewLiffMessage kind="invalid" />;
  if (view.state === "done") return <ReviewLiffMessage kind="done" shopName={view.shopName} rating={view.rating} />;
  return (
    <ReviewLiffForm
      slug={slug}
      token={decodeURIComponent(token)}
      shopName={view.shopName}
      serviceName={view.serviceName}
      firstName={view.firstName}
      rewardPoints={view.rewardPoints}
      maxPhotos={view.maxPhotos}
    />
  );
}
