// HR H1.1 (R2) — เติมสาขาประจำ (HrEmployee.unitId) + สถานะการจ้าง (employmentStatus) ให้ข้อมูลก่อน H1.1
//
// กติกา (brief H1.1 R2 · มติผู้คุมงานข้อ 12):
//   สาขา: ร้านที่มี BusinessUnit "หนึ่งเดียว" ⇒ พนักงานทุกคน (ทำงานอยู่หรือไม่) ที่ unitId ยังว่าง = สาขานั้น
//         ร้านที่มี ≥ 2 สาขา (หรือ 0) ⇒ unitId คงว่าง (ทะเบียนขึ้น "ยังไม่ระบุสาขาประจำ" ให้เจ้าของเลือกเอง)
//         🔴 ไม่เขียนทับ unitId ที่มีอยู่แล้วเด็ดขาด
//   สถานะ: เฉพาะแถวที่ employmentStatus ยังว่าง — endDate ก่อนวันนี้ (เวลาไทย) หรือ active=false ⇒ ENDED ·
//          employmentType PROBATION ⇒ PROBATION · นอกนั้น (รวม endDate ในอนาคต) ⇒ ACTIVE
//   รันซ้ำ = 0 แถว (idempotent) · ต่อร้าน 1 ธุรกรรม (ล็อก advisory ต่อร้าน ⇒ รันพร้อมกันสองตัวก็เขียนแถวละครั้งเดียว)
//
// โหมด
//   (ไม่ใส่ --apply) = dry-run: นับอย่างเดียว ไม่เขียน
//   --apply           = เขียน
//   --tenant <slug|id> = ร้านเดียว · --all = ทุกร้านที่มีระบบ HR · ต้องเลือกอย่างใดอย่างหนึ่ง
// พิมพ์เฉพาะตัวเลขต่อร้าน (ไม่มีชื่อพนักงาน/อีเมล/id พนักงาน): {"tenant":<slug>,"units":n,"assigned":n,"skipped":n,"statusSet":n,"unassigned":n}
//   assigned = แถวที่ได้/จะได้สาขา · skipped = แถวที่ไม่ได้สาขาในรอบนี้ (มีอยู่แล้ว หรือร้านหลายสาขา) · unassigned = ยังว่างหลังรอบนี้
//   บรรทัดสุดท้าย JSON_SUMMARY {"mode","tenants":n,"assigned":n,"statusSet":n}
//
// env
//   ค่าปริยาย: acc-v2-env.loadQcEnv() (.env.qc · env ที่ export มาก่อนชนะ — ใต้ scripts/qc4.sh = QC4) · host production ⇒ หยุด
//   prod (runbook): HR_BACKFILL_PROD=1 HR_BACKFILL_ENV_FILE=<ไฟล์ env ของ prod> pnpm exec tsx scripts/hr-backfill-units.mts --all [--apply]
//     ต้องมี HR_BACKFILL_ENV_FILE · มี DATABASE_URL ใน shell มาก่อน = หยุด (ค่าใน shell จะชนะไฟล์เงียบ ๆ)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "hr-backfill-units";
const PROD_HOST_MARK = "ep-royal-night";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ALL = argv.includes("--all");
const ti = argv.indexOf("--tenant");
const TENANT = ti >= 0 ? String(argv[ti + 1] ?? "").trim() : "";
const unknown = argv.filter((a, i) => a !== "--apply" && a !== "--all" && a !== "--tenant" && !(ti >= 0 && i === ti + 1));
if (unknown.length || (ti >= 0 && !TENANT) || (!ALL && !TENANT) || (ALL && TENANT)) {
  console.error(`❌ ${SCRIPT}: ใช้ --tenant <slug|id> หรือ --all (อย่างใดอย่างหนึ่ง) · เพิ่ม --apply เพื่อเขียน (ไม่ใส่ = dry-run)`);
  process.exit(1);
}

// ── env ──
const PROD = process.env.HR_BACKFILL_PROD === "1";
if (PROD) {
  const f = process.env.HR_BACKFILL_ENV_FILE ?? "";
  if (!f) {
    console.error(`❌ ${SCRIPT}: HR_BACKFILL_PROD=1 ต้องตั้ง HR_BACKFILL_ENV_FILE=<ไฟล์ env ของ prod> ด้วย`);
    process.exit(1);
  }
  if (process.env.DATABASE_URL !== undefined) {
    console.error(`❌ ${SCRIPT}: มี DATABASE_URL ตั้งไว้ใน shell อยู่แล้ว — ค่านี้จะชนะไฟล์ HR_BACKFILL_ENV_FILE · unset แล้วรันใหม่ (ไม่ได้เขียนอะไร)`);
    process.exit(1);
  }
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) {
    console.error(`❌ ${SCRIPT}: ไม่พบ HR_BACKFILL_ENV_FILE`);
    process.exit(1);
  }
  process.loadEnvFile(p);
  if (!process.env.DATABASE_URL) {
    console.error(`❌ ${SCRIPT}: ไฟล์ HR_BACKFILL_ENV_FILE ไม่มี DATABASE_URL`);
    process.exit(1);
  }
} else {
  const { loadQcEnv } = (await import("./acc-v2-env.mts" as string)) as Any;
  loadQcEnv();
}
let host = "?";
try {
  host = new URL(process.env.DATABASE_URL ?? "").hostname;
} catch {
  /* พิมพ์แค่ host */
}
console.log(`[${SCRIPT}] DB host = ${host} · โหมด ${APPLY ? "APPLY (เขียน)" : "dry-run (ไม่เขียน)"} · ${ALL ? "ทุกร้าน" : "ร้านเดียว"}`);
if (host.includes(PROD_HOST_MARK) && !PROD) {
  console.error(`🔴 หยุด! host เป็น production — ต้องตั้ง HR_BACKFILL_PROD=1 ตาม runbook เท่านั้น`);
  process.exit(3);
}

