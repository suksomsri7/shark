import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/core/session";
import { accessFor, loginRoster, pageForRender } from "@/lib/pages/service";
import { WidgetTile } from "@/lib/pages/WidgetBoard";

// หน้าแสดงผล Page (สาธารณะ) — /p/<slug>
// ยังไม่ login → จอเลือกชื่อ + PIN (ฟอร์ม HTML ธรรมดา POST /api/page-login — ใช้ใน LINE LIFF ได้)
// login แล้ว → grid widget ตามสิทธิ์ · ความปลอดภัยจริงอยู่ที่ assertCan ชั้น action ของแต่ละระบบ
export default async function PublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug } = await params;
  const { err } = await searchParams;
  const muted = "text-[color:var(--color-muted)]";

  const user = await getSessionUser();
  const access = user ? await accessFor(slug, user.id) : null;

  if (user && access) {
    const data = await pageForRender(slug);
    if (!data) notFound();
    const widgets = data.widgets.filter((w) => !access.allowedKeys || access.allowedKeys.has(w.key));
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-6">
        <header className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{data.page.name}</h1>
            <p className={`truncate text-xs ${muted}`}>{data.unit.name}</p>
          </div>
          <a href={`/logout?to=/p/${slug}`} className="btn btn-ghost min-h-[40px] shrink-0 text-sm">
            ออก
          </a>
        </header>
        {widgets.length === 0 ? (
          <p className={`text-sm ${muted}`}>ยังไม่มีเมนูบนหน้านี้ — ให้เจ้าของร้านจัด widget ก่อน</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {widgets.map((w) => (
              <WidgetTile key={w.id} w={w} href={w.href} />
            ))}
          </div>
        )}
        {access.admin && (
          <a href="#" className="hidden" aria-hidden />
        )}
      </main>
    );
  }

  // จอ login — โชว์เฉพาะชื่อที่ admin ตั้ง (ไม่มีอีเมล) · เข้าได้เฉพาะคนที่ตั้ง PIN แล้ว
  const roster = await loginRoster(slug);
  if (!roster) notFound();
  const loginable = roster.members.filter((m) => m.hasPin);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-4 py-8">
      <header className="text-center">
        <div className="text-3xl">🧩</div>
        <h1 className="mt-2 text-lg font-semibold">{roster.pageName}</h1>
        <p className={`text-xs ${muted}`}>เลือกชื่อของคุณ แล้วใส่ PIN</p>
      </header>

      {err === "pin" && (
        <p className="rounded-lg border px-3 py-2 text-center text-sm text-[color:var(--color-danger)]">
          PIN ไม่ถูกต้อง — ลองใหม่อีกครั้ง
        </p>
      )}
      {err === "nopin" && (
        <p className="rounded-lg border px-3 py-2 text-center text-sm text-[color:var(--color-danger)]">
          คุณยังไม่มี PIN — ให้เจ้าของร้านตั้งให้ก่อน
        </p>
      )}
      {err === "rate" && (
        <p className="rounded-lg border px-3 py-2 text-center text-sm text-[color:var(--color-danger)]">
          ลองผิดหลายครั้งเกินไป — รอสักครู่แล้วลองใหม่
        </p>
      )}

      {loginable.length === 0 ? (
        <p className={`text-center text-sm ${muted}`}>
          ยังไม่มีพนักงานที่เข้าหน้านี้ได้ — ให้เจ้าของร้านเพิ่มพนักงาน + ตั้ง PIN ที่หน้า “การจัดการ”
        </p>
      ) : (
        <form method="POST" action="/api/page-login" className="flex flex-col gap-3">
          <input type="hidden" name="slug" value={slug} />
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            ชื่อของคุณ
            <select name="memberId" required className="input" defaultValue="">
              <option value="" disabled>
                เลือกชื่อ…
              </option>
              {loginable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            PIN
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              minLength={4}
              maxLength={8}
              required
              autoComplete="off"
              className="input text-center text-lg tracking-widest"
            />
          </label>
          <button type="submit" className="btn btn-primary min-h-[52px] text-base">
            เข้าใช้งาน
          </button>
        </form>
      )}
      {user && !access && (
        <p className={`text-center text-xs ${muted}`}>
          บัญชีที่ login อยู่ไม่มีสิทธิ์เข้าหน้านี้ —{" "}
          <a href={`/logout?to=/p/${slug}`} className="underline">
            ออกจากระบบ
          </a>{" "}
          แล้วเข้าด้วยชื่อของคุณ
        </p>
      )}
    </main>
  );
}
