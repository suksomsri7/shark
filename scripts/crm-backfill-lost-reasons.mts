// CRM v2 backfill (ใบ C1.1 · พิมพ์เขียว 20-crm-v2 §4.6 ข้อ 3) — `lost-reasons-seed`
//
// ทุกระบบ CRM ของร้าน: ใส่เหตุผลที่ดีลไม่สำเร็จ "ค่าระบบ" 5 ค่า (isSystem · แก้ป้าย/ปิดใช้ได้ภายหลัง แต่ลบไม่ได้)
//   + ดีลที่ `lostReasonId` ว่างแต่ข้อความ `lostReason` เดิม "ตรงกับป้าย" เหตุผลของระบบนั้นเป๊ะ (ตัดช่องว่าง) → ผูก lostReasonId
//     ข้อความที่ไม่ตรง = ไม่เดา (ข้อความเดิมยังอยู่เป็นโน้ต)
// 🔴 idempotent: ข้ามค่าที่มี key เดียวกัน **หรือ** ป้ายเดียวกันอยู่แล้วในระบบนั้น (ร้านที่ตั้งเองไว้ก่อนจะไม่ได้ของซ้ำ)
// 🔴 AUDIT-CLASS X3: ทีละระบบใต้ `pg_advisory_xact_lock` + unique (systemId, key) เป็นตาข่ายชั้นสอง (createMany skipDuplicates)
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/crm-backfill-lost-reasons.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/crm-backfill-lost-reasons.mts --tenant <slug> --dry-run   (ใบ C6.2 เท่านั้น)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "crm-backfill-lost-reasons";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

/** ค่าระบบ 5 ค่า (พิมพ์เขียว §4.6 · ตรงกับ CQC.lostReasons ของชุดข้อมูล QC) */
const SYSTEM_REASONS: { key: string; label: string }[] = [
  { key: "price", label: "ราคาสูงกว่าคู่แข่ง" },
  { key: "budget", label: "งบไม่อนุมัติ" },
  { key: "incumbent", label: "เลือกซัพพลายเออร์เดิม" },
  { key: "no_response", label: "เงียบหาย/ไม่ตอบ" },
  { key: "other", label: "อื่น ๆ" },
];
const clean = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");

const counts = { ระบบที่แก้: 0, เหตุผลที่เพิ่ม: 0, ดีลที่ผูกเหตุผล: 0, ร้านที่ล้ม: 0 };
for (const t of tenants) {
  try {
    const systems = (await P.appSystem.findMany({ where: { tenantId: t.id, type: "CRM" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } })) as Any[];
    if (systems.length === 0) { console.log(`  · ${t.slug}: ไม่มีระบบ CRM`); continue; }
    for (const s of systems) {
      const plan = async (db: Any) => {
        const have = (await db.crmLostReason.findMany({ where: { tenantId: t.id, systemId: s.id }, select: { id: true, key: true, label: true } })) as Any[];
        const keys = new Set(have.map((r) => r.key));
        const labels = new Set(have.map((r) => clean(r.label)));
        const add = SYSTEM_REASONS.filter((r) => !keys.has(r.key) && !labels.has(r.label));
        return { have, add };
      };
      const linkDeals = async (db: Any, reasons: Any[], write: boolean) => {
        const byLabel = new Map(reasons.map((r) => [clean(r.label), r.id]));
        const deals = (await db.crmDeal.findMany({ where: { tenantId: t.id, systemId: s.id, lostReasonId: null, lostReason: { not: null } }, select: { id: true, lostReason: true } })) as Any[];
        let n = 0;
        for (const d of deals) {
          const id = byLabel.get(clean(d.lostReason));
          if (!id) continue;
          n += 1;
          if (write) await db.crmDeal.updateMany({ where: { id: d.id, lostReasonId: null }, data: { lostReasonId: id } });
        }
        return n;
      };
      let added = 0; let linked = 0;
      if (args.dryRun) {
        const { have, add } = await plan(P);
        added = add.length;
        linked = await linkDeals(P, [...have, ...add.map((r) => ({ id: r.key, label: r.label }))], false);
      } else try {
        [added, linked] = await P.$transaction(async (tx: Any) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-backfill:lost-reasons:${s.id}`}))`;
          const { add } = await plan(tx);
          const base = Number((await tx.crmLostReason.count({ where: { systemId: s.id } })) ?? 0);
          const res = add.length
            ? await tx.crmLostReason.createMany({
                data: add.map((r, i) => ({ tenantId: t.id, systemId: s.id, key: r.key, label: r.label, sortOrder: base + i, active: true, isSystem: true })),
                skipDuplicates: true,
              })
            : { count: 0 };
          const all = (await tx.crmLostReason.findMany({ where: { systemId: s.id }, select: { id: true, label: true } })) as Any[];
          return [res.count, await linkDeals(tx, all, true)];
        }, { timeout: 600_000, maxWait: 120_000 });
      } catch (e) {
        // 🔴 ร้านหนึ่งล้ม = rollback เฉพาะร้านนั้น · log แค่ id (ไม่มีข้อมูลลูกค้า) แล้วร้านถัดไปเดินต่อ
        counts.ร้านที่ล้ม += 1;
        console.error(`  ❌ ร้าน ${t.id} (${t.slug}) ระบบ ${s.id}: ล้ม — ${e instanceof Error ? e.name : "unknown"} · ข้ามไปต่อ`);
        continue;
      }
      if (added || linked) counts.ระบบที่แก้ += 1;
      counts.เหตุผลที่เพิ่ม += added;
      counts.ดีลที่ผูกเหตุผล += linked;
      console.log(`  ${added || linked ? "✏️ " : "· "} ${t.name} (${t.slug}) · ระบบ "${s.name}" · เหตุผลที่${args.dryRun ? "จะ" : ""}เพิ่ม ${added} · ดีลที่${args.dryRun ? "จะ" : ""}ผูก ${linked}`);
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
