// QC — ระดับสมาชิกกำหนดเองได้ + โชว์ในหน้า UI (คำสั่งเจ้าของ 24 ก.ค.) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/member/service.ts:
//   getTierConfig(ctx) → [{tier, label, minSpendSatang}] ×3 (SILVER/GOLD/PLATINUM) — ไม่ตั้ง = default เดิม (3แสน/1ล้าน/3ล้าน สตางค์)
//   setTierConfig(ctx, rows) → บันทึก (validate: SILVER < GOLD < PLATINUM · label ห้ามว่าง) + recompute tier ลูกค้าทุกคนของร้าน
//   computeTierFor(totalSpentSatang, config) → tier ตาม config (pure)
//   จุดบันทึกยอดใช้จ่าย (recordSpend เดิม) ต้องใช้ config ของร้าน ไม่ใช่ค่า hardcode
try { process.loadEnvFile(".env"); } catch {}
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

const ts = Date.now();
const tids: string[] = [];
try {
  const svc = (await import("@/lib/modules/member/service")) as unknown as { [k: string]: (...a: any[]) => any };
  if (typeof svc.getTierConfig !== "function" || typeof svc.setTierConfig !== "function") {
    chk("MT-1.0", "มี getTierConfig/setTierConfig ใน member/service", false, "มี", "ยังไม่สร้าง");
  } else {
    const t = await prisma.tenant.create({ data: { name: "QC TIER", slug: `qc-mt-${ts}` } }); tids.push(t.id);
    const ctx = { tenantId: t.id };
    const def = await svc.getTierConfig(ctx);
    chk("MT-1.1", "ยังไม่ตั้ง → default เดิม (SILVER 3แสน GOLD 1ล้าน PLAT 3ล้าน สตางค์)", def.length === 3 && def.find((r: any) => r.tier === "SILVER")?.minSpendSatang === 300_000 && def.find((r: any) => r.tier === "PLATINUM")?.minSpendSatang === 3_000_000, "default ครบ", JSON.stringify(def).slice(0, 120));

    // ตั้งเกณฑ์เอง: SILVER 100บ / GOLD 500บ / PLATINUM 1000บ + ชื่อเอง
    await svc.setTierConfig(ctx, [
      { tier: "SILVER", label: "ลูกค้าประจำ", minSpendSatang: 10_000 },
      { tier: "GOLD", label: "คนสนิท", minSpendSatang: 50_000 },
      { tier: "PLATINUM", label: "VIP", minSpendSatang: 100_000 },
    ]);
    const cfg = await svc.getTierConfig(ctx);
    chk("MT-1.2", "ตั้งเกณฑ์+ชื่อเองแล้วอ่านกลับตรง", cfg.find((r: any) => r.tier === "GOLD")?.label === "คนสนิท" && cfg.find((r: any) => r.tier === "GOLD")?.minSpendSatang === 50_000, "ตรง", JSON.stringify(cfg).slice(0, 120));

    // ลำดับผิด (GOLD < SILVER) → ต้องปฏิเสธ
    let rejected = false;
    try { await svc.setTierConfig(ctx, [
      { tier: "SILVER", label: "a", minSpendSatang: 50_000 },
      { tier: "GOLD", label: "b", minSpendSatang: 10_000 },
      { tier: "PLATINUM", label: "c", minSpendSatang: 100_000 },
    ]); } catch { rejected = true; }
    chk("MT-1.3", "เกณฑ์เรียงผิด (GOLD < SILVER) → ปฏิเสธ", rejected, "throw", "ผ่านเฉย");

    // computeTierFor ตาม config
    if (typeof svc.computeTierFor === "function") {
      const cur = await svc.getTierConfig(ctx);
      chk("MT-1.4", "computeTierFor: 600บ → GOLD ตาม config (ไม่ใช่ hardcode)", svc.computeTierFor(60_000, cur) === "GOLD", "GOLD", String(svc.computeTierFor(60_000, cur)));
    } else chk("MT-1.4", "มี computeTierFor(pure)", false, "มี", "ไม่พบ");

    // recompute ลูกค้าเดิมเมื่อเปลี่ยนเกณฑ์
    const ms = await prisma.appSystem.create({ data: { tenantId: t.id, type: "MEMBER", name: "สมาชิก QC" } });
    const cust = await prisma.customer.create({ data: { tenantId: t.id, memberSystemId: ms.id, memberCode: `QC${ts % 100000}`, name: "คุณทดสอบ", totalSpentSatang: 60_000, tier: "MEMBER" } });
    await svc.setTierConfig(ctx, [
      { tier: "SILVER", label: "ลูกค้าประจำ", minSpendSatang: 10_000 },
      { tier: "GOLD", label: "คนสนิท", minSpendSatang: 55_000 },
      { tier: "PLATINUM", label: "VIP", minSpendSatang: 200_000 },
    ]);
    const after = await prisma.customer.findUnique({ where: { id: cust.id } });
    chk("MT-1.5", "เปลี่ยนเกณฑ์ → recompute tier ลูกค้าเดิมทันที (60,000 สต. → GOLD)", after?.tier === "GOLD", "GOLD", String(after?.tier));
  }

  // ── UI static: หน้า/ส่วนตั้งค่าระดับ + โชว์ tier ในหน้าสมาชิก ──
  let uiHasTierSetting = false;
  let uiShowsTier = false;
  try {
    const files = execSync(`grep -rl "ระดับสมาชิก" src/app src/lib/modules/member --include=*.tsx --include=*.ts || true`).toString().trim().split("\n").filter(Boolean);
    uiHasTierSetting = files.length > 0;
    const badge = execSync(`grep -rl "tierLabel\\|tier" src/lib/modules/member --include=*.tsx || true`).toString().trim();
    uiShowsTier = badge.length > 0;
  } catch { /* grep ไม่เจอ */ }
  chk("MT-2.1", "มี UI ตั้งค่า 'ระดับสมาชิก' (ชื่อ+เกณฑ์ ต่อร้าน)", uiHasTierSetting, "มี", "ไม่พบ");
  chk("MT-2.2", "หน้าสมาชิกโชว์ระดับ (badge tier ใน list/รายละเอียด)", uiShowsTier, "มี", "ไม่พบ");
} finally {
  for (const tid of tids) {
    for (const m of ["customer", "memberTierConfig", "appSystem", "membership"] as const) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
}
const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-member-tier: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
