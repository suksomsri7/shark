// SVC B.6 — จอทีวีเรียกคิวหน้าร้าน (ภาพ จอง 05) · /bq/tv/<token อุปกรณ์> — ไม่ต้องล็อกอิน (token คือสิทธิ์ · ไม่มี slug ใน URL)
// token ใช้ไม่ได้ทุกกรณี ⇒ notFound (404 เดียวกัน) · ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1 · รีเฟรชทุก 5 วินาที
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import TvBoard from "@/components/booking/public/TvBoard";
import { loadTvView } from "@/lib/modules/booking/public-line";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "จอเรียกคิว", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function BqTvPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ at?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const raw = process.env.SVC_QC_CLOCK === "1" && typeof sp?.at === "string" ? new Date(sp.at) : null;
  const now = raw && !Number.isNaN(raw.getTime()) ? raw : new Date();
  const view = await loadTvView(token, { now });
  if (!view) notFound();
  return (
    <>
      <AutoRefresh ms={5000} />
      <TvBoard view={view} />
    </>
  );
}
