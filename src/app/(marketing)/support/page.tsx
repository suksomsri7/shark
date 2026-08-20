import Link from "next/link";
import { SUPPORT_EMAIL } from "@/components/public-chrome";

// ศูนย์ช่วยเหลือ — 🔴 App Store Connect **บังคับ** ต้องกรอก "Support URL" ตอน submit
// (เดิมไม่มีหน้านี้เลย = ยื่นไม่ผ่านตั้งแต่หน้ากรอกข้อมูล) · Google Play / Meta ใช้ URL เดียวกันได้
//
// มีบล็อกภาษาอังกฤษท้ายหน้าโดยตั้งใจ: ผู้ตรวจของ Apple ส่วนใหญ่อ่านไทยไม่ออก
// แต่ตัวแอปเป็นตลาดไทย → เนื้อหาหลักเป็นไทย + สรุปอังกฤษให้ผู้ตรวจพอเข้าใจว่าแอปทำอะไร/ติดต่อยังไง
export const metadata = {
  title: "ศูนย์ช่วยเหลือ — SHARK",
  description: "ติดต่อทีมงาน SHARK · คำถามที่พบบ่อย · วิธีลบบัญชีและข้อมูล",
};

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "เข้าสู่ระบบอย่างไร ไม่มีรหัสผ่าน?",
    a: (
      <>
        SHARK ใช้การเข้าสู่ระบบแบบไม่มีรหัสผ่าน — กรอกอีเมลแล้วระบบส่ง <strong>รหัส 6 หลัก (OTP)</strong> ไปให้
        หรือจะเข้าผ่าน Apple / Google / LINE / Facebook ก็ได้ ทุกช่องทางเข้าสู่บัญชีเดียวกันถ้าใช้อีเมลเดียวกัน
      </>
    ),
  },
  {
    q: "ไม่ได้รับอีเมล OTP",
    a: (
      <>
        ตรวจกล่องจดหมายขยะก่อน (ผู้ส่งคือ <code>noreply@shark.in.th</code>) · รหัสมีอายุจำกัด ถ้าเกินเวลาให้กดขอใหม่ ·
        ยังไม่ได้อีก ให้เมลหาเราที่ {SUPPORT_EMAIL} พร้อมบอกอีเมลที่ใช้สมัคร
      </>
    ),
  },
  {
    q: "พนักงานเข้าใช้งานอย่างไร",
    a: (
      <>
        เจ้าของร้านเชิญพนักงานด้วยอีเมลครั้งเดียว จากนั้นพนักงานเข้าหน้างานได้ด้วย <strong>รหัส PIN</strong>
        โดยไม่ต้องรออีเมลทุกครั้ง · สิทธิ์ที่พนักงานทำได้ถูกจำกัดตามบทบาทที่เจ้าของกำหนด
      </>
    ),
  },
  {
    q: "ค่าบริการเท่าไหร่",
    a: <>ช่วงนี้ใช้ฟรี ยังไม่มีการเก็บเงิน · หากมีการเปลี่ยนแปลงจะแจ้งล่วงหน้าในระบบก่อนเสมอ</>,
  },
  {
    q: "ข้อมูลร้านของฉันปลอดภัยแค่ไหน",
    a: (
      <>
        ข้อมูลแต่ละกิจการถูกแยกออกจากกันในระดับฐานข้อมูล ร้านหนึ่งมองไม่เห็นข้อมูลอีกร้านหนึ่ง ·
        การเชื่อมต่อเข้ารหัส HTTPS ทั้งหมด · อ่านรายละเอียดที่{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          นโยบายความเป็นส่วนตัว
        </Link>
      </>
    ),
  },
  {
    q: "ขอลบบัญชีหรือข้อมูลทั้งหมด",
    a: (
      <>
        ทำได้เองในระบบ หรือแจ้งให้เราลบให้ — ดูขั้นตอนที่หน้า{" "}
        <Link href="/account-deletion" className="underline underline-offset-4">
          ลบบัญชีและข้อมูล
        </Link>
      </>
    ),
  },
];

export default function SupportPage() {
  const muted = "text-[color:var(--color-muted)]";
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">ศูนย์ช่วยเหลือ</h1>
        <p className={`text-sm ${muted}`}>
          SHARK — ระบบบริหารจัดการกิจการ (ขายหน้าร้าน · สมาชิก · จองคิว · คลังสินค้า · บัญชี · ผู้ช่วย AI)
        </p>
      </header>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-medium">ติดต่อเรา</h2>
        <p className="text-sm leading-6">
          อีเมล:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className={`text-sm leading-6 ${muted}`}>
          เราตอบกลับภายใน 1–2 วันทำการ · หากเป็นปัญหาที่ทำให้ใช้งานไม่ได้ กรุณาระบุชื่อร้าน
          และขั้นตอนที่ทำก่อนเกิดปัญหา จะช่วยให้แก้ได้เร็วขึ้น
        </p>
        <p className="text-sm leading-6">
          <strong>ผู้ใช้ที่เข้าสู่ระบบแล้ว</strong> พิมพ์แจ้งปัญหาได้ที่ <strong>แชทผู้ช่วย AI</strong>{" "}
          ในแอปหรือบนเว็บได้เลย — ระบบจะเปิดเป็นเคสส่งถึงทีมงาน และทีมงานตอบกลับ
          <strong>ในห้องแชทเดิม</strong> ไม่ต้องรอเมล
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">คำถามที่พบบ่อย</h2>
        {FAQ.map((f) => (
          <div key={f.q} className="flex flex-col gap-1 border-t border-[color:var(--color-line)] pt-4">
            <h3 className="text-sm font-medium">{f.q}</h3>
            <p className="text-sm leading-6">{f.a}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">เอกสารที่เกี่ยวข้อง</h2>
        <ul className="list-disc pl-6 text-sm leading-6">
          <li>
            <Link href="/privacy" className="underline underline-offset-4">
              นโยบายความเป็นส่วนตัว
            </Link>
          </li>
          <li>
            <Link href="/terms" className="underline underline-offset-4">
              ข้อกำหนดการใช้บริการ
            </Link>
          </li>
          <li>
            <Link href="/account-deletion" className="underline underline-offset-4">
              ลบบัญชีและข้อมูล
            </Link>
          </li>
        </ul>
      </section>

      {/* สรุปภาษาอังกฤษสำหรับผู้ตรวจของ App Store / Google Play / Meta */}
      <section
        lang="en"
        className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-6"
      >
        <h2 className="text-lg font-medium">Support (English)</h2>
        <p className="text-sm leading-6">
          SHARK is a business management platform for small and medium businesses in Thailand:
          point of sale, membership and loyalty points, appointment and queue booking, inventory,
          accounting, and an AI assistant. The service is provided in Thai.
        </p>
        <p className="text-sm leading-6">
          For any question, bug report, or data request, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
          . We reply within 1–2 business days.
        </p>
        <p className="text-sm leading-6">
          Account and data deletion instructions:{" "}
          <Link href="/account-deletion" className="underline underline-offset-4">
            shark.in.th/account-deletion
          </Link>
          . Privacy policy:{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            shark.in.th/privacy
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
