// SVC B.7 — หน้าจัดการนัดของลูกค้า · /bq/m/<token HMAC ของนัด> — ไม่ต้องล็อกอิน (token = สิทธิ์) · อายุถึงเวลานัด + 7 วัน
// token ใช้ไม่ได้ทุกกรณี ⇒ notFound (404 เดียวกัน) · ?r=1 = โหมดเลื่อน (&date= &staff=) · ?err= = รหัสจากปุ่มที่ล้ม (รูป ^[A-Z_]{1,40}$ · หน้าแปลเอง)
// ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1 · ?lang= = ภาษา (ในชุดที่ร้านเปิด) · ไม่มีชื่อ/เบอร์ลูกค้าบนหน้า (X8)
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ManageCard from "@/components/booking/online/ManageCard";
import { loadManageView } from "@/lib/modules/booking/online";
import { loadDepositPay } from "@/lib/modules/booking/deposit"; // SVC B.8
import { makeT } from "@/lib/i18n";
import { cancelBookingAction, lateCancelBookingAction, rescheduleBookingAction, submitDepositSlipAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "นัดของคุณ", robots: { index: false, follow: false }, referrer: "no-referrer" };

type SP = { at?: string | string[]; err?: string | string[]; r?: string | string[]; date?: string | string[]; staff?: string | string[]; lang?: string | string[] };
const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" ? v : undefined);

export default async function BqManagePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<SP> }) {
  const { token } = await params;
  const sp = await searchParams;
  const atRaw = process.env.SVC_QC_CLOCK === "1" ? one(sp?.at) : undefined;
  const qcAt = atRaw ? new Date(atRaw) : null;
  const qc = qcAt && !Number.isNaN(qcAt.getTime()) ? qcAt : null;
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const r = await loadManageView(token, {
    now: qc ?? new Date(),
    ip,
    lang: one(sp?.lang),
    reschedule: one(sp?.r) === "1" ? { date: one(sp?.date), staff: one(sp?.staff) } : undefined,
  });
  if (!r.ok && r.code === "RATE_LIMITED") {
    return (
      <div className="mx-auto max-w-[420px] px-5 py-16 text-center text-[15px] text-[#525252]">{makeT(one(sp?.lang) === "en" ? "en" : "th")("bk7.m.rateLimited")}</div>
    );
  }
  if (!r.ok) notFound();
  // SVC B.8 ▸ กล่องมัดจำ (QR · นับถอยหลัง · แนบสลิป · ยกเลิกช้า) — เฉพาะนัดที่มีมัดจำ · โหลดไม่ได้ = หน้าตาเดิม B.7 ◂
  const pr = r.view.depositSatang > 0 ? await loadDepositPay(token, { now: qc ?? new Date(), ip, ipCounted: true }) : null; // V17: ถัง IP นับแล้วใน loadManageView
  const pay = pr && pr.ok ? pr.pay : null;
  const payError = !!pr && !pr.ok;
  const errRaw = one(sp?.err);
  const err = errRaw && /^[A-Z_]{1,40}$/.test(errRaw) ? errRaw : null;
  return (
    <div className="min-h-screen bg-white">
      <ManageCard
        view={r.view}
        token={token}
        actions={{
          cancel: cancelBookingAction.bind(null, token),
          reschedule: rescheduleBookingAction.bind(null, token),
          slip: submitDepositSlipAction.bind(null, token),
          lateCancel: lateCancelBookingAction.bind(null, token),
        }}
        pay={pay}
        payError={payError}
        slipKey={`bq${randomUUID().replace(/-/g, "")}`}
        at={qc ? qc.toISOString() : undefined}
        err={err}
      />
    </div>
  );
}
