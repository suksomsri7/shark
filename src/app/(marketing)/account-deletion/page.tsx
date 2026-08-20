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
        <h2 className="text-lg font-medium">2. ลบบัญชีผู้ใช้ของคุณ</h2>
        <p className="text-sm leading-6">
          ส่งอีเมล<strong>จากที่อยู่อีเมลที่ใช้สมัคร</strong>มาที่{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>{" "}
          หัวข้อ <strong>“ขอลบบัญชี”</strong>
        </p>
        <p className="text-sm leading-6">
          เราจะลบอีเมล ชื่อ และการเข้าสู่ระบบทั้งหมดของคุณออกจากระบบ แล้วยืนยันกลับทางอีเมล
          ภายใน <strong>30 วัน</strong> (โดยปกติเร็วกว่านั้นมาก)
        </p>
        <p className={`text-sm leading-6 ${muted}`}>
          หากคุณเป็นเจ้าของร้านที่ยังมีข้อมูลอยู่ เราจะยืนยันกับคุณก่อนว่าต้องการให้ลบร้านนั้นไปด้วยหรือไม่
          เพื่อไม่ให้พนักงานคนอื่นในร้านเสียข้อมูลโดยไม่ตั้งใจ
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
          <strong>Delete your user account:</strong> email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address you signed up with, subject “Delete my account”. We erase your email,
          name and all sign-in records and confirm by email within 30 days.
        </p>
        <p className="text-sm leading-6">
          Issued tax and accounting documents may be retained where Thai law requires it, and are
          used for legal compliance only.
        </p>
      </section>
    </main>
  );
}
