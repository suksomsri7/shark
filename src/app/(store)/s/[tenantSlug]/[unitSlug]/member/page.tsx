import Link from "next/link";
import { resolveMemberUnit } from "@/lib/modules/member/service";
import { registerMemberAction } from "./actions";

export const dynamic = "force-dynamic";

// หน้าสมัครสมาชิกออนไลน์ (public · ไม่ต้องล็อกอิน) — กรอกชื่อ/เบอร์/อีเมล + ยินยอมรับข่าวสาร (PDPA)
export default async function PublicMemberSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string; code?: string; name?: string; phone?: string; email?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;

  const resolved = await resolveMemberUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">ยังไม่เปิดรับสมัครสมาชิก</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          ลิงก์อาจไม่ถูกต้อง หรือร้านยังไม่เปิดระบบสมาชิกออนไลน์ กรุณาสอบถามที่หน้าร้าน
        </p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // หน้า "สมัครสำเร็จ" — แสดงรหัสสมาชิก
  if (sp.code) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-12 text-center">
        <div className="text-2xl font-semibold">สมัครสมาชิกสำเร็จ 🎉</div>
        <p className="text-sm text-[color:var(--color-muted)]">
          ยินดีต้อนรับสู่สมาชิกของ {unit.name}
        </p>
        <div className="rounded-2xl border p-5">
          <div className="text-xs text-[color:var(--color-muted)]">รหัสสมาชิกของคุณ</div>
          <div className="mt-1 text-3xl font-bold tracking-widest">{sp.code}</div>
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">
          กรุณาบันทึกหรือแจ้งรหัสนี้ที่หน้าร้านเพื่อรับสิทธิ์สมาชิก
        </p>
        <Link
          href={`/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/member`}
          className="btn min-h-[44px] text-sm"
        >
          สมัครอีกคน
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      <header className="text-center">
        <div className="text-xl font-semibold">สมัครสมาชิก {unit.name}</div>
        <div className="text-sm text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {sp.err && (
        <div className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-center text-sm text-[color:var(--color-danger)]">
          {sp.err}
        </div>
      )}

      <form action={registerMemberAction} className="card flex flex-col gap-3">
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="unitSlug" value={unitSlug} />

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ชื่อ</span>
          <input
            name="name"
            defaultValue={sp.name ?? ""}
            placeholder="ชื่อของคุณ"
            className="input min-h-[44px]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">เบอร์โทร</span>
          <input
            name="phone"
            inputMode="tel"
            defaultValue={sp.phone ?? ""}
            placeholder="เช่น 0812345678"
            className="input min-h-[44px]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">อีเมล (ไม่บังคับ)</span>
          <input
            name="email"
            type="email"
            defaultValue={sp.email ?? ""}
            placeholder="name@example.com"
            className="input min-h-[44px]"
          />
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="marketingConsent" className="mt-0.5 h-5 w-5" />
          <span>ยินยอมรับข่าวสารและโปรโมชันจากร้าน (ยกเลิกได้ภายหลัง)</span>
        </label>

        <p className="text-xs text-[color:var(--color-muted)]">
          กรอกชื่อหรือเบอร์โทรอย่างน้อย 1 อย่าง
        </p>

        <button className="btn btn-primary min-h-[44px] text-sm">สมัครสมาชิก</button>
      </form>
    </main>
  );
}
