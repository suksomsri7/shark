import { tenantDb } from "@/lib/core/db";

// คลังความรู้ (KB) — FAQ/นโยบาย/ความรู้ร้าน ให้ทีมค้นและผู้ช่วย AI ใช้ตอบ (WO-0073)
// ทุก query ผ่าน tenantDb({ tenantId }) → guard inject tenantId ให้ทุกครั้ง (KbArticle = tenant-scoped)

export type Ctx = { tenantId: string };

export type ArticleInput = { title: string; body: string; category?: string | null };
export type ArticlePatch = {
  title?: string;
  body?: string;
  category?: string | null;
  active?: boolean;
};
export type SearchHit = { id: string; title: string; snippet: string; category: string | null };

// ── สร้างบทความ — หัวข้อ/เนื้อหาว่าง → โยน error ไทย ──
export async function createArticle(ctx: Ctx, input: ArticleInput): Promise<{ id: string }> {
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!title) throw new Error("กรุณากรอกหัวข้อบทความ");
  if (!body) throw new Error("กรุณากรอกเนื้อหาบทความ");
  const category = input.category?.trim() || null;
  const a = await tenantDb(ctx).kbArticle.create({
    // ใส่ tenantId ตรง ๆ ใน data (นอกจาก guard) — type ต้องการ
    data: { tenantId: ctx.tenantId, title, body, category },
    select: { id: true },
  });
  return { id: a.id };
}

// ── แก้บทความ (เฉพาะฟิลด์ที่ส่งมา) — active toggle ด้วย ──
export async function updateArticle(ctx: Ctx, id: string, patch: ArticlePatch): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.body !== undefined) data.body = patch.body.trim();
  if (patch.category !== undefined) data.category = patch.category?.trim() || null;
  if (patch.active !== undefined) data.active = patch.active;
  if (Object.keys(data).length === 0) return;
  // updateMany + guard → กรอง tenantId ใน where เสมอ (กันข้าม tenant + ไม่โยนถ้าไม่พบ)
  await tenantDb(ctx).kbArticle.updateMany({ where: { id }, data });
}

// ── รายการบทความ (filter หมวด + เฉพาะที่เปิดใช้) ──
export async function listArticles(
  ctx: Ctx,
  opts: { category?: string; activeOnly?: boolean } = {},
) {
  const where: Record<string, unknown> = {};
  if (opts.activeOnly) where.active = true;
  if (opts.category) where.category = opts.category;
  return tenantDb(ctx).kbArticle.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
  });
}

// ── หมวดทั้งหมด (distinct จากบทความที่เปิดใช้) ──
export async function listCategories(ctx: Ctx): Promise<string[]> {
  const rows = await tenantDb(ctx).kbArticle.findMany({
    where: { active: true, category: { not: null } },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category).filter((c): c is string => !!c);
}

// snippet รอบคำที่เจอ ไม่เกิน 200 ตัว (เผื่อ … หัว/ท้าย)
function snippetAround(body: string, query: string): string {
  const MAX = 200;
  const idx = body.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return body.slice(0, MAX);
  const start = Math.max(0, idx - 60);
  const core = body.slice(start, start + MAX);
  let out = (start > 0 ? "…" : "") + core + (start + MAX < body.length ? "…" : "");
  if (out.length > MAX) out = out.slice(0, MAX);
  return out;
}

// ── ค้นคลังความรู้ — keyword ใน title+body (case-insensitive) เฉพาะที่เปิดใช้ ──
//    query ว่าง → [] · title-hit มาก่อน body-hit · snippet รอบคำที่เจอ ≤200
export async function searchKb(ctx: Ctx, query: string, take = 20): Promise<SearchHit[]> {
  const q = (query ?? "").trim();
  if (!q) return [];
  const rows = await tenantDb(ctx).kbArticle.findMany({
    where: {
      active: true,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { body: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.max(take, 1) * 3,
  });
  const ql = q.toLowerCase();
  const ranked = rows
    .map((r) => ({ r, titleHit: r.title.toLowerCase().includes(ql) }))
    .sort((a, b) => Number(b.titleHit) - Number(a.titleHit));
  return ranked.slice(0, take).map(({ r }) => ({
    id: r.id,
    title: r.title,
    snippet: snippetAround(r.body, q),
    category: r.category,
  }));
}

// ── หาบทความรายตัว (สำหรับหน้าแก้ไข) ──
export async function getArticle(ctx: Ctx, id: string) {
  return tenantDb(ctx).kbArticle.findFirst({ where: { id } });
}
