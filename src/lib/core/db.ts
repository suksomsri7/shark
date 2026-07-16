import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertRegistryComplete, scopeOf, type ScopeDescriptor } from "./scope";

// ── boot-time assert: ทุก model ใน schema ต้องลงทะเบียน scope ──
// รันครั้งเดียวตอน process โหลดไฟล์นี้ (ทุกเส้นทางที่แตะ DB ผ่านที่นี่)
// → ลืม register model ใหม่ = แอป**ไม่ start** แทนที่จะรอไปโยนกลาง request
// (คู่กับ fitness F1.1 ที่จับตั้งแต่ CI — อันนี้คือตาข่ายชั้นสุดท้าย)
assertRegistryComplete(Prisma.dmmf.datamodel.models.map((m) => m.name));

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
    // เพดาน interactive tx: default 5 วิ เป็นค่ากลาง ไม่ใช่การออกแบบของเรา
    // flow เงิน (recordPayment→ออกใบกำกับ→post GL) มีหลาย query ใน tx เดียว —
    // เครื่องไกล DB (CI อเมริกา→Neon สิงคโปร์ ~250ms/query) ทะลุ 5 วิ → P2028
    // = จ่ายเงินแล้ว side effect หายเงียบ (CPA แดง 12 ข้อบน CI run #17 ทั้งที่เครื่องใกล้ผ่าน)
    // 30 วิ = เพดานกันเหตุ ไม่ใช่เป้า — หนี้ลดจำนวน round-trip บันทึกใน WO แยก
    transactionOptions: { timeout: 30_000, maxWait: 10_000 },
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
// operations ที่ where เป็น unique — ต้องแปลงเป็น *Many เพื่อกันเขียนข้ามขอบเขต (ดู §UNIQUE_OPS)
const READ_UNIQUE = new Set(["findUnique", "findUniqueOrThrow"]);
const WRITE_UNIQUE = new Set(["update", "delete"]);

/**
 * บริบทขอบเขต — 3 แกนจริงของแพลตฟอร์ม
 * (companyId จะเพิ่มตอน Phase 2 Company extraction — ยังไม่มี entity)
 */
type Ctx = { tenantId: string; unitId?: string; systemId?: string };

function andWhere(args: { where?: unknown }, extra: Record<string, unknown>) {
  const prev = (args.where ?? {}) as Record<string, unknown>;
  args.where = { AND: [prev, extra] };
}

/** ตัวกรองตามแกนของ model — โยนถ้าบริบทไม่พอ (fail-closed) */
function filterFor(model: string, d: ScopeDescriptor, ctx: Ctx): Record<string, unknown> {
  const filter: Record<string, unknown> = { tenantId: ctx.tenantId };
  if (d.axis === "unit") {
    if (!ctx.unitId) {
      throw new Error(`[tenantDb] model "${model}" เป็น unit-scoped แต่ไม่ได้ระบุ unitId ในบริบท`);
    }
    filter.unitId = ctx.unitId;
  }
  if (d.axis === "system") {
    if (!ctx.systemId) {
      throw new Error(`[tenantDb] model "${model}" เป็น system-scoped แต่ไม่ได้ระบุ systemId ในบริบท`);
    }
    filter[d.systemField ?? "systemId"] = ctx.systemId;
  }
  return filter;
}

/**
 * Prisma client ผูกบริบทร้าน — inject tenantId (+unitId/+systemId) อัตโนมัติ ทุก query
 * เป็น defense-in-depth ชั้น 2 (ชั้น 1 = can() ที่ handler)
 *
 *   const db = tenantDb({ tenantId, unitId })      // unit-scoped model
 *   const db = tenantDb({ tenantId, systemId })    // system-scoped model (account/chat/point/…)
 *   await db.member.findMany()                     // → WHERE tenantId = ...
 */
export function tenantDb(ctx: Ctx) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const d = scopeOf(model); // fail-closed: model ที่ไม่ได้ลงทะเบียน = โยนที่นี่
          if (d.axis !== "tenant" && d.axis !== "unit" && d.axis !== "system") return query(args);

          const filter = filterFor(model, d, ctx);
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
              ? data.map((x) => ({ ...(x as object), ...filter }))
              : { ...(data as object), ...filter };
            return query(a);
          }
          if (operation === "upsert") {
            andWhere(a, filter);
            a.create = { ...(a.create as object), ...filter };
            return query(a);
          }

          // ── READ unique: where เป็น unique → ตรวจผลหลัง query (อ่านอย่างเดียว ไม่มีผลข้างเคียง)
          if (READ_UNIQUE.has(operation)) {
            const result = (await query(a)) as (Record<string, unknown> & Partial<Ctx>) | null;
            if (result && !inScope(result, filter)) return cross(model, operation);
            return result;
          }

          // ── WRITE unique (update/delete): ห้ามใช้ท่า "เขียนก่อนแล้วค่อยเช็ค"
          // ของเดิมรัน query แล้วค่อยเทียบ tenantId → **เขียนลง DB ไปแล้ว** ค่อย throw
          // = แก้/ลบ row ข้าม tenant ได้จริง (ผู้โจมตีได้ error กลับไป แต่ข้อมูลเปลี่ยนแล้ว)
          //
          // แก้: merge ตัวกรองเข้า where ตรง ๆ — Prisma 7 รองรับ "filtered update"
          // (ใส่ฟิลด์ non-unique เพิ่มใน where ของ update/delete ได้) → ตัวกรองลงไปอยู่ใน SQL
          // ไม่ตรง = โยน P2025 **โดยไม่เขียน** = preventive จริง ไม่ใช่ post-hoc
          // (ยืนยันแล้วกับ Neon: where ไม่ตรง → P2025 + row ไม่ถูกแก้)
          if (WRITE_UNIQUE.has(operation)) {
            a.where = { ...(a.where as object), ...filter };
            return query(a);
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

const inScope = (row: Record<string, unknown>, filter: Record<string, unknown>) =>
  Object.entries(filter).every(([k, v]) => row[k] === undefined || row[k] === v);

// เจอ record ข้ามขอบเขต → ปฏิบัติเหมือนไม่พบ (404) ไม่ leak ว่ามีอยู่
function cross(model: string, operation: string) {
  if (operation.endsWith("OrThrow") || operation === "update" || operation === "delete") {
    throw new Error(`[tenantDb] ${model}.${operation}: record อยู่นอกขอบเขต tenant/unit/system`);
  }
  return null;
}

export type TenantDb = ReturnType<typeof tenantDb>;
