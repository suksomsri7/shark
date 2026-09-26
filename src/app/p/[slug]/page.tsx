import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/core/session";
import { accessFor, loginRoster, pageForRender, pageViewer, type RenderWidget } from "@/lib/pages/service";
import { WidgetTile } from "@/lib/pages/WidgetBoard";
// CRM C3.6 ▸ widget ข้อมูลของ CRM ("ดีลของฉัน" · "งานวันนี้" · "พอร์ทัลลูกค้า") — facade เท่านั้น (F2.3) ◂
import * as crm from "@/lib/modules/crm";
import { toMemberActor } from "@/lib/modules/member";
import { CrmDataWidgets, type CrmWidgetData } from "@/components/pages/CrmDataWidgets";

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
  // "เข้าได้ไหม" กับ "หน้ามีอะไร" ไม่ขึ้นแก่กัน → ยิงพร้อมกัน (เดิมรอ accessFor จบก่อนค่อยเริ่มโหลดหน้า)
  // การค้น Page จาก slug ถูก dedupe ด้วย cache() ใน service → ไม่ได้ยิง DB เพิ่ม
  const [access, data] = user
    ? await Promise.all([accessFor(slug, user.id), pageForRender(slug)])
    : [null, null];

  if (user && access) {
    if (!data) notFound();
    const allowed = data.widgets.filter((w) => !access.allowedKeys || access.allowedKeys.has(w.key));
    // CRM C3.6 ▸ widget ข้อมูลแยกออกมาเป็นกล่อง — ที่เหลือเป็นไทล์ลิงก์แบบเดิม ◂
    const widgets = allowed.filter((w) => !w.data);
    const dataWidgets = await crmWidgetData(slug, user.id, allowed.filter((w) => !!w.data));
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
        <CrmDataWidgets widgets={dataWidgets} />
        {widgets.length === 0 && dataWidgets.length === 0 ? (
          <p className={`text-sm ${muted}`}>ยังไม่มีเมนูบนหน้านี้ — ให้เจ้าของร้านจัด widget ก่อน</p>
        ) : widgets.length === 0 ? null : (
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

// CRM C3.6 ▸ โหลดข้อมูลของ widget CRM ด้วย **session ของคนที่เปิดหน้า** (หลังผ่าน accessFor แล้ว) — `crm.widgets.myDeals/todayTasks`
//   ใช้ visibleWhere ของ actor นี้ (เห็นเท่าที่เขาเห็นในแอป) · โหลดไม่ได้ (ไม่มีสิทธิ์ดีล/งาน · ระบบปิด v2) = กล่องบอกเหตุผลไทย ไม่พังทั้งหน้า
//   🔴 ห้ามใช้สิทธิ์ของเจ้าของ Page/เจ้าของร้านแทน — widget ข้อมูลต้องเคารพการมองเห็นของผู้เปิดเสมอ (AUDIT-CLASS X1)
const baht = (satang: number) => `฿${(Math.round(satang) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const reasonOf = (e: unknown) => (e instanceof Error && /[ก-๙]/.test(e.message) ? e.message : "โหลดข้อมูลไม่สำเร็จ — ลองรีเฟรชหน้าอีกครั้ง");

async function crmWidgetData(slug: string, userId: string, list: RenderWidget[]): Promise<CrmWidgetData[]> {
  if (list.length === 0) return [];
  const viewer = await pageViewer(slug, userId);
  if (!viewer) return [];
  const actor = toMemberActor(userId, viewer.membership);
  const out: CrmWidgetData[] = [];
  for (const w of list) {
    if (!w.systemId) continue;
    const ctx = { tenantId: viewer.tenantId, systemId: w.systemId, actorUserId: userId };
    if (w.data === "crm.myDeals") {
      try {
        const r = await crm.widgets.myDeals(ctx, actor, { limit: 5 });
        out.push({ kind: "myDeals", id: w.id, title: w.title, moreHref: w.href, total: r.total, items: r.items.map((d) => ({ id: d.id, title: d.title, value: baht(d.valueSatang), stageName: d.stageName, stalled: d.stalled, href: d.href })) });
      } catch (e) {
        out.push({ kind: "myDeals", id: w.id, title: w.title, moreHref: w.href, total: 0, items: [], error: reasonOf(e) });
      }
    } else if (w.data === "crm.todayTasks") {
      try {
        const now = new Date();
        const r = await crm.widgets.todayTasks(ctx, actor, { now, limit: 10 });
        const dayStart = crm.thaiDayStartMs(now.getTime());
        out.push({
          kind: "todayTasks",
          id: w.id,
          title: w.title,
          moreHref: w.href,
          counts: r.counts,
          items: r.items.map((t) => {
            const ms = t.dueAt ? Date.parse(t.dueAt) : NaN;
            const overdue = !t.done && Number.isFinite(ms) && ms < dayStart;
            return { id: t.id, title: t.title, done: t.done, overdue, href: t.href, when: t.done ? "เสร็จแล้ว" : Number.isFinite(ms) ? (overdue ? crm.thaiDateLabel(ms) : crm.thaiTimeLabel(ms)) : "" };
          }),
        });
      } catch (e) {
        out.push({ kind: "todayTasks", id: w.id, title: w.title, moreHref: w.href, counts: { today: 0, overdue: 0, done: 0 }, items: [], error: reasonOf(e) });
      }
    } else if (w.data === "crm.portalEntry") {
      const r = await crm.widgets.portalShopEntry(ctx).catch(() => null);
      out.push({ kind: "portal", id: w.id, title: w.title, href: r?.href ?? null });
    }
  }
  return out;
}
// ◂ CRM C3.6
