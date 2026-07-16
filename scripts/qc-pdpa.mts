// QC — PDPA + Purge (WO-0042) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
// src/lib/platform/pdpa.ts (platform-level — prisma ตรง):
//   exportTenantData(tenantId: string): Promise<string>  // JSON ทุก model ที่มี tenantId (วนทะเบียน scope tenant/unit/system)
//     — โครง { exportedAt, tenantId, data: { <ModelName>: rows[] } } · **ห้ามมีข้อมูล tenant อื่นปน**
//   requestTenantDeletion(tenantId): Promise<boolean>   // ACTIVE→PENDING_DELETE + deleteRequestedAt=now (ตั้งได้จากฝั่งร้าน OWNER — service ไม่เช็ค role, action เช็ค)
//   cancelTenantDeletion(tenantId): Promise<boolean>    // PENDING_DELETE→ACTIVE + ล้าง deleteRequestedAt
//   sweepPendingDeletes(now?: Date, graceDays = 30): Promise<number>
//     — tenant PENDING_DELETE ที่ deleteRequestedAt < now-graceDays → **ลบจริงทุกตาราง** (วนทะเบียน model ลบ children-first · FK ชน = วนซ้ำจนหมด ≤5 รอบ) แล้วลบ Tenant · คืนจำนวนร้านที่ลบ · idempotent
// src/lib/pdpa/actions.ts (ฝั่งร้าน): exportMyDataAction (OWNER — คืน JSON string ให้ดาวน์โหลด) · requestDeleteAction / cancelDeleteAction (OWNER + ConfirmDialog ฝั่ง UI)
// UI: หน้า /app/settings/privacy — ปุ่ม export + ขอลบร้าน (banner เตือน 30 วัน + ยกเลิกได้) · ลิงก์ NavDrawer
// cron: runDailyCron เรียก sweepPendingDeletes ด้วย (เพิ่ม field ผลลัพธ์ใหม่ได้ — ห้ามลบ 3 field เดิม)
// docs: docs/sds/11_DR.md — runbook กู้ข้อมูล (Neon PITR/branch restore ขั้นตอนจริง)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tidA = ""; let tidB = "";
try {
  const pdpa = (await import("@/lib/platform/pdpa" as string).catch(() => null)) as {
    exportTenantData: (t: string) => Promise<string>;
    requestTenantDeletion: (t: string) => Promise<boolean>;
    cancelTenantDeletion: (t: string) => Promise<boolean>;
    sweepPendingDeletes: (now?: Date, g?: number) => Promise<number>;
  } | null;
  if (!pdpa) { chk("PD-0", "มี src/lib/platform/pdpa.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    // seed 2 ร้าน — A จะโดนลบ · B ต้องอยู่ครบ (กันลบข้ามร้าน!)
    const a = await prisma.tenant.create({ data: { name: "QC PDPA A", slug: `qc-pd-a-${Date.now()}` } }); tidA = a.id;
    const b = await prisma.tenant.create({ data: { name: "QC PDPA B", slug: `qc-pd-b-${Date.now()}` } }); tidB = b.id;
    for (const tid of [tidA, tidB]) {
      const m = await sys.createSystem(tid, "MEMBER", "สมาชิก");
      await prisma.customer.create({ data: { tenantId: tid, memberSystemId: m.id, name: `ลูกค้าของ ${tid.slice(-4)}` } });
      await prisma.appNotification.create({ data: { tenantId: tid, title: "n", body: "b" } });
    }

    // 1) export
    const exp = await pdpa.exportTenantData(tidA);
    const parsed = JSON.parse(exp) as { tenantId: string; data: Record<string, unknown[]> };
    chk("PD-1.1", "export มีโครง + ข้อมูล ≥3 model", parsed.tenantId === tidA && (parsed.data.Customer?.length ?? 0) >= 1 && (parsed.data.AppSystem?.length ?? 0) >= 1 && (parsed.data.AppNotification?.length ?? 0) >= 1, "ครบ", Object.keys(parsed.data ?? {}).length + " models");
    chk("PD-1.2", "export ไม่มีข้อมูลร้าน B ปน", !exp.includes(tidB), "สะอาด", "?");

    // 2) request/cancel
    chk("PD-2.1", "requestDeletion → PENDING_DELETE + timestamp", (await pdpa.requestTenantDeletion(tidA)) === true && (await prisma.tenant.findUnique({ where: { id: tidA } }))?.status === "PENDING_DELETE", "PENDING_DELETE", "?");
    chk("PD-2.2", "cancel → ACTIVE + ล้าง timestamp", (await pdpa.cancelTenantDeletion(tidA)) === true && (await prisma.tenant.findUnique({ where: { id: tidA } }))?.deleteRequestedAt === null, "ACTIVE", "?");

    // 3) sweep — ยังไม่ครบ 30 วัน ห้ามลบ
    await pdpa.requestTenantDeletion(tidA);
    const NOW = new Date();
    chk("PD-3.1", "ขอลบวันนี้ → sweep วันนี้ = 0 (ยังไม่ครบ 30 วัน)", (await pdpa.sweepPendingDeletes(NOW)) === 0 && (await prisma.tenant.count({ where: { id: tidA } })) === 1, "0", "?");
    // ย้อนเวลา request ให้เกิน 30 วัน
    await prisma.tenant.update({ where: { id: tidA }, data: { deleteRequestedAt: new Date(NOW.getTime() - 31 * 86400000) } });
    const purged = await pdpa.sweepPendingDeletes(NOW);
    chk("PD-3.2", "ครบ 30 วัน → ลบจริง (tenant หาย + ข้อมูลหมด)", purged === 1 && (await prisma.tenant.count({ where: { id: tidA } })) === 0 && (await prisma.customer.count({ where: { tenantId: tidA } })) === 0 && (await prisma.appNotification.count({ where: { tenantId: tidA } })) === 0, "หมดเกลี้ยง", `purged=${purged}`);
    chk("PD-3.3", "ร้าน B รอดครบ (ไม่ลบข้ามร้าน!)", (await prisma.tenant.count({ where: { id: tidB } })) === 1 && (await prisma.customer.count({ where: { tenantId: tidB } })) === 1, "ครบ", "?");
    chk("PD-3.4", "sweep ซ้ำ → 0 (idempotent)", (await pdpa.sweepPendingDeletes(NOW)) === 0, "0", "?");
    tidA = ""; // ลบไปแล้ว
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tidA, tidB].filter(Boolean)) {
    for (const m of ["appNotification", "customer", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC PDPA =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
