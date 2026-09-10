// ตัวช่วยร่วมของ backfill "ระบบสมาชิก v2" (M1.1 · พิมพ์เขียว §4.6)
//
// ทุกสคริปต์ `member-backfill-*.mts` ใช้โครงเดียวกัน (แบบ backfill-kanban-v2-a.mts):
//   • env: QC เป็นค่าเริ่มต้น · จะแตะฐานจริงต้องตั้ง ALLOW_PROD_BACKFILL=1 มาเอง
//   • args: `--tenant <slug>` (ไม่ระบุ = ทุกร้าน) · `--dry-run` (พิมพ์อย่างเดียว ไม่เขียนอะไรเลย)
//   • idempotent: แถวที่มีค่า/มีอยู่แล้วถูกข้าม ⇒ รันกี่รอบผลเท่าเดิม
//   • ทีละร้านใน transaction เดียว (ร้านหนึ่งล้ม ไม่ทิ้งครึ่ง ๆ กลาง ๆ · ร้านอื่นเดินต่อ)
//
// 🔴 ทำไมต้อง dry-run ที่ "ไม่เขียนอะไรเลย" จริง ๆ ไม่ใช่ rollback:
//    backfill ชุดนี้จะถูกรันบน prod ทีละร้านโดยคนที่ไม่ได้เขียนโค้ด ⇒ ต้องดูผลก่อนได้แบบไม่มีความเสี่ยง
//    (rollback ยังกิน sequence/ยังยิง trigger ได้ · "ไม่เรียกคำสั่งเขียน" ปลอดภัยกว่าเสมอ)

import { existsSync } from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type BackfillArgs = { tenantSlug: string | null; dryRun: boolean };

/** อ่าน `--tenant <slug>` / `--tenant=<slug>` / `--dry-run` จาก argv */
export function parseArgs(argv: string[] = process.argv.slice(2)): BackfillArgs {
  let tenantSlug: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? "";
    if (a === "--tenant") {
      tenantSlug = (argv[i + 1] ?? "").trim() || null;
      i += 1;
    } else if (a.startsWith("--tenant=")) {
      tenantSlug = a.slice("--tenant=".length).trim() || null;
    } else if (a === "--dry-run" || a === "--dryrun") {
      dryRun = true;
    }
  }
  return { tenantSlug, dryRun };
}

/**
 * ด่าน env — เหมือน backfill-kanban-v2-a.mts ทุกประการ
 * QC (ค่าเริ่มต้น) = โหลด .env.qc ผ่าน loadQcEnv ซึ่งมีด่านกัน host ของ production ในตัว
 * prod = ต้องตั้ง ALLOW_PROD_BACKFILL=1 เอง (ตั้งใจให้พิมพ์ยาว ๆ ไม่ให้เผลอ)
 */
export async function loadBackfillEnv(script: string): Promise<void> {
  const QC_FILE = process.env.QC_ENV_FILE ?? ".env.qc";
  if (process.env.ALLOW_PROD_BACKFILL === "1") {
    try {
      process.loadEnvFile(process.env.BACKFILL_ENV_FILE ?? ".env");
    } catch {
      /* env ถูก export มาแล้วก็ได้ */
    }
    console.warn("⚠️  ALLOW_PROD_BACKFILL=1 — กำลังรันบนฐานข้อมูลจริงตามที่สั่ง");
    return;
  }
  if (existsSync(QC_FILE) || (process.env.DATABASE_URL && process.env.DIRECT_URL)) {
    const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
    const { host } = accEnv.loadQcEnv();
    console.log(`[env] ${script} · DB ${host}`);
    return;
  }
  console.error(
    `🔴 หยุด! ไม่พบ ${QC_FILE} และ env ก็ไม่มี DATABASE_URL+DIRECT_URL\n` +
      `   ถ้าจะรันกับฐานข้อมูลจริง ต้องตั้ง ALLOW_PROD_BACKFILL=1 มาเอง`,
  );
  process.exit(1);
}

