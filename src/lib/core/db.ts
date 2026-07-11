import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { scopeOf } from "./scope";

// ─────────────────────────────────────────────────────────────
// Base client (singleton) — Prisma 7 driver adapter (pg)
// runtime ใช้ DATABASE_URL (pooled, Neon). Neon serverless เต็มรูป → สลับเป็น
// @prisma/adapter-neon ภายหลังได้โดยไม่แตะ callsite (ดู docs/INFRA.md §2)
// ใช้ตรงได้เฉพาะ global-scope models (auth/session/tenant lookup) และ platform
// งานในบริบทร้าน ให้ใช้ tenantDb() เสมอ
// ─────────────────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const isDev = process.env.NODE_ENV !== "production";

// operations ที่ตัวกรองอยู่ใน args.where
const WHERE_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);
// operations ที่ผูก tenant กับผลลัพธ์ (ตรวจหลัง query)
const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete"]);

type Ctx = { tenantId: string; unitId?: string };

function andWhere(args: { where?: unknown }, extra: Record<string, unknown>) {
  const prev = (args.where ?? {}) as Record<string, unknown>;
  args.where = { AND: [prev, extra] };
}

/**
 * Prisma client ผูกบริบทร้าน — inject tenantId (+unitId) อัตโนมัติ ทุก query
 * เป็น defense-in-depth ชั้น 2 (ชั้น 1 = can() ที่ handler)
 *
 *   const db = tenantDb({ tenantId, unitId })   // unitId บังคับเมื่อแตะ unit-scoped model
 *   await db.member.findMany()                   // → WHERE tenantId = ...
 */
export function tenantDb(ctx: Ctx) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scope = scopeOf(model);
          if (scope !== "tenant" && scope !== "unit") return query(args);

          const filter: Record<string, unknown> = { tenantId: ctx.tenantId };
          if (scope === "unit") {
            if (!ctx.unitId) {
              throw new Error(
                `[tenantDb] model "${model}" เป็น unit-scoped แต่ไม่ได้ระบุ unitId ในบริบท`,
              );
            }
            filter.unitId = ctx.unitId;
          }

          const a = (args ?? {}) as Record<string, unknown>;

          if (WHERE_OPS.has(operation)) {
            andWhere(a, filter);
            return query(a);
          }

          if (operation === "create") {
            a.data = { ...(a.data as object), ...filter };
            return query(a);
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const data = a.data;
            a.data = Array.isArray(data)
              ? data.map((d) => ({ ...(d as object), ...filter }))
              : { ...(data as object), ...filter };
            return query(a);
          }
          if (operation === "upsert") {
            andWhere(a, filter);
            a.create = { ...(a.create as object), ...filter };
            return query(a);
          }

          // findUnique/update/delete: where เป็น unique — ตรวจ tenant หลัง query
          if (UNIQUE_OPS.has(operation)) {
            const result = (await query(a)) as
              | (Record<string, unknown> & { tenantId?: string; unitId?: string })
              | null;
            if (result) {
              if (result.tenantId !== ctx.tenantId) return cross(model, operation);
              if (scope === "unit" && result.unitId !== ctx.unitId)
                return cross(model, operation);
            }
            return result;
          }

          if (isDev) {
            throw new Error(
              `[tenantDb] operation "${operation}" ยังไม่รองรับ guard สำหรับ ${model} — เพิ่มใน db.ts`,
            );
          }
          return query(a);
        },
      },
    },
  });
}

// เจอ record ข้าม tenant/unit → ปฏิบัติเหมือนไม่พบ (404) ไม่ leak ว่ามีอยู่
function cross(model: string, operation: string) {
  if (operation.endsWith("OrThrow") || operation === "update" || operation === "delete") {
    throw new Error(`[tenantDb] ${model}.${operation}: record อยู่นอกขอบเขต tenant/unit`);
  }
  return null;
}

export type TenantDb = ReturnType<typeof tenantDb>;
