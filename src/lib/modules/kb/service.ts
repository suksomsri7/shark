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

// ── ค้นคลังความรู้ — keyword fuzzy: แตกคำถามเป็นคำ ๆ แล้ว match "คำใดคำหนึ่ง" (OR)
//    จัดอันดับตามจำนวนคำที่ตรง (title ถ่วง ×3) → ลูกค้าถามด้วยคำไม่ตรงเป๊ะก็เจอ
//    เดิม: contains ทั้ง query (exact substring) → ถามผิดคำนิดเดียวก็ไม่เจอ AI ตอบมั่ว
//    query ว่าง → [] · snippet รอบคำแรกที่เจอ ≤200
export async function searchKb(ctx: Ctx, query: string, take = 20): Promise<SearchHit[]> {
  const q = (query ?? "").trim();
  if (!q) return [];
  // แตกเป็นคำ (เว้นวรรค) + ตัดคำสั้น <2 · คงคำเต็มไว้ด้วยเผื่อวลี
  const tokens = [...new Set([q, ...q.split(/\s+/)].map((t) => t.trim()).filter((t) => t.length >= 2))];
  const terms = tokens.length ? tokens : [q];

  const rows = await tenantDb(ctx).kbArticle.findMany({
    where: {
      active: true,
      OR: terms.flatMap((t) => [
        { title: { contains: t, mode: "insensitive" as const } },
        { body: { contains: t, mode: "insensitive" as const } },
      ]),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.max(take, 1) * 5,
  });

  // ให้คะแนน: คำที่ตรงใน title ×3 + ใน body ×1 (นับคำที่ต่างกัน) → เรียงมาก→น้อย
  const scored = rows
    .map((r) => {
      const tl = r.title.toLowerCase();
      const bl = r.body.toLowerCase();
      let score = 0;
      for (const t of terms) {
        const tt = t.toLowerCase();
        if (tl.includes(tt)) score += 3;
        else if (bl.includes(tt)) score += 1;
      }
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.r.updatedAt.getTime() - a.r.updatedAt.getTime());

  // snippet รอบคำแรกที่ทำให้เจอ (คำที่ยาวสุดก่อน — เจาะจงกว่า)
  const bestTerm = [...terms].sort((a, b) => b.length - a.length);
  return scored.slice(0, take).map(({ r }) => {
    const hit = bestTerm.find((t) => r.body.toLowerCase().includes(t.toLowerCase())) ?? q;
    return { id: r.id, title: r.title, snippet: snippetAround(r.body, hit), category: r.category };
  });
}

// ── หาบทความรายตัว (สำหรับหน้าแก้ไข) ──
export async function getArticle(ctx: Ctx, id: string) {
  return tenantDb(ctx).kbArticle.findFirst({ where: { id } });
}
