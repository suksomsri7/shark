// backfill 1/6 — ระดับสมาชิก (D1 · พิมพ์เขียว §4.6 ข้อ 1)
//
// ทำอะไร (ต่อ "ระบบสมาชิก" ของแต่ละร้าน)
//   1) สร้าง `MemberTierDef` 4 แถว (member/silver/gold/platinum) ถ้ายังไม่มี
//   2) แปลง `MemberTierConfig` เดิมของร้าน (เกณฑ์ยอดสะสม 3 ระดับ) → `AutomationRule` scope MEMBER_TIER
//      แล้วให้ `MemberTierDef.upgradeRuleId` ชี้กลับ — ร้านที่ไม่เคยตั้งใช้ค่าปริยายของ computeTier
//   3) `Customer.tierDefId` ← จาก enum `tier` เดิม (เฉพาะที่ยังว่าง) + `tierSince` = createdAt
//   4) `MemberTierHistory` เหตุผล INITIAL 1 แถว/คน (หลักฐาน = ยอดสะสม + ระดับเดิม)
//
// 🔴 ไม่ประเมินระดับใหม่ ไม่เลื่อน/ลดใครทั้งสิ้น — แปลงข้อมูลเดิมให้อยู่ในรูปใหม่เท่านั้น
//    (ถ้าคำนวณใหม่ตอน backfill ลูกค้าจะ "ตกระดับ" พร้อมกันทั้งร้านในวันดีพลอย โดยไม่มีใครสั่ง)
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/member-backfill-tiers.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/member-backfill-tiers.mts --tenant <slug>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "member-backfill-tiers";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

const P = prisma as Any;
const counts = { ร้านที่แก้: 0, ระดับที่สร้าง: 0, กฎเลื่อนระดับ: 0, สมาชิกที่ผูกระดับ: 0, ประวัติINITIAL: 0 };

