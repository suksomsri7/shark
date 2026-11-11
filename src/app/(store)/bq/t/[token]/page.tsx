// SVC B.6 — หน้าบัตรคิวของลูกค้า (ภาพ จอง 06 ส่วน ก) · /bq/t/<token HMAC ของบัตร> — ไม่ต้องล็อกอิน · อายุถึงสิ้นวันถัดไป
// token ใช้ไม่ได้ทุกกรณี ⇒ notFound · ?err= = รหัสจากปุ่มที่ล้ม (แปลเป็นข้อความที่นี่ · ไม่แสดงข้อความอิสระจาก URL) · ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1 · รีเฟรชเมื่อบัตรยังไม่จบ
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import TicketCard from "@/components/booking/public/TicketCard";
import { cancelTicketAction, deferTicketAction } from "../../actions";
import { loadTicketView } from "@/lib/modules/booking/public-line";

export const dynamic = "force-dynamic";
const ERR_TH: Record<string, string> = {
  NOT_FOUND: "บัตรนี้ใช้ไม่ได้แล้ว — ติดต่อพนักงานที่หน้าร้าน",
  BAD_STATE: "ทำรายการนี้กับบัตรนี้ไม่ได้ในตอนนี้",
  LOST_RACE: "สถานะบัตรเพิ่งเปลี่ยน กรุณาลองอีกครั้ง",
  BUSY: "ระบบกำลังจัดคิว กรุณาลองใหม่อีกครั้ง",
  RATE_LIMITED: "กดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
};
export const metadata: Metadata = { title: "บัตรคิวของคุณ", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function BqTicketPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ at?: string; err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const raw = process.env.SVC_QC_CLOCK === "1" && typeof sp?.at === "string" ? new Date(sp.at) : null;
  const qc = raw && !Number.isNaN(raw.getTime()) ? raw : null;
  const view = await loadTicketView(token, { now: qc ?? new Date() });
  if (!view) notFound();
  const err = typeof sp?.err === "string" && sp.err ? ERR_TH[sp.err] ?? "ทำรายการไม่สำเร็จ กรุณาลองใหม่" : "";
  const live = view.status === "WAITING" || view.status === "CALLED" || view.status === "SERVING";
  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      {live ? <AutoRefresh ms={15000} /> : null}
      {err ? (
        <p role="alert" className="mx-auto max-w-[420px] px-4 pt-4 text-sm text-[color:var(--color-danger,#dc2626)]">
          {err}
        </p>
      ) : null}
      <TicketCard
        view={view}
        token={token}
        actions={{ defer: deferTicketAction.bind(null, token), cancel: cancelTicketAction.bind(null, token) }}
        at={qc ? qc.toISOString() : undefined}
      />
    </div>
  );
}