export type TenantRow = { id: string; slug: string; name: string };

/** ร้านที่จะทำ — ระบุ --tenant = ร้านเดียว (ไม่พบ = ตายเสียงดัง) · ไม่ระบุ = ทุกร้าน เรียงตามวันสร้าง */
export async function pickTenants(prisma: Any, slug: string | null): Promise<TenantRow[]> {
  if (slug) {
    const t = (await prisma.tenant.findFirst({ where: { slug }, select: { id: true, slug: true, name: true } })) as TenantRow | null;
    if (!t) {
      console.error(`🔴 ไม่พบร้าน slug "${slug}" — ตรวจชื่อร้านอีกครั้ง`);
      process.exit(1);
    }
    return [t];
  }
  return (await prisma.tenant.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, slug: true, name: true } })) as TenantRow[];
}

/** ระบบ MEMBER ทุกชุดของร้าน (ร้านหนึ่งมีได้หลายระบบสมาชิก) */
export async function memberSystems(prisma: Any, tenantId: string): Promise<{ id: string; name: string }[]> {
  return (await prisma.appSystem.findMany({
    where: { tenantId, type: "MEMBER" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  })) as { id: string; name: string }[];
}

/** หัวเรื่องมาตรฐานของทุกสคริปต์ — พิมพ์คำว่า "dry-run" ให้เห็นชัดเมื่ออยู่โหมดทดลอง */
export function banner(script: string, args: BackfillArgs, tenants: TenantRow[]): void {
  console.log(
    `\n▶ ${script}${args.dryRun ? "  [dry-run — ทดลองรัน ไม่เขียนอะไรลงฐานข้อมูล]" : ""}\n` +
      `  ร้านที่จะทำ ${tenants.length} ร้าน${args.tenantSlug ? ` (เฉพาะ ${args.tenantSlug})` : " (ทุกร้าน)"}`,
  );
}

/** สรุปท้ายรัน + บรรทัดเครื่องอ่าน (ให้ข้อสอบ/ผู้เรียกภายนอกจับตัวเลขได้) */
export function summary(script: string, args: BackfillArgs, counts: Record<string, number>): void {
  const body = Object.entries(counts)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
  console.log(`\n${args.dryRun ? "🧪 dry-run" : "✅"} ${script} เสร็จ · ${body}`);
  console.log(`BACKFILL_SUMMARY ${JSON.stringify({ script, dryRun: args.dryRun, tenant: args.tenantSlug, ...counts })}`);
}

/** ค่าปริยายของเกณฑ์ระดับ (ตรงกับ member/service.ts#computeTier) — ใช้เมื่อร้านไม่ได้ตั้ง MemberTierConfig */
export const DEFAULT_TIER_MIN_SPEND: Record<"SILVER" | "GOLD" | "PLATINUM", number> = {
  SILVER: 300_000,
  GOLD: 1_000_000,
  PLATINUM: 3_000_000,
};

/** นิยามระดับ 4 ชั้นเริ่มต้น (D1) — key/ชื่อไทย/สี/ระดับเดิมที่ผูกกัน */
export const TIER_SEED: { key: string; name: string; color: string; legacyTier: "MEMBER" | "SILVER" | "GOLD" | "PLATINUM"; isDefault: boolean; sortOrder: number }[] = [
  { key: "member", name: "สมาชิก", color: "SLATE", legacyTier: "MEMBER", isDefault: true, sortOrder: 0 },
  { key: "silver", name: "Silver", color: "BLUE", legacyTier: "SILVER", isDefault: false, sortOrder: 1 },
  { key: "gold", name: "Gold", color: "AMBER", legacyTier: "GOLD", isDefault: false, sortOrder: 2 },
  { key: "platinum", name: "Platinum", color: "PURPLE", legacyTier: "PLATINUM", isDefault: false, sortOrder: 3 },
];
