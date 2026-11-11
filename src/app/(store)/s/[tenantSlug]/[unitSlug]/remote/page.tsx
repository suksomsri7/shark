// SVC B.9 — หน้ารับบัตรคิวจากมือถือโดยไม่ต้องมาร้าน (ภาคผนวก ก #42) · /s/<ร้าน>/<สาขา>/remote — ไม่ต้องล็อกอิน
// หน่วยไม่เปิดรับ/ไม่พบ ⇒ notFound (ผลเดียวทุกกรณี · X7) · ผลรับบัตร = เลขบัตร + ลิงก์หน้าบัตร (B.6) + ลิงก์ผูก LINE
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import RemoteTicket from "@/components/booking/public/RemoteTicket";
import { checkRemoteViewRate, loadRemoteTicketForm } from "@/lib/platform/booking-remote";
import { takeRemoteTicketAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "รับบัตรคิวทางมือถือ", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function RemoteTicketPage({ params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> }) {
  const { tenantSlug, unitSlug } = await params;
  // N6: เปิดหน้าถี่ต่อ IP ⇒ ไม่แตะฐานงาน (IP ลำดับเดียวกับ action: x-real-ip → x-vercel-forwarded-for → x-forwarded-for ตัวแรก)
  const h = await headers();
  const ip = [h.get("x-real-ip"), h.get("x-vercel-forwarded-for"), h.get("x-forwarded-for")].map((v) => (v ?? "").split(",")[0]?.trim() ?? "").find(Boolean) || "unknown";
  if (!(await checkRemoteViewRate(ip))) {
    return (
      <main className="min-h-dvh bg-[#fafafa] px-4 py-6">
        <p className="mx-auto max-w-[480px] rounded-2xl border border-[#e5e5e5] bg-white p-5 text-center text-[15px]">เปิดหน้านี้ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่</p>
      </main>
    );
  }
  const form = await loadRemoteTicketForm(tenantSlug, unitSlug);
  if (!form) notFound();
  return (
    <main className="min-h-dvh bg-[#fafafa] px-4 py-6">
      <RemoteTicket form={form} action={takeRemoteTicketAction.bind(null, tenantSlug, unitSlug)} />
    </main>
  );
}
