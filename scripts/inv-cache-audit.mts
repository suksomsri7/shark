// inv-cache-audit.mts — HF-INV-1 · ตรวจ "ยอดคงเหลือ cache" ของคลังที่เพี้ยนไปแล้ว (อ่านอย่างเดียว · ไม่ซ่อมอะไร)
//
// ทำไมต้องมี: ก่อน HF-INV-1 การตัด/รับเข้า/นับ/โอนพร้อมกันทำให้ InvItem.onHand (cache) เพี้ยนจาก ledger ได้ (D1)
//   สคริปต์นี้บอกว่าข้อมูลจริงเพี้ยนไปแล้วเท่าไร ต่อร้าน — ให้เจ้าของตัดสินใจเรื่องการซ่อม (คนละใบงาน)
//
// ตรวจต่อสินค้า (เฉพาะ PRODUCT):
//   A  onHand ≠ Σ InvLocationStock          (เฉพาะสินค้าที่มีแถวคลังแล้ว — ยังไม่มีแถว = ยังไม่เคยถูกแตะหลังยุคหลายคลัง ไม่นับ)
//   B  onHand ≠ Σ InvMovement.qtyDelta      (ledger = ความจริง · ขาโอนสองขาหักล้างกันเอง)
//   C  แถวคลังแถวใด ≠ Σ movement ของคลังนั้น  (movement ยุคเก่าที่ locationId ว่าง = นับเป็นคลัง default ของระบบ)
//   D  lot ใด ≠ Σ movement ที่ระบุ lot นั้น
//   มูลค่าเสี่ยง = |onHand − ledger| × ต้นทุนถัวเฉลี่ยปัจจุบัน (สตางค์) — ตัวเลขประมาณการ ไม่ใช่ยอดบัญชี
//
// 🔴 อ่านอย่างเดียวแบบบังคับที่ฐานข้อมูล: ทุกคำสั่งอยู่ใน tx ที่ขึ้นต้นด้วย `SET TRANSACTION READ ONLY`
//    (ขอบเขตแค่ tx นี้ — ไม่ใช่ SET ระดับ session ที่รั่วข้าม client บน pooler)
// 🔴 ด่าน host: ชี้ production branch → หยุด เว้นแต่ตั้ง ALLOW_PROD_AUDIT=1 มาเอง
//
// ใช้ (QC4):  bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/inv-cache-audit.mts
// ตัวเลือก:   --items=N  แสดงรายการสินค้าที่เพี้ยนต่อร้านสูงสุด N ตัว (ค่าเริ่มต้น 10 · 0 = ไม่แสดง)
//             --tenant=<id>  ตรวจร้านเดียว (R2.5: กรอง tenant ลงไปถึงทุก CTE — ไม่สแกน InvMovement ทั้งตาราง)
//             --explain      พิมพ์แผนคิวรี (EXPLAIN · ไม่รันจริง) ไว้ตรวจว่าตัวกรอง tenant ลงไปถึงการสแกนแต่ละตาราง
// ไม่ตรวจ AccountProduct.qtyOnHand ของสินค้าที่ไม่ผูกคลัง (R2.5): ไม่มีประวัติที่เชื่อถือได้ให้เทียบ —
//   ตัดส่วนประกอบชุดคิดจากสูตร "ปัจจุบัน" (สูตรแก้ได้ ไม่เก็บรุ่น) · เลิกผูกคลังเขียนยอดสัมบูรณ์โดยไม่มีบันทึก
//   (และไม่มีร่องรอยว่าสินค้าเคยผูกคลังมาก่อน) ⇒ ผลรวมจากเอกสารจะ "เพี้ยน" ทั้งที่ยอดถูก = สัญญาณหลอก
import { isProdDbUrl } from "./qc-env-guard.mjs";

const envFile = process.env.QC_ENV_FILE ?? ".env";
const preDb = process.env.DATABASE_URL ?? "";
const preDirect = process.env.DIRECT_URL ?? "";
try {
  process.loadEnvFile(envFile);
} catch {
  /* env ต้องถูก export มาแล้ว */
}
if (preDb) process.env.DATABASE_URL = preDb;
if (preDirect) process.env.DIRECT_URL = preDirect;
const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl) {
  console.error("🔴 inv-cache-audit: ไม่พบ DATABASE_URL");
  process.exit(2);
}
if ((isProdDbUrl(dbUrl) || isProdDbUrl(process.env.DIRECT_URL)) && process.env.ALLOW_PROD_AUDIT !== "1") {
  console.error("🔴 inv-cache-audit: DATABASE_URL ชี้ production — ต้องตั้ง ALLOW_PROD_AUDIT=1 มาเองถ้าตั้งใจตรวจ prod (สคริปต์อ่านอย่างเดียว)");
  process.exit(4);
}
const host = (() => {
  try {
    return new URL(dbUrl).hostname;
  } catch {
    return "(อ่าน host ไม่ได้)";
  }
})();
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const showItems = Math.max(0, Number(arg("items") ?? 10) || 0);
const onlyTenant = arg("tenant") ?? null;
const explain = process.argv.includes("--explain");
console.log(`[env] inv-cache-audit · ไฟล์ ${envFile} · DB ${host}${isProdDbUrl(dbUrl) ? " (PRODUCTION · ALLOW_PROD_AUDIT=1)" : ""}`);

