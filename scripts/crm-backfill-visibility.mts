// CRM v2 backfill (ใบ C1.1 · พิมพ์เขียว 20-crm-v2 §4.5 `visibility` · §6.2 · มติ C9) — `visibility-default`
//
// ทุกระบบ CRM: เขียนนโยบายการมองเห็น "ค่าเริ่มต้นของร้าน" ลง `CrmVisibilityPolicy` (teamId/pipelineId = null)
//   STAFF → TEAM · MANAGER → ALL  สำหรับ entity CONTACT · COMPANY · DEAL · ACTIVITY · REPORT (10 แถว/ระบบ)
//   OWNER ไม่มีแถว (เห็นทั้งหมดเสมอ) · ใบ C1.7 เป็นคนอ่าน/แก้ (ทับรายทีม/pipeline ด้วยแถวที่มี teamId/pipelineId)
// 🔴 ร้านที่ตั้ง `settings.crm.visibility` ไว้แล้ว → ใช้ค่าของร้านแทนค่าเริ่มต้น (ค่าที่ไม่ใช่ OWN/TEAM/ALL = ใช้ค่าเริ่มต้น)
// 🔴 idempotent: แถว (role, entity) ที่ teamId/pipelineId เป็น null มีอยู่แล้ว = ข้าม (ไม่ทับค่าที่ร้านแก้)
// 🔴 AUDIT-CLASS X3: unique (systemId, role, teamId, pipelineId, entity) กันซ้ำไม่ได้เมื่อมีช่อง null (Postgres ถือ NULL ไม่ซ้ำ)
//    ⇒ ทีละระบบใต้ `pg_advisory_xact_lock` + อ่านแล้วค่อยเขียนใน transaction เดียวกัน (แบบเดียวที่ C1.7 ต้องใช้)
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/crm-backfill-visibility.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/crm-backfill-visibility.mts --tenant <slug> --dry-run   (ใบ C6.2 เท่านั้น)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "crm-backfill-visibility";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

const ENTITIES = ["CONTACT", "COMPANY", "DEAL", "ACTIVITY", "REPORT"] as const;
const DEFAULTS: Record<"STAFF" | "MANAGER", string> = { STAFF: "TEAM", MANAGER: "ALL" };
const VIS = new Set(["OWN", "TEAM", "ALL"]);

const counts = { ระบบที่แก้: 0, นโยบายที่เพิ่ม: 0, ร้านที่ล้ม: 0 };
for (const t of tenants) {
  try {
    const systems = (await P.appSystem.findMany({ where: { tenantId: t.id, type: "CRM" }, select: { id: true, name: true, settings: true }, orderBy: { createdAt: "asc" } })) as Any[];
    if (systems.length === 0) { console.log(`  · ${t.slug}: ไม่มีระบบ CRM`); continue; }
    for (const s of systems) {
      const own = (s.settings as Any)?.crm?.visibility ?? {};
      const want = (Object.keys(DEFAULTS) as ("STAFF" | "MANAGER")[]).flatMap((role) =>
        ENTITIES.map((entity) => ({ role, entity, visibility: VIS.has(own?.[role]) ? own[role] : DEFAULTS[role] })),
      );
      const missing = async (db: Any) => {
        const have = (await db.crmVisibilityPolicy.findMany({ where: { systemId: s.id, teamId: null, pipelineId: null }, select: { role: true, entity: true } })) as Any[];
        const k = new Set(have.map((r) => `${r.role}:${r.entity}`));
        return want.filter((w) => !k.has(`${w.role}:${w.entity}`));
      };
      let added = 0;
      if (args.dryRun) added = (await missing(P)).length;
      else try {
        added = await P.$transaction(async (tx: Any) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-backfill:visibility:${s.id}`}))`;
          const add = await missing(tx);
          if (add.length) await tx.crmVisibilityPolicy.createMany({ data: add.map((w) => ({ tenantId: t.id, systemId: s.id, role: w.role, teamId: null, pipelineId: null, entity: w.entity, visibility: w.visibility })) });
          return add.length;
        }, { timeout: 600_000, maxWait: 120_000 });
      } catch (e) {
        // 🔴 ร้านหนึ่งล้ม = rollback เฉพาะร้านนั้น · log แค่ id (ไม่มีข้อมูลลูกค้า) แล้วร้านถัดไปเดินต่อ
        counts.ร้านที่ล้ม += 1;
        console.error(`  ❌ ร้าน ${t.id} (${t.slug}) ระบบ ${s.id}: ล้ม — ${e instanceof Error ? e.name : "unknown"} · ข้ามไปต่อ`);
        continue;
      }
      if (added) counts.ระบบที่แก้ += 1;
      counts.นโยบายที่เพิ่ม += added;
      console.log(`  ${added ? "✏️ " : "· "} ${t.name} (${t.slug}) · ระบบ "${s.name}" · นโยบายที่${args.dryRun ? "จะ" : ""}เพิ่ม ${added}`);
    }
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
