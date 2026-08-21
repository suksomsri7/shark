import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { hostEntryPath } from "@/lib/domain/service";
import { PublicFooter } from "@/components/public-chrome";
import { SYSTEM_DEFS } from "@/lib/systems";

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
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 pb-14 pt-16 text-center">
        {/* orb ผู้ช่วย AI — ตัวเดียวกับปุ่มในแอปเป๊ะ (คลาส .ai-orb ใน globals.css)
            ต่างแค่ขนาด (--orb-ring หนาขึ้นตามสัดส่วน) และจังหวะเต้นเป็น "หัวใจ" แทน "ลมหายใจ" */}
        <div className="ai-orb-heartbeat relative h-28 w-28 sm:h-32 sm:w-32" aria-hidden>
          <span className="ai-orb ai-orb-lg" />
        </div>
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

      {/* หน้าตาจริงของระบบ — ภาพถ่ายจากร้านตัวอย่างบน prod (scripts/shot-landing.mjs)
          🔴 ห้ามใส่ภาพ mock/ภาพวาดเอง: Apple 2.3 บังคับว่าภาพต้องตรงกับของจริงที่ผู้ใช้เจอ */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-16">
        <h2 className="mb-1 text-center text-sm font-semibold tracking-widest text-[color:var(--color-muted)]">
          หน้าตาจริงเมื่อเปิดใช้งาน
        </h2>
        <p className="mb-6 text-center text-sm text-[color:var(--color-muted)]">
          ภาพถ่ายจากระบบจริง ไม่ใช่ภาพจำลอง
        </p>
        <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {SCREENS.map((s) => (
            <li key={s.src} className="flex flex-col gap-2">
              {/* กรอบสัดส่วนเท่ากันทุกใบ + ยึดขอบบน — ภาพถ่ายมาสูงไม่เท่ากันตามเนื้อหาแต่ละหน้า
                  ถ้าปล่อย h-auto คำบรรยายใต้รูปจะเหลื่อมกันเป็นขั้นบันได (เห็นตอนเรนเดอร์จริง) */}
              <div className="overflow-hidden rounded-2xl border bg-[color:var(--color-surface)]">
                <img
                  src={s.src}
                  alt={s.alt}
                  width={390}
                  height={s.h}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[39/70] w-full object-cover object-top"
                />
              </div>
              <div className="text-center text-xs text-[color:var(--color-muted)]">{s.caption}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-16">
        <h2 className="mb-1 text-center text-sm font-semibold tracking-widest text-[color:var(--color-muted)]">
          ระบบที่เปิดใช้ได้ เลือกเฉพาะที่ร้านคุณต้องใช้
        </h2>
        <p className="mb-6 text-center text-sm text-[color:var(--color-muted)]">
          {LANDING_SYSTEMS.length} ระบบ · เปิดเพิ่ม-ปิดได้ทีหลัง ไม่ต้องเลือกให้ครบตั้งแต่วันแรก
        </p>
        {/* การ์ดหน้าตาเดียวกับ "เพิ่มระบบ" ในแอป (AddSystemModal) — ไอคอน/ชื่อ/คำอธิบาย
            อ่านจาก SYSTEM_DEFS ทะเบียนเดียวกับที่แอปใช้ → เพี้ยนจากแอปไม่ได้เชิงกลไก */}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {LANDING_SYSTEMS.map((s) => (
            <li key={s.code} className="rounded-xl border p-3 text-left">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span aria-hidden>{s.icon}</span>
                <span>{s.label}</span>
              </div>
              <div className="mt-0.5 text-xs leading-5 text-[color:var(--color-muted)]">{s.hint}</div>
            </li>
          ))}
        </ul>
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

// 🔴 ไอคอน/ชื่อ/คำอธิบาย ต้องเป็นตัวเดียวกับที่ผู้ใช้เห็นในแอป (คำสั่งเจ้าของ 21 ส.ค.)
// → อ่านจาก SYSTEM_DEFS ตรง ๆ ห้ามลอกมาเขียนซ้ำเป็นลิสต์ของตัวเอง
//   (ลิสต์เดิมที่พิมพ์มือไว้เพี้ยนจากแอปแล้วจริง เช่น POS เป็น 💵 แต่ในแอปเป็น 🧾)
// ได้ผลพลอยได้: โฆษณาเกินของจริงไม่ได้ เพราะทะเบียนนี้คือแหล่งเดียวกับที่แอปเปิดระบบ
// (App Review 2.3 Accurate Metadata · เจ้าของสั่งชัด: ห้ามแต่งข้อมูลที่ไม่มีจริง)
const LANDING_SYSTEMS = SYSTEM_DEFS.filter((s) => s.status === "available").sort((a, b) => a.no - b.no);

// ภาพหน้าจอจริง — ถ่ายจากร้านตัวอย่างบน prod ด้วย scripts/shot-landing.mjs
// h = ความสูงจริงของไฟล์หลังย่อ (กัน layout shift ตอนรูปยังโหลดไม่เสร็จ)
const SCREENS: { src: string; h: number; alt: string; caption: string }[] = [
  { src: "/shots/home.webp", h: 750, alt: "หน้าแรกของร้าน แสดงยอดขายวันนี้ จำนวนบิล และนัดหมายของวัน", caption: "หน้าแรก — ยอดขายและงานของวันนี้" },
  { src: "/shots/pos.webp", h: 665, alt: "หน้าขายหน้าร้าน แสดงรายการสินค้าและบริการพร้อมราคา", caption: "ขายหน้าร้าน — แตะเปิดบิล" },
  { src: "/shots/calendar.webp", h: 780, alt: "ปฏิทินรวมนัดหมายของทั้งร้านในเดือนสิงหาคม", caption: "ปฏิทิน — นัดหมายทั้งร้าน" },
  { src: "/shots/inventory.webp", h: 750, alt: "หน้าสินค้าและสต็อก แสดงรายการสินค้าในคลัง", caption: "สินค้า — สต็อกและของใกล้หมด" },
];