for (const t of tenants) {
  const systems = await common.memberSystems(prisma, t.id);
  if (systems.length === 0) continue;

  // เกณฑ์ยอดสะสมของร้าน (ระดับ tenant) — ไม่ตั้ง = ค่าปริยายเดียวกับ member/service.ts#computeTier
  const cfgRows = (await P.memberTierConfig.findMany({ where: { tenantId: t.id } })) as { tier: string; label: string; minSpendSatang: number }[];
  const minSpend = (tier: "SILVER" | "GOLD" | "PLATINUM") =>
    cfgRows.find((r) => r.tier === tier)?.minSpendSatang ?? common.DEFAULT_TIER_MIN_SPEND[tier];

  let touched = false;
  const work = async (tx: Any) => {
    for (const sys of systems) {
      // ── 1. นิยามระดับ 4 ชั้น ──
      const byKey = new Map<string, Any>();
      for (const seed of common.TIER_SEED) {
        const found = await tx.memberTierDef.findFirst({ where: { systemId: sys.id, key: seed.key } });
        if (found) {
          byKey.set(seed.key, found);
          continue;
        }
        counts.ระดับที่สร้าง += 1;
        touched = true;
        if (args.dryRun) {
          console.log(`  [dry-run] ${t.slug}: จะสร้างระดับ "${seed.name}" (${seed.key}) ในระบบ ${sys.name}`);
          byKey.set(seed.key, { id: `dry-${seed.key}`, ...seed });
          continue;
        }
        const row = await tx.memberTierDef.create({
          data: {
            tenantId: t.id,
            systemId: sys.id,
            key: seed.key,
            name: seed.name,
            color: seed.color,
            legacyTier: seed.legacyTier,
            isDefault: seed.isDefault,
            sortOrder: seed.sortOrder,
            description: seed.isDefault ? "ระดับเริ่มต้นของสมาชิกทุกคน" : `ระดับ ${seed.name}`,
          },
        });
        byKey.set(seed.key, row);
      }

      // ── 2. เกณฑ์เดิม → กฎเลื่อนระดับ (AutomationRule scope MEMBER_TIER) ──
      for (const seed of common.TIER_SEED) {
        if (seed.legacyTier === "MEMBER") continue; // ระดับเริ่มต้น ไม่ต้องมีกฎเลื่อนเข้า
        const def = byKey.get(seed.key);
        const already = await tx.automationRule.findFirst({
          where: { tenantId: t.id, scope: "MEMBER_TIER", memberSystemId: sys.id, tierDefId: def?.id ?? "-" },
        });
        if (already) {
          if (!args.dryRun && def && !def.upgradeRuleId) {
            await tx.memberTierDef.update({ where: { id: def.id }, data: { upgradeRuleId: already.id } });
            touched = true;
          }
          continue;
        }
        const threshold = minSpend(seed.legacyTier as "SILVER" | "GOLD" | "PLATINUM");
        counts.กฎเลื่อนระดับ += 1;
        touched = true;
        if (args.dryRun) {
          console.log(`  [dry-run] ${t.slug}: จะสร้างกฎ "เลื่อนเป็น ${seed.name} เมื่อยอด 12 เดือน ≥ ${threshold / 100} บาท"`);
          continue;
        }
        const rule = await tx.automationRule.create({
          data: {
            tenantId: t.id,
            name: `เลื่อนเป็น ${seed.name} อัตโนมัติ`,
            event: "", // กฎระดับถูกเรียกโดยเอนจินระดับ ไม่ได้ผูก outbox event ตัวใดตัวหนึ่ง
            enabled: true,
            // 🔴 actionType/actionConfig = placeholder ตามคอมเมนต์ใน automation.prisma (แบบเดียวกับ K2.9)
            actionType: "NOTIFY",
            actionConfig: {},
            scope: "MEMBER_TIER",
            systemId: sys.id,
            memberSystemId: sys.id,
            tierDefId: def.id,
            kind: "RULE",
            conditions: [{ field: "spent12m", op: "gte", value: threshold }],
            actions: [{ type: "SET_TIER", params: { tierDefId: def.id } }],
          },
        });
        await tx.memberTierDef.update({ where: { id: def.id }, data: { upgradeRuleId: rule.id } });
      }

      // ── 3+4. สมาชิก → tierDefId + ประวัติ INITIAL ──
      const defRow = byKey.get("member");
      const customers = (await tx.customer.findMany({
        where: { tenantId: t.id, memberSystemId: sys.id },
        select: { id: true, tier: true, tierDefId: true, tierSince: true, createdAt: true, totalSpentSatang: true },
        orderBy: { createdAt: "asc" },
      })) as Any[];
      for (const c of customers) {
        const seed = common.TIER_SEED.find((s: Any) => s.legacyTier === c.tier) ?? common.TIER_SEED[0];
        const target = byKey.get(seed.key) ?? defRow;
        if (!c.tierDefId) {
          counts.สมาชิกที่ผูกระดับ += 1;
          touched = true;
          if (!args.dryRun) {
            await tx.customer.update({
              where: { id: c.id },
              data: { tierDefId: target.id, ...(c.tierSince ? {} : { tierSince: c.createdAt }) },
            });
          }
        }
        const hasInitial = await tx.memberTierHistory.count({ where: { customerId: c.id, reason: "INITIAL" } });
        if (hasInitial === 0) {
          counts.ประวัติINITIAL += 1;
          touched = true;
          if (!args.dryRun) {
            await tx.memberTierHistory.create({
              data: {
                tenantId: t.id,
                customerId: c.id,
                fromTierDefId: null,
                toTierDefId: target.id,
                reason: "INITIAL",
                evidence: { totalSpentSatang: c.totalSpentSatang, legacyTier: c.tier },
                createdAt: c.createdAt,
              },
            });
          }
        }
      }
      if (args.dryRun && customers.length) {
        console.log(`  [dry-run] ${t.slug}: สมาชิก ${customers.length} คนในระบบ ${sys.name} — ผูกระดับ/เขียนประวัติตามระดับเดิม`);
      }
    }
  };

  if (args.dryRun) await work(prisma);
  else await prisma.$transaction(work, { timeout: 180_000, maxWait: 30_000 });
  if (touched) {
    counts.ร้านที่แก้ += 1;
    console.log(`  ✏️  ${t.name} (${t.slug})`);
  }
}

common.summary(SCRIPT, args, counts);
await prisma.$disconnect();
