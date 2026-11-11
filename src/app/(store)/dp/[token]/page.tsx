// SVC D.18 ▸ หน้าแสดง QR รับพัสดุของผู้เช่า · /dp/<token> — สาธารณะ ไม่มี session (ใบสั่ง ledger/svc-briefs/svc-brief-d.18.md §5.3)
//   ด่านทั้งหมดอยู่ใน facade loadParcelPickup (rate limit → ลายเซ็น → พัสดุรอรับ + สัญญา live) · ล้มทุกกรณี ⇒ notFound() เนื้อ 404 เดียวกัน (X7)
//   อ่านอย่างเดียว (พนักงานสแกน QR นี้ตอนส่งของ · มติผู้คุม R4) · ไม่มีรูปพัสดุ/ชื่อ/เบอร์ (R7)
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import DormParcelPickup from "@/components/dorm/DormParcelPickup";
import { loadParcelPickup } from "@/lib/modules/dorm";

export const dynamic = "force-dynamic";
// token อยู่ใน URL ⇒ ห้ามจัดทำดัชนี · ไม่ส่ง referrer ออกนอกหน้า
export const metadata: Metadata = { title: "รับพัสดุ", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** คีย์ของผู้เรียก (IP แบบ D.9): x-real-ip → x-vercel-forwarded-for → x-forwarded-for ตัวแรก → "unknown" */
function clientKeyOf(h: Headers): string {
  const first = (v: string | null) => (v ?? "").split(",")[0]?.trim() ?? "";
  return first(h.get("x-real-ip")) || first(h.get("x-vercel-forwarded-for")) || first(h.get("x-forwarded-for")) || "unknown";
}

export default async function DormParcelPickupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadParcelPickup(token, { clientKey: clientKeyOf(await headers()) });
  if (!view) notFound();
  return (
    <main className="min-h-dvh bg-[#fafafa]">
      <DormParcelPickup view={view} />
    </main>
  );
}
