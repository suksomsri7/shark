// HomeFilters.tsx — แถบค้นหา + ตัวกรองของหน้าแรก CRM (ใบ C3.2 · ภาพ 01 การ์ดตัวกรอง) — server component ล้วน (ฟอร์ม GET · ไม่ต้องมี JS)
//   • ค้นหา → รายการดีลแบบตาราง (`/crm/deals?view=table&q=`)
//   • pipeline · ผู้ดูแล · ช่วงเวลา → เปลี่ยน URL ของหน้าแรก (`?pipeline=&owner=&period=`) แล้วหน้าคิดตัวเลขใหม่ฝั่งเซิร์ฟเวอร์
//   • มุมมองที่บันทึก (ของดีล — objectKey "deal") → เปิดรายการดีลตามมุมมองนั้น
// 🔴 ไม่ import โมดูล CRM (ด่าน F2.3) · ตัวเลือกทั้งหมดมาทาง props (ผ่านการมองเห็นแล้ว)
// 🔴 390 px: ทุกช่องกว้างเต็มแถวแล้วค่อยเรียงเป็นแถวเดียวบนจอกว้าง · ไม่มีความกว้างตายตัวที่ดันหน้ากว้างเกินจอ

import Link from "next/link";

export type HomeFilterOption = { value: string; label: string };
export type HomeSavedViewLink = { id: string; name: string; href: string };

const muted = "text-[color:var(--color-muted)]";

export function HomeFilters({
  homeHref,
  dealsHref,
  pipelines,
  owners,
  periods,
  current,
  savedViews,
}: {
  /** `/app/sys/{id}` — ปลายทางของฟอร์มตัวกรอง */
  homeHref: string;
  /** `/app/sys/{id}/crm/deals` — ปลายทางของช่องค้นหา */
  dealsHref: string;
  pipelines: HomeFilterOption[];
  /** ว่าง = ผู้ดูเห็นแค่ของตัวเอง (ระดับรายงาน OWN) ⇒ ไม่แสดงช่องผู้ดูแล */
  owners: HomeFilterOption[];
  periods: HomeFilterOption[];
  current: { pipeline: string; owner: string; period: string };
  savedViews: HomeSavedViewLink[];
}) {
  const active = !!(current.pipeline || current.owner || current.period);
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" aria-label="ค้นหาและกรอง">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
        <form action={dealsHref} method="get" className="min-w-0 lg:w-72" role="search" data-testid="crm-home-search-form">
          <input type="hidden" name="view" value="table" />
          <label className="sr-only" htmlFor="crm-home-search">ค้นหาดีล</label>
          <input id="crm-home-search" name="q" type="search" placeholder="ค้นดีล ผู้ติดต่อ บริษัท…" className="input" data-testid="crm-home-search" maxLength={100} />
        </form>
        <form action={homeHref} method="get" className="flex min-w-0 flex-1 flex-wrap items-center gap-2" data-testid="crm-home-filter-form">
          <label className="flex min-w-0 flex-1 basis-40 flex-col text-xs sm:flex-none sm:basis-auto">
            <span className="sr-only">pipeline</span>
            <select name="pipeline" defaultValue={current.pipeline} className="input" data-testid="crm-home-filter-pipeline" aria-label="pipeline">
              <option value="">pipeline: ทั้งหมด</option>
              {pipelines.map((p) => (
                <option key={p.value} value={p.value}>
                  pipeline: {p.label}
                </option>
              ))}
            </select>
          </label>
          {owners.length > 0 && (
            <label className="flex min-w-0 flex-1 basis-40 flex-col text-xs sm:flex-none sm:basis-auto">
              <span className="sr-only">ผู้ดูแล</span>
              <select name="owner" defaultValue={current.owner} className="input" data-testid="crm-home-filter-owner" aria-label="ผู้ดูแล">
                <option value="">ผู้ดูแล: ทั้งหมด</option>
                {owners.map((o) => (
                  <option key={o.value} value={o.value}>
                    ผู้ดูแล: {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-w-0 flex-1 basis-40 flex-col text-xs sm:flex-none sm:basis-auto">
            <span className="sr-only">ช่วงเวลา</span>
            <select name="period" defaultValue={current.period} className="input" data-testid="crm-home-filter-range" aria-label="ช่วงเวลา">
              {periods.map((p) => (
                <option key={p.value} value={p.value}>
                  ช่วง: {p.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-sm" data-testid="crm-home-filter-apply">
            กรอง
          </button>
          {active && (
            <Link href={homeHref} className={`text-sm ${muted}`} data-testid="crm-home-filter-reset">
              ล้างตัวกรอง
            </Link>
          )}
        </form>
      </div>
      {/* ภาพ 01: ชิป "มุมมองที่บันทึก" ใต้แถวตัวกรอง — เปิดรายการดีลตามมุมมอง (บันทึกมุมมองใหม่ได้ที่หน้ารายการดีล) */}
      <details className="group min-w-0 self-start">
        <summary
          className="inline-flex max-w-full cursor-pointer list-none items-center gap-1.5 truncate rounded-full border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-3 py-1 text-xs font-medium text-[color:var(--color-accent)]"
          data-testid="crm-home-saved-view"
        >
          มุมมองที่บันทึก{savedViews.length ? `: ${savedViews[0]!.name}${savedViews.length > 1 ? ` (+${savedViews.length - 1})` : ""}` : " — ยังไม่มี"}
          <span aria-hidden="true">▾</span>
        </summary>
        <ul className="card mt-2 flex min-w-0 flex-col gap-1 p-2 text-sm">
          {savedViews.length === 0 ? (
            <li className={`px-2 py-1 text-xs ${muted}`}>ยังไม่มีมุมมองของดีล — กรองที่หน้ารายการดีลแล้วกด “บันทึกมุมมองนี้”</li>
          ) : (
            savedViews.map((v) => (
              <li key={v.id}>
                <Link href={v.href} className="block truncate rounded-lg px-2 py-1 hover:bg-[color:var(--color-surface-2)]" data-testid={`crm-home-saved-view-item-${v.id}`}>
                  {v.name}
                </Link>
              </li>
            ))
          )}
        </ul>
      </details>
    </section>
  );
}
