import Link from "next/link";
import { SUPPORT_EMAIL } from "@/components/public-chrome";

// ลบบัญชีและข้อมูล — URL เดียวที่ใช้ยื่นได้ทุกค่าย
//   · Apple  — App Review 5.1.1(v) "Account Deletion" (ต้องบอกวิธีให้ชัด + ทำได้จริงจากในแอป)
//   · Meta   — Data Deletion Instructions URL
//   · Google — Data safety / account deletion URL
// /data-deletion เดิมยังอยู่ (Meta ลงทะเบียน URL นั้นไว้แล้ว) แต่ชี้ต่อมาที่หน้านี้
//
// 🔴 กติกาของหน้านี้: เขียนเฉพาะสิ่งที่ระบบทำได้จริงวันนี้ ห้ามสัญญาเกิน
//    ผู้ตรวจจะกดตามจริง ถ้าทำตามแล้วไม่มีปุ่มอย่างที่เขียน = ตีกลับทันที
export const metadata = {
  title: "ลบบัญชีและข้อมูล — SHARK",
  description: "วิธีลบร้าน ลบบัญชีผู้ใช้ และขอลบข้อมูลทั้งหมดออกจาก SHARK",
};

export default function AccountDeletionPage() {
  const muted = "text-[color:var(--color-muted)]";
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">ลบบัญชีและข้อมูล</h1>
        <p className={`text-sm ${muted}`}>SHARK (shark.in.th) — อัปเดตล่าสุด 20 สิงหาคม 2026</p>
      </header>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-medium">SHARK แยกข้อมูลเป็น 2 ชั้น</h2>
        <p className="text-sm leading-6">
          เข้าใจตรงนี้ก่อนจะเลือกได้ถูกว่าต้องลบอะไร:
        </p>
        <ul className="list-disc pl-6 text-sm leading-6">
          <li>
            <strong>ร้าน (กิจการ)</strong> — ข้อมูลธุรกิจทั้งหมด: ลูกค้า สมาชิก สินค้า บิลขาย บัญชี พนักงาน
          </li>
          <li>
            <strong>บัญชีผู้ใช้</strong> — ตัวตนของคุณเอง: อีเมลและชื่อที่ใช้เข้าสู่ระบบ
            (บัญชีเดียวเข้าได้หลายร้าน)
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">1. ลบร้านและข้อมูลธุรกิจทั้งหมด (ทำเองได้ทันที)</h2>
        <p className={`text-sm leading-6 ${muted}`}>
          ทำได้เฉพาะเจ้าของร้าน (OWNER) — ทั้งในแอป SHARK และบนเว็บ ขั้นตอนเดียวกัน
        </p>
        <ol className="list-decimal pl-6 text-sm leading-6">
          <li>เข้าสู่ระบบที่ shark.in.th หรือเปิดแอป SHARK</li>
          <li>
            เปิดเมนู → <strong>ตั้งค่า</strong> → <strong>ความเป็นส่วนตัว (PDPA)</strong>
          </li>
          <li>
            (ถ้าต้องการเก็บสำเนา) กด <strong>“ดาวน์โหลดข้อมูลของร้าน”</strong> — ได้ไฟล์ข้อมูลทั้งหมดเป็น JSON
          </li>
          <li>
            กด <strong>“ขอลบร้านถาวร”</strong> แล้วยืนยัน
          </li>
        </ol>
        <p className="text-sm leading-6">
          ร้านจะเข้าสู่ช่วงพัก <strong>30 วัน</strong> (ยกเลิกเองได้ตลอดช่วงนี้) เมื่อครบกำหนด
          ระบบจะลบข้อมูลทั้งหมดของร้านออกจากฐานข้อมูลถาวร กู้คืนไม่ได้
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">2. ลบบัญชีผู้ใช้ของคุณ (ทำเองได้ทันที)</h2>
        <p className={`text-sm leading-6 ${muted}`}>
          ทำได้ทุกคน ไม่ว่าจะเป็นเจ้าของร้านหรือพนักงาน — ทั้งในแอป SHARK และบนเว็บ ขั้นตอนเดียวกัน
        </p>
        <ol className="list-decimal pl-6 text-sm leading-6">
          <li>เข้าสู่ระบบที่ shark.in.th หรือเปิดแอป SHARK</li>
          <li>
            เปิดเมนู → <strong>ตั้งค่า</strong> → <strong>ความเป็นส่วนตัว (PDPA)</strong>
          </li>
          <li>
            เลื่อนลงที่หัวข้อ <strong>“ลบบัญชีของฉัน”</strong> — หน้าจอจะบอกก่อนว่าร้านของคุณจะเป็นอย่างไร
          </li>
          <li>
            กด <strong>“ลบบัญชีของฉันถาวร”</strong> แล้วยืนยัน
          </li>
        </ol>
        <p className="text-sm leading-6">
          อีเมล ชื่อ และการเข้าสู่ระบบทุกช่องทางของคุณจะถูกลบออกจากระบบ <strong>ทันที</strong> กู้คืนไม่ได้
        </p>
        <div className="card flex flex-col gap-2 p-4 text-sm leading-6">
          <div className="font-medium">ร้านของคุณจะเป็นอย่างไร</div>
          <ul className="list-disc pl-5">
            <li>
              ร้านที่คุณเป็นเจ้าของ <strong>แต่ยังมีสมาชิกคนอื่นอยู่</strong> → ระบบส่งมอบให้สมาชิกคนอื่นดูแลต่อ
              (ผู้จัดการก่อน ถ้าไม่มีก็คนที่อยู่มานานที่สุด) — ร้านไม่ถูกลบ พนักงานทำงานต่อได้
            </li>
            <li>
              ร้านที่ <strong>ไม่เหลือสมาชิกคนอื่นเลย</strong> → เข้าช่วงพัก 30 วันก่อนถูกลบถาวร
            </li>
            <li>ร้านที่คุณเป็นแค่พนักงาน → คุณออกจากร้านนั้น ข้อมูลร้านไม่ถูกแตะ</li>
          </ul>
          <p className={muted}>หน้าจอยืนยันจะระบุชื่อร้านและผลที่จะเกิดขึ้นจริงให้ดูก่อนเสมอ</p>
        </div>
        <p className={`text-sm leading-6 ${muted}`}>
          เข้าระบบไม่ได้แล้ว? ส่งอีเมลจากที่อยู่ที่ใช้สมัครมาที่{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>{" "}
          หัวข้อ “ขอลบบัญชี” แล้วเราจะดำเนินการให้ภายใน 30 วัน
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">3. เข้าสู่ระบบผ่าน Apple / Google / LINE / Facebook</h2>
        <p className="text-sm leading-6">
          ข้อมูลเดียวที่เราได้รับจากผู้ให้บริการเหล่านั้นคือ <strong>อีเมลและชื่อที่แสดง</strong> —
          เมื่อบัญชี SHARK ของคุณถูกลบ ข้อมูลส่วนนั้นถูกลบออกจากระบบเราด้วยทั้งหมด
        </p>
        <p className={`text-sm leading-6 ${muted}`}>
          การยกเลิกการเชื่อมต่อฝั่งผู้ให้บริการ (เช่น เอาแอปออกจากรายการ Sign in with Apple)
          ต้องทำในการตั้งค่าของผู้ให้บริการนั้นเอง
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">ข้อมูลที่เราเก็บต่อแม้ลบแล้ว</h2>
        <p className="text-sm leading-6">
          เอกสารทางบัญชีและภาษีที่ออกไปแล้ว (เช่น ใบกำกับภาษี) อาจต้องเก็บต่อตามที่กฎหมายไทยกำหนด
          แม้คุณจะลบบัญชีแล้ว — ส่วนนี้เก็บเพื่อการปฏิบัติตามกฎหมายเท่านั้น ไม่ถูกนำไปใช้อย่างอื่น
        </p>
      </section>

      <p className="text-sm leading-6">
        อ่านเพิ่มเติม:{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          นโยบายความเป็นส่วนตัว
        </Link>{" "}
        ·{" "}
        <Link href="/support" className="underline underline-offset-4">
          ศูนย์ช่วยเหลือ
        </Link>
      </p>

      {/* สรุปอังกฤษสำหรับผู้ตรวจ — Apple 5.1.1(v) / Meta data deletion */}
      <section lang="en" className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-6">
        <h2 className="text-lg font-medium">Account &amp; data deletion (English)</h2>
        <p className="text-sm leading-6">
          <strong>Delete your business and all of its data — in app:</strong> sign in, open Menu →
          Settings → Privacy (PDPA), optionally tap “Download my data”, then tap “Request permanent
          deletion”. The business enters a 30-day grace period (cancellable), after which all of its
          data is permanently erased.
        </p>
        <p className="text-sm leading-6">
          <strong>Delete your user account — in app:</strong> sign in, open Menu → Settings →
          Privacy (PDPA) → “Delete my account” → confirm. Your email, name and all sign-in records
          are erased immediately. Available to every signed-in user, owner or staff.
        </p>
        <p className="text-sm leading-6">
          Businesses you own are handed over to a remaining member (manager first); a business with
          no remaining members enters a 30-day grace period before permanent deletion. The
          confirmation screen names each affected business before you confirm. If you can no longer
          sign in, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p className="text-sm leading-6">
          Issued tax and accounting documents may be retained where Thai law requires it, and are
          used for legal compliance only.
        </p>
      </section>
    </main>
  );
}
