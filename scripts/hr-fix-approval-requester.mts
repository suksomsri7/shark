// HR H0.7 (R8) — แก้ข้อมูลย้อนหลัง: ApprovalRequest ของใบลาที่ "ผู้ยื่น" (requestedById) เป็น id พนักงาน แทนที่จะเป็น user id
//
// ทำไม: ก่อน H0.7 hr/service.ts requestLeave ส่ง requestedById = HrEmployee.id ⇒ ใบลาไม่ขึ้นใน "คำขอของฉัน" (approval listMyRequests
//   กรอง requestedById = userId) และผู้ยื่นยกเลิกใบลาของตัวเองไม่ได้ · H0.7 เขียน user id แล้ว — สคริปต์นี้แก้แถวเก่า
//
// โหมด
//   (ไม่ใส่อะไร) = dry-run: นับต่อร้าน — แก้ได้ (พนักงานผูกบัญชีแล้ว) · แก้ไม่ได้ (พนักงานยังไม่ผูกบัญชี — พิมพ์ id ของคำขอ) — ไม่เขียนอะไร
//   --apply      = ต่อร้าน 1 ธุรกรรม (ล็อก advisory ต่อร้าน ⇒ รันพร้อมกันสองตัวก็แก้แถวละครั้งเดียว): requestedById = HrEmployee.linkedUserId
//                  แบบมีเงื่อนไข (ยังเป็น id พนักงานอยู่) · แถวที่พนักงานยังไม่ผูกบัญชี = ไม่แตะ (อยู่ในรายการ) · รันซ้ำ = 0 แถว (idempotent)
//   --tenant <id> = เฉพาะร้านนี้ (ข้อสอบใช้) · ไม่ใส่ = ทุกร้านที่มีแถวแบบนี้
//   ทุกสถานะของคำขอ (รอ/อนุมัติ/ปฏิเสธ/ยกเลิก) — ประวัติใน "คำขอของฉัน" ต้องครบ · ไม่แตะใบลา ไม่ยิง event
// พิมพ์เฉพาะตัวเลข + id (ไม่มีชื่อ/อีเมล) · บรรทัดสุดท้าย JSON_SUMMARY {"mode","tenants":[{tenantId,fixable,unlinked:[requestIds],changed}]}
//
// env
//   ค่าปริยาย: acc-v2-env.loadQcEnv() (.env.qc · env ที่ export มาก่อนชนะ — ใต้ scripts/qc4.sh = QC4) · ด่าน prod ของ loadQcEnv ทำงานเสมอ
//   prod (runbook ของผู้คุมงาน): HR_FIX_PROD=1 HR_FIX_ENV_FILE=<ไฟล์ env ของ prod> pnpm exec tsx scripts/hr-fix-approval-requester.mts [--apply]
//     ต้องมี HR_FIX_ENV_FILE · มี DATABASE_URL ใน shell มาก่อน = หยุด (ค่าใน shell จะชนะไฟล์เงียบ ๆ) · host production โดยไม่มี HR_FIX_PROD=1 = หยุด
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "hr-fix-approval-requester";
const PROD_HOST_MARK = "ep-royal-night";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ti = argv.indexOf("--tenant");
const TENANT = ti >= 0 ? (argv[ti + 1] ?? "") : "";
if (ti >= 0 && !TENANT) {
  console.error(`❌ ${SCRIPT}: --tenant ต้องตามด้วย tenantId`);
  process.exit(1);
}
const unknown = argv.filter((a, i) => a !== "--apply" && a !== "--tenant" && !(ti >= 0 && i === ti + 1));
if (unknown.length) {
  console.error(`❌ ${SCRIPT}: ไม่รู้จักตัวเลือก (มีแค่ --apply · --tenant <id>)`);
  process.exit(1);
}