const { PrismaClient, Prisma } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });

type ItemRow = {
  tenantId: string;
  systemId: string;
  id: string;
  sku: string;
  name: string;
  onHand: number;
  costSatang: number;
  locRows: number;
  locSum: number;
  mvCount: number;
  ledgerSum: number;
  badLocRows: number;
  badLots: number;
};
type TenantRow = { id: string; name: string; slug: string };

try {
  const started = Date.now();
  // R2.5: ตัวกรอง tenant ใส่ "ในทุก CTE" (เดิมกรองแค่ปลายทาง ⇒ รวม InvMovement ของทุกร้านก่อนแล้วค่อยทิ้ง)
  //   ชื่อคอลัมน์เป็นค่าคงที่ในสคริปต์ (Prisma.raw) · ค่า tenant ผ่านพารามิเตอร์
  const tf = (col: string) => (onlyTenant ? Prisma.sql`AND ${Prisma.raw(col)} = ${onlyTenant}` : Prisma.empty);
  const query = Prisma.sql`
        WITH defloc AS (
          SELECT DISTINCT ON ("systemId") "systemId", "id" FROM "InvLocation"
          WHERE "isDefault" = true ${tf(`"tenantId"`)} ORDER BY "systemId", "archivedAt" NULLS FIRST, "createdAt" ASC
        ),
        loc AS (
          SELECT "itemId", COUNT(*)::int AS n, COALESCE(SUM("onHand"), 0)::int AS s FROM "InvLocationStock" WHERE true ${tf(`"tenantId"`)} GROUP BY "itemId"
        ),
        mv AS (
          SELECT "itemId", COUNT(*)::int AS n, COALESCE(SUM("qtyDelta"), 0)::int AS s FROM "InvMovement" WHERE true ${tf(`"tenantId"`)} GROUP BY "itemId"
        ),
        mvloc AS (
          SELECT m."itemId", COALESCE(m."locationId", d."id") AS "locationId", SUM(m."qtyDelta")::int AS s
          FROM "InvMovement" m LEFT JOIN defloc d ON d."systemId" = m."systemId"
          WHERE true ${tf(`m."tenantId"`)}
          GROUP BY 1, 2
        ),
        badloc AS (
          SELECT ls."itemId", COUNT(*)::int AS n
          FROM "InvLocationStock" ls
          LEFT JOIN mvloc x ON x."itemId" = ls."itemId" AND x."locationId" = ls."locationId"
          WHERE ls."onHand" <> COALESCE(x.s, 0) ${tf(`ls."tenantId"`)}
          GROUP BY ls."itemId"
        ),
        mvlot AS (
          SELECT "itemId", "lotCode", SUM("qtyDelta")::int AS s FROM "InvMovement" WHERE "lotCode" IS NOT NULL ${tf(`"tenantId"`)} GROUP BY 1, 2
        ),
        badlot AS (
          SELECT l."itemId", COUNT(*)::int AS n
          FROM "InvLot" l LEFT JOIN mvlot x ON x."itemId" = l."itemId" AND x."lotCode" = l."lotCode"
          WHERE l."onHand" <> COALESCE(x.s, 0) ${tf(`l."tenantId"`)}
          GROUP BY l."itemId"
        )
        SELECT i."tenantId", i."systemId", i."id", i."sku", i."name", i."onHand", i."costSatang",
               COALESCE(loc.n, 0) AS "locRows", COALESCE(loc.s, 0) AS "locSum",
               COALESCE(mv.n, 0) AS "mvCount", COALESCE(mv.s, 0) AS "ledgerSum",
               COALESCE(badloc.n, 0) AS "badLocRows", COALESCE(badlot.n, 0) AS "badLots"
        FROM "InvItem" i
        LEFT JOIN loc ON loc."itemId" = i."id"
        LEFT JOIN mv ON mv."itemId" = i."id"
        LEFT JOIN badloc ON badloc."itemId" = i."id"
        LEFT JOIN badlot ON badlot."itemId" = i."id"
        WHERE i."kind" = 'PRODUCT' ${tf(`i."tenantId"`)}`;
  if (explain) {
    const plan = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return tx.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`EXPLAIN ${query}`);
    });
    console.log(plan.map((r) => r["QUERY PLAN"]).join("\n"));
    await db.$disconnect();
    process.exit(0);
  }
  const { items, tenants } = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const items = await tx.$queryRaw<ItemRow[]>(query);
      const ids = [...new Set(items.map((r) => r.tenantId))];
      const tenants = ids.length
        ? await tx.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })
        : ([] as TenantRow[]);
      return { items, tenants };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  const tName = new Map(tenants.map((t) => [t.id, `${t.name} (${t.slug})`]));
  type Agg = { items: number; withLedger: number; a: number; b: number; c: number; d: number; any: number; deltaUnits: number; exposure: number; rows: ItemRow[] };
  const per = new Map<string, Agg>();
  const flags = (r: ItemRow) => ({
    a: r.locRows > 0 && r.onHand !== r.locSum,
    b: r.onHand !== r.ledgerSum,
    c: r.badLocRows > 0,
    d: r.badLots > 0,
  });
  for (const r of items) {
    const g = per.get(r.tenantId) ?? { items: 0, withLedger: 0, a: 0, b: 0, c: 0, d: 0, any: 0, deltaUnits: 0, exposure: 0, rows: [] };
    g.items += 1;
    if (r.mvCount > 0) g.withLedger += 1;
    const f = flags(r);
    if (f.a) g.a += 1;
    if (f.b) {
      g.b += 1;
      g.deltaUnits += Math.abs(r.onHand - r.ledgerSum);
      g.exposure += Math.abs(r.onHand - r.ledgerSum) * r.costSatang;
    }
    if (f.c) g.c += 1;
    if (f.d) g.d += 1;
    if (f.a || f.b || f.c || f.d) {
      g.any += 1;
      g.rows.push(r);
    }
    per.set(r.tenantId, g);
  }

  const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const drifted = [...per.entries()].filter(([, g]) => g.any > 0).sort((x, y) => y[1].exposure - x[1].exposure || y[1].any - x[1].any);
  console.log(`\nตรวจ ${items.length} สินค้า (PRODUCT) ใน ${per.size} ร้าน · ใช้เวลา ${((Date.now() - started) / 1000).toFixed(1)} วิ · อ่านอย่างเดียว`);
  console.log("คอลัมน์: A=onHand≠Σคลัง · B=onHand≠ledger · C=แถวคลัง≠movementของคลัง · D=lot≠movementของlot\n");
  for (const [tid, g] of drifted) {
    console.log(`■ ${tName.get(tid) ?? tid}`);
    console.log(`  สินค้า ${g.items} (มี movement ${g.withLedger}) · เพี้ยน ${g.any} ตัว — A ${g.a} · B ${g.b} · C ${g.c} · D ${g.d} · ส่วนต่างรวม ${g.deltaUnits} หน่วย · มูลค่าเสี่ยง ≈ ฿${baht(g.exposure)}`);
    for (const r of g.rows.sort((x, y) => Math.abs(y.onHand - y.ledgerSum) * y.costSatang - Math.abs(x.onHand - x.ledgerSum) * x.costSatang).slice(0, showItems)) {
      const f = flags(r);
      console.log(
        `    - ${r.sku} · onHand ${r.onHand} · ledger ${r.ledgerSum} · Σคลัง ${r.locRows ? r.locSum : "-"} · ต้นทุน ฿${baht(r.costSatang)} · ${[f.a && "A", f.b && "B", f.c && "C", f.d && "D"].filter(Boolean).join("")}`,
      );
    }
  }
  const tot = [...per.values()].reduce(
    (s, g) => ({ any: s.any + g.any, a: s.a + g.a, b: s.b + g.b, c: s.c + g.c, d: s.d + g.d, exposure: s.exposure + g.exposure, units: s.units + g.deltaUnits }),
    { any: 0, a: 0, b: 0, c: 0, d: 0, exposure: 0, units: 0 },
  );
  console.log(`\n===== inv-cache-audit =====`);
  console.log(`ร้านที่ตรวจ ${per.size} · ร้านที่มีสินค้าเพี้ยน ${drifted.length} · สินค้าเพี้ยน ${tot.any}/${items.length} (A ${tot.a} · B ${tot.b} · C ${tot.c} · D ${tot.d}) · ส่วนต่างรวม ${tot.units} หน่วย · มูลค่าเสี่ยง ≈ ฿${baht(tot.exposure)}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ tenants: per.size, driftedTenants: drifted.length, items: items.length, drifted: tot.any, a: tot.a, b: tot.b, c: tot.c, d: tot.d, deltaUnits: tot.units, exposureSatang: tot.exposure })}`);
} finally {
  await db.$disconnect();
}
