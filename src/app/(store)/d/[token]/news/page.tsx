// SVC D.17 ▸ หน้าประกาศของผู้เช่าหอ · /d/<token>/news[?a=<announcementId>] — สาธารณะ ไม่มี session · ลิงก์เซ็นเดียวกับพอร์ทัล D.9
//   ด่านทั้งหมดอยู่ใน platform/dorm-announce (rate → ลายเซ็น → สัญญา live → ประกาศที่สัญญานี้เห็น) · ล้มทุกกรณี ⇒ notFound() (X7)
//   🔴 GET ไม่นับอ่าน (LINE ดึงตัวอย่างลิงก์ได้) — นับจาก action ฝั่งเบราว์เซอร์ใน DormPortalNews
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import DormPortalNews from "@/components/dorm/portal/DormPortalNews";
import { loadPortalAnnouncements } from "@/lib/platform/dorm-announce";
import { portalClientKey } from "@/lib/platform/dorm-portal";
import { markAnnouncementReadAction } from "./actions";

export const dynamic = "force-dynamic";
// token อยู่ใน URL ⇒ ห้ามจัดทำดัชนี · ไม่ส่ง referrer ออกนอกหน้า
export const metadata: Metadata = { title: "ประกาศจากหอ", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function DormPortalNewsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ a?: string | string[] }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const a = typeof sp.a === "string" && sp.a ? sp.a : null;
  const view = await loadPortalAnnouncements(token, { a }, { clientKey: portalClientKey(await headers()) });
  if (!view) notFound();
  return (
    <main className="min-h-dvh bg-[#fafafa]">
      <DormPortalNews view={view} token={token} markRead={markAnnouncementReadAction.bind(null, token)} />
    </main>
  );
}
