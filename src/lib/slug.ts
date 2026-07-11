import type { Prisma, PrismaClient } from "@prisma/client";

// slug จากชื่อ (ไทยล้วน → fallback + สุ่ม). a-z0-9 เท่านั้น
export function slugify(input: string, fallback = "shop"): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

// slug ระดับ tenant ที่ไม่ซ้ำ
export async function uniqueTenantSlug(
  tx: PrismaClient | Prisma.TransactionClient,
  name: string,
): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base}-${suffix()}`;
    const exists = await tx.tenant.findUnique({ where: { slug } });
    if (!exists) return slug;
  }
  return `${base}-${suffix()}${suffix()}`;
}
