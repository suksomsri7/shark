import { redirect } from "next/navigation";
import { getAuth } from "@/lib/core/context";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.active) redirect("/app"); // มีร้านแล้ว

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold tracking-widest text-[color:var(--color-muted)]">
          SHARK
        </div>
        <h1 className="text-2xl font-semibold">ตั้งค่าร้านของคุณ</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          ใช้เวลาไม่ถึงนาที — เพิ่มกิจการอื่นได้ภายหลัง
        </p>
      </div>
      <OnboardingForm />
    </main>
  );
}