const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const { thaiDateKey } = (await import("@/lib/ui/date")) as Any;
const today = new Date(`${thaiDateKey(new Date())}T00:00:00Z`); // วันนี้ตามเวลาไทย (รูป @db.Date)

type T = { id: string; slug: string };
let tenants: T[];
if (ALL) {
  const hrTenantIds = ((await P.appSystem.findMany({ where: { type: "HR" }, select: { tenantId: true }, distinct: ["tenantId"] })) as Any[]).map((r) => r.tenantId as string);
  tenants = hrTenantIds.length ? ((await P.tenant.findMany({ where: { id: { in: hrTenantIds } }, select: { id: true, slug: true }, orderBy: { createdAt: "asc" } })) as T[]) : [];
} else {
  const t = (await P.tenant.findFirst({ where: { OR: [{ id: TENANT }, { slug: TENANT }] }, select: { id: true, slug: true } })) as T | null;
  if (!t) {
    console.error(`❌ ${SCRIPT}: ไม่พบร้านนี้ (ไม่ได้เขียนอะไร)`);
    await P.$disconnect?.();
    process.exit(2);
  }
  tenants = [t];
}

type Res = { tenant: string; units: number; assigned: number; skipped: number; statusSet: number; unassigned: number };
async function runTenant(t: T): Promise<Res> {
  return P.$transaction(
    async (tx: Any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:backfill-units:${t.id}`}, 0))`;
      const units = (await tx.businessUnit.findMany({ where: { tenantId: t.id }, select: { id: true }, take: 2 })) as { id: string }[];
      const unitCount = (await tx.businessUnit.count({ where: { tenantId: t.id } })) as number;
      const total = (await tx.hrEmployee.count({ where: { tenantId: t.id } })) as number;
      const emptyUnit = (await tx.hrEmployee.count({ where: { tenantId: t.id, unitId: null } })) as number;
      const single = unitCount === 1 ? units[0]!.id : null;
      let assigned = single ? emptyUnit : 0;
      // สถานะ (เฉพาะแถวที่ยังว่าง) — ลำดับ ENDED ก่อน PROBATION ก่อน ACTIVE (แต่ละคำสั่งกรอง "ยังว่าง" ⇒ แถวละครั้งเดียว)
      const nullStatus = { tenantId: t.id, employmentStatus: null };
      const endedWhere = { ...nullStatus, OR: [{ active: false }, { endDate: { lt: today } }] };
      const probationWhere = { ...nullStatus, employmentType: "PROBATION" };
      let statusSet = 0;
      if (APPLY) {
        if (single) assigned = (await tx.hrEmployee.updateMany({ where: { tenantId: t.id, unitId: null }, data: { unitId: single } })).count;
        statusSet += (await tx.hrEmployee.updateMany({ where: endedWhere, data: { employmentStatus: "ENDED" } })).count;
        statusSet += (await tx.hrEmployee.updateMany({ where: probationWhere, data: { employmentStatus: "PROBATION" } })).count;
        statusSet += (await tx.hrEmployee.updateMany({ where: nullStatus, data: { employmentStatus: "ACTIVE" } })).count;
      } else {
        statusSet = (await tx.hrEmployee.count({ where: nullStatus })) as number;
      }
      const unassigned = single ? 0 : emptyUnit;
      return { tenant: t.slug, units: unitCount, assigned, skipped: total - assigned, statusSet, unassigned };
    },
    { maxWait: 20_000, timeout: 120_000 },
  );
}

let sumAssigned = 0;
let sumStatus = 0;
for (const t of tenants) {
  const r = await runTenant(t);
  sumAssigned += r.assigned;
  sumStatus += r.statusSet;
  console.log(JSON.stringify(r));
  if (r.unassigned > 0) console.log(`  · ร้านนี้มีหลายสาขา — ยังไม่ระบุสาขาประจำ ${r.unassigned} คน (เจ้าของเลือกเองที่หน้าโปรไฟล์พนักงาน)`);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ mode: APPLY ? "apply" : "dry-run", tenants: tenants.length, assigned: sumAssigned, statusSet: sumStatus })}`);
await P.$disconnect?.();
