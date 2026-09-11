// /ref/[code] — (เดิมวางแผนเป็น /r/[code] แต่ชนหน้าใบเสร็จสาธารณะของบัญชี (store)/r/[token]) ทางเข้าของเพื่อนจากลิงก์แนะนำ (M3.5) · สาธารณะ ไม่ต้องล็อกอิน
//
// โค้ด → ร้านเจ้าของโค้ด → redirect ไปหน้าเข้าสู่ระบบ/สมัครของร้านนั้นพร้อม `?ref=<โค้ด>`
// (ปลายทางอยู่ที่ `referralLandingPath` ใน referrals-shared.ts — M3.11 สลับเป็นหน้า join 3 ขั้นบรรทัดเดียว)
// 🔴 โค้ดไม่มีจริง/ชนข้ามร้าน = หน้าแจ้งสุภาพ ไม่เดาร้าน (พาเพื่อนไปผิดร้าน = ร้านเสียลูกค้า + ผู้แนะนำเสียรางวัล)
import { redirect } from "next/navigation";
import { resolveReferralLanding } from "@/lib/modules/member/referrals";
import { referralLandingPath } from "@/lib/modules/member/referrals-shared";

export const dynamic = "force-dynamic";

export default async function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = await resolveReferralLanding(decodeURIComponent(code));
  if (target) redirect(referralLandingPath(target.slug, target.code));

  return (
    <main data-testid="r-landing" className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="font-semibold" style={{ fontSize: 16 }}>
        ไม่พบลิงก์แนะนำนี้
      </h1>
      <p className="text-sm" style={{ color: "var(--color-muted)" }}>
        ลิงก์อาจพิมพ์ไม่ครบหรือถูกยกเลิกไปแล้ว — ขอลิงก์ใหม่จากเพื่อนที่ชวน หรือสมัครสมาชิกที่หน้าร้านได้เลย
      </p>
    </main>
  );
}
