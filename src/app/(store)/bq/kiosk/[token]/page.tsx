// SVC B.6 — ตู้รับบัตรคิว/เช็กอิน (ภาพ จอง 04) · /bq/kiosk/<token อุปกรณ์> — ไม่ต้องล็อกอิน (token คือสิทธิ์)
// token ใช้ไม่ได้ทุกกรณี ⇒ notFound · รีเฟรชอัตโนมัติเฉพาะหน้าแรกของตู้ (ส่งเป็น slot) · ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import Kiosk from "@/components/booking/public/Kiosk";
import { kioskCheckInAction, kioskWalkInAction } from "../../actions";
import { loadKioskView } from "@/lib/modules/booking/public-line";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ตู้รับบัตรคิว", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function BqKioskPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ at?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const raw = process.env.SVC_QC_CLOCK === "1" && typeof sp?.at === "string" ? new Date(sp.at) : null;
  const qc = raw && !Number.isNaN(raw.getTime()) ? raw : null;
  const view = await loadKioskView(token, { now: qc ?? new Date() });
  if (!view) notFound();
  return (
    <Kiosk
      view={view}
      actions={{ checkIn: kioskCheckInAction.bind(null, token), walkIn: kioskWalkInAction.bind(null, token) }}
      at={qc ? qc.toISOString() : undefined}
      refresher={<AutoRefresh ms={15000} />}
    />
  );
}
