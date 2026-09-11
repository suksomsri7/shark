// /m/[slug]/referral — แนะนำเพื่อนของลูกค้า (M3.5 · LIFF แชร์): โค้ด + QR + ปุ่มแชร์ LINE + สถิติของฉัน
//
// 🔴 session ลูกค้าเท่านั้น (`requireCustomer`) — ไม่มี/หมดอายุ = พาไปหน้าเข้าสู่ระบบเอง
// 🔴 QR = ลิงก์แนะนำแบบเต็ม (`https://<โดเมน>/ref/<โค้ด>`) สร้างฝั่งเซิร์ฟเวอร์เป็น data URL (แบบเดียวกับบัตรสมาชิก)
import QRCode from "qrcode";
import { requireCustomer } from "@/lib/modules/member/customer-session";
import { getProgram, referralsForMember } from "@/lib/modules/member/referrals";
import { REFERRAL_CONVERT_ON_LABELS, rewardLabel } from "@/lib/modules/member/referrals-shared";
import { MReferral } from "@/components/member/MReferral";

export const dynamic = "force-dynamic";

export default async function MemberReferralPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCustomer(slug);
  const [data, program] = await Promise.all([referralsForMember(s.ctx, s.actor, s.customerId), getProgram(s.ctx)]);
  const qrDataUrl = await QRCode.toDataURL(data.url, { margin: 1, width: 296, errorCorrectionLevel: "M" }).catch(() => "");

  const when =
    program.convertOn === "FIRST_PURCHASE"
      ? `เมื่อเพื่อนซื้อครั้งแรก${program.minFirstPurchaseSatang ? ` ≥ ฿${Math.round(program.minFirstPurchaseSatang / 100).toLocaleString("th-TH")}` : ""}`
      : `เมื่อ${REFERRAL_CONVERT_ON_LABELS.SIGNUP}`;
  const rewardNote = `เพื่อนได้ ${rewardLabel(program.refereeRewardKind, program.refereeRewardValue)} · คุณได้ ${rewardLabel(program.referrerRewardKind, program.referrerRewardValue)} ${when}`;

  return (
    <MReferral
      shopName={s.tenantName}
      data={data}
      qrDataUrl={qrDataUrl}
      liffId={process.env.LINE_LIFF_ID ?? ""}
      rewardNote={rewardNote}
      enabled={program.enabled}
    />
  );
}
