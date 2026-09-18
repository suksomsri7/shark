// CRM v2 backfill (ใบ C1.1 · พิมพ์เขียว 20-crm-v2 §4.6 ข้อ 3) — `contact-name-split`
//
// `CrmContact.firstName` ว่าง → ตัดคำนำหน้าชื่อออกก่อน แล้วแยกที่ "ช่องว่างแรก": ก่อนช่องว่าง = firstName · ที่เหลือ = lastName
//   (ไม่มี = null) · คำนำหน้าที่ตัดออกเก็บลง `titleTh` ถ้ายังว่าง · ชื่อที่มีแต่คำนำหน้า (เช่น "คุณ") = ใช้ชื่อเดิมทั้งก้อน
// 🔴 `name` เดิมไม่แตะ (ยังเป็นชื่อแสดงผล) · แตะเฉพาะแถวที่ firstName เป็น null ⇒ รันกี่รอบผลเท่าเดิม (idempotent)
// 🔴 AUDIT-CLASS X3: ทำทีละร้านใต้ `pg_advisory_xact_lock` + คำสั่ง UPDATE เดียวที่มีเงื่อนไข firstName IS NULL
//    ⇒ รัน 2 โปรเซสพร้อมกันได้ผลเดียวกับรันครั้งเดียว
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/crm-backfill-contact-names.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/crm-backfill-contact-names.mts --tenant <slug> --dry-run   (ใบ C6.2 เท่านั้น)
//   env ผ่าน `member-backfill-common.loadBackfillEnv` — ไม่ตั้ง ALLOW_PROD_BACKFILL = โหลด .env.qc ผ่านด่าน loadQcEnv (host prod = ตาย)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "crm-backfill-contact-names";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

/**
 * คำนำหน้าชื่อ (Postgres ARE · `(?i)` = ไม่สนตัวพิมพ์ · กลุ่มที่ 1 = คำนำหน้าทั้งคำรวมช่องว่างตามหลัง)
 *   นางสาว · น.ส. · ดร. ติดชื่อได้ · นาย/นาง/คุณ ต้องมีช่องว่างตามหลัง (กัน "คุณากร" "นางนวล") · Mr/Mrs/Ms/Miss/Dr ต้องมีจุดหรือช่องว่าง
 */
const TITLE_RE = String.raw`(?i)^((?:นางสาว|น\.ส\.|ดร\.)\s*|(?:นาย|นาง|คุณ)\s+|(?:mrs|mr|ms|miss|dr)(?:\.\s*|\s+))`;

const counts = { ร้านที่แก้: 0, ผู้ติดต่อที่แยกชื่อ: 0, ร้านที่ล้ม: 0 };
for (const t of tenants) {
  try {
    const pending = Number((await P.crmContact.count({ where: { tenantId: t.id, firstName: null } })) ?? 0);
    if (pending === 0) { console.log(`  · ${t.slug}: ไม่มีผู้ติดต่อที่ต้องแยกชื่อ`); continue; }
    let done = pending;
    if (!args.dryRun) try {
      done = await P.$transaction(async (tx: Any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-backfill:contact-names:${t.id}`}))`;
        // x.n = ชื่อเดิม (ตัดช่องว่างหัวท้าย) · x.s = ชื่อหลังตัดคำนำหน้า (null = ไม่เหลืออะไร) · x.t = คำนำหน้าที่ตัดออก
        // แล้ว: ก่อนช่องว่างแรก = ชื่อ · หลังจากนั้น (ตัดช่องว่างซ้ำ) = นามสกุล
        return tx.$executeRaw`
          WITH x AS (
            SELECT "id", btrim("name") AS n,
                   NULLIF(btrim(regexp_replace(btrim("name"), ${TITLE_RE}, '')), '') AS s,
                   btrim(substring(btrim("name") from ${TITLE_RE})) AS t
              FROM "CrmContact" WHERE "tenantId" = ${t.id} AND "firstName" IS NULL
          )
          UPDATE "CrmContact" c
             SET "firstName" = regexp_replace(COALESCE(x.s, x.n), '\\s.*$', ''),
                 "lastName"  = NULLIF(btrim(regexp_replace(COALESCE(x.s, x.n), '^\\S+', '')), ''),
                 "titleTh"   = COALESCE(c."titleTh", CASE WHEN x.s IS NOT NULL THEN NULLIF(x.t, '') END)
            FROM x
           WHERE c."id" = x."id" AND c."firstName" IS NULL`;
      }, { timeout: 600_000, maxWait: 120_000 });
    } catch (e) {
      // 🔴 ร้านหนึ่งล้ม = rollback เฉพาะร้านนั้น · log แค่ id (ไม่มีข้อมูลลูกค้า) แล้วร้านถัดไปเดินต่อ
      counts.ร้านที่ล้ม += 1;
      console.error(`  ❌ ร้าน ${t.id} (${t.slug}): ล้ม — ${e instanceof Error ? e.name : "unknown"} · ข้ามไปร้านถัดไป`);
      continue;
    }
    counts.ร้านที่แก้ += 1;
    counts.ผู้ติดต่อที่แยกชื่อ += Number(done);
    console.log(`  ✏️  ${t.name} (${t.slug}) · ${args.dryRun ? "จะแยกชื่อ" : "แยกชื่อแล้ว"} ${done} คน`);
  } catch (e) {
    // 🔴 ร้านหนึ่งล้ม (รวมตอนอ่านข้อมูลก่อนเขียน) = log แค่ tenant id (ไม่มีข้อมูลลูกค้า) แล้วร้านถัดไปเดินต่อ
    counts.ร้านที่ล้ม = (counts.ร้านที่ล้ม ?? 0) + 1;
    console.error(`  ❌ ร้าน ${t.id} (${t.slug}): ล้ม — ${e instanceof Error ? e.name : "unknown"} · ข้ามไปร้านถัดไป`);
  }
}

common.summary(SCRIPT, args, counts);
// ร้านที่ล้ม > 0 = exit 1 (ร้านอื่นทำครบแล้ว — รันซ้ำเก็บตกได้เพราะ idempotent) ให้คนรัน/CI เห็นว่าไม่ครบ
if (counts.ร้านที่ล้ม) process.exitCode = 1;
await prisma.$disconnect();
