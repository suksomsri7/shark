import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { listArticles, listCategories, searchKb } from "@/lib/modules/kb/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataList } from "@/components/ui/DataList";

// คลังความรู้ (KB) — รายการบทความ + filter หมวด + ช่องค้นหา
export default async function KbListPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId };
  const { category, q } = await searchParams;
  const query = (q ?? "").trim();
  const activeCategory = (category ?? "").trim();

  const categories = await listCategories(ctx);

  // ถ้ามีคำค้น → ใช้ searchKb (แสดง snippet) · ไม่มี → รายการทั้งหมด (filter หมวด)
  let rows: { id: string; title: string; secondary: string; active: boolean }[];
  if (query) {
    const hits = await searchKb(ctx, query, 50);
    rows = hits.map((h) => ({
      id: h.id,
      title: h.title,
      secondary: `${h.category ? `${h.category} · ` : ""}${h.snippet}`,
      active: true,
    }));
  } else {
    const arts = await listArticles(ctx, activeCategory ? { category: activeCategory } : {});
    rows = arts.map((a) => ({
      id: a.id,
      title: a.title,
      secondary: a.category ?? "ไม่มีหมวด",
      active: a.active,
    }));
  }

  const chipCls = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${
      on ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] font-medium" : ""
    }`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="📚 คลังความรู้"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="FAQ / นโยบาย / ความรู้ร้าน ให้ทีมค้นหาและผู้ช่วย AI ใช้ตอบลูกค้า"
        actions={
          <Link href="/app/kb/new" className="btn btn-primary text-sm">
            + สร้างบทความ
          </Link>
        }
      />

      {/* ช่องค้นหา (GET → ?q=) */}
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="ค้นหาในคลังความรู้…"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
        />
        <button type="submit" className="btn btn-ghost text-sm">
          ค้นหา
        </button>
      </form>

      {/* filter หมวด (เฉพาะโหมดรายการ ไม่ใช่ตอนค้นหา) */}
      {!query && categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link href="/app/kb" className={chipCls(!activeCategory)}>
            ทั้งหมด
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={`/app/kb?category=${encodeURIComponent(c)}`}
              className={chipCls(activeCategory === c)}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      <DataList
        items={rows.map((r) => ({
          key: r.id,
          href: `/app/kb/${r.id}`,
          primary: (
            <span className="flex items-center gap-2">
              {r.title}
              {!r.active && (
                <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-[color:var(--color-muted)]">
                  ปิดอยู่
                </span>
              )}
            </span>
          ),
          secondary: r.secondary,
        }))}
        empty={
          query
            ? `ไม่พบบทความที่ตรงกับ “${query}”`
            : "ยังไม่มีบทความ — กด “+ สร้างบทความ” เพื่อเริ่มเก็บความรู้ร้าน"
        }
      />
    </div>
  );
}
