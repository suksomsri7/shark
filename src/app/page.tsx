import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { hostEntryPath } from "@/lib/domain/service";
import { PublicFooter } from "@/components/public-chrome";

// Root "/" — WO-0065 Host-routing gate + Landing (marketing) เดิม
// proxy (src/proxy.ts) ตั้ง header "x-shark-host" ให้เมื่อเข้าจาก custom domain ของร้าน (ไม่ใช่ root host)
// อ่าน header ที่ชั้น app (RSC, Node เต็ม DB ตาม ADR A6 ทาง ก) → หา path หน้าร้าน → redirect
// ไม่มี header / โดเมนยังไม่พร้อม → landing เดิมทุกประการ
// การอ่าน headers() ทำให้หน้านี้ dynamic (docs: headers.md §Good to know) — ยอมรับได้:
// landing เป็นหน้าเดียว เนื้อหาคงที่ต่อคำขอ ไม่มี ISR/static ที่ต้องรักษา
export default async function RootPage() {
  const host = (await headers()).get("x-shark-host");
  if (host) {
    const path = await hostEntryPath(host);
    if (path) redirect(path); // throw NEXT_REDIRECT — เรียกนอก try/catch (docs: redirect.md)
  }

  // ── Landing ──
  // 🔴 หน้านี้คือ "Marketing URL" ที่ยื่นกับ App Store และเป็นหน้าแรกที่ผู้ตรวจเปิด
  //    เดิมมีแค่พาดหัว + 2 ปุ่ม → เปิดมาแล้วไม่รู้ว่าแอปทำอะไร เสี่ยงโดนตีกลับข้อ 2.3
  //    (Accurate Metadata — คำบรรยายในสโตร์ต้องตรงกับสิ่งที่เห็นจริง)
  //    จึงเพิ่มรายการความสามารถจริงที่มีในระบบ + ทางเดินไปหน้ากฎหมาย/ช่วยเหลือ
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 pb-14 pt-20 text-center">
        <div className="text-sm font-semibold tracking-widest text-[color:var(--color-muted)]">
          {tApp("name")}
        </div>
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">{t("headline")}</h1>
        <p className="max-w-xl text-lg text-[color:var(--color-muted)]">{t("sub")}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="btn btn-primary">
            {t("ctaSignup")}
          </Link>
          <Link href="/login" className="btn btn-ghost">
            {t("ctaLogin")}
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-16">
        <h2 className="mb-5 text-center text-sm font-semibold tracking-widest text-[color:var(--color-muted)]">
          ระบบที่เปิดใช้ได้ เลือกเฉพาะที่ร้านคุณต้องใช้
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card flex flex-col gap-1.5 p-4 text-left">
              <div className="text-xl" aria-hidden>
                {f.icon}
              </div>
              <h3 className="text-sm font-medium">{f.title}</h3>
              <p className="text-sm leading-6 text-[color:var(--color-muted)]">{f.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-[color:var(--color-muted)]">
          ใช้งานได้ทั้งบนเว็บและแอปมือถือ · ช่วงนี้ใช้ฟรี ·{" "}
          <Link href="/support" className="underline underline-offset-4">
            มีคำถาม ติดต่อเรา
          </Link>
        </p>
      </section>

      <PublicFooter />
    </main>
  );
}

// รายการนี้ต้องตรงกับระบบที่ "เปิดใช้ได้จริง" ในทะเบียน SYSTEM_DEFS — ห้ามโฆษณาของที่ยังไม่มี
// (App Review 2.3 Accurate Metadata · และเจ้าของเคยสั่งชัด: ห้ามแต่งข้อมูลที่ไม่มีจริง)
const FEATURES: { icon: string; title: string; desc: string }[] = [
  { icon: "💵", title: "ขายหน้าร้าน (POS)", desc: "เปิดบิล รับเงินสด/โอน/พร้อมเพย์ ออกใบเสร็จ ปิดยอดรายวัน" },
  { icon: "📅", title: "จองคิว / นัดหมาย", desc: "ลูกค้าจองเองผ่านลิงก์ร้าน เลือกบริการ ช่าง และเวลาที่ว่างจริง" },
  { icon: "🎫", title: "บัตรคิวหน้าร้าน", desc: "ออกบัตรคิว เรียกคิว พร้อมจอแสดงคิวสำหรับหน้าร้าน" },
  { icon: "👥", title: "สมาชิกและแต้ม", desc: "สะสมแต้มอัตโนมัติจากยอดขาย ระดับสมาชิก คูปอง และของรางวัล" },
  { icon: "📦", title: "สินค้า/บริการ และสต็อก", desc: "แคตตาล็อกกลาง ตัดสต็อกอัตโนมัติเมื่อขาย รับเข้า-ปรับยอด" },
  { icon: "🧑‍💼", title: "พนักงาน (HR)", desc: "ทะเบียนพนักงาน ตารางเข้างาน ลงเวลาด้วย PIN ใบลา และเงินเดือน" },
  { icon: "📒", title: "บัญชี", desc: "บันทึกรายรับรายจ่ายอัตโนมัติจากการขาย ภาษีมูลค่าเพิ่ม และรายงานงบ" },
  { icon: "🏨", title: "โรงแรม / ร้านอาหาร", desc: "จองห้อง เช็คอิน-เอาท์ · โต๊ะ เมนู ครัว และเก็บเงินหน้าร้าน" },
  { icon: "🤖", title: "ผู้ช่วย AI", desc: "ถามยอดขาย สรุปธุรกิจ และให้ช่วยทำรายการแทน โดยต้องยืนยันทุกครั้ง" },
];
