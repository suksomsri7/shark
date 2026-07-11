import { confirmMagicLinkAction } from "@/lib/actions/auth";

// interstitial ของ magic link — GET แสดงปุ่ม, consume เกิดตอน POST เท่านั้น
// (กัน email scanner/prefetch เผา token ผ่าน GET) — SECURITY §1
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="flex w-full max-w-sm flex-col gap-5 text-center">
        <h1 className="text-2xl font-semibold">ยืนยันการเข้าสู่ระบบ</h1>
        {token ? (
          <form action={confirmMagicLinkAction}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="btn btn-primary w-full">
              เข้าสู่ระบบ
            </button>
          </form>
        ) : (
          <p className="text-sm text-[color:var(--color-danger)]">ลิงก์ไม่ถูกต้องหรือหมดอายุ</p>
        )}
      </div>
    </main>
  );
}
