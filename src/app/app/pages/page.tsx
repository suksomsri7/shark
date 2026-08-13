import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { listPages } from "@/lib/pages/service";
import { createPageAction } from "@/lib/pages/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { SubmitButton } from "@/components/ui/SubmitButton";

// ระบบ "การจัดการ" — รวมทุกกิจการ + Page ของแต่ละกิจการ (มติเจ้าของ 13 ส.ค. 2026)
// Page = หน้ารวม widget ให้พนักงานใช้ / เอา URL ไปใส่ LINE LIFF · 1 กิจการมีได้หลาย Page
export default async function PagesHomePage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [units, pages] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, type: true },
    }),
    listPages({ tenantId }),
  ]);
  const muted = "text-[color:var(--color-muted)]";
  const byUnit = new Map<string, typeof pages>();
  for (const p of pages) byUnit.set(p.unitId, [...(byUnit.get(p.unitId) ?? []), p]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader
        title="🧩 การจัดการ (Page)"
        desc="สร้างหน้า Page ต่อกิจการ — จัด widget ให้พนักงานใช้ หรือเอาลิงก์ไปใส่ LINE LIFF"
      />

      {units.length === 0 ? (
        <p className={`text-sm ${muted}`}>ยังไม่มีกิจการ — สร้างกิจการก่อนจึงสร้าง Page ได้</p>
      ) : (
        units.map((u) => {
          const unitPages = byUnit.get(u.id) ?? [];
          return (
            <Section key={u.id} title={`${systemDef(u.type)?.icon ?? "•"} ${u.name}`}>
              <div className="flex flex-col gap-2">
                {unitPages.length === 0 && (
                  <p className={`text-xs ${muted}`}>ยังไม่มี Page ของกิจการนี้ — สร้างด้านล่าง</p>
                )}
                {unitPages.map((p) => (
                  <Link
                    key={p.id}
                    href={`/app/pages/${p.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:bg-[color:var(--color-surface-2)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {p.name}
                        {!p.active && <span className="ml-2 text-xs text-[color:var(--color-danger)]">(ปิดอยู่)</span>}
                      </span>
                      <span className={`block truncate text-xs ${muted}`}>
                        /p/{p.slug} · {p.widgets.length} widget · พนักงาน {p.members.length} คน
                      </span>
                    </span>
                    <span className={`shrink-0 text-xs ${muted}`}>จัดการ →</span>
                  </Link>
                ))}
                <form action={createPageAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed px-3 py-2">
                  <input type="hidden" name="unitId" value={u.id} />
                  <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
                    ชื่อ Page ใหม่
                    <input name="name" required placeholder="เช่น หน้าพนักงานหน้าร้าน" className="input min-w-0" />
                  </label>
                  <SubmitButton>+ สร้าง Page</SubmitButton>
                </form>
              </div>
            </Section>
          );
        })
      )}
      <p className={`text-xs ${muted}`}>
        การผูกโดเมนของร้านเข้า Page (เช่น page.ร้านคุณ.com) = งานเฟสถัดไป — บันทึกไว้แล้ว
      </p>
    </div>
  );
}
