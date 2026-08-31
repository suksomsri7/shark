import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/core/context";
import { OnboardingForm } from "@/components/onboarding-form";

// ?add=1 = "เพิ่มกิจการ" จากในแอป (มีกิจการอยู่แล้ว) — ไม่มีพารามิเตอร์ = สมัครใหม่ครั้งแรก
//
// 🔴 31 ส.ค. 2026: ปุ่ม "+ เพิ่มกิจการ" ในเมนูกดแล้วไม่มีอะไรเกิดขึ้น เพราะหน้านี้เด้งกลับ /app
// ทันทีที่ผู้ใช้มีกิจการอยู่แล้ว — ด่านที่กันคนสมัครใหม่ ดันกันคนที่จะเปิดกิจการที่สองไปด้วย
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const adding = add === "1";
  if (auth.active && !adding) redirect("/app"); // มีร้านแล้ว และไม่ได้ตั้งใจเพิ่มใหม่

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        {adding ? (
          <Link href="/app" className="text-sm text-[color:var(--color-muted)]">
            ← กลับหน้าหลัก
          </Link>
        ) : (
          <div className="text-sm font-semibold tracking-widest text-[color:var(--color-muted)]">
            SHARK
          </div>
        )}
        <h1 className="text-2xl font-semibold">{adding ? "เพิ่มกิจการใหม่" : "ยินดีต้อนรับ 👋"}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          {adding
            ? "ตั้งชื่อกิจการใหม่ — ข้อมูลของแต่ละกิจการแยกกันคนละชุด สลับไปมาได้จากเมนู"
            : "บอกชื่อกิจการของคุณ แล้วให้ AI ช่วยประกอบระบบให้"}
        </p>
      </div>
      <OnboardingForm />
    </main>
  );
}