// ── env ──
const PROD = process.env.HR_FIX_PROD === "1";
if (PROD) {
  const f = process.env.HR_FIX_ENV_FILE ?? "";
  if (!f) {
    console.error(`❌ ${SCRIPT}: HR_FIX_PROD=1 ต้องตั้ง HR_FIX_ENV_FILE=<ไฟล์ env ของ prod> ด้วย`);
    process.exit(1);
  }
  if (process.env.DATABASE_URL !== undefined) {
    console.error(`❌ ${SCRIPT}: มี DATABASE_URL ตั้งไว้ใน shell อยู่แล้ว — ค่านี้จะชนะไฟล์ HR_FIX_ENV_FILE · unset แล้วรันใหม่ (ไม่ได้เขียนอะไร)`);
    process.exit(1);
  }
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) {
    console.error(`❌ ${SCRIPT}: ไม่พบ HR_FIX_ENV_FILE`);
    process.exit(1);
  }
  process.loadEnvFile(p);
  if (!process.env.DATABASE_URL) {
    console.error(`❌ ${SCRIPT}: ไฟล์ HR_FIX_ENV_FILE ไม่มี DATABASE_URL`);
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
console.log(`[${SCRIPT}] DB host = ${host} · โหมด ${APPLY ? "APPLY (เขียน)" : "dry-run (ไม่เขียน)"}${TENANT ? ` · ร้าน ${TENANT}` : " · ทุกร้าน"}`);
if (host.includes(PROD_HOST_MARK) && !PROD) {
  console.error(`🔴 หยุด! host เป็น production — ต้องตั้ง HR_FIX_PROD=1 ตาม runbook เท่านั้น`);
  process.exit(3);
}

const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;

type Row = { id: string; employeeId: string; linkedUserId: string | null };
type Entry = { tenantId: string; fixable: number; unlinked: string[]; changed: number };

// คำขอของใบลาที่ requestedById = id ของแถวพนักงานในร้านเดียวกัน (อ่านผ่าน client ที่ส่งมา — ใน tx = เห็นสถานะหลังล็อก)
const legacyRows = (db: Any, tenantId: string): Promise<Row[]> =>
  db.$queryRawUnsafe(
    `SELECT ar.id, e.id AS "employeeId", e."linkedUserId"
       FROM "ApprovalRequest" ar
       JOIN "HrEmployee" e ON e.id = ar."requestedById" AND e."tenantId" = ar."tenantId"
      WHERE ar."tenantId" = $1 AND ar."entityType" = 'HrLeave'
      ORDER BY ar."createdAt", ar.id`,
    tenantId,
  );

let exitCode = 0;
const out: Entry[] = [];
try {
  const tenants: string[] = TENANT
    ? [TENANT]
    : (
        (await P.$queryRawUnsafe(
          `SELECT DISTINCT ar."tenantId" FROM "ApprovalRequest" ar
             JOIN "HrEmployee" e ON e.id = ar."requestedById" AND e."tenantId" = ar."tenantId"
            WHERE ar."entityType" = 'HrLeave' ORDER BY 1`,
        )) as { tenantId: string }[]
      ).map((r) => r.tenantId);

  for (const tenantId of tenants) {
    let entry: Entry;
    if (!APPLY) {
      const rows = await legacyRows(P, tenantId);
      entry = { tenantId, fixable: rows.filter((r) => r.linkedUserId).length, unlinked: rows.filter((r) => !r.linkedUserId).map((r) => r.id), changed: 0 };
    } else {
      entry = await P.$transaction(
        async (tx: Any) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, `hr-fix-approval-requester:${tenantId}`);
          const rows = await legacyRows(tx, tenantId);
          let changed = 0;
          for (const r of rows) {
            if (!r.linkedUserId) continue;
            // มีเงื่อนไข: ยังเป็น id พนักงานอยู่ ⇒ รันซ้ำ/รันพร้อมกัน = 0 แถว
            const res = await tx.approvalRequest.updateMany({
              where: { id: r.id, tenantId, entityType: "HrLeave", requestedById: r.employeeId },
              data: { requestedById: r.linkedUserId },
            });
            changed += res.count;
          }
          return { tenantId, fixable: rows.filter((r) => r.linkedUserId).length, unlinked: rows.filter((r) => !r.linkedUserId).map((r) => r.id), changed };
        },
        { maxWait: 30_000, timeout: 120_000 },
      );
    }
    out.push(entry);
    console.log(`ร้าน ${tenantId}: แก้ได้ ${entry.fixable} · พนักงานยังไม่ผูกบัญชี ${entry.unlinked.length} · เปลี่ยนจริง ${entry.changed}`);
    for (const id of entry.unlinked) console.log(`  ยังไม่ผูกบัญชี (ApprovalRequest) ${id}`);
  }
  const tot = out.reduce((a, e) => ({ fixable: a.fixable + e.fixable, unlinked: a.unlinked + e.unlinked.length, changed: a.changed + e.changed }), { fixable: 0, unlinked: 0, changed: 0 });
  console.log(`รวม ${out.length} ร้าน: แก้ได้ ${tot.fixable} · ยังไม่ผูกบัญชี ${tot.unlinked} · เปลี่ยนจริง ${tot.changed}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ script: SCRIPT, mode: APPLY ? "apply" : "dry-run", tenants: out })}`);
} catch (e) {
  // ไม่พิมพ์ข้อความระบบดิบ (อาจมี URL/ค่าในแถว) — ชนิด + รหัสเท่านั้น
  console.error(`❌ ${SCRIPT}: ทำไม่สำเร็จ (${(e as Any)?.code ?? (e as Error)?.name ?? "error"}) — ธุรกรรมของร้านที่ค้างถูกย้อน รันใหม่ได้`);
  exitCode = 1;
} finally {
  await P.$disconnect?.().catch?.(() => {});
}
process.exit(exitCode);
